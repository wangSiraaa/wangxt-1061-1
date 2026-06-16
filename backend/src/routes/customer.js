const express = require('express');
const db = require('../db/index');
const { authMiddleware } = require('../utils/auth');
const { success, error, isValidPlate, generateNo, dayjs } = require('../utils/response');

const router = express.Router();
router.use(authMiddleware(['customer', 'service', 'admin']));

router.get('/my-plates', (req, res) => {
  const { id: customerId, role, phone } = req.user;
  let rows;
  if (role === 'customer') {
    rows = db.prepare(`
      SELECT * FROM vehicle_plates
      WHERE customer_id = ? OR customer_phone = ?
      ORDER BY is_bound DESC, bound_time DESC
    `).all(customerId, phone);
  } else {
    rows = db.prepare(`SELECT * FROM vehicle_plates ORDER BY updated_at DESC LIMIT 100`).all();
  }
  res.json(success(rows));
});

router.post('/bind-plate', (req, res) => {
  const { plate_no } = req.body;
  const { id: customerId, phone: userPhone, role } = req.user;

  if (!plate_no) {
    return res.json(error('车牌号不能为空'));
  }
  const cleanPlate = plate_no.toUpperCase().replace(/\s/g, '');
  if (!isValidPlate(cleanPlate)) {
    return res.json(error('车牌号格式不正确'));
  }

  const tx = db.transaction(() => {
    let plate = db.prepare('SELECT * FROM vehicle_plates WHERE plate_no = ?').get(cleanPlate);

    if (plate && plate.is_bound === 1) {
      if (role !== 'service' && role !== 'admin') {
        if (plate.customer_id !== customerId && plate.customer_phone !== userPhone) {
          throw new Error('该车牌已被其他用户绑定，请联系客服处理');
        }
      }
    }

    const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
    if (plate) {
      db.prepare(`
        UPDATE vehicle_plates
        SET customer_id = ?, customer_phone = ?, is_bound = 1, bound_time = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(customerId, userPhone, now, plate.id);
    } else {
      const info = db.prepare(`
        INSERT INTO vehicle_plates (plate_no, customer_id, customer_phone, is_bound, bound_time)
        VALUES (?, ?, ?, 1, ?)
      `).run(cleanPlate, customerId, userPhone, now);
      plate = { id: info.lastInsertRowid, plate_no: cleanPlate };
    }

    db.prepare(`
      INSERT INTO audit_logs (user_id, user_role, action, module, target_id, target_type)
      VALUES (?, ?, 'bind', 'plate', ?, 'plate')
    `).run(customerId, role, plate.id);

    return { plate_no: cleanPlate, plate_id: plate.id };
  });

  try {
    const result = tx();
    res.json(success(result, '车牌绑定成功'));
  } catch (err) {
    res.json(error(err.message || '绑定失败'));
  }
});

router.post('/rebind-check', (req, res) => {
  const { old_plate, new_plate } = req.body;
  const { id: userId, role } = req.user;

  const allowedRoles = ['service', 'admin'];
  if (!allowedRoles.includes(role)) {
    return res.status(403).json(error('仅客服或管理员可改绑车牌', 403));
  }

  if (!old_plate || !new_plate) {
    return res.json(error('参数不完整'));
  }

  const cleanOld = old_plate.toUpperCase().replace(/\s/g, '');
  const cleanNew = new_plate.toUpperCase().replace(/\s/g, '');

  const check = {
    old_plate: cleanOld,
    new_plate: cleanNew,
    old_plate_in_park: false,
    old_parking_record: null,
    bound_coupons: [],
    bound_coupon_count: 0,
    can_rebind: false,
    must_void_coupons: false,
    must_approve: false,
    warnings: [],
    blockers: []
  };

  const oldParking = db.prepare(`
    SELECT * FROM parking_records
    WHERE plate_no = ? AND status = 'parking'
    ORDER BY in_time DESC LIMIT 1
  `).get(cleanOld);

  if (oldParking) {
    check.old_plate_in_park = true;
    check.old_parking_record = {
      id: oldParking.id,
      in_time: oldParking.in_time,
      in_booth: oldParking.in_booth
    };
    check.warnings.push('旧车牌当前在场内，改绑后旧车牌出场将无券可用');
  }

  const boundCoupons = db.prepare(`
    SELECT c.*, s.shop_name
    FROM coupons c
    LEFT JOIN shops s ON c.shop_id = s.id
    WHERE c.plate_no = ? AND c.status IN ('issued', 'bound')
      AND datetime(c.expire_at) >= datetime('now')
    ORDER BY c.issued_at DESC
  `).all(cleanOld);

  check.bound_coupons = boundCoupons;
  check.bound_coupon_count = boundCoupons.length;

  if (boundCoupons.length > 0) {
    check.warnings.push(`旧车牌有${boundCoupons.length}张有效券，改绑需处理这些券`);
    if (oldParking) {
      check.must_void_coupons = true;
      check.blockers.push('旧车牌在场且有有效券，必须先处理券（作废或转绑）才能改绑');
    }
  }

  const newParking = db.prepare(`
    SELECT * FROM parking_records
    WHERE plate_no = ? AND status = 'parking'
    ORDER BY in_time DESC LIMIT 1
  `).get(cleanNew);

  if (!newParking) {
    check.warnings.push('新车牌当前未入场，券绑定后需入场才能核销');
  }

  if (check.blockers.length === 0) {
    check.can_rebind = true;
    if (check.must_void_coupons || check.old_plate_in_park) {
      check.must_approve = true;
    }
  }

  res.json(success(check));
});

router.post('/rebind-plate', (req, res) => {
  const { coupon_id, old_plate, new_plate, reason, void_old_coupons, force_rebind } = req.body;
  const { id: userId, role } = req.user;

  const allowedRoles = ['service', 'admin'];
  if (!allowedRoles.includes(role)) {
    return res.status(403).json(error('仅客服或管理员可改绑车牌', 403));
  }

  if (!coupon_id || !old_plate || !new_plate) {
    return res.json(error('参数不完整'));
  }

  const cleanNew = new_plate.toUpperCase().replace(/\s/g, '');
  const cleanOld = old_plate.toUpperCase().replace(/\s/g, '');
  if (!isValidPlate(cleanNew)) {
    return res.json(error('新车牌格式不正确'));
  }

  const tx = db.transaction(() => {
    const coupon = db.prepare('SELECT * FROM coupons WHERE id = ?').get(coupon_id);
    if (!coupon) {
      throw new Error('优惠券不存在');
    }
    if (coupon.status === 'verified') {
      throw new Error('优惠券已核销，不能改绑');
    }
    if (coupon.status === 'revoked') {
      throw new Error('优惠券已撤销，不能改绑');
    }

    const oldParking = db.prepare(`
      SELECT * FROM parking_records
      WHERE plate_no = ? AND status = 'parking'
      ORDER BY in_time DESC LIMIT 1
    `).get(cleanOld);

    const otherBoundCoupons = db.prepare(`
      SELECT * FROM coupons
      WHERE plate_no = ? AND status IN ('issued','bound') AND id != ?
    `).all(cleanOld, coupon_id);

    if (oldParking && otherBoundCoupons.length > 0 && !void_old_coupons) {
      throw new Error(`旧车牌在场且有${otherBoundCoupons.length}张其他有效券，必须确认是否作废旧券`);
    }

    if (void_old_coupons && otherBoundCoupons.length > 0) {
      const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
      const approvalNo = generateNo('AP');
      const voidedCoupons = [];

      otherBoundCoupons.forEach(oc => {
        db.prepare(`
          UPDATE coupons SET status = 'revoked', remark = '改绑车牌时作废', updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(oc.id);

        db.prepare(`
          INSERT INTO coupon_revocations (coupon_id, coupon_no, revoked_by, revoked_by_role, revoke_reason)
          VALUES (?, ?, ?, ?, ?)
        `).run(oc.id, oc.coupon_no, userId, role, `车牌改绑作废: ${cleanOld}→${cleanNew}`);

        const revokeAmount = oc.coupon_type === 'discount' ? Number(oc.discount_value) : Number(oc.order_amount);
        db.prepare(`
          UPDATE shops SET coupon_used = coupon_used - ? WHERE id = ?
        `).run(revokeAmount, oc.shop_id);

        const issueMonth = dayjs(oc.issued_at).format('YYYY-MM');
        const monthlyQuota = db.prepare('SELECT * FROM monthly_quotas WHERE shop_id = ? AND month = ?').get(oc.shop_id, issueMonth);
        if (monthlyQuota) {
          db.prepare(`
            UPDATE monthly_quotas SET used_amount = used_amount - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
          `).run(revokeAmount, monthlyQuota.id);
        }

        voidedCoupons.push(oc.coupon_no);
      });

      db.prepare(`
        INSERT INTO exception_approvals (approval_no, exception_type, related_id, plate_no,
          applicant_id, applicant_role, reason, approve_status, approver_id, approver_role, approved_at)
        VALUES (?, 'plate_rebind_void', ?, ?, ?, ?, ?, 'approved', ?, ?, ?)
      `).run(approvalNo, coupon_id, cleanOld, userId, role,
        `改绑车牌${cleanOld}→${cleanNew}，作废${voidedCoupons.length}张旧券`,
        userId, role, now);
    }

    if (oldParking && !force_rebind && !void_old_coupons) {
      throw new Error('旧车牌在场内，改绑将导致旧车牌出场无券可用。如确认改绑请设置force_rebind=true');
    }

    let newPlate = db.prepare('SELECT * FROM vehicle_plates WHERE plate_no = ?').get(cleanNew);
    const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
    if (!newPlate) {
      const info = db.prepare(`
        INSERT INTO vehicle_plates (plate_no, is_bound, bound_time)
        VALUES (?, 1, ?)
      `).run(cleanNew, now);
      newPlate = { id: info.lastInsertRowid, plate_no: cleanNew };
    } else {
      db.prepare(`UPDATE vehicle_plates SET is_bound = 1 WHERE id = ?`).run(newPlate.id);
    }

    db.prepare(`
      UPDATE coupons
      SET plate_id = ?, plate_no = ?, bound_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newPlate.id, cleanNew, now, coupon_id);

    db.prepare(`
      INSERT INTO plate_rebinds (coupon_id, old_plate, new_plate, rebind_by, rebind_reason)
      VALUES (?, ?, ?, ?, ?)
    `).run(coupon_id, cleanOld, cleanNew, userId, reason || (void_old_coupons ? `改绑并作废旧券` : ''));

    db.prepare(`
      INSERT INTO audit_logs (user_id, user_role, action, module, target_id, target_type, after_data)
      VALUES (?, ?, 'rebind', 'coupon', ?, 'coupon', ?)
    `).run(userId, role, coupon_id, JSON.stringify({ old_plate: cleanOld, new_plate: cleanNew, voided_coupons: void_old_coupons ? otherBoundCoupons.length : 0 }));

    return {
      coupon_no: coupon.coupon_no,
      new_plate: cleanNew,
      voided_coupons: void_old_coupons ? otherBoundCoupons.map(c => c.coupon_no) : [],
      warning: oldParking ? '旧车牌在场内，已改绑成功但旧车牌出场将无券可用' : null
    };
  });

  try {
    const result = tx();
    res.json(success(result, '车牌改绑成功'));
  } catch (err) {
    res.json(error(err.message || '改绑失败'));
  }
});

router.post('/bind-coupon', (req, res) => {
  const { coupon_no, plate_no } = req.body;
  const { id: customerId, phone: userPhone, role } = req.user;

  if (!coupon_no || !plate_no) {
    return res.json(error('优惠券号和车牌号不能为空'));
  }

  const cleanPlate = plate_no.toUpperCase().replace(/\s/g, '');

  const tx = db.transaction(() => {
    const coupon = db.prepare(`
      SELECT c.*, o.order_no, o.amount as order_amt, o.customer_phone as order_phone,
        s.shop_name, s.min_amount
      FROM coupons c
      LEFT JOIN orders o ON c.order_id = o.id
      LEFT JOIN shops s ON c.shop_id = s.id
      WHERE c.coupon_no = ?
    `).get(coupon_no);

    if (!coupon) {
      throw new Error('优惠券不存在');
    }

    if (coupon.status === 'revoked') {
      throw new Error('优惠券已撤销');
    }
    if (coupon.status === 'verified') {
      throw new Error('优惠券已使用');
    }

    const now = dayjs();
    if (dayjs(coupon.expire_at).isBefore(now)) {
      db.prepare('UPDATE coupons SET status = ? WHERE id = ?').run('expired', coupon.id);
      throw new Error('优惠券已过期');
    }

    if (Number(coupon.order_amt) < Number(coupon.min_amount)) {
      throw new Error(`关联订单金额不足发券门槛`);
    }

    if (role === 'customer') {
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(coupon.order_id);
      if (order.customer_phone && order.customer_phone !== userPhone) {
        throw new Error('该优惠券关联订单的手机号与您不一致');
      }
    }

    let plate = db.prepare('SELECT * FROM vehicle_plates WHERE plate_no = ?').get(cleanPlate);
    if (!plate) {
      const info = db.prepare(`
        INSERT INTO vehicle_plates (plate_no, customer_id, customer_phone, is_bound, bound_time)
        VALUES (?, ?, ?, 1, ?)
      `).run(cleanPlate, role === 'customer' ? customerId : null, userPhone, now.format('YYYY-MM-DD HH:mm:ss'));
      plate = { id: info.lastInsertRowid, plate_no: cleanPlate };
    }

    const inPark = db.prepare(`
      SELECT pr.* FROM parking_records pr
      WHERE pr.plate_no = ? AND pr.status = 'parking'
      ORDER BY pr.in_time DESC LIMIT 1
    `).get(cleanPlate);

    if (!inPark) {
      throw new Error('该车辆当前未入场，无法绑定优惠券');
    }

    const boundAt = now.format('YYYY-MM-DD HH:mm:ss');
    db.prepare(`
      UPDATE coupons
      SET plate_id = ?, plate_no = ?, bound_at = ?, status = 'bound', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(plate.id, cleanPlate, boundAt, coupon.id);

    db.prepare(`
      UPDATE vehicle_plates
      SET customer_id = COALESCE(?, customer_id),
          customer_phone = COALESCE(?, customer_phone),
          is_bound = 1,
          bound_time = COALESCE(bound_time, ?),
          last_in_time = ?,
          in_park = 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      role === 'customer' ? customerId : null,
      userPhone,
      boundAt,
      inPark.in_time,
      plate.id
    );

    db.prepare(`
      INSERT INTO audit_logs (user_id, user_role, action, module, target_id, target_type)
      VALUES (?, ?, 'bind_coupon', 'coupon', ?, 'coupon')
    `).run(customerId, role, coupon.id);

    return {
      coupon_no: coupon.coupon_no,
      plate_no: cleanPlate,
      discount_hours: coupon.discount_hours,
      shop_name: coupon.shop_name,
      in_time: inPark.in_time,
      status: 'bound'
    };
  });

  try {
    const result = tx();
    res.json(success(result, '优惠券绑定成功，可正常出场抵扣'));
  } catch (err) {
    res.json(error(err.message || '绑定失败'));
  }
});

router.get('/my-coupons', (req, res) => {
  const { id: customerId, phone: userPhone, role } = req.user;
  const { status } = req.query;

  let sql = `
    SELECT c.*, s.shop_name, o.order_no, o.amount,
      CASE c.status
        WHEN 'issued' THEN '待绑定'
        WHEN 'bound' THEN '待出场'
        WHEN 'verified' THEN '已使用'
        WHEN 'revoked' THEN '已撤销'
        WHEN 'expired' THEN '已过期'
      END as status_text
    FROM coupons c
    LEFT JOIN shops s ON c.shop_id = s.id
    LEFT JOIN orders o ON c.order_id = o.id
    WHERE (o.customer_phone = ? OR c.plate_no IN (SELECT plate_no FROM vehicle_plates WHERE customer_phone = ? OR customer_id = ?))
  `;
  const params = [userPhone, userPhone, customerId];

  if (status) {
    sql += ' AND c.status = ?';
    params.push(status);
  }

  sql += ' ORDER BY c.issued_at DESC LIMIT 100';
  const rows = db.prepare(sql).all(...params);

  rows.forEach(c => {
    if (c.status === 'issued' && dayjs(c.expire_at).isBefore(dayjs()) && c.status !== 'expired') {
      db.prepare('UPDATE coupons SET status = ? WHERE id = ?').run('expired', c.id);
      c.status = 'expired';
      c.status_text = '已过期';
    }
  });

  res.json(success(rows));
});

router.get('/parking-status', (req, res) => {
  const { phone: userPhone, role } = req.user;
  const plates = db.prepare(`
    SELECT plate_no FROM vehicle_plates WHERE customer_phone = ? OR is_bound = 0
  `).all(userPhone);

  const plateNos = plates.map(p => `'${p.plate_no}'`).join(',') || "''";

  const parking = db.prepare(`
    SELECT pr.*, vp.customer_phone,
      CASE
        WHEN EXISTS (SELECT 1 FROM coupons c WHERE c.plate_no = pr.plate_no AND c.status = 'bound')
        THEN (SELECT c.discount_hours FROM coupons c WHERE c.plate_no = pr.plate_no AND c.status = 'bound' LIMIT 1)
        ELSE 0
      END as discount_hours
    FROM parking_records pr
    LEFT JOIN vehicle_plates vp ON pr.plate_no = vp.plate_no
    WHERE pr.plate_no IN (${plateNos}) AND pr.status = 'parking'
    ORDER BY pr.in_time DESC
  `).all();

  parking.forEach(p => {
    const { hours, fee } = require('../utils/response').calculateParkingFee(p.in_time);
    p.parked_hours = hours;
    p.total_fee = fee;
    const discFee = Math.min(fee, (p.discount_hours || 0) * 10);
    p.discount_fee = discFee;
    p.payable_fee = Number((fee - discFee).toFixed(2));
  });

  res.json(success(parking));
});

module.exports = router;

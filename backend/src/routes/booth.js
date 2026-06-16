const express = require('express');
const db = require('../db/index');
const { authMiddleware } = require('../utils/auth');
const { success, error, generateNo, isValidPlate, calculateParkingFee, dayjs } = require('../utils/response');

const router = express.Router();
router.use(authMiddleware(['booth', 'service', 'admin']));

router.post('/verify-exit', (req, res) => {
  const { plate_no, booth_id } = req.body;
  const { id: userId, role, name } = req.user;

  if (!plate_no) {
    return res.json(error('车牌号不能为空'));
  }

  const cleanPlate = plate_no.toUpperCase().replace(/\s/g, '');
  const now = dayjs();

  const tx = db.transaction(() => {
    const parking = db.prepare(`
      SELECT * FROM parking_records
      WHERE plate_no = ? AND status = 'parking'
      ORDER BY in_time DESC LIMIT 1
    `).get(cleanPlate);

    if (!parking) {
      throw new Error('该车辆未入场，无法出场');
    }

    const { hours, fee } = calculateParkingFee(parking.in_time);
    const duration = now.diff(dayjs(parking.in_time), 'minute');

    const boundCoupons = db.prepare(`
      SELECT * FROM coupons
      WHERE plate_no = ? AND status = 'bound'
        AND datetime(expire_at) >= datetime('now')
      ORDER BY bound_at DESC
    `).all(cleanPlate);

    let discountHours = 0;
    let verifiedCouponId = null;
    let verifiedCouponNo = null;

    if (boundCoupons.length > 0) {
      const coupon = boundCoupons[0];
      discountHours = coupon.discount_hours;
      verifiedCouponId = coupon.id;
      verifiedCouponNo = coupon.coupon_no;

      db.prepare(`
        UPDATE coupons SET status = 'verified', verified_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(now.format('YYYY-MM-DD HH:mm:ss'), coupon.id);
    }

    const discountFee = Math.min(fee, discountHours * 10);
    const actualFee = Number((fee - discountFee).toFixed(2));

    db.prepare(`
      INSERT INTO booth_verifications (plate_no, booth_id, verify_time, coupon_id, coupon_no,
        verify_type, discount_hours, parking_duration, parking_fee, actual_fee, status, operator_id, remark)
      VALUES (?, ?, ?, ?, ?, 'coupon', ?, ?, ?, ?, 'success', ?, ?)
    `).run(
      cleanPlate, booth_id || 'BOOTH', now.format('YYYY-MM-DD HH:mm:ss'),
      verifiedCouponId, verifiedCouponNo,
      discountHours, duration, fee, actualFee, userId,
      verifiedCouponNo ? `自动核销优惠券${verifiedCouponNo}` : '无可用优惠券'
    );

    if (actualFee > 0 && boundCoupons.length === 0) {
      db.prepare(`UPDATE parking_records SET status = 'exception' WHERE id = ?`).run(parking.id);
      return {
        plate_no: cleanPlate,
        in_time: parking.in_time,
        parked_minutes: duration,
        total_fee: fee,
        discount_fee: discountFee,
        payable: actualFee,
        can_pass: false,
        coupon_used: null,
        need_manual_release: true,
        message: `需缴费${actualFee}元或联系客服放行`
      };
    }

    const outTime = now.format('YYYY-MM-DD HH:mm:ss');
    db.prepare(`
      UPDATE parking_records
      SET out_time = ?, out_booth = ?, duration = ?, total_fee = ?,
          discount_fee = ?, paid_fee = ?, status = 'exited', coupon_id = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      outTime, booth_id || 'BOOTH', duration, fee,
      discountFee, actualFee, verifiedCouponId, parking.id
    );

    db.prepare(`
      UPDATE vehicle_plates SET in_park = 0, last_out_time = ? WHERE plate_no = ?
    `).run(outTime, cleanPlate);

    db.prepare(`
      INSERT INTO audit_logs (user_id, user_role, action, module, target_id, target_type)
      VALUES (?, ?, 'verify_exit', 'booth', ?, 'parking')
    `).run(userId, role, parking.id);

    return {
      plate_no: cleanPlate,
      in_time: parking.in_time,
      out_time: outTime,
      parked_minutes: duration,
      total_fee: fee,
      discount_fee: discountFee,
      payable: actualFee,
      can_pass: true,
      coupon_used: verifiedCouponNo,
      discount_hours: discountHours,
      message: verifiedCouponNo ? `成功核销优惠券${verifiedCouponNo}，抵扣${discountHours}小时，可通行` : '余额不足但已通过异常放行'
    };
  });

  try {
    const result = tx();
    res.json(success(result));
  } catch (err) {
    res.json(error(err.message || '核验失败'));
  }
});

router.post('/booth-release', (req, res) => {
  const { plate_no, booth_id, release_reason, waive_fee } = req.body;
  const { id: userId, role, name: userName } = req.user;

  if (!plate_no || !release_reason) {
    return res.json(error('车牌号和原因不能为空'));
  }

  const cleanPlate = plate_no.toUpperCase().replace(/\s/g, '');
  const releaseNo = generateNo('RL');
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

  const tx = db.transaction(() => {
    const parking = db.prepare(`
      SELECT * FROM parking_records
      WHERE plate_no = ? AND status IN ('parking','exception')
      ORDER BY in_time DESC LIMIT 1
    `).get(cleanPlate);

    if (!parking) {
      throw new Error('该车辆未入场');
    }

    const { fee } = calculateParkingFee(parking.in_time);
    const waived = waive_fee != null ? Number(waive_fee) : fee;
    const duration = dayjs().diff(dayjs(parking.in_time), 'minute');
    const needApprove = waived > 50;

    const releaseInfo = db.prepare(`
      INSERT INTO manual_releases (release_no, plate_no, booth_id, release_type, release_reason,
        parking_duration, waived_fee, operator_id, operator_role, operator_name,
        released_at, approve_status)
      VALUES (?, ?, ?, 'booth', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      releaseNo, cleanPlate, booth_id || 'BOOTH', release_reason,
      duration, waived, userId, role, userName,
      now, needApprove ? 'pending' : 'approved'
    );

    let response = {
      release_no: releaseNo,
      plate_no: cleanPlate,
      waived_fee: waived,
      need_approval: needApprove,
      total_fee: fee
    };

    if (!needApprove) {
      db.prepare(`
        UPDATE parking_records
        SET out_time = ?, out_booth = ?, duration = ?, total_fee = ?,
            discount_fee = ?, paid_fee = ?, status = 'exited', release_id = ?,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `).run(
        now, booth_id || 'BOOTH', duration, fee, waived, Math.max(0, fee - waived),
        releaseInfo.lastInsertRowid, parking.id
      );

      db.prepare(`
        UPDATE vehicle_plates SET in_park = 0, last_out_time = ? WHERE plate_no = ?
      `).run(now, cleanPlate);

      db.prepare(`
        INSERT INTO booth_verifications (plate_no, booth_id, verify_time, verify_type,
          discount_hours, parking_duration, parking_fee, actual_fee, status, operator_id, remark)
        VALUES (?, ?, ?, 'manual', 0, ?, ?, 0, 'success', ?, ?)
      `).run(cleanPlate, booth_id || 'BOOTH', now, duration, fee, userId, `岗亭放行:${release_reason}`);

      response.can_pass = true;
      response.message = '岗亭放行，可通行';
    } else {
      response.can_pass = false;
      response.message = '放行金额较大，需等待客服审批';
    }

    db.prepare(`
      INSERT INTO audit_logs (user_id, user_role, action, module, target_id, target_type)
      VALUES (?, ?, 'booth_release', 'booth', ?, 'release')
    `).run(userId, role, releaseInfo.lastInsertRowid);

    return response;
  });

  try {
    const result = tx();
    res.json(success(result));
  } catch (err) {
    res.json(error(err.message || '放行失败'));
  }
});

router.post('/register-in', (req, res) => {
  const { plate_no, booth_id } = req.body;
  const { id: userId } = req.user;

  if (!plate_no) {
    return res.json(error('车牌号不能为空'));
  }

  const cleanPlate = plate_no.toUpperCase().replace(/\s/g, '');
  if (!isValidPlate(cleanPlate)) {
    return res.json(error('车牌号格式不正确'));
  }

  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

  const tx = db.transaction(() => {
    let plate = db.prepare('SELECT * FROM vehicle_plates WHERE plate_no = ?').get(cleanPlate);
    if (!plate) {
      const info = db.prepare(`
        INSERT INTO vehicle_plates (plate_no, in_park, last_in_time) VALUES (?, 1, ?)
      `).run(cleanPlate, now);
      plate = { id: info.lastInsertRowid };
    } else {
      db.prepare(`
        UPDATE vehicle_plates SET in_park = 1, last_in_time = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(now, plate.id);
    }

    const info = db.prepare(`
      INSERT INTO parking_records (plate_no, in_time, in_booth, status)
      VALUES (?, ?, ?, 'parking')
    `).run(cleanPlate, now, booth_id || 'BOOTH');

    return { plate_no: cleanPlate, record_id: info.lastInsertRowid, in_time: now };
  });

  try {
    res.json(success(tx(), '登记入场成功'));
  } catch (err) {
    res.json(error(err.message));
  }
});

router.post('/offline-sync', (req, res) => {
  const { records, booth_id } = req.body;
  const { id: userId, role } = req.user;

  if (!Array.isArray(records) || records.length === 0) {
    return res.json(error('离线记录不能为空'));
  }

  const tx = db.transaction(() => {
    let successCount = 0;
    let failed = [];
    let reconcileResults = [];

    records.forEach((rec, idx) => {
      try {
        if (!rec.plate_no || !rec.action_type || !rec.action_time) {
          throw new Error('数据不完整');
        }
        const cleanPlate = rec.plate_no.toUpperCase().replace(/\s/g, '');
        const recordNo = generateNo('OF');

        const offlineInfo = db.prepare(`
          INSERT INTO offline_records (record_no, plate_no, booth_id, action_type,
            action_time, operator_id, synced, remark)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?)
        `).run(recordNo, cleanPlate, rec.booth_id || booth_id || 'BOOTH',
               rec.action_type, rec.action_time, userId,
               rec.remark || `离线记录#${idx + 1}`);

        const offlineRecordId = offlineInfo.lastInsertRowid;

        const actionTime = dayjs(rec.action_time).isValid()
          ? rec.action_time
          : dayjs().format('YYYY-MM-DD HH:mm:ss');

        let matchedParkingId = null;
        let matchedCouponId = null;
        let matchedOrderId = null;
        let reconcileStatus = 'pending';

        if (rec.action_type === 'in') {
          let plate = db.prepare('SELECT * FROM vehicle_plates WHERE plate_no = ?').get(cleanPlate);
          if (!plate) {
            const info = db.prepare(`
              INSERT INTO vehicle_plates (plate_no, in_park, last_in_time) VALUES (?, 1, ?)
            `).run(cleanPlate, actionTime);
            plate = { id: info.lastInsertRowid };
          } else {
            db.prepare(`UPDATE vehicle_plates SET in_park = 1, last_in_time = ? WHERE id = ?`)
              .run(actionTime, plate.id);
          }
          const prInfo = db.prepare(`
            INSERT INTO parking_records (plate_no, in_time, in_booth, status, exit_type, offline_record_id)
            VALUES (?, ?, ?, 'parking', 'normal', ?)
          `).run(cleanPlate, actionTime, rec.booth_id || booth_id || 'BOOTH', offlineRecordId);
          matchedParkingId = prInfo.lastInsertRowid;
          reconcileStatus = 'matched';

        } else if (rec.action_type === 'out') {
          const parking = db.prepare(`
            SELECT * FROM parking_records
            WHERE plate_no = ? AND status = 'parking'
            ORDER BY in_time DESC LIMIT 1
          `).get(cleanPlate);

          if (parking) {
            matchedParkingId = parking.id;
            const duration = dayjs(actionTime).diff(dayjs(parking.in_time), 'minute');
            const { fee } = calculateParkingFee(parking.in_time);

            const boundCoupon = db.prepare(`
              SELECT * FROM coupons
              WHERE plate_no = ? AND status = 'bound'
                AND datetime(expire_at) >= datetime(?)
              ORDER BY bound_at DESC LIMIT 1
            `).get(cleanPlate, actionTime);

            let discountHours = 0;
            let discountFee = 0;
            let actualFee = fee;

            if (boundCoupon) {
              matchedCouponId = boundCoupon.id;
              matchedOrderId = boundCoupon.order_id;
              discountHours = boundCoupon.discount_hours;
              discountFee = Math.min(fee, discountHours * 10);
              actualFee = Number((fee - discountFee).toFixed(2));

              db.prepare(`
                UPDATE coupons SET status = 'verified', verified_at = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `).run(actionTime, boundCoupon.id);

              reconcileStatus = 'matched';
            } else {
              reconcileStatus = 'unmatched';

              const relatedOrder = db.prepare(`
                SELECT o.* FROM orders o
                LEFT JOIN coupons c ON c.order_id = o.id
                WHERE c.plate_no = ? AND c.status IN ('issued','bound') AND c.id IS NOT NULL
                ORDER BY o.pay_time DESC LIMIT 1
              `).get(cleanPlate);
              if (relatedOrder) {
                matchedOrderId = relatedOrder.id;
              }
            }

            db.prepare(`
              UPDATE parking_records
              SET out_time = ?, out_booth = ?, duration = ?, total_fee = ?,
                  discount_fee = ?, paid_fee = ?, status = 'exited',
                  exit_type = 'offline_retro', offline_record_id = ?,
                  retro_verified = ?, retro_coupon_id = ?,
                  coupon_id = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(
              actionTime, rec.booth_id || booth_id || 'BOOTH', duration, fee,
              discountFee, actualFee, offlineRecordId,
              boundCoupon ? 1 : 0, boundCoupon ? boundCoupon.id : null,
              matchedCouponId, parking.id
            );

            db.prepare(`UPDATE vehicle_plates SET in_park = 0, last_out_time = ? WHERE plate_no = ?`)
              .run(actionTime, cleanPlate);

            if (boundCoupon) {
              db.prepare(`
                INSERT INTO booth_verifications (plate_no, booth_id, verify_time, coupon_id, coupon_no,
                  verify_type, discount_hours, parking_duration, parking_fee, actual_fee, status, operator_id, remark)
                VALUES (?, ?, ?, ?, ?, 'offline', ?, ?, ?, ?, 'success', ?, ?)
              `).run(
                cleanPlate, rec.booth_id || booth_id || 'BOOTH', actionTime,
                boundCoupon.id, boundCoupon.coupon_no,
                discountHours, duration, fee, actualFee, userId,
                `离线补录后补核销优惠券${boundCoupon.coupon_no}`
              );
            } else {
              db.prepare(`
                INSERT INTO booth_verifications (plate_no, booth_id, verify_time, verify_type,
                  discount_hours, parking_duration, parking_fee, actual_fee, status, operator_id, remark)
                VALUES (?, ?, ?, 'offline', 0, ?, ?, ?, 'success', ?, ?)
              `).run(
                cleanPlate, rec.booth_id || booth_id || 'BOOTH', actionTime,
                duration, fee, actualFee, userId,
                `离线补录出场(无券抵扣，需缴费${actualFee}元)`
              );
            }
          } else {
            reconcileStatus = 'unmatched';
          }
        }

        const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
        db.prepare(`
          UPDATE offline_records
          SET reconcile_status = ?, matched_parking_id = ?, matched_coupon_id = ?,
              matched_order_id = ?, reconcile_remark = ?, reconcile_at = ?
          WHERE id = ?
        `).run(reconcileStatus, matchedParkingId, matchedCouponId, matchedOrderId,
               reconcileStatus === 'matched' ? '自动补对成功' : (reconcileStatus === 'unmatched' ? '未找到匹配记录' : ''),
               now, offlineRecordId);

        reconcileResults.push({
          record_no: recordNo,
          plate_no: cleanPlate,
          action_type: rec.action_type,
          reconcile_status: reconcileStatus,
          matched_parking_id: matchedParkingId,
          matched_coupon_id: matchedCouponId,
          matched_order_id: matchedOrderId
        });

        successCount++;
      } catch (e) {
        failed.push({ index: idx, error: e.message, data: rec });
      }
    });

    db.prepare(`
      INSERT INTO audit_logs (user_id, user_role, action, module, target_type)
      VALUES (?, ?, 'offline_sync', 'booth', 'offline')
    `).run(userId, role);

    return { success: successCount, total: records.length, failed, reconcile_results: reconcileResults };
  });

  try {
    const result = tx();
    res.json(success(result, `离线补录完成，成功${result.success}条${result.failed.length ? `，失败${result.failed.length}条` : ''}`));
  } catch (err) {
    res.json(error(err.message || '补录失败'));
  }
});

router.get('/recent-verifications', (req, res) => {
  const rows = db.prepare(`
    SELECT bv.*, u.name as operator_name
    FROM booth_verifications bv
    LEFT JOIN users u ON bv.operator_id = u.id
    ORDER BY bv.verify_time DESC LIMIT 50
  `).all();
  res.json(success(rows));
});

module.exports = router;

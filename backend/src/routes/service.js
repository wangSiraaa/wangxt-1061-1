const express = require('express');
const db = require('../db/index');
const { authMiddleware } = require('../utils/auth');
const { success, error, generateNo, calculateParkingFee, dayjs } = require('../utils/response');

const router = express.Router();
router.use(authMiddleware(['service', 'admin']));

router.get('/plate-info/:plate', (req, res) => {
  const plate = req.params.plate.toUpperCase().replace(/\s/g, '');

  const info = {};

  info.plate = db.prepare('SELECT * FROM vehicle_plates WHERE plate_no = ?').get(plate);

  info.parking = db.prepare(`
    SELECT pr.* FROM parking_records pr
    WHERE pr.plate_no = ? AND pr.status = 'parking'
    ORDER BY pr.in_time DESC LIMIT 1
  `).get(plate);

  if (info.parking) {
    const calc = calculateParkingFee(info.parking.in_time);
    info.calculation = calc;
  }

  info.bound_coupons = db.prepare(`
    SELECT c.*, s.shop_name, o.order_no, o.amount, o.customer_phone
    FROM coupons c
    LEFT JOIN shops s ON c.shop_id = s.id
    LEFT JOIN orders o ON c.order_id = o.id
    WHERE c.plate_no = ? AND c.status = 'bound'
    ORDER BY c.bound_at DESC
  `).all(plate);

  info.available_coupons = db.prepare(`
    SELECT c.*, s.shop_name, o.order_no, o.amount, o.customer_phone
    FROM coupons c
    LEFT JOIN shops s ON c.shop_id = s.id
    LEFT JOIN orders o ON c.order_id = o.id
    WHERE c.plate_no = ? AND c.status IN ('issued','bound')
      AND datetime(c.expire_at) >= datetime('now')
    ORDER BY c.issued_at DESC
  `).all(plate);

  info.coupon_revocations = db.prepare(`
    SELECT cr.*, u.name as operator_name
    FROM coupon_revocations cr
    LEFT JOIN users u ON cr.revoked_by = u.id
    WHERE cr.coupon_id IN (SELECT id FROM coupons WHERE plate_no = ?)
    ORDER BY cr.revoked_at DESC LIMIT 50
  `).all(plate);

  info.verifications = db.prepare(`
    SELECT bv.*, u.name as operator_name
    FROM booth_verifications bv
    LEFT JOIN users u ON bv.operator_id = u.id
    WHERE bv.plate_no = ?
    ORDER BY bv.verify_time DESC LIMIT 50
  `).all(plate);

  info.manual_releases = db.prepare(`
    SELECT mr.*
    FROM manual_releases mr
    WHERE mr.plate_no = ?
    ORDER BY mr.released_at DESC LIMIT 50
  `).all(plate);

  info.plate_rebinds = db.prepare(`
    SELECT pr.*, u.name as operator_name
    FROM plate_rebinds pr
    LEFT JOIN users u ON pr.rebind_by = u.id
    WHERE pr.coupon_id IN (SELECT id FROM coupons WHERE plate_no = ? OR old_plate = ? OR new_plate = ?)
    ORDER BY pr.rebind_at DESC LIMIT 50
  `).all(plate, plate, plate);

  info.parking_history = db.prepare(`
    SELECT * FROM parking_records
    WHERE plate_no = ?
    ORDER BY in_time DESC LIMIT 20
  `).all(plate);

  res.json(success(info));
});

router.post('/manual-release', (req, res) => {
  const { plate_no, release_reason, waive_fee, booth_id } = req.body;
  const { id: userId, role, name: userName } = req.user;

  if (!plate_no || !release_reason) {
    return res.json(error('车牌号和放行原因不能为空'));
  }

  const cleanPlate = plate_no.toUpperCase().replace(/\s/g, '');
  const releaseNo = generateNo('RL');
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

  const tx = db.transaction(() => {
    const parking = db.prepare(`
      SELECT * FROM parking_records
      WHERE plate_no = ? AND status = 'parking'
      ORDER BY in_time DESC LIMIT 1
    `).get(cleanPlate);

    const { fee } = parking ? calculateParkingFee(parking.in_time) : { fee: 0 };
    const waived = waive_fee != null ? Number(waive_fee) : fee;

    const releaseInfo = db.prepare(`
      INSERT INTO manual_releases (release_no, plate_no, booth_id, release_type, release_reason,
        parking_duration, waived_fee, operator_id, operator_role, operator_name, released_at)
      VALUES (?, ?, ?, 'service', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      releaseNo, cleanPlate, booth_id || 'SERVICE', release_reason,
      parking ? dayjs().diff(dayjs(parking.in_time), 'minute') : 0,
      waived, userId, role, userName, now
    );

    db.prepare(`
      INSERT INTO audit_logs (user_id, user_role, action, module, target_id, target_type)
      VALUES (?, ?, 'manual_release', 'exception', ?, 'release')
    `).run(userId, role, releaseInfo.lastInsertRowid);

    return {
      release_no: releaseNo,
      plate_no: cleanPlate,
      waived_fee: waived,
      total_fee: fee
    };
  });

  try {
    const result = tx();
    res.json(success(result, '已登记人工放行，待审批后生效'));
  } catch (err) {
    res.json(error(err.message || '登记失败'));
  }
});

router.post('/approve-release', (req, res) => {
  const { release_id, approve, remark } = req.body;
  const { id: userId, role } = req.user;

  if (!release_id) {
    return res.json(error('放行单ID不能为空'));
  }

  const tx = db.transaction(() => {
    const release = db.prepare('SELECT * FROM manual_releases WHERE id = ?').get(release_id);
    if (!release) {
      throw new Error('放行单不存在');
    }
    if (release.approve_status !== 'pending') {
      throw new Error('该放行单已审批，不能重复操作');
    }

    const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
    const status = approve ? 'approved' : 'rejected';

    db.prepare(`
      UPDATE manual_releases
      SET approve_status = ?, approved_by = ?, approver_role = ?, approved_at = ?, approve_remark = ?
      WHERE id = ?
    `).run(status, userId, role, now, remark || '', release_id);

    if (approve) {
      const parking = db.prepare(`
        SELECT * FROM parking_records
        WHERE plate_no = ? AND status = 'parking'
        ORDER BY in_time DESC LIMIT 1
      `).get(release.plate_no);

      if (parking) {
        const duration = dayjs().diff(dayjs(parking.in_time), 'minute');
        const { fee } = calculateParkingFee(parking.in_time);
        db.prepare(`
          UPDATE parking_records
          SET out_time = ?, out_booth = ?, duration = ?, total_fee = ?,
              discount_fee = ?, paid_fee = ?, status = 'exited', release_id = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          now, release.booth_id || 'APPROVAL', duration, fee,
          release.waived_fee || 0, Math.max(0, fee - (release.waived_fee || 0)),
          release.id, parking.id
        );
        db.prepare(`
          UPDATE vehicle_plates SET in_park = 0, last_out_time = ? WHERE plate_no = ?
        `).run(now, release.plate_no);
      }

      db.prepare(`
        INSERT INTO booth_verifications (plate_no, booth_id, verify_time, verify_type,
          discount_hours, parking_duration, parking_fee, actual_fee, status, operator_id, remark)
        VALUES (?, ?, ?, 'manual', 0, 0, ?, 0, 'success', ?, ?)
      `).run(
        release.plate_no, release.booth_id || 'APPROVAL', now,
        release.waived_fee || 0, userId, `客服放行:${release.release_reason}`
      );
    }

    db.prepare(`
      INSERT INTO audit_logs (user_id, user_role, action, module, target_id, target_type)
      VALUES (?, ?, ?, 'approval', ?, 'release')
    `).run(userId, role, approve ? 'approve' : 'reject', release_id);

    return { release_no: release.release_no, status };
  });

  try {
    const result = tx();
    res.json(success(result, approve ? '审批通过，已放行' : '已驳回'));
  } catch (err) {
    res.json(error(err.message || '审批失败'));
  }
});

router.get('/releases', (req, res) => {
  const { status, plate_no, start_date, end_date } = req.query;

  let sql = `
    SELECT mr.*,
      CASE mr.approve_status
        WHEN 'pending' THEN '待审批'
        WHEN 'approved' THEN '已通过'
        WHEN 'rejected' THEN '已驳回'
      END as status_text
    FROM manual_releases mr
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    sql += ' AND mr.approve_status = ?';
    params.push(status);
  }
  if (plate_no) {
    sql += ' AND mr.plate_no LIKE ?';
    params.push(`%${plate_no}%`);
  }
  if (start_date) {
    sql += ' AND mr.released_at >= ?';
    params.push(start_date);
  }
  if (end_date) {
    sql += ' AND mr.released_at <= ?';
    params.push(end_date + ' 23:59:59');
  }

  sql += ' ORDER BY mr.released_at DESC LIMIT 200';
  const rows = db.prepare(sql).all(...params);
  res.json(success(rows));
});

router.get('/full-trace/:plate', (req, res) => {
  const plate = req.params.plate.toUpperCase().replace(/\s/g, '');

  const trace = [];

  const coupons = db.prepare(`
    SELECT c.id as target_id, 'coupon' as type, c.coupon_no as no,
      s.shop_name as title, o.order_no as sub,
      c.issued_at as time,
      CASE c.status
        WHEN 'issued' THEN '发放'
        WHEN 'bound' THEN '绑定车牌'
        WHEN 'verified' THEN '核销出场'
        WHEN 'revoked' THEN '撤销'
        WHEN 'expired' THEN '过期'
      END as action
    FROM coupons c
    LEFT JOIN shops s ON c.shop_id = s.id
    LEFT JOIN orders o ON c.order_id = o.id
    WHERE c.plate_no = ? OR o.customer_phone IN (SELECT customer_phone FROM vehicle_plates WHERE plate_no = ?)
  `).all(plate, plate);
  trace.push(...coupons);

  const revocations = db.prepare(`
    SELECT cr.id as target_id, 'revocation' as type, '' as no,
      '优惠券撤销' as title, cr.revoke_reason as sub,
      cr.revoked_at as time,
      '撤销' as action
    FROM coupon_revocations cr
    WHERE cr.coupon_id IN (SELECT id FROM coupons WHERE plate_no = ?)
  `).all(plate);
  trace.push(...revocations);

  const verifications = db.prepare(`
    SELECT bv.id as target_id, 'verification' as type, '' as no,
      ('岗亭核验:' || bv.verify_type) as title,
      (bv.actual_fee || '元') as sub,
      bv.verify_time as time,
      bv.status as action
    FROM booth_verifications bv
    WHERE bv.plate_no = ?
  `).all(plate);
  trace.push(...verifications);

  const releases = db.prepare(`
    SELECT mr.id as target_id, 'release' as type, mr.release_no as no,
      ('人工放行-' || mr.approve_status) as title,
      mr.release_reason as sub,
      mr.released_at as time,
      CASE mr.approve_status
        WHEN 'pending' THEN '待审批'
        WHEN 'approved' THEN '审批通过'
        WHEN 'rejected' THEN '审批驳回'
      END as action
    FROM manual_releases mr
    WHERE mr.plate_no = ?
  `).all(plate);
  trace.push(...releases);

  const approvals = db.prepare(`
    SELECT ea.id as target_id, 'approval' as type, ea.approval_no as no,
      ea.exception_type as title, ea.reason as sub,
      ea.created_at as time,
      CASE ea.approve_status
        WHEN 'pending' THEN '待审批'
        WHEN 'approved' THEN '通过'
        WHEN 'rejected' THEN '驳回'
      END as action
    FROM exception_approvals ea
    WHERE ea.plate_no = ?
  `).all(plate);
  trace.push(...approvals);

  trace.sort((a, b) => new Date(b.time) - new Date(a.time));

  res.json(success(trace.slice(0, 100)));
});

router.post('/exception-approval', (req, res) => {
  const { exception_type, related_id, plate_no, reason } = req.body;
  const { id: userId, role } = req.user;

  if (!exception_type || !reason) {
    return res.json(error('异常类型和原因不能为空'));
  }

  const approvalNo = generateNo('AP');
  const info = db.prepare(`
    INSERT INTO exception_approvals (approval_no, exception_type, related_id, plate_no,
      applicant_id, applicant_role, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(approvalNo, exception_type, related_id || null, plate_no || '', userId, role, reason);

  res.json(success({ id: info.lastInsertRowid, approval_no: approvalNo }, '已提交异常审批申请'));
});

router.get('/approvals', (req, res) => {
  const { status } = req.query;
  let sql = `
    SELECT ea.*, u.name as applicant_name,
      CASE ea.approve_status
        WHEN 'pending' THEN '待审批'
        WHEN 'approved' THEN '已通过'
        WHEN 'rejected' THEN '已驳回'
      END as status_text
    FROM exception_approvals ea
    LEFT JOIN users u ON ea.applicant_id = u.id
  `;
  const params = [];
  if (status) {
    sql += ' WHERE ea.approve_status = ?';
    params.push(status);
  }
  sql += ' ORDER BY ea.created_at DESC LIMIT 200';
  const rows = db.prepare(sql).all(...params);
  res.json(success(rows));
});

router.post('/approve-exception', (req, res) => {
  const { approval_id, approve, remark } = req.body;
  const { id: userId, role } = req.user;

  if (!approval_id) {
    return res.json(error('审批ID不能为空'));
  }

  const tx = db.transaction(() => {
    const approval = db.prepare('SELECT * FROM exception_approvals WHERE id = ?').get(approval_id);
    if (!approval) throw new Error('审批单不存在');
    if (approval.approve_status !== 'pending') throw new Error('已审批过了');

    const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
    const status = approve ? 'approved' : 'rejected';

    db.prepare(`
      UPDATE exception_approvals
      SET approve_status = ?, approver_id = ?, approver_role = ?, approved_at = ?, approve_remark = ?
      WHERE id = ?
    `).run(status, userId, role, now, remark || '', approval_id);

    return { approval_no: approval.approval_no, status };
  });

  try {
    const result = tx();
    res.json(success(result, approve ? '审批通过' : '已驳回'));
  } catch (err) {
    res.json(error(err.message));
  }
});

module.exports = router;

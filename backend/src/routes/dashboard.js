const express = require('express');
const db = require('../db/index');
const { authMiddleware } = require('../utils/auth');
const { success, dayjs } = require('../utils/response');

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({ code: 200, status: 'ok', timestamp: Date.now() });
});

router.get('/dashboard/summary', authMiddleware(['admin', 'service']), (_req, res) => {
  const now = dayjs();
  const todayStart = now.startOf('day').format('YYYY-MM-DD HH:mm:ss');
  const todayEnd = now.endOf('day').format('YYYY-MM-DD HH:mm:ss');

  const data = {};

  data.issued_today = db.prepare(`
    SELECT COUNT(*) as cnt, COALESCE(SUM(order_amount),0) as amt
    FROM coupons WHERE issued_at >= ? AND issued_at <= ?
  `).get(todayStart, todayEnd);

  data.verified_today = db.prepare(`
    SELECT COUNT(*) as cnt, COALESCE(SUM(discount_hours)*10,0) as discount_amt
    FROM coupons WHERE verified_at >= ? AND verified_at <= ?
  `).get(todayStart, todayEnd);

  data.revoked_today = db.prepare(`
    SELECT COUNT(*) as cnt FROM coupon_revocations WHERE revoked_at >= ? AND revoked_at <= ?
  `).get(todayStart, todayEnd);

  data.manual_today = db.prepare(`
    SELECT COUNT(*) as cnt, COALESCE(SUM(waived_fee),0) as waived_amt
    FROM manual_releases WHERE released_at >= ? AND released_at <= ?
  `).get(todayStart, todayEnd);

  data.in_park_now = db.prepare(`
    SELECT COUNT(*) as cnt FROM parking_records WHERE status = 'parking'
  `).get();

  data.exited_today = db.prepare(`
    SELECT COUNT(*) as cnt, COALESCE(SUM(total_fee),0) as total_fee,
           COALESCE(SUM(discount_fee),0) as discount_fee,
           COALESCE(SUM(paid_fee),0) as paid_fee
    FROM parking_records WHERE out_time >= ? AND out_time <= ?
  `).get(todayStart, todayEnd);

  data.pending_approvals = db.prepare(`
    SELECT COUNT(*) as cnt FROM manual_releases WHERE approve_status = 'pending'
  `).get();

  data.exception_count = db.prepare(`
    SELECT COUNT(*) as cnt FROM parking_records WHERE status = 'exception'
  `).get();

  res.json(success(data));
});

router.get('/dashboard/shop-ranking', authMiddleware(['admin', 'service']), (_req, res) => {
  const rows = db.prepare(`
    SELECT s.shop_name, s.shop_code,
      COUNT(c.id) as coupon_count,
      COALESCE(SUM(c.order_amount),0) as order_amount,
      COALESCE(SUM(CASE WHEN c.status='verified' THEN 1 ELSE 0 END),0) as used_count,
      COALESCE(SUM(CASE WHEN c.status='verified' THEN c.discount_hours ELSE 0 END),0) as used_hours,
      s.coupon_used, (s.coupon_quota - s.coupon_used) as quota_remain
    FROM shops s
    LEFT JOIN coupons c ON c.shop_id = s.id
    GROUP BY s.id
    ORDER BY coupon_count DESC
  `).all();
  res.json(success(rows));
});

router.get('/dashboard/hourly-exit', authMiddleware(['admin', 'service']), (_req, res) => {
  const todayStart = dayjs().startOf('day').format('YYYY-MM-DD HH:mm:ss');
  const rows = db.prepare(`
    SELECT strftime('%H', out_time) as hour,
      COUNT(*) as exit_count,
      SUM(CASE WHEN coupon_id IS NOT NULL THEN 1 ELSE 0 END) as coupon_exit,
      SUM(CASE WHEN release_id IS NOT NULL THEN 1 ELSE 0 END) as release_exit,
      COALESCE(SUM(total_fee),0) as total_fee,
      COALESCE(SUM(discount_fee),0) as discount_fee
    FROM parking_records
    WHERE out_time >= ?
    GROUP BY strftime('%H', out_time)
    ORDER BY hour
  `).all(todayStart);

  const data = [];
  for (let i = 0; i < 24; i++) {
    const h = String(i).padStart(2, '0');
    const found = rows.find(r => r.hour === h);
    data.push({
      hour: `${h}:00`,
      exit_count: found ? found.exit_count : 0,
      coupon_exit: found ? found.coupon_exit : 0,
      release_exit: found ? found.release_exit : 0,
      total_fee: found ? found.total_fee : 0,
      discount_fee: found ? found.discount_fee : 0
    });
  }
  res.json(success(data));
});

router.get('/dashboard/coupon-status', authMiddleware(['admin', 'service']), (_req, res) => {
  const rows = db.prepare(`
    SELECT status, COUNT(*) as cnt
    FROM coupons
    GROUP BY status
  `).all();
  const data = {
    issued: 0, bound: 0, verified: 0, revoked: 0, expired: 0
  };
  rows.forEach(r => { if (data[r.status] !== undefined) data[r.status] = r.cnt; });
  res.json(success(data));
});

router.get('/dashboard/plate-status', authMiddleware(['booth', 'service', 'admin']), (_req, res) => {
  const rows = db.prepare(`
    SELECT pr.plate_no, pr.in_time, pr.status, vp.customer_phone,
      (SELECT COUNT(*) FROM coupons c WHERE c.plate_no = pr.plate_no AND c.status = 'bound') as coupon_count
    FROM parking_records pr
    LEFT JOIN vehicle_plates vp ON pr.plate_no = vp.plate_no
    WHERE pr.status = 'parking'
    ORDER BY pr.in_time DESC
    LIMIT 100
  `).all();
  res.json(success(rows));
});

router.get('/dashboard/reconciliation', authMiddleware(['admin', 'service']), (req, res) => {
  const { start_date, end_date } = req.query;
  const start = start_date || dayjs().subtract(7, 'day').format('YYYY-MM-DD') + ' 00:00:00';
  const end = end_date || dayjs().format('YYYY-MM-DD') + ' 23:59:59';

  const rows = db.prepare(`
    SELECT s.shop_name, s.shop_code,
      (SELECT COUNT(*) FROM coupons c WHERE c.shop_id = s.id AND c.issued_at >= ? AND c.issued_at <= ?) as issued,
      (SELECT COUNT(*) FROM coupons c WHERE c.shop_id = s.id AND c.status='verified' AND c.verified_at >= ? AND c.verified_at <= ?) as verified,
      (SELECT COUNT(*) FROM coupons c WHERE c.shop_id = s.id AND c.status='revoked' AND EXISTS (SELECT 1 FROM coupon_revocations r WHERE r.coupon_id = c.id AND r.revoked_at >= ? AND r.revoked_at <= ?)) as revoked,
      COALESCE((SELECT SUM(c2.order_amount) FROM coupons c2 WHERE c2.shop_id = s.id AND c2.issued_at >= ? AND c2.issued_at <= ?),0) as order_total,
      COALESCE((SELECT SUM(c3.discount_hours) * 10 FROM coupons c3 WHERE c3.shop_id = s.id AND c3.status='verified' AND c3.verified_at >= ? AND c3.verified_at <= ?),0) as discount_total
    FROM shops s
    GROUP BY s.id
    ORDER BY issued DESC
  `).all(start, end, start, end, start, end, start, end, start, end);

  const totals = rows.reduce((acc, r) => ({
    issued: acc.issued + r.issued,
    verified: acc.verified + r.verified,
    revoked: acc.revoked + r.revoked,
    order_total: acc.order_total + r.order_total,
    discount_total: acc.discount_total + r.discount_total
  }), { issued: 0, verified: 0, revoked: 0, order_total: 0, discount_total: 0 });

  res.json(success({ shops: rows, totals, date_range: { start, end } }));
});

router.get('/dashboard/exit-status', authMiddleware(['booth', 'service', 'admin']), (_req, res) => {
  const today = dayjs().startOf('day').format('YYYY-MM-DD HH:mm:ss');

  const normal = db.prepare(`
    SELECT COUNT(*) as cnt FROM parking_records
    WHERE out_time >= ? AND status = 'exited' AND coupon_id IS NOT NULL AND release_id IS NULL
  `).get(today);

  const noCoupon = db.prepare(`
    SELECT COUNT(*) as cnt FROM parking_records
    WHERE out_time >= ? AND status = 'exited' AND coupon_id IS NULL AND release_id IS NULL
  `).get(today);

  const released = db.prepare(`
    SELECT COUNT(*) as cnt FROM parking_records
    WHERE out_time >= ? AND status = 'exited' AND release_id IS NOT NULL
  `).get(today);

  const exception = db.prepare(`
    SELECT COUNT(*) as cnt FROM parking_records WHERE status = 'exception'
  `).get();

  const parking = db.prepare(`
    SELECT COUNT(*) as cnt FROM parking_records WHERE status = 'parking'
  `).get();

  const issues = db.prepare(`
    SELECT pr.*, vp.customer_phone,
      CASE WHEN pr.coupon_id IS NOT NULL THEN '有券' ELSE '无券' END as has_coupon
    FROM parking_records pr
    LEFT JOIN vehicle_plates vp ON pr.plate_no = vp.plate_no
    WHERE pr.status = 'exception'
    ORDER BY pr.in_time DESC
  `).all();

  res.json(success({
    stats: {
      normal_coupon: normal.cnt,
      no_coupon_paid: noCoupon.cnt,
      manual_release: released.cnt,
      exception: exception.cnt,
      in_park: parking.cnt
    },
    issues
  }));
});

module.exports = router;

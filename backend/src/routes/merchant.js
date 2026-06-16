const express = require('express');
const db = require('../db/index');
const { authMiddleware } = require('../utils/auth');
const { success, error, generateNo, dayjs } = require('../utils/response');

const router = express.Router();
router.use(authMiddleware(['merchant', 'admin']));

router.get('/shops', (req, res) => {
  const { shop_id, role } = req.user;
  let rows;
  if (role === 'admin') {
    rows = db.prepare('SELECT * FROM shops ORDER BY id').all();
  } else {
    rows = db.prepare('SELECT * FROM shops WHERE id = ?').all(shop_id);
  }
  res.json(success(rows));
});

router.get('/shop/quota', (req, res) => {
  const shop = db.prepare(`
    SELECT s.*, (s.coupon_quota - s.coupon_used) as quota_remain
    FROM shops s WHERE s.id = ?
  `).get(req.user.shop_id);
  res.json(success(shop));
});

router.get('/orders', (req, res) => {
  const { shop_id } = req.user;
  const { phone, status, keyword } = req.query;

  let sql = `
    SELECT o.*, s.shop_name,
      CASE WHEN o.coupon_issued = 1 THEN '已发券' ELSE '未发券' END as coupon_status_text
    FROM orders o
    LEFT JOIN shops s ON o.shop_id = s.id
    WHERE o.shop_id = ?
  `;
  const params = [shop_id];

  if (phone) {
    sql += ' AND o.customer_phone LIKE ?';
    params.push(`%${phone}%`);
  }
  if (keyword) {
    sql += ' AND o.order_no LIKE ?';
    params.push(`%${keyword}%`);
  }

  sql += ' ORDER BY o.pay_time DESC LIMIT 200';
  const rows = db.prepare(sql).all(...params);
  res.json(success(rows));
});

router.get('/orders/:id', (req, res) => {
  const order = db.prepare(`
    SELECT o.*, s.shop_name, s.min_amount, s.discount_hours,
      CASE WHEN o.coupon_issued = 1 THEN '已发券' ELSE '未发券' END as coupon_status_text
    FROM orders o
    LEFT JOIN shops s ON o.shop_id = s.id
    WHERE o.id = ? AND o.shop_id = ?
  `).get(req.params.id, req.user.shop_id);

  if (!order) {
    return res.json(error('订单不存在', 404));
  }
  res.json(success(order));
});

router.post('/issue-coupon', (req, res) => {
  const { order_id } = req.body;
  const { id: userId, shop_id, role } = req.user;

  if (!order_id) {
    return res.json(error('订单ID不能为空'));
  }

  const tx = db.transaction(() => {
    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND shop_id = ?').get(order_id, shop_id);
    if (!order) {
      throw new Error('订单不存在');
    }

    if (order.coupon_issued === 1) {
      throw new Error('该订单已发过优惠券，同一订单只能发一张');
    }

    const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(shop_id);
    if (Number(order.amount) < Number(shop.min_amount)) {
      throw new Error(`消费金额不足，需满${shop.min_amount}元才能发券，当前${order.amount}元`);
    }

    const remainQuota = Number(shop.coupon_quota) - Number(shop.coupon_used);
    if (remainQuota < Number(order.amount)) {
      throw new Error(`店铺额度不足，剩余${remainQuota}元`);
    }

    const couponNo = generateNo('CP');
    const issuedAt = dayjs().format('YYYY-MM-DD HH:mm:ss');
    const expireAt = dayjs().add(1, 'day').endOf('day').format('YYYY-MM-DD HH:mm:ss');

    const couponInfo = db.prepare(`
      INSERT INTO coupons (coupon_no, order_id, shop_id, order_amount, discount_hours,
        issued_by, issued_at, expire_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'issued')
    `).run(couponNo, order.id, shop_id, order.amount, shop.discount_hours, userId, issuedAt, expireAt);

    db.prepare(`
      UPDATE orders SET coupon_issued = 1, coupon_id = ? WHERE id = ?
    `).run(couponInfo.lastInsertRowid, order.id);

    db.prepare(`
      UPDATE shops SET coupon_used = coupon_used + ? WHERE id = ?
    `).run(order.amount, shop_id);

    db.prepare(`
      INSERT INTO audit_logs (user_id, user_role, action, module, target_id, target_type)
      VALUES (?, ?, 'issue', 'coupon', ?, 'coupon')
    `).run(userId, role, couponInfo.lastInsertRowid);

    return {
      id: couponInfo.lastInsertRowid,
      coupon_no: couponNo,
      discount_hours: shop.discount_hours,
      expire_at: expireAt,
      order_no: order.order_no,
      amount: order.amount
    };
  });

  try {
    const result = tx();
    res.json(success(result, '发券成功'));
  } catch (err) {
    res.json(error(err.message || '发券失败'));
  }
});

router.get('/coupons', (req, res) => {
  const { shop_id } = req.user;
  const { status, keyword } = req.query;

  let sql = `
    SELECT c.*, s.shop_name, o.order_no, o.customer_phone,
      CASE c.status
        WHEN 'issued' THEN '已发券'
        WHEN 'bound' THEN '已绑定'
        WHEN 'verified' THEN '已核销'
        WHEN 'revoked' THEN '已撤销'
        WHEN 'expired' THEN '已过期'
      END as status_text
    FROM coupons c
    LEFT JOIN shops s ON c.shop_id = s.id
    LEFT JOIN orders o ON c.order_id = o.id
    WHERE c.shop_id = ?
  `;
  const params = [shop_id];

  if (status) {
    sql += ' AND c.status = ?';
    params.push(status);
  }
  if (keyword) {
    sql += ' AND (c.coupon_no LIKE ? OR o.order_no LIKE ? OR o.customer_phone LIKE ?)';
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw);
  }

  sql += ' ORDER BY c.issued_at DESC LIMIT 200';
  const rows = db.prepare(sql).all(...params);
  res.json(success(rows));
});

router.get('/coupons/:id', (req, res) => {
  const coupon = db.prepare(`
    SELECT c.*, s.shop_name, s.floor, o.order_no, o.amount as order_amount, o.customer_phone, o.pay_time,
      CASE c.status
        WHEN 'issued' THEN '已发券'
        WHEN 'bound' THEN '已绑定'
        WHEN 'verified' THEN '已核销'
        WHEN 'revoked' THEN '已撤销'
        WHEN 'expired' THEN '已过期'
      END as status_text
    FROM coupons c
    LEFT JOIN shops s ON c.shop_id = s.id
    LEFT JOIN orders o ON c.order_id = o.id
    WHERE c.id = ? AND c.shop_id = ?
  `).get(req.params.id, req.user.shop_id);

  if (!coupon) {
    return res.json(error('优惠券不存在', 404));
  }
  res.json(success(coupon));
});

router.post('/revoke-coupon', (req, res) => {
  const { coupon_id, reason } = req.body;
  const { id: userId, role } = req.user;

  if (!coupon_id) {
    return res.json(error('优惠券ID不能为空'));
  }

  const tx = db.transaction(() => {
    const coupon = db.prepare('SELECT c.*, s.shop_name FROM coupons c LEFT JOIN shops s ON c.shop_id = s.id WHERE c.id = ?').get(coupon_id);
    if (!coupon) {
      throw new Error('优惠券不存在');
    }

    if (coupon.status === 'verified') {
      throw new Error('优惠券已核销，不能撤销');
    }
    if (coupon.status === 'revoked') {
      throw new Error('优惠券已撤销');
    }

    if (coupon.plate_no) {
      const parking = db.prepare(`
        SELECT * FROM parking_records
        WHERE plate_no = ? AND status = 'parking'
        ORDER BY in_time DESC LIMIT 1
      `).get(coupon.plate_no);

      if (!parking) {
        const lastOut = db.prepare(`
          SELECT * FROM parking_records
          WHERE plate_no = ? AND status = 'exited'
          ORDER BY out_time DESC LIMIT 1
        `).get(coupon.plate_no);
        if (lastOut && dayjs(lastOut.out_time).isAfter(dayjs(coupon.bound_at))) {
          throw new Error('该车辆已出场，绑定的优惠券不能撤销');
        }
      }
    }

    db.prepare(`
      UPDATE coupons SET status = 'revoked', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(coupon_id);

    db.prepare(`
      UPDATE orders SET coupon_issued = 0, coupon_id = NULL WHERE id = ?
    `).run(coupon.order_id);

    db.prepare(`
      UPDATE shops SET coupon_used = coupon_used - ? WHERE id = ?
    `).run(coupon.order_amount, coupon.shop_id);

    db.prepare(`
      INSERT INTO coupon_revocations (coupon_id, coupon_no, revoked_by, revoked_by_role, revoke_reason)
      VALUES (?, ?, ?, ?, ?)
    `).run(coupon_id, coupon.coupon_no, userId, role, reason || '商户撤销');

    if (coupon.plate_id) {
      db.prepare(`
        INSERT INTO audit_logs (user_id, user_role, action, module, target_id, target_type)
        VALUES (?, ?, 'revoke_unbind', 'plate', ?, 'plate')
      `).run(userId, role, coupon.plate_id);
    }

    db.prepare(`
      INSERT INTO audit_logs (user_id, user_role, action, module, target_id, target_type)
      VALUES (?, ?, 'revoke', 'coupon', ?, 'coupon')
    `).run(userId, role, coupon_id);

    return { coupon_no: coupon.coupon_no };
  });

  try {
    const result = tx();
    res.json(success(result, '撤券成功'));
  } catch (err) {
    res.json(error(err.message || '撤券失败'));
  }
});

module.exports = router;

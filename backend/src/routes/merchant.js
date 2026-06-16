const express = require('express');
const db = require('../db/index');
const { authMiddleware } = require('../utils/auth');
const { success, error, generateNo, dayjs } = require('../utils/response');

const router = express.Router();
router.use(authMiddleware(['merchant', 'admin']));

function getOrCreateMonthlyQuota(shopId, month) {
  let quota = db.prepare('SELECT * FROM monthly_quotas WHERE shop_id = ? AND month = ?').get(shopId, month);
  if (!quota) {
    const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(shopId);
    const defaultQuota = shop ? shop.coupon_quota : 0;
    db.prepare(`
      INSERT INTO monthly_quotas (shop_id, month, quota_amount, used_amount, full_coupon_used, discount_coupon_used, status)
      VALUES (?, ?, ?, 0, 0, 0, 'active')
    `).run(shopId, month, defaultQuota);
    quota = db.prepare('SELECT * FROM monthly_quotas WHERE shop_id = ? AND month = ?').get(shopId, month);
  }
  return quota;
}

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
  const shopId = req.user.shop_id;
  const currentMonth = dayjs().format('YYYY-MM');
  const shop = db.prepare(`
    SELECT s.*, (s.coupon_quota - s.coupon_used) as quota_remain
    FROM shops s WHERE s.id = ?
  `).get(shopId);

  const monthlyQuota = getOrCreateMonthlyQuota(shopId, currentMonth);
  const remain = Number(monthlyQuota.quota_amount) - Number(monthlyQuota.used_amount);

  shop.monthly_quota = monthlyQuota;
  shop.monthly_remain = remain;
  shop.current_month = currentMonth;

  res.json(success(shop));
});

router.get('/monthly-quotas', (req, res) => {
  const { shop_id, role } = req.user;
  const { month } = req.query;
  const targetMonth = month || dayjs().format('YYYY-MM');

  const shopId = role === 'admin' ? (req.query.shop_id || shop_id) : shop_id;
  const quota = getOrCreateMonthlyQuota(shopId, targetMonth);

  const coupons = db.prepare(`
    SELECT c.id, c.coupon_no, c.coupon_type, c.order_amount, c.discount_hours, c.issued_at, c.status,
      o.order_no
    FROM coupons c
    LEFT JOIN orders o ON c.order_id = o.id
    WHERE c.shop_id = ? AND strftime('%Y-%m', c.issued_at) = ?
    ORDER BY c.issued_at DESC
  `).all(shopId, targetMonth);

  res.json(success({ quota, coupons }));
});

router.post('/monthly-quotas/adjust', (req, res) => {
  const { shop_id, month, quota_amount } = req.body;
  const { id: userId, role } = req.user;

  if (role !== 'admin' && shop_id !== req.user.shop_id) {
    return res.json(error('无权调整其他店铺额度', 403));
  }

  const targetMonth = month || dayjs().format('YYYY-MM');
  const targetShop = shop_id || req.user.shop_id;

  const tx = db.transaction(() => {
    const quota = getOrCreateMonthlyQuota(targetShop, targetMonth);
    if (quota.status === 'closed') {
      throw new Error('该月额度已结账，不可调整');
    }

    const oldAmount = quota.quota_amount;
    db.prepare(`
      UPDATE monthly_quotas SET quota_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(quota_amount, quota.id);

    db.prepare(`
      INSERT INTO audit_logs (user_id, user_role, action, module, target_id, target_type, before_data, after_data)
      VALUES (?, ?, 'adjust_monthly_quota', 'quota', ?, 'monthly_quota', ?, ?)
    `).run(userId, role, quota.id, JSON.stringify({ quota_amount: oldAmount }), JSON.stringify({ quota_amount }));

    return { id: quota.id, month: targetMonth, old_amount: oldAmount, new_amount: quota_amount };
  });

  try {
    const result = tx();
    res.json(success(result, '月度额度调整成功'));
  } catch (err) {
    res.json(error(err.message || '调整失败'));
  }
});

router.get('/budget-hint', (req, res) => {
  const { order_amount } = req.query;
  const { shop_id } = req.user;
  const currentMonth = dayjs().format('YYYY-MM');
  const amount = Number(order_amount) || 0;

  const quota = getOrCreateMonthlyQuota(shop_id, currentMonth);
  const remain = Number(quota.quota_amount) - Number(quota.used_amount);
  const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(shop_id);

  let hint = {
    month: currentMonth,
    quota_amount: quota.quota_amount,
    used_amount: quota.used_amount,
    remain: remain,
    request_amount: amount,
    can_issue_full: false,
    can_issue_discount: false,
    suggested_type: null,
    message: ''
  };

  if (remain <= 0) {
    hint.message = '本月额度已用完，无法发券';
  } else if (remain >= amount) {
    hint.can_issue_full = true;
    hint.can_issue_discount = true;
    hint.suggested_type = 'full';
    hint.message = `额度充足，可发放全额券（${amount}元）`;
  } else if (remain > 0 && remain < amount) {
    hint.can_issue_full = false;
    hint.can_issue_discount = true;
    hint.suggested_type = 'discount';
    hint.message = `本月额度剩余${remain.toFixed(2)}元，不足发放全额券（需${amount}元），仅可发放折扣券（按剩余额度抵扣）`;
  }

  if (shop) {
    hint.min_amount = shop.min_amount;
    hint.discount_hours = shop.discount_hours;
  }

  res.json(success(hint));
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
  const { order_id, coupon_type } = req.body;
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
      throw new Error(`店铺总额度不足，剩余${remainQuota}元`);
    }

    const currentMonth = dayjs().format('YYYY-MM');
    const monthlyQuota = getOrCreateMonthlyQuota(shop_id, currentMonth);
    if (monthlyQuota.status === 'frozen') {
      throw new Error('本月额度已冻结，无法发券');
    }

    const monthlyRemain = Number(monthlyQuota.quota_amount) - Number(monthlyQuota.used_amount);
    const requestedType = coupon_type || 'full';
    const actualAmount = Number(order.amount);

    let finalCouponType;
    let usedAmount;
    let discountHours;

    if (requestedType === 'full' && monthlyRemain >= actualAmount) {
      finalCouponType = 'full';
      usedAmount = actualAmount;
      discountHours = shop.discount_hours;
    } else if (monthlyRemain > 0 && monthlyRemain < actualAmount) {
      finalCouponType = 'discount';
      usedAmount = monthlyRemain;
      discountHours = Math.max(1, Math.floor(shop.discount_hours * (monthlyRemain / actualAmount)));
    } else if (monthlyRemain <= 0) {
      throw new Error(`本月额度已用完（总额${monthlyQuota.quota_amount}元），无法发券`);
    } else {
      finalCouponType = requestedType;
      usedAmount = actualAmount;
      discountHours = shop.discount_hours;
    }

    const couponNo = generateNo('CP');
    const issuedAt = dayjs().format('YYYY-MM-DD HH:mm:ss');
    const expireAt = dayjs().add(1, 'day').endOf('day').format('YYYY-MM-DD HH:mm:ss');

    const couponInfo = db.prepare(`
      INSERT INTO coupons (coupon_no, order_id, shop_id, order_amount, discount_hours, discount_value,
        coupon_type, issued_by, issued_at, expire_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'issued')
    `).run(couponNo, order.id, shop_id, actualAmount, discountHours,
      finalCouponType === 'discount' ? usedAmount : 0,
      finalCouponType, userId, issuedAt, expireAt);

    db.prepare(`
      UPDATE orders SET coupon_issued = 1, coupon_id = ? WHERE id = ?
    `).run(couponInfo.lastInsertRowid, order.id);

    db.prepare(`
      UPDATE shops SET coupon_used = coupon_used + ? WHERE id = ?
    `).run(usedAmount, shop_id);

    if (finalCouponType === 'full') {
      db.prepare(`
        UPDATE monthly_quotas SET used_amount = used_amount + ?, full_coupon_used = full_coupon_used + ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(usedAmount, usedAmount, monthlyQuota.id);
    } else {
      db.prepare(`
        UPDATE monthly_quotas SET used_amount = used_amount + ?, discount_coupon_used = discount_coupon_used + ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(usedAmount, usedAmount, monthlyQuota.id);
    }

    db.prepare(`
      INSERT INTO audit_logs (user_id, user_role, action, module, target_id, target_type, after_data)
      VALUES (?, ?, 'issue', 'coupon', ?, 'coupon', ?)
    `).run(userId, role, couponInfo.lastInsertRowid, JSON.stringify({ coupon_type: finalCouponType, used_amount: usedAmount }));

    return {
      id: couponInfo.lastInsertRowid,
      coupon_no: couponNo,
      coupon_type: finalCouponType,
      discount_hours: discountHours,
      discount_value: finalCouponType === 'discount' ? usedAmount : 0,
      expire_at: expireAt,
      order_no: order.order_no,
      amount: actualAmount,
      used_from_monthly: usedAmount,
      monthly_remain: Number(monthlyQuota.quota_amount) - Number(monthlyQuota.used_amount) - usedAmount,
      hint: finalCouponType === 'discount'
        ? `本月额度不足全额券，已发放折扣券（抵扣${usedAmount.toFixed(2)}元/${discountHours}小时）`
        : '全额券发放成功'
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
      END as status_text,
      CASE c.coupon_type
        WHEN 'full' THEN '全额券'
        WHEN 'discount' THEN '折扣券'
      END as coupon_type_text
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
      END as status_text,
      CASE c.coupon_type
        WHEN 'full' THEN '全额券'
        WHEN 'discount' THEN '折扣券'
      END as coupon_type_text
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

    const revokeAmount = coupon.coupon_type === 'discount' ? Number(coupon.discount_value) : Number(coupon.order_amount);

    db.prepare(`
      UPDATE coupons SET status = 'revoked', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(coupon_id);

    db.prepare(`
      UPDATE orders SET coupon_issued = 0, coupon_id = NULL WHERE id = ?
    `).run(coupon.order_id);

    db.prepare(`
      UPDATE shops SET coupon_used = coupon_used - ? WHERE id = ?
    `).run(revokeAmount, coupon.shop_id);

    const issueMonth = dayjs(coupon.issued_at).format('YYYY-MM');
    const monthlyQuota = db.prepare('SELECT * FROM monthly_quotas WHERE shop_id = ? AND month = ?').get(coupon.shop_id, issueMonth);
    if (monthlyQuota) {
      db.prepare(`
        UPDATE monthly_quotas SET used_amount = used_amount - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(revokeAmount, monthlyQuota.id);
    }

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

    return { coupon_no: coupon.coupon_no, refund_monthly: revokeAmount };
  });

  try {
    const result = tx();
    res.json(success(result, '撤券成功'));
  } catch (err) {
    res.json(error(err.message || '撤券失败'));
  }
});

module.exports = router;

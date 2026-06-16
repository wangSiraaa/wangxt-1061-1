const db = require('./src/db/index');
const { initTables } = require('./src/db/schema');
const { hashPassword } = require('./src/utils/auth');
const dayjs = require('dayjs');

initTables();

function getShopUser(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function simulateGetOrCreateMonthlyQuota = function(shopId, month) {
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
};

function getShopQuota = function(shopId) {
  const currentMonth = dayjs().format('YYYY-MM');
  const shop = db.prepare(`
    SELECT s.*, (s.coupon_quota - s.coupon_used) as quota_remain
    FROM shops s WHERE s.id = ?
  `).get(shopId);

  const monthlyQuota = simulateGetOrCreateMonthlyQuota(shopId, currentMonth);
  const remain = Number(monthlyQuota.quota_amount) - Number(monthlyQuota.used_amount);

  shop.monthly_quota = Number(monthlyQuota.quota_amount);
  shop.monthly_used = Number(monthlyQuota.used_amount);
  shop.monthly_remain = Number(remain.toFixed(2));
  shop.full_coupon_used = Number(monthlyQuota.full_coupon_used);
  shop.discount_coupon_used = Number(monthlyQuota.discount_coupon_used);
  shop.monthly_status = monthlyQuota.status;
  shop.current_month = currentMonth;

  return shop;
};

getBudgetHint = function(shopId, order_amount, amountParam) {
  const currentMonth = dayjs().format('YYYY-MM');
  const amount = Number(order_amount || amountParam) || 0;

  const quota = simulateGetOrCreateMonthlyQuota(shopId, currentMonth);
  const remain = Number(quota.quota_amount) - Number(quota.used_amount);
  const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(shopId);

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

  return hint;
};

console.log('========== 测试1: /shop/quota 字段验证 ==========');
const shop1 = getShopQuota(1);
console.log('monthly_quota (应为数值5000):', typeof shop1.monthly_quota, shop1.monthly_quota === 5000 ? '✅' : '❌');
console.log('monthly_used (应为数值0):', typeof shop1.monthly_used, shop1.monthly_used === 0 ? '✅' : '❌');
console.log('monthly_remain (应为数值5000):', typeof shop1.monthly_remain, shop1.monthly_remain === 5000 ? '✅' : '❌');
console.log('full_coupon_used (应为数值0):', typeof shop1.full_coupon_used, shop1.full_coupon_used === 0 ? '✅' : '❌');
console.log('discount_coupon_used (应为数值0):', typeof shop1.discount_coupon_used, shop1.discount_coupon_used === 0 ? '✅' : '❌');
console.log('current_month:', shop1.current_month);
console.log('');

console.log('========== 测试2: amount=3000 (额度充足) ==========');
const hint1 = getBudgetHint(1, null, 3000);
console.log('request_amount:', hint1.request_amount, hint1.request_amount === 3000 ? '✅' : '❌');
console.log('can_issue_full:', hint1.can_issue_full, hint1.can_issue_full === true ? '✅' : '❌');
console.log('suggested_type:', hint1.suggested_type, hint1.suggested_type === 'full' ? '✅' : '❌');
console.log('message:', hint1.message);
console.log('');

console.log('========== 测试3: amount=6000 (额度不足，应发折扣券) ==========');
const hint2 = getBudgetHint(1, null, 6000);
console.log('request_amount:', hint2.request_amount, hint2.request_amount === 6000 ? '✅' : '❌');
console.log('can_issue_full:', hint2.can_issue_full, hint2.can_issue_full === false ? '✅' : '❌');
console.log('can_issue_discount:', hint2.can_issue_discount, hint2.can_issue_discount === true ? '✅' : '❌');
console.log('suggested_type:', hint2.suggested_type, hint2.suggested_type === 'discount' ? '✅' : '❌');
console.log('message:', hint2.message);
console.log('');

console.log('========== 测试4: order_amount=6000 (旧参数名兼容) ==========');
const hint3 = getBudgetHint(1, 6000, null);
console.log('request_amount:', hint3.request_amount, hint3.request_amount === 6000 ? '✅' : '❌');
console.log('can_issue_full:', hint3.can_issue_full, hint3.can_issue_full === false ? '✅' : '❌');
console.log('suggested_type:', hint3.suggested_type, hint3.suggested_type === 'discount' ? '✅' : '❌');
console.log('');

console.log('========== 测试5: 额度紧张场景 (已用4500，剩余500) ==========');
db.prepare('UPDATE monthly_quotas SET used_amount = 4500, full_coupon_used = 4500 WHERE shop_id = ? AND month = ?').run(1, dayjs().format('YYYY-MM'));
const hint4 = getBudgetHint(1, null, 1000);
console.log('request_amount=1000, 剩余500');
console.log('can_issue_full:', hint4.can_issue_full, hint4.can_issue_full === false ? '✅' : '❌');
console.log('can_issue_discount:', hint4.can_issue_discount, hint4.can_issue_discount === true ? '✅' : '❌');
console.log('suggested_type:', hint4.suggested_type, hint4.suggested_type === 'discount' ? '✅' : '❌');
console.log('message:', hint4.message);
console.log('');

console.log('========== 测试6: 额度用完场景 ==========');
db.prepare('UPDATE monthly_quotas SET used_amount = 5000 WHERE shop_id = ? AND month = ?').run(1, dayjs().format('YYYY-MM'));
const hint5 = getBudgetHint(1, null, 100);
console.log('request_amount=100, 剩余0');
console.log('can_issue_full:', hint5.can_issue_full, hint5.can_issue_full === false ? '✅' : '❌');
console.log('can_issue_discount:', hint5.can_issue_discount, hint5.can_issue_discount === false ? '✅' : '❌');
console.log('suggested_type:', hint5.suggested_type, hint5.suggested_type === null ? '✅' : '❌');
console.log('message:', hint5.message);
console.log('');

console.log('========== 测试7: amount=0 (边界值测试) ==========');
db.prepare('UPDATE monthly_quotas SET used_amount = 0, full_coupon_used = 0, discount_coupon_used = 0 WHERE shop_id = ? AND month = ?').run(1, dayjs().format('YYYY-MM'));
const hint6 = getBudgetHint(1, null, 0);
console.log('request_amount=0');
console.log('can_issue_full:', hint6.can_issue_full);
console.log('message:', hint6.message);

console.log('\n✅ 所有测试完成！');

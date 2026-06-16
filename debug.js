const http = require('http');
function api(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;
    const opts = {
      hostname: '127.0.0.1', port: 3000, path: '/api' + path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        ...(token ? { 'Authorization': 'Bearer ' + token } : {})
      }
    };
    const req = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ raw: d }); } });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  // 商户登录
  let r = await api('POST', '/auth/login', { username: 'merchant_sh001', password: '123456' });
  const mToken = r.data.token;

  // 获取订单，看真实order_no
  r = await api('GET', '/merchant/orders', null, mToken);
  console.log('订单列表:', JSON.stringify(r.data?.slice(0,3), null, 2));

  // 用第一个真实订单号发券
  const firstOrder = r.data[0];
  console.log('\n尝试发券，orderNo:', firstOrder.order_no, '金额:', firstOrder.amount);
  r = await api('POST', '/merchant/issue-coupon', {
    orderNo: firstOrder.order_no, couponType: 'hours', couponValue: 2, minAmount: 100, validHours: 48
  }, mToken);
  console.log('发券结果:', JSON.stringify(r, null, 2));

  // 顾客登录
  r = await api('POST', '/auth/login', { username: 'customer01', password: '123456' });
  const cToken = r.data.token;
  console.log('\n顾客车牌绑定:');
  r = await api('POST', '/customer/bind-plate', { plate: '京A12345' }, cToken);
  console.log('车牌绑定结果:', JSON.stringify(r, null, 2));

  console.log('\n顾客优惠券:');
  r = await api('GET', '/customer/coupons', null, cToken);
  console.log(JSON.stringify(r, null, 2));
}
main();

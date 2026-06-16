const http = require('http');
function api(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;
    const opts = {
      hostname: '127.0.0.1', port: 3000, path: '/api' + encodeURI(path), method,
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

const g = t => `\x1b[32m✅ ${t}\x1b[0m`;
const r = t => `\x1b[31m❌ ${t}\x1b[0m`;
const h = t => console.log(`\n=== ${t} ===`);

async function main() {
  // 用户登录
  const getT = async (u, p='123456') => (await api('POST','/auth/login',{username:u,password:p})).data?.token;

  h('1. 商户发券');
  const mT = await getT('merchant_sh001');
  const orders = (await api('GET','/merchant/orders',null,mT)).data || [];
  const bigOrder = orders.find(o => o.amount>=100);
  let res = await api('POST','/merchant/issue-coupon', {order_id:bigOrder.id,couponType:'hours',couponValue:2,minAmount:100,validHours:48}, mT);
  console.log('发券完整返回:', JSON.stringify(res));
  let COUPON = res.data?.coupon_no, COUPON_ID = res.data?.id;

  h('2. 一单一券校验');
  res = await api('POST','/merchant/issue-coupon', {order_id:bigOrder.id,couponType:'hours',couponValue:1,minAmount:100,validHours:48}, mT);
  console.log('完整返回:', JSON.stringify(res));
  console.log(res.code!==200 ? g('拦截成功: '+res.message) : r('未拦截'));

  h('3. 顾客+车牌绑定');
  const cT = await getT('customer01');
  res = await api('POST','/customer/bind-plate',{plate_no:'京A12345'},cT);
  console.log('绑定车牌完整返回:', JSON.stringify(res));

  h('4. 顾客优惠券');
  res = await api('GET','/customer/my-coupons',null,cT);
  console.log('coupons返回:', JSON.stringify(res).slice(0,300));
  const issued = (res.data||[]).find(c => c.status==='issued');
  if (issued) COUPON = issued.coupon_no;

  h('5. 顾客绑券');
  res = await api('POST','/customer/bind-coupon', {coupon_no:COUPON, plate_no:'京A12345'}, cT);
  console.log('绑券返回:', JSON.stringify(res));

  h('6. 未入场校验');
  res = await api('POST','/customer/bind-coupon', {coupon_no:COUPON, plate_no:'京D22222'}, cT);
  const ok = res.code!==200 && /未入场/.test(res.message||'');
  console.log(ok ? g('拦截未入场: '+res.message) : r('未拦截: '+res.message));

  h('7. 停车状态');
  res = await api('GET','/customer/parking-status',null,cT);
  console.log('停车:', JSON.stringify(res.data||[]).slice(0,200));

  h('8. 岗亭核验');
  const bT = await getT('booth_n1');
  res = await api('POST','/booth/verify-exit',{plate_no:'京A12345'},bT);
  console.log('核验返回:', JSON.stringify(res));

  h('9. 出场后撤券');
  res = await api('POST','/merchant/revoke-coupon',{coupon_id:COUPON_ID,reason:'测试'},mT);
  const rr = res.code!==200 && /出场/.test(res.message||'');
  console.log(rr ? g('拦截出场后撤: '+res.message) : r('未拦截: '+res.message+' '+JSON.stringify(res.data||{})));

  h('10. 客服全链路');
  const sT = await getT('service01');
  res = await api('GET','/service/full-trace/京A12345',null,sT);
  console.log('trace记录数:', res.data?.length);
  (res.data||[]).slice(0,6).forEach(t=>console.log(`   [${t.type}] ${t.title} @${t.time?.slice(5,16)}`));

  h('11. 看板 summary');
  res = await api('GET','/dashboard/summary');
  console.log(g('summary:'+JSON.stringify(res.data||{})));
}
main().catch(e=>console.error(e));

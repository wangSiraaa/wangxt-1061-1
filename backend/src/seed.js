const db = require('./db/index');
const { initTables } = require('./db/schema');
const { hashPassword } = require('./utils/auth');
const dayjs = require('dayjs');

function seed() {
  initTables();

  const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
  if (userCount > 0) {
    console.log('数据库已存在数据，跳过种子数据初始化');
    return;
  }

  const insertShop = db.prepare(`
    INSERT INTO shops (shop_code, shop_name, floor, contact, coupon_quota, min_amount, discount_hours)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const shops = [
    { code: 'SH001', name: '星巴克咖啡', floor: '1F', contact: '13800000001', quota: 5000, min: 68, hours: 2 },
    { code: 'SH002', name: '海底捞火锅', floor: '3F', contact: '13800000002', quota: 20000, min: 200, hours: 4 },
    { code: 'SH003', name: '优衣库', floor: '2F', contact: '13800000003', quota: 10000, min: 300, hours: 3 },
    { code: 'SH004', name: 'CGV影城', floor: '4F', contact: '13800000004', quota: 15000, min: 100, hours: 5 },
    { code: 'SH005', name: '屈臣氏', floor: '1F', contact: '13800000005', quota: 3000, min: 88, hours: 2 }
  ];

  const shopIds = {};
  shops.forEach(s => {
    const info = insertShop.run(s.code, s.name, s.floor, s.contact, s.quota, s.min, s.hours);
    shopIds[s.code] = info.lastInsertRowid;
  });

  const insertUser = db.prepare(`
    INSERT INTO users (username, password, role, name, phone, shop_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const users = [
    { un: 'admin', pw: hashPassword('admin123'), role: 'admin', name: '系统管理员', phone: '13900000000', shop: null },
    { un: 'merchant_sh001', pw: hashPassword('123456'), role: 'merchant', name: '星巴克店长', phone: '13800000001', shop: shopIds.SH001 },
    { un: 'merchant_sh002', pw: hashPassword('123456'), role: 'merchant', name: '海底捞店长', phone: '13800000002', shop: shopIds.SH002 },
    { un: 'merchant_sh003', pw: hashPassword('123456'), role: 'merchant', name: '优衣库店长', phone: '13800000003', shop: shopIds.SH003 },
    { un: 'customer01', pw: hashPassword('123456'), role: 'customer', name: '张先生', phone: '13900001001', shop: null },
    { un: 'customer02', pw: hashPassword('123456'), role: 'customer', name: '李女士', phone: '13900001002', shop: null },
    { un: 'customer03', pw: hashPassword('123456'), role: 'customer', name: '王先生', phone: '13900001003', shop: null },
    { un: 'service01', pw: hashPassword('123456'), role: 'service', name: '客服小王', phone: '13900002001', shop: null },
    { un: 'service02', pw: hashPassword('123456'), role: 'service', name: '客服小李', phone: '13900002002', shop: null },
    { un: 'booth_n1', pw: hashPassword('123456'), role: 'booth', name: '北1岗亭', phone: '13900003001', shop: null },
    { un: 'booth_s1', pw: hashPassword('123456'), role: 'booth', name: '南1岗亭', phone: '13900003002', shop: null }
  ];

  const userIds = {};
  users.forEach(u => {
    const info = insertUser.run(u.un, u.pw, u.role, u.name, u.phone, u.shop);
    userIds[u.un] = info.lastInsertRowid;
  });

  const insertPlate = db.prepare(`
    INSERT INTO vehicle_plates (plate_no, customer_id, customer_phone, is_bound, bound_time, in_park)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const plates = [
    { plate: '京A12345', customer: userIds.customer01, phone: '13900001001', bound: 1, inPark: 1, inTime: dayjs().subtract(3, 'hour') },
    { plate: '京B67890', customer: userIds.customer02, phone: '13900001002', bound: 1, inPark: 1, inTime: dayjs().subtract(1, 'hour') },
    { plate: '京C11111', customer: null, phone: null, bound: 0, inPark: 0, inTime: null },
    { plate: '京D22222', customer: userIds.customer03, phone: '13900001003', bound: 1, inPark: 0, inTime: null }
  ];

  plates.forEach(p => {
    const info = insertPlate.run(p.plate, p.customer, p.phone, p.bound, p.bound ? dayjs().subtract(7, 'day').format('YYYY-MM-DD HH:mm:ss') : null, p.inPark);
    if (p.inPark && p.inTime) {
      db.prepare(`
        INSERT INTO parking_records (plate_no, in_time, in_booth, status)
        VALUES (?, ?, ?, 'parking')
      `).run(p.plate, p.inTime.format('YYYY-MM-DD HH:mm:ss'), 'BOOTH_N1');
    }
  });

  const insertOrder = db.prepare(`
    INSERT INTO orders (order_no, shop_id, customer_phone, amount, pay_time, status, coupon_issued)
    VALUES (?, ?, ?, ?, ?, 1, 0)
  `);

  const now = dayjs();
  const orders = [
    { no: 'ORD' + now.format('YYYYMMDD') + '0001', shop: shopIds.SH001, phone: '13900001001', amount: 128, time: now.subtract(20, 'minute') },
    { no: 'ORD' + now.format('YYYYMMDD') + '0002', shop: shopIds.SH001, phone: '13900001001', amount: 58, time: now.subtract(2, 'hour') },
    { no: 'ORD' + now.format('YYYYMMDD') + '0003', shop: shopIds.SH002, phone: '13900001001', amount: 580, time: now.subtract(40, 'minute') },
    { no: 'ORD' + now.format('YYYYMMDD') + '0004', shop: shopIds.SH002, phone: '13900001002', amount: 420, time: now.subtract(30, 'minute') },
    { no: 'ORD' + now.format('YYYYMMDD') + '0005', shop: shopIds.SH003, phone: '13900001002', amount: 358, time: now.subtract(50, 'minute') },
    { no: 'ORD' + now.format('YYYYMMDD') + '0006', shop: shopIds.SH004, phone: '13900001003', amount: 260, time: now.subtract(1, 'day') },
    { no: 'ORD' + now.format('YYYYMMDD') + '0007', shop: shopIds.SH005, phone: '13900001001', amount: 156, time: now.subtract(10, 'minute') }
  ];

  orders.forEach(o => {
    insertOrder.run(o.no, o.shop, o.phone, o.amount, o.time.format('YYYY-MM-DD HH:mm:ss'));
  });

  console.log('种子数据初始化完成！');
  console.log('默认账号：');
  console.log('  管理员: admin / admin123');
  console.log('  商户(星巴克): merchant_sh001 / 123456');
  console.log('  商户(海底捞): merchant_sh002 / 123456');
  console.log('  顾客: customer01 / 123456');
  console.log('  客服: service01 / 123456');
  console.log('  岗亭(北1): booth_n1 / 123456');
  console.log('测试车牌: 京A12345(在场), 京B67890(在场)');
}

seed();
module.exports = seed;

const db = require('./index');

function initTables() {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS audit_logs;
    DROP TABLE IF EXISTS parking_records;
    DROP TABLE IF EXISTS exception_approvals;
    DROP TABLE IF EXISTS offline_records;
    DROP TABLE IF EXISTS manual_releases;
    DROP TABLE IF EXISTS booth_verifications;
    DROP TABLE IF EXISTS plate_rebinds;
    DROP TABLE IF EXISTS coupon_revocations;
    DROP TABLE IF EXISTS coupons;
    DROP TABLE IF EXISTS monthly_quotas;
    DROP TABLE IF EXISTS vehicle_plates;
    DROP TABLE IF EXISTS orders;
    DROP TABLE IF EXISTS shops;
    DROP TABLE IF EXISTS users;
    PRAGMA foreign_keys = ON;
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('merchant','customer','service','booth','admin')),
      name TEXT,
      phone TEXT,
      shop_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS shops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_code TEXT UNIQUE NOT NULL,
      shop_name TEXT NOT NULL,
      floor TEXT,
      contact TEXT,
      coupon_quota REAL DEFAULT 0,
      coupon_used REAL DEFAULT 0,
      min_amount REAL DEFAULT 0,
      discount_hours INTEGER DEFAULT 2,
      status INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT UNIQUE NOT NULL,
      shop_id INTEGER NOT NULL,
      customer_phone TEXT,
      amount REAL NOT NULL,
      pay_time DATETIME NOT NULL,
      status INTEGER DEFAULT 1,
      coupon_issued INTEGER DEFAULT 0,
      coupon_id INTEGER,
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shop_id) REFERENCES shops(id)
    );

    CREATE TABLE IF NOT EXISTS vehicle_plates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plate_no TEXT UNIQUE NOT NULL,
      customer_id INTEGER,
      customer_phone TEXT,
      is_bound INTEGER DEFAULT 0,
      bound_time DATETIME,
      last_in_time DATETIME,
      last_out_time DATETIME,
      in_park INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS monthly_quotas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER NOT NULL,
      month TEXT NOT NULL,
      quota_amount REAL NOT NULL DEFAULT 0,
      used_amount REAL NOT NULL DEFAULT 0,
      full_coupon_used REAL NOT NULL DEFAULT 0,
      discount_coupon_used REAL NOT NULL DEFAULT 0,
      status TEXT DEFAULT 'active' CHECK(status IN ('active','frozen','closed')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shop_id) REFERENCES shops(id),
      UNIQUE(shop_id, month)
    );

    CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coupon_no TEXT UNIQUE NOT NULL,
      order_id INTEGER NOT NULL,
      shop_id INTEGER NOT NULL,
      order_amount REAL NOT NULL,
      discount_hours INTEGER NOT NULL,
      discount_value REAL DEFAULT 0,
      coupon_type TEXT DEFAULT 'full' CHECK(coupon_type IN ('full','discount')),
      plate_id INTEGER,
      plate_no TEXT,
      issued_by INTEGER NOT NULL,
      issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expire_at DATETIME NOT NULL,
      bound_at DATETIME,
      verified_at DATETIME,
      status TEXT DEFAULT 'issued' CHECK(status IN ('issued','bound','verified','revoked','expired')),
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (shop_id) REFERENCES shops(id)
    );

    CREATE TABLE IF NOT EXISTS coupon_revocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coupon_id INTEGER NOT NULL,
      coupon_no TEXT NOT NULL,
      revoked_by INTEGER NOT NULL,
      revoked_by_role TEXT NOT NULL,
      revoke_reason TEXT,
      revoked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (coupon_id) REFERENCES coupons(id)
    );

    CREATE TABLE IF NOT EXISTS plate_rebinds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coupon_id INTEGER NOT NULL,
      old_plate TEXT NOT NULL,
      new_plate TEXT NOT NULL,
      rebind_by INTEGER NOT NULL,
      rebind_reason TEXT,
      rebind_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (coupon_id) REFERENCES coupons(id)
    );

    CREATE TABLE IF NOT EXISTS booth_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plate_no TEXT NOT NULL,
      booth_id TEXT NOT NULL,
      verify_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      coupon_id INTEGER,
      coupon_no TEXT,
      verify_type TEXT CHECK(verify_type IN ('coupon','manual','offline')),
      discount_hours INTEGER DEFAULT 0,
      parking_duration INTEGER DEFAULT 0,
      parking_fee REAL DEFAULT 0,
      actual_fee REAL DEFAULT 0,
      status TEXT DEFAULT 'success',
      operator_id INTEGER,
      remark TEXT
    );

    CREATE TABLE IF NOT EXISTS manual_releases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      release_no TEXT UNIQUE NOT NULL,
      plate_no TEXT NOT NULL,
      booth_id TEXT,
      release_type TEXT CHECK(release_type IN ('service','booth')),
      release_reason TEXT NOT NULL,
      coupon_id INTEGER,
      parking_duration INTEGER,
      waived_fee REAL DEFAULT 0,
      operator_id INTEGER NOT NULL,
      operator_role TEXT NOT NULL,
      operator_name TEXT,
      approved_by INTEGER,
      approved_at DATETIME,
      approve_status TEXT DEFAULT 'pending' CHECK(approve_status IN ('pending','approved','rejected')),
      approve_remark TEXT,
      released_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS offline_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_no TEXT UNIQUE NOT NULL,
      plate_no TEXT NOT NULL,
      booth_id TEXT NOT NULL,
      action_type TEXT CHECK(action_type IN ('in','out')),
      action_time DATETIME NOT NULL,
      upload_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      operator_id INTEGER,
      synced INTEGER DEFAULT 0,
      reconcile_status TEXT DEFAULT 'pending' CHECK(reconcile_status IN ('pending','matched','unmatched','skipped')),
      matched_parking_id INTEGER,
      matched_coupon_id INTEGER,
      matched_order_id INTEGER,
      reconcile_remark TEXT,
      reconcile_at DATETIME,
      remark TEXT
    );

    CREATE TABLE IF NOT EXISTS exception_approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      approval_no TEXT UNIQUE NOT NULL,
      exception_type TEXT NOT NULL,
      related_id INTEGER,
      plate_no TEXT,
      applicant_id INTEGER NOT NULL,
      applicant_role TEXT NOT NULL,
      reason TEXT NOT NULL,
      approve_status TEXT DEFAULT 'pending' CHECK(approve_status IN ('pending','approved','rejected')),
      approver_id INTEGER,
      approver_role TEXT,
      approve_remark TEXT,
      approved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS parking_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plate_no TEXT NOT NULL,
      in_time DATETIME NOT NULL,
      out_time DATETIME,
      in_booth TEXT,
      out_booth TEXT,
      duration INTEGER,
      total_fee REAL DEFAULT 0,
      discount_fee REAL DEFAULT 0,
      paid_fee REAL DEFAULT 0,
      status TEXT DEFAULT 'parking' CHECK(status IN ('parking','exited','exception')),
      coupon_id INTEGER,
      release_id INTEGER,
      exit_type TEXT CHECK(exit_type IN ('normal','offline_retro','manual_release','exception')),
      offline_record_id INTEGER,
      retro_verified INTEGER DEFAULT 0,
      retro_coupon_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_role TEXT,
      action TEXT NOT NULL,
      module TEXT NOT NULL,
      target_id INTEGER,
      target_type TEXT,
      before_data TEXT,
      after_data TEXT,
      ip TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_coupons_order ON coupons(order_id);
    CREATE INDEX IF NOT EXISTS idx_coupons_plate ON coupons(plate_no);
    CREATE INDEX IF NOT EXISTS idx_coupons_status ON coupons(status);
    CREATE INDEX IF NOT EXISTS idx_coupons_expire ON coupons(expire_at);
    CREATE INDEX IF NOT EXISTS idx_coupons_type ON coupons(coupon_type);
    CREATE INDEX IF NOT EXISTS idx_orders_shop ON orders(shop_id);
    CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(customer_phone);
    CREATE INDEX IF NOT EXISTS idx_parking_plate ON parking_records(plate_no, status);
    CREATE INDEX IF NOT EXISTS idx_parking_exit_type ON parking_records(exit_type);
    CREATE INDEX IF NOT EXISTS idx_release_status ON manual_releases(approve_status);
    CREATE INDEX IF NOT EXISTS idx_monthly_quotas_shop_month ON monthly_quotas(shop_id, month);
    CREATE INDEX IF NOT EXISTS idx_offline_reconcile ON offline_records(reconcile_status);
    CREATE INDEX IF NOT EXISTS idx_offline_plate_time ON offline_records(plate_no, action_time);
  `);

  return true;
}

module.exports = { initTables };

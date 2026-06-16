const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/parking.db');

const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

const _prepare = db.prepare.bind(db);

db.prepare = function(sql) {
  const stmt = _prepare(sql);
  return {
    run(...args) {
      try {
        return stmt.run(...args);
      } catch (e) {
        console.error('SQL Error:', e.message, '\nSQL:', sql, '\nArgs:', args);
        throw e;
      }
    },
    get(...args) { return stmt.get(...args); },
    all(...args) { return stmt.all(...args); },
    *iterate(...args) { yield* stmt.iterate(...args); }
  };
};

db.transaction = function(fn) {
  return function(...args) {
    db.exec('BEGIN');
    try {
      const result = fn.apply(this, args);
      db.exec('COMMIT');
      return result;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };
};

module.exports = db;

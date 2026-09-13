/**
 * 数据库层 —— 基于 sql.js（SQLite WASM 版，纯 JS 无需原生编译）
 * 提供与 better-sqlite3 类似的同步 API：prepare/run/get/all、exec、transaction
 * 数据在每次写操作后持久化到 mro.db 文件
 */
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'mro.db');
const WASM_DIR = path.join(__dirname, 'node_modules', 'sql.js', 'dist');

let real = null; // 初始化完成后的 Database 实例

class Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
  }

  _bind(stmt, params) {
    // sql.js 不接受 undefined，统一转 null
    stmt.bind(params.map((p) => (p === undefined ? null : p)));
  }

  run(...params) {
    const stmt = this.db._db.prepare(this.sql);
    try {
      this._bind(stmt, params);
      stmt.step();
      const rowid = this.db._db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0];
      this.db._persist();
      return { changes: this.db._db.getRowsModified(), lastInsertRowid: rowid };
    } finally {
      stmt.free();
    }
  }

  get(...params) {
    const stmt = this.db._db.prepare(this.sql);
    try {
      this._bind(stmt, params);
      return stmt.step() ? stmt.getAsObject() : undefined;
    } finally {
      stmt.free();
    }
  }

  all(...params) {
    const stmt = this.db._db.prepare(this.sql);
    try {
      this._bind(stmt, params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }
}

class Database {
  constructor(sqlDb) {
    this._db = sqlDb;
    this._txnDepth = 0;
  }

  exec(sql) {
    this._db.exec(sql);
    this._persist();
  }

  prepare(sql) {
    return new Statement(this, sql);
  }

  pragma() { /* sql.js 内存模式无需 journal/WAL 设置 */ }

  transaction(fn) {
    return (...args) => {
      const outermost = this._txnDepth === 0;
      if (outermost) this._db.exec('BEGIN');
      this._txnDepth++;
      try {
        const result = fn(...args);
        this._txnDepth--;
        if (outermost) {
          this._db.exec('COMMIT');
          this._persist();
        }
        return result;
      } catch (err) {
        this._txnDepth--;
        if (outermost) this._db.exec('ROLLBACK');
        throw err;
      }
    };
  }

  _persist() {
    if (this._txnDepth > 0) return; // 事务提交时统一落盘
    fs.writeFileSync(DB_PATH, Buffer.from(this._db.export()));
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS aircraft (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration TEXT NOT NULL UNIQUE,        -- 注册号 B-XXXX
  model TEXT NOT NULL,                      -- 机型
  msn TEXT NOT NULL,                        -- 制造商序列号
  airline TEXT NOT NULL DEFAULT '祥云航空',
  manufacture_date TEXT,
  delivery_date TEXT,
  total_flight_hours REAL DEFAULT 0,        -- 总飞行小时
  total_cycles INTEGER DEFAULT 0,           -- 总起落循环
  status TEXT NOT NULL DEFAULT '在役',       -- 在役 / 停场维修 / 定检中
  next_check_type TEXT,                     -- 下次定检级别
  next_check_date TEXT,
  base TEXT DEFAULT 'PEK'                   -- 主基地
);

CREATE TABLE IF NOT EXISTS technicians (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_no TEXT NOT NULL UNIQUE,         -- 工号
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '机械员',       -- 机械员 / 技术员 / 放行人员 / 检验员
  license_no TEXT,                          -- 维修执照号
  quals TEXT DEFAULT '',                    -- 机型签署，逗号分隔
  phone TEXT
);

CREATE TABLE IF NOT EXISTS work_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_no TEXT NOT NULL UNIQUE,             -- 工卡号 WC-2026-XXXX
  aircraft_id INTEGER NOT NULL REFERENCES aircraft(id),
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT '航线维修',     -- 航线维修 / 定检 / 时控件更换 / 故障排除 / 改装
  priority TEXT NOT NULL DEFAULT '正常',     -- 正常 / 加急 / AOG
  status TEXT NOT NULL DEFAULT '待派工',
    -- 待派工 -> 进行中 -> 待放行 -> 已放行
    --              ↕ 缺件挂起
  description TEXT DEFAULT '',
  created_by TEXT,
  assigned_to INTEGER REFERENCES technicians(id),
  planned_start TEXT,
  due_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS work_card_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_card_id INTEGER NOT NULL REFERENCES work_cards(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,                     -- 步骤序号
  content TEXT NOT NULL,                    -- 步骤内容
  standard TEXT DEFAULT '',                 -- 标准/依据
  status TEXT NOT NULL DEFAULT '待执行',     -- 待执行 / 已签署
  signed_by INTEGER REFERENCES technicians(id),
  signed_at TEXT
);

CREATE TABLE IF NOT EXISTS parts_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_card_id INTEGER NOT NULL REFERENCES work_cards(id) ON DELETE CASCADE,
  part_no TEXT NOT NULL,                    -- 件号
  part_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT '待航材',     -- 待航材 / 已到货
  requested_by TEXT,
  requested_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  arrived_at TEXT
);

CREATE TABLE IF NOT EXISTS release_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_card_id INTEGER NOT NULL UNIQUE REFERENCES work_cards(id),
  released_by INTEGER NOT NULL REFERENCES technicians(id),
  released_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  remarks TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS work_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_card_id INTEGER NOT NULL REFERENCES work_cards(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
`;

async function initDb() {
  if (real) return;
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(WASM_DIR, file),
  });
  const existing = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : null;
  real = new Database(existing ? new SQL.Database(existing) : new SQL.Database());
  real._db.exec('PRAGMA foreign_keys = ON');
  real._db.exec(SCHEMA);
  real._persist();
}

// 门面对象：路由层在 require 时即可拿到，调用时委托给已初始化的实例
const db = {
  prepare: (...args) => real.prepare(...args),
  exec: (...args) => real.exec(...args),
  transaction: (...args) => real.transaction(...args),
  pragma: () => {},
};

function addLog(workCardId, actor, action, detail = '') {
  db.prepare(
    'INSERT INTO work_logs (work_card_id, actor, action, detail) VALUES (?, ?, ?, ?)'
  ).run(workCardId, actor, action, detail);
}

module.exports = { db, addLog, initDb };

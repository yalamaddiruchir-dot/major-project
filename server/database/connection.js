const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const logger = require('../utils/logger');

dotenv.config({ path: path.join(__dirname, '../.env') });

const resolveConfiguredDbPath = (overridePath) => {
  const raw = overridePath || process.env.DB_PATH;
  if (!raw) return path.join(__dirname, 'digital_learning.sqlite');
  if (raw === ':memory:') return ':memory:';
  return path.isAbsolute(raw) ? raw : path.resolve(__dirname, '..', raw);
};

const normalizeParam = (value) => {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
};

const toPlainRow = (row) => (row ? { ...row } : null);

/**
 * Convert PostgreSQL-style $1, $2 placeholders to positional '?' placeholders
 * while ignoring $digits inside single-quoted or double-quoted SQL literals.
 */
const prepareSqlAndParams = (sql, params = []) => {
  const statement = String(sql).trim();
  const hasNumberedPlaceholders = /\$\d+/.test(statement);
  if (!hasNumberedPlaceholders) {
    return {
      executableSql: statement,
      values: params.map(normalizeParam),
    };
  }

  const boundParams = [];
  const executableSql = statement.replace(
    /'(?:''|[^'])*'|"(?:""|[^"])*"|\$(\d+)/g,
    (match, number) => {
      if (!number) return match;
      const index = Number(number) - 1;
      if (index < 0 || index >= params.length) {
        throw new Error(`Missing SQL parameter $${number}`);
      }
      boundParams.push(normalizeParam(params[index]));
      return '?';
    }
  );

  return { executableSql, values: boundParams };
};

const PRAGMA_INIT_SQL = `
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
`;

let activeDbPath = resolveConfiguredDbPath();
let rawHandle = null;
let driverType = null;
let isClosed = true;
let wasmInitPromise = null;
let inTransactionDepth = 0;

const persistWasmToDisk = () => {
  if (driverType !== 'sql.js' || !rawHandle || activeDbPath === ':memory:' || inTransactionDepth > 0) {
    return;
  }
  const binary = Buffer.from(rawHandle.export());
  const tmpFile = `${activeDbPath}.tmp-${process.pid}`;
  fs.writeFileSync(tmpFile, binary);
  fs.renameSync(tmpFile, activeDbPath);
};

const createDriver = async (targetPath, forceWasm = false) => {
  if (targetPath !== ':memory:') {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  }

  if (!forceWasm && process.env.FORCE_SQLJS_DRIVER !== 'true') {
    let nodeSqlite = null;
    try {
      nodeSqlite = require('node:sqlite');
    } catch (_err) {
      nodeSqlite = null;
    }

    if (nodeSqlite && nodeSqlite.DatabaseSync) {
      const instance = new nodeSqlite.DatabaseSync(targetPath);
      instance.exec(PRAGMA_INIT_SQL);
      driverType = 'node:sqlite';
      rawHandle = instance;
      isClosed = false;
      if (process.env.NODE_ENV !== 'test') {
        logger.info(`Connected to SQLite database (${driverType}): ${targetPath}`);
      }
      return;
    }

    try {
      // Fallback 2: native sqlite3 addon if installed on Node 18/20
      // eslint-disable-next-line global-require, import/no-unresolved
      const sqlite3 = require('sqlite3').verbose();
      const instance = new sqlite3.Database(targetPath);
      instance.exec(PRAGMA_INIT_SQL);
      driverType = 'sqlite3';
      rawHandle = instance;
      isClosed = false;
      if (process.env.NODE_ENV !== 'test') {
        logger.info(`Connected to SQLite database (${driverType}): ${targetPath}`);
      }
      return;
    } catch (_sqliteErr) {
      // Proceed to universal pure-WASM sql.js fallback
    }
  }

  // Fallback 3: Universal pure-WebAssembly sql.js (works on Node 16/18/20/22+ with zero C++ toolchain)
  // eslint-disable-next-line global-require
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const existingBytes = targetPath !== ':memory:' && fs.existsSync(targetPath)
    ? fs.readFileSync(targetPath)
    : undefined;
  const instance = existingBytes && existingBytes.length > 0
    ? new SQL.Database(existingBytes)
    : new SQL.Database();
  instance.run('PRAGMA foreign_keys = ON;');
  driverType = 'sql.js';
  rawHandle = instance;
  isClosed = false;
  if (targetPath !== ':memory:' && (!existingBytes || existingBytes.length === 0)) {
    persistWasmToDisk();
  }
  if (process.env.NODE_ENV !== 'test') {
    logger.info(`Connected to SQLite database (${driverType} WASM): ${targetPath}`);
  }
};

const ensureOpen = async () => {
  if (rawHandle && !isClosed) return;
  if (!wasmInitPromise) {
    activeDbPath = resolveConfiguredDbPath();
    wasmInitPromise = createDriver(activeDbPath).finally(() => {
      wasmInitPromise = null;
    });
  }
  await wasmInitPromise;
};

// Trigger eager initialization
ensureOpen().catch(() => {});

const executeRaw = async (sql, params = []) => {
  try {
    await ensureOpen();
    const startedAt = Date.now();
    const { executableSql, values } = prepareSqlAndParams(sql, params);
    const returnsRows = /\bRETURNING\b/i.test(executableSql)
      || /^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(executableSql);

    if (driverType === 'node:sqlite') {
      const stmt = rawHandle.prepare(executableSql);
      if (returnsRows) {
        const rawRows = stmt.all(...values);
        const rows = (rawRows || []).map(toPlainRow);
        return {
          rows,
          rowCount: rows.length,
          duration: Date.now() - startedAt,
        };
      }
      const info = stmt.run(...values);
      const changes = Number(info.changes || 0);
      const lastID = Number(info.lastInsertRowid || 0);
      return {
        rows: [],
        rowCount: changes,
        rowsAffected: changes,
        lastID,
        duration: Date.now() - startedAt,
      };
    }

    if (driverType === 'sql.js') {
      const stmt = rawHandle.prepare(executableSql);
      try {
        if (values.length > 0) stmt.bind(values);
        if (returnsRows) {
          const rows = [];
          while (stmt.step()) {
            rows.push(toPlainRow(stmt.getAsObject()));
          }
          if (!/^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(executableSql)) {
            persistWasmToDisk();
          }
          return {
            rows,
            rowCount: rows.length,
            duration: Date.now() - startedAt,
          };
        }
        stmt.step();
      } finally {
        stmt.free();
      }
      const changes = Number(rawHandle.getRowsModified() || 0);
      const idRes = rawHandle.exec('SELECT last_insert_rowid() AS id');
      const lastID = Number(idRes?.[0]?.values?.[0]?.[0] || 0);
      persistWasmToDisk();
      return {
        rows: [],
        rowCount: changes,
        rowsAffected: changes,
        lastID,
        duration: Date.now() - startedAt,
      };
    }

    // sqlite3 callback driver
    return await new Promise((resolve, reject) => {
      if (returnsRows) {
        rawHandle.all(executableSql, values, (error, rows) => {
          if (error) return reject(error);
          const plain = (rows || []).map(toPlainRow);
          return resolve({
            rows: plain,
            rowCount: plain.length,
            duration: Date.now() - startedAt,
          });
        });
        return;
      }

      rawHandle.run(executableSql, values, function onRun(error) {
        if (error) return reject(error);
        return resolve({
          rows: [],
          rowCount: this.changes,
          rowsAffected: this.changes,
          lastID: this.lastID,
          duration: Date.now() - startedAt,
        });
      });
    });
  } catch (error) {
    logger.error('SQLite query error', { error: error.message, sql: String(sql).slice(0, 200) });
    throw error;
  }
};

const execMultiStatement = async (sqlBlock) => {
  await ensureOpen();
  if (driverType === 'node:sqlite') {
    rawHandle.exec(String(sqlBlock));
    return;
  }
  if (driverType === 'sql.js') {
    rawHandle.exec(String(sqlBlock));
    persistWasmToDisk();
    return;
  }
  await new Promise((resolve, reject) => {
    rawHandle.exec(String(sqlBlock), (err) => (err ? reject(err) : resolve()));
  });
};

// Mutex queue so async transactions never interleave on the shared SQLite connection
let txQueue = Promise.resolve();

const query = (sql, params = []) => executeRaw(sql, params);

const get = async (sql, params = []) => {
  const res = await executeRaw(sql, params);
  return res.rows[0] || null;
};

const transaction = (workFn) => {
  const runTx = async () => {
    await ensureOpen();
    inTransactionDepth += 1;
    await execMultiStatement(driverType === 'sql.js' ? 'BEGIN TRANSACTION;' : 'BEGIN IMMEDIATE;');
    const txClient = {
      query: (sql, params = []) => executeRaw(sql, params),
      get: async (sql, params = []) => {
        const res = await executeRaw(sql, params);
        return res.rows[0] || null;
      },
      exec: (sqlBlock) => execMultiStatement(sqlBlock),
    };
    try {
      const result = await workFn(txClient);
      inTransactionDepth = Math.max(0, inTransactionDepth - 1);
      await execMultiStatement('COMMIT;');
      persistWasmToDisk();
      return result;
    } catch (error) {
      inTransactionDepth = Math.max(0, inTransactionDepth - 1);
      try {
        await execMultiStatement('ROLLBACK;');
      } catch (_rollbackErr) {
        // Ignore rollback error if SQLite already rolled back automatically
      }
      throw error;
    }
  };

  const chained = txQueue.then(runTx, runTx);
  txQueue = chained.catch(() => {});
  return chained;
};

const close = () => new Promise((resolve) => {
  if (!rawHandle || isClosed) {
    isClosed = true;
    resolve();
    return;
  }
  try {
    if (driverType === 'node:sqlite') {
      try {
        if (activeDbPath !== ':memory:') {
          rawHandle.exec('PRAGMA wal_checkpoint(TRUNCATE);');
        }
      } catch (_err) {
        // Ignore checkpoint warning when read-only or busy
      }
      rawHandle.close();
      isClosed = true;
      resolve();
      return;
    }
    if (driverType === 'sql.js') {
      persistWasmToDisk();
      rawHandle.close();
      isClosed = true;
      resolve();
      return;
    }
    rawHandle.close(() => {
      isClosed = true;
      resolve();
    });
  } catch (_err) {
    isClosed = true;
    resolve();
  }
});

const reopen = async (overridePath, options = {}) => {
  await close();
  activeDbPath = resolveConfiguredDbPath(overridePath);
  await createDriver(activeDbPath, Boolean(options.forceWasm));
};

const getDbPath = () => activeDbPath;
const getDriverType = () => driverType;

// Compatibility wrapper for legacy scripts using db.db.run/get/all/exec/close
const compatDb = {
  exec(sql, cb) {
    execMultiStatement(sql)
      .then(() => cb && cb(null))
      .catch((err) => {
        if (cb) cb(err);
        else throw err;
      });
  },
  run(sql, params, cb) {
    const callback = typeof params === 'function' ? params : cb;
    const bindParams = Array.isArray(params) ? params : [];
    executeRaw(sql, bindParams)
      .then((res) => callback && callback.call({ lastID: res.lastID, changes: res.rowCount }, null))
      .catch((err) => callback && callback(err));
  },
  get(sql, params, cb) {
    const callback = typeof params === 'function' ? params : cb;
    const bindParams = Array.isArray(params) ? params : [];
    get(sql, bindParams)
      .then((row) => callback && callback(null, row))
      .catch((err) => callback && callback(err));
  },
  all(sql, params, cb) {
    const callback = typeof params === 'function' ? params : cb;
    const bindParams = Array.isArray(params) ? params : [];
    executeRaw(sql, bindParams)
      .then((res) => callback && callback(null, res.rows))
      .catch((err) => callback && callback(err));
  },
  close(cb) {
    close().then(() => cb && cb(null));
  },
};

module.exports = {
  query,
  get,
  exec: execMultiStatement,
  transaction,
  close,
  reopen,
  getDbPath,
  getDriverType,
  prepareSqlAndParams,
  db: compatDb,
};

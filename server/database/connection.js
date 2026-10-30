const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const dbPath = process.env.DB_PATH
  ? path.resolve(__dirname, '..', process.env.DB_PATH)
  : path.join(__dirname, 'digital_learning.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error(`Error opening database ${dbPath}:`, err.message);
  } else {
    console.log(`Connected to SQLite database: ${dbPath}`);
    db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;', (pragmaError) => {
      if (pragmaError) console.error('SQLite configuration failed:', pragmaError.message);
    });
  }
});

/**
 * Promise-based SQLite adapter used by the API routes.
 * API routes use PostgreSQL-style numbered placeholders. Convert each numbered
 * placeholder to a positional '?' and expand the values in occurrence order,
 * so repeated placeholders such as '$1 OR email = $1' bind correctly in sqlite3.
 */
const query = (sql, params = []) => new Promise((resolve, reject) => {
  const statement = String(sql).trim();
  const startedAt = Date.now();
  const boundParams = [];
  const hasNumberedPlaceholders = /\$\d+/.test(statement);
  const executableSql = hasNumberedPlaceholders
    ? statement.replace(/\$(\d+)/g, (_match, number) => {
        const index = Number(number) - 1;
        if (index < 0 || index >= params.length) throw new Error(`Missing SQL parameter $${number}`);
        boundParams.push(params[index]);
        return '?';
      })
    : statement;
  const values = hasNumberedPlaceholders ? boundParams : params;
  const returnsRows = /\bRETURNING\b/i.test(executableSql)
    || /^(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(executableSql);

  if (returnsRows) {
    db.all(executableSql, values, (error, rows) => {
      if (error) {
        console.error('SQLite query error:', error.message, { sql: statement });
        return reject(error);
      }
      resolve({ rows: rows || [], rowCount: (rows || []).length, duration: Date.now() - startedAt });
    });
    return;
  }

  db.run(executableSql, values, function onRun(error) {
    if (error) {
      console.error('SQLite query error:', error.message, { sql: statement });
      return reject(error);
    }
    resolve({ rows: [], rowCount: this.changes, rowsAffected: this.changes, lastID: this.lastID, duration: Date.now() - startedAt });
  });
});

const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null));
});

module.exports = { query, get, db };

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../database/connection');
const { runMigrations } = require('../database/migrate');
const logger = require('./logger');

const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'utf8');
const SAFE_BACKUP_NAME_RE = /^[A-Za-z0-9._-]+\.sqlite$/;

const getBackupDir = () => {
  const dir = process.env.BACKUP_DIR
    ? path.resolve(process.env.BACKUP_DIR)
    : path.join(__dirname, '../backups');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
};

const resolveSafeBackupPath = (filename) => {
  const cleanName = String(filename || '').trim();
  if (!SAFE_BACKUP_NAME_RE.test(cleanName) || cleanName.includes('..')) {
    throw new Error('Invalid backup filename.');
  }
  const backupDir = getBackupDir();
  const fullPath = path.resolve(backupDir, cleanName);
  if (!fullPath.startsWith(backupDir + path.sep)) {
    throw new Error('Backup path traversal blocked.');
  }
  return fullPath;
};

const computeFileSha256 = (filePath) => {
  const hash = crypto.createHash('sha256');
  const buffer = fs.readFileSync(filePath);
  hash.update(buffer);
  return hash.digest('hex');
};

const inspectSqliteBackupFile = async (filePath) => {
  try {
    const { DatabaseSync } = require('node:sqlite');
    const inspectDb = new DatabaseSync(filePath, { readOnly: true });
    try {
      const integrity = inspectDb.prepare('PRAGMA integrity_check').get();
      const fkIssues = inspectDb.prepare('PRAGMA foreign_key_check').all();
      const tables = inspectDb
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((r) => r.name);
      return {
        integrityOk: Boolean(integrity && integrity.integrity_check === 'ok'),
        fkCount: fkIssues ? fkIssues.length : 0,
        tables,
      };
    } finally {
      inspectDb.close();
    }
  } catch (_nodeSqliteUnavailable) {
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    const inspectDb = new SQL.Database(fs.readFileSync(filePath));
    try {
      const integrityRes = inspectDb.exec('PRAGMA integrity_check');
      const integrityVal = integrityRes?.[0]?.values?.[0]?.[0];
      const fkRes = inspectDb.exec('PRAGMA foreign_key_check');
      const fkCount = fkRes?.[0]?.values?.length || 0;
      const tblRes = inspectDb.exec("SELECT name FROM sqlite_master WHERE type = 'table'");
      const tables = (tblRes?.[0]?.values || []).map((row) => row[0]);
      return {
        integrityOk: integrityVal === 'ok',
        fkCount,
        tables,
      };
    } finally {
      inspectDb.close();
    }
  }
};

const validateBackup = async (filenameOrPath) => {
  const backupDir = getBackupDir();
  const targetPath = path.isAbsolute(filenameOrPath) && filenameOrPath.startsWith(backupDir + path.sep)
    ? filenameOrPath
    : resolveSafeBackupPath(filenameOrPath);

  if (!fs.existsSync(targetPath)) {
    return { valid: false, reason: 'Backup file does not exist.' };
  }

  const stat = fs.statSync(targetPath);
  if (stat.size < 4096) {
    return { valid: false, reason: 'Backup file is truncated or empty.' };
  }

  const fd = fs.openSync(targetPath, 'r');
  const header = Buffer.alloc(16);
  try {
    fs.readSync(fd, header, 0, 16, 0);
  } finally {
    fs.closeSync(fd);
  }

  if (!header.equals(SQLITE_MAGIC)) {
    return { valid: false, reason: 'Invalid SQLite file header.' };
  }

  const metaPath = `${targetPath}.meta.json`;
  const actualSha256 = computeFileSha256(targetPath);
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (meta.sha256 && meta.sha256 !== actualSha256) {
        return { valid: false, reason: 'Backup SHA-256 checksum mismatch.' };
      }
    } catch (_err) {
      return { valid: false, reason: 'Corrupted backup metadata file.' };
    }
  }

  try {
    const { integrityOk, fkCount, tables } = await inspectSqliteBackupFile(targetPath);
    if (!integrityOk) {
      return { valid: false, reason: 'SQLite integrity_check failed.' };
    }
    if (fkCount > 0) {
      return { valid: false, reason: `Foreign key violations detected (${fkCount}).` };
    }
    const required = ['users', 'courses', 'lessons', 'enrollments', 'user_progress'];
    for (const reqTable of required) {
      if (!tables.includes(reqTable)) {
        return { valid: false, reason: `Missing required table: ${reqTable}` };
      }
    }
    return {
      valid: true,
      filename: path.basename(targetPath),
      sizeBytes: stat.size,
      sha256: actualSha256,
      tableCount: tables.length,
    };
  } catch (error) {
    return { valid: false, reason: `SQLite inspection failed: ${error.message}` };
  }
};

const createBackup = async ({ label = 'manual' } = {}) => {
  const safeLabel = String(label || 'manual').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24) || 'manual';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const idSuffix = crypto.randomBytes(3).toString('hex');
  const filename = `backup-${safeLabel}-${stamp}-${idSuffix}.sqlite`;
  const targetPath = resolveSafeBackupPath(filename);

  if (db.getDriverType && db.getDriverType() === 'sql.js') {
    await db.query('SELECT 1');
    fs.copyFileSync(db.getDbPath(), targetPath);
  } else {
    // Escape single quotes in path for VACUUM INTO
    const escapedPath = targetPath.replace(/'/g, "''");
    await db.query(`VACUUM INTO '${escapedPath}'`);
  }
  fs.chmodSync(targetPath, 0o600);

  const sha256 = computeFileSha256(targetPath);
  const stat = fs.statSync(targetPath);

  const counts = {};
  for (const tbl of ['users', 'courses', 'lessons', 'enrollments', 'user_progress']) {
    const row = await db.get(`SELECT COUNT(*) AS count FROM ${tbl}`);
    counts[tbl] = Number(row?.count || 0);
  }

  const metadata = {
    filename,
    label: safeLabel,
    createdAt: new Date().toISOString(),
    sizeBytes: stat.size,
    sha256,
    recordCounts: counts,
  };
  fs.writeFileSync(`${targetPath}.meta.json`, JSON.stringify(metadata, null, 2), { mode: 0o600 });

  const validation = await validateBackup(targetPath);
  if (!validation.valid) {
    fs.unlinkSync(targetPath);
    if (fs.existsSync(`${targetPath}.meta.json`)) fs.unlinkSync(`${targetPath}.meta.json`);
    throw new Error(`Created backup failed verification: ${validation.reason}`);
  }

  logger.info('Database backup created and verified', { filename, sizeBytes: stat.size });
  return metadata;
};

const listBackups = async () => {
  const backupDir = getBackupDir();
  const entries = fs.readdirSync(backupDir).filter((name) => SAFE_BACKUP_NAME_RE.test(name));
  const items = [];
  for (const filename of entries) {
    const fullPath = path.join(backupDir, filename);
    const stat = fs.statSync(fullPath);
    let meta = {};
    const metaPath = `${fullPath}.meta.json`;
    if (fs.existsSync(metaPath)) {
      try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch (_err) { meta = {}; }
    }
    items.push({
      filename,
      label: meta.label || 'backup',
      createdAt: meta.createdAt || stat.mtime.toISOString(),
      sizeBytes: stat.size,
      sha256: meta.sha256 || null,
      recordCounts: meta.recordCounts || null,
    });
  }
  items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return items;
};

const restoreBackup = async (filename) => {
  const sourcePath = resolveSafeBackupPath(filename);
  const validation = await validateBackup(sourcePath);
  if (!validation.valid) {
    throw new Error(`Cannot restore invalid backup: ${validation.reason}`);
  }

  const liveDbPath = db.getDbPath();
  if (liveDbPath === ':memory:') {
    throw new Error('Cannot restore file backup onto an in-memory database.');
  }

  // Create pre-restore safety backup if live DB exists and is non-empty
  let safetySnapshot = null;
  if (fs.existsSync(liveDbPath) && fs.statSync(liveDbPath).size >= 4096) {
    try {
      safetySnapshot = await createBackup({ label: 'pre-restore' });
    } catch (_err) {
      // Proceed if live DB itself was damaged and needs recovery
    }
  }

  await db.close();

  try {
    for (const suffix of ['-wal', '-shm']) {
      if (fs.existsSync(`${liveDbPath}${suffix}`)) {
        fs.unlinkSync(`${liveDbPath}${suffix}`);
      }
    }
    fs.copyFileSync(sourcePath, liveDbPath);
    fs.chmodSync(liveDbPath, 0o600);
    await db.reopen(liveDbPath);
    await runMigrations({ includeBootstrap: false });
    logger.security('Database restored from backup', {
      restoredFrom: filename,
      safetySnapshot: safetySnapshot?.filename || null,
    });
    return {
      restoredFrom: filename,
      safetySnapshot: safetySnapshot?.filename || null,
      restoredAt: new Date().toISOString(),
    };
  } catch (error) {
    // Attempt automatic rollback from safety snapshot
    if (safetySnapshot) {
      const safetyPath = resolveSafeBackupPath(safetySnapshot.filename);
      if (fs.existsSync(safetyPath)) {
        fs.copyFileSync(safetyPath, liveDbPath);
      }
    }
    await db.reopen(liveDbPath);
    throw error;
  }
};

module.exports = {
  getBackupDir,
  resolveSafeBackupPath,
  createBackup,
  validateBackup,
  listBackups,
  restoreBackup,
};

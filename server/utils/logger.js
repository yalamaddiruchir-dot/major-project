const fs = require('fs');
const path = require('path');

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'current_password',
  'new_password',
  'confirmPassword',
  'token',
  'authorization',
  'x-auth-token',
  'x-access-token',
  'jwt_secret',
  'cookie',
]);

const redactObject = (input, depth = 0) => {
  if (depth > 4 || input === null || input === undefined) return input;
  if (Array.isArray(input)) return input.map((item) => redactObject(item, depth + 1));
  if (typeof input === 'object') {
    const clean = {};
    for (const [key, value] of Object.entries(input)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        clean[key] = '[REDACTED]';
      } else {
        clean[key] = redactObject(value, depth + 1);
      }
    }
    return clean;
  }
  return input;
};

const getLogDir = () => {
  if (process.env.LOG_DIR) return path.resolve(process.env.LOG_DIR);
  return path.join(__dirname, '../logs');
};

const writeLogLine = (filename, entry) => {
  if (process.env.NODE_ENV === 'test' && process.env.ENABLE_TEST_FILE_LOGS !== 'true') {
    return;
  }
  try {
    const dir = getLogDir();
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const filePath = path.join(dir, filename);
    fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  } catch (_err) {
    // Avoid crashing application if log disk is read-only
  }
};

const formatEntry = (level, message, meta = {}) => ({
  timestamp: new Date().toISOString(),
  level,
  message: String(message),
  ...(Object.keys(meta).length > 0 ? { meta: redactObject(meta) } : {}),
});

const logger = {
  info(message, meta = {}) {
    const entry = formatEntry('INFO', message, meta);
    writeLogLine('app.log', entry);
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[${entry.timestamp}] INFO: ${entry.message}`);
    }
  },
  warn(message, meta = {}) {
    const entry = formatEntry('WARN', message, meta);
    writeLogLine('app.log', entry);
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`[${entry.timestamp}] WARN: ${entry.message}`);
    }
  },
  error(message, meta = {}) {
    const entry = formatEntry('ERROR', message, meta);
    writeLogLine('app.log', entry);
    writeLogLine('error.log', entry);
    if (process.env.NODE_ENV !== 'test') {
      console.error(`[${entry.timestamp}] ERROR: ${entry.message}`);
    }
  },
  security(event, meta = {}) {
    const entry = formatEntry('SECURITY', event, meta);
    writeLogLine('app.log', entry);
    writeLogLine('security.log', entry);
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`[${entry.timestamp}] SECURITY: ${entry.message}`);
    }
  },
  redactObject,
};

module.exports = logger;

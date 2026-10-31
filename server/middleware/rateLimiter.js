const rateLimit = require('express-rate-limit');

const buildLimiter = ({ windowMs, defaultMax, envMaxKey, message }) => rateLimit({
  windowMs,
  limit: () => {
    const configured = Number(process.env[envMaxKey]);
    return Number.isFinite(configured) && configured > 0 ? configured : defaultMax;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message },
});

const authLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  defaultMax: 25,
  envMaxKey: 'RATE_LIMIT_AUTH_MAX',
  message: 'Too many authentication attempts. Please wait 15 minutes before trying again.',
});

const uploadLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  defaultMax: 40,
  envMaxKey: 'RATE_LIMIT_UPLOAD_MAX',
  message: 'Too many file uploads. Please wait before uploading more files.',
});

const apiLimiter = buildLimiter({
  windowMs: 60 * 1000,
  defaultMax: 300,
  envMaxKey: 'RATE_LIMIT_API_MAX',
  message: 'Too many requests. Please slow down and try again shortly.',
});

module.exports = { authLimiter, uploadLimiter, apiLimiter };

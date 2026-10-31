const jwt = require('jsonwebtoken');
const db = require('../database/connection');

const verifyTokenAndLoadUser = async (token) => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    const err = new Error('Authentication is not configured');
    err.status = 503;
    throw err;
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET, {
    algorithms: ['HS256'],
  });

  if (decoded.jti) {
    const revoked = await db.get(
      'SELECT jti FROM revoked_tokens WHERE jti = $1',
      [decoded.jti]
    );
    if (revoked) {
      const err = new Error('Token has been revoked');
      err.status = 401;
      throw err;
    }
  }

  const user = await db.get(
    `SELECT id, username, email, full_name, role, school_name, class_grade,
            preferred_language, low_bandwidth_mode, is_active, token_version, created_at
     FROM users WHERE id = $1`,
    [decoded.userId]
  );

  if (!user) {
    const err = new Error('User not found');
    err.status = 401;
    throw err;
  }

  if (Number(user.is_active ?? 1) === 0) {
    const err = new Error('Account is deactivated');
    err.status = 403;
    throw err;
  }

  if (
    decoded.tokenVersion !== undefined
    && Number(decoded.tokenVersion) !== Number(user.token_version || 0)
  ) {
    const err = new Error('Session expired; please sign in again');
    err.status = 401;
    throw err;
  }

  return { user, decoded };
};

const parseCookies = (cookieHeader) => {
  const out = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const rawVal = part.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(rawVal);
    } catch (_e) {
      out[key] = rawVal;
    }
  }
  return out;
};

const isSafeMethodOrSameOriginRequest = (req) => {
  const method = String(req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  if (req.header('X-Requested-With')) return true;
  const origin = req.header('Origin');
  if (origin && req.headers?.host) {
    try {
      return new URL(origin).host.toLowerCase() === String(req.headers.host).toLowerCase();
    } catch (_e) {
      return false;
    }
  }
  return false;
};

const extractBearerToken = (req) => {
  const header = req.header('Authorization');
  if (header && /^Bearer\s+/i.test(header)) {
    const bearer = header.replace(/^Bearer\s+/i, '').trim();
    if (bearer) return bearer;
  }

  // Fallback header for reverse proxies / sandbox preview gateways that strip `Authorization`
  const customHeader = req.header('X-Auth-Token') || req.header('X-Access-Token');
  if (customHeader) {
    const cleaned = customHeader.replace(/^Bearer\s+/i, '').trim();
    if (cleaned) return cleaned;
  }

  // Same-origin / XHR HttpOnly cookie fallback
  const cookies = parseCookies(req.header('Cookie'));
  if (cookies.dlp_token && isSafeMethodOrSameOriginRequest(req)) {
    return String(cookies.dlp_token).trim() || null;
  }

  return null;
};

const auth = async (req, res, next) => {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token, authorization denied' });
    }

    const { user, decoded } = await verifyTokenAndLoadUser(token);
    req.user = user;
    req.authPayload = decoded;
    return next();
  } catch (error) {
    const status = error.status || 401;
    return res.status(status).json({
      success: false,
      message: status === 403 ? error.message : 'Token is not valid',
    });
  }
};

const optionalAuth = async (req, _res, next) => {
  try {
    const token = extractBearerToken(req);
    if (!token) return next();
    const { user, decoded } = await verifyTokenAndLoadUser(token);
    req.user = user;
    req.authPayload = decoded;
  } catch (_err) {
    // Proceed as unauthenticated guest
  }
  return next();
};

const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  return next();
};

module.exports = { auth, optionalAuth, authorize, verifyTokenAndLoadUser, extractBearerToken };

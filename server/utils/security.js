const crypto = require('crypto');

const sanitizeText = (value, maxLength = 10000) => {
  if (value === null || value === undefined) return '';
  return String(value)
    // Remove null bytes and non-printable ASCII control chars except tab/LF/CR
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, maxLength);
};

const escapeLikePattern = (input) => String(input || '').replace(/[\\%_]/g, '\\$&');

const normalizeLanguageCode = (value) => {
  if (!value) return 'en';
  const v = String(value).trim().toLowerCase();
  if (v === 'en' || v === 'english') return 'en';
  if (v === 'te' || v === 'telugu' || v === 'తెలుగు') return 'te';
  if (v === 'hi' || v === 'hindi' || v === 'हिन्दी' || v === 'हिंदी') return 'hi';
  if (v === 'regional') return 'te';
  return ['en', 'te', 'hi'].includes(v) ? v : 'en';
};

const isSafeInternalUploadPath = (value, allowedSubdirs = ['videos', 'audio', 'pdfs', 'images', 'documents', 'thumbnails']) => {
  if (typeof value !== 'string' || value.includes('..') || value.includes('\0')) return false;
  const match = value.match(/^\/(?:uploads|api\/files)\/([a-z]+)\/([A-Za-z0-9._-]+)$/);
  if (!match) return false;
  return allowedSubdirs.includes(match[1]);
};

const isAllowedMediaUrl = (value, { type = 'any' } = {}) => {
  if (!value) return true;
  if (typeof value !== 'string' || value.length > 2048 || value.includes('\0')) return false;

  const subdirMap = {
    video: ['videos'],
    audio: ['audio'],
    pdf: ['pdfs'],
    image: ['images', 'thumbnails'],
    thumbnail: ['images', 'thumbnails'],
    any: ['videos', 'audio', 'pdfs', 'images', 'documents', 'thumbnails'],
  };
  if (isSafeInternalUploadPath(value, subdirMap[type] || subdirMap.any)) {
    return true;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;

    const host = parsed.hostname.toLowerCase();
    if (type === 'video' || type === 'any') {
      const isYoutube = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be'].includes(host);
      if (isYoutube) return true;
    }

    const extPatterns = {
      video: /\.(mp4|webm|mov|ogv|ogg|mpeg|mpg|m3u8)$/i,
      audio: /\.(mp3|wav|ogg|m4a|aac|webm)$/i,
      pdf: /\.pdf$/i,
      image: /\.(png|jpe?g|webp|gif)$/i,
      thumbnail: /\.(png|jpe?g|webp|gif)$/i,
      any: /\.(mp4|webm|mov|ogv|ogg|mpeg|mpg|m3u8|mp3|wav|m4a|aac|pdf|png|jpe?g|webp|txt|csv)$/i,
    };
    const regex = extPatterns[type] || extPatterns.any;
    return regex.test(parsed.pathname);
  } catch (_err) {
    return false;
  }
};

const issueMediaToken = (userId, filePath, ttlSeconds = 3600) => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) return null;
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const normalizedPath = String(filePath).split('?')[0];
  const payload = `${userId}:${exp}:${normalizedPath}`;
  const sig = crypto
    .createHmac('sha256', `${secret}:media-access`)
    .update(payload)
    .digest('hex');
  return `${userId}.${exp}.${sig}`;
};

const verifyMediaToken = (token, filePath) => {
  if (!token || typeof token !== 'string') return null;
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userIdStr, expStr, providedSig] = parts;
  const userId = Number(userIdStr);
  const exp = Number(expStr);
  if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(exp)) return null;
  if (Math.floor(Date.now() / 1000) > exp) return null;

  const normalizedPath = String(filePath).split('?')[0];
  const expectedSig = crypto
    .createHmac('sha256', `${secret}:media-access`)
    .update(`${userId}:${exp}:${normalizedPath}`)
    .digest('hex');

  const a = Buffer.from(providedSig, 'hex');
  const b = Buffer.from(expectedSig, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { userId };
};

const isPrivateOrReservedIp = (ip) => {
  if (!ip || typeof ip !== 'string') return true;
  const normalized = ip.toLowerCase().replace(/^::ffff:/, '');
  if (normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80')) {
    return true;
  }
  const parts = normalized.split('.').map(Number);
  if (parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  return true;
};

module.exports = {
  sanitizeText,
  escapeLikePattern,
  normalizeLanguageCode,
  isSafeInternalUploadPath,
  isAllowedMediaUrl,
  issueMediaToken,
  verifyMediaToken,
  isPrivateOrReservedIp,
};

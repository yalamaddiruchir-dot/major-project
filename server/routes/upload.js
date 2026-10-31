const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dns = require('dns');
const https = require('https');
const crypto = require('crypto');
const { auth, authorize } = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/rateLimiter');
const { issueMediaToken, isPrivateOrReservedIp } = require('../utils/security');
const { transcodeAdaptiveVideoVariants } = require('../utils/transcoder');
const logger = require('../utils/logger');

const router = express.Router();

const baseUploadDir = path.join(__dirname, '../uploads');
for (const dir of ['videos', 'audio', 'pdfs', 'images', 'documents', 'thumbnails']) {
  fs.mkdirSync(path.join(baseUploadDir, dir), { recursive: true });
}

const FILE_SPECS = new Map([
  // Videos (up to 250 MB)
  ['.mp4', { mimes: ['video/mp4'], subdir: 'videos', category: 'video', maxBytes: 250 * 1024 * 1024 }],
  ['.webm', { mimes: ['video/webm', 'audio/webm'], subdir: 'videos', category: 'video', maxBytes: 250 * 1024 * 1024 }],
  ['.mov', { mimes: ['video/quicktime'], subdir: 'videos', category: 'video', maxBytes: 250 * 1024 * 1024 }],
  ['.ogv', { mimes: ['video/ogg'], subdir: 'videos', category: 'video', maxBytes: 250 * 1024 * 1024 }],
  ['.mpeg', { mimes: ['video/mpeg'], subdir: 'videos', category: 'video', maxBytes: 250 * 1024 * 1024 }],
  ['.mpg', { mimes: ['video/mpeg'], subdir: 'videos', category: 'video', maxBytes: 250 * 1024 * 1024 }],

  // Audio (up to 50 MB)
  ['.mp3', { mimes: ['audio/mpeg', 'audio/mp3'], subdir: 'audio', category: 'audio', maxBytes: 50 * 1024 * 1024 }],
  ['.wav', { mimes: ['audio/wav', 'audio/x-wav', 'audio/wave'], subdir: 'audio', category: 'audio', maxBytes: 50 * 1024 * 1024 }],
  ['.ogg', { mimes: ['audio/ogg', 'video/ogg', 'application/ogg'], subdir: 'audio', category: 'audio', maxBytes: 50 * 1024 * 1024 }],
  ['.m4a', { mimes: ['audio/mp4', 'audio/x-m4a', 'audio/m4a'], subdir: 'audio', category: 'audio', maxBytes: 50 * 1024 * 1024 }],
  ['.aac', { mimes: ['audio/aac', 'audio/x-aac'], subdir: 'audio', category: 'audio', maxBytes: 50 * 1024 * 1024 }],

  // PDF (up to 50 MB)
  ['.pdf', { mimes: ['application/pdf'], subdir: 'pdfs', category: 'pdf', maxBytes: 50 * 1024 * 1024 }],

  // Images (up to 10 MB; SVG intentionally excluded to prevent embedded script XSS)
  ['.png', { mimes: ['image/png'], subdir: 'images', category: 'image', maxBytes: 10 * 1024 * 1024 }],
  ['.jpg', { mimes: ['image/jpeg'], subdir: 'images', category: 'image', maxBytes: 10 * 1024 * 1024 }],
  ['.jpeg', { mimes: ['image/jpeg'], subdir: 'images', category: 'image', maxBytes: 10 * 1024 * 1024 }],
  ['.webp', { mimes: ['image/webp'], subdir: 'images', category: 'image', maxBytes: 10 * 1024 * 1024 }],

  // Plain study worksheets (up to 5 MB)
  ['.txt', { mimes: ['text/plain'], subdir: 'documents', category: 'document', maxBytes: 5 * 1024 * 1024 }],
  ['.csv', { mimes: ['text/csv', 'text/plain', 'application/vnd.ms-excel'], subdir: 'documents', category: 'document', maxBytes: 5 * 1024 * 1024 }],
]);

const resolveTargetSubdir = (req, ext, spec) => {
  if (req.query?.purpose === 'thumbnail' && spec.category === 'image') {
    return 'thumbnails';
  }
  if (ext === '.ogg' && req.file?.mimetype === 'video/ogg') {
    return 'videos';
  }
  if (ext === '.webm' && req.query?.purpose === 'audio') {
    return 'audio';
  }
  return spec.subdir;
};

const verifyFileMagicSignature = (filePath, ext) => {
  const stat = fs.statSync(filePath);
  if (stat.size === 0) return false;

  const readLen = Math.min(stat.size, 64);
  const fd = fs.openSync(filePath, 'r');
  const header = Buffer.alloc(readLen);
  try {
    fs.readSync(fd, header, 0, readLen, 0);
  } finally {
    fs.closeSync(fd);
  }

  if (['.mp4', '.mov', '.m4a'].includes(ext)) {
    return header.length >= 8 && header.toString('ascii', 4, 8) === 'ftyp';
  }
  if (ext === '.webm') {
    return header.length >= 4 && header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  }
  if (['.ogv', '.ogg'].includes(ext)) {
    return header.length >= 4 && header.toString('ascii', 0, 4) === 'OggS';
  }
  if (['.mpeg', '.mpg'].includes(ext)) {
    return header.length >= 4 && header[0] === 0x00 && header[1] === 0x00 && header[2] === 0x01 && [0xba, 0xb3].includes(header[3]);
  }
  if (ext === '.mp3' || ext === '.aac') {
    const isId3 = header.length >= 3 && header.toString('ascii', 0, 3) === 'ID3';
    const isMpegSync = header.length >= 2 && header[0] === 0xff && (header[1] & 0xe0) === 0xe0;
    return isId3 || isMpegSync;
  }
  if (ext === '.wav') {
    return header.length >= 12
      && header.toString('ascii', 0, 4) === 'RIFF'
      && header.toString('ascii', 8, 12) === 'WAVE';
  }
  if (ext === '.pdf') {
    return header.length >= 5 && header.toString('ascii', 0, 5) === '%PDF-';
  }
  if (ext === '.png') {
    return header.length >= 8
      && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (['.jpg', '.jpeg'].includes(ext)) {
    return header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  }
  if (ext === '.webp') {
    return header.length >= 12
      && header.toString('ascii', 0, 4) === 'RIFF'
      && header.toString('ascii', 8, 12) === 'WEBP';
  }
  if (['.txt', '.csv'].includes(ext)) {
    if (header.includes(0x00)) return false;
    const sample = fs.readFileSync(filePath, 'utf8').slice(0, 4096);
    if (/<\s*(script|html|iframe|svg|object|embed)\b/i.test(sample)) return false;
    return true;
  }

  return false;
};

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const spec = FILE_SPECS.get(ext);
    const subdir = spec ? resolveTargetSubdir(req, ext, spec) : 'documents';
    callback(null, path.join(baseUploadDir, subdir));
  },
  filename: (_req, file, callback) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    callback(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

const fileFilter = (_req, file, callback) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const spec = FILE_SPECS.get(ext);
  if (spec && spec.mimes.includes(file.mimetype)) {
    return callback(null, true);
  }
  return callback(
    new Error('Unsupported file format. Upload verified MP4/WebM video, MP3/WAV/OGG/M4A audio, PDF, PNG/JPG/WebP image, or TXT/CSV worksheet.'),
    false
  );
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 250 * 1024 * 1024,
    files: 1,
    fields: 10,
  },
});

const buildUploadResponsePayload = async ({ userId, filePath, filename, originalName, mimeType, sizeBytes, ext, spec, skipTranscode = false }) => {
  const subdir = path.basename(path.dirname(filePath));
  const canonicalUrl = subdir === 'thumbnails'
    ? `/uploads/thumbnails/${filename}`
    : `/uploads/${subdir}/${filename}`;

  const protectedApiPath = `/api/files/${subdir}/${filename}`;
  const mediaToken = subdir === 'thumbnails' ? null : issueMediaToken(userId, protectedApiPath);

  let lowBandwidthUrl = null;
  let lowBandwidthSignedUrl = null;
  let hlsUrl = null;
  let hlsSignedUrl = null;
  let transcoded = false;

  if (subdir === 'videos' && !skipTranscode) {
    const txResult = await transcodeAdaptiveVideoVariants(filePath);
    if (txResult.transcoded && txResult.lowBandwidthFilename) {
      transcoded = true;
      lowBandwidthUrl = `/uploads/videos/${txResult.lowBandwidthFilename}`;
      const lbApi = `/api/files/videos/${txResult.lowBandwidthFilename}`;
      const lbTok = issueMediaToken(userId, lbApi);
      lowBandwidthSignedUrl = lbTok ? `${lbApi}?media_token=${encodeURIComponent(lbTok)}` : lowBandwidthUrl;
    }
    if (txResult.hlsMasterFilename) {
      hlsUrl = `/uploads/videos/${txResult.hlsMasterFilename}`;
      const hlsApi = `/api/files/videos/${txResult.hlsMasterFilename}`;
      const hlsTok = issueMediaToken(userId, hlsApi);
      hlsSignedUrl = hlsTok ? `${hlsApi}?media_token=${encodeURIComponent(hlsTok)}` : hlsUrl;
    }
  }

  return {
    success: true,
    message: 'File uploaded successfully',
    url: canonicalUrl,
    signed_url: mediaToken ? `${protectedApiPath}?media_token=${encodeURIComponent(mediaToken)}` : canonicalUrl,
    low_bandwidth_url: lowBandwidthUrl,
    low_bandwidth_signed_url: lowBandwidthSignedUrl,
    hls_url: hlsUrl,
    hls_signed_url: hlsSignedUrl,
    transcoded,
    filename,
    original_name: path.basename(originalName || filename),
    mime_type: mimeType,
    size_bytes: sizeBytes,
    category: ext === '.webm' && subdir === 'audio' ? 'audio' : spec.category,
  };
};

router.post(['/', '/single'], auth, authorize('teacher', 'admin'), uploadLimiter, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Please select a supported learning file to upload.' });
  }

  const ext = path.extname(req.file.originalname || '').toLowerCase();
  const spec = FILE_SPECS.get(ext);
  if (!spec) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ success: false, message: 'Unsupported file extension.' });
  }

  if (req.file.size > spec.maxBytes) {
    fs.unlink(req.file.path, () => {});
    return res.status(413).json({
      success: false,
      message: `File exceeds the maximum allowed size (${Math.round(spec.maxBytes / (1024 * 1024))} MB) for ${spec.category} files.`,
    });
  }

  if (!verifyFileMagicSignature(req.file.path, ext)) {
    fs.unlink(req.file.path, () => {});
    logger.security('Rejected uploaded file with mismatched magic signature', {
      userId: req.user.id,
      declaredMime: req.file.mimetype,
      ext,
    });
    return res.status(400).json({
      success: false,
      message: 'The uploaded file content does not match its declared file format.',
    });
  }

  const payload = await buildUploadResponsePayload({
    userId: req.user.id,
    filePath: req.file.path,
    filename: req.file.filename,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    sizeBytes: req.file.size,
    ext,
    spec,
    skipTranscode: req.query.transcode === 'false',
  });

  return res.status(201).json(payload);
});

/**
 * POST /api/upload/import-remote
 * Mirrors a direct HTTPS Open Educational Resource (MP4/WebM/MP3/WAV/OGG/PDF/PNG/JPG) onto the
 * school server with SSRF protection, magic-byte inspection, and automatic 360p/HLS transcoding
 * so students can download and study external media 100% offline without third-party CORS issues.
 */
router.post('/import-remote', auth, authorize('teacher', 'admin'), uploadLimiter, async (req, res) => {
  const remoteUrlRaw = String(req.body?.url || '').trim();
  if (!remoteUrlRaw) {
    return res.status(400).json({ success: false, message: 'Please provide a direct HTTPS media URL to mirror.' });
  }

  let parsed;
  try {
    parsed = new URL(remoteUrlRaw);
  } catch (_err) {
    return res.status(400).json({ success: false, message: 'Invalid URL format.' });
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    return res.status(400).json({ success: false, message: 'Only public HTTPS media URLs without embedded credentials are permitted.' });
  }

  const host = parsed.hostname.toLowerCase();
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be'].includes(host)) {
    return res.status(422).json({
      success: false,
      code: 'YOUTUBE_TOS_PROTECTED',
      message: 'YouTube streams cannot be downloaded directly due to YouTube Terms of Service. Upload a classroom MP4/audio companion file or provide a direct open-licensed (.mp4/.webm/.mp3/.pdf) HTTPS URL.',
    });
  }

  const ext = path.extname(parsed.pathname || '').toLowerCase();
  const spec = FILE_SPECS.get(ext);
  if (!spec) {
    return res.status(400).json({
      success: false,
      message: 'Remote URL must end in a supported file extension (.mp4, .webm, .mp3, .wav, .ogg, .pdf, .png, .jpg).',
    });
  }

  // SSRF defense: resolve DNS and reject loopback/private/link-local/metadata IP ranges
  let resolvedAddresses;
  try {
    resolvedAddresses = await dns.promises.lookup(host, { all: true });
  } catch (_dnsErr) {
    return res.status(400).json({ success: false, message: 'Unable to resolve remote media host.' });
  }

  if (!resolvedAddresses.length || resolvedAddresses.some((entry) => isPrivateOrReservedIp(entry.address))) {
    logger.security('Blocked SSRF attempt in /api/upload/import-remote', { userId: req.user.id, host });
    return res.status(403).json({ success: false, message: 'Remote host resolves to a restricted private or internal network address.' });
  }

  const targetFilename = `${Date.now()}-${crypto.randomUUID()}${ext}`;
  const targetPath = path.join(baseUploadDir, spec.subdir, targetFilename);

  try {
    const sizeBytes = await new Promise((resolve, reject) => {
      const request = https.get(
        parsed.toString(),
        {
          timeout: 30000,
          headers: { 'User-Agent': 'RuralSchoolDigitalLearning/1.1' },
        },
        (response) => {
          if (response.statusCode !== 200) {
            response.resume();
            reject(new Error(`Remote server returned HTTP ${response.statusCode}`));
            return;
          }
          let downloaded = 0;
          const out = fs.createWriteStream(targetPath, { mode: 0o600 });
          response.on('data', (chunk) => {
            downloaded += chunk.length;
            if (downloaded > spec.maxBytes) {
              request.destroy(new Error('Remote file exceeds maximum allowed size'));
            }
          });
          response.pipe(out);
          out.on('finish', () => out.close(() => resolve(downloaded)));
          out.on('error', reject);
          response.on('error', reject);
        }
      );
      request.on('timeout', () => request.destroy(new Error('Remote download timed out')));
      request.on('error', reject);
    });

    if (!verifyFileMagicSignature(targetPath, ext)) {
      fs.unlink(targetPath, () => {});
      return res.status(400).json({
        success: false,
        message: 'Downloaded remote file failed magic-byte signature verification.',
      });
    }

    const payload = await buildUploadResponsePayload({
      userId: req.user.id,
      filePath: targetPath,
      filename: targetFilename,
      originalName: path.basename(parsed.pathname),
      mimeType: spec.mimes[0],
      sizeBytes,
      ext,
      spec,
    });

    return res.status(201).json(payload);
  } catch (err) {
    if (fs.existsSync(targetPath)) {
      fs.unlink(targetPath, () => {});
    }
    return res.status(502).json({
      success: false,
      message: `Unable to mirror remote media: ${err.message}`,
    });
  }
});

module.exports = router;

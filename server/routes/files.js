const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../database/connection');
const { verifyTokenAndLoadUser, extractBearerToken } = require('../middleware/auth');
const { verifyMediaToken, issueMediaToken } = require('../utils/security');
const logger = require('../utils/logger');

const router = express.Router();

const ALLOWED_SUBDIRS = new Set(['videos', 'audio', 'pdfs', 'images', 'documents', 'thumbnails']);
const SAFE_FILENAME_RE = /^[A-Za-z0-9._-]+$/;

const MIME_BY_EXT = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.ogv': 'video/ogg',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
};

const resolveAuthenticatedUser = async (req, canonicalApiPath) => {
  const bearer = extractBearerToken(req);
  if (bearer) {
    const { user } = await verifyTokenAndLoadUser(bearer);
    return user;
  }

  const mediaToken = req.query.media_token;
  if (mediaToken) {
    const verified = verifyMediaToken(String(mediaToken), canonicalApiPath);
    if (!verified) return null;
    const user = await db.get(
      'SELECT id, role, is_active FROM users WHERE id = $1',
      [verified.userId]
    );
    if (!user || Number(user.is_active ?? 1) === 0) return null;
    return user;
  }

  return null;
};

const canUserAccessProtectedFile = async (user, subdir, filename) => {
  if (!user) return false;
  if (user.role === 'admin') return true;

  const uploadUrl = `/uploads/${subdir}/${filename}`;
  const apiUrl = `/api/files/${subdir}/${filename}`;

  // Derive parent video stem when serving transcoded -360p.mp4, -master.m3u8, or -240p_000.ts HLS segments
  const hlsOrVariantMatch = subdir === 'videos'
    ? filename.match(/^(.+?)-(?:360p\.mp4|master\.m3u8|(?:240p|480p)(?:_\d{3}\.ts|\.m3u8))$/)
    : null;
  const stemPattern = hlsOrVariantMatch ? `/uploads/videos/${hlsOrVariantMatch[1]}.%` : null;

  if (user.role === 'teacher') {
    // Allow teachers to preview files they just uploaded or files attached to their own courses
    const linkedOwnCourse = await db.get(
      `SELECT 1 AS ok
       FROM courses c
       LEFT JOIN lessons l ON l.course_id = c.id
       LEFT JOIN learning_materials m ON m.course_id = c.id
       WHERE c.created_by = $1
         AND (
           l.video_url IN ($2, $3)
           OR l.low_bandwidth_video_url IN ($2, $3)
           OR l.audio_url IN ($2, $3)
           OR l.pdf_url IN ($2, $3)
           OR l.image_url IN ($2, $3)
           OR m.file_url IN ($2, $3)
           OR m.low_bandwidth_url IN ($2, $3)
           OR ($4 IS NOT NULL AND l.video_url LIKE $4)
         )
       LIMIT 1`,
      [user.id, uploadUrl, apiUrl, stemPattern]
    );
    if (linkedOwnCourse) return true;

    // Also allow if file has not yet been attached to any other teacher's course (e.g. previewing before saving form)
    const attachedElsewhere = await db.get(
      `SELECT 1 AS other
       FROM courses c
       LEFT JOIN lessons l ON l.course_id = c.id
       LEFT JOIN learning_materials m ON m.course_id = c.id
       WHERE c.created_by != $1
         AND (
           l.video_url IN ($2, $3)
           OR l.low_bandwidth_video_url IN ($2, $3)
           OR l.audio_url IN ($2, $3)
           OR l.pdf_url IN ($2, $3)
           OR l.image_url IN ($2, $3)
           OR m.file_url IN ($2, $3)
           OR m.low_bandwidth_url IN ($2, $3)
           OR ($4 IS NOT NULL AND l.video_url LIKE $4)
         )
       LIMIT 1`,
      [user.id, uploadUrl, apiUrl, stemPattern]
    );
    return !attachedElsewhere;
  }

  // Students must be enrolled in a course referencing this learning file
  const enrolledMatch = await db.get(
    `SELECT 1 AS ok
     FROM enrollments e
     JOIN courses c ON c.id = e.course_id AND c.is_active = 1
     LEFT JOIN lessons l ON l.course_id = c.id AND l.is_active = 1
     LEFT JOIN learning_materials m ON m.course_id = c.id
     WHERE e.user_id = $1
       AND (
         l.video_url IN ($2, $3)
         OR l.low_bandwidth_video_url IN ($2, $3)
         OR l.audio_url IN ($2, $3)
         OR l.pdf_url IN ($2, $3)
         OR l.image_url IN ($2, $3)
         OR m.file_url IN ($2, $3)
         OR m.low_bandwidth_url IN ($2, $3)
         OR ($4 IS NOT NULL AND l.video_url LIKE $4)
       )
     LIMIT 1`,
    [user.id, uploadUrl, apiUrl, stemPattern]
  );

  return Boolean(enrolledMatch);
};

router.get('/:subdir/:filename', async (req, res) => {
  try {
    const subdir = String(req.params.subdir || '');
    const filename = String(req.params.filename || '');

    if (!ALLOWED_SUBDIRS.has(subdir) || !SAFE_FILENAME_RE.test(filename) || filename.includes('..')) {
      return res.status(400).json({ success: false, message: 'Invalid file path' });
    }

    const baseDir = path.resolve(__dirname, '../uploads', subdir);
    const fullPath = path.resolve(baseDir, filename);
    if (!fullPath.startsWith(baseDir + path.sep)) {
      return res.status(400).json({ success: false, message: 'Invalid file path' });
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    // Course thumbnails are public; all lesson/course learning assets require auth + enrollment/ownership
    let authorizedUser = null;
    if (subdir !== 'thumbnails') {
      const canonicalApiPath = `/api/files/${subdir}/${filename}`;
      let user = null;
      try {
        user = await resolveAuthenticatedUser(req, canonicalApiPath);
      } catch (_err) {
        user = null;
      }

      if (!user) {
        return res.status(401).json({ success: false, message: 'Authentication required to access learning files.' });
      }

      const authorized = await canUserAccessProtectedFile(user, subdir, filename);
      if (!authorized) {
        logger.security('Blocked unauthorized file download attempt', {
          userId: user.id,
          subdir,
          filename,
        });
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to access this file. Enroll in the course first.',
        });
      }
      authorizedUser = user;
    }

    const stat = fs.statSync(fullPath);
    const ext = path.extname(filename).toLowerCase();
    const contentType = subdir === 'audio' && ext === '.webm'
      ? 'audio/webm'
      : (MIME_BY_EXT[ext] || 'application/octet-stream');

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', subdir === 'thumbnails' ? 'public, max-age=86400' : 'private, no-store');

    const dispositionType = req.query.download === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Disposition', `${dispositionType}; filename="${filename}"`);

    // Rewrite relative segment/variant URIs inside HLS .m3u8 playlists with signed media_tokens
    if (ext === '.m3u8' && authorizedUser) {
      const rawPlaylist = fs.readFileSync(fullPath, 'utf8');
      const signedPlaylist = rawPlaylist
        .split('\n')
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#') || !SAFE_FILENAME_RE.test(trimmed)) return line;
          const segTok = issueMediaToken(authorizedUser.id, `/api/files/${subdir}/${trimmed}`);
          return segTok ? `${trimmed}?media_token=${encodeURIComponent(segTok)}` : trimmed;
        })
        .join('\n');
      const buf = Buffer.from(signedPlaylist, 'utf8');
      res.writeHead(200, {
        'Content-Length': buf.length,
        'Content-Type': contentType,
      });
      res.end(buf);
      return undefined;
    }

    const range = req.headers.range;
    if (range) {
      const match = range.match(/bytes=(\d*)-(\d*)/);
      if (!match) {
        res.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end();
        return undefined;
      }
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? parseInt(match[2], 10) : stat.size - 1;
      if (start >= stat.size || end >= stat.size || start > end) {
        res.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end();
        return undefined;
      }
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      });
      fs.createReadStream(fullPath, { start, end }).pipe(res);
      return undefined;
    }

    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': contentType,
    });
    fs.createReadStream(fullPath).pipe(res);
    return undefined;
  } catch (error) {
    logger.error('Serve file error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error serving file' });
  }
});

module.exports = router;

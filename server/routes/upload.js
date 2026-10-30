const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { auth, authorize } = require('../middleware/auth');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../uploads/videos');
fs.mkdirSync(uploadDir, { recursive: true });

const allowedTypes = new Map([
  ['.mp4', ['video/mp4']],
  ['.webm', ['video/webm']],
  ['.mov', ['video/quicktime']],
  ['.ogv', ['video/ogg']],
  ['.ogg', ['video/ogg']],
  ['.mpeg', ['video/mpeg']],
  ['.mpg', ['video/mpeg']],
]);

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDir),
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
  },
});

const fileFilter = (_req, file, callback) => {
  const extension = path.extname(file.originalname).toLowerCase();
  const acceptedMimes = allowedTypes.get(extension);
  if (acceptedMimes && acceptedMimes.includes(file.mimetype)) return callback(null, true);
  return callback(new Error('Unsupported video format. Upload MP4, WebM, MOV, OGG or MPEG video.'), false);
};


const hasValidVideoSignature = (filePath, extension) => {
  const descriptor = fs.openSync(filePath, 'r');
  const header = Buffer.alloc(16);
  try {
    fs.readSync(descriptor, header, 0, header.length, 0);
  } finally {
    fs.closeSync(descriptor);
  }
  if (['.mp4', '.mov'].includes(extension)) return header.toString('ascii', 4, 8) === 'ftyp';
  if (['.webm'].includes(extension)) return header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (['.ogv', '.ogg'].includes(extension)) return header.toString('ascii', 0, 4) === 'OggS';
  if (['.mpeg', '.mpg'].includes(extension)) return header[0] === 0x00 && header[1] === 0x00 && header[2] === 0x01 && [0xba, 0xb3].includes(header[3]);
  return false;
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 250 * 1024 * 1024, files: 1 },
});

router.post('/', auth, authorize('teacher', 'admin'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Please select a supported video file.' });
  const extension = path.extname(req.file.originalname).toLowerCase();
  if (!hasValidVideoSignature(req.file.path, extension)) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ success: false, message: 'The uploaded file does not match its declared video format.' });
  }
  res.status(201).json({
    success: true,
    message: 'File uploaded successfully',
    url: `/uploads/videos/${req.file.filename}`,
    filename: req.file.filename,
  });
});

module.exports = router;

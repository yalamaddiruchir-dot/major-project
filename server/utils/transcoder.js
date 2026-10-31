const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const logger = require('./logger');

let cachedFfmpegPath = undefined;

const resolveFfmpegPath = () => {
  if (cachedFfmpegPath !== undefined) return cachedFfmpegPath;
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    cachedFfmpegPath = process.env.FFMPEG_PATH;
    return cachedFfmpegPath;
  }
  try {
    // eslint-disable-next-line global-require
    const installer = require('@ffmpeg-installer/ffmpeg');
    if (installer && installer.path && fs.existsSync(installer.path)) {
      cachedFfmpegPath = installer.path;
      return cachedFfmpegPath;
    }
  } catch (_err) {
    // Fallback to system PATH check
  }
  cachedFfmpegPath = null;
  return null;
};

const runFfmpeg = (args, timeoutMs = 120000) => new Promise((resolve, reject) => {
  const bin = resolveFfmpegPath();
  if (!bin) {
    reject(new Error('FFmpeg binary not available'));
    return;
  }
  execFile(bin, args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
    if (err) {
      reject(new Error(stderr ? stderr.slice(-500) : err.message));
      return;
    }
    resolve({ stdout, stderr });
  });
});

/**
 * Automatically transcodes an uploaded classroom video into:
 * 1. A rural 2G/3G low-bandwidth 360p H.264/AAC MP4 (`<stem>-360p.mp4`) suitable for both
 *    Low-Bandwidth streaming and small IndexedDB offline downloads.
 * 2. Multi-bitrate Adaptive HLS playlists (`<stem>-master.m3u8`, `<stem>-240p.m3u8`, `<stem>-480p.m3u8`)
 *    for adaptive bitrate streaming on fluctuating rural mobile connections.
 */
const transcodeAdaptiveVideoVariants = async (inputFilePath, options = {}) => {
  const ffmpegBin = resolveFfmpegPath();
  if (!ffmpegBin || !fs.existsSync(inputFilePath)) {
    return { transcoded: false, lowBandwidthFilename: null, hlsMasterFilename: null };
  }

  const dir = path.dirname(inputFilePath);
  const ext = path.extname(inputFilePath);
  const stem = path.basename(inputFilePath, ext);
  const lowBwFilename = `${stem}-360p.mp4`;
  const lowBwPath = path.join(dir, lowBwFilename);

  const enableHls = options.generateHls !== false && process.env.DISABLE_HLS_TRANSCODE !== 'true';
  const hls240Playlist = `${stem}-240p.m3u8`;
  const hls480Playlist = `${stem}-480p.m3u8`;
  const hlsMasterFilename = `${stem}-master.m3u8`;

  try {
    // 1. Generate compact 360p faststart MP4 for low-bandwidth & offline IndexedDB caching
    await runFfmpeg([
      '-y',
      '-i', inputFilePath,
      '-vf', "scale=-2:'min(360,ih)'",
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-profile:v', 'baseline',
      '-level', '3.0',
      '-pix_fmt', 'yuv420p',
      '-crf', '30',
      '-maxrate', '360k',
      '-bufsize', '720k',
      '-movflags', '+faststart',
      '-c:a', 'aac',
      '-b:a', '64k',
      '-ac', '1',
      lowBwPath,
    ]);

    let generatedHlsMaster = null;
    if (enableHls) {
      // 240p ultra-low-bandwidth HLS variant (~180 kbps)
      await runFfmpeg([
        '-y',
        '-i', inputFilePath,
        '-vf', "scale=-2:'min(240,ih)'",
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-pix_fmt', 'yuv420p',
        '-b:v', '180k',
        '-maxrate', '220k',
        '-bufsize', '440k',
        '-c:a', 'aac',
        '-b:a', '48k',
        '-ac', '1',
        '-hls_time', '4',
        '-hls_playlist_type', 'vod',
        '-hls_segment_filename', path.join(dir, `${stem}-240p_%03d.ts`),
        path.join(dir, hls240Playlist),
      ]);

      // 480p standard classroom HLS variant (~600 kbps)
      await runFfmpeg([
        '-y',
        '-i', inputFilePath,
        '-vf', "scale=-2:'min(480,ih)'",
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-pix_fmt', 'yuv420p',
        '-b:v', '600k',
        '-maxrate', '700k',
        '-bufsize', '1400k',
        '-c:a', 'aac',
        '-b:a', '96k',
        '-hls_time', '4',
        '-hls_playlist_type', 'vod',
        '-hls_segment_filename', path.join(dir, `${stem}-480p_%03d.ts`),
        path.join(dir, hls480Playlist),
      ]);

      const masterContent = [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '#EXT-X-STREAM-INF:BANDWIDTH=240000,RESOLUTION=426x240,NAME="240p Data Saver"',
        hls240Playlist,
        '#EXT-X-STREAM-INF:BANDWIDTH=720000,RESOLUTION=854x480,NAME="480p Classroom"',
        hls480Playlist,
        '',
      ].join('\n');

      fs.writeFileSync(path.join(dir, hlsMasterFilename), masterContent, 'utf8');
      generatedHlsMaster = hlsMasterFilename;
    }

    return {
      transcoded: fs.existsSync(lowBwPath),
      lowBandwidthFilename: fs.existsSync(lowBwPath) ? lowBwFilename : null,
      lowBandwidthSizeBytes: fs.existsSync(lowBwPath) ? fs.statSync(lowBwPath).size : 0,
      hlsMasterFilename: generatedHlsMaster,
    };
  } catch (err) {
    logger.warn('Adaptive video transcoding skipped or failed; retaining original video', {
      file: path.basename(inputFilePath),
      error: err.message,
    });
    return { transcoded: false, lowBandwidthFilename: null, hlsMasterFilename: null };
  }
};

module.exports = {
  resolveFfmpegPath,
  runFfmpeg,
  transcodeAdaptiveVideoVariants,
};

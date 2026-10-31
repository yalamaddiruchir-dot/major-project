const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('./database/connection');
const { runMigrations } = require('./database/migrate');
const { apiLimiter } = require('./middleware/rateLimiter');
const logger = require('./utils/logger');

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = Number(process.env.PORT || 5000);
const HOST = process.env.HOST || '0.0.0.0';
const isProduction = process.env.NODE_ENV === 'production';

if (process.env.TRUST_PROXY === 'true' || isProduction) {
  app.set('trust proxy', 1);
}

app.disable('x-powered-by');

// Optional HTTPS enforcement behind reverse proxy in production
if (isProduction && process.env.FORCE_HTTPS === 'true') {
  app.use((req, res, next) => {
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      return next();
    }
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  });
}

// Security headers via Helmet
const frameAncestors = isProduction
  ? ["'self'"]
  : ["'self'", 'https://*.e2b.app'];

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        mediaSrc: ["'self'", 'blob:', 'https:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameSrc: ["'self'", 'blob:', 'https://www.youtube.com', 'https://youtube.com'],
        frameAncestors,
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    frameguard: isProduction ? { action: 'sameorigin' } : false,
    crossOriginResourcePolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);

// Strict CORS configuration (always permits same-origin requests + configured allowlist)
const getAllowedOrigins = () => [
  process.env.CORS_ORIGINS || '',
  process.env.CLIENT_ORIGIN || 'http://localhost:3000',
]
  .join(',')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors((req, callback) => {
    const origin = req.header('Origin');
    if (!origin) {
      return callback(null, { origin: true, credentials: false });
    }

    // Always allow genuine same-origin browser requests (e.g., <script type="module"> & same-origin POST/PUT/DELETE)
    try {
      const parsedOrigin = new URL(origin);
      if (req.headers.host && parsedOrigin.host.toLowerCase() === String(req.headers.host).toLowerCase()) {
        return callback(null, {
          origin: true,
          credentials: false,
          methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
          allowedHeaders: ['Content-Type', 'Authorization', 'X-Auth-Token', 'X-Access-Token', 'X-Requested-With', 'Range'],
        });
      }
    } catch (_err) {
      // Proceed to explicit allowlist check
    }

    const allowed = getAllowedOrigins();
    if (allowed.includes(origin) || (!isProduction && /^https:\/\/\d+-[a-z0-9-]+\.e2b\.app$/i.test(origin))) {
      return callback(null, {
        origin: true,
        credentials: false,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Auth-Token', 'X-Access-Token', 'X-Requested-With', 'Range'],
      });
    }

    const err = new Error('Origin is not allowed by CORS');
    err.status = 403;
    return callback(err);
  })
);

// Low-bandwidth HTTP compression
app.use(compression({ threshold: 1024 }));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Rate limiting across API endpoints
app.use('/api', apiLimiter);

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/lessons', require('./routes/lessons'));
app.use('/api/progress', require('./routes/progress'));
app.use('/api/assessments', require('./routes/assessments'));
app.use('/api/users', require('./routes/users'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/materials', require('./routes/materials'));
app.use('/api/certificates', require('./routes/certificates'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/admin', require('./routes/admin'));

// Protected file delivery (serves /api/files/* and legacy /uploads/* with enrollment/ownership checks)
const filesRouter = require('./routes/files');
app.use('/api/files', filesRouter);
app.use('/uploads', filesRouter);

// Application health endpoint
app.get('/api/health', async (_req, res) => {
  try {
    await db.query('SELECT 1 AS healthy');
    const quickCheck = await db.get('PRAGMA quick_check');
    const dbIntegrityOk = quickCheck && Object.values(quickCheck)[0] === 'ok';
    return res.status(dbIntegrityOk ? 200 : 503).json({
      status: dbIntegrityOk ? 'OK' : 'DEGRADED',
      database: dbIntegrityOk ? 'connected' : 'degraded',
      uptime_seconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      message: 'Server is running',
    });
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    return res.status(503).json({
      status: 'ERROR',
      database: 'unavailable',
      timestamp: new Date().toISOString(),
    });
  }
});

// Unknown API route handler
app.use('/api/*', (_req, res) => res.status(404).json({
  success: false,
  message: 'API endpoint not found',
}));

// Production frontend static build serving
const clientBuildPath = path.join(__dirname, '../client/build');
if ((isProduction || process.env.SERVE_CLIENT === 'true') && fs.existsSync(path.join(clientBuildPath, 'index.html'))) {
  app.use(
    express.static(clientBuildPath, {
      index: false,
      setHeaders(res, servedPath) {
        if (servedPath.endsWith('service-worker.js') || servedPath.endsWith('index.html') || servedPath.endsWith('manifest.json')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else if (servedPath.includes(`${path.sep}static${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    })
  );

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// Centralized error handler (never leaks stack traces to clients)
app.use((err, req, res, _next) => {
  logger.error('Unhandled request error', {
    method: req.method,
    path: req.originalUrl,
    error: err.message,
  });

  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({
      success: false,
      message: err.code === 'LIMIT_FILE_SIZE'
        ? 'Uploaded file exceeds the maximum allowed size limit.'
        : err.message,
    });
  }

  if (err.status === 403 || (err.message && err.message.includes('CORS'))) {
    return res.status(403).json({ success: false, message: 'Origin is not allowed by CORS' });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Invalid JSON request payload.' });
  }

  if (err.message && err.message.startsWith('Unsupported file format')) {
    return res.status(400).json({ success: false, message: err.message });
  }

  return res.status(500).json({
    success: false,
    message: 'Something went wrong. Please try again.',
  });
});

let serverInstance = null;

const startServer = async () => {
  if (isProduction && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
    logger.error('JWT_SECRET must be set to a random value of at least 32 characters in production.');
    process.exit(1);
  }

  await runMigrations({ includeBootstrap: false });

  serverInstance = app.listen(PORT, HOST, () => {
    logger.info(`Server listening on http://${HOST}:${PORT} (${process.env.NODE_ENV || 'development'})`);
  });

  const gracefulShutdown = async (signal) => {
    logger.info(`Received ${signal}; shutting down gracefully...`);
    if (serverInstance) {
      await new Promise((resolve) => serverInstance.close(resolve));
    }
    await db.close();
    logger.info('Database connection closed cleanly. Exiting.');
    process.exit(0);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  return serverInstance;
};

if (require.main === module) {
  startServer().catch((err) => {
    logger.error('Fatal server startup error', { error: err.message });
    process.exit(1);
  });
}

module.exports = app;
module.exports.startServer = startServer;

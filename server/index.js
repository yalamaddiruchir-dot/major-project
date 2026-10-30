const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const db = require('./database/connection');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:3000')
  .split(',').map((origin) => origin.trim()).filter(Boolean);

app.disable('x-powered-by');
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS'));
  },
  credentials: false,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/lessons', require('./routes/lessons'));
app.use('/api/progress', require('./routes/progress'));
app.use('/api/assessments', require('./routes/assessments'));
app.use('/api/users', require('./routes/users'));
app.use('/api/upload', require('./routes/upload'));

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  dotfiles: 'deny',
  index: false,
  fallthrough: false,
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
}));

app.get('/api/health', async (_req, res) => {
  try {
    await db.query('SELECT 1 AS healthy');
    res.json({ status: 'OK', database: 'connected', message: 'Server is running' });
  } catch (_error) {
    res.status(503).json({ status: 'ERROR', database: 'unavailable' });
  }
});

app.use((err, _req, res, _next) => {
  console.error('Request error:', err.message);
  if (err instanceof require('multer').MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({ success: false, message: err.code === 'LIMIT_FILE_SIZE' ? 'Video exceeds the 250 MB upload limit.' : err.message });
  }
  if (err.message && (err.message.startsWith('Unsupported video') || err.message.includes('CORS'))) {
    return res.status(400).json({ success: false, message: err.message });
  }
  res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
});

if (require.main === module) {
  if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
    console.error('JWT_SECRET must be set to a random value of at least 32 characters in production.');
    process.exit(1);
  }
  app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    try {
      await db.query('SELECT 1 AS healthy');
      console.log('Database connected successfully');
    } catch (error) {
      console.error('Database connection error:', error.message);
      process.exitCode = 1;
    }
  });
}

module.exports = app;

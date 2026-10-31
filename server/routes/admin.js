const express = require('express');
const { auth, authorize } = require('../middleware/auth');
const { createBackup, validateBackup, listBackups, restoreBackup } = require('../utils/backup');
const logger = require('../utils/logger');

const router = express.Router();

// List database backups (safe metadata only — never exposes sensitive user data)
router.get('/backups', auth, authorize('admin'), async (_req, res) => {
  try {
    const backups = await listBackups();
    return res.json({ success: true, backups });
  } catch (error) {
    logger.error('List backups error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error listing backups' });
  }
});

// Create and validate a new database backup
router.post('/backups', auth, authorize('admin'), async (req, res) => {
  try {
    const label = req.body?.label || 'admin';
    const backup = await createBackup({ label });
    logger.security('Admin triggered database backup', { adminId: req.user.id, filename: backup.filename });
    return res.status(201).json({
      success: true,
      message: 'Database backup created and verified.',
      backup,
    });
  } catch (error) {
    logger.error('Create backup error', { error: error.message });
    return res.status(500).json({ success: false, message: error.message || 'Error creating backup' });
  }
});

// Validate a specific backup file
router.post('/backups/:filename/verify', auth, authorize('admin'), async (req, res) => {
  try {
    const result = await validateBackup(req.params.filename);
    return res.status(result.valid ? 200 : 400).json({
      success: result.valid,
      validation: result,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

// Restore database from a verified backup
router.post('/backups/:filename/restore', auth, authorize('admin'), async (req, res) => {
  try {
    const result = await restoreBackup(req.params.filename);
    return res.json({
      success: true,
      message: 'Database restored successfully.',
      restore: result,
    });
  } catch (error) {
    logger.error('Restore backup error', { error: error.message });
    return res.status(400).json({ success: false, message: error.message || 'Error restoring backup' });
  }
});

module.exports = router;

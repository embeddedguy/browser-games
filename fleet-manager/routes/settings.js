const express = require('express');
const { db, nowISO, writeAudit } = require('../database');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/settings
router.get('/', requireRole('admin', 'supervisor'), (req, res) => {
  const rows = db.prepare('SELECT key, value FROM app_settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json({
    downtimeWarningDays: parseInt(settings.downtime_warning_days || '5', 10)
  });
});

// PATCH /api/settings
router.patch('/', requireRole('admin'), (req, res) => {
  const { downtimeWarningDays } = req.body;
  if (downtimeWarningDays !== undefined) {
    const val = parseInt(downtimeWarningDays, 10);
    if (isNaN(val) || val < 1) return res.status(400).json({ error: 'downtimeWarningDays must be a positive integer' });
    db.prepare("INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES ('downtime_warning_days', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_by=excluded.updated_by, updated_at=excluded.updated_at")
      .run(String(val), req.user.userId, nowISO());
    writeAudit(req.user, 'UPDATE_SETTING', 'setting', 'downtime_warning_days', { value: val });
  }
  res.json({ downtimeWarningDays: parseInt(db.prepare("SELECT value FROM app_settings WHERE key='downtime_warning_days'").get().value, 10) });
});

module.exports = router;

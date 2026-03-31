const express = require('express');
const { db, genId, writeAudit } = require('../database');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/locations
router.get('/', (req, res) => {
  const locs = db.prepare('SELECT * FROM locations WHERE active = 1 ORDER BY is_custom, site_name, sub_location').all();
  res.json(locs.map(l => ({ id: l.id, siteName: l.site_name, subLocation: l.sub_location, isCustom: !!l.is_custom })));
});

// POST /api/locations  (admin: add official location)
router.post('/', requireRole('admin'), (req, res) => {
  const { siteName, subLocation } = req.body;
  if (!siteName || !subLocation) return res.status(400).json({ error: 'Site name and sub-location required' });
  const id = genId();
  db.prepare('INSERT INTO locations (id, site_name, sub_location, is_custom, active) VALUES (?, ?, ?, 0, 1)')
    .run(id, siteName.trim(), subLocation.trim());
  writeAudit(req.user, 'ADD_LOCATION', 'location', id, { siteName, subLocation });
  res.status(201).json({ id, siteName: siteName.trim(), subLocation: subLocation.trim(), isCustom: false });
});

// POST /api/locations/custom  (any user: save a custom "Other" location)
router.post('/custom', (req, res) => {
  const { siteName, subLocation } = req.body;
  if (!siteName || !subLocation) return res.status(400).json({ error: 'siteName and subLocation required' });
  // Check if it already exists
  const existing = db.prepare('SELECT * FROM locations WHERE site_name = ? COLLATE NOCASE AND sub_location = ? COLLATE NOCASE').get(siteName.trim(), subLocation.trim());
  if (existing) {
    // Reactivate if needed
    if (!existing.active) db.prepare('UPDATE locations SET active = 1 WHERE id = ?').run(existing.id);
    return res.json({ id: existing.id, siteName: existing.site_name, subLocation: existing.sub_location, isCustom: !!existing.is_custom });
  }
  const id = genId();
  db.prepare('INSERT INTO locations (id, site_name, sub_location, is_custom, active) VALUES (?, ?, ?, 1, 1)')
    .run(id, siteName.trim(), subLocation.trim());
  res.status(201).json({ id, siteName: siteName.trim(), subLocation: subLocation.trim(), isCustom: true });
});

// PATCH /api/locations/:id  (admin: deactivate, reactivate, or promote)
router.patch('/:id', requireRole('admin'), (req, res) => {
  const { active, isCustom } = req.body;
  const loc = db.prepare('SELECT * FROM locations WHERE id = ?').get(req.params.id);
  if (!loc) return res.status(404).json({ error: 'Location not found' });

  const newActive   = active   === undefined ? loc.active    : (active   ? 1 : 0);
  const newIsCustom = isCustom === undefined ? loc.is_custom : (isCustom ? 1 : 0);

  db.prepare('UPDATE locations SET active = ?, is_custom = ? WHERE id = ?').run(newActive, newIsCustom, loc.id);
  writeAudit(req.user, 'UPDATE_LOCATION', 'location', loc.id, { active: newActive, isCustom: newIsCustom });
  res.json({ id: loc.id, siteName: loc.site_name, subLocation: loc.sub_location, isCustom: !!newIsCustom, active: !!newActive });
});

module.exports = router;

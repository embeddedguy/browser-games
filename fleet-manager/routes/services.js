const express = require('express');
const { db, genId, nowISO, writeAudit } = require('../database');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/services
router.get('/', (req, res) => {
  const services = db.prepare('SELECT * FROM services ORDER BY name').all();
  res.json(services.map(s => ({ id: s.id, name: s.name, active: !!s.active })));
});

// POST /api/services
router.post('/', requireRole('admin'), (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Service name is required' });
  const existing = db.prepare('SELECT 1 FROM services WHERE name = ? COLLATE NOCASE AND active = 1').get(name.trim());
  if (existing) return res.status(409).json({ error: 'Service already exists' });

  const id = genId();
  db.prepare('INSERT INTO services (id, name, active, created_at) VALUES (?, ?, 1, ?)').run(id, name.trim(), nowISO());
  writeAudit(req.user, 'ADD_SERVICE', 'service', id, { name });
  res.status(201).json({ id, name: name.trim(), active: true });
});

// PATCH /api/services/:id
router.patch('/:id', requireRole('admin'), (req, res) => {
  const { active } = req.body;
  const svc = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
  if (!svc) return res.status(404).json({ error: 'Service not found' });

  const newActive = active === undefined ? svc.active : (active ? 1 : 0);
  db.prepare('UPDATE services SET active = ? WHERE id = ?').run(newActive, svc.id);
  writeAudit(req.user, newActive ? 'RESTORE_SERVICE' : 'REMOVE_SERVICE', 'service', svc.id, { name: svc.name });
  res.json({ id: svc.id, name: svc.name, active: !!newActive });
});

module.exports = router;

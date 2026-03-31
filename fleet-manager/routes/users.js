const express = require('express');
const { db, genId, nowISO, hashPassword, writeAudit } = require('../database');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/users
router.get('/', requireRole('admin'), (req, res) => {
  const users = db.prepare('SELECT id, username, display_name, role, created_at FROM users ORDER BY display_name').all();
  res.json(users.map(u => ({ id: u.id, username: u.username, displayName: u.display_name, role: u.role, createdAt: u.created_at })));
});

// GET /api/users/techs  — for assignment dropdowns
router.get('/techs', requireRole('admin', 'supervisor'), (req, res) => {
  const users = db.prepare("SELECT id, display_name FROM users WHERE role IN ('tech','supervisor') ORDER BY display_name").all();
  res.json(users.map(u => ({ id: u.id, displayName: u.display_name })));
});

// POST /api/users
router.post('/', requireRole('admin'), (req, res) => {
  const { username, displayName, password, role } = req.body;
  if (!username || !displayName || !password || !role) return res.status(400).json({ error: 'All fields required' });
  if (!['admin','supervisor','tech','user'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  const existing = db.prepare('SELECT 1 FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'Username already exists' });

  const id = genId();
  db.prepare('INSERT INTO users (id, username, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, username.trim(), hashPassword(password), displayName.trim(), role, nowISO());

  writeAudit(req.user, 'CREATE_USER', 'user', id, { username, role });
  const user = db.prepare('SELECT id, username, display_name, role, created_at FROM users WHERE id = ?').get(id);
  res.status(201).json({ id: user.id, username: user.username, displayName: user.display_name, role: user.role, createdAt: user.created_at });
});

// PATCH /api/users/:id
router.patch('/:id', requireRole('admin'), (req, res) => {
  const { displayName, password, role } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const newName = displayName ? displayName.trim() : user.display_name;
  const newRole = role || user.role;
  const newHash = password ? hashPassword(password) : user.password_hash;

  if (role && !['admin','supervisor','tech','user'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

  db.prepare('UPDATE users SET display_name = ?, role = ?, password_hash = ? WHERE id = ?')
    .run(newName, newRole, newHash, user.id);

  writeAudit(req.user, 'UPDATE_USER', 'user', user.id, { displayName: newName, role: newRole });
  const updated = db.prepare('SELECT id, username, display_name, role FROM users WHERE id = ?').get(user.id);
  res.json({ id: updated.id, username: updated.username, displayName: updated.display_name, role: updated.role });
});

// DELETE /api/users/:id
router.delete('/:id', requireRole('admin'), (req, res) => {
  if (req.params.id === req.user.userId) return res.status(400).json({ error: 'Cannot delete your own account' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'admin') {
    const adminCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get().c;
    if (adminCount <= 1) return res.status(400).json({ error: 'Cannot delete the last admin account' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  writeAudit(req.user, 'DELETE_USER', 'user', user.id, { username: user.username });
  res.json({ success: true });
});

module.exports = router;

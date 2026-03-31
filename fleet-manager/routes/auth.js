const express = require('express');
const jwt     = require('jsonwebtoken');
const { db, verifyPassword } = require('../database');
const { JWT_SECRET, requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const payload = { userId: user.id, username: user.username, displayName: user.display_name, role: user.role };
  const token   = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

  res.json({ token, user: { id: user.id, username: user.username, displayName: user.display_name, role: user.role } });
});

// GET /api/auth/me  — verify token + return current user
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, username, display_name, role FROM users WHERE id = ?').get(req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user.id, username: user.username, displayName: user.display_name, role: user.role });
});

module.exports = router;

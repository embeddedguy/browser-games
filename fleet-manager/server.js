const express = require('express');
const path    = require('path');
const os      = require('os');
const { db, nowISO }  = require('./database');

// Run seed on startup
require('./database').seedIfEmpty ? require('./database').seedIfEmpty() : null;
// Re-export seedIfEmpty correctly
const { seedIfEmpty } = require('./database');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/users',     require('./routes/users'));
app.use('/api/assets',    require('./routes/assets'));
app.use('/api/workshop',  require('./routes/workshop'));
app.use('/api/services',  require('./routes/services'));
app.use('/api/locations', require('./routes/locations'));
app.use('/api/settings',  require('./routes/settings'));
app.use('/api/reports',   require('./routes/reports'));

// Fallback — serve index.html for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Global error handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ───────────────────────────────────────────────────────────────────
seedIfEmpty();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\nFleet Asset Manager running on port ${PORT}`);
  console.log(`  Local:   http://localhost:${PORT}`);

  // Print LAN IP
  const nets = os.networkInterfaces();
  for (const iface of Object.values(nets)) {
    for (const net of iface) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  Network: http://${net.address}:${PORT}  ← share with tablets`);
      }
    }
  }
  console.log('\nPress Ctrl+C to stop.\n');
});

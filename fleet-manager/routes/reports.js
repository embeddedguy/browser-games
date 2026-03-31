const express = require('express');
const { db }  = require('../database');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('supervisor', 'admin'));

function getSettings() {
  const row = db.prepare("SELECT value FROM app_settings WHERE key='downtime_warning_days'").get();
  return { downtimeWarningDays: parseInt(row?.value || '5', 10) };
}

// GET /api/reports/dashboard
router.get('/dashboard', (req, res) => {
  const { downtimeWarningDays } = getSettings();
  const assets = db.prepare('SELECT a.id, a.serial, a.description, s.status, s.flagged, s.disabled_since FROM assets a LEFT JOIN asset_states s ON s.asset_id=a.id').all();
  const activeJobs = db.prepare("SELECT asset_id FROM workshop_jobs WHERE released_at IS NULL").all().map(j => j.asset_id);

  let operational = 0, inWorkshop = 0, disabled = 0, flagged = 0;
  const downtimeAssets = [];

  assets.forEach(a => {
    if (a.flagged) { flagged++; return; }
    if (a.status === 'Disabled' && activeJobs.includes(a.id)) { inWorkshop++; }
    else if (a.status === 'Disabled') {
      disabled++;
      if (a.disabled_since) {
        const days = Math.floor((Date.now() - new Date(a.disabled_since).getTime()) / 86400000);
        if (days >= downtimeWarningDays) downtimeAssets.push({ id: a.id, serial: a.serial, description: a.description, daysDisabled: days });
      }
    } else {
      operational++;
    }
  });

  // Maintenance compliance: no service in 90 days
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
  const complianceAssets = assets.filter(a => {
    const last = db.prepare('SELECT MAX(timestamp) as t FROM service_log WHERE asset_id=?').get(a.id);
    return !last?.t || last.t < cutoff;
  }).map(a => {
    const last = db.prepare('SELECT MAX(timestamp) as t FROM service_log WHERE asset_id=?').get(a.id);
    return { id: a.id, serial: a.serial, description: a.description, lastServiceDate: last?.t || null };
  });

  res.json({
    stats: { total: assets.length, operational, inWorkshop, disabled, flagged },
    downtimeAssets: downtimeAssets.sort((a, b) => b.daysDisabled - a.daysDisabled),
    complianceAssets
  });
});

// GET /api/reports/audit
router.get('/audit', (req, res) => {
  const limit = parseInt(req.query.limit || '200', 10);
  const rows  = db.prepare('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?').all(limit);
  res.json(rows.map(r => ({
    id: r.id, userName: r.user_name, userRole: r.user_role,
    action: r.action, entityType: r.entity_type, entityId: r.entity_id,
    details: r.details, timestamp: r.timestamp
  })));
});

// GET /api/reports/audit/export  — CSV
router.get('/audit/export', (req, res) => {
  const rows = db.prepare('SELECT * FROM audit_log ORDER BY timestamp DESC').all();
  const lines = ['Timestamp,User,Role,Action,Entity Type,Entity ID,Details'];
  rows.forEach(r => {
    const row = [r.timestamp, r.user_name, r.user_role, r.action, r.entity_type || '', r.entity_id || '', (r.details || '').replace(/,/g, ';')];
    lines.push(row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));
  });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
  res.send(lines.join('\r\n'));
});

// GET /api/reports/fleet/export  — CSV
router.get('/fleet/export', (req, res) => {
  const rows = db.prepare(`
    SELECT a.serial, a.description, s.status, s.flagged, l.site_name, l.sub_location,
           s.custom_location, s.disabled_since, s.last_updated_at
    FROM assets a
    LEFT JOIN asset_states s ON s.asset_id=a.id
    LEFT JOIN locations l ON l.id=s.location_id
    ORDER BY a.description
  `).all();

  const lines = ['Serial/VIN,Description,Status,Flagged,Location,Disabled Since,Last Updated'];
  rows.forEach(r => {
    const loc = r.site_name ? `${r.site_name} — ${r.sub_location}` : (r.custom_location || '');
    const row = [r.serial, r.description, r.status, r.flagged ? 'Yes' : 'No', loc, r.disabled_since || '', r.last_updated_at || ''];
    lines.push(row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));
  });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="fleet-status.csv"');
  res.send(lines.join('\r\n'));
});

module.exports = router;

const express = require('express');
const { db, genId, nowISO, writeAudit, locationDisplay } = require('../database');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveLocation(locationId, customLocation) {
  if (locationId) {
    const loc = db.prepare('SELECT * FROM locations WHERE id = ?').get(locationId);
    return loc ? locationDisplay(loc) : '';
  }
  return customLocation || '';
}

function buildAssetSummary(asset, state, job) {
  const display = resolveLocation(state?.location_id, state?.custom_location);
  return {
    id: asset.id,
    serial: asset.serial,
    description: asset.description,
    registeredAt: asset.registered_at,
    state: state ? {
      status:          state.status,
      flagged:         !!state.flagged,
      flagReason:      state.flag_reason,
      locationId:      state.location_id,
      locationDisplay: display,
      disabledSince:   state.disabled_since,
      lastUpdatedAt:   state.last_updated_at,
      lastUpdatedByName: state.last_updated_by
        ? (db.prepare('SELECT display_name FROM users WHERE id=?').get(state.last_updated_by)?.display_name || null)
        : null
    } : { status: 'Onsite', flagged: false },
    activeJob: job ? {
      id: job.id, jobStatus: job.job_status, priority: job.priority,
      assignedTechName: job.assigned_tech_id
        ? (db.prepare('SELECT display_name FROM users WHERE id=?').get(job.assigned_tech_id)?.display_name || null)
        : null
    } : null
  };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /api/assets
router.get('/', (req, res) => {
  const assets = db.prepare('SELECT * FROM assets ORDER BY description').all();
  const result = assets.map(asset => {
    const state = db.prepare('SELECT * FROM asset_states WHERE asset_id = ?').get(asset.id);
    const job   = db.prepare("SELECT * FROM workshop_jobs WHERE asset_id = ? AND released_at IS NULL ORDER BY created_at DESC LIMIT 1").get(asset.id);
    return buildAssetSummary(asset, state, job);
  });
  res.json(result);
});

// GET /api/assets/:id
router.get('/:id', (req, res) => {
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });

  const state     = db.prepare('SELECT * FROM asset_states WHERE asset_id = ?').get(asset.id);
  const job       = db.prepare("SELECT * FROM workshop_jobs WHERE asset_id = ? AND released_at IS NULL ORDER BY created_at DESC LIMIT 1").get(asset.id);
  const logEntries = db.prepare('SELECT * FROM service_log WHERE asset_id = ? ORDER BY timestamp DESC').all(asset.id);
  const regBy     = asset.registered_by ? db.prepare('SELECT display_name FROM users WHERE id=?').get(asset.registered_by)?.display_name : null;

  const summary  = buildAssetSummary(asset, state, job);
  summary.registeredByName = regBy;

  let activeJobDetail = null;
  if (job) {
    const tech = job.assigned_tech_id ? db.prepare('SELECT id, display_name FROM users WHERE id=?').get(job.assigned_tech_id) : null;
    activeJobDetail = {
      id: job.id, jobStatus: job.job_status, priority: job.priority,
      partsNotes: job.parts_notes, intakeAt: job.intake_at,
      assignedTech: tech ? { id: tech.id, displayName: tech.display_name } : null
    };
  }
  summary.activeJob = activeJobDetail;

  summary.serviceLog = logEntries.map(e => ({
    id: e.id, serviceName: e.service_name, loggedByName: e.logged_by_name,
    loggedByRole: e.logged_by_role, timestamp: e.timestamp, notes: e.notes,
    workshopJobId: e.workshop_job_id
  }));

  res.json(summary);
});

// POST /api/assets  (admin only)
router.post('/', requireRole('admin'), (req, res) => {
  const { serial, description } = req.body;
  if (!serial || !description) return res.status(400).json({ error: 'Serial and description required' });
  if (db.prepare('SELECT 1 FROM assets WHERE serial = ?').get(serial.trim())) {
    return res.status(409).json({ error: 'Serial/VIN already registered' });
  }
  const id = genId();
  db.prepare('INSERT INTO assets (id, serial, description, registered_by, registered_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, serial.trim(), description.trim(), req.user.userId, nowISO());
  db.prepare('INSERT INTO asset_states (id, asset_id, status, flagged, last_updated_at) VALUES (?, ?, ?, 0, ?)')
    .run(genId(), id, 'Onsite', nowISO());
  writeAudit(req.user, 'REGISTER_ASSET', 'asset', id, { serial, description });
  res.status(201).json(buildAssetSummary(
    db.prepare('SELECT * FROM assets WHERE id=?').get(id),
    db.prepare('SELECT * FROM asset_states WHERE asset_id=?').get(id),
    null
  ));
});

// PATCH /api/assets/:id/state
router.patch('/:id/state', (req, res) => {
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });

  const { locationId, customLocation, status } = req.body;

  // Role check for direct status changes:
  //   admin  → any status
  //   user   → Onsite or Deployed only
  //   tech   → cannot change status (use flag workflow)
  //   supervisor → cannot change status directly (use workshop intake/release workflow)
  const role = req.user.role;
  if ((role === 'tech' || role === 'supervisor') && status) {
    return res.status(403).json({ error: 'Status can only be changed directly by an admin. Supervisors manage status through the workshop workflow.' });
  }
  if (role === 'user' && status && !['Onsite','Deployed'].includes(status)) {
    return res.status(403).json({ error: 'Users can only set status to Onsite or Deployed' });
  }
  if (status && !['Onsite','Deployed','Disabled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  if (status === 'Deployed' && !locationId && !customLocation) {
    return res.status(400).json({ error: 'Location is required when deploying an asset' });
  }

  const current = db.prepare('SELECT * FROM asset_states WHERE asset_id = ?').get(asset.id);
  const newStatus       = status || current?.status || 'Onsite';
  const newLocationId   = locationId !== undefined   ? (locationId || null)   : current?.location_id;
  const newCustomLoc    = customLocation !== undefined ? (customLocation || null) : current?.custom_location;

  // Handle custom location saving
  let resolvedLocId = newLocationId;
  if (!resolvedLocId && newCustomLoc) {
    // Auto-save as custom location
    const parts  = newCustomLoc.split(' — ');
    const site   = parts[0] || 'Custom';
    const sub    = parts[1] || newCustomLoc;
    const exists = db.prepare('SELECT id FROM locations WHERE site_name=? AND sub_location=? COLLATE NOCASE').get(site, sub);
    if (exists) {
      resolvedLocId = exists.id;
    } else {
      const newLocId = genId();
      db.prepare('INSERT INTO locations (id, site_name, sub_location, is_custom, active) VALUES (?,?,?,1,1)').run(newLocId, site, sub);
      resolvedLocId = newLocId;
    }
  }

  const prevStatus     = current?.status;
  const disabledSince  = newStatus === 'Disabled' && prevStatus !== 'Disabled'
    ? nowISO()
    : (newStatus !== 'Disabled' ? null : current?.disabled_since);

  if (current) {
    db.prepare(`UPDATE asset_states SET location_id=?, custom_location=?, status=?, disabled_since=?,
                last_updated_by=?, last_updated_at=? WHERE asset_id=?`)
      .run(resolvedLocId, null, newStatus, disabledSince, req.user.userId, nowISO(), asset.id);
  } else {
    db.prepare('INSERT INTO asset_states (id,asset_id,location_id,custom_location,status,flagged,disabled_since,last_updated_by,last_updated_at) VALUES (?,?,?,NULL,?,0,?,?,?)')
      .run(genId(), asset.id, resolvedLocId, newStatus, disabledSince, req.user.userId, nowISO());
  }

  writeAudit(req.user, 'UPDATE_STATE', 'asset', asset.id, { status: newStatus, locationId: resolvedLocId });
  const updated = db.prepare('SELECT * FROM asset_states WHERE asset_id=?').get(asset.id);
  res.json({ status: updated.status, locationId: updated.location_id, disabledSince: updated.disabled_since });
});

// POST /api/assets/:id/flag  — tech flags as unserviceable
router.post('/:id/flag', requireRole('tech', 'supervisor', 'admin'), (req, res) => {
  const { reason } = req.body;
  if (!reason || !reason.trim()) return res.status(400).json({ error: 'Reason is required' });

  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });

  // Check no active unflagged job already
  const existingJob = db.prepare("SELECT * FROM workshop_jobs WHERE asset_id=? AND released_at IS NULL").get(asset.id);
  if (existingJob) return res.status(409).json({ error: 'Asset already has an active workshop job' });

  const jobId = genId();
  db.prepare('INSERT INTO workshop_jobs (id,asset_id,job_status,priority,flagged_by,created_at) VALUES (?,?,?,?,?,?)')
    .run(jobId, asset.id, 'Flagged', 'Normal', req.user.userId, nowISO());
  db.prepare('UPDATE asset_states SET flagged=1, flag_reason=?, last_updated_by=?, last_updated_at=? WHERE asset_id=?')
    .run(reason.trim(), req.user.userId, nowISO(), asset.id);

  writeAudit(req.user, 'FLAG_ASSET', 'asset', asset.id, { reason });
  res.status(201).json({ jobId, reason: reason.trim() });
});

// POST /api/assets/:id/log  — log a service entry against the asset
router.post('/:id/log', requireRole('tech', 'supervisor', 'admin'), (req, res) => {
  const { serviceId, serviceName, notes } = req.body;
  if (!serviceName) return res.status(400).json({ error: 'serviceName is required' });

  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });

  const roleLabel = { tech: 'Technician', supervisor: 'Supervisor', admin: 'Admin' }[req.user.role] || 'User';
  const id = genId();
  db.prepare('INSERT INTO service_log (id,asset_id,workshop_job_id,service_id,service_name,logged_by_id,logged_by_name,logged_by_role,timestamp,notes) VALUES (?,?,NULL,?,?,?,?,?,?,?)')
    .run(id, asset.id, serviceId || null, serviceName, req.user.userId, req.user.displayName, roleLabel, nowISO(), notes || null);

  writeAudit(req.user, 'LOG_SERVICE', 'asset', asset.id, { serviceName });
  res.status(201).json({ id, serviceName, loggedByName: req.user.displayName, loggedByRole: roleLabel, timestamp: nowISO(), notes: notes || null });
});

module.exports = router;

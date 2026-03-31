const express = require('express');
const { db, genId, nowISO, writeAudit, locationDisplay } = require('../database');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('supervisor', 'admin'));

function enrichJob(job) {
  const asset = db.prepare('SELECT id, serial, description FROM assets WHERE id=?').get(job.asset_id);
  const tech  = job.assigned_tech_id
    ? db.prepare('SELECT id, display_name FROM users WHERE id=?').get(job.assigned_tech_id)
    : null;
  const log   = db.prepare('SELECT * FROM service_log WHERE workshop_job_id=? ORDER BY timestamp DESC').all(job.id);
  const created = new Date(job.created_at || job.intake_at || new Date());
  const days  = Math.floor((Date.now() - created.getTime()) / 86400000);

  return {
    id: job.id,
    jobStatus:  job.job_status,
    priority:   job.priority,
    partsNotes: job.parts_notes,
    intakeAt:   job.intake_at,
    createdAt:  job.created_at,
    daysInShop: days,
    asset:      asset ? { id: asset.id, serial: asset.serial, description: asset.description } : null,
    assignedTech: tech ? { id: tech.id, displayName: tech.display_name } : null,
    serviceLog: log.map(e => ({
      id: e.id, serviceName: e.service_name, loggedByName: e.logged_by_name,
      loggedByRole: e.logged_by_role, timestamp: e.timestamp, notes: e.notes
    }))
  };
}

// GET /api/workshop
router.get('/', (req, res) => {
  const jobs = db.prepare("SELECT * FROM workshop_jobs WHERE released_at IS NULL ORDER BY CASE priority WHEN 'Urgent' THEN 0 WHEN 'Normal' THEN 1 ELSE 2 END, created_at ASC").all();
  res.json(jobs.map(enrichJob));
});

// POST /api/workshop  — formal intake (supervisor converts flag → Waiting, or intakes directly)
router.post('/', (req, res) => {
  const { assetId, assignedTechId, priority, locationId } = req.body;
  if (!assetId) return res.status(400).json({ error: 'assetId is required' });
  if (!locationId) return res.status(400).json({ error: 'Workshop location is required' });

  const asset = db.prepare('SELECT * FROM assets WHERE id=?').get(assetId);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });

  const existingJob = db.prepare("SELECT * FROM workshop_jobs WHERE asset_id=? AND released_at IS NULL").get(assetId);
  const prio = priority || 'Normal';

  let jobId;
  if (existingJob && existingJob.job_status === 'Flagged') {
    // Promote existing flagged job to Waiting
    db.prepare("UPDATE workshop_jobs SET job_status='Waiting', assigned_tech_id=?, priority=?, intake_by=?, intake_at=? WHERE id=?")
      .run(assignedTechId || null, prio, req.user.userId, nowISO(), existingJob.id);
    jobId = existingJob.id;
  } else if (!existingJob) {
    // Fresh intake
    jobId = genId();
    db.prepare('INSERT INTO workshop_jobs (id,asset_id,assigned_tech_id,job_status,priority,intake_by,intake_at,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(jobId, assetId, assignedTechId || null, 'Waiting', prio, req.user.userId, nowISO(), nowISO());
  } else {
    return res.status(409).json({ error: 'Asset already has an active non-flagged job' });
  }

  // Update asset state → Disabled at workshop location
  const workshopLoc = db.prepare('SELECT * FROM locations WHERE id=?').get(locationId);
  db.prepare('UPDATE asset_states SET status=?, location_id=?, custom_location=NULL, flagged=0, disabled_since=?, last_updated_by=?, last_updated_at=? WHERE asset_id=?')
    .run('Disabled', locationId, nowISO(), req.user.userId, nowISO(), assetId);

  writeAudit(req.user, 'INTAKE_WORKSHOP', 'asset', assetId, { jobId, location: workshopLoc ? locationDisplay(workshopLoc) : locationId });
  res.status(201).json(enrichJob(db.prepare('SELECT * FROM workshop_jobs WHERE id=?').get(jobId)));
});

// PATCH /api/workshop/:id
router.patch('/:id', (req, res) => {
  const job = db.prepare('SELECT * FROM workshop_jobs WHERE id=?').get(req.params.id);
  if (!job || job.released_at) return res.status(404).json({ error: 'Job not found or already closed' });

  const { jobStatus, assignedTechId, partsNotes, priority } = req.body;
  const validStatuses = ['Flagged','Waiting','In Progress','Awaiting Parts','Ready for Release'];
  if (jobStatus && !validStatuses.includes(jobStatus)) return res.status(400).json({ error: 'Invalid job status' });

  db.prepare('UPDATE workshop_jobs SET job_status=COALESCE(?,job_status), assigned_tech_id=COALESCE(?,assigned_tech_id), parts_notes=COALESCE(?,parts_notes), priority=COALESCE(?,priority) WHERE id=?')
    .run(jobStatus || null, assignedTechId !== undefined ? assignedTechId : null, partsNotes !== undefined ? partsNotes : null, priority || null, job.id);

  writeAudit(req.user, 'UPDATE_JOB', 'workshop_job', job.id, { jobStatus, assignedTechId, priority });
  res.json(enrichJob(db.prepare('SELECT * FROM workshop_jobs WHERE id=?').get(job.id)));
});

// POST /api/workshop/:id/log  — log service against a job
router.post('/:id/log', (req, res) => {
  const job = db.prepare('SELECT * FROM workshop_jobs WHERE id=?').get(req.params.id);
  if (!job || job.released_at) return res.status(404).json({ error: 'Job not found or already closed' });

  const { serviceId, serviceName, notes } = req.body;
  if (!serviceName) return res.status(400).json({ error: 'serviceName is required' });

  const roleLabel = { supervisor: 'Supervisor', admin: 'Admin', tech: 'Technician' }[req.user.role] || 'User';
  const id = genId();
  db.prepare('INSERT INTO service_log (id,asset_id,workshop_job_id,service_id,service_name,logged_by_id,logged_by_name,logged_by_role,timestamp,notes) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(id, job.asset_id, job.id, serviceId || null, serviceName, req.user.userId, req.user.displayName, roleLabel, nowISO(), notes || null);

  writeAudit(req.user, 'LOG_SERVICE_JOB', 'workshop_job', job.id, { serviceName });
  res.status(201).json({ id, serviceName, loggedByName: req.user.displayName, loggedByRole: roleLabel, timestamp: nowISO(), notes: notes || null });
});

// POST /api/workshop/:id/release
router.post('/:id/release', (req, res) => {
  const job = db.prepare('SELECT * FROM workshop_jobs WHERE id=?').get(req.params.id);
  if (!job || job.released_at) return res.status(404).json({ error: 'Job not found or already closed' });
  if (job.job_status !== 'Ready for Release') return res.status(400).json({ error: 'Job must be in Ready for Release status' });

  const { locationId, customLocation } = req.body;
  if (!locationId && !customLocation) return res.status(400).json({ error: 'New location is required' });

  let resolvedLocId = locationId || null;
  if (!resolvedLocId && customLocation) {
    const parts = customLocation.split(' — ');
    const site  = parts[0] || 'Custom';
    const sub   = parts[1] || customLocation;
    const ex    = db.prepare('SELECT id FROM locations WHERE site_name=? AND sub_location=? COLLATE NOCASE').get(site, sub);
    resolvedLocId = ex ? ex.id : (() => { const lid = genId(); db.prepare('INSERT INTO locations (id,site_name,sub_location,is_custom,active) VALUES (?,?,?,1,1)').run(lid, site, sub); return lid; })();
  }

  db.prepare('UPDATE workshop_jobs SET job_status=?, released_by=?, released_at=? WHERE id=?')
    .run('Ready for Release', req.user.userId, nowISO(), job.id);
  db.prepare('UPDATE asset_states SET status=?, location_id=?, custom_location=NULL, flagged=0, flag_reason=NULL, disabled_since=NULL, last_updated_by=?, last_updated_at=? WHERE asset_id=?')
    .run('Onsite', resolvedLocId, req.user.userId, nowISO(), job.asset_id);

  writeAudit(req.user, 'RELEASE_WORKSHOP', 'asset', job.asset_id, { jobId: job.id, locationId: resolvedLocId });
  res.json({ success: true, jobId: job.id });
});

module.exports = router;

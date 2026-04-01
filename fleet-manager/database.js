const { DatabaseSync } = require('node:sqlite');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');

// Ensure data directory exists
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'fleet.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// ─── Schema ───────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    username     TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role         TEXT NOT NULL CHECK(role IN ('admin','supervisor','tech','user')),
    created_at   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS assets (
    id              TEXT PRIMARY KEY,
    serial          TEXT UNIQUE NOT NULL COLLATE NOCASE,
    description     TEXT NOT NULL,
    registered_by   TEXT,
    registered_at   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS asset_states (
    id                  TEXT PRIMARY KEY,
    asset_id            TEXT UNIQUE NOT NULL,
    location_id         TEXT,
    custom_location     TEXT,
    status              TEXT NOT NULL DEFAULT 'Onsite'
                          CHECK(status IN ('Onsite','Deployed','Disabled')),
    flagged             INTEGER NOT NULL DEFAULT 0,
    flag_reason         TEXT,
    disabled_since      TEXT,
    last_updated_by     TEXT,
    last_updated_at     TEXT,
    FOREIGN KEY (asset_id) REFERENCES assets(id)
  );

  CREATE TABLE IF NOT EXISTS workshop_jobs (
    id               TEXT PRIMARY KEY,
    asset_id         TEXT NOT NULL,
    assigned_tech_id TEXT,
    job_status       TEXT NOT NULL DEFAULT 'Flagged'
                       CHECK(job_status IN ('Flagged','Waiting','In Progress','Awaiting Parts','Ready for Release')),
    priority         TEXT NOT NULL DEFAULT 'Normal'
                       CHECK(priority IN ('Urgent','Normal','Scheduled')),
    parts_notes      TEXT,
    flagged_by       TEXT,
    intake_by        TEXT,
    intake_at        TEXT,
    released_by      TEXT,
    released_at      TEXT,
    created_at       TEXT NOT NULL,
    FOREIGN KEY (asset_id) REFERENCES assets(id)
  );

  CREATE TABLE IF NOT EXISTS service_log (
    id               TEXT PRIMARY KEY,
    asset_id         TEXT NOT NULL,
    workshop_job_id  TEXT,
    service_id       TEXT,
    service_name     TEXT NOT NULL,
    logged_by_id     TEXT,
    logged_by_name   TEXT NOT NULL,
    logged_by_role   TEXT NOT NULL,
    timestamp        TEXT NOT NULL,
    notes            TEXT,
    FOREIGN KEY (asset_id) REFERENCES assets(id),
    FOREIGN KEY (workshop_job_id) REFERENCES workshop_jobs(id)
  );

  CREATE TABLE IF NOT EXISTS services (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    active     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS locations (
    id           TEXT PRIMARY KEY,
    site_name    TEXT NOT NULL,
    sub_location TEXT NOT NULL,
    is_custom    INTEGER NOT NULL DEFAULT 0,
    active       INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_by TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id          TEXT PRIMARY KEY,
    user_id     TEXT,
    user_name   TEXT NOT NULL,
    user_role   TEXT NOT NULL,
    action      TEXT NOT NULL,
    entity_type TEXT,
    entity_id   TEXT,
    details     TEXT,
    timestamp   TEXT NOT NULL
  );
`);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function genId() {
  return Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

function nowISO() {
  return new Date().toISOString();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const attempt = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return hash === attempt;
}

function writeAudit(user, action, entityType, entityId, details) {
  db.prepare(`
    INSERT INTO audit_log (id, user_id, user_name, user_role, action, entity_type, entity_id, details, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    genId(),
    user.id || user.userId || null,
    user.displayName || user.display_name || 'System',
    user.role || 'system',
    action,
    entityType || null,
    entityId || null,
    details ? JSON.stringify(details) : null,
    nowISO()
  );
}

function locationDisplay(loc) {
  if (!loc) return '';
  return `${loc.site_name} — ${loc.sub_location}`;
}

// ─── Seed Data ────────────────────────────────────────────────────────────────

function seedIfEmpty() {
  // Default admin
  if (!db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
    db.prepare(`
      INSERT INTO users (id, username, password_hash, display_name, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(genId(), 'admin', hashPassword('admin123'), 'Administrator', 'admin', nowISO());
    console.log('  ✓ Default admin created (admin / admin123)');
  }

  // Default settings
  if (!db.prepare("SELECT 1 FROM app_settings WHERE key='downtime_warning_days'").get()) {
    db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('downtime_warning_days', '5', ?)")
      .run(nowISO());
  }

  // Service catalog
  if (!db.prepare('SELECT 1 FROM services LIMIT 1').get()) {
    const services = [
      'Oil & Filter Change',
      'Air Filter Replacement',
      'Fuel Filter Replacement',
      'Hydraulic Oil & Filter Change',
      'Coolant Flush & Fill',
      'Battery Inspection & Replacement',
      'Tire Inspection & Rotation',
      'Brake Inspection & Service',
      'Engine Tune-Up',
      'Transmission Service',
      'Drive Belt Replacement',
      'Undercarriage Inspection & Cleaning',
      'Greasing & Lubrication',
      'Track Tension Adjustment',
      'Bucket/Attachment Inspection',
      'Electrical System Diagnosis & Repair',
      'Pre-Delivery Inspection (PDI)',
      'Annual Safety Inspection',
      'Welding & Structural Repair',
      'Emissions Test & Service'
    ];
    const insertSvc = db.prepare('INSERT INTO services (id, name, active, created_at) VALUES (?, ?, 1, ?)');
    services.forEach(name => insertSvc.run(genId(), name, nowISO()));
    console.log('  ✓ 20 services seeded');
  }

  // Locations
  if (!db.prepare('SELECT 1 FROM locations LIMIT 1').get()) {
    const sites = [
      { site: 'Main Depot',     subs: ['Workshop', 'Storage Yard', 'Parking Bay', 'Fueling Station'] },
      { site: 'North Site',     subs: ['Workshop', 'Laydown Area', 'Site Entrance', 'Fuel Point'] },
      { site: 'South Site',     subs: ['Workshop', 'Equipment Park', 'Materials Storage', 'Guard Post'] },
      { site: 'East Yard',      subs: ['Workshop', 'Heavy Equipment Bay', 'Parts Store', 'Wash Bay'] },
      { site: 'West Compound',  subs: ['Workshop', 'Open Yard', 'Container Storage', 'Office Park'] }
    ];
    const insertLoc = db.prepare('INSERT INTO locations (id, site_name, sub_location, is_custom, active) VALUES (?, ?, ?, 0, 1)');
    sites.forEach(({ site, subs }) => subs.forEach(sub => insertLoc.run(genId(), site, sub)));
    console.log('  ✓ 20 predefined locations seeded');
  }

  // Sample assets
  if (!db.prepare('SELECT 1 FROM assets LIMIT 1').get()) {
    const samples = [
      // Excavators
      { serial: 'CAT320-001',        desc: 'CAT 320 Excavator — Unit 1' },
      { serial: 'CAT320-002',        desc: 'CAT 320 Excavator — Unit 2' },
      { serial: 'KOM390-003',        desc: 'Komatsu PC390 Excavator — Unit 3' },
      { serial: 'KOM390-004',        desc: 'Komatsu PC390 Excavator — Unit 4' },
      { serial: 'HIT520-005',        desc: 'Hitachi ZX520 Excavator — Unit 5' },
      // Light Vehicles
      { serial: '1FM5K8D80LGA12301', desc: 'Ford F-150 Pickup — Site Supervisor 1' },
      { serial: '1FM5K8D80LGA12302', desc: 'Ford F-150 Pickup — Site Supervisor 2' },
      { serial: '1GNSKBKC9LR123401', desc: 'Chevrolet Tahoe — Operations Manager' },
      { serial: '1GNSKBKC9LR123402', desc: 'Chevrolet Tahoe — Safety Officer' },
      { serial: 'JTJHY7AX9L4001501', desc: 'Toyota Land Cruiser — Field Coordinator' },
      // Bulldozers
      { serial: 'CAT-D6-001',        desc: 'CAT D6 Bulldozer — Unit 1' },
      { serial: 'CAT-D6-002',        desc: 'CAT D6 Bulldozer — Unit 2' },
      { serial: 'KOM-D65-003',       desc: 'Komatsu D65 Bulldozer — Unit 3' },
      { serial: 'KOM-D65-004',       desc: 'Komatsu D65 Bulldozer — Unit 4' },
      { serial: 'JD-850-005',        desc: 'John Deere 850K Bulldozer — Unit 5' },
      // Cranes
      { serial: 'LBH-LTM1100-001',   desc: 'Liebherr LTM 1100 Mobile Crane — Unit 1' },
      { serial: 'LBH-LTM1100-002',   desc: 'Liebherr LTM 1100 Mobile Crane — Unit 2' },
      { serial: 'GROVE-GMK4090-003', desc: 'Grove GMK4090 All-Terrain Crane — Unit 3' },
      { serial: 'GROVE-GMK4090-004', desc: 'Grove GMK4090 All-Terrain Crane — Unit 4' },
      { serial: 'TADANO-GR700-005',  desc: 'Tadano GR-700XL Rough Terrain Crane — Unit 5' }
    ];
    const insertAsset = db.prepare('INSERT INTO assets (id, serial, description, registered_by, registered_at) VALUES (?, ?, ?, NULL, ?)');
    const insertState = db.prepare(`
      INSERT INTO asset_states (id, asset_id, location_id, custom_location, status, flagged, last_updated_at)
      VALUES (?, ?, ?, NULL, ?, 0, ?)
    `);
    const yardLoc = db.prepare("SELECT id FROM locations WHERE sub_location='Parking Bay' AND site_name='Main Depot'").get();
    const siteLoc = db.prepare("SELECT id FROM locations WHERE sub_location='Site Entrance' AND site_name='North Site'").get();
    const statuses = ['Onsite','Onsite','Onsite','Deployed','Deployed'];
    samples.forEach(({ serial, desc }, i) => {
      const id = genId();
      insertAsset.run(id, serial, desc, nowISO());
      const status = statuses[i % statuses.length];
      const locId  = status === 'Deployed' ? (siteLoc ? siteLoc.id : null) : (yardLoc ? yardLoc.id : null);
      insertState.run(genId(), id, locId, status, nowISO());
    });
    console.log('  ✓ 20 sample assets seeded');
  }

  // Service log history — realistic demo data
  if (!db.prepare('SELECT 1 FROM service_log LIMIT 1').get()) {
    const assets   = db.prepare('SELECT id FROM assets').all();
    const services = db.prepare('SELECT id, name FROM services').all();

    const techStaff = [
      { name: 'James Wilson',   role: 'Technician' },
      { name: 'Maria Chen',     role: 'Technician' },
      { name: 'Derek Okafor',   role: 'Technician' },
      { name: 'Priya Nair',     role: 'Technician' },
      { name: 'Luke Patterson', role: 'Supervisor' },
      { name: 'Sandra Briggs',  role: 'Supervisor' },
    ];

    const notesByService = {
      'Oil & Filter Change':                 ['Routine PM', 'Overdue by 2 weeks — completed', 'Changed filter and topped up oil'],
      'Air Filter Replacement':              ['Heavy dust buildup noted', 'Replaced — filter was clogged', 'Routine replacement'],
      'Fuel Filter Replacement':             ['Routine PM', 'Slight contamination in old filter', null],
      'Hydraulic Oil & Filter Change':       ['Changed both filters and flushed system', 'Oil was discoloured — replaced', 'Routine PM'],
      'Coolant Flush & Fill':                ['Antifreeze levels were low', 'Routine flush', null],
      'Battery Inspection & Replacement':    ['Battery load-tested OK', 'Replaced — failed load test', 'Cleaned terminals and tested'],
      'Tire Inspection & Rotation':          ['All tyres within spec', 'Front tyres showing uneven wear — rotated', 'Tyre pressure adjusted'],
      'Brake Inspection & Service':          ['Pads at 40% — no action', 'Rear pads replaced', 'Adjusted rear drums'],
      'Engine Tune-Up':                      ['Full tune-up — spark plugs, belts checked', 'Replaced spark plugs', null],
      'Transmission Service':                ['Fluid changed and filter cleaned', 'Routine service', null],
      'Drive Belt Replacement':              ['Belt showing cracking — replaced', 'Preventive replacement', null],
      'Undercarriage Inspection & Cleaning': ['Heavy mud buildup cleaned', 'Track pins showing wear — noted for next service', 'No issues found'],
      'Greasing & Lubrication':              ['All grease points completed', 'Routine lubrication', '15 grease points serviced'],
      'Track Tension Adjustment':            ['Tension was loose — adjusted to spec', 'Routine check — no adjustment needed', null],
      'Bucket/Attachment Inspection':        ['Cutting edge at 60% — within limits', 'Teeth replaced on bucket', 'No cracks or damage found'],
      'Electrical System Diagnosis & Repair':['Traced short in cab lighting — repaired', 'Warning light reset after sensor replacement', null],
      'Pre-Delivery Inspection (PDI)':       ['Full PDI completed — ready for deployment', null, null],
      'Annual Safety Inspection':            ['Passed — certificate issued', 'Minor items noted and rectified before passing', null],
      'Welding & Structural Repair':         ['Repaired cracked boom bracket', 'Welded undercarriage frame crack', null],
      'Emissions Test & Service':            ['Passed emissions test', 'Adjusted fuel mixture — passed on second attempt', null],
    };

    function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    function daysAgoISO(days) {
      return new Date(Date.now() - days * 86400000).toISOString();
    }

    const insertLog = db.prepare(`
      INSERT INTO service_log
        (id, asset_id, workshop_job_id, service_id, service_name,
         logged_by_id, logged_by_name, logged_by_role, timestamp, notes)
      VALUES (?, ?, NULL, ?, ?, NULL, ?, ?, ?, ?)
    `);

    let totalLogs = 0;
    assets.forEach(asset => {
      const count = rand(10, 20);
      // Spread entries across the past 2 years, sorted oldest-first
      const daysOffsets = Array.from({ length: count }, () => rand(1, 730)).sort((a, b) => b - a);

      daysOffsets.forEach(daysAgo => {
        const svc    = pick(services);
        const person = pick(techStaff);
        const notes  = notesByService[svc.name] ? pick(notesByService[svc.name]) : null;
        insertLog.run(
          genId(), asset.id, svc.id, svc.name,
          person.name, person.role,
          daysAgoISO(daysAgo),
          notes
        );
        totalLogs++;
      });
    });
    console.log(`  ✓ ${totalLogs} service log entries seeded across 20 assets`);
  }
}

module.exports = { db, genId, nowISO, hashPassword, verifyPassword, writeAudit, locationDisplay, seedIfEmpty };

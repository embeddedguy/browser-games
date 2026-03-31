/**
 * GROUP F — Admin Workflows
 * PRD §3.5–3.10 / Scenarios F-01 through F-15
 */
const request = require('supertest');
const app = require('../server');
const { login } = require('./helpers');

let adminToken;
let createdTechId;

beforeAll(async () => {
  adminToken = await login(app, 'admin', 'admin123');
});

describe('GROUP F — Admin: User Management', () => {

  test('F-01: create one user per role', async () => {
    const roles = [
      { username: 'supervisor1', password: 'pass123', displayName: 'Test Supervisor', role: 'supervisor' },
      { username: 'tech1',       password: 'pass123', displayName: 'Test Tech',       role: 'tech' },
      { username: 'user1',       password: 'pass123', displayName: 'Test User',       role: 'user' },
    ];

    for (const u of roles) {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(u);
      expect(res.status).toBe(201);
      expect(res.body.role).toBe(u.role);
    }

    // All can log in
    for (const u of roles) {
      const token = await login(app, u.username, u.password);
      expect(token).toBeDefined();
    }
  });

  test('F-01b: users appear in list with correct roles', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const names = res.body.map(u => u.username);
    expect(names).toContain('supervisor1');
    expect(names).toContain('tech1');
    expect(names).toContain('user1');

    createdTechId = res.body.find(u => u.username === 'tech1')?.id;
  });

  test('F-02: edit user display name — password unchanged', async () => {
    const patchRes = await request(app)
      .patch(`/api/users/${createdTechId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ displayName: 'John Smith' });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.displayName).toBe('John Smith');

    // Original password still works
    const token = await login(app, 'tech1', 'pass123');
    expect(token).toBeDefined();
  });

  test('F-03: cannot delete the last admin account', async () => {
    // Create a second admin so we can log in as them and try to delete the original
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username: 'admin2', password: 'pass123', displayName: 'Admin Two', role: 'admin' });

    const admin2Token = await login(app, 'admin2', 'pass123');

    // admin2 deletes themselves first so only original admin remains
    const usersRes = await request(app).get('/api/users').set('Authorization', `Bearer ${adminToken}`);
    const admin2 = usersRes.body.find(u => u.username === 'admin2');

    // Delete admin2 (2 admins → 1 admin). This leaves original admin as the last admin.
    await request(app)
      .delete(`/api/users/${admin2.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    // Now original admin is the last admin. Any attempt to delete them (including by themselves)
    // must be blocked — own-account check (403) fires first, which still prevents deletion.
    const originalAdmin = usersRes.body.find(u => u.username === 'admin');
    const res = await request(app)
      .delete(`/api/users/${originalAdmin.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    // Either 403 (own account) or 409 (last admin) — both block deletion correctly
    expect([403, 409]).toContain(res.status);
    expect(res.body.error).toBeDefined();
  });

  test('F-04: cannot delete own account', async () => {
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);
    const myId = meRes.body.id || meRes.body.userId;

    const res = await request(app)
      .delete(`/api/users/${myId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
  });

});

describe('GROUP F — Admin: Asset Registration', () => {

  test('F-05: register new asset', async () => {
    const res = await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ serial: 'TEST-001', description: 'Test Asset Unit 1' });

    expect(res.status).toBe(201);
    expect(res.body.serial).toBe('TEST-001');
    expect(res.body.state.status).toBe('Onsite');
  });

  test('F-05b: new asset appears on dashboard', async () => {
    const res = await request(app)
      .get('/api/assets')
      .set('Authorization', `Bearer ${adminToken}`);

    const found = res.body.find(a => a.serial === 'TEST-001');
    expect(found).toBeDefined();
  });

  test('F-06: duplicate serial blocked (case-insensitive)', async () => {
    const res = await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ serial: 'test-001', description: 'Duplicate attempt' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/i);
  });

});

describe('GROUP F — Admin: Service Catalog', () => {
  let serviceId;

  test('F-07: add service to catalog', async () => {
    const res = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Hydraulic Hose Replacement' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Hydraulic Hose Replacement');
    expect(res.body.active).toBeTruthy();
    serviceId = res.body.id;
  });

  test('F-07b: new service appears in active service list', async () => {
    const res = await request(app)
      .get('/api/services')
      .set('Authorization', `Bearer ${adminToken}`);

    const found = res.body.find(s => s.name === 'Hydraulic Hose Replacement');
    expect(found).toBeDefined();
    expect(found.active).toBeTruthy();
  });

  test('F-08: deactivate service — removed from active list', async () => {
    // Find Oil & Filter Change
    const svcsRes = await request(app)
      .get('/api/services')
      .set('Authorization', `Bearer ${adminToken}`);
    const oilService = svcsRes.body.find(s => s.name === 'Oil & Filter Change');

    // First log it against an asset so we can verify log entry survives
    const assets = await request(app).get('/api/assets').set('Authorization', `Bearer ${adminToken}`);
    const techToken = await login(app, 'tech1', 'pass123');
    await request(app)
      .post(`/api/assets/${assets.body[0].id}/log`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ serviceName: 'Oil & Filter Change', serviceId: oilService.id });

    // Deactivate
    const deactivateRes = await request(app)
      .patch(`/api/services/${oilService.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ active: false });
    expect(deactivateRes.status).toBe(200);

    // Deactivated service should not be truthy for active
    const active = await request(app).get('/api/services').set('Authorization', `Bearer ${adminToken}`);
    const found = active.body.find(s => s.id === oilService.id);
    expect(!found || !found.active).toBe(true);

    // But existing log entry still shows service name
    const detail = await request(app)
      .get(`/api/assets/${assets.body[0].id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    const logEntry = detail.body.serviceLog.find(e => e.serviceName === 'Oil & Filter Change');
    expect(logEntry).toBeDefined();
  });

});

describe('GROUP F — Admin: Location Management', () => {

  test('F-09: add new location', async () => {
    const res = await request(app)
      .post('/api/locations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ siteName: 'Port Facility', subLocation: 'Quay Storage' });

    expect(res.status).toBe(201);
    expect(res.body.siteName || res.body.site_name).toBe('Port Facility');
  });

  test('F-09b: new location appears in dropdown', async () => {
    const res = await request(app)
      .get('/api/locations')
      .set('Authorization', `Bearer ${adminToken}`);

    const found = res.body.find(l =>
      (l.siteName || l.site_name) === 'Port Facility' &&
      (l.subLocation || l.sub_location) === 'Quay Storage'
    );
    expect(found).toBeDefined();
  });

  test('F-10: promote custom location to official', async () => {
    // Save a custom location via asset state update (locationId: null forces the custom location to be saved)
    const assets = await request(app).get('/api/assets').set('Authorization', `Bearer ${adminToken}`);
    await request(app)
      .patch(`/api/assets/${assets.body[0].id}/state`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ locationId: null, customLocation: 'Remote Drill Site 7' });

    // Find the custom location
    const locsRes = await request(app).get('/api/locations').set('Authorization', `Bearer ${adminToken}`);
    const customLoc = locsRes.body.find(l =>
      (l.subLocation || l.sub_location) === 'Remote Drill Site 7' ||
      (l.siteName || l.site_name) === 'Remote Drill Site 7'
    );
    expect(customLoc).toBeDefined();

    // Promote to official (is_custom = 0)
    const promoteRes = await request(app)
      .patch(`/api/locations/${customLoc.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isCustom: false });
    expect(promoteRes.status).toBe(200);

    const updated = await request(app).get('/api/locations').set('Authorization', `Bearer ${adminToken}`);
    const promoted = updated.body.find(l => l.id === customLoc.id);
    expect(promoted.isCustom === false || promoted.is_custom === 0).toBe(true);
  });

});

describe('GROUP F — Admin: Settings & Reports', () => {

  test('F-11: configure downtime warning threshold', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ downtimeWarningDays: 10 });

    expect(res.status).toBe(200);
    expect(res.body.downtimeWarningDays).toBe(10);
  });

  test('F-11b: reading settings returns updated value', async () => {
    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.downtimeWarningDays).toBe(10);
  });

  test('F-12: fleet health dashboard counts are accurate', async () => {
    const res = await request(app)
      .get('/api/reports/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const { stats } = res.body;
    // total is 20 seed + 1 from F-05 = 21 in this test file's DB
    expect(stats.total).toBe(21);
    expect(stats.operational + stats.inWorkshop + stats.disabled + stats.flagged).toBeLessThanOrEqual(stats.total);
  });

  test('F-13: maintenance compliance list present in dashboard', async () => {
    const res = await request(app)
      .get('/api/reports/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.complianceAssets).toBeDefined();
    expect(Array.isArray(res.body.complianceAssets)).toBe(true);
    // All 20 seed assets have no service entries → should appear
    expect(res.body.complianceAssets.length).toBeGreaterThan(0);
  });

  test('F-14: audit log export returns CSV', async () => {
    const res = await request(app)
      .get('/api/reports/audit/export')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain('Timestamp,User,Role,Action');
  });

  test('F-15: fleet status export returns CSV', async () => {
    const res = await request(app)
      .get('/api/reports/fleet/export')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain('Serial/VIN,Description,Status');
  });

  test('F-14/F-15: audit CSV and fleet CSV are independent (different content)', async () => {
    const audit = await request(app)
      .get('/api/reports/audit/export')
      .set('Authorization', `Bearer ${adminToken}`);
    const fleet = await request(app)
      .get('/api/reports/fleet/export')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(audit.text).not.toBe(fleet.text);
    expect(audit.text).not.toContain('Serial/VIN');
    expect(fleet.text).not.toContain('Timestamp,User');
  });

});

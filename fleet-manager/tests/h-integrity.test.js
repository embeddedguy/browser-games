/**
 * GROUP H — Data Integrity
 * PRD §4 (Data integrity) / Scenarios H-01 through H-05
 *
 * H-02 (LAN multi-device) and I-01/I-02/I-03 (deployment) are manual tests.
 */
const request = require('supertest');
const app = require('../server');
const { setupTestUsers } = require('./helpers');

let adminToken, supervisorToken, techToken, userToken;
let assetId;

beforeAll(async () => {
  ({ adminToken, supervisorToken, techToken, userToken } = await setupTestUsers(app));

  const res = await request(app)
    .get('/api/assets')
    .set('Authorization', `Bearer ${adminToken}`);
  assetId = res.body[0].id;
});

describe('GROUP H — Data Integrity', () => {

  test('H-01: service entry persists and is readable after logging', async () => {
    await request(app)
      .post(`/api/assets/${assetId}/log`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ serviceName: 'Engine Tune-Up', notes: 'Full tune-up completed' });

    const detail = await request(app)
      .get(`/api/assets/${assetId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    const entry = detail.body.serviceLog.find(e => e.serviceName === 'Engine Tune-Up');
    expect(entry).toBeDefined();
    expect(entry.notes).toBe('Full tune-up completed');
    expect(entry.loggedByName).toBe('Test Tech');
  });

  test('H-01b: location change persists and is readable', async () => {
    const locRes = await request(app)
      .get('/api/locations')
      .set('Authorization', `Bearer ${adminToken}`);
    const locationId = locRes.body[2].id;

    await request(app)
      .patch(`/api/assets/${assetId}/state`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ locationId });

    const detail = await request(app)
      .get(`/api/assets/${assetId}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(detail.body.state.locationId).toBe(locationId);
  });

  test('H-03: workshop job service log rolls up to asset history with job reference', async () => {
    // Set up: flag, intake, log against job
    await request(app)
      .post(`/api/assets/${assetId}/flag`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ reason: 'H-03 test flag' });

    const locs = await request(app).get('/api/locations').set('Authorization', `Bearer ${adminToken}`);
    const workshopLoc = locs.body.find(l => (l.subLocation || l.sub_location) === 'Workshop');

    const intakeRes = await request(app)
      .post('/api/workshop')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ assetId, locationId: workshopLoc.id });
    const jobId = intakeRes.body.id;

    // Log against the job
    await request(app)
      .post(`/api/workshop/${jobId}/log`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ serviceName: 'Brake Inspection & Service', notes: 'H-03 job log' });

    // Check asset history for the entry with job reference
    const detail = await request(app)
      .get(`/api/assets/${assetId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    const jobEntry = detail.body.serviceLog.find(
      e => e.serviceName === 'Brake Inspection & Service' && e.workshopJobId === jobId
    );
    expect(jobEntry).toBeDefined();
    expect(jobEntry.workshopJobId).toBe(jobId);
  });

  test('H-04: registered asset and user persist within session (SQLite file not :memory:, but verifiable via GET)', async () => {
    // Register a new asset
    const regRes = await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ serial: 'PERSIST-001', description: 'Persistence Test Asset' });
    expect(regRes.status).toBe(201);
    const newAssetId = regRes.body.id;

    // Create a new user
    const userRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username: 'persist_user', password: 'pass123', displayName: 'Persist User', role: 'user' });
    expect(userRes.status).toBe(201);

    // Both are immediately readable
    const assetDetail = await request(app)
      .get(`/api/assets/${newAssetId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(assetDetail.body.serial).toBe('PERSIST-001');

    const usersRes = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);
    const found = usersRes.body.find(u => u.username === 'persist_user');
    expect(found).toBeDefined();
  });

  test('H-05: custom location persists within same session', async () => {
    // Save a custom location
    await request(app)
      .patch(`/api/assets/${assetId}/state`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ locationId: null, customLocation: 'Remote Drill Site H05' });

    // Verify it appears in location list
    const locRes = await request(app)
      .get('/api/locations')
      .set('Authorization', `Bearer ${userToken}`);

    const custom = locRes.body.find(l =>
      (l.subLocation || l.sub_location) === 'Remote Drill Site H05' ||
      (l.siteName || l.site_name) === 'Remote Drill Site H05'
    );
    expect(custom).toBeDefined();
  });

  test('H: audit log captures all state changes', async () => {
    const res = await request(app)
      .get('/api/reports/audit')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);

    const actions = res.body.map(r => r.action);
    expect(actions).toContain('LOG_SERVICE');
  });

  test('H: all audit log entries have required fields', async () => {
    const res = await request(app)
      .get('/api/reports/audit')
      .set('Authorization', `Bearer ${adminToken}`);

    for (const entry of res.body) {
      expect(entry.timestamp).toBeDefined();
      expect(entry.userName).toBeDefined();
      expect(entry.userRole).toBeDefined();
      expect(entry.action).toBeDefined();
    }
  });

  test.skip('H-02: LAN multi-device data sharing (manual test)', () => {
    // PRD H-02: Two devices on same network — register asset on PC, verify on iPad.
    // Cannot be automated in unit tests. Verify manually per deployment instructions.
  });

  test.skip('I-01: fresh install on Windows (manual test)', () => {
    // PRD I-01: Clean Windows 11 machine, double-click start.bat.
    // Verify npm install runs, server starts, admin/admin123 works.
  });

  test.skip('I-02: LAN access from tablet (manual test)', () => {
    // PRD I-02: Open http://[PC-IP]:3000 on iPad on same Wi-Fi.
  });

  test.skip('I-03: Windows Firewall prompt (manual test)', () => {
    // PRD I-03: First run prompts Windows Firewall — allow for private networks.
  });

});

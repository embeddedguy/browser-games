/**
 * GROUP G — Role Isolation (Security)
 * PRD §4 (Security) / Scenarios G-01 through G-06
 *
 * These are API-level enforcement tests. UI redirect behaviour (G-01, G-02, G-03)
 * is handled by the frontend; API enforcement is the authoritative check.
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

describe('GROUP G — Role Isolation', () => {

  // ── Unauthenticated ───────────────────────────────────────────────────────

  test('G-05: no token on GET /api/assets → 401', async () => {
    const res = await request(app).get('/api/assets');
    expect(res.status).toBe(401);
  });

  test('G-05b: no token on POST /api/assets → 401', async () => {
    const res = await request(app)
      .post('/api/assets')
      .send({ serial: 'NO-AUTH', description: 'No auth test' });
    expect(res.status).toBe(401);
  });

  test('G-05c: no token on GET /api/reports/dashboard → 401', async () => {
    const res = await request(app).get('/api/reports/dashboard');
    expect(res.status).toBe(401);
  });

  test('G-05d: no token on GET /api/users → 401', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  // ── Tech role restrictions ────────────────────────────────────────────────

  test('G-04: tech token on POST /api/assets → 403', async () => {
    const res = await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${techToken}`)
      .send({ serial: 'TECH-HACK', description: 'Tech trying to register' });
    expect(res.status).toBe(403);
  });

  test('G-04b: tech token on GET /api/users → 403', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${techToken}`);
    expect(res.status).toBe(403);
  });

  test('G-04c: tech token on POST /api/workshop → 403', async () => {
    const res = await request(app)
      .post('/api/workshop')
      .set('Authorization', `Bearer ${techToken}`)
      .send({ assetId, locationId: 'some-id' });
    expect(res.status).toBe(403);
  });

  test('G-04d: tech token cannot patch settings → 403', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .set('Authorization', `Bearer ${techToken}`)
      .send({ downtimeWarningDays: 1 });
    expect(res.status).toBe(403);
  });

  test('G-03: tech token on GET /api/reports/dashboard → 403', async () => {
    const res = await request(app)
      .get('/api/reports/dashboard')
      .set('Authorization', `Bearer ${techToken}`);
    expect(res.status).toBe(403);
  });

  // ── User role restrictions ────────────────────────────────────────────────

  test('G-02: user token on GET /api/workshop → 403', async () => {
    const res = await request(app)
      .get('/api/workshop')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  test('G-02b: user token on POST /api/assets/:id/flag → 403', async () => {
    const res = await request(app)
      .post(`/api/assets/${assetId}/flag`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ reason: 'User trying to flag' });
    expect(res.status).toBe(403);
  });

  test('G-02c: user token cannot set status to Disabled → 403', async () => {
    const res = await request(app)
      .patch(`/api/assets/${assetId}/state`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ status: 'Disabled' });
    expect(res.status).toBe(403);
  });

  test('G-02d: user token on GET /api/reports/dashboard → 403', async () => {
    const res = await request(app)
      .get('/api/reports/dashboard')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  // ── Supervisor role restrictions ──────────────────────────────────────────

  test('G-06: supervisor token on GET /api/users → 403', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${supervisorToken}`);
    expect(res.status).toBe(403);
  });

  test('G-06b: supervisor token on POST /api/users → 403', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ username: 'hack', password: 'pass', displayName: 'Hack', role: 'admin' });
    expect(res.status).toBe(403);
  });

  test('G-06c: supervisor token on PATCH /api/settings → 403', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ downtimeWarningDays: 1 });
    expect(res.status).toBe(403);
  });

  // ── Supervisor / admin CAN access their routes ────────────────────────────

  test('G positive: supervisor CAN access workshop board', async () => {
    const res = await request(app)
      .get('/api/workshop')
      .set('Authorization', `Bearer ${supervisorToken}`);
    expect(res.status).toBe(200);
  });

  test('G positive: supervisor CAN access reports dashboard', async () => {
    const res = await request(app)
      .get('/api/reports/dashboard')
      .set('Authorization', `Bearer ${supervisorToken}`);
    expect(res.status).toBe(200);
  });

  test('G positive: admin CAN access user management', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

});

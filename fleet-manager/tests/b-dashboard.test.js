/**
 * GROUP B — Asset Dashboard (API layer)
 * PRD §3.2 / Scenarios B-01 through B-06
 */
const request = require('supertest');
const app = require('../server');
const { setupTestUsers, getFirstAsset } = require('./helpers');

let adminToken, supervisorToken, techToken, userToken;

beforeAll(async () => {
  ({ adminToken, supervisorToken, techToken, userToken } = await setupTestUsers(app));
});

describe('GROUP B — Asset Dashboard', () => {

  test('B-01: all roles can retrieve asset list', async () => {
    for (const token of [adminToken, supervisorToken, techToken, userToken]) {
      const res = await request(app)
        .get('/api/assets')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(20);
    }
  });

  test('B-01b: each asset card has serial, description, location, status', async () => {
    const res = await request(app)
      .get('/api/assets')
      .set('Authorization', `Bearer ${userToken}`);

    const asset = res.body[0];
    expect(asset.serial).toBeDefined();
    expect(asset.description).toBeDefined();
    expect(asset.state.status).toBeDefined();
    // location may be null for some seeded assets but field exists
    expect(asset.state).toHaveProperty('locationDisplay');
  });

  test('B-04: supervisor can access fleet dashboard stats', async () => {
    const res = await request(app)
      .get('/api/reports/dashboard')
      .set('Authorization', `Bearer ${supervisorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.stats).toBeDefined();
    expect(res.body.stats.total).toBe(20);
    expect(typeof res.body.stats.operational).toBe('number');
    expect(typeof res.body.stats.disabled).toBe('number');
    expect(typeof res.body.stats.flagged).toBe('number');
  });

  test('B-04: admin can access fleet dashboard stats', async () => {
    const res = await request(app)
      .get('/api/reports/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  test('B-04: user role cannot access fleet dashboard stats (403)', async () => {
    const res = await request(app)
      .get('/api/reports/dashboard')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  test('B-04: tech role cannot access fleet dashboard stats (403)', async () => {
    const res = await request(app)
      .get('/api/reports/dashboard')
      .set('Authorization', `Bearer ${techToken}`);
    expect(res.status).toBe(403);
  });

  test('B-06: flagged asset shows flagged=true in asset list', async () => {
    const assets = await request(app)
      .get('/api/assets')
      .set('Authorization', `Bearer ${techToken}`);
    const asset = assets.body[0];

    // Flag the asset
    await request(app)
      .post(`/api/assets/${asset.id}/flag`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ reason: 'Test flag reason' });

    const res = await request(app)
      .get('/api/assets')
      .set('Authorization', `Bearer ${techToken}`);

    const flagged = res.body.find(a => a.id === asset.id);
    expect(flagged.state.flagged).toBe(true);
  });

});

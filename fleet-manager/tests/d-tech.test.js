/**
 * GROUP D — Tech Workflows
 * PRD §3.3.2 / Scenarios D-01 through D-07
 */
const request = require('supertest');
const app = require('../server');
const { setupTestUsers } = require('./helpers');

let adminToken, techToken, userToken;
let assetId;

beforeAll(async () => {
  ({ adminToken, techToken, userToken } = await setupTestUsers(app));

  const res = await request(app)
    .get('/api/assets')
    .set('Authorization', `Bearer ${techToken}`);
  assetId = res.body[0].id;
});

describe('GROUP D — Tech Workflows', () => {

  test('D-02: tech can log a service entry', async () => {
    const res = await request(app)
      .post(`/api/assets/${assetId}/log`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ serviceName: 'Oil & Filter Change', notes: 'Completed during PM' });

    expect(res.status).toBe(201);
    expect(res.body.serviceName).toBe('Oil & Filter Change');
    expect(res.body.loggedByRole).toBe('Technician');
    expect(res.body.loggedByName).toBe('Test Tech');
    expect(res.body.timestamp).toBeDefined();
  });

  test('D-02b: logged entry appears in asset service history', async () => {
    const detail = await request(app)
      .get(`/api/assets/${assetId}`)
      .set('Authorization', `Bearer ${techToken}`);

    const entry = detail.body.serviceLog.find(e => e.serviceName === 'Oil & Filter Change');
    expect(entry).toBeDefined();
    expect(entry.loggedByRole).toBe('Technician');
  });

  test('D-03: log service without serviceName returns 400', async () => {
    const res = await request(app)
      .post(`/api/assets/${assetId}/log`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ notes: 'forgot to select service' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('D-04: flag without reason returns 400', async () => {
    const res = await request(app)
      .post(`/api/assets/${assetId}/flag`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ reason: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('D-04b: flag with whitespace-only reason returns 400', async () => {
    const res = await request(app)
      .post(`/api/assets/${assetId}/flag`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ reason: '   ' });

    expect(res.status).toBe(400);
  });

  test('D-05: flag with valid reason succeeds', async () => {
    const res = await request(app)
      .post(`/api/assets/${assetId}/flag`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ reason: 'Hydraulic leak detected' });

    expect(res.status).toBe(201);
    expect(res.body.jobId).toBeDefined();
    expect(res.body.reason).toBe('Hydraulic leak detected');
  });

  test('D-05b: after flagging, asset state shows flagged=true', async () => {
    const detail = await request(app)
      .get(`/api/assets/${assetId}`)
      .set('Authorization', `Bearer ${techToken}`);

    expect(detail.body.state.flagged).toBe(true);
    // Status is NOT Disabled yet — only flagged
    expect(detail.body.state.status).not.toBe('Disabled');
  });

  test('D-05c: flagging same asset twice returns 409', async () => {
    // Already flagged from D-05
    const res = await request(app)
      .post(`/api/assets/${assetId}/flag`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ reason: 'Second flag attempt' });

    expect(res.status).toBe(409);
  });

  test('D-06/D-07: tech cannot set asset status directly (403)', async () => {
    const assets = await request(app)
      .get('/api/assets')
      .set('Authorization', `Bearer ${techToken}`);
    const otherId = assets.body[1].id; // use a different, unflagged asset

    const res = await request(app)
      .patch(`/api/assets/${otherId}/state`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ status: 'Disabled' });

    expect(res.status).toBe(403);
  });

  test('D-07: tech cannot create workshop intake (403)', async () => {
    const locRes = await request(app)
      .get('/api/locations')
      .set('Authorization', `Bearer ${techToken}`);

    const res = await request(app)
      .post('/api/workshop')
      .set('Authorization', `Bearer ${techToken}`)
      .send({ assetId, locationId: locRes.body[0].id });

    expect(res.status).toBe(403);
  });

  test('D-07b: user role cannot flag asset (403)', async () => {
    const assets = await request(app)
      .get('/api/assets')
      .set('Authorization', `Bearer ${userToken}`);
    const otherId = assets.body[2].id;

    const res = await request(app)
      .post(`/api/assets/${otherId}/flag`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ reason: 'Should be blocked' });

    expect(res.status).toBe(403);
  });

});

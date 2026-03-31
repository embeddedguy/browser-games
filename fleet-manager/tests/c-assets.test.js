/**
 * GROUP C — Asset Detail: All Roles (API layer)
 * PRD §3.3.1 / Scenarios C-01 through C-07
 */
const request = require('supertest');
const app = require('../server');
const { setupTestUsers } = require('./helpers');

let adminToken, supervisorToken, techToken, userToken;
let assetId;

beforeAll(async () => {
  ({ adminToken, supervisorToken, techToken, userToken } = await setupTestUsers(app));

  // Grab a real asset ID
  const res = await request(app)
    .get('/api/assets')
    .set('Authorization', `Bearer ${adminToken}`);
  assetId = res.body[0].id;
});

describe('GROUP C — Asset Detail: All Roles', () => {

  test('C-01: location list returns 20 predefined locations', async () => {
    const res = await request(app)
      .get('/api/locations')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    const official = res.body.filter(l => l.isCustom === false || l.is_custom === 0);
    expect(official.length).toBe(20);
  });

  test('C-01b: locations are grouped (multiple sites present)', async () => {
    const res = await request(app)
      .get('/api/locations')
      .set('Authorization', `Bearer ${userToken}`);

    const siteNames = [...new Set(res.body.map(l => l.siteName || l.site_name))];
    expect(siteNames.length).toBe(5); // Main Depot, North Site, South Site, East Yard, West Compound
  });

  test('C-04: user can update asset location', async () => {
    // Get a valid location ID
    const locRes = await request(app)
      .get('/api/locations')
      .set('Authorization', `Bearer ${userToken}`);
    const locationId = locRes.body[0].id;

    const res = await request(app)
      .patch(`/api/assets/${assetId}/state`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ locationId });

    expect(res.status).toBe(200);
    expect(res.body.locationId).toBe(locationId);
  });

  test('C-04b: save is reflected in asset detail', async () => {
    const locRes = await request(app)
      .get('/api/locations')
      .set('Authorization', `Bearer ${userToken}`);
    const locationId = locRes.body[1].id;

    await request(app)
      .patch(`/api/assets/${assetId}/state`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ locationId });

    const detail = await request(app)
      .get(`/api/assets/${assetId}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(detail.body.state.locationId).toBe(locationId);
  });

  test('C-05: Deployed status without location returns 400', async () => {
    const res = await request(app)
      .patch(`/api/assets/${assetId}/state`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ status: 'Deployed', locationId: null, customLocation: null });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/location/i);
  });

  test('C-05b: Deployed status WITH location succeeds', async () => {
    const locRes = await request(app)
      .get('/api/locations')
      .set('Authorization', `Bearer ${userToken}`);
    const locationId = locRes.body[0].id;

    const res = await request(app)
      .patch(`/api/assets/${assetId}/state`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ status: 'Deployed', locationId });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Deployed');
  });

  test('C-03: custom location is saved and returned in location list', async () => {
    // locationId: null forces the custom save path (overrides any existing location_id)
    await request(app)
      .patch(`/api/assets/${assetId}/state`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ locationId: null, customLocation: 'Remote Drill Site 7' });

    const locRes = await request(app)
      .get('/api/locations')
      .set('Authorization', `Bearer ${userToken}`);

    const custom = locRes.body.find(l =>
      (l.subLocation || l.sub_location) === 'Remote Drill Site 7' ||
      (l.siteName || l.site_name) === 'Remote Drill Site 7'
    );
    expect(custom).toBeDefined();
  });

  test('C-06: service history entries include logged_by_name and role', async () => {
    // Log a service as tech
    await request(app)
      .post(`/api/assets/${assetId}/log`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ serviceName: 'Oil & Filter Change', notes: 'test notes' });

    // Log a service as supervisor
    await request(app)
      .post(`/api/assets/${assetId}/log`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ serviceName: 'Greasing & Lubrication' });

    const detail = await request(app)
      .get(`/api/assets/${assetId}`)
      .set('Authorization', `Bearer ${userToken}`);

    const log = detail.body.serviceLog;
    const techEntry = log.find(e => e.loggedByRole === 'Technician');
    const supEntry  = log.find(e => e.loggedByRole === 'Supervisor');

    expect(techEntry).toBeDefined();
    expect(techEntry.loggedByName).toBe('Test Tech');
    expect(supEntry).toBeDefined();
    expect(supEntry.loggedByName).toBe('Test Supervisor');
  });

  test('C-07: service history visible to user role', async () => {
    const detail = await request(app)
      .get(`/api/assets/${assetId}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(detail.status).toBe(200);
    expect(Array.isArray(detail.body.serviceLog)).toBe(true);
  });

});

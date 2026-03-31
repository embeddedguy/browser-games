/**
 * GROUP E — Supervisor Workflows
 * PRD §3.3.3 + §3.4 / Scenarios E-01 through E-10
 */
const request = require('supertest');
const app = require('../server');
const { setupTestUsers } = require('./helpers');

let adminToken, supervisorToken, techToken;
let assetId, workshopLocationId, releaseLocationId;
let jobId;
let techUserId;

beforeAll(async () => {
  ({ adminToken, supervisorToken, techToken } = await setupTestUsers(app));

  // Get asset to work with
  const assets = await request(app)
    .get('/api/assets')
    .set('Authorization', `Bearer ${supervisorToken}`);
  assetId = assets.body[0].id;

  // Get tech user ID for assignment
  const techs = await request(app)
    .get('/api/users/techs')
    .set('Authorization', `Bearer ${supervisorToken}`);
  techUserId = techs.body[0].id;

  // Get workshop location
  const locs = await request(app)
    .get('/api/locations')
    .set('Authorization', `Bearer ${supervisorToken}`);
  const workshopLoc = locs.body.find(l => (l.subLocation || l.sub_location) === 'Workshop');
  workshopLocationId = workshopLoc.id;
  // Use parking bay for release
  const parkingLoc = locs.body.find(l =>
    (l.subLocation || l.sub_location) === 'Parking Bay'
  );
  releaseLocationId = parkingLoc.id;

  // Pre-condition: flag the asset (E-01 expects a flagged asset on the board)
  await request(app)
    .post(`/api/assets/${assetId}/flag`)
    .set('Authorization', `Bearer ${techToken}`)
    .send({ reason: 'Hydraulic leak detected' });
});

describe('GROUP E — Supervisor Workflows', () => {

  test('E-01: workshop board returns active jobs', async () => {
    const res = await request(app)
      .get('/api/workshop')
      .set('Authorization', `Bearer ${supervisorToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const flaggedJob = res.body.find(j => j.asset?.id === assetId);
    expect(flaggedJob).toBeDefined();
    expect(flaggedJob.jobStatus).toBe('Flagged');
  });

  test('E-02: intake flagged asset — job → Waiting, asset → Disabled', async () => {
    const res = await request(app)
      .post('/api/workshop')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        assetId,
        assignedTechId: techUserId,
        priority: 'Urgent',
        locationId: workshopLocationId
      });

    expect(res.status).toBe(201);
    expect(res.body.jobStatus).toBe('Waiting');
    expect(res.body.priority).toBe('Urgent');
    expect(res.body.assignedTech?.id).toBe(techUserId);

    jobId = res.body.id;

    // Asset should now be Disabled
    const assetDetail = await request(app)
      .get(`/api/assets/${assetId}`)
      .set('Authorization', `Bearer ${supervisorToken}`);
    expect(assetDetail.body.state.status).toBe('Disabled');
    expect(assetDetail.body.state.flagged).toBe(false);
  });

  test('E-03: update job status to In Progress', async () => {
    const res = await request(app)
      .patch(`/api/workshop/${jobId}`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ jobStatus: 'In Progress' });

    expect(res.status).toBe(200);
    expect(res.body.jobStatus).toBe('In Progress');
  });

  test('E-04: supervisor logs service against workshop job', async () => {
    const res = await request(app)
      .post(`/api/workshop/${jobId}/log`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        serviceName: 'Hydraulic Oil & Filter Change',
        notes: 'Replaced main cylinder hose'
      });

    expect(res.status).toBe(201);
    expect(res.body.loggedByRole).toBe('Supervisor');
    expect(res.body.loggedByName).toBe('Test Supervisor');
  });

  test('E-04b: job service log entry rolls up to asset history', async () => {
    const detail = await request(app)
      .get(`/api/assets/${assetId}`)
      .set('Authorization', `Bearer ${supervisorToken}`);

    const entry = detail.body.serviceLog.find(
      e => e.serviceName === 'Hydraulic Oil & Filter Change'
    );
    expect(entry).toBeDefined();
    expect(entry.workshopJobId).toBe(jobId);
  });

  test('E-05: set job to Awaiting Parts with notes', async () => {
    const res = await request(app)
      .patch(`/api/workshop/${jobId}`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        jobStatus: 'Awaiting Parts',
        partsNotes: 'Waiting for hydraulic hose, ETA 2 days'
      });

    expect(res.status).toBe(200);
    expect(res.body.jobStatus).toBe('Awaiting Parts');
    expect(res.body.partsNotes).toBe('Waiting for hydraulic hose, ETA 2 days');
  });

  test('E-06: mark job as Ready for Release', async () => {
    const res = await request(app)
      .patch(`/api/workshop/${jobId}`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ jobStatus: 'Ready for Release' });

    expect(res.status).toBe(200);
    expect(res.body.jobStatus).toBe('Ready for Release');
  });

  test('E-07: release asset — job closed, asset Onsite at new location', async () => {
    const res = await request(app)
      .post(`/api/workshop/${jobId}/release`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ locationId: releaseLocationId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Asset should be Onsite at new location
    const assetDetail = await request(app)
      .get(`/api/assets/${assetId}`)
      .set('Authorization', `Bearer ${supervisorToken}`);
    expect(assetDetail.body.state.status).toBe('Onsite');
    expect(assetDetail.body.state.locationId).toBe(releaseLocationId);
    expect(assetDetail.body.activeJob).toBeNull();
  });

  test('E-07b: released job no longer appears on workshop board', async () => {
    const res = await request(app)
      .get('/api/workshop')
      .set('Authorization', `Bearer ${supervisorToken}`);

    const releasedJob = res.body.find(j => j.id === jobId);
    expect(releasedJob).toBeUndefined();
  });

  test('E-06b: cannot release job not in Ready for Release status', async () => {
    // Use a fresh asset and create a new job in Waiting status
    const assets = await request(app)
      .get('/api/assets')
      .set('Authorization', `Bearer ${supervisorToken}`);
    const asset2 = assets.body[1];

    await request(app)
      .post(`/api/assets/${asset2.id}/flag`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ reason: 'Test' });

    const intakeRes = await request(app)
      .post('/api/workshop')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ assetId: asset2.id, locationId: workshopLocationId });
    const job2Id = intakeRes.body.id;

    const res = await request(app)
      .post(`/api/workshop/${job2Id}/release`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ locationId: releaseLocationId });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Ready for Release/);
  });

  test('E-09: tech workload visible via users/techs endpoint', async () => {
    const res = await request(app)
      .get('/api/users/techs')
      .set('Authorization', `Bearer ${supervisorToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const tech = res.body.find(t => t.id === techUserId);
    expect(tech).toBeDefined();
  });

  test('E-10: supervisor can log service on asset detail (not just workshop board)', async () => {
    const res = await request(app)
      .post(`/api/assets/${assetId}/log`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({ serviceName: 'Tire Inspection & Rotation' });

    expect(res.status).toBe(201);
    expect(res.body.loggedByRole).toBe('Supervisor');
  });

});

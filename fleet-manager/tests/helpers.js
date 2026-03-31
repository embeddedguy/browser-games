const request = require('supertest');

/**
 * Log in and return a JWT token.
 */
async function login(app, username, password) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username, password });
  if (!res.body.token) throw new Error(`Login failed for ${username}: ${JSON.stringify(res.body)}`);
  return res.body.token;
}

/**
 * Create a user via the API and return the created user object.
 */
async function createUser(app, adminToken, { username, password, displayName, role }) {
  const res = await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ username, password, displayName, role });
  if (res.status !== 201) throw new Error(`createUser failed: ${JSON.stringify(res.body)}`);
  return res.body;
}

/**
 * Get all assets and return the first one (useful for getting a real asset ID).
 */
async function getFirstAsset(app, token) {
  const res = await request(app)
    .get('/api/assets')
    .set('Authorization', `Bearer ${token}`);
  return res.body[0];
}

/**
 * Set up standard test users (supervisor1, tech1, user1) and return their tokens.
 * Returns { adminToken, supervisorToken, techToken, userToken }
 */
async function setupTestUsers(app) {
  const adminToken = await login(app, 'admin', 'admin123');

  await createUser(app, adminToken, {
    username: 'supervisor1', password: 'pass123',
    displayName: 'Test Supervisor', role: 'supervisor'
  });
  await createUser(app, adminToken, {
    username: 'tech1', password: 'pass123',
    displayName: 'Test Tech', role: 'tech'
  });
  await createUser(app, adminToken, {
    username: 'user1', password: 'pass123',
    displayName: 'Test User', role: 'user'
  });

  const supervisorToken = await login(app, 'supervisor1', 'pass123');
  const techToken       = await login(app, 'tech1', 'pass123');
  const userToken       = await login(app, 'user1', 'pass123');

  return { adminToken, supervisorToken, techToken, userToken };
}

module.exports = { login, createUser, getFirstAsset, setupTestUsers };

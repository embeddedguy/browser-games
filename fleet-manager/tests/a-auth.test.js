/**
 * GROUP A — Authentication
 * PRD §3.1 / Scenarios A-01 through A-05
 */
const request = require('supertest');
const app = require('../server');

describe('GROUP A — Authentication', () => {

  test('A-01: valid credentials return token and user info', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.displayName).toBe('Administrator');
    expect(res.body.user.role).toBe('admin');
  });

  test('A-02: invalid password returns 401, no token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
    expect(res.body.error).toBeDefined();
  });

  test('A-02b: unknown username returns 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nobody', password: 'pass' });

    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  test('A-03/A-05: valid token accepted by protected routes', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.username).toBe('admin');
  });

  test('A-05: missing token on protected route returns 401', async () => {
    const res = await request(app).get('/api/assets');
    expect(res.status).toBe(401);
  });

  test('A-05b: malformed token returns 401', async () => {
    const res = await request(app)
      .get('/api/assets')
      .set('Authorization', 'Bearer not.a.valid.token');
    expect(res.status).toBe(401);
  });

});

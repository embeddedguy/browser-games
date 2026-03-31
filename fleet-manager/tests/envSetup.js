// Runs before each test file. Sets env vars before any module is required.
process.env.DATABASE_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-key';
process.env.NODE_NO_WARNINGS = '1'; // suppress experimental SQLite warning

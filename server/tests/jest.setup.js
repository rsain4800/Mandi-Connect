// Global Jest setup — was referenced by package.json's `jest.setupFiles` but
// did not exist, which meant `npm test` failed at configuration time before
// running a single test (see: `jest --listTests` / `npm test` both errored
// with "Module <rootDir>/tests/jest.setup.js ... was not found").
//
// Populates the environment variables config/validateEnv.js and the various
// controllers/utils expect to exist, so requiring app modules in a test file
// never throws or exits the process — without touching a real database,
// SMTP server, or Razorpay account (tests that need DB/email/payment-gateway
// behavior mock those modules directly; see tests/testDb.js).

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_USER = process.env.DB_USER || 'test';
process.env.DB_NAME = process.env.DB_NAME || 'mandi_connect_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_at_least_32_characters_long_0000';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.test';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test_admin_password';
process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_0000000000';
process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'test_razorpay_secret';
process.env.RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'test_webhook_secret_1234567890abcdef';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
process.env.STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || 'local';
process.env.RESERVATION_TTL_MINUTES = process.env.RESERVATION_TTL_MINUTES || '15';

// tests/inventory.concurrency.test.js calls jest.resetModules() + require()
// per test to get a controller instance bound to a fresh fake pool; a few
// third-party deps (pino, Sentry) attach a process-exit listener the first
// time each fresh module instance loads, which trips Node's default
// max-listeners heuristic. Harmless in a test run — raised here just to
// keep test output free of that warning.
process.setMaxListeners(50);
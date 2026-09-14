require('dotenv').config();

const { validateEnv } = require('./config/validateEnv');
validateEnv(); // fail fast if required secrets/config are missing — no insecure fallbacks

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const Sentry = require('@sentry/node');

const { pool, checkDBConnection } = require('./config/db');
const logger = require('./utils/logger');
const { apiRateLimiter } = require('./middleware/rateLimiters');
const inventoryService = require('./services/inventoryService');

const app = express();

// --- Error tracking (optional — only active if SENTRY_DSN is set) ---
const sentryEnabled = !!process.env.SENTRY_DSN;
if (sentryEnabled) {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV || 'development',
        tracesSampleRate: 0.1
    });
}

// Security Headers
app.use(helmet({
    crossOriginResourcePolicy: false // Allow static files like uploads to be loaded by frontend
}));

// --- CORS: fully env-driven allow-list ---
// FRONTEND_URL is a comma-separated list of allowed origins in production.
// localhost/127.0.0.1 dev origins are only added automatically outside production.
const configuredOrigins = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const allowedOrigins = process.env.NODE_ENV === 'production'
    ? configuredOrigins
    : [...new Set([...configuredOrigins, 'http://localhost:5173', 'http://127.0.0.1:5173'])];

app.use(cors({
    origin: (origin, callback) => {
        // Allow non-browser requests (no Origin header — curl, server-to-server, health checks)
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

// --- Razorpay webhook: raw-body route, mounted BEFORE the global JSON
// parser and BEFORE the rate limiter/cookie parser. Razorpay's servers
// call this with no cookie/JWT/Origin header and their signature
// verification requires the exact, unmodified request bytes (see
// utils/verifyWebhookSignature.js) — by the time express.json() below
// would run, the body has already been parsed and re-serializing it for
// signature verification is unsafe (whitespace/ordering can differ from
// what was actually signed). Registering it here, ahead of every other
// body-consuming or auth-requiring middleware, is what makes that
// possible. It deliberately also runs ahead of apiRateLimiter — Razorpay's
// retry/backoff behavior on failures is its own traffic shape and
// shouldn't compete with the general per-IP API limit.
const { handleRazorpayWebhook } = require('./controllers/webhookController');
app.post('/api/payments/webhook', express.raw({ type: '*/*', limit: '2mb' }), handleRazorpayWebhook);

// General Rate Limiting (auth routes additionally get a stricter limiter — see routes/authRoutes.js)
app.use('/api', apiRateLimiter);

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file uploads directory — only meaningful when STORAGE_PROVIDER=local
// (the dev-only fallback). In production, uploaded files are served directly
// from the configured object storage provider's own URL.
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes Registration
const authRoutes = require('./routes/authRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const productRoutes = require('./routes/productRoutes');
const cartRoutes = require('./routes/cartRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const addressRoutes = require('./routes/addressRoutes');
const orderRoutes = require('./routes/orderRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const shippingRoutes = require('./routes/shippingRoutes');
const couponRoutes = require('./routes/couponRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const adminDashboardRoutes = require('./routes/adminDashboardRoutes');
const zoneRoutes = require('./routes/zoneRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin/dashboard', adminDashboardRoutes);
app.use('/api/admin/inventory', inventoryRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/zones', zoneRoutes);

// Root info endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'Mandi Connect API',
        status: 'Online',
        tagline: 'Fresh from the Mandi, Delivered to You',
        timestamp: new Date()
    });
});

// Health check — used by hosting platform health checks. Actually verifies DB
// connectivity rather than returning a static "ok".
app.get('/health', async (req, res) => {
    const dbHealthy = await checkDBConnection();
    const status = dbHealthy ? 200 : 503;
    res.status(status).json({
        success: dbHealthy,
        status: dbHealthy ? 'healthy' : 'unhealthy',
        checks: { database: dbHealthy ? 'up' : 'down' },
        timestamp: new Date()
    });
});

if (sentryEnabled && Sentry.setupExpressErrorHandler) {
    Sentry.setupExpressErrorHandler(app);
}

// Centralized Error Handling Middleware
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    logger.error({ err, path: req.path, method: req.method }, 'Unhandled request error');
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'An unexpected internal server error occurred.'
    });
});

const PORT = process.env.PORT || 5000;

// Background reservation-expiry sweep (Phase 4) — the safety net for
// online-order stock reservations nobody ever comes back to (browser
// closed, network dropped mid-payment, etc). orderController.createOrder
// already does a scoped, inline release for the specific products in a
// new checkout, so a customer never has to wait for THIS timer to reclaim
// a stranger's abandoned reservation on the same product — this sweep
// only needs to catch reservations nothing else has an occasion to touch.
// Disabled during tests (each test file manages reservation expiry
// explicitly/synchronously) so a stray timer can't keep Jest's process
// alive or mutate rows a test isn't expecting.
const RESERVATION_SWEEP_INTERVAL_MS = Number(process.env.RESERVATION_SWEEP_INTERVAL_MS) || 5 * 60 * 1000;
let reservationSweepTimer = null;
if (process.env.NODE_ENV !== 'test') {
    reservationSweepTimer = setInterval(() => {
        inventoryService.releaseExpiredReservations(pool).catch((err) => {
            logger.error({ err }, 'Background reservation-expiry sweep failed');
        });
    }, RESERVATION_SWEEP_INTERVAL_MS);
    reservationSweepTimer.unref(); // don't keep the process alive on its own
}

app.listen(PORT, async () => {
    const dbHealthy = await checkDBConnection();
    if (!dbHealthy) {
        logger.warn('Database connectivity check failed at startup — is the DB running and migrated? (`npm run migrate`)');
    }
    logger.info(`🚀 Mandi Connect Server running on port ${PORT}`);
});

// Graceful shutdown — let in-flight requests/DB connections finish.
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    if (reservationSweepTimer) clearInterval(reservationSweepTimer);
    await pool.end().catch(() => {});
    process.exit(0);
});

module.exports = app;
const pino = require('pino');

// Fields that must never be written to logs even if accidentally passed in.
const REDACT_PATHS = [
    'password',
    'newPassword',
    'req.body.password',
    'req.body.newPassword',
    'req.body.confirmPassword',
    'token',
    'resetToken',
    'req.body.resetToken',
    'authorization',
    'req.headers.authorization',
    'razorpay_signature',
    'req.headers["x-razorpay-signature"]',
    'RAZORPAY_KEY_SECRET',
    'RAZORPAY_WEBHOOK_SECRET',
    'jwt',
    '*.password',
    '*.token'
];

const logger = pino({
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    redact: {
        paths: REDACT_PATHS,
        censor: '[REDACTED]'
    },
    transport: process.env.NODE_ENV === 'production'
        ? undefined
        : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
});

module.exports = logger;
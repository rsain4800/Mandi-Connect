// Validates that all required environment variables are present before the
// server starts. Fails fast (process.exit(1)) instead of limping along with
// insecure hardcoded fallback secrets.

const REQUIRED_VARS = [
    'DB_HOST',
    'DB_USER',
    'DB_NAME',
    'JWT_SECRET',
    'ADMIN_EMAIL',
    'ADMIN_PASSWORD',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
    'RAZORPAY_WEBHOOK_SECRET',
    'FRONTEND_URL'
];

// Vars that are required, but only when a related feature is enabled.
const CONDITIONAL_VARS = {
    cloudinary: ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'],
    s3: ['S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']
};

const MIN_JWT_SECRET_LENGTH = 32;

function validateEnv() {
    const missing = REQUIRED_VARS.filter((key) => !process.env[key] || process.env[key].trim() === '');

    const storageProvider = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();
    if (CONDITIONAL_VARS[storageProvider]) {
        for (const key of CONDITIONAL_VARS[storageProvider]) {
            if (!process.env[key] || process.env[key].trim() === '') {
                missing.push(key);
            }
        }
    }

    if (missing.length > 0) {
        // eslint-disable-next-line no-console
        console.error(
            `\n❌ Missing required environment variable(s): ${missing.join(', ')}\n` +
            'Copy server/.env.example to server/.env and fill in real values before starting the server.\n'
        );
        process.exit(1);
    }

    if (process.env.JWT_SECRET.length < MIN_JWT_SECRET_LENGTH) {
        // eslint-disable-next-line no-console
        console.error(
            `\n❌ JWT_SECRET is too short (${process.env.JWT_SECRET.length} chars). ` +
            `Use at least ${MIN_JWT_SECRET_LENGTH} random characters, e.g. \`openssl rand -hex 64\`.\n`
        );
        process.exit(1);
    }

    if (process.env.NODE_ENV === 'production' && process.env.RAZORPAY_KEY_ID.startsWith('rzp_test_')) {
        // eslint-disable-next-line no-console
        console.warn('⚠️  RAZORPAY_KEY_ID looks like a test key but NODE_ENV=production.');
    }
}

module.exports = { validateEnv };
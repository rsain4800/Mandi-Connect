const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

const provider = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();
const LOCAL_UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(LOCAL_UPLOAD_DIR)) {
    fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
}

const randomFilename = (ext) => `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;

// --- Local disk (dev-only fallback; does NOT survive redeploys and does not
// work across multiple server instances behind a load balancer) ---
async function saveLocal(buffer, ext) {
    const filename = randomFilename(ext);
    const destPath = path.join(LOCAL_UPLOAD_DIR, filename);
    await fs.promises.writeFile(destPath, buffer);
    return { key: filename, url: `/uploads/${filename}` };
}

async function deleteLocal(key) {
    const target = path.join(LOCAL_UPLOAD_DIR, path.basename(key));
    await fs.promises.unlink(target).catch(() => {});
}

// --- Cloudinary ---
let cloudinaryClient;
function getCloudinary() {
    if (!cloudinaryClient) {
        // Lazy-required so the `cloudinary` package is only needed when actually used.
        cloudinaryClient = require('cloudinary').v2;
        cloudinaryClient.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET
        });
    }
    return cloudinaryClient;
}

async function saveCloudinary(buffer) {
    const cld = getCloudinary();
    return new Promise((resolve, reject) => {
        const stream = cld.uploader.upload_stream(
            { folder: 'mandiconnect', resource_type: 'image' },
            (err, result) => {
                if (err) return reject(err);
                resolve({ key: result.public_id, url: result.secure_url });
            }
        );
        stream.end(buffer);
    });
}

async function deleteCloudinary(key) {
    const cld = getCloudinary();
    await cld.uploader.destroy(key).catch((err) => logger.warn({ err, key }, 'Failed to delete Cloudinary asset'));
}

// --- S3-compatible object storage (AWS S3, R2, DigitalOcean Spaces, MinIO, etc.) ---
let s3Client;
function getS3Client() {
    if (!s3Client) {
        // Lazy-required so `@aws-sdk/client-s3` is only needed when actually used.
        const { S3Client } = require('@aws-sdk/client-s3');
        s3Client = new S3Client({
            region: process.env.S3_REGION,
            endpoint: process.env.S3_ENDPOINT || undefined,
            forcePathStyle: !!process.env.S3_ENDPOINT,
            credentials: {
                accessKeyId: process.env.S3_ACCESS_KEY_ID,
                secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
            }
        });
    }
    return s3Client;
}

async function saveS3(buffer, ext, mimetype) {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const client = getS3Client();
    const key = `uploads/${randomFilename(ext)}`;

    await client.send(new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: mimetype
    }));

    const base = process.env.S3_PUBLIC_URL || `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION}.amazonaws.com`;
    return { key, url: `${base.replace(/\/$/, '')}/${key}` };
}

async function deleteS3(key) {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    const client = getS3Client();
    await client.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }))
        .catch((err) => logger.warn({ err, key }, 'Failed to delete S3 object'));
}

/**
 * Persists a file buffer using the configured STORAGE_PROVIDER.
 * @returns {Promise<{key: string, url: string}>}
 */
async function saveFile(buffer, ext, mimetype) {
    switch (provider) {
        case 'cloudinary':
            return saveCloudinary(buffer);
        case 's3':
            return saveS3(buffer, ext, mimetype);
        case 'local':
            return saveLocal(buffer, ext);
        default:
            logger.warn({ provider }, 'Unknown STORAGE_PROVIDER, falling back to local disk');
            return saveLocal(buffer, ext);
    }
}

async function deleteFile(key) {
    switch (provider) {
        case 'cloudinary':
            return deleteCloudinary(key);
        case 's3':
            return deleteS3(key);
        case 'local':
        default:
            return deleteLocal(key);
    }
}

module.exports = { saveFile, deleteFile, provider };
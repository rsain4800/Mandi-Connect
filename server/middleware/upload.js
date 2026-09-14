const multer = require('multer');
const path = require('path');
const logger = require('../utils/logger');
const { saveFile } = require('../utils/storage');

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const EXT_BY_DETECTED_MIME = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Buffer in memory first (nothing touches disk/cloud storage until the real
// file content has been validated below).
const memoryUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(ext)) {
            return cb(new Error('Only JPEG, PNG, and WEBP image files are allowed.'));
        }
        cb(null, true);
    }
});

// `file-type` is ESM-only; dynamic import works fine from this CommonJS module.
async function detectRealType(buffer) {
    const { fileTypeFromBuffer } = await import('file-type');
    return fileTypeFromBuffer(buffer);
}

// Client-supplied mimetype/extension are trivially spoofable (e.g. renaming a
// .php or .html file to .jpg). This inspects the actual file bytes (magic
// numbers) before anything is persisted, then hands the validated buffer to
// the configured storage provider (local disk / Cloudinary / S3).
async function persistFile(file) {
    const detected = await detectRealType(file.buffer);
    if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
        const err = new Error('File content does not match an allowed image type (jpg, png, webp).');
        err.status = 400;
        throw err;
    }

    const ext = EXT_BY_DETECTED_MIME[detected.mime] || `.${detected.ext}`;
    const { url, key } = await saveFile(file.buffer, ext, detected.mime);

    file.url = url;
    file.storageKey = key;
    // Kept for backward compatibility with any code still reading `.filename`.
    file.filename = key;
    return file;
}

function validateAndPersist() {
    return async (req, res, next) => {
        try {
            if (req.file) {
                await persistFile(req.file);
            }
            if (req.files) {
                const files = Array.isArray(req.files) ? req.files : Object.values(req.files).flat();
                for (const file of files) {
                    await persistFile(file);
                }
            }
            next();
        } catch (error) {
            logger.warn({ err: error }, 'Upload rejected during content validation');
            return res.status(error.status || 400).json({ success: false, message: error.message || 'Invalid file upload.' });
        }
    };
}

// Mirrors multer's `.single()` / `.array()` call shape so existing route
// definitions (`upload.single('image')`, `upload.array('images', 5)`) don't
// need to change. Express flattens arrays of middleware automatically.
const upload = {
    single: (fieldName) => [memoryUpload.single(fieldName), validateAndPersist()],
    array: (fieldName, maxCount) => [memoryUpload.array(fieldName, maxCount), validateAndPersist()]
};

module.exports = { upload };
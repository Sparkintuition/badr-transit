const multer = require('multer');
const path = require('path');
const fs = require('fs');

const ALLOWED_MIMES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE = 10 * 1024 * 1024;

function sanitize(name) {
  return path.basename(name)
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .substring(0, 120);
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const jobId = req._uploadJobId || 'unknown';
    const dir = path.join(__dirname, '../../data/receipts', String(year), month, `job_${jobId}`);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ts = Date.now();
    const safe = sanitize(file.originalname);
    cb(null, `${ts}_${safe}`);
  },
});

function fileFilter(req, file, cb) {
  if (ALLOWED_MIMES.has(file.mimetype)) {
    cb(null, true);
  } else {
    const err = new Error('Type de fichier non autorisé. Utilisez PDF, JPG, JPEG, PNG ou WEBP.');
    err.status = 400;
    cb(err, false);
  }
}

function uploadSingle(fieldname) {
  return multer({ storage, fileFilter, limits: { fileSize: MAX_SIZE } }).single(fieldname);
}

module.exports = { uploadSingle };

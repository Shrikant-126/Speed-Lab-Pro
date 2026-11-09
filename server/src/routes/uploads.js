// Source project upload: analyze (propose changes) and apply (approved changes → ZIP).
// Files are kept in memory only for the duration of the request and never executed.

import { Router } from 'express';
import multer from 'multer';
import { readUpload, analyzeProject, applyProject, UPLOAD_LIMITS, isAllowedFile, safeRelativePath } from '@speedlab/shared/upload';
import { requireUser } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/limits.js';

const router = Router();

// Vercel Functions accept request bodies up to ~4.5 MB; the standalone server allows more.
const maxBytes = process.env.VERCEL ? 4 * 1024 * 1024 : UPLOAD_LIMITS.maxUploadBytes;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxBytes, files: 500, fields: 10, fieldSize: 512 * 1024, parts: 520 },
  fileFilter: (_req, file, cb) => {
    const name = safeRelativePath(file.originalname);
    if (!name) return cb(Object.assign(new Error(`Invalid file name: ${file.originalname}`), { status: 400 }));
    if (name.toLowerCase().endsWith('.zip') || isAllowedFile(name)) return cb(null, true);
    return cb(null, false); // silently skip unsupported types
  },
});

function totalSize(files) {
  return files.reduce((s, f) => s + f.size, 0);
}

function withPaths(req) {
  // Browsers send folder-relative paths in a parallel "paths" field (JSON array).
  let paths = [];
  try {
    paths = JSON.parse(req.body?.paths || '[]');
  } catch {
    paths = [];
  }
  return (req.files || []).map((f, i) => ({ ...f, originalname: typeof paths[i] === 'string' && paths[i] ? paths[i] : f.originalname }));
}

router.post('/uploads/analyze', requireUser, uploadLimiter, upload.array('files', 500), async (req, res, next) => {
  try {
    const files = withPaths(req);
    if (!files.length) return res.status(400).json({ error: 'No supported files uploaded' });
    if (totalSize(files) > maxBytes) return res.status(413).json({ error: `Upload exceeds ${Math.round(maxBytes / 1048576)} MB` });
    const { files: list, skipped } = await readUpload(files);
    const analysis = await analyzeProject(list);
    return res.json({ ...analysis, skipped: skipped.slice(0, 100), limits: { maxBytes } });
  } catch (err) {
    return next(err);
  }
});

router.post('/uploads/apply', requireUser, uploadLimiter, upload.array('files', 500), async (req, res, next) => {
  try {
    const files = withPaths(req);
    if (!files.length) return res.status(400).json({ error: 'No supported files uploaded' });
    if (totalSize(files) > maxBytes) return res.status(413).json({ error: `Upload exceeds ${Math.round(maxBytes / 1048576)} MB` });
    let approved = [];
    try {
      approved = JSON.parse(req.body?.approved || '[]');
    } catch {
      return res.status(400).json({ error: 'approved must be a JSON array of change ids' });
    }
    if (!Array.isArray(approved) || !approved.length) return res.status(400).json({ error: 'Approve at least one change before generating the optimized project' });
    if (req.body?.confirm !== 'yes') return res.status(400).json({ error: 'Explicit approval (confirm=yes) is required' });
    const { files: list } = await readUpload(files);
    const { buffer, applied, failed } = await applyProject(list, approved.map(String).slice(0, 5000));
    res.setHeader('content-type', 'application/zip');
    res.setHeader('content-disposition', 'attachment; filename="speedlab-optimized-project.zip"');
    res.setHeader('x-applied-count', String(applied.length));
    res.setHeader('x-failed-count', String(failed.length));
    return res.send(buffer);
  } catch (err) {
    return next(err);
  }
});

export default router;

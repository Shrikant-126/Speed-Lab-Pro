// Image converter: upload JPG/PNG/WebP/GIF/TIFF (or pass a public image URL from a scan)
// and get WebP / AVIF / optimised JPEG / PNG variants (optionally resized) back.

import { Router } from 'express';
import multer from 'multer';
import { convertImage, LIMITS, loadSharp } from '@speedlab/shared/images';
import { safeFetch, readLimited } from '@speedlab/shared/net';
import { requireUser } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/limits.js';

const router = Router();
const ALLOWED = /^image\/(jpeg|pjpeg|png|webp|avif|gif|tiff|heic|heif)$/;

// Vercel Functions cap request/response bodies at ~4.5 MB.
const maxFile = process.env.VERCEL ? 3 * 1024 * 1024 : LIMITS.maxFileBytes;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxFile, files: LIMITS.maxFiles, fields: 10, fieldSize: 64 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED.test(file.mimetype) || /\.(jpe?g|png|webp|avif|gif|tiff?)$/i.test(file.originalname)),
});

function parseBodyOptions(body) {
  if (typeof body?.options === 'string') {
    try {
      return JSON.parse(body.options);
    } catch {
      return {};
    }
  }
  return body?.options || {};
}

function serialize(result) {
  return {
    input: result.input,
    options: result.options,
    outputs: result.outputs.map(({ data, ...o }) => ({ ...o, data: data.toString('base64') })),
  };
}

router.get('/images/status', async (_req, res) => {
  res.json({ sharp: !!(await loadSharp()), limits: { ...LIMITS, maxFileBytes: maxFile } });
});

router.post('/images/convert', requireUser, uploadLimiter, upload.array('files', LIMITS.maxFiles), async (req, res, next) => {
  try {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'Upload at least one JPG, PNG, WebP, AVIF, GIF or TIFF image' });
    const options = parseBodyOptions(req.body);
    const results = [];
    for (const f of files) {
      try {
        results.push(serialize(await convertImage(f.buffer, f.originalname, options)));
      } catch (err) {
        if (err.code === 'SHARP_UNAVAILABLE') throw err;
        results.push({ input: { name: f.originalname, bytes: f.size }, error: err.message, outputs: [] });
      }
    }
    return res.json({ results });
  } catch (err) {
    return next(err);
  }
});

router.post('/images/convert-url', requireUser, uploadLimiter, async (req, res, next) => {
  try {
    const { url } = req.body || {};
    if (typeof url !== 'string') return res.status(400).json({ error: 'url is required' });
    const { response, url: finalUrl } = await safeFetch(url, { timeoutMs: 20_000, headers: { accept: 'image/jpeg,image/png,image/*;q=0.8' } });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return res.status(502).json({ error: `Image request failed with HTTP ${response.status}` });
    }
    const buf = await readLimited(response, maxFile);
    const name = decodeURIComponent(new URL(finalUrl).pathname.split('/').pop() || 'image');
    return res.json({ results: [serialize(await convertImage(buf, name, req.body.options || {}))] });
  } catch (err) {
    if (err.code === 'TOO_LARGE') return res.status(413).json({ error: `Image is larger than ${Math.round(maxFile / 1048576)} MB` });
    return next(err);
  }
});

export default router;

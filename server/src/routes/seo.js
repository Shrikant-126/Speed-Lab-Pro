// Broken link checker endpoint: downloads the page HTML, extracts links/resources and checks
// them (SSRF-safe). Limited to 200 checks per run.

import { Router } from 'express';
import { validatePublicUrl, probeDocument, extractLinks, checkLinks } from '@speedlab/shared/net';
import { requireUser } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/limits.js';

const router = Router();

router.post('/seo/links', requireUser, uploadLimiter, async (req, res, next) => {
  const controller = new AbortController();
  req.on('close', () => !res.writableEnded && controller.abort());
  try {
    const url = await validatePublicUrl(String(req.body?.url || ''));
    const max = Math.min(Math.max(Number(req.body?.max) || 150, 10), 200);
    const page = await probeDocument(url, { signal: controller.signal });
    if (!page.html) return res.status(422).json({ error: 'The page HTML could not be downloaded' });
    const items = extractLinks(page.html, page.finalUrl);
    const started = Date.now();
    const result = await checkLinks(items, { signal: controller.signal, max, concurrency: 8, timeoutMs: 9000 });
    return res.json({ page: page.finalUrl, statusCode: page.statusCode, durationMs: Date.now() - started, ...result });
  } catch (err) {
    return next(err);
  }
});

export default router;

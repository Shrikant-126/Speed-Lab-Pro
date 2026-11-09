// Rate limiting. Note: on Vercel each function instance has its own memory, so these
// limits are per instance; the worker additionally enforces queue limits. For strict
// global limits use a shared store (e.g. Upstash Redis) – see docs/DEPLOYMENT.md.

import rateLimit from 'express-rate-limit';

const keyGenerator = (req) => (req.user && !req.user.local ? `u:${req.user.id}` : `ip:${req.ip}`);

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.API_RATE_LIMIT || 600),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down', code: 'RATE_LIMITED' },
});

export const scanLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.SCAN_RATE_LIMIT || 30),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator,
  message: { error: 'Scan limit reached for this hour. Please try again later.', code: 'SCAN_RATE_LIMITED' },
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.UPLOAD_RATE_LIMIT || 30),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator,
  message: { error: 'Upload limit reached for this hour.', code: 'UPLOAD_RATE_LIMITED' },
});

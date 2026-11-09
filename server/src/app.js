// Express application (exported for Vercel Functions and used by the local server).

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { authenticate, authEnabled } from './middleware/auth.js';
import { apiLimiter } from './middleware/limits.js';
import scans from './routes/scans.js';
import data from './routes/data.js';
import uploads from './routes/uploads.js';
import images from './routes/images.js';
import { workerHealth, workerMode } from './workerClient.js';
import { getStore } from '@speedlab/shared/store';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));

  const origins = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean);
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || origins.includes(origin) || origins.includes('*')),
      exposedHeaders: ['x-applied-count', 'x-failed-count', 'content-disposition'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '300kb' }));
  app.use('/api', apiLimiter, authenticate);

  app.get('/api/health', async (req, res) => {
    const worker = await workerHealth();
    const store = getStore();
    res.json({
      ok: true,
      version: '1.0.0',
      user: req.user ? { id: req.user.local ? 'local' : req.user.id, email: req.user.email, local: !!req.user.local } : null,
      auth: { enabled: authEnabled() },
      storage: store.kind,
      worker: { mode: workerMode(), ...worker },
      integrations: {
        pagespeedApiKey: worker.capabilities?.pagespeedKey ?? null,
        cruxApi: worker.capabilities?.cruxKey ?? null,
        localLighthouse: worker.capabilities?.localLighthouse ?? null,
        lighthouseMode: worker.capabilities?.lighthouseMode ?? null,
        playwright: worker.capabilities?.playwright ?? null,
        sharp: worker.capabilities?.sharp ?? null,
        supabase: store.kind === 'supabase',
      },
    });
  });

  app.use('/api', scans);
  app.use('/api', data);
  app.use('/api', uploads);
  app.use('/api', images);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // Central error handler – never leaks stack traces.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    let status = err.status || err.statusCode || 500;
    if (err.code === 'LIMIT_FILE_SIZE') status = 413;
    if (err.name === 'MulterError' && status === 500) status = 400;
    if (status >= 500) console.error('[api]', err);
    res.status(status).json({
      error: status >= 500 && !err.expose && !err.code ? 'Internal server error' : err.message,
      code: err.code || undefined,
    });
  });
  return app;
}

export default createApp();

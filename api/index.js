// Vercel Function entry: every /api/* request is rewritten here (see vercel.json).
// Lightweight endpoints only; scans are delegated to the separate worker (WORKER_URL).
import app from '../server/src/app.js';

export default app;

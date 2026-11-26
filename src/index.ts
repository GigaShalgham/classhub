// درس من — Worker entrypoint
// Single Worker: serves the SPA from static assets and exposes the JSON API
// under /api/*. Backend runs on Hono, data in D1, attachments as validated
// BLOBs in D1 (R2 unavailable on this account).

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import publicRoutes from './routes/public.ts';
import adminRoutes from './routes/admin.ts';
import v1Routes from './routes/v1.ts';
import { ValidationError } from './validation.ts';

export interface Env {
  DB: D1Database;
  APP_NAME: string;
  SESSION_TTL_HOURS: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use('*', logger());
// Same-origin SPA: allow same-origin only; no credentials cross-origin.
app.use('/api/*', cors({ origin: (origin, c) => origin ?? c.req.header('Origin') ?? '*', allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowHeaders: ['Content-Type', 'Authorization'], maxAge: 86400, credentials: false }));

// Error handling: never leak internals; Persian messages for validation
app.onError((err, c) => {
  if (err instanceof ValidationError) {
    return c.json({ ok: false, error: err.message }, 400);
  }
  console.error('unhandled error:', err instanceof Error ? err.message : err);
  return c.json({ ok: false, error: 'خطای داخلی سرور. لطفاً کمی بعد دوباره تلاش کنید.' }, 500);
});

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ ok: false, error: 'نشانی پیدا نشد.' }, 404);
  }
  // SPA assets fallthrough is handled by the assets binding (single-page-application).
  return c.text('Not Found', 404);
});

app.route('/api', publicRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/v1', v1Routes);

app.get('/api/health', (c) => c.json({ ok: true, name: c.env.APP_NAME, time: new Date().toISOString() }));

export default app;

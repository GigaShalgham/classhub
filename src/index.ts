// کلاس‌هاب — Worker entrypoint
// Single Worker: serves the SPA from static assets and exposes the JSON API
// under /api/*. Backend runs on Hono, data in D1, attachments as validated
// BLOBs in D1 (R2 unavailable on this account).
//
// صفحه اصلی (/) با تزریق داده رندر می‌شود: Worker HTML را از assets می‌گیرد،
// همان کوئری‌های /api/bootstrap را می‌ ejecuted و خروجی را داخل
// <script id="__BOOT__"> می‌نویسد. مرورگر صفحه را «یک‌تکه» می‌گیرد و
// مرحله دوم (درخواست‌های جداگانه برای داده) حذف می‌شود — برای اینترنت ضعیف.

import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import publicRoutes, { bootstrapPayload } from './routes/public';
import adminRoutes from './routes/admin';
import { ValidationError } from './validation';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
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

app.get('/api/health', (c) => c.json({ ok: true, name: c.env.APP_NAME, time: new Date().toISOString() }));

// ---------- SSR صفحه اصلی: HTML + داده در یک پاسخ ----------

const JSON_SAFE = /<\/script/g;

/** escape کردن </script> داخل JSON تا از تزریق HTML جلوگیری شود */
function jsonForScript(obj: unknown): string {
  return JSON.stringify(obj).replace(JSON_SAFE, '<\\/script');
}

/**
 * صفحه اصلی را با داده رندر می‌کند.
 * - HTML خام را از ASSETS می‌گیرد (خود asset، بدون کپی)
 * - پاسخ /api/bootstrap را داخل <script id="__BOOT__"> تزریق می‌کند
 * - هر خطا غیرمنتظره → همان HTML خام بدون داده (کلاینت با fetch جایگزین می‌شود)
 */
async function serveIndex(c: Context<{ Bindings: Env }>, asFallback: boolean) {
  const assetRes = await c.env.ASSETS.fetch(new Request(new URL('/index.html', c.req.url)));
  if (!assetRes.ok) {
    return c.text('Not Found', 404);
  }
  let html = await assetRes.text();

  if (asFallback) return new Response(html, { headers: htmlHeaders() });

  try {
    const boot = await bootstrapPayload(c.env.DB);
    const inject = `<script id="__BOOT__" type="application/json">${jsonForScript(boot)}</script>`;
    html = html.replace('<!--__BOOT__-->', inject);
  } catch (e) {
    // داده در دسترس نبود: HTML خام تحویل شود؛ کلاینت خودش fetch می‌کند
    console.error('boot inject failed:', e instanceof Error ? e.message : e);
  }
  return new Response(html, { headers: htmlHeaders() });
}

function htmlHeaders(): Headers {
  return new Headers({
    'content-type': 'text/html;charset=UTF-8',
    // تا وقتی کاربر دکمه رفرش را نزده، از کش مرورگر استفاده شود (اختیاری برای کاهش ترافیک)
    'cache-control': 'no-cache',
  });
}

app.get('/', (c) => serveIndex(c, false));
// اگر به هر دلیلی تزریق شکست خورد، مسیر پشتیبان HTML خام می‌دهد
app.get('/index.html', (c) => serveIndex(c, true));

export default app;

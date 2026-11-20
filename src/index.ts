// کلاس‌هاب — Worker entrypoint
// Single Worker: serves the SPA from static assets and exposes the JSON API
// under /api/*. Backend runs on Hono, data in D1, attachments as validated
// BLOBs in D1 (R2 unavailable on this account).
//
// صفحه اصلی (/) با رندر سمت سرور (SSR) جواب داده می‌شود: Worker همان
// کوئری‌های /api/bootstrap را اجرا می‌کند، داده را داخل <script id="__BOOT__">
// و «محتوای کامل رندرشده» (جدول، مهلت‌ها، اطلاعیه‌ها) را در خود HTML می‌نویسد.
// روی اینترنت اختلال‌دار اگر فقط همین یک فایل برسد، برنامه کامل دیده می‌شود.

import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import publicRoutes from './routes/public';
import adminRoutes from './routes/admin';
import { renderSSRIndex } from './ssr';
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

// ---------- SSR صفحه اصلی: HTML + محتوای رندرشده + داده در یک پاسخ ----------

/**
 * صفحه اصلی با رندر سمت سرور (ssr.ts): جدول هفتگی، مهلت‌ها و اطلاعیه‌ها
 * به‌صورت HTML کامل داخل خود پاسخ می‌آیند. روی اینترنت اختلال‌دار اگر فقط
 * همین یک فایل برسد، برنامه کامل و خوانا دیده می‌شود؛ app.js بعداً همان
 * ساختار را می‌سازد و تعامل‌ها را فعال می‌کند (بدون پرش — کلاس‌ها یکسان‌اند).
 * اگر D1 جواب نداد، HTML خام می‌رود و کلاینت خودش fetch می‌کند.
 */
async function serveIndex(c: Context<{ Bindings: Env }>, asFallback: boolean) {
  if (!asFallback) {
    const ssr = await renderSSRIndex(c.env);
    if (ssr) return new Response(ssr, { headers: htmlHeaders() });
  }
  // مسیر پشتیبان: HTML خام بدون SSR
  const assetRes = await c.env.ASSETS.fetch(new Request(new URL('/index.html', c.req.url)));
  if (!assetRes.ok) {
    return c.text('Not Found', 404);
  }
  return new Response(await assetRes.text(), { headers: htmlHeaders() });
}

function htmlHeaders(): Headers {
  return new Headers({
    'content-type': 'text/html;charset=UTF-8',
    // تا وقتی کاربر دکمه رفرش را نزده، از کش مرورگر استفاده شود (اختیاری برای کاهش ترافیک)
    'cache-control': 'no-cache',
  });
}

// دامنه‌ی اصلی جدید — دامنه‌ی workers.dev در ایران با فیلترینگ SNI مسدود است؛
// ورودی‌های دامنه‌ی قدیمی برای دوستانی که نشانی قبلی را ذخیره کرده‌اند، ریدایرکت می‌شوند.
// فقط ناوبری‌های HTML ریدایرکت می‌شوند؛ API دست‌نخورده می‌ماند تا پنل ادمینِ
// دامنه‌ی قدیمی هم (تا زمان مهاجرت کامل) به‌هم نریزد.
const CANONICAL_HOST = 'school.sigmababyboy.ccwu.cc';

app.use('*', async (c, next) => {
  const host = (c.req.header('host') || '').toLowerCase();
  const accept = c.req.header('accept') || '';
  if (host && host !== CANONICAL_HOST && host.endsWith('.workers.dev')
    && c.req.method === 'GET' && accept.includes('text/html')) {
    const url = new URL(c.req.url);
    return Response.redirect(`https://${CANONICAL_HOST}${url.pathname}${url.search}`, 302);
  }
  await next();
});

app.get('/', (c) => serveIndex(c, false));
// مسیر پشتیبان: HTML خام بدون SSR (اگر رندر سمت سرور به مشکل خورد)
app.get('/index.html', (c) => serveIndex(c, true));

export default app;

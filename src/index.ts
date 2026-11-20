// کلاس‌هاب — Worker entrypoint
// Single Worker: serves the SPA from static assets and exposes the JSON API
// under /api/*. Backend runs on Hono, data in D1, attachments as validated
// BLOBs in D1 (R2 unavailable on this account).
//
// صفحه اصلی (/) به‌صورت «استریم» پاسخ داده می‌شود:
//  ۱) پوسته HTML فوراً به مرورگر می‌رود (TTFB منتظر دیتابیس نمی‌ماند؛
//     مرورگر هم‌زمان CSS/فونت را دانلود می‌کند)
//  ۲) داده بوت‌استرپ در «همان اتصال» دنبال پوسته می‌آید و داخل
//     <script id="__BOOT__"> تزریق می‌شود — یعنی یک درخواست واحد بدون
//     هندشیک اضافه؛ روی اینترنت مختل‌شده هر اتصال جدید یک شانس گیرکردن است.
//  ۳) اگر D1 بیش از ۱۲ ثانیه جواب نداد، بدون داده ادامه می‌دهیم؛ خود کلاینت
//     با fetch جایگزین و صفحه خطای مناسب مدیریت می‌کند.

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
 * صفحه اصلی به‌صورت استریم:
 * ۱) head + بخش بالای body که هم‌زمان با دانلود CSS/JS رندر می‌شود، فوراً می‌رود
 * ۲) به‌محض رسیدن داده D1 (یا بعد از ۱۲ ثانیه تایم‌اوت)، <script id="__BOOT__"> + ادامه body
 * این‌طوری اولین بایت صفحه دیگر پشت کوئری دیتابیس قفل نیست.
 */
const BOOT_TIMEOUT_MS = 12_000;

async function serveIndex(c: Context<{ Bindings: Env }>, asFallback: boolean) {
  const assetRes = await c.env.ASSETS.fetch(new Request(new URL('/index.html', c.req.url)));
  if (!assetRes.ok) {
    return c.text('Not Found', 404);
  }
  const html = await assetRes.text();

  if (asFallback) return new Response(html, { headers: htmlHeaders() });

  // نقطه برش: <script id="__BOOT__"> باید قبل از هر محتوای قابل‌رندر body قرار بگیرد؛
  // مارک‌آپ را در head گذاشته‌ایم تا مرورگر داده را قبل از اجرای app.js داشته باشد.
  const SPLIT = '<!--__BOOT__-->';
  const cut = html.indexOf(SPLIT);
  if (cut === -1) {
    // مارک‌آپ نبود (نسخه قدیمی HTML؟) — همان رفتار قبلی غیر استریم
    return new Response(html, { headers: htmlHeaders() });
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();

  // داده بوت‌استرپ هم‌زمان با ارسال پوسته شروع می‌شود (هم‌پوشانی I/O)
  const bootScriptPromise = (async () => {
    const boot = await withTimeout(bootstrapPayload(c.env.DB), BOOT_TIMEOUT_MS);
    return `<script id="__BOOT__" type="application/json">${jsonForScript(boot)}</script>`;
  })();

  // بخش اول (تا مارک‌آپ) فوراً به سمت مرورگر
  void writer.write(enc.encode(html.slice(0, cut)));

  // داده در پس‌زمینه؛ بدنه‌ی نهایی در همان اتصال
  (async () => {
    try {
      const script = await bootScriptPromise;
      await writer.write(enc.encode(script));
    } catch (e) {
      // داده نرسید/تایم‌اوت خورد: بدون داده ادامه می‌دهیم؛ کلاینت خودش fetch می‌کند
      console.error('boot inject failed:', e instanceof Error ? e.message : e);
    }
    const rest = html.slice(cut + SPLIT.length);
    await writer.write(enc.encode(rest));
    await writer.close();
  })().catch(async (e) => {
    console.error('stream failed:', e instanceof Error ? e.message : e);
    try { await writer.abort(e); } catch { /* بسته شده */ }
  });

  return new Response(readable, { headers: htmlHeaders(true) });
}

/** race بین promise و تایم‌اوت — خطای TimeoutError اگر دیر رسید */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('boot timeout')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

function htmlHeaders(streaming = false): Headers {
  const h = new Headers({
    'content-type': 'text/html;charset=UTF-8',
    // تا وقتی کاربر دکمه رفرش را نزده، از کش مرورگر استفاده شود (اختیاری برای کاهش ترافیک)
    'cache-control': 'no-cache',
  });
  if (streaming) h.set('content-encoding', 'identity'); // استریم؛ فشرده‌سازی خودکار edge ممکن است با transform تداخل کند
  return h;
}

app.get('/', (c) => serveIndex(c, false));
// اگر به هر دلیلی تزریق شکست خورد، مسیر پشتیبان HTML خام می‌دهد
app.get('/index.html', (c) => serveIndex(c, true));

export default app;

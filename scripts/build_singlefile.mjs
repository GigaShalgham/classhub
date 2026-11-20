// ساخت نسخه تک‌فایلی صفحه دانش‌آموز برای اینترنت ضعیف.
// ورودی:  public/index.src.html + css/style.css + js/{utils,schedule,app}.js
// خروجی: public/index.html — همه‌چیز inline؛ مرورگر به‌جای ~۸ درخواست
// (html→css→js→دو import→…) فقط ۱ درخواست می‌زند + ۱ درخواست /api/bootstrap.
// صفحه مدیر (admin/) دست‌نخورده می‌ماند و همان فایل‌های js/css را استفاده می‌کند.
//
// اجرا:  node scripts/build_singlefile.mjs
// نکته: بعد از هر تغییر در src.html یا js ها دوباره اجرا شود (npm run build).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');

const html = readFileSync(join(pub, 'index.src.html'), 'utf8');
const css = readFileSync(join(pub, 'css', 'style.css'), 'utf8');

// حذف import/export برای باندل به‌صورت اسکریپت کلاسیک (بدون ماژول).
// این فایل‌ها فقط import ساده‌ی نام‌ها دارند (default export ندارند).
function stripModuleSyntax(src) {
  return src
    .replace(/^import\s*\{[^}]*\}\s*from\s*['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^import\s+[^;]+;\s*$/gm, '')
    .replace(/^export\s+(?=(const|let|var|function|class)\b)/gm, '');
}

const js = [
  stripModuleSyntax(readFileSync(join(pub, 'js', 'utils.js'), 'utf8')),
  stripModuleSyntax(readFileSync(join(pub, 'js', 'schedule.js'), 'utf8')),
  stripModuleSyntax(readFileSync(join(pub, 'js', 'app.js'), 'utf8')),
].join('\n;\n');

if (/<\/script/i.test(js)) {
  throw new Error('JS bundle contains "</script" — would break inline script');
}

const out = html
  .replace(
    /<link rel="stylesheet" href="\/css\/style\.css">/,
    () => `<style>\n${css}\n</style>`,
  )
  .replace(
    /<script type="module" src="\/js\/app\.js"><\/script>/,
    () => `<script>\n${js}\n</script>`,
  );

if (out === html) throw new Error('no substitution made — template markers not found');
// فقط ارجاع‌های تگ واقعی خطا هستند، نه رشته‌هایی مثل banner.style.cssText داخل JS
if (/<link[^>]+style\.css/.test(out) || /<script[^>]+src=/.test(out)) {
  throw new Error('leftover external tag references in built html');
}

writeFileSync(join(pub, 'index.html'), out);

const kb = (s) => (Buffer.byteLength(s, 'utf8') / 1024).toFixed(1);
console.log(`index.html ساخته شد: ${kb(out)}KB (css inline: ${kb(css)}KB، js inline: ${kb(js)}KB)`);

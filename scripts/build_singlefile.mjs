// ساخت نسخه تک‌فایلی صفحه دانش‌آموز برای اینترنت ضعیف.
// ورودی:  public/index.src.html + css/style.css + js/{utils,schedule,app}.js
// خروجی: public/index.html — همه‌چیز inline؛ مرورگر به‌جای ~۸ درخواست
// (html→css→js→دو import→…) فقط ۱ درخواست می‌زند + ۱ درخواست /api/bootstrap.
// همین کار برای پنل ادمین هم انجام می‌شود: public/admin/index.html با
// js/{utils,schedule,admin}.js → پنل هم ۱ درخواست است (ادمین روی نت ضعیف
// نصفه می‌ماند چون ۴-۵ فایل جداگانه داشت).
//
// اجرا:  node scripts/build_singlefile.mjs
// نکته: بعد از هر تغییر در src.html یا js ها دوباره اجرا شود (npm run build).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');

// حذف import/export برای باندل به‌صورت اسکریپت کلاسیک (بدون ماژول).
// این فایل‌ها فقط import ساده‌ی نام‌ها دارند (default export ندارند).
function stripModuleSyntax(src) {
  return src
    .replace(/^import\s*\{[^}]*\}\s*from\s*['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^import\s+[^;]+;\s*$/gm, '')
    .replace(/^export\s+(?=(const|let|var|function|class)\b)/gm, '');
}

function bundle(srcPath, outPath, scriptTagRe, jsFiles) {
  const html = readFileSync(srcPath, 'utf8');
  if (!scriptTagRe.test(html)) {
    throw new Error(`${srcPath}: source markers missing — the source file appears already built/corrupted; restore it from git`);
  }
  const css = readFileSync(join(pub, 'css', 'style.css'), 'utf8');
  const js = jsFiles.map((f) => stripModuleSyntax(readFileSync(join(pub, 'js', f), 'utf8'))).join('\n;\n');
  if (/<\/script/i.test(js)) {
    throw new Error(`JS bundle for ${srcPath} contains "</script" — would break inline script`);
  }
  const out = html
    .replace(/<link rel="stylesheet" href="\/css\/style\.css">/, () => `<style>\n${css}\n</style>`)
    .replace(scriptTagRe, () => `<script>\n${js}\n</script>`);
  if (out === html) throw new Error(`no substitution made for ${srcPath}`);
  if (/<link[^>]+style\.css/.test(out) || /<script[^>]+src=/.test(out)) {
    throw new Error(`leftover external tag references in built ${srcPath}`);
  }
  writeFileSync(outPath, out);
  return { out, js, css };
}

const kb = (s) => (Buffer.byteLength(s, 'utf8') / 1024).toFixed(1);

// صفحه دانش‌آموز (سورس: index.src.html — index.html تولیدی است)
{
  const { out, js, css } = bundle(
    join(pub, 'index.src.html'), join(pub, 'index.html'),
    /<script type="module" src="\/js\/app\.js"><\/script>/,
    ['utils.js', 'schedule.js', 'app.js'],
  );
  console.log(`index.html ساخته شد: ${kb(out)}KB (css inline: ${kb(css)}KB، js inline: ${kb(js)}KB)`);
}

// پنل ادمین (سورس: admin/index.src.html — admin/index.html تولیدی است)
{
  const { out, js, css } = bundle(
    join(pub, 'admin', 'index.src.html'), join(pub, 'admin', 'index.html'),
    /<script type="module" src="\/js\/admin\.js"><\/script>/,
    ['utils.js', 'schedule.js', 'admin.js'],
  );
  console.log(`admin/index.html ساخته شد: ${kb(out)}KB (css inline: ${kb(css)}KB، js inline: ${kb(js)}KB)`);
}

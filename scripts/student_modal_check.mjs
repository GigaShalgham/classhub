// مودال مهلت در سایت دانش‌آموز: آیتم پیوست لینکی 🔗 + href درست
import { chromium } from 'playwright';
const API = 'https://school.gigaspaceturnip.workers.dev';
const b = await chromium.launch();
const ps = await b.newPage({ viewport: { width: 1440, height: 900 } });
await ps.goto(API + '/?sm=' + Math.random(), { waitUntil: 'networkidle' });
await ps.waitForTimeout(1800);
// کارتِ «تست نمایش لینک (خودکار)» را پیدا و باز کن
const card = ps.locator('.task-card', { hasText: 'تست نمایش لینک' }).first();
await card.click();
await ps.waitForTimeout(1200);
const modal = await ps.evaluate(() => {
  const body = document.getElementById('detailBody');
  const link = body.querySelector('a.attachment-item--link');
  return {
    title: document.getElementById('detailTitle')?.textContent,
    linkText: link?.textContent,
    linkHref: link?.getAttribute('href'),
    linkTarget: link?.getAttribute('target'),
  };
});
console.log('مودال مهلت:', JSON.stringify(modal, null, 1));
await ps.keyboard.press('Escape');
await b.close();

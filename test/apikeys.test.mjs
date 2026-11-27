// تست‌های سیستم کلید API (/api/v1) — بدون دیتابیس واقعی.
// برای تست سرتاسری (route → db) از محیط محلی wrangler d1 استفاده می‌شود؛
// اینجا منطق خالصِ apikeys.ts را می‌سنجیم که به D1 نیاز ندارد.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  API_KEY_REGEX, generateApiKey, hashApiKey, apiKeyFromRequest,
} from '../src/apikeys.ts';

test('generateApiKey: قالب hubk_ + ۳۲ hex', () => {
  for (let i = 0; i < 20; i++) {
    const k = generateApiKey();
    assert.match(k, API_KEY_REGEX);
    assert.ok(k.startsWith('hubk_'));
    assert.equal(k.length, 5 + 32);
  }
});

test('generateApiKey: یکتایی (۱۰۰ کلید، بدون تکرار)', () => {
  const seen = new Set(Array.from({ length: 100 }, () => generateApiKey()));
  assert.equal(seen.size, 100);
});

test('hashApiKey: ثابت برای ورودی یکسان، حساس به کلید متفاوت', async () => {
  const a = generateApiKey();
  const h1 = await hashApiKey(a);
  const h2 = await hashApiKey(a);
  const h3 = await hashApiKey(generateApiKey());
  assert.equal(h1, h2);
  assert.notEqual(h1, h3);
  assert.match(h1, /^[0-9a-f]{64}$/);
  assert.equal(h1, await hashApiKey(a.toUpperCase()));
});

test('apiKeyFromRequest: از X-API-Key و Bearer هر دو', () => {
  const k = generateApiKey();
  const r1 = new Request('https://x.dev/', { headers: { 'X-API-Key': k } });
  const r2 = new Request('https://x.dev/', { headers: { Authorization: `Bearer ${k}` } });
  const rBad = new Request('https://x.dev/', { headers: { Authorization: 'Bearer othertoken123' } });
  const rNone = new Request('https://x.dev/');
  assert.equal(apiKeyFromRequest(r1), k);
  assert.equal(apiKeyFromRequest(r2), k);
  assert.equal(apiKeyFromRequest(rBad), null);
  assert.equal(apiKeyFromRequest(rNone), null);
});

test('apiKeyFromRequest: قالب خراب رد می‌شود (ولی از فراخوانی authApiKey خطای درست می‌آید)', () => {
  // پیشوند hubk_ ولی طول غلط — هدر موجود ولی نامعتبر → null
  const rBad = new Request('https://x.dev/', { headers: { 'X-API-Key': 'hubk_short' } });
  assert.equal(apiKeyFromRequest(rBad), null);
});

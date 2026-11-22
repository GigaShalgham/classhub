// تست‌های انبار فایل تلگرام — با fetch ساختگی (بدون تماس واقعی)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  maskToken, validTgTokenShape, validTgChatShape,
  tgSendDocument, tgFileUrl, tgDiscoverChat, tgGetMe,
} from '../src/telegram.ts';

const realFetch = globalThis.fetch;

function stubFetch(handlers) {
  globalThis.fetch = async (url, init) => {
    const h = handlers.find((x) => String(url).includes(x.match));
    if (!h) throw new Error(`unexpected fetch: ${url}`);
    return {
      ok: true, status: 200,
      json: async () => h.json,
    };
  };
}

test('maskToken: ابتدا و انتها با …', () => {
  assert.equal(maskToken('123456789:AAEhelloWorldAAAAAAAAAAAAAAAAAAA'), '123456…AAAA');
  assert.equal(maskToken('short'), '•••••');
});

test('validTgTokenShape / validTgChatShape', () => {
  assert.ok(validTgTokenShape('123456789:AAEhelloWorldAAAAAAAAAAAAAAAAAAA'));
  assert.ok(!validTgTokenShape('not-a-token'));
  assert.ok(!validTgTokenShape('123:tooshort'));
  assert.ok(validTgChatShape('123456789'));
  assert.ok(validTgChatShape('-1001234567890'));
  assert.ok(!validTgChatShape('abc'));
});

test('tgGetMe + tgSendDocument: پارس پاسخ درست', async () => {
  stubFetch([
    { match: 'getMe', json: { ok: true, result: { id: 42, username: 'my_class_bot' } } },
    { match: 'sendDocument', json: { ok: true, result: { document: { file_id: 'FID123', file_unique_id: 'UQ1' } } } },
  ]);
  const cfg = { token: '123456789:AAEhelloWorldAAAAAAAAAAAAAAAAAAA', chatId: '12345' };
  assert.equal((await tgGetMe(cfg)).username, 'my_class_bot');
  const file = new File([new Uint8Array([1, 2, 3])], 'جزوه.pdf', { type: 'application/pdf' });
  const r = await tgSendDocument(cfg, file, 'جزوه.pdf');
  assert.equal(r.fileId, 'FID123');
});

test('tgSendDocument: خطای تلگرام فارسی برمی‌گردد', async () => {
  stubFetch([{ match: 'sendDocument', json: { ok: false, description: 'Bad Request: chat not found' } }]);
  const cfg = { token: '123456789:AAEhelloWorldAAAAAAAAAAAAAAAAAAA', chatId: '1' };
  await assert.rejects(() => tgSendDocument(cfg, new File(['x'], 'a.txt'), 'a.txt'), /chat not found/);
});

test('tgFileUrl: getFile → آدرس دانلود', async () => {
  stubFetch([{ match: 'getFile', json: { ok: true, result: { file_id: 'FID', file_path: 'documents/file_1.pdf' } } }]);
  const cfg = { token: '123456789:AAEhelloWorldAAAAAAAAAAAAAAAAAAA', chatId: '1' };
  const url = await tgFileUrl(cfg, 'FID');
  assert.equal(url, 'https://api.telegram.org/file/bot123456789:AAEhelloWorldAAAAAAAAAAAAAAAAAAA/documents/file_1.pdf');
});

test('tgDiscoverChat: آخرین chat از getUpdates', async () => {
  stubFetch([{
    match: 'getUpdates',
    json: {
      ok: true,
      result: [
        { message: { chat: { id: 111, type: 'private' } } },
        { message: { chat: { id: 222, type: 'private' } } },
      ],
    },
  }]);
  const cfg = { token: '123456789:AAEhelloWorldAAAAAAAAAAAAAAAAAAA', chatId: '' };
  assert.equal(await tgDiscoverChat(cfg), '222'); // جدیدترین
});

globalThis.fetch = realFetch;

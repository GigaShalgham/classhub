// تست سرتاسری /api/v1 — با دیتابیس ساختگی در حافظه (SQLite-like).
// ساختار mock از prepare().bind().first/all/run پیروی می‌کند؛ فقط کوئری‌های
// api_keys و اسکوپ‌ها را می‌شناسد. هدف: رفتار کل مسیر (هدر → auth → پاسخ).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateApiKey, hashApiKey } from '../src/apikeys.ts';

// ---- SQLite در حافظه (node:sqlite — Node ≥ 22.5) ----
import { DatabaseSync } from 'node:sqlite';

const sqlite = new DatabaseSync(':memory:');

// اسکیمای حداقلی — فقط ستون‌هایی که /api/v1 می‌خواند/می‌نویسد
sqlite.exec(`
  CREATE TABLE api_keys (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    label        TEXT NOT NULL,
    key_hash     TEXT NOT NULL UNIQUE,
    key_prefix   TEXT NOT NULL,
    scopes       TEXT NOT NULL DEFAULT 'read',
    active       INTEGER NOT NULL DEFAULT 1,
    requests     INTEGER NOT NULL DEFAULT 0,
    last_used_at TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at   TEXT
  );
  CREATE TABLE tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    kind        TEXT NOT NULL,
    title       TEXT NOT NULL,
    subject_id  INTEGER,
    description TEXT NOT NULL DEFAULT '',
    due_at      TEXT NOT NULL,
    priority    TEXT NOT NULL DEFAULT 'normal',
    archived    INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE subjects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, color_key TEXT NOT NULL);
  CREATE TABLE announcements (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, published_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE lessons (id INTEGER PRIMARY KEY AUTOINCREMENT, day INTEGER NOT NULL, period INTEGER NOT NULL, subject_id INTEGER NOT NULL, alt_subject_id INTEGER, start_time TEXT NOT NULL, end_time TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE homework (id INTEGER PRIMARY KEY AUTOINCREMENT, lesson_id INTEGER NOT NULL, hw_date TEXT, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', textbook_pages TEXT NOT NULL DEFAULT '', instructions TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', due_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE bells (day INTEGER NOT NULL, period INTEGER NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL);
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE attachments (id INTEGER PRIMARY KEY AUTOINCREMENT, parent_type TEXT NOT NULL, parent_id INTEGER NOT NULL, filename TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, data BLOB NOT NULL DEFAULT x'');
  CREATE TABLE admins (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, salt TEXT NOT NULL);
  CREATE TABLE sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now')), expires_at TEXT NOT NULL);
`);

// ---- mock D1 با همان قرارداد worker ----
function d1() {
  let sql = '';
  let binds = [];
  const prep = {
    bind: (...args) => { binds = args; return prep; },
    first: async () => {
      const stmt = sqlite.prepare(sql);
      const row = stmt.get(...binds);
      return row ?? null;
    },
    all: async () => {
      const stmt = sqlite.prepare(sql);
      return { results: stmt.all(...binds) };
    },
    run: async () => {
      const stmt = sqlite.prepare(sql);
      const r = stmt.run(...binds);
      return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
  };
  return {
    prepare: (q) => { sql = q; binds = []; return prep; },
  };
}
const DB = d1();

// ---- واردکردن app با env تزریقی ----
const { default: appFactory } = await import('../src/index.ts');
// index.ts پیشفرضِ Hono است؛ Worker env را از c.env می‌خواند — برای تست
// مستقیم، fetch آن با env فیک می‌شود.
const Env = { DB, APP_NAME: 'درس من', SESSION_TTL_HOURS: '12' };

async function call(path, init = {}, key = null) {
  const headers = new Headers(init.headers ?? {});
  if (key) headers.set('X-API-Key', key);
  const res = await appFactory.fetch(new Request(`https://hub.dev${path}`, { ...init, headers }), Env);
  const body = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  return { status: res.status, body };
}

test('v1: بدون کلید → ۴۰۱', async () => {
  const r = await call('/api/v1/tasks');
  assert.equal(r.status, 401);
  assert.equal(r.body.ok, false);
});

test('v1: کلید با اسکوپ read → GET مجاز، POST رد', async () => {
  const raw = generateApiKey();
  const h = await hashApiKey(raw);
  sqlite.prepare('INSERT INTO api_keys (label, key_hash, key_prefix, scopes) VALUES (?, ?, ?, ?)')
    .run('test-read', h, raw.slice(0, 8), 'read');

  const g = await call('/api/v1/tasks', {}, raw);
  assert.equal(g.status, 200);
  assert.equal(g.body.ok, true);
  assert.ok(Array.isArray(g.body.active));

  const p = await call('/api/v1/tasks', { method: 'POST', body: JSON.stringify({ kind: 'exam', title: 'x'.repeat(3), dueAt: new Date().toISOString() }), headers: { 'Content-Type': 'application/json' } }, raw);
  assert.equal(p.status, 403);
  assert.match(p.body.error, /write/);
});

test('v1: کلید با اسکوپ read,write → POST مجاز', async () => {
  const raw = generateApiKey();
  const h = await hashApiKey(raw);
  sqlite.prepare('INSERT INTO api_keys (label, key_hash, key_prefix, scopes) VALUES (?, ?, ?, ?)')
    .run('test-write', h, raw.slice(0, 8), 'read,write');
  const p = await call('/api/v1/tasks', { method: 'POST', body: JSON.stringify({ kind: 'quiz', title: 'کوییز', dueAt: new Date().toISOString() }), headers: { 'Content-Type': 'application/json' } }, raw);
  assert.equal(p.status, 201);
  assert.equal(p.body.ok, true);
  assert.ok(p.body.id > 0);
});

test('v1: کلید غیرفعال → ۴۰۳', async () => {
  const raw = generateApiKey();
  const h = await hashApiKey(raw);
  const r = sqlite.prepare('INSERT INTO api_keys (label, key_hash, key_prefix, scopes, active) VALUES (?, ?, ?, ?, ?)')
    .run('inactive', h, raw.slice(0, 8), 'read', 0);
  const id = Number(r.lastInsertRowid);
  const g = await call('/api/v1/tasks', {}, raw);
  assert.equal(g.status, 403);
  sqlite.prepare('DELETE FROM api_keys WHERE id = ?').run(id);
});

test('v1: Bearer هم کلید API را می‌پذیرد', async () => {
  const raw = generateApiKey();
  const h = await hashApiKey(raw);
  sqlite.prepare('INSERT INTO api_keys (label, key_hash, key_prefix, scopes) VALUES (?, ?, ?, ?)')
    .run('bearer', h, raw.slice(0, 8), 'read');
  const res = await appFactory.fetch(new Request('https://hub.dev/api/v1/tasks', {
    headers: { Authorization: `Bearer ${raw}` },
  }), Env);
  assert.equal(res.status, 200);
  const b = await res.json();
  assert.equal(b.ok, true);
});

test('v1: POST /tasks — کلید write با کلیدِ bearer', async () => {
  const raw = generateApiKey();
  const h = await hashApiKey(raw);
  sqlite.prepare('INSERT INTO api_keys (label, key_hash, key_prefix, scopes) VALUES (?, ?, ?, ?)')
    .run('bearer-write', h, raw.slice(0, 8), 'read,write');
  const res = await appFactory.fetch(new Request('https://hub.dev/api/v1/tasks', {
    method: 'POST',
    headers: { Authorization: `Bearer ${raw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'exam', title: 'امتحان', dueAt: new Date().toISOString() }),
  }), Env);
  assert.equal(res.status, 201);
});

test('v1: digest و homework — ساختار پاسخ درست', async () => {
  const raw = generateApiKey();
  const h = await hashApiKey(raw);
  sqlite.prepare('INSERT INTO api_keys (label, key_hash, key_prefix, scopes) VALUES (?, ?, ?, ?)')
    .run('digest', h, raw.slice(0, 8), 'read');
  const dg = await call('/api/v1/digest', {}, raw);
  assert.equal(dg.status, 200);
  assert.equal(dg.body.ok, true);
  assert.ok(typeof dg.body.today === 'string');
  assert.ok(Array.isArray(dg.body.homeworkToday));
  assert.ok(Array.isArray(dg.body.upcomingTasks));
  const hw = await call('/api/v1/homework', {}, raw);
  assert.equal(hw.status, 200);
  assert.ok(Array.isArray(hw.body.homework));
});

test('v1: اعتبارسنجی — بدنه نامعتبر ۴۰۰', async () => {
  const raw = generateApiKey();
  const h = await hashApiKey(raw);
  sqlite.prepare('INSERT INTO api_keys (label, key_hash, key_prefix, scopes) VALUES (?, ?, ?, ?)')
    .run('valid', h, raw.slice(0, 8), 'read,write');
  const p = await call('/api/v1/tasks', { method: 'POST', body: JSON.stringify({ kind: 'wrong', title: 'x', dueAt: 'x' }), headers: { 'Content-Type': 'application/json' } }, raw);
  assert.equal(p.status, 400);
});

test('v1: کلید منقضی‌شده → ۴۰۳', async () => {
  const raw = generateApiKey();
  const h = await hashApiKey(raw);
  const r = sqlite.prepare('INSERT INTO api_keys (label, key_hash, key_prefix, scopes, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run('expired', h, raw.slice(0, 8), 'read', '2000-01-01 00:00:00');
  const id = Number(r.lastInsertRowid);
  const g = await call('/api/v1/tasks', {}, raw);
  assert.equal(g.status, 403);
  sqlite.prepare('DELETE FROM api_keys WHERE id = ?').run(id);
});

// رگرسیون: انقضا با قالب ISO-Z هم باید کار کند (قبلاً NaN → هرگز منقضی نمی‌شد)
test('v1: کلید منقضی‌شده با قالب ISO-Z → ۴۰۳', async () => {
  const raw = generateApiKey();
  const h = await hashApiKey(raw);
  const r = sqlite.prepare('INSERT INTO api_keys (label, key_hash, key_prefix, scopes, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run('expired-iso', h, raw.slice(0, 8), 'read', '2000-01-01T00:00:00Z');
  const id = Number(r.lastInsertRowid);
  const g = await call('/api/v1/tasks', {}, raw);
  assert.equal(g.status, 403);
  sqlite.prepare('DELETE FROM api_keys WHERE id = ?').run(id);
});

// رگرسیون: انقضای آینده با قالب فقط-تاریخ نباید زودتر از موعد رد شود
test('v1: کلید با انقضای آینده (فقط تاریخ) → ۲۰۰', async () => {
  const raw = generateApiKey();
  const h = await hashApiKey(raw);
  const r = sqlite.prepare('INSERT INTO api_keys (label, key_hash, key_prefix, scopes, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run('future', h, raw.slice(0, 8), 'read', '2999-12-31');
  const id = Number(r.lastInsertRowid);
  const g = await call('/api/v1/tasks', {}, raw);
  assert.equal(g.status, 200);
  sqlite.prepare('DELETE FROM api_keys WHERE id = ?').run(id);
});

// رگرسیون: dueAt بدون منطقه‌ی زمانی باید به Z نرمال شود و پس از گذشت
// از upcomingTasks بیفتد (قبلاً 'T' > ' ' باعث ماندگاری ابدی می‌شد)
test('v1: POST /tasks با dueAt بدون Z → نرمال به UTC؛ sort فعال‌ها', async () => {
  const raw = generateApiKey();
  const h = await hashApiKey(raw);
  sqlite.prepare('INSERT INTO api_keys (label, key_hash, key_prefix, scopes) VALUES (?, ?, ?, ?)')
    .run('norm', h, raw.slice(0, 8), 'read,write');
  // آینده (نرمال می‌شود به Z) و گذشته (بدون Z)
  const p1 = await call('/api/v1/tasks', {
    method: 'POST',
    body: JSON.stringify({ kind: 'quiz', title: 'آینده بدون Z', dueAt: '2099-01-01T08:00' }),
    headers: { 'Content-Type': 'application/json' },
  }, raw);
  assert.equal(p1.status, 201);
  const p2 = await call('/api/v1/tasks', {
    method: 'POST',
    body: JSON.stringify({ kind: 'quiz', title: 'گذشته بدون Z', dueAt: '2000-01-01T08:00' }),
    headers: { 'Content-Type': 'application/json' },
  }, raw);
  assert.equal(p2.status, 201);
  const rows = sqlite.prepare("SELECT due_at FROM tasks ORDER BY id DESC LIMIT 2").all();
  assert.ok(rows.some((r) => String(r.due_at).endsWith('Z')), `due_at نرمال نشد: ${JSON.stringify(rows)}`);
  // گذشته باید در expired بیفتد نه active
  const list = await call('/api/v1/tasks', {}, raw);
  const titles = { active: list.body.active.map((t) => t.title), expired: list.body.expired.map((t) => t.title) };
  assert.ok(titles.expired.includes('گذشته بدون Z'), `گذشته بدون Z در expired نیست: ${JSON.stringify(titles)}`);
  // ترتیب فعال‌ها باید صعودی نسبت به dueAt باشد
  const dues = list.body.active.map((t) => String(t.dueAt));
  const sorted = [...dues].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(dues, sorted, 'active مرتب نیست (صعودی)');
});

test('v1: کلید مصرف را امضا می‌کند (requests پس از موفقیت > 0)', async () => {
  const raw = generateApiKey();
  const h = await hashApiKey(raw);
  const r = sqlite.prepare('INSERT INTO api_keys (label, key_hash, key_prefix, scopes) VALUES (?, ?, ?, ?)')
    .run('usage', h, raw.slice(0, 8), 'read');
  const id = Number(r.lastInsertRowid);
  await call('/api/v1/tasks', {}, raw);
  const row = sqlite.prepare('SELECT requests, last_used_at AS lu FROM api_keys WHERE id=?').get(id);
  assert.ok(row.requests >= 1);
  assert.ok(!!row.lu);
  sqlite.prepare('DELETE FROM api_keys WHERE id = ?').run(id);
});

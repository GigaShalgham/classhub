-- Migration 0010: سیستم کلید API — دروازه‌ی /api/v1 برای هر کلاینت بیرونی
-- (مثلاً ربات تلگرام، اسکریپت‌ها، اپلیکیشن‌های دیگر).
--
-- api_keys: کلیدهای صادرشده از پنل ادمین. فقط «هش SHA-256» کلید ذخیره
-- می‌شود؛ خود کلید فقط یک‌بار موقع صدور نمایش داده می‌رود (مثل توکن‌های
-- گیت‌هاب). هر کلید اختیاریاً فقط به یک اسکوپ مجاز است و می‌توان امضا
-- (last_used_at) و وضعیت فعال/غیرفعال داشت. حذف کلید = حذف ردیف.
CREATE TABLE IF NOT EXISTS api_keys (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  label        TEXT NOT NULL,                -- نامی که مدیر برای کلید گذاشته (مثلاً «ربات تلگرام»)
  key_hash     TEXT NOT NULL UNIQUE,         -- SHA-256 hex کلید خام (پیشونددار)
  key_prefix   TEXT NOT NULL,                -- ۸ نویسه‌ی اول کلید — برای نمایش امن در فهرست
  scopes       TEXT NOT NULL DEFAULT 'read', -- فهرست اسکوپ‌ها با کاما: read,write
  active       INTEGER NOT NULL DEFAULT 1,   -- 0 = از کار افتاده (بدون حذف)
  requests     INTEGER NOT NULL DEFAULT 0,   -- شمارنده‌ی تقریبی مصرف (هر بار +۱)
  last_used_at TEXT,                         -- آخرین استفاده (ISO)
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT                          -- انقضا اختیاری ISO؛ NULL = بی‌نهایت
);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

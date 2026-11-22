-- والد «جزوه» برای پیوست‌ها: CHECK قدیمی فقط homework/task/announcement
-- می‌پذیرفت. SQLite نمی‌تواند CHECK را ALTER کند → بازسازی جدول (کپی کامل).
-- در جدول جدید CHECK حذف شد؛ اعتبارسنجی نوع والد در روت API انجام می‌شود
-- (oneOf) که با افزودن والد جدید در آینده دیگری لازم نشود.
CREATE TABLE attachments_new (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_type      TEXT NOT NULL,
  parent_id        INTEGER NOT NULL,
  filename         TEXT NOT NULL,
  mime             TEXT NOT NULL,
  size             INTEGER NOT NULL,
  data             BLOB NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  url              TEXT,
  telegram_file_id TEXT
);
INSERT INTO attachments_new (id, parent_type, parent_id, filename, mime, size, data, created_at, url, telegram_file_id)
  SELECT id, parent_type, parent_id, filename, mime, size, data, created_at, url, telegram_file_id FROM attachments;
DROP TABLE attachments;
ALTER TABLE attachments_new RENAME TO attachments;

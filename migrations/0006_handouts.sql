-- جزوات: بخش جدید دانش‌آموز/ادمین — جزوه‌ی درسی با فایل(های) پیوست.
-- فایل‌ها همان جدول attachments با parent_type='handout' هستند
-- (انبار تلگرام، سقف ۲۰MB، روت عمومی دانلود — همه بی‌تغییر).
CREATE TABLE handouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

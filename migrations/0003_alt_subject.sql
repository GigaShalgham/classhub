-- Migration 0003: درس گردشی + درس‌های جدید رشته ریاضی
-- alt_subject_id: درس دومِ زنگ‌های «گردشی» (مثل هندسه/دفاعی که هفته‌به‌هفته عوض می‌شوند)

ALTER TABLE lessons ADD COLUMN alt_subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL;

-- درس‌های جدید برنامه واقعی کلاس (اگر نباشند اضافه می‌شوند)
INSERT OR IGNORE INTO subjects (id, name, color_key) VALUES
  (11, 'کارگاه ریاضی', 'lavender'),
  (12, 'هندسه',        'blue'),
  (13, 'نگارش',        'pink'),
  (14, 'دفاعی',        'green'),
  (15, 'آزمایشگاه',    'mint');

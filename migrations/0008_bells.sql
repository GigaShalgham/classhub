-- Migration 0008: زنگ‌ها از این پس «داده» هستند + انتقال مهلت تکالیف به «مهلت‌ها»
--
-- ۱) bells: ساختار زنگ‌های هفته (هر روز چند زنگ، با چه ساعتی). برای استقرارهای
--    موجود، زنگ‌ها از lessons فعلی مشتق می‌شوند — یعنی برنامه‌ی کلاس دقیقاً
--    همان می‌ماند که بود و هیچ داده‌ای از دست نمی‌رود. برای استقرار تازه،
--    جدول خالی است و مدیر کلاس خودش زنگ‌ها را می‌سازد و می‌چیند.
CREATE TABLE IF NOT EXISTS bells (
  day        INTEGER NOT NULL CHECK (day BETWEEN 0 AND 6),
  period     INTEGER NOT NULL CHECK (period BETWEEN 1 AND 12),
  start_time TEXT NOT NULL,             -- 'HH:MM'
  end_time   TEXT NOT NULL,             -- 'HH:MM'
  UNIQUE (day, period)
);

INSERT OR IGNORE INTO bells (day, period, start_time, end_time)
  SELECT day, period, start_time, end_time FROM lessons;

-- ۲) «مهلت تحویل» از فرم تکلیف حذف شده (مهلت‌ها جای خودش را در تب «مهلت‌ها»
--    و «چکیده تکالیف» دارند). مقادیر موجود به tasks منتقل و سپس صفر می‌شوند
--    تا اطلاعاتی از بین نرود. اجرای دوباره بی‌اثر است (due_at همه NULL است).
INSERT INTO tasks (kind, title, subject_id, description, due_at, priority, archived)
  SELECT 'submission', hw.title, l.subject_id,
         CASE WHEN hw.description != '' THEN hw.description
              ELSE 'مهلت تحویلِ تکلیفِ درس' END,
         hw.due_at, 'normal', 0
  FROM homework hw
  JOIN lessons l ON l.id = hw.lesson_id
  WHERE hw.due_at IS NOT NULL;

UPDATE homework SET due_at = NULL;

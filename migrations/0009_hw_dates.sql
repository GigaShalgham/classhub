-- Migration 0009: تکالیف وابسته به تاریخ واقعی (تفکیک هفته‌ها)
--
-- مشکل: homework روی lesson_id یکتا بود — یعنی «زنگِ» سه‌شنبه در همه‌ی هفته‌ها
-- یک تکلیف مشترک داشت. تکلیفِ هفته‌ی قبل روی هفته‌ی بعد هم دیده می‌شد و برای
-- ثبتِ تکلیفِ جدید باید قبلی پاک می‌شد.
--
-- راه‌حل: هر تکلیف به «تاریخِ درس» (hw_date، میلادی YYYY-MM-DD به وقت تهران)
-- وابسته می‌شود. کلید یکتای (lesson_id) برداشته و (lesson_id, hw_date) می‌شود.
--
-- برای ردیف‌های موجود: hw_date از created_at تکلیف به وقت تهران مشتق می‌شود
-- (نزدیک‌ترین تاریخِ همان روزِ هفته به لحظه‌ی ثبت). اجرای دوباره بی‌اثر است.

DROP INDEX IF EXISTS idx_homework_lesson_unique;

ALTER TABLE homework ADD COLUMN hw_date TEXT;

UPDATE homework SET hw_date = date(substr(created_at, 1, 10) || 'T' || substr(created_at, 12, 8), 'utc', '+3 hours', '+30 minutes');

CREATE UNIQUE INDEX IF NOT EXISTS idx_homework_lesson_date_unique ON homework(lesson_id, hw_date);
CREATE INDEX IF NOT EXISTS idx_homework_date ON homework(hw_date);

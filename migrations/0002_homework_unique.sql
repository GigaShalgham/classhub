-- Migration 0002: fix homework uniqueness (one homework row per lesson)
-- and sessions expiry comparison.
CREATE UNIQUE INDEX IF NOT EXISTS idx_homework_lesson_unique ON homework(lesson_id);

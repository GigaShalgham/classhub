-- Schema v1: class hub (کلاس‌هاب)
-- admins: class representatives with password hash + salt
CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- sessions: admin login sessions (hashed tokens)
CREATE TABLE IF NOT EXISTS sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id   INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

-- subjects: subject catalog with pastel identity
CREATE TABLE IF NOT EXISTS subjects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  color_key  TEXT NOT NULL,             -- one of the pastel palette keys
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- lessons: weekly timetable slots (day 0=Saturday ... 6=Friday, Iran week)
CREATE TABLE IF NOT EXISTS lessons (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  day        INTEGER NOT NULL CHECK (day BETWEEN 0 AND 6),
  period     INTEGER NOT NULL CHECK (period BETWEEN 1 AND 12),
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  start_time TEXT NOT NULL,             -- 'HH:MM'
  end_time   TEXT NOT NULL,             -- 'HH:MM'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (day, period)
);
CREATE INDEX IF NOT EXISTS idx_lessons_day ON lessons(day, period);

-- homework: attached to a lesson slot (latest revision is authoritative)
CREATE TABLE IF NOT EXISTS homework (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id      INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  textbook_pages TEXT NOT NULL DEFAULT '',
  instructions   TEXT NOT NULL DEFAULT '',
  notes          TEXT NOT NULL DEFAULT '',   -- notes from the class representative
  due_at         TEXT,                        -- ISO 8601 or NULL
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_homework_lesson ON homework(lesson_id);

-- tasks: standalone time-sensitive items (exams, projects, research, ...)
CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL CHECK (kind IN ('project','research','presentation','exam','quiz','submission')),
  title       TEXT NOT NULL,
  subject_id  INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  description TEXT NOT NULL DEFAULT '',
  due_at      TEXT NOT NULL,             -- ISO 8601 datetime
  priority    TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_at, archived);

-- announcements: class announcements
CREATE TABLE IF NOT EXISTS announcements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  pinned     INTEGER NOT NULL DEFAULT 0,
  published_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- attachments: files for homework / tasks / announcements
-- R2 is not enabled on this Cloudflare account, so we store small
-- binary blobs in D1 (max 1.5 MB each, validated types only).
CREATE TABLE IF NOT EXISTS attachments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_type TEXT NOT NULL CHECK (parent_type IN ('homework','task','announcement')),
  parent_id   INTEGER NOT NULL,
  filename    TEXT NOT NULL,
  mime        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  data        BLOB NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_attachments_parent ON attachments(parent_type, parent_id);

-- settings: key-value app settings (class name, welcome message, ...)
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

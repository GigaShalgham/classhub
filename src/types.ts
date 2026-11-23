// Shared types for درس من (class hub)

export type ColorKey =
  | 'lavender' | 'blue' | 'mint' | 'pink' | 'cream' | 'green';

export interface Subject {
  id: number;
  name: string;
  color_key: ColorKey;
}

export interface Homework {
  id: number;
  lesson_id: number;
  title: string;
  description: string;
  textbook_pages: string;
  instructions: string;
  notes: string;
  due_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Lesson {
  id: number;
  day: number; // 0=شنبه ... 6=جمعه
  period: number;
  subject_id: number;
  subject_name: string;
  color_key: ColorKey;
  alt_subject_id: number | null;   // درس دومِ زنگ گردشی
  alt_subject_name: string | null;
  alt_color_key: ColorKey | null;
  start_time: string;
  end_time: string;
  updated_at: string;
  homework: Homework | null;
  attachment_count: number;
}

export type TaskKind =
  | 'project' | 'research' | 'presentation' | 'exam' | 'quiz' | 'submission';

export interface Task {
  id: number;
  kind: TaskKind;
  title: string;
  subject_id: number | null;
  subject_name: string | null;
  color_key: ColorKey | null;
  description: string;
  due_at: string;
  priority: 'low' | 'normal' | 'high';
  archived: boolean;
  created_at: string;
  updated_at: string;
  attachment_count: number;
}

export interface Announcement {
  id: number;
  title: string;
  body: string;
  pinned: boolean;
  published_at: string;
  attachment_count: number;
}

export interface AttachmentMeta {
  id: number;
  parent_type: 'homework' | 'task' | 'announcement';
  parent_id: number;
  filename: string;
  mime: string;
  size: number;
  url?: string | null; // پیوست «لینک» (درایو/هر URL) — فایل روی سرویس بیرونی است
  telegram_file_id?: string | null; // پیوست تلگرامی — فایل در چت خصوصی، اینجا فقط شناسه
  created_at: string;
}

export interface AppSettings {
  class_name: string;
  welcome_message: string;
  admin_note: string;
}

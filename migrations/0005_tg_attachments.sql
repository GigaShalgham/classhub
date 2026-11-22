-- انبار فایل تلگرام: file_id درایوِ تلگرام را نگه می‌دارد؛ خود فایل در چت خصوصیِ کاربر است.
-- دانلود: getFile(file_id) → استریم از api.telegram.org (تا ۲۰MB).
ALTER TABLE attachments ADD COLUMN telegram_file_id TEXT;

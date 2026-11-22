// انبار فایل تلگرام: بات، چتِ خصوصیِ سرِ کلاس، فقط شناسه‌ها در D1.
// هیچ فایلی محلی/در دیتابیس ذخیره نمی‌شود — آپلود مستقیم به تلگرام،
// دانلود هم موقع درخواست از تلگرام استریم می‌شود.
// محدودیت بات‌های تلگرام: دانلود فایل تا ۲۰ مگابایت (sendDocument تا ۵۰MB،
// ولی getFile فقط ۲۰MB را می‌دهد؛ پس سقف آپلود را هم ۲۰MB گذاشتیم).

const TG_API = 'https://api.telegram.org';

/** سقف هر فایل و مجموعِ هر والد در حالت تلگرام */
export const MAX_TG_FILE_BYTES = 20 * 1024 * 1024; // ۲۰MB — سقف getFile بات‌ها
export const MAX_TG_TOTAL_BYTES = 200 * 1024 * 1024; // ۲۰۰MB per والد

export interface TgConfig {
  token: string;
  chatId: string;
}

/** خواندن پیکربندی از settings (فقط سمت سرور — هرگز به کلاینت عادی نمی‌رود) */
export async function tgConfig(db: D1Database): Promise<TgConfig | null> {
  const { results } = await db
    .prepare("SELECT key, value FROM settings WHERE key IN ('tg_bot_token', 'tg_chat_id')")
    .all<{ key: string; value: string }>();
  const m = new Map((results ?? []).map((r) => [r.key, r.value]));
  const token = m.get('tg_bot_token');
  const chatId = m.get('tg_chat_id');
  return token && chatId ? { token, chatId } : null;
}

interface TgResponse<T> {
  ok: boolean;
  description?: string;
  result?: T;
}

async function tgCall<T>(cfg: TgConfig, method: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${TG_API}/bot${cfg.token}/${method}`, init);
  const j = (await r.json()) as TgResponse<T>;
  if (!j.ok || j.result === undefined) {
    throw new Error(`تلگرام (${method}): ${j.description ?? `HTTP ${r.status}`}`);
  }
  return j.result;
}

/** فرستادن فایل به چت خصوصی — خروجی file_id برای دانلود بعدی */
export async function tgSendDocument(
  cfg: TgConfig,
  file: File,
  filename: string,
): Promise<{ fileId: string; fileUniqueId: string }> {
  const fd = new FormData();
  fd.append('chat_id', cfg.chatId);
  fd.append('document', file, filename);
  const r = await tgCall<{ document: { file_id: string; file_unique_id: string } }>(cfg, 'sendDocument', {
    method: 'POST',
    body: fd,
  });
  return { fileId: r.document.file_id, fileUniqueId: r.document.file_unique_id };
}

/** آدرس دانلود موقتِ فایل از سرورهای تلگرام */
export async function tgFileUrl(cfg: TgConfig, fileId: string): Promise<string> {
  const r = await tgCall<{ file_path: string }>(
    cfg,
    `getFile?file_id=${encodeURIComponent(fileId)}`,
  );
  if (!r.file_path) throw new Error('تلگرام مسیر فایل را برنگرداند (فایل >۲۰MB یا file_id نامعتبر).');
  return `${TG_API}/file/bot${cfg.token}/${r.file_path}`;
}

/** اطلاعات بات (برای تست اتصال) */
export async function tgGetMe(cfg: TgConfig): Promise<{ username: string }> {
  return tgCall<{ username: string; id: number }>(cfg, 'getMe');
}

/** کشف chat_id از getUpdates — کاربر باید قبلاً به بات /start زده باشد */
export async function tgDiscoverChat(cfg: TgConfig): Promise<string | null> {
  const updates = await tgCall<
    Array<{ message?: { chat?: { id: number; type: string } }; channel_post?: { chat?: { id: number; type: string } } }>
  >(cfg, 'getUpdates?limit=50&allowed_updates=%5B%22message%22%2C%22channel_post%22%5D');
  for (const u of [...(updates ?? [])].reverse()) {
    const chat = u.message?.chat ?? u.channel_post?.chat;
    if (chat?.id) return String(chat.id);
  }
  return null;
}

/** پیام کوتاه تست به چت */
export async function tgSendMessage(cfg: TgConfig, text: string): Promise<void> {
  await tgCall<boolean>(cfg, 'sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: cfg.chatId, text }),
  });
}

/** نمایش امن توکن در پنل (فقط ابتدا و انتها) */
export function maskToken(token: string): string {
  if (token.length <= 12) return '•'.repeat(token.length);
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}

/** اعتبارسنجی شکل توکن و chat_id (ورودی پنل) */
export function validTgTokenShape(token: string): boolean {
  return /^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(token);
}
export function validTgChatShape(chatId: string): boolean {
  return /^-?\d{5,15}$/.test(chatId);
}

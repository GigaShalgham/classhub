// Input validation helpers (server-side, dependency-free)

export class ValidationError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
  }
}

export function bad(message: string): never {
  throw new ValidationError(message);
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

export function str(v: unknown, name: string, opts: { min?: number; max?: number; required?: boolean } = {}): string {
  const { min = 0, max = 5000, required = true } = opts;
  if (v === undefined || v === null) {
    if (required) bad(`${name} الزامی است.`);
    return '';
  }
  if (typeof v !== 'string') bad(`${name} باید متن باشد.`);
  const s = v.trim();
  if (required && s.length === 0) bad(`${name} نمی‌تواند خالی باشد.`);
  if (s.length > 0 && s.length < min) bad(`${name} باید حداقل ${min} نویسه باشد.`);
  if (s.length > max) bad(`${name} بیش از حد بلند است (حداکثر ${max} نویسه).`);
  return s;
}

export function int(v: unknown, name: string, min: number, max: number): number {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
    bad(`${name} باید عددی بین ${min} و ${max} باشد.`);
  }
  return n;
}

export function bool(v: unknown): boolean {
  return v === true || v === 1 || v === '1' || v === 'true';
}

export function timeStr(v: unknown, name: string): string {
  const s = str(v, name, { max: 5 });
  if (!TIME_RE.test(s)) bad(`${name} باید به شکل HH:MM باشد.`);
  return s;
}

/**
 * نرمال‌سازی تاریخ-ساعت ISO برای ذخیره در D1 (مقایسه‌ی رشته‌ای امن).
 * ورودی بدون منطقه‌ی زمانی (مثل 2026-12-01T08:00) به UTC با Z تبدیل می‌شود
 * تا مقایسه با datetime('now') در SQL و مرتب‌سازیِ الفبایی درست بماند.
 */
export function normalizeIsoDate(s: string): string {
  if (/T/.test(s) && !/(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const d = new Date(s + 'Z');
    return Number.isNaN(d.getTime()) ? s : d.toISOString().slice(0, 19) + 'Z';
  }
  return s;
}

export function isoDate(v: unknown, name: string, required = true): string | null {
  if ((v === undefined || v === null || v === '') && !required) return null;
  const s = str(v, name, { max: 40 });
  if (!ISO_RE.test(s)) bad(`${name} باید تاریخ معتبر ISO باشد.`);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) bad(`${name} تاریخ معتبر نیست.`);
  return normalizeIsoDate(s);
}

export function oneOf<T extends string>(v: unknown, name: string, allowed: readonly T[]): T {
  const s = str(v, name, { max: 40 });
  if (!(allowed as readonly string[]).includes(s)) {
    bad(`${name} باید یکی از ${allowed.join('، ')} باشد.`);
  }
  return s as T;
}

/** Parse and validate a JSON request body (size-capped). */
export async function readJson(request: Request, maxBytes = 256 * 1024): Promise<Record<string, unknown>> {
  const len = Number(request.headers.get('Content-Length') ?? 0);
  if (len > maxBytes) bad(`بدنه درخواست بیش از حد بزرگ است.`);
  let obj: unknown;
  try {
    obj = await request.json();
  } catch {
    bad('بدنه درخواست JSON معتبر نیست.');
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    bad('بدنه درخواست باید شیء JSON باشد.');
  }
  return obj as Record<string, unknown>;
}

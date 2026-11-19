// Attachment handling: validated binary blobs stored in D1.
// R2 is not enabled on this Cloudflare account, so small attachments
// (images/documents up to 1.5 MB, whitelist of safe types) are stored
// as BLOB rows in the attachments table instead.

import { ValidationError } from './validation';

export const MAX_ATTACHMENT_BYTES = 1_500_000; // 1.5 MB
export const MAX_TOTAL_ATTACHMENT_BYTES = 6_000_000; // per parent item

export const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]) as Set<string>;

export const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

const DANGEROUS_EXT = /\.(php\d?|phtml|exe|sh|bat|cmd|js|html?|svg)$/i;

export function safeFilename(name: string): string {
  // strip paths, keep Persian letters, digits, dots, dash, underscore, space
  let n = name.split(/[\\/]/).pop() ?? 'file';
  n = n.replace(/[\u200c\u200f\u200e]/g, '\u200c').replace(/[\u0000-\u001f]/g, '');
  n = n.replace(/[^\w\u0600-\u06FF.\- ]/g, '_').replace(/\s+/g, ' ').trim();
  if (!n || n === '.' || n === '..') n = 'file';
  return n.slice(0, 120);
}

export function validateMime(mime: string, filename: string): void {
  const m = (mime || '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_MIME.has(m)) {
    throw new ValidationError('نوع فایل مجاز نیست. تصاویر، PDF و اسناد آفیس پذیرفته می‌شوند.');
  }
  if (DANGEROUS_EXT.test(filename)) {
    throw new ValidationError('پسوند فایل مجاز نیست.');
  }
}

export function extensionOf(mime: string): string {
  return EXT_BY_MIME[mime] ?? 'bin';
}

/** Content-Disposition attachment header is enforced on download to prevent inline XSS. */
export function downloadHeaders(meta: { filename: string; mime: string }): Record<string, string> {
  const asciiFallback = meta.filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  return {
    'Content-Type': meta.mime,
    'Content-Disposition': `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(meta.filename)}`,
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  };
}

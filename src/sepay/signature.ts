/**
 * Ký / xác minh chữ ký webhook SePay (HMAC-SHA256).
 *
 * Doc: https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc#hmac-sha256
 *   1. SePay lấy timestamp hiện tại (Unix giây)
 *   2. Ghép chuỗi  "{timestamp}.{raw_body}"
 *   3. HMAC-SHA256 với Secret Key
 *   4. Header  X-SePay-Signature: sha256={hex}
 *   5. Header  X-SePay-Timestamp: {timestamp}
 *
 * QUAN TRỌNG: phải ký/verify trên RAW BODY (bytes gốc). Nếu để express.json()
 * parse rồi JSON.stringify lại thì chữ ký lệch vì:
 *   - PHP escape Unicode thành \uXXXX, JS thì không
 *   - thứ tự key JSON có thể đổi
 *   - khoảng trắng có thể khác
 * → route webhook dùng express.raw(), đăng ký TRƯỚC express.json().
 */
import crypto from 'node:crypto';

import type { VerifyResult } from '../types.ts';

export type RawLike = Buffer | string | Record<string, unknown> | undefined | null;

/** @returns `sha256=<hex>` */
export function sign(secret: string, timestamp: number | string, rawBody: RawLike): string {
  const body = toText(rawBody);
  const digest = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex');
  return `sha256=${digest}`;
}

/** Sinh 2 header SePay sẽ gửi — mock simulator dùng lại đúng công thức này. */
export function signHeaders(secret: string, rawBody: RawLike): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    'X-SePay-Timestamp': String(timestamp),
    'X-SePay-Signature': sign(secret, timestamp, rawBody),
  };
}

function toText(raw: RawLike): string {
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') return JSON.stringify(raw); // chỉ để gọi tay, KHÔNG dùng cho verify
  return '';
}

/** So sánh không lộ thời gian; độ dài khác nhau là truất ngay. */
function safeEqual(a: unknown, b: unknown): boolean {
  const ba = Buffer.from(String(a ?? ''), 'utf8');
  const bb = Buffer.from(String(b ?? ''), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export interface VerifySignatureInput {
  rawBody: RawLike;
  signature: string | null | undefined;
  timestamp: string | number | null | undefined;
  secret: string;
  toleranceSec?: number;
  now?: number;
}

export function verifySignature({
  rawBody,
  signature,
  timestamp,
  secret,
  toleranceSec = 300,
  now = Date.now(),
}: VerifySignatureInput): VerifyResult {
  if (!signature) return { ok: false, status: 401, reason: 'Thiếu header X-SePay-Signature' };
  if (!timestamp) return { ok: false, status: 401, reason: 'Thiếu header X-SePay-Timestamp' };

  const ts = Number.parseInt(String(timestamp), 10);
  if (!Number.isFinite(ts)) return { ok: false, status: 401, reason: 'Timestamp không hợp lệ' };

  // Chống replay: request quá cũ bị bỏ qua (doc ±5 phút).
  const skewSec = Math.abs(Math.floor(now / 1000) - ts);
  if (toleranceSec > 0 && skewSec > toleranceSec) {
    return { ok: false, status: 401, reason: `Request hết hạn (lệch ${skewSec}s > ${toleranceSec}s)` };
  }

  if (!safeEqual(sign(secret, ts, rawBody), signature.trim())) {
    return { ok: false, status: 401, reason: 'Chữ ký không khớp (kiểm tra Secret Key / phải dùng raw body)' };
  }
  return { ok: true };
}

/** Xác thực kiểu API Key: `Authorization: Apikey <API_KEY>` */
export function verifyApiKey({ authorization, apiKey }: { authorization: string | null | undefined; apiKey: string }): VerifyResult {
  const header = String(authorization ?? '');
  if (!header.startsWith('Apikey ')) {
    return { ok: false, status: 401, reason: 'Thiếu/sai định dạng header Authorization: Apikey <KEY>' };
  }
  if (!safeEqual(apiKey, header.slice('Apikey '.length).trim())) {
    return { ok: false, status: 401, reason: 'API Key không khớp' };
  }
  return { ok: true };
}

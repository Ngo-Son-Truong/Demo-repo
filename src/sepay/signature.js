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
 * parse rồi JSON.stringify lại, chữ ký sẽ lệch (thứ tự key, escape unicode,
 * khoảng trắng). Vì vậy route webhook dùng express.raw().
 */
import crypto from 'node:crypto';

/** @returns {"sha256=<hex>"} */
export function sign(secret, timestamp, rawBody) {
  const body = toText(rawBody);
  const digest = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex');
  return `sha256=${digest}`;
}

/** Sinh cả 2 header SePay sẽ gửi — mock simulator dùng lại đúng công thức này. */
export function signHeaders(secret, rawBody) {
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    'X-SePay-Timestamp': String(timestamp),
    'X-SePay-Signature': sign(secret, timestamp, rawBody),
  };
}

function toText(raw) {
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    // express.raw() trả Buffer; nhánh này chỉ để an toàn khi gọi tay.
    return JSON.stringify(raw);
  }
  return '';
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a ?? ''), 'utf8');
  const bb = Buffer.from(String(b ?? ''), 'utf8');
  if (ba.length !== bb.length) return false; // tránh timingSafeEqual ném lỗi
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * @returns {{ok: true} | {ok: false, reason: string, status: number}}
 */
export function verifySignature({ rawBody, signature, timestamp, secret, toleranceSec = 300, now = Date.now() }) {
  if (!signature) return { ok: false, status: 401, reason: 'Thiếu header X-SePay-Signature' };
  if (!timestamp) return { ok: false, status: 401, reason: 'Thiếu header X-SePay-Timestamp' };

  const ts = Number.parseInt(String(timestamp), 10);
  if (!Number.isFinite(ts)) return { ok: false, status: 401, reason: 'Timestamp không hợp lệ' };

  // Chống replay: request quá cũ bị bỏ qua (doc ±5 phút).
  const skewSec = Math.abs(Math.floor(now / 1000) - ts);
  if (toleranceSec > 0 && skewSec > toleranceSec) {
    return { ok: false, status: 401, reason: `Request hết hạn (lệch ${skewSec}s > ${toleranceSec}s)` };
  }

  const expected = sign(secret, ts, rawBody);
  if (!safeEqual(expected, signature.trim())) {
    return { ok: false, status: 401, reason: 'Chữ ký không khớp (kiểm tra Secret Key / dùng raw body)' };
  }
  return { ok: true };
}

/** Xác thực kiểu API Key: `Authorization: Apikey <API_KEY>` */
export function verifyApiKey({ authorization, apiKey }) {
  const header = String(authorization ?? '');
  if (!header.startsWith('Apikey ')) {
    return { ok: false, status: 401, reason: 'Thiếu/sai định dạng header Authorization: Apikey <KEY>' };
  }
  if (!safeEqual(apiKey, header.slice('Apikey '.length).trim())) {
    return { ok: false, status: 401, reason: 'API Key không khớp' };
  }
  return { ok: true };
}

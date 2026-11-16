/**
 * CHỈ DÙNG Ở CHẾ ĐỘ MOCK — giả lập phía SePay gửi webhook tới endpoint của bạn.
 *
 * Bắt chước 2 thứ trong doc:
 *   - Chữ ký: X-SePay-Signature = sha256(HMAC("{timestamp}.{raw_body}")) + X-SePay-Timestamp
 *   - Lịch retry: 1 lần đầu + 7 lần retry, chờ Fibonacci 1,1,2,3,5,8,13 phút.
 *     Demo nén 1 phút = config.sim.retryUnitSec giây.
 *
 * Trong hệ thống thật bạn KHÔNG có file này — SePay là bên gọi tới.
 */
import { config } from '../config.js';
import { signHeaders } from './signature.js';
import * as store from '../store.js';

/** SePay chỉ tính thành công khi: 200/201 + body `{"success": true}` + <30s. */
function isSuccess(res, bodyText) {
  if (![200, 201].includes(res.status)) return false;
  try {
    return JSON.parse(bodyText).success === true;
  } catch {
    return false;
  }
}

export function endpointUrl() {
  const base = config.publicUrl || `http://127.0.0.1:${config.port}`;
  return `${base}${config.webhook.path}`;
}

function buildHeaders(payload, attempt) {
  const rawBody = JSON.stringify(payload);
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-SePay-Attempt': String(attempt),
  };
  if (config.webhook.auth === 'hmac') Object.assign(headers, signHeaders(config.webhook.secret, rawBody));
  else if (config.webhook.auth === 'apikey') headers.Authorization = `Apikey ${config.webhook.apiKey}`;
  return { rawBody, headers };
}

/**
 * Gửi một lần (không retry). Trả về kết quả để UI hiển thị ngay.
 */
export async function deliverOnce(payload, { forceFail = false, attempt = 1 } = {}) {
  const url = endpointUrl();
  const { rawBody, headers } = buildHeaders(payload, attempt);
  if (forceFail) headers['X-Demo-Force-Fail'] = '1';

  const t0 = Date.now();
  try {
    const res = await fetch(url, { method: 'POST', headers, body: rawBody });
    const text = await res.text();
    const ok = isSuccess(res, text);
    return { ok, status: res.status, ms: Date.now() - t0, body: text.slice(0, 400), url, attempt };
  } catch (err) {
    // Bên SePay ghi log là Connection Refused / DNS Error (mã cURL 6,7,28...).
    return { ok: false, status: 0, ms: Date.now() - t0, body: err.message, url, attempt, curlCode: 7 };
  }
}

const FIB = [0, 1, 1, 2, 3, 5, 8, 13];

/**
 * Gửi + retry theo lịch SePay. Trả về kết quả lần ĐẦU để response của
 * route mô phỏng không bị chặn; các lần retry chạy nền và ghi vào log.
 */
export function deliverWithRetry(payload, { forceFail = false, webhookName = config.webhook.filters.name } = {}) {
  const first = deliverOnce(payload, { forceFail, attempt: 1 });

  first.then((result) => {
    store.logEvent({
      direction: 'outbound',
      kind: 'delivery',
      webhook: webhookName,
      url: result.url,
      attempt: 1,
      status: result.status,
      ok: result.ok,
      ms: result.ms,
      note: result.ok ? 'Webhook gửi thành công' : `Lần 1 thất bại — SePay sẽ retry (tối đa ${config.sim.maxAttempts - 1} lần)`,
      response: result.body,
      payload,
    });
    if (result.ok || config.sim.retryUnitSec <= 0) return;
    scheduleRetry(payload, { forceFail, webhookName, attempt: 2, totalWaitMin: 0 });
  });

  return first;
}

function scheduleRetry(payload, { forceFail, webhookName, attempt, totalWaitMin }) {
  if (attempt > config.sim.maxAttempts) {
    store.logEvent({
      direction: 'outbound',
      kind: 'delivery_failed',
      webhook: webhookName,
      note: `Đánh dấu Failed sau ${config.sim.maxAttempts} lần (~${totalWaitMin} phút). Replay từ trang chi tiết giao dịch hoặc đối soát bằng GET /v2/transactions.`,
      payload,
    });
    return;
  }
  const waitMin = FIB[Math.min(attempt - 1, FIB.length - 1)];
  totalWaitMin += waitMin;
  const ms = waitMin * config.sim.retryUnitSec * 1000;

  setTimeout(() => {
    deliverOnce(payload, { forceFail, attempt }).then((result) => {
      store.logEvent({
        direction: 'outbound',
        kind: 'delivery',
        webhook: webhookName,
        url: result.url,
        attempt,
        status: result.status,
        ok: result.ok,
        ms: result.ms,
        note: result.ok
          ? ` retry lần ${attempt - 1} thành công (đợi ${waitMin} phút theo Fibonacci)`
          : `retry lần ${attempt - 1} thất bại, lần sau ${FIB[Math.min(attempt, FIB.length - 1)]} phút`,
        response: result.body,
        payload,
      });
      if (result.ok) return;
      scheduleRetry(payload, { forceFail, webhookName, attempt: attempt + 1, totalWaitMin });
    });
  }, ms);
}

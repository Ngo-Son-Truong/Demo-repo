/**
 * CHỈ DÙNG Ở CHẾ ĐỘ MOCK — giả lập phía SePay gửi webhook tới endpoint của bạn.
 *
 * Bắt chước 2 thứ trong doc:
 *   - Chữ ký: X-SePay-Signature = sha256(HMAC("{timestamp}.{raw_body}")) + X-SePay-Timestamp
 *   - Lịch retry: 1 lần đầu + 7 retry, chờ Fibonacci 1,1,2,3,5,8,13 phút (~33 phút).
 *     Demo nén: 1 phút = config.sim.retryUnitSec giây.
 *
 * Hệ thống thật KHÔNG có file này — SePay là bên gọi tới.
 */
import { config } from '../config.ts';
import * as store from '../store.ts';
import { signHeaders } from './signature.ts';
import type { DeliveryResult, SePayWebhookPayload } from '../types.ts';

/** SePay chỉ tính thành công khi: 200/201 + `{"success": true}` + <30s. */
function isAckOk(status: number, bodyText: string): boolean {
  if (status !== 200 && status !== 201) return false;
  try {
    return (JSON.parse(bodyText) as { success?: unknown }).success === true;
  } catch {
    return false;
  }
}

export function endpointUrl(): string {
  const base = config.publicUrl || `http://127.0.0.1:${config.port}`;
  return `${base}${config.webhook.path}`;
}

function buildHeaders(payload: SePayWebhookPayload, attempt: number): { rawBody: string; headers: Record<string, string> } {
  const rawBody = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-SePay-Attempt': String(attempt),
  };
  if (config.webhook.auth === 'hmac') Object.assign(headers, signHeaders(config.webhook.secret, rawBody));
  else if (config.webhook.auth === 'apikey') headers.Authorization = `Apikey ${config.webhook.apiKey}`;
  return { rawBody, headers };
}

/** Gửi một lần, không retry. */
export async function deliverOnce(payload: SePayWebhookPayload, opts: { forceFail?: boolean; attempt?: number } = {}): Promise<DeliveryResult> {
  const { forceFail = false, attempt = 1 } = opts;
  const url = endpointUrl();
  const { rawBody, headers } = buildHeaders(payload, attempt);
  if (forceFail) headers['X-Demo-Force-Fail'] = '1';

  const t0 = Date.now();
  try {
    const res = await fetch(url, { method: 'POST', headers, body: rawBody });
    const text = await res.text();
    return { ok: isAckOk(res.status, text), status: res.status, ms: Date.now() - t0, body: text.slice(0, 400), url, attempt };
  } catch (err) {
    // Phía SePay ghi log là Connection Refused / DNS Error (mã cURL 6, 7, 28...).
    return { ok: false, status: 0, ms: Date.now() - t0, body: (err as Error).message, url, attempt, curlCode: 7 };
  }
}

/** [wait, ..., 13] — đúng cột "Chờ" trong bảng lịch retry của doc, tính theo phút. */
const FIB_MINUTES = [0, 1, 1, 2, 3, 5, 8, 13] as const;

/**
 * Gửi + retry theo lịch SePay. Trả về kết quả lần ĐẦU để response của route mô phỏng
 * không bị chặn; các lần retry chạy nền và ghi vào log.
 */
export function deliverWithRetry(
  payload: SePayWebhookPayload,
  opts: { forceFail?: boolean; webhookName?: string } = {}
): Promise<DeliveryResult> {
  const { forceFail = false, webhookName = config.webhook.filters.name } = opts;
  const first = deliverOnce(payload, { forceFail, attempt: 1 });

  void first.then((result) => {
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

function scheduleRetry(
  payload: SePayWebhookPayload,
  ctx: { forceFail: boolean; webhookName: string; attempt: number; totalWaitMin: number }
): void {
  const { forceFail, webhookName, attempt } = ctx;
  let { totalWaitMin } = ctx;

  if (attempt > config.sim.maxAttempts) {
    store.logEvent({
      direction: 'outbound',
      kind: 'delivery_failed',
      webhook: webhookName,
      note: `Đánh dấu Failed sau ${config.sim.maxAttempts} lần (~${totalWaitMin} phút). Replay từ trang chi tiết giao dịch, hoặc đối soát bằng GET /v2/transactions.`,
      payload,
    });
    return;
  }

  const waitMin = FIB_MINUTES[Math.min(attempt - 1, FIB_MINUTES.length - 1)] ?? 0;
  totalWaitMin += waitMin;

  setTimeout(() => {
    void deliverOnce(payload, { forceFail, attempt }).then((result) => {
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
          ? `retry lần ${attempt - 1} thành công (đợi ${waitMin} phút theo Fibonacci)`
          : `retry lần ${attempt - 1} thất bại, lần sau ${FIB_MINUTES[Math.min(attempt, FIB_MINUTES.length - 1)] ?? 0} phút`,
        response: result.body,
        payload,
      });
      if (result.ok) return;
      scheduleRetry(payload, { forceFail, webhookName, attempt: attempt + 1, totalWaitMin });
    });
  }, waitMin * config.sim.retryUnitSec * 1000);
}

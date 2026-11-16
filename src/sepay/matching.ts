/**
 * Khớp giao dịch → đơn hàng, và mô phỏng bộ lọc webhook của SePay.
 *
 * Pipeline 4 bước SePay chạy khi nhận một giao dịch
 * (doc: https://developer.sepay.vn/vi/tien-ich-khac/test-mode/mo-phong-giao-dich):
 *   1. Nhận giao dịch            — kiểm hạn mức ngày, ghi bản ghi vào tài khoản
 *   2. Bộ lọc giao dịch          — từng webhook bị chặn/cho qua, kèm lý do
 *   3. Khớp tài khoản ảo (VA)    — gắn VA vào `subAccount`
 *   4. Nhận diện mã thanh toán   — gán `code`
 *
 * Simulator của demo chạy lại đúng 4 bước này để thấy payload nào thực sự
 * được gửi đi và vì sao một số webhook bị "Bỏ qua".
 */
import { config } from '../config.ts';
import * as store from '../store.ts';
import type { AmountVerdict, FilterVerdict, MatchVia, SePayWebhookPayload } from '../types.ts';

/** Nhận diện mã thanh toán theo tiền tố cấu hình (VD "DH" → DH1001). */
export function extractPaymentCode(content: unknown, prefix: string = config.orders.codePrefix): string | null {
  const text = String(content ?? '');
  if (!prefix || !text) return null;
  const safe = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = text.match(new RegExp(`(?:^|[\\s.,;#_-])(${safe}[A-Z0-9]{4,20})`, 'i'));
  return m?.[1] ? m[1].toUpperCase() : null;
}

export interface MatchResult {
  order: ReturnType<typeof store.getOrder>;
  via: MatchVia;
}

/**
 * Ưu tiên VA (chính xác nhất — mỗi đơn một VA riêng) rồi tới mã thanh toán,
 * cuối cùng là mò mã trong nội dung.
 */
export function matchOrder(payload: SePayWebhookPayload): MatchResult {
  if (payload.subAccount) {
    const byVa = store.findByVa(payload.subAccount);
    if (byVa) return { order: byVa, via: 'subAccount' };
  }

  const code = payload.code ?? null;
  if (code) {
    const byCode = store.getOrder(code);
    if (byCode) return { order: byCode, via: 'code' };
  }

  // Dự phòng: đơn vị chưa cấu hình "Cấu trúc mã thanh toán" → SePay trả code=null,
  // nhưng mình vẫn tự đọc được tiền tố từ content.
  const guess = extractPaymentCode(payload.content);
  if (guess) {
    const byGuess = store.getOrder(guess);
    if (byGuess) return { order: byGuess, via: 'content' };
  }
  return { order: null, via: null };
}

/**
 * Bộ lọc webhook (= toggle "Dùng để xác thực thanh toán" ở bước Tài khoản).
 * Trả đúng chuỗi lý do dashboard SePay hiển thị.
 */
export function evaluateWebhookFilters(payload: SePayWebhookPayload): FilterVerdict {
  const f = config.webhook.filters;
  const skipped = (reason: string): FilterVerdict => ({ pass: false, reason, filter: true });

  if (f.eventType !== 'all' && payload.transferType !== f.eventType) {
    return skipped('Loại giao dịch không phù hợp với cấu hình webhook');
  }
  // Phân biệt null và "" theo doc: code null = không nhận diện được.
  if (f.onlyWithPaymentCode && !payload.code) {
    return skipped('Nội dung không chứa mã thanh toán');
  }
  if (f.codePrefixes.length && payload.code) {
    const upper = payload.code.toUpperCase();
    if (!f.codePrefixes.some((p) => upper.startsWith(p.toUpperCase()))) {
      return skipped('Mã thanh toán không khớp tiền tố cho phép');
    }
  }
  if (f.vaOnly && !payload.subAccount) {
    return skipped('Webhook chỉ nhận giao dịch của tài khoản ảo (VA)');
  }
  return { pass: true, filter: false };
}

/** Sacombank/Vietcombank/Shinhan chỉ nhận ĐÚNG số tiền (doc don-hang/tao-don-hang). */
export function checkAmount(order: { amount: number; paidAmount: number }, payload: SePayWebhookPayload): AmountVerdict {
  const received = payload.transferAmount;
  const missing = order.amount - order.paidAmount;
  if (received === order.amount) return { ok: true, verdict: 'exact', received };
  if (received < order.amount) {
    if (config.orders.allowPartialPayment) return { ok: true, verdict: 'partial_allowed', received };
    return { ok: false, verdict: 'underpaid', received, missing };
  }
  return { ok: false, verdict: 'overpaid', received, extra: received - order.amount };
}

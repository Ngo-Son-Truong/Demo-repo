/**
 * Khớp giao dịch → đơn hàng, và mô phỏng bộ lọc webhook của SePay.
 *
 * Pipeline 4 bước khi SePay xử lý một giao dịch (doc test-mode/mo-phong-giao-dich):
 *   1. Nhận giao dịch      — kiểm hạn mức ngày, ghi bản ghi vào tài khoản
 *   2. Bộ lọc giao dịch    — từng webhook bị chặn/cho qua, kèm lý do
 *   3. Khớp tài khoản ảo   — gắn VA vào `subAccount`
 *   4. Nhận diện mã thanh toán — gán `code`
 *
 * Simulator của demo chạy lại đúng 4 bước này để bạn thấy payload nào
 * thực sự được gửi đi và vì sao một số webhook bị "Bỏ qua".
 */
import { config } from '../config.js';
import * as store from '../store.js';

/** Nhận diện mã thanh toán theo tiền tố cấu hình (VD "DH" → DH1001). */
export function extractPaymentCode(content, prefix = config.orders.codePrefix) {
  const text = String(content ?? '');
  if (!prefix) return null;
  const safe = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = text.match(new RegExp(`(?:^|[\\s.,;#_-])(${safe}[A-Z0-9]{4,20})`, 'i'));
  return m ? m[1].toUpperCase() : null;
}

/**
 * @returns {{order: object|null, via: string|null}}
 * Ưu tiên VA (chính xác nhất) rồi mới tới mã thanh toán.
 */
export function matchOrder(payload) {
  const va = String(payload.subAccount ?? '').trim();
  if (va) {
    const byVa = store.findByVa(va);
    if (byVa) return { order: byVa, via: 'subAccount' };
  }

  const code = payload.code ?? extractPaymentCode(payload.content);
  if (code) {
    const byCode = store.getOrder(code);
    if (byCode) return { order: byCode, via: 'code' };
  }

  // dự phòng: nhiều đơn vị nhét mã đơn vào nội dung mà không có code/subAccount
  const guess = extractPaymentCode(payload.content);
  if (guess) {
    const byGuess = store.getOrder(guess);
    if (byGuess) return { order: byGuess, via: 'content' };
  }
  return { order: null, via: null };
}

/**
 * Bộ lọc webhook (điều kiện "Dùng để xác thực thanh toán" ở bước Tài khoản).
 * Trả về lý do bỏ qua ĐÚNG như chuỗi hiển thị trên dashboard SePay.
 */
export function evaluateWebhookFilters(payload) {
  const f = config.webhook.filters;
  const skipped = (reason) => ({ pass: false, reason, filter: true });

  if (f.eventType !== 'all' && payload.transferType !== f.eventType) {
    return skipped('Loại giao dịch không phù hợp với cấu hình webhook');
  }
  const hasCode = payload.code !== null && payload.code !== undefined && String(payload.code) !== '';
  if (f.onlyWithPaymentCode && !hasCode) {
    return skipped('Nội dung không chứa mã thanh toán');
  }
  if (f.codePrefixes.length && hasCode) {
    const ok = f.codePrefixes.some((p) => String(payload.code).toUpperCase().startsWith(p.toUpperCase()));
    if (!ok) return skipped('Mã thanh toán không khớp tiền tố cho phép');
  }
  if (f.vaOnly && !String(payload.subAccount ?? '').trim()) {
    return skipped('Webhook chỉ nhận giao dịch của tài khoản ảo (VA)');
  }
  return { pass: true, filter: false };
}

/** Số tiền có khớp yêu cầu đơn hàng không? (Sacombank/VCB/Shinhan chỉ nhận đúng tiền) */
export function checkAmount(order, payload) {
  const received = Number(payload.transferAmount ?? 0);
  const missing = (order.amount ?? 0) - (order.paidAmount ?? 0);
  if (received === order.amount) return { ok: true, verdict: 'exact', received };
  if (received < order.amount) {
    if (config.orders.allowPartialPayment) return { ok: true, verdict: 'partial_allowed', received };
    return { ok: false, verdict: 'underpaid', received, missing };
  }
  return { ok: false, verdict: 'overpaid', received, extra: received - order.amount };
}

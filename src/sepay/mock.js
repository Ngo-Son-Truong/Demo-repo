/**
 * SEPAY MOCK — giả lập SePay API v2 (sandbox) + "phía ngân hàng" trong process,
 * để demo chạy ngay khi chưa có token.
 *
 * Mô phỏng theo đúng hợp đồng trong doc:
 *   - JSON envelope { status, message?, data, meta? }
 *   - VA Test mode: "SBSEPAY" + 12 ký tự            → test-mode/tao-va
 *   - referenceCode tự sinh bắt đầu bằng "SB"        → test-mode/mo-phong-giao-dich
 *   - POST /v2/bank-accounts/{ba_xid}/orders → 201, data.qr_code_url vietqr
 *   - DELETE .../orders/{xid} → 204 body rỗng
 *   - order status: Pending | Paid | Partially | Cancelled
 *   - payload webhook 12 trường: id, gateway, transactionDate, accountNumber,
 *     subAccount, code, content, transferType, description, transferAmount,
 *     accumulated, referenceCode
 *
 * Sổ cái ngân hàng (store.bank*) ĐỘC LẬP với DB đơn hàng: nhờ vậy flow
 * "đối soát bằng GET /v2/..." phát hiện được đơn đã trả nhưng mất webhook —
 * nếu cả hai đọc chung một bảng thì demo sẽ tự xác nhận chính nó.
 *
 * Đây là fixture cho demo, KHÔNG phải SDK chính thức của SePay.
 */
import crypto from 'node:crypto';
import { config } from '../config.js';
import * as store from '../store.js';

export const MOCK_BANK_ACCOUNT_ID = 'f9e8d7c6-b5a4-3210-fedc-ba0987654321';

// Bỏ I/O/0/1 để VA dễ đọc khi khách nhập tay nội dung chuyển khoản.
const VA_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomChars(n) {
  const bytes = crypto.randomBytes(n);
  let out = '';
  for (let i = 0; i < n; i += 1) out += VA_ALPHABET[bytes[i] % VA_ALPHABET.length];
  return out;
}

/** "YYYY-MM-DD HH:mm:ss" giờ Việt Nam (UTC+7) — định dạng SePay dùng trong payload/API. */
export function formatVietnamDateTime(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return new Date(d.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

const envelope = (data, extra = {}) => ({ status: 'success', data, ...extra });

export function bankAccount() {
  return {
    id: MOCK_BANK_ACCOUNT_ID,
    account_holder_name: 'HO KINH DOANH DEMO HOI AN',
    account_number: '0123456789',
    accumulated: 15_000_000,
    last_transaction: formatVietnamDateTime(),
    label: 'Tai khoan Test mode',
    active: 1,
    bank_short_name: 'MBBank',
    bank_full_name: 'Ngan hang Quan doi (MB)',
    bank_code: 'MBBank',
  };
}

export function mockListBankAccounts() {
  return { status: 200, body: envelope([bankAccount()]) };
}

export function mockCreateOrder({ orderCode, amount, expiredAt }) {
  const acc = bankAccount();
  const va = `SBSEPAY${randomChars(12)}`;
  const record = {
    id: crypto.randomUUID(),
    order_code: orderCode,
    va,
    amount,
    paid_amount: 0,
    status: 'Pending',
    refund_status: null,
    created_at: formatVietnamDateTime(),
    expired_at: expiredAt ? formatVietnamDateTime(expiredAt) : null,
    transactions: [],
  };
  store.bankPut(orderCode, record);

  // Doc trả `va_number` (không phải `va`) ở response tạo đơn.
  const data = {
    ...record,
    va_number: va,
    va_holder_name: acc.account_holder_name,
    bank_name: acc.bank_short_name,
    account_holder_name: acc.account_holder_name,
    account_number: acc.account_number,
    qr_code_url: `https://vietqr.app/img?acc=${va}&bank=${acc.bank_code}&amount=${amount}&template=${config.sepay.qrTemplate}`,
  };
  return { status: 201, body: envelope(data, { message: 'Order created successfully' }) };
}

export function mockGetOrder(orderCode) {
  const rec = store.bankGet(orderCode);
  if (!rec) return { status: 404, body: { status: 'error', message: 'Order not found' } };
  const acc = bankAccount();
  return {
    status: 200,
    body: envelope({
      id: rec.id,
      order_code: rec.order_code,
      amount: rec.amount,
      paid_amount: rec.paid_amount,
      status: rec.status,
      refund_status: rec.refund_status,
      created_at: rec.created_at,
      bank_name: acc.bank_short_name,
      account_number: acc.account_number,
      account_holder_name: acc.account_holder_name,
      // GET /orders/{order_xid} trả MẢNG va[], khác POST (trả va_number phẳng).
      va: [
        {
          va_number: rec.va,
          va_holder_name: acc.account_holder_name,
          amount: rec.amount,
          status: rec.status === 'Paid' ? 'Paid' : rec.status === 'Cancelled' ? 'Cancelled' : 'Unpaid',
          expired_at: rec.expired_at,
          paid_at: rec.paid_at ?? null,
        },
      ],
    }),
  };
}

export function mockCancelOrder(orderCode) {
  const rec = store.bankGet(orderCode);
  if (!rec) return { status: 404, body: { status: 'error', message: 'Order not found' } };
  // Doc: "Chỉ đơn hàng trạng thái Pending mới có thể hủy."
  if (rec.status !== 'Pending') {
    return {
      status: 422,
      body: { status: 'error', error_code: 'invalid_state', message: 'Trạng thái đơn hàng không cho phép hủy' },
    };
  }
  store.bankPut(orderCode, { ...rec, status: 'Cancelled' });
  return { status: 204, body: null };
}

export function mockListTransactions(query = {}) {
  const all = Object.values(store.snapshot().mockBank).flatMap((r) => r.transactions ?? []);
  let rows = all.slice().reverse();
  if (query.q) {
    const q = String(query.q).toLowerCase();
    rows = rows.filter((t) => `${t.reference_number} ${t.transaction_content} ${t.code ?? ''}`.toLowerCase().includes(q));
  }
  if (query.bank_brand_name) rows = rows.filter((t) => t.bank_brand_name === query.bank_brand_name);
  if (query.transfer_type) rows = rows.filter((t) => t.transfer_type === query.transfer_type);
  const perPage = Math.min(parseInt(query.per_page ?? '20', 10) || 20, 100);
  return {
    status: 200,
    body: envelope(rows.slice(0, perPage), {
      meta: { pagination: { total: rows.length, per_page: perPage, current_page: 1, last_page: 1, has_more: false } },
    }),
  };
}

/**
 * Ghi một giao dịch vào "phía ngân hàng" (bước 1 của pipeline mô phỏng).
 * Trả về bản ghi đã cập nhật — webhook sau đó mới là thứ đổi DB đơn hàng.
 */
export function mockRecordTransaction({ payload, orderCode }) {
  const code = orderCode ?? (payload.code ? String(payload.code).toUpperCase() : null);
  const rec = code ? store.bankGet(code) : store.bankFindByVa(payload.subAccount);
  if (!rec) return { matched: false, reason: 'không có đơn hàng khớp trên tài khoản này' };

  const txn = {
    id: crypto.randomUUID(),
    transaction_date: payload.transactionDate,
    account_number: payload.accountNumber,
    va: payload.subAccount || null,
    transfer_type: payload.transferType,
    amount_in: payload.transferType === 'in' ? payload.transferAmount : 0,
    amount_out: payload.transferType === 'out' ? payload.transferAmount : 0,
    accumulated: payload.accumulated,
    transaction_content: payload.content,
    reference_number: payload.referenceCode,
    code: payload.code,
    bank_brand_name: payload.gateway,
    bank_account_id: MOCK_BANK_ACCOUNT_ID,
    webhook_success: 1,
  };
  const transactions = [...(rec.transactions ?? []), txn];

  let { paid_amount: paidAmount, status } = rec;
  if (payload.transferType === 'in') {
    paidAmount += payload.transferAmount;
    if (paidAmount >= rec.amount) status = 'Paid';
    else if (paidAmount > 0) status = 'Partially';
  }

  const next = {
    ...rec,
    transactions,
    paid_amount: paidAmount,
    status,
    paid_at: status === 'Paid' ? formatVietnamDateTime() : rec.paid_at ?? null,
  };
  store.bankPut(rec.order_code, next);
  return { matched: true, orderCode: rec.order_code, record: next, transaction: txn };
}

export function mockCancelPendingExpired() {
  let n = 0;
  for (const rec of Object.values(store.snapshot().mockBank)) {
    if (rec.status === 'Pending' && rec.expired_at && new Date(`${rec.expired_at}+07:00`) < new Date()) {
      store.bankPut(rec.order_code, { ...rec, status: 'Cancelled' });
      n += 1;
    }
  }
  return n;
}

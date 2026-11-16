/**
 * Client SePay API v2 — một lớp mỏng, route sang mock hoặc HTTP thật.
 *
 * Doc:
 *   Xác thực      https://developer.sepay.vn/vi/sepay-api/v2/xac-thuc
 *   Tạo đơn hàng  https://developer.sepay.vn/vi/sepay-api/v2/don-hang/tao-don-hang
 *   Danh sách     https://developer.sepay.vn/vi/sepay-api/v2/giao-dich/danh-sach
 *
 * Endpoint (Live = userapi.sepay.vn, Test mode = userapi-sandbox.sepay.vn):
 *   GET    /v2/bank-accounts
 *   POST   /v2/bank-accounts/{ba_xid}/orders
 *   GET    /v2/bank-accounts/{ba_xid}/orders/{order_xid}
 *   DELETE /v2/bank-accounts/{ba_xid}/orders/{order_xid}
 *   GET    /v2/transactions
 *
 * Token chỉ sống ở server. TUYỆT ĐỐI không đưa Bearer token xuống frontend.
 */
import { config, isMock } from '../config.js';
import * as mock from './mock.js';

const REQUEST_TIMEOUT_MS = 15_000;

class SePayError extends Error {
  constructor(message, { status, errorCode, body } = {}) {
    super(message);
    this.name = 'SePayError';
    this.status = status ?? 500;
    this.errorCode = errorCode ?? null;
    this.body = body ?? null;
  }
}

async function request(method, path, { query, body } = {}) {
  const url = new URL(path, config.sepay.apiBase);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${config.sepay.token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new SePayError(err.name === 'AbortError' ? `SePay API timeout >${REQUEST_TIMEOUT_MS / 1000}s` : err.message, {
      status: 502,
    });
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 204) return null; // DELETE order thành công: body rỗng

  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    const errorCode = parsed?.error_code ?? parsed?.code ?? null;
    throw new SePayError(parsed?.message ?? parsed?.error ?? text?.slice(0, 300) ?? `HTTP ${res.status}`, {
      status: res.status,
      errorCode,
      body: parsed ?? text,
    });
  }
  return parsed;
}

function requireBankAccount(id) {
  const baXid = id || config.sepay.bankAccountId;
  if (!baXid) {
    throw new SePayError(
      'Thiếu SEPAY_BANK_ACCOUNT_ID (UUID tài khoản ngân hàng). Lấy từ GET /v2/bank-accounts rồi ghi vào .env',
      { status: 400 }
    );
  }
  return baXid;
}

/** Mock và API thật đều được unwrap về `data` để route chỉ quan tâm business fields. */
export async function listBankAccounts() {
  if (isMock()) return mock.mockListBankAccounts().body.data;
  const res = await request('GET', '/v2/bank-accounts');
  return res?.data ?? null;
}

/**
 * Tạo VA theo đơn hàng. Khác biệt theo ngân hàng (doc):
 *   Vietcombank → bắt buộc `tid`; Sacombank → bắt buộc `va_prefix`;
 *   amount bắt buộc với Sacombank/Vietcombank/VietinBank/Shinhan;
 *   order_code 6-50 ký tự, riêng Vietcombank & Shinhan tối đa 15.
 */
export async function createOrder({ orderCode, amount, duration }) {
  if (isMock()) {
    const expiredAt = Date.now() + (duration ?? config.sepay.vaDurationSec) * 1000;
    return mock.mockCreateOrder({ orderCode, amount, expiredAt }).body.data;
  }

  const baXid = requireBankAccount();
  const body = {
    order_code: orderCode,
    amount,
    duration: duration ?? config.sepay.vaDurationSec,
    with_qrcode: config.sepay.withQrCode ? 1 : 0,
    qrcode_template: config.sepay.qrTemplate,
  };
  if (config.sepay.tid) body.tid = config.sepay.tid;
  if (config.sepay.vaPrefix) body.va_prefix = config.sepay.vaPrefix;

  const res = await request('POST', `/v2/bank-accounts/${encodeURIComponent(baXid)}/orders`, { body });
  return res?.data ?? null;
}

export async function getOrder(orderCode, { orderXid } = {}) {
  if (isMock()) return mock.mockGetOrder(orderCode).body.data;
  const baXid = requireBankAccount();
  if (!orderXid) throw new SePayError('Cần order_xid (UUID) để gọi GET /orders/{order_xid}', { status: 400 });
  const res = await request('GET', `/v2/bank-accounts/${encodeURIComponent(baXid)}/orders/${encodeURIComponent(orderXid)}`);
  return res?.data ?? null;
}

export async function cancelOrder(orderCode, { orderXid } = {}) {
  if (isMock()) { const r = mock.mockCancelOrder(orderCode); if (r.status !== 204) { const e = r.body; throw new SePayError(e.message, { status: r.status, errorCode: e.error_code, body: e }); } return { cancelled: true }; }
  const baXid = requireBankAccount();
  if (!orderXid) throw new SePayError('Cần order_xid (UUID) để gọi DELETE /orders/{order_xid}', { status: 400 });
  await request('DELETE', `/v2/bank-accounts/${encodeURIComponent(baXid)}/orders/${encodeURIComponent(orderXid)}`);
  return { cancelled: true };
}

export async function listTransactions(query = {}) {
  if (isMock()) return mock.mockListTransactions(query).body;
  return request('GET', '/v2/transactions', { query });
}

/**
 * Đối soát: tìm giao dịch "in" khớp đơn hàng qua API thay vì chờ webhook.
 * Doc khuyến nghị `q` tìm đồng thời trên reference_number / transaction_content / code.
 */
export async function findTransactionFor(order) {
  const needle = order.va || order.code;
  const res = await listTransactions({ q: needle, transfer_type: 'in', per_page: 20 });
  const rows = Array.isArray(res?.data) ? res.data : [];
  return (
    rows.find(
      (t) =>
        (order.va && (t.va === order.va || String(t.transaction_content ?? '').includes(order.va))) ||
        (order.code && (t.code === order.code || String(t.transaction_content ?? '').includes(order.code)))
    ) ?? null
  );
}

export { SePayError };

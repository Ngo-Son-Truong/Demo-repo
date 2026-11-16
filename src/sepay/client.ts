/**
 * Client SePay API v2 — lớp mỏng, route sang mock hoặc HTTP thật.
 *
 * Endpoint (Live = userapi.sepay.vn, Test mode = userapi-sandbox.sepay.vn):
 *   GET    /v2/bank-accounts
 *   POST   /v2/bank-accounts/{ba_xid}/orders
 *   GET    /v2/bank-accounts/{ba_xid}/orders/{order_xid}
 *   DELETE /v2/bank-accounts/{ba_xid}/orders/{order_xid}
 *   GET    /v2/transactions
 *
 * Doc: https://developer.sepay.vn/vi/sepay-api/v2/xac-thuc  (Bearer + rate limit)
 * Token CHỈ ở server. Không bao giờ đặt Bearer token trong code frontend/mobile app.
 */
import { config, isMock } from '../config.ts';
import * as mock from './mock.ts';
import type {
  CreateOrderInput,
  SePayBankAccount,
  SePayCreatedOrder,
  SePayEnvelope,
  SePayErrorBody,
  SePayOrderDetail,
  SePayTransactionQuery,
  SePayTransactionRow,
} from '../types.ts';

const REQUEST_TIMEOUT_MS = 15_000;

export class SePayError extends Error {
  readonly status: number;
  readonly errorCode: string | null;
  readonly body: SePayErrorBody | string | null;

  constructor(message: string, opts: { status?: number; errorCode?: string | null; body?: SePayErrorBody | string | null } = {}) {
    super(message);
    this.name = 'SePayError';
    this.status = opts.status ?? 500;
    this.errorCode = opts.errorCode ?? null;
    this.body = opts.body ?? null;
  }
}

export type { SePayTransactionQuery as TransactionQuery } from '../types.ts';

async function request<T>(
  method: string,
  path: string,
  opts: { query?: SePayTransactionQuery; body?: Record<string, unknown> } = {}
): Promise<SePayEnvelope<T>> {
  const url = new URL(path, config.sepay.apiBase);
  // Query luôn là scalar — enum/number đều stringify an toàn.
  for (const [k, v] of Object.entries(opts.query ?? {}) as Array<[string, string | number | undefined]>) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${config.sepay.token}`,
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch (err) {
    const msg = (err as Error).name === 'AbortError' ? `SePay API timeout >${REQUEST_TIMEOUT_MS / 1000}s` : (err as Error).message;
    throw new SePayError(msg, { status: 502 });
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 204) return { status: 'success', data: null as T }; // DELETE thành công: body rỗng

  const text = await res.text();
  let parsed: (SePayEnvelope<T> & SePayErrorBody) | null = null;
  try {
    parsed = text ? (JSON.parse(text) as SePayEnvelope<T> & SePayErrorBody) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    throw new SePayError(parsed?.message ?? parsed?.error ?? text.slice(0, 300) ?? `HTTP ${res.status}`, {
      status: res.status,
      errorCode: parsed?.error_code ?? null,
      body: parsed ?? text,
    });
  }
  if (!parsed) throw new SePayError(`SePay trả body không phải JSON (HTTP ${res.status})`, { status: 502, body: text });
  return parsed;
}

function requireBankAccount(id?: string): string {
  const baXid = id || config.sepay.bankAccountId;
  if (!baXid) {
    throw new SePayError('Thiếu SEPAY_BANK_ACCOUNT_ID (UUID tài khoản ngân hàng). Lấy từ GET /v2/bank-accounts rồi ghi vào .env', {
      status: 400,
    });
  }
  return baXid;
}

export async function listBankAccounts(): Promise<SePayBankAccount[]> {
  if (isMock()) return mock.mockListBankAccounts().body?.data ?? [];
  const res = await request<SePayBankAccount[]>('GET', '/v2/bank-accounts');
  return res.data ?? [];
}

/**
 * Tạo VA theo đơn hàng. Khác biệt theo ngân hàng (doc don-hang/tao-don-hang):
 *   Vietcombank → bắt buộc `tid`; Sacombank → bắt buộc `va_prefix`;
 *   amount bắt buộc với Sacombank/VCB/VietinBank/Shinhan;
 *   order_code 6-50 ký tự, riêng Vietcombank & Shinhan tối đa 15.
 */
export async function createOrder({ orderCode, amount, duration }: CreateOrderInput): Promise<SePayCreatedOrder> {
  if (isMock()) {
    const expiredAt = Date.now() + (duration ?? config.sepay.vaDurationSec) * 1000;
    return mock.mockCreateOrder({ orderCode, amount, expiredAt }).body?.data as SePayCreatedOrder;
  }

  const baXid = requireBankAccount();
  const body: Record<string, unknown> = {
    order_code: orderCode,
    amount,
    duration: duration ?? config.sepay.vaDurationSec,
    with_qrcode: config.sepay.withQrCode ? 1 : 0,
    qrcode_template: config.sepay.qrTemplate,
  };
  if (config.sepay.tid) body.tid = config.sepay.tid;
  if (config.sepay.vaPrefix) body.va_prefix = config.sepay.vaPrefix;

  const res = await request<SePayCreatedOrder>('POST', `/v2/bank-accounts/${encodeURIComponent(baXid)}/orders`, { body });
  if (!res.data) throw new SePayError('SePay trả 201 nhưng thiếu data', { status: 502 });
  return res.data;
}

export async function getOrder(orderCode: string, opts: { orderXid?: string | null } = {}): Promise<SePayOrderDetail | null> {
  if (isMock()) return mock.mockGetOrder(orderCode).body?.data ?? null;
  const baXid = requireBankAccount();
  if (!opts.orderXid) throw new SePayError('Cần order_xid (UUID) để gọi GET /orders/{order_xid}', { status: 400 });
  const res = await request<SePayOrderDetail>('GET', `/v2/bank-accounts/${encodeURIComponent(baXid)}/orders/${encodeURIComponent(opts.orderXid)}`);
  return res.data ?? null;
}

/** Chỉ đơn `Pending` mới hủy được; SePay đồng thời chuyển VA Unpaid → Cancelled. */
export async function cancelOrder(orderCode: string, opts: { orderXid?: string | null } = {}): Promise<{ cancelled: true }> {
  if (isMock()) {
    const r = mock.mockCancelOrder(orderCode);
    if (r.status !== 204 && r.error) {
      throw new SePayError(r.error.message ?? 'Hủy đơn thất bại', { status: r.status, errorCode: r.error.error_code ?? null, body: r.error });
    }
    return { cancelled: true };
  }
  const baXid = requireBankAccount();
  if (!opts.orderXid) throw new SePayError('Cần order_xid (UUID) để gọi DELETE /orders/{order_xid}', { status: 400 });
  await request<null>('DELETE', `/v2/bank-accounts/${encodeURIComponent(baXid)}/orders/${encodeURIComponent(opts.orderXid)}`);
  return { cancelled: true };
}

export async function listTransactions(query: SePayTransactionQuery = {}): Promise<SePayEnvelope<SePayTransactionRow[]>> {
  if (isMock()) return mock.mockListTransactions(query).body as SePayEnvelope<SePayTransactionRow[]>;
  return request<SePayTransactionRow[]>('GET', '/v2/transactions', { query });
}

/**
 * Đối soát: tìm giao dịch "in" khớp đơn hàng thay vì chờ webhook.
 * `q` tìm đồng thời trên reference_number / transaction_content / code.
 */
export async function findTransactionFor(order: { va: string | null; code: string }): Promise<SePayTransactionRow | null> {
  const needle = order.va || order.code;
  const res = await listTransactions({ q: needle, transfer_type: 'in', per_page: 20 });
  const rows = Array.isArray(res?.data) ? res.data : [];
  return (
    rows.find(
      (t) =>
        (order.va && (t.va === order.va || t.transaction_content.includes(order.va))) ||
        (order.code && (t.code === order.code || t.transaction_content.includes(order.code)))
    ) ?? null
  );
}

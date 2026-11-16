/**
 * Store đơn hàng + log webhook (file JSON, không cần DB để chạy demo).
 *
 * Production: thay bằng Postgres/MySQL và đặt UNIQUE trên `sepay_transaction_id`
 * rồi dùng INSERT IGNORE — doc khuyến nghị vì SePay retry tối đa 7 lần (Fibonacci)
 * và admin có thể bấm "Phát lại" cả log đã thành công.
 * Doc: https://developer.sepay.vn/vi/sepay-webhooks/tich-hop-webhook#chong-trung-lap
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { MockBankRecord, OrderRecord, WebhookEvent } from './types.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.SEPAY_DATA_DIR ? path.resolve(process.env.SEPAY_DATA_DIR) : path.join(ROOT, 'data');
const FILE = path.join(DATA_DIR, 'state.json');

export interface StoreState {
  orderSeq: number;
  orders: Record<string, OrderRecord>;
  events: WebhookEvent[];
  /** id giao dịch SePay đã xử lý → thời điểm (khóa chống trùng) */
  seenTxn: Record<string, string>;
  /** VA -> mã đơn, để webhook khớp subAccount */
  vaLedger: Record<string, { orderCode: string; status: string; paidAmount: number }>;
  /** sổ cái "phía ngân hàng" của mock — độc lập với orders để test đối soát */
  mockBank: Record<string, MockBankRecord>;
  /** hạn mức mô phỏng theo ngày VN */
  sim: { day: string; used: number };
}

const MAX_EVENTS = 60;

const emptyState = (): StoreState => ({
  orderSeq: 1000,
  orders: {},
  events: [],
  seenTxn: {},
  vaLedger: {},
  mockBank: {},
  sim: { day: '', used: 0 },
});

let state: StoreState = emptyState();
let saveTimer: NodeJS.Timeout | null = null;

try {
  if (fs.existsSync(FILE)) {
    const loaded = JSON.parse(fs.readFileSync(FILE, 'utf8')) as Partial<StoreState>;
    state = { ...emptyState(), ...loaded };
  }
} catch (err) {
  console.warn('[store] state.json hỏng, khởi tạo lại:', (err as Error).message);
}

function save(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
      fs.renameSync(tmp, FILE);
    } catch (err) {
      console.warn('[store] không ghi được state.json:', (err as Error).message);
    }
  }, 120);
}

export function flush(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  save();
}

/* ------------------------------- orders ------------------------------- */

export function nextOrderCode(prefix: string): string {
  state.orderSeq += 1;
  save();
  return `${prefix}${state.orderSeq}`;
}

export function putOrder(order: OrderRecord): OrderRecord {
  state.orders[order.code] = order;
  if (order.va) {
    state.vaLedger[order.va] = { orderCode: order.code, status: order.status, paidAmount: order.paidAmount };
  }
  save();
  return order;
}

export function getOrder(code: unknown): OrderRecord | null {
  const key = String(code ?? '')
    .trim()
    .toUpperCase();
  if (!key) return null;
  return state.orders[key] ?? null;
}

export function listOrders(limit = 20): OrderRecord[] {
  return Object.values(state.orders)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);
}

export function findByVa(va: unknown): OrderRecord | null {
  const key = String(va ?? '').trim();
  if (!key) return null;
  const hit = state.vaLedger[key];
  if (!hit) return null;
  return state.orders[hit.orderCode] ?? null;
}

export interface SettleInput {
  amount: number;
  txnId?: number | string | null;
  va?: string | null;
  content?: string | null;
  method: string;
}

export interface SettleResult {
  order: OrderRecord | null;
  changed: boolean;
  skipped?: string;
}

/**
 * Trạng thái chuyển một chiều: pending → paid là đích. Ghi log để UI hiện
 * "khớp bằng cách nào" (webhook hay api-poll).
 */
export function settleOrder(code: string, input: SettleInput): SettleResult {
  const order = getOrder(code);
  if (!order) return { order: null, changed: false, skipped: 'không tìm thấy đơn hàng' };
  if (order.status === 'paid') return { order, changed: false, skipped: 'đơn đã paid trước đó (idempotent)' };

  order.paidAmount += input.amount;
  const at = new Date().toISOString();
  order.settleLog = [
    ...order.settleLog,
    { at, amount: input.amount, txnId: input.txnId ?? null, va: input.va ?? null, content: input.content ?? null, method: input.method },
  ].slice(-10);

  if (order.paidAmount >= order.amount) order.status = 'paid';
  else if (order.paidAmount > 0) order.status = 'partially_paid';

  delete order.flag;
  delete order.flagDetail;
  if (input.txnId !== undefined) order.lastTxnId = input.txnId;
  state.orders[order.code] = order;
  save();
  return { order, changed: true };
}

export function markOrder(code: string, patch: Partial<OrderRecord>): OrderRecord | null {
  const order = getOrder(code);
  if (!order) return null;
  Object.assign(order, patch);
  state.orders[order.code] = order;
  save();
  return order;
}

/* ------------------------------- events ------------------------------- */

export type EventInput = Omit<WebhookEvent, 'id' | 'at'>;

export function logEvent(entry: EventInput): WebhookEvent {
  const event: WebhookEvent = { id: crypto.randomUUID(), at: new Date().toISOString(), ...entry };
  state.events.unshift(event);
  state.events = state.events.slice(0, MAX_EVENTS);
  save();
  return event;
}

export function listEvents(limit = 40): WebhookEvent[] {
  return state.events.slice(0, limit);
}

/* --------------------------- chống trùng webhook --------------------------- */

export function hasSeenTxn(id: number | string): boolean {
  return Boolean(state.seenTxn[String(id)]);
}

export function markSeenTxn(id: number | string): void {
  state.seenTxn[String(id)] = new Date().toISOString();
  save();
}

/* ------------------------- hạn mức mô phỏng / ngày VN ------------------------- */

/** "Ngày" theo giờ Việt Nam (UTC+7) — Test mode reset hạn mức lúc 00:00 UTC+7. */
export function vietnamDay(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export function simQuota(): { day: string; used: number } {
  const day = vietnamDay();
  if (state.sim.day !== day) {
    state.sim = { day, used: 0 };
    save();
  }
  return { ...state.sim };
}

export function useSimQuota(): { day: string; used: number } {
  const q = simQuota();
  q.used += 1;
  state.sim = q;
  save();
  return q;
}

export function resetAll(): void {
  state = emptyState();
  save();
}

export function snapshot(): StoreState {
  return state;
}

/* ------------------- sổ cái "phía ngân hàng" của mock ------------------- */

export function bankGet(orderCode: string): MockBankRecord | null {
  return state.mockBank[String(orderCode).trim().toUpperCase()] ?? null;
}

export function bankPut(orderCode: string, rec: MockBankRecord): MockBankRecord {
  state.mockBank[orderCode.toUpperCase()] = rec;
  save();
  return rec;
}

export function bankFindByVa(va: unknown): MockBankRecord | null {
  const key = String(va ?? '').trim();
  if (!key) return null;
  return Object.values(state.mockBank).find((r) => r.va === key) ?? null;
}

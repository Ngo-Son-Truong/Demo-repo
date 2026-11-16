/**
 * Store đơn hàng + log webhook.
 *
 * Demo dùng file JSON cho dễ đọc/dễ xoá. Production: thay bằng Postgres/MySQL
 * và đặt UNIQUE trên `sepay_transaction_id` — doc khuyến nghị INSERT IGNORE
 * để chống trùng vì SePay retry (tối đa 7 lần, Fibonacci) và admin có thể
 * bấm "Phát lại" cả log đã thành công.
 * Doc: https://developer.sepay.vn/vi/sepay-webhooks/tich-hop-webhook#chong-trung-lap
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.SEPAY_DATA_DIR ? path.resolve(process.env.SEPAY_DATA_DIR) : path.join(ROOT, 'data');
const FILE = path.join(DATA_DIR, 'state.json');

const EMPTY = {
  orderSeq: 1000,
  /** code -> order */
  orders: {},
  /** mảng event webhook, giữ tối đa MAX_EVENTS */
  events: [],
  /** id giao dịch SePay đã xử lý (chống trùng) */
  seenTxn: {},
  /** mock SePay: VA -> {orderCode, status, paidAmount} */
  vaLedger: {},
  /** sổ cái "phía ngân hàng" của mock — độc lập với DB đơn hàng để test đối soát */
  mockBank: {},
  /** hạn mức mô phỏng theo ngày VN */
  sim: { day: '', used: 0 },
};

const MAX_EVENTS = 60;

let state = structuredClone(EMPTY);
let saveTimer = null;

try {
  if (fs.existsSync(FILE)) {
    const loaded = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    state = { ...structuredClone(EMPTY), ...loaded, orders: loaded.orders ?? {}, events: loaded.events ?? [] };
  }
} catch (err) {
  console.warn('[store] state.json hỏng, khởi tạo lại:', err.message);
}

function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
      fs.renameSync(tmp, FILE);
    } catch (err) {
      console.warn('[store] không ghi được state.json:', err.message);
    }
  }, 120);
}

export function flush() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  save();
}

/* ------------------------------- orders ------------------------------- */

export function nextOrderCode(prefix) {
  state.orderSeq += 1;
  save();
  return `${prefix}${state.orderSeq}`;
}

export function putOrder(order) {
  state.orders[order.code] = order;
  if (order.va) state.vaLedger[order.va] = { orderCode: order.code, status: order.status, paidAmount: order.paidAmount };
  save();
  return order;
}

export function getOrder(code) {
  return state.orders[String(code ?? '').toUpperCase()] ?? null;
}

export function listOrders(limit = 20) {
  return Object.values(state.orders)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);
}

export function findByVa(va) {
  if (!va) return null;
  const hit = state.vaLedger[va];
  return hit ? (state.orders[hit.orderCode] ?? null) : null;
}

/**
 * Trạng thái chuyển một chiều: pending -> paid là đích.
 * @returns {{order: object, changed: boolean, skipped?: string}}
 */
export function settleOrder(code, { amount, txnId, va, content, method }) {
  const order = getOrder(code);
  if (!order) return { order: null, changed: false, skipped: 'không tìm thấy đơn hàng' };
  if (order.status === 'paid') {
    return { order, changed: false, skipped: 'đơn đã paid trước đó (idempotent)' };
  }

  order.paidAmount = (order.paidAmount ?? 0) + amount;
  order.paidAt = new Date().toISOString();
  order.method = method;
  order.lastTxnId = txnId ?? order.lastTxnId ?? null;
  order.settleLog = [
    ...(order.settleLog ?? []),
    { at: order.paidAt, amount, txnId: txnId ?? null, va: va ?? null, content: content ?? null, method },
  ].slice(-10);

  if (order.paidAmount >= order.amount) {
    order.status = 'paid';
  } else if (order.paidAmount > 0) {
    order.status = 'partially_paid';
  }
  state.orders[order.code] = order;
  save();
  return { order, changed: true };
}

export function markOrder(code, patch) {
  const order = getOrder(code);
  if (!order) return null;
  Object.assign(order, patch);
  state.orders[order.code] = order;
  save();
  return order;
}

/* ------------------------------- events ------------------------------- */

export function logEvent(entry) {
  const event = { id: crypto.randomUUID(), at: new Date().toISOString(), ...entry };
  state.events.unshift(event);
  state.events = state.events.slice(0, MAX_EVENTS);
  save();
  return event;
}

export function listEvents(limit = 40) {
  return state.events.slice(0, limit);
}

/* --------------------------- chống trùng webhook --------------------------- */

export function hasSeenTxn(id) {
  return Boolean(state.seenTxn[String(id)]);
}
export function markSeenTxn(id) {
  state.seenTxn[String(id)] = new Date().toISOString();
  save();
}

/* ------------------------- hạn mức mô phỏng / ngày ------------------------- */

/** "Ngày" theo giờ Việt Nam (UTC+7) — Test mode reset hạn mức lúc 00:00 UTC+7. */
export function vietnamDay(now = new Date()) {
  const shifted = new Date(now.getTime() + 7 * 3600 * 1000);
  return shifted.toISOString().slice(0, 10);
}

export function simQuota() {
  const day = vietnamDay();
  if (state.sim.day !== day) {
    state.sim = { day, used: 0 };
    save();
  }
  return { ...state.sim };
}

export function useSimQuota() {
  const q = simQuota();
  q.used += 1;
  state.sim = q;
  save();
  return q;
}

export function resetAll() {
  state = structuredClone(EMPTY);
  save();
}

export function snapshot() {
  return state;
}

/* ------------------- sổ cái "phía ngân hàng" của mock ------------------- */
/**
 * Tách riêng khỏi DB đơn hàng: reconcile (poll API) chỉ có ý nghĩa khi
 * "ngân hàng" có nguồn sự thật độc lập. Nếu cả hai đọc cùng một bảng thì
 * demo sẽ tự khẳng định chính nó.
 */
export function bankGet(orderCode) {
  return state.mockBank[String(orderCode).toUpperCase()] ?? null;
}
export function bankPut(orderCode, rec) {
  state.mockBank[String(orderCode).toUpperCase()] = rec;
  save();
  return rec;
}
export function bankFindByVa(va) {
  if (!va) return null;
  return Object.values(state.mockBank).find((r) => r.va === va) ?? null;
}


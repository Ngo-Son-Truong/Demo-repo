/**
 * Smoke test end-to-end: checkout → mô phỏng giao dịch → webhook → đơn paid,
 * cộng các trường hợp xấu (chữ ký sai, payload trùng, endpoint lỗi để retry, mất webhook).
 *
 *   npm test      (tự spawn server TS trên port riêng bằng tsx, không cần build)
 */
import { spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';

const PORT = 3123 + Math.floor(Math.random() * 40);
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = 'test-secret';

interface Check {
  name: string;
  pass: boolean;
}
const results: Check[] = [];
const ok = (name: string, cond: unknown, extra = ''): void => {
  results.push({ name, pass: Boolean(cond) });
  console.log(`${cond ? '  \x1b[32m✓\x1b[0m' : '  \x1b[31m✗\x1b[0m'} ${name}${extra ? ` \x1b[90m${extra}\x1b[0m` : ''}`);
};

// tsx/npx để lại tiến trình con lồng nhau; nếu pipe stdio còn mở thì parent
// không exit được. → detached + giết cả process group, và không giữ pipe khi không verbose.
const server: ChildProcess = spawn('node_modules/.bin/tsx', ['src/server.ts'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: {
    ...process.env,
    PORT: String(PORT),
    SEPAY_MODE: 'mock',
    SEPAY_WEBHOOK_AUTH: 'hmac',
    SEPAY_WEBHOOK_SECRET: SECRET,
    SIM_RETRY_UNIT_SEC: '0', // không chờ retry trong test
    SEPAY_DATA_DIR: `/tmp/sepay-smoke-${PORT}`,
  },
  stdio: ['ignore', 'ignore', process.env.VERBOSE ? 'pipe' : 'ignore'],
  detached: true,
});
server.stderr?.on('data', (d: Buffer) => process.stderr.write(d));

// Nếu test bị Ctrl-C / timeout, server con phải chết theo — không để orphan
// chiếm port (tsx spawn thêm node con nên phải giết cả process group).
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { killServer(); process.exit(130); });
process.on('exit', killServer);

function killServer(): void {
  if (!server.pid) return;
  try {
    process.kill(-server.pid, 'SIGTERM'); // cả group: tsx spawn thêm node con
  } catch {
    try {
      server.kill('SIGTERM');
    } catch {
      /* đã chết */
    }
  }
}

interface Resp<T> {
  status: number;
  json: T | null;
  text: string;
}

async function post<T = Record<string, any>>(path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Resp<T>> {
  const raw = typeof body === 'string' ? body : JSON.stringify(body ?? {});
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: raw,
  });
  const text = await res.text();
  return { status: res.status, json: text ? (JSON.parse(text) as T) : null, text };
}

async function get<T = Record<string, any>>(path: string): Promise<Resp<T>> {
  const res = await fetch(`${BASE}${path}`);
  const text = await res.text();
  return { status: res.status, json: text ? (JSON.parse(text) as T) : null, text };
}

const sign = (ts: number | string, raw: string): string =>
  `sha256=${crypto.createHmac('sha256', SECRET).update(`${ts}.${raw}`).digest('hex')}`;
const nowTs = (): number => Math.floor(Date.now() / 1000);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface OrderJson {
  order: {
    code: string;
    status: string;
    amount: number;
    paidAmount: number;
    va: string | null;
    transferContent: string;
    qrCodeUrl: string | null;
    settleLog: Array<{ method: string }>;
  };
}

try {
  // chờ server listen
  let up = false;
  for (let i = 0; i < 60 && !up; i += 1) {
    try {
      up = (await fetch(`${BASE}/healthz`)).ok;
    } catch {
      await sleep(200);
    }
  }
  if (!up) throw new Error(`server không lên ở ${BASE} (chạy VERBOSE=1 npm test để xem log)`);

  console.log(`\n\x1b[1mSmoke test (TypeScript)\x1b[0m \x1b[90m${BASE} · mock + hmac\x1b[0m\n`);

  // 1) checkout tạo đơn + VA theo chuẩn Test mode
  const co = await post<OrderJson>('/api/checkout', { items: [{ id: 'SKU-LANTERN', qty: 2 }, { id: 'SKU-COFFEE', qty: 1 }] });
  const order = co.json?.order;
  if (!order) throw new Error('checkout không trả order');
  ok('POST /api/checkout trả 201', co.status === 201);
  ok('server tự định giá (2×250k + 85k, free ship)', order.amount === 585_000, `= ${order.amount}`);
  ok('VA đúng chuẩn Test mode SBSEPAY + 12 ký tự', /^SBSEPAY[A-Z2-9]{12}$/.test(order.va ?? ''), order.va ?? '');
  ok('order_code khớp tiền tố cấu hình', /^DH\d{4,}$/.test(order.code), order.code);
  ok('qr_code_url dạng vietqr', /vietqr\.app\/img\?acc=/.test(order.qrCodeUrl ?? ''));

  // 2) giá không đến từ client
  const cheat = await post<OrderJson>('/api/checkout', { items: [{ id: 'SKU-COFFEE', qty: 1 }], amount: 1 });
  // 1 × 85k + 30k ship (chưa tới ngưỡng free 500k) — client gửi amount:1 cũng vô nghĩa
  ok('bỏ qua `amount` do client gửi lên', cheat.status === 201 && cheat.json?.order.amount === 115_000, `= ${cheat.json?.order.amount}`);
  ok('từ chối SKU không tồn tại', (await post('/api/checkout', { items: [{ id: 'SKU-NOPE', qty: 1 }] })).status === 422);
  ok('giới hạn số lượng (qty>20 → 422)', (await post('/api/checkout', { items: [{ id: 'SKU-COFFEE', qty: 999 }] })).status === 422);

  // 3) webhook qua simulator (đi hết pipeline 4 bước)
  const sim = await post<any>('/api/simulator/transaction', {
    va: order.va,
    transferType: 'in',
    amount: order.amount,
    content: order.transferContent,
  });
  ok('simulator chạy 4 bước pipeline', sim.json?.steps?.length === 4);
  ok('webhook được gửi (không bị lọc)', sim.json?.webhook?.status === 'Gửi');
  ok('endpoint trả 200 + {"success": true}', sim.json?.delivery?.ok === true && sim.json?.delivery?.status === 200);
  await sleep(250);
  const after = await get<OrderJson>(`/api/orders/${order.code}`);
  ok('đơn chuyển paid sau webhook', after.json?.order.status === 'paid', `paidAmount=${after.json?.order.paidAmount}`);
  ok('khớp đơn qua subAccount (VA)', after.json?.order.settleLog.at(-1)?.method.includes('subAccount'), after.json?.order.settleLog.at(-1)?.method);

  // 4) chữ ký / xác thực
  const raw = JSON.stringify({
    id: 991,
    gateway: 'MBBank',
    transactionDate: '2026-11-16 10:00:00',
    accountNumber: '0123456789',
    subAccount: order.va,
    code: order.code,
    content: 'x',
    transferType: 'in',
    description: '',
    transferAmount: 585000,
    accumulated: 0,
    referenceCode: 'SB1',
  });
  ok('thiếu X-SePay-Signature → 401', (await post('/webhooks/sepay', raw)).status === 401);
  ok(
    'chữ ký sai → 401',
    (await post('/webhooks/sepay', raw, { 'X-SePay-Signature': `sha256=${'a'.repeat(64)}`, 'X-SePay-Timestamp': String(nowTs()) })).status === 401
  );
  const stale = await post('/webhooks/sepay', raw, {
    'X-SePay-Signature': sign(nowTs() - 3600, raw),
    'X-SePay-Timestamp': String(nowTs() - 3600),
  });
  ok('timestamp lệch 1h → 401 (chống replay ±5 phút)', stale.status === 401, stale.json?.message);
  const good = await post<any>('/webhooks/sepay', raw, { 'X-SePay-Signature': sign(nowTs(), raw), 'X-SePay-Timestamp': String(nowTs()) });
  ok('chữ ký đúng → 200 + success', good.status === 200 && good.json?.success === true);

  // 5) chống trùng
  const dup = await post<any>('/webhooks/sepay', raw, { 'X-SePay-Signature': sign(nowTs(), raw), 'X-SePay-Timestamp': String(nowTs()) });
  ok('payload trùng id → 200 nhưng không ghi nhận lần 2', dup.status === 200 && /Trùng lặp/.test(dup.json?.demo?.note ?? ''), dup.json?.demo?.note);
  ok('không cộng tiền hai lần', (await get<OrderJson>(`/api/orders/${order.code}`)).json?.order.paidAmount === 585_000);

  // 6) số tiền sai → cờ đối soát
  const sim2 = await post<any>('/api/simulator/transaction', { va: order.va, amount: 100_000, content: `${order.code} thieu tien` });
  ok('nhận thiếu → amount_mismatch', /Nhận thiếu/.test(sim2.json?.delivery?.body ?? ''), sim2.json?.delivery?.body?.slice(0, 70));

  // 7) tiền ra bị lọc
  const sim3 = await post<any>('/api/simulator/transaction', { transferType: 'out', amount: 50_000, content: `${order.code} refund` });
  ok('transferType=out → Bỏ qua', sim3.json?.webhook?.status === 'Bỏ qua', sim3.json?.webhook?.reason);

  // 8) không có mã thanh toán
  const sim4 = await post<any>('/api/simulator/transaction', { amount: 100_000, content: '' });
  ok('nội dung không có mã → Bỏ qua', sim4.json?.webhook?.status === 'Bỏ qua', sim4.json?.webhook?.reason);

  // 9) endpoint lỗi
  const sim5 = await post<any>('/api/simulator/transaction', { va: order.va, amount: 20_000, content: order.transferContent, forceFail: true });
  ok('endpoint 500 → delivery thất bại (SePay sẽ retry)', sim5.json?.delivery?.ok === false && sim5.json?.delivery?.status === 500);

  // 10) mất webhook → đối soát bù
  const co2 = await post<OrderJson>('/api/checkout', { items: [{ id: 'SKU-TOTE', qty: 1 }] });
  const o2 = co2.json?.order;
  if (!o2) throw new Error('checkout 2 thất bại');
  await post('/api/simulator/transaction', { va: o2.va, amount: o2.amount, content: `${o2.code} mat webhook`, forceFail: true });
  await sleep(200);
  const before = (await get<OrderJson>(`/api/orders/${o2.code}`)).json?.order.status;
  const rec = await post<any>(`/api/orders/${o2.code}/reconcile`);
  ok('mất webhook → reconcile bù được đơn', before === 'pending' && rec.json?.reconciled === true && rec.json?.order?.status === 'paid', `${before} → ${rec.json?.order?.status}`);

  // 11) hủy đơn
  const co3 = await post<OrderJson>('/api/checkout', { items: [{ id: 'SKU-COFFEE', qty: 1 }] });
  ok(
    'hủy đơn Pending → cancelled',
    (await post<any>(`/api/orders/${co3.json?.order.code}/cancel`)).json?.order?.status === 'cancelled'
  );
  ok('không hủy được đơn đã paid (409)', (await post(`/api/orders/${o2.code}/cancel`)).status === 409);

  // 12) log
  const ev = await get<any>('/api/webhook-events');
  const kinds = new Set<string>((ev.json?.events ?? []).map((e: { kind: string }) => e.kind));
  ok(
    'log ghi nhận đủ kinds',
    ['paid', 'duplicate', 'rejected', 'delivery', 'checkout'].every((k) => kinds.has(k)),
    [...kinds].join(',')
  );
  ok('log không rò rỉ Secret Key', !JSON.stringify(ev.json).includes(SECRET));

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} đạt\n`);
  process.exitCode = failed.length ? 1 : 0;
} catch (err) {
  console.error('\x1b[31mtest crash:\x1b[0m', err);
  process.exitCode = 1;
} finally {
  killServer();
}

/**
 * Smoke test end-to-end: checkout → mô phỏng giao dịch → webhook → đơn paid,
 * cộng các trường hợp xấu (chữ ký sai, payload trùng, trả lỗi để retry).
 *
 * Chạy:  node scripts/smoke.mjs        (tự spawn server trên port riêng)
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

const PORT = 3123 + Math.floor(Math.random() * 40);
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = 'test-secret';

const results = [];
const ok = (name, cond, extra = '') => {
  results.push({ name, pass: Boolean(cond) });
  console.log(`${cond ? '  \x1b[32m✓\x1b[0m' : '  \x1b[31m✗\x1b[0m'} ${name}${extra ? ` \x1b[90m${extra}\x1b[0m` : ''}`);
};

const server = spawn(process.execPath, ['src/server.js'], {
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
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (d) => process.env.VERBOSE && process.stderr.write(d));

async function waitUp(tries = 40) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const r = await fetch(`${BASE}/healthz`);
      if (r.ok) return true;
    } catch {
      /* chưa listen */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('server không lên');
}

const post = async (path, body, headers = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null, text };
};
const get = async (path) => {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, json: await res.json().catch(() => null) };
};
const sign = (ts, raw) => `sha256=${crypto.createHmac('sha256', SECRET).update(`${ts}.${raw}`).digest('hex')}`;

try {
  await waitUp();
  console.log(`\n\x1b[1mSmoke test\x1b[0m \x1b[90m${BASE} · mock + hmac\x1b[0m\n`);

  // 1) checkout tạo đơn + VA theo chuẩn Test mode
  const co = await post('/api/checkout', { items: [{ id: 'SKU-LANTERN', qty: 2 }, { id: 'SKU-COFFEE', qty: 1 }] });
  const order = co.json.order;
  ok('POST /api/checkout trả 201', co.status === 201);
  ok('server tự định giá (2×250k + 85k, free ship)', order.amount === 585_000, `= ${order.amount}`);
  ok('VA đúng chuẩn Test mode SBSEPAY + 12 ký tự', /^SBSEPAY[A-Z2-9]{12}$/.test(order.va), order.va);
  ok('order_code khớp tiền tố cấu hình', /^DH\d{4,}$/.test(order.code), order.code);
  ok('qr_code_url dạng vietqr', /vietqr\.app\/img\?acc=/.test(order.qrCodeUrl ?? ''));

  // 2) giá không đến từ client
  const cheat = await post('/api/checkout', { items: [{ id: 'SKU-COFFEE', qty: 1 }], amount: 1 });
  // 1 × 85k + 30k ship (chưa tới ngưỡng free 500k) — client gửi amount:1 cũng vô nghĩa
  ok('bỏ qua `amount` do client gửi lên (chống tự sửa giá)', cheat.status === 201 && cheat.json.order.amount === 115_000, `= ${cheat.json?.order?.amount}`);
  const bad = await post('/api/checkout', { items: [{ id: 'SKU-NOPE', qty: 1 }] });
  ok('từ chối SKU không tồn tại', bad.status === 422);
  const qty = await post('/api/checkout', { items: [{ id: 'SKU-COFFEE', qty: 999 }] });
  ok('giới hạn số lượng (qty>20 → 422)', qty.status === 422);

  // 3) webhook với chữ ký hợp lệ, qua simulator (đi hết pipeline)
  const sim = await post('/api/simulator/transaction', { va: order.va, transferType: 'in', amount: order.amount, content: order.transferContent });
  ok('simulator chạy 4 bước pipeline', sim.json.steps?.length === 4);
  ok('webhook được gửi (không bị lọc)', sim.json.webhook.status === 'Gửi');
  ok('endpoint trả 200 + {"success":true}', sim.json.delivery?.ok && sim.json.delivery.status === 200);
  await new Promise((r) => setTimeout(r, 250));
  const after = await get(`/api/orders/${order.code}`);
  ok('đơn chuyển paid sau webhook', after.json.order.status === 'paid', `paidAmount=${after.json.order.status ? after.json.order.paidAmount : '?'}`);
  ok('khớp đơn qua subAccount (VA)', after.json.order.settleLog.at(-1).method.includes('subAccount'), after.json.order.settleLog.at(-1).method);

  // 4) chữ ký / xác thực
  const raw = JSON.stringify({ id: 991, gateway: 'MBBank', transactionDate: '2026-11-16 10:00:00', accountNumber: '0123456789', subAccount: order.va, code: order.code, content: 'x', transferType: 'in', description: '', transferAmount: 585000, accumulated: 0, referenceCode: 'SB1' });
  const noSig = await post('/webhooks/sepay', raw);
  ok('thiếu X-SePay-Signature → 401', noSig.status === 401, noSig.json?.message);
  const wrongSig = await post('/webhooks/sepay', raw, { 'X-SePay-Signature': 'sha256=' + 'a'.repeat(64), 'X-SePay-Timestamp': String(Math.floor(Date.now() / 1000)) });
  ok('chữ ký sai → 401', wrongSig.status === 401);
  const ts = Math.floor(Date.now() / 1000) - 3600;
  const oldSig = await post('/webhooks/sepay', raw, { 'X-SePay-Signature': sign(ts, raw), 'X-SePay-Timestamp': String(ts) });
  ok('timestamp lệch 1h → 401 (chống replay ±5 phút)', oldSig.status === 401, oldSig.json?.message);
  const good = await post('/webhooks/sepay', raw, { 'X-SePay-Signature': sign(Math.floor(Date.now() / 1000), raw), 'X-SePay-Timestamp': String(Math.floor(Date.now() / 1000)) });
  ok('chữ ký đúng → 200', good.status === 200 && good.json.success === true);

  // 5) chống trùng: gửi lại y hệt payload (id=991)
  const dup = await post('/webhooks/sepay', raw, { 'X-SePay-Signature': sign(Math.floor(Date.now() / 1000), raw), 'X-SePay-Timestamp': String(Math.floor(Date.now() / 1000)) });
  ok('payload trùng id → vẫn 200 nhưng không ghi nhận lần 2', dup.status === 200 && /Trùng lặp/.test(dup.json.demo?.note ?? ''), dup.json.demo?.note);
  const paidTwice = await get(`/api/orders/${order.code}`);
  ok('không cộng tiền hai lần', paidTwice.json.order.paidAmount === 585_000, `paidAmount=${paidTwice.json.order.paidAmount}`);

  // 6) số tiền sai → cờ đối soát, không tự paid
  const sim2 = await post('/api/simulator/transaction', { va: order.va, transferType: 'in', amount: 100_000, content: `${order.code} thieu tien` });
  ok('nhận thiếu → amount_mismatch, đơn không paid', /Nhận thiếu/.test(sim2.json.delivery.body), sim2.json.delivery.body.slice(0, 80));

  // 7) tiền ra bị bỏ qua
  const sim3 = await post('/api/simulator/transaction', { transferType: 'out', amount: 50_000, content: `${order.code} refund` });
  ok('transferType=out → bộ lọc chặn (loại tiền vào)', sim3.json.webhook.status === 'Bỏ qua', sim3.json.webhook.reason);

  // 8) không có mã thanh toán trong nội dung → bị lọc
  const sim4 = await post('/api/simulator/transaction', { amount: 100_000, content: '' });
  ok('nội dung không có mã → Bỏ qua (lọc "chỉ gửi khi có mã")', sim4.json.webhook.status === 'Bỏ qua', sim4.json.webhook.reason);

  // 9) retry khi endpoint lỗi
  const sim5 = await post('/api/simulator/transaction', { va: order.va, amount: 20_000, content: order.transferContent, forceFail: true });
  ok('endpoint 500 → delivery thất bại (SePay sẽ retry)', sim5.json.delivery?.ok === false && sim5.json.delivery.status === 500);

  // 10) hoàn tất một đơn khác qua đường đối soát (mất webhook)
  const co2 = await post('/api/checkout', { items: [{ id: 'SKU-TOUR', qty: 1 }] });
  const o2 = co2.json.order;
  await post('/api/simulator/transaction', { va: o2.va, amount: o2.amount, content: o2.transferContent });
  await new Promise((r) => setTimeout(r, 200));
  let st = (await get(`/api/orders/${o2.code}`)).json.order.status;
  ok('đơn 2 paid qua webhook trước khi đối soát', st === 'paid', st);
  const co3 = await post('/api/checkout', { items: [{ id: 'SKU-TOTE', qty: 1 }] });
  const o3 = co3.json.order;
  // "mất webhook": gửi thẳng vào sổ cái ngân hàng mock rồi reconcile
  await post('/api/simulator/transaction', { va: o3.va, amount: o3.amount, content: `${o3.code} mat webhook`, forceFail: true });
  await new Promise((r) => setTimeout(r, 200));
  const before = (await get(`/api/orders/${o3.code}`)).json.order.status;
  const rec = await post(`/api/orders/${o3.code}/reconcile`, {});
  ok('mất webhook → reconcile bù được đơn', before === 'pending' && rec.json.reconciled === true && rec.json.order.status === 'paid', `${before} → ${rec.json.order.status}`);

  // 11) hủy đơn
  const co4 = await post('/api/checkout', { items: [{ id: 'SKU-COFFEE', qty: 1 }] });
  const canc = await post(`/api/orders/${co4.json.order.code}/cancel`, {});
  ok('hủy đơn Pending → cancelled', canc.status === 200 && canc.json.order.status === 'cancelled');
  const canc2 = await post(`/api/orders/${o2.code}/cancel`, {});
  ok('không hủy được đơn đã paid (409)', canc2.status === 409);

  // 12) log
  const ev = await get('/api/webhook-events');
  const kinds = new Set(ev.json.events.map((e) => e.kind));
  ok('log ghi nhận đủ kinds', ['paid', 'duplicate', 'rejected', 'delivery', 'checkout'].every((k) => kinds.has(k)), [...kinds].join(','));
  const leaked = JSON.stringify(ev.json).includes(SECRET);
  ok('log không rò rỉ Secret Key', !leaked);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} đạt\n`);
  process.exitCode = failed.length ? 1 : 0;
} catch (err) {
  console.error('\x1b[31mtest crash:\x1b[0m', err);
  process.exitCode = 1;
} finally {
  server.kill('SIGTERM');
}

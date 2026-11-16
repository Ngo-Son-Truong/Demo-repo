/**
 * Frontend demo SePay — TypeScript, biên dịch ra public/app.js (`npm run build:web`).
 * Không bundler, không framework: trình duyệt tải 1 file ES module.
 *
 * Các interface dưới đây là bản mirror của src/types.ts (chỉ phần UI cần),
 * vì tsc không cho import file ngoài rootDir của project web. Sửa shape API thì
 * sửa src/types.ts trước rồi soi sang đây.
 *
 * Frontend KHÔNG bao giờ thấy Bearer token: mọi lời gọi SePay ở server.
 */

/* ────────────────────────────── types (mirror src/types.ts) ────────────────────────────── */

type LocalOrderStatus = 'pending' | 'paid' | 'partially_paid' | 'cancelled';
type SepayMode = 'mock' | 'sandbox' | 'live';

interface CartLine {
  id: string;
  name: string;
  price: number;
  emoji: string;
  desc: string;
  qty: number;
  lineTotal: number;
}

interface OrderView {
  code: string;
  status: LocalOrderStatus | 'expired';
  rawStatus: LocalOrderStatus;
  lines: CartLine[];
  subtotal: number;
  shipping: number;
  amount: number;
  paidAmount: number;
  currency: 'VND';
  buyer: { name: string; email: string };
  gateway: string;
  accountNumber: string;
  accountHolder: string;
  va: string | null;
  transferContent: string;
  qrCodeUrl: string | null;
  sepayOrderId: string | null;
  createdAt: string;
  expiresAt: string | null;
  secondsLeft: number | null;
  flag: 'underpaid' | 'overpaid' | null;
  settleLog: Array<{ at: string; amount: number; method: string }>;
  lastTxnId: number | string | null;
  note?: string;
}

interface DemoConfig {
  mode: SepayMode;
  apiBase: string;
  webhookPath: string;
  webhookAuth: 'hmac' | 'apikey' | 'none';
  filters: { eventType: 'in' | 'out' | 'all'; onlyWithPaymentCode: boolean; codePrefixes: string[]; vaOnly: boolean; name: string };
  orderCodePrefix: string;
  ttlSec: number;
  allowPartialPayment: boolean;
  hasBankAccountId: boolean;
  sim: { dailyQuota: number; minAmount: number; maxAmount: number; maxContentLen: number };
  secretHint: string;
}

interface CatalogItem {
  id: string;
  name: string;
  price: number;
  emoji: string;
  desc: string;
}

interface WebhookEvent {
  id: string;
  at: string;
  direction: 'inbound' | 'outbound' | 'internal';
  kind: string;
  note?: string;
  status?: number;
  ok?: boolean;
  attempt?: number;
  orderCode?: string;
  payload?: { code?: string | null };
}

interface SimMeta {
  activeVas: Array<{ va: string; orderCode: string; amount: number; status: string; content: string }>;
  quota: { used: number; day: string; dailyQuota: number };
}

interface SimResult {
  steps: Array<{ key: string; label: string; detail: string }>;
  payload: Record<string, unknown>;
  webhook: { status: 'Gửi' | 'Bỏ qua'; url: string; reason: string | null };
  delivery: { ok: boolean; status: number; ms: number; body: string } | null;
  bankLedger: { orderCode?: string | null; status?: string; paidAmount?: number; note?: string };
  orderCode: string | null;
}

/* ────────────────────────────── utils ────────────────────────────── */

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => document.querySelector(sel) as T;
const $optional = <T extends HTMLElement = HTMLElement>(sel: string): T | null => document.querySelector(sel) as T | null;
const money = (n: number): string => new Intl.NumberFormat('vi-VN').format(Number(n) || 0) + '₫';
const escapeHtml = (s: unknown): string =>
  String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string);

async function api<T = Record<string, never>>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...init });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error((body as { error?: string; message?: string }).error || `HTTP ${res.status}`);
  return body as T;
}

let toastTimer: number | undefined;
function toast(msg: string, kind: 'ok' | 'warn' | 'err' = 'ok'): void {
  const el = $<HTMLElement>('#toast');
  el.textContent = msg;
  el.className = `toast ${kind}`;
  el.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.hidden = true;
  }, 3200);
}

async function copy(text: string, label = 'Đã copy'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(label);
  } catch {
    toast('Trình duyệt chặn clipboard — bôi đen để copy', 'warn');
  }
}

/* ────────────────────────────── state ────────────────────────────── */

interface AppState {
  catalog: CatalogItem[];
  qty: Record<string, number>;
  order: OrderView | null;
  config: DemoConfig | null;
  poll: number | null;
  countdown: number | null;
  shipping: { fee: number; freeOver: number };
}

const state: AppState = {
  catalog: [],
  qty: {},
  order: null,
  config: null,
  poll: null,
  countdown: null,
  shipping: { fee: 30_000, freeOver: 500_000 },
};

/* ────────────────────────────── config ────────────────────────────── */

async function loadConfig(): Promise<void> {
  const cfg = await api<DemoConfig>('/api/config');
  state.config = cfg;

  const modeLabel: Record<SepayMode, string> = { mock: 'MOCK', sandbox: 'SANDBOX (Test mode)', live: 'LIVE ⚠' };
  $<HTMLElement>('#modeChips').innerHTML = [
    `<span class="chip mode-${cfg.mode}" title="Endpoint: ${escapeHtml(cfg.apiBase)}">${modeLabel[cfg.mode]}</span>`,
    `<span class="chip" title="Xác thực webhook">webhook: ${cfg.webhookAuth.toUpperCase()}</span>`,
    `<span class="chip" title="Tiền tố mã thanh toán">mã đơn: ${cfg.orderCodePrefix}####</span>`,
    `<span class="chip" title="Bộ lọc webhook">lọc: ${cfg.filters.onlyWithPaymentCode ? 'cần mã' : 'mọi gd'}${cfg.filters.vaOnly ? ' + VA' : ''}</span>`,
  ].join('');

  $<HTMLElement>('#simMode').textContent = cfg.mode;
  $<HTMLElement>('#hookUrl').textContent = cfg.webhookPath;

  if (cfg.mode !== 'mock') {
    $<HTMLElement>('#sim').classList.add('disabled');
    const btn = $<HTMLButtonElement>('#btnSim');
    btn.disabled = true;
    btn.textContent = 'Chỉ dùng ở SEPAY_MODE=mock';
  }

  // Payload mẫu đúng 12 trường doc tich-hop-webhook#payload
  $<HTMLElement>('#samplePayload').textContent = JSON.stringify(
    {
      id: 92704,
      gateway: 'MBBank',
      transactionDate: '2026-01-15 10:30:00',
      accountNumber: '0123456789',
      subAccount: 'SBSEPAYX9KA2B7MN4QR',
      code: 'DH1001',
      content: 'DH1001 thanh toan don hang',
      transferType: 'in',
      description: 'NGUYEN VAN A chuyen tien',
      transferAmount: 100000,
      accumulated: 5000000,
      referenceCode: 'SB1A2B3C4D5E',
    },
    null,
    2
  );
}

/* ────────────────────────────── catalog ────────────────────────────── */

async function loadCatalog(): Promise<void> {
  const { items, shipping } = await api<{ items: CatalogItem[]; shipping: { fee: number; freeOver: number } }>('/api/catalog');
  state.catalog = items;
  state.shipping = shipping;
  for (const i of items) state.qty[i.id] = 0;

  const list = $<HTMLUListElement>('#items');
  list.innerHTML = items
    .map(
      (i) => `<li class="item" data-id="${i.id}">
        <span class="emoji">${i.emoji}</span>
        <div class="meta"><strong>${i.name}</strong><span class="muted">${i.desc} · ${money(i.price)}</span></div>
        <div class="stepper">
          <button class="sq" data-step="-1" aria-label="giảm">−</button>
          <span class="q" id="q-${i.id}">0</span>
          <button class="sq" data-step="1" aria-label="tăng">+</button>
        </div>
      </li>`
    )
    .join('');

  list.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement | null)?.closest?.('[data-step]') as HTMLElement | null;
    if (!btn) return;
    const id = (btn.closest('.item') as HTMLElement).dataset.id as string;
    state.qty[id] = Math.max(0, Math.min(20, (state.qty[id] ?? 0) + Number(btn.dataset.step)));
    const badge = $optional<HTMLElement>(`#q-${id}`);
    if (badge) badge.textContent = String(state.qty[id]);
    renderTotals();
  });
  renderTotals();
}

function cartItems(): Array<{ id: string; qty: number }> {
  return state.catalog.filter((i) => (state.qty[i.id] ?? 0) > 0).map((i) => ({ id: i.id, qty: state.qty[i.id] as number }));
}

function renderTotals(): void {
  const { fee, freeOver } = state.shipping;
  const lines = state.catalog.filter((i) => (state.qty[i.id] ?? 0) > 0);
  const subtotal = lines.reduce((s, i) => s + i.price * (state.qty[i.id] ?? 0), 0);
  const ship = subtotal >= freeOver || subtotal === 0 ? 0 : fee;
  $<HTMLElement>('#totals').innerHTML = `
    <div><span>Tạm tính</span><span>${money(subtotal)}</span></div>
    <div><span>Phí ship</span><span>${ship ? money(ship) : 'miễn phí'} <small class="muted">(free từ ${money(freeOver)})</small></span></div>
    <div class="grand"><span>Tổng</span><span>${money(subtotal + ship)}</span></div>`;
}

/* ────────────────────────────── đơn hàng ────────────────────────────── */

async function checkout(): Promise<void> {
  const items = cartItems();
  if (!items.length) {
    toast('Chọn ít nhất 1 sản phẩm', 'warn');
    return;
  }
  const btn = $<HTMLButtonElement>('#btnCheckout');
  btn.disabled = true;
  try {
    const { order } = await api<{ order: OrderView }>('/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ items, buyer: { name: $<HTMLInputElement>('#buyerName').value } }),
    });
    state.order = order;
    renderOrder(order);
    startPolling();
    toast(`Đã tạo đơn ${order.code}`);
  } catch (err) {
    toast((err as Error).message, 'err');
  } finally {
    btn.disabled = false;
  }
}

interface CopyRow {
  k: string;
  v: string | null;
  plain?: boolean;
  copyable?: boolean;
}

function renderOrder(o: OrderView): void {
  $<HTMLElement>('#payEmpty').hidden = true;
  $<HTMLElement>('#payPanel').hidden = false;
  $<HTMLElement>('#oCode').textContent = o.code;

  const rows: CopyRow[] = [
    { k: 'Ngân hàng', v: o.gateway, plain: true },
    { k: 'Chủ tài khoản', v: o.accountHolder, plain: true },
    { k: 'Số tài khoản', v: o.accountNumber, copyable: true },
    { k: 'Tài khoản ảo (VA)', v: o.va, copyable: true },
    { k: 'Số tiền', v: money(o.amount), copyable: true },
    { k: 'Nội dung CK', v: o.transferContent, copyable: true },
  ];
  const box = $<HTMLElement>('#copyList');
  box.innerHTML = rows
    .map(
      (r) => `<div class="copy-row">
        <span class="k">${r.k}</span>
        <span class="v ${r.plain ? '' : 'mono'}">${escapeHtml(r.v ?? '—')}</span>
        ${r.copyable ? `<button class="tiny ghost" data-copy="${escapeHtml(r.v ?? '')}">copy</button>` : ''}
      </div>`
    )
    .join('');
  box.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((b) => b.addEventListener('click', () => copy(b.dataset.copy ?? '')));

  const qr = $<HTMLImageElement>('#oQr');
  if (o.qrCodeUrl) {
    qr.src = o.qrCodeUrl;
    qr.hidden = false;
    qr.onerror = () => {
      qr.hidden = true;
      const cap = $optional<HTMLElement>('.qr-caption');
      if (cap) cap.innerHTML = `Không tải được ảnh QR (cần mạng). Vẫn chuyển khoản theo các trường trên + nội dung <code>${escapeHtml(o.transferContent)}</code>.`;
    };
  }

  const sel = $<HTMLSelectElement>('#simVa');
  sel.value = o.va ?? '';
  $<HTMLInputElement>('#simAmount').value = String(o.amount);
  $<HTMLInputElement>('#simContent').value = o.transferContent;
  detectCode();
  void refreshSimMeta();
}

function statusPill(status: string): { label: string; kind: string } {
  const map: Record<string, [string, string]> = {
    pending: ['Chờ thanh toán', 'warn'],
    paid: ['Đã thanh toán', 'ok'],
    partially_paid: ['Trả một phần', 'warn'],
    expired: ['Hết hạn', 'bad'],
    cancelled: ['Đã hủy', 'bad'],
    underpaid: ['Nhận thiếu', 'bad'],
    overpaid: ['Nhận thừa', 'bad'],
  };
  const hit = map[status];
  return hit ? { label: hit[0], kind: hit[1] } : { label: status ?? 'chưa có đơn', kind: 'idle' };
}

function renderStatus(o: OrderView): void {
  const { label, kind } = statusPill(o.flag ?? o.status);
  const pill = $<HTMLElement>('#orderStatus');
  const was = pill.textContent;
  pill.textContent = label;
  pill.className = `pill ${kind}`;

  if (o.status === 'paid' && was !== label) {
    document.body.classList.add('flash');
    window.setTimeout(() => document.body.classList.remove('flash'), 900);
    toast(`✅ ${o.code} đã nhận đủ ${money(o.amount)} qua ${o.settleLog[o.settleLog.length - 1]?.method ?? 'webhook'}`);
  }

  const settle = o.settleLog.length
    ? `<p class="hint ok">Khớp ${o.settleLog.length} giao dịch · cách: ${o.settleLog.map((s) => s.method).join(' → ')}</p>`
    : '';
  const flag = o.flag ? `<p class="hint err">⚠ ${escapeHtml(o.note ?? '')} ${o.flag}</p>` : '';
  const note = $<HTMLElement>('#reconcileNote');
  note.innerHTML = `${settle}${flag}`.trim() || `Chưa có giao dịch khớp · đơn sẽ hết hạn sau ${o.secondsLeft ?? 0}s`;
}

function startPolling(): void {
  if (state.poll) window.clearInterval(state.poll);
  if (state.countdown) window.clearInterval(state.countdown);

  state.poll = window.setInterval(() => {
    void (async () => {
      if (!state.order) return;
      try {
        const { order } = await api<{ order: OrderView }>(`/api/orders/${state.order.code}`);
        state.order = order;
        renderStatus(order);
        if (order.status !== 'pending' && state.poll) window.clearInterval(state.poll);
      } catch {
        /* server restart — thử lại chu kỳ sau */
      }
    })();
  }, 2000);

  state.countdown = window.setInterval(() => {
    if (!state.order?.expiresAt) return;
    const left = Math.max(0, Math.round((new Date(state.order.expiresAt).getTime() - Date.now()) / 1000));
    const mm = String(Math.floor(left / 60)).padStart(2, '0');
    const ss = String(left % 60).padStart(2, '0');
    const el = $<HTMLElement>('#oCountdown');
    el.textContent = `${mm}:${ss}`;
    el.classList.toggle('danger', left < 120);
  }, 500);
}

async function reconcile(): Promise<void> {
  if (!state.order) return;
  try {
    const r = await api<{ order: OrderView; reconciled: boolean; sources?: { orderStatus?: string } }>(
      `/api/orders/${state.order.code}/reconcile`,
      { method: 'POST' }
    );
    state.order = r.order;
    renderStatus(r.order);
    toast(
      r.reconciled ? 'Đối soát phát hiện giao dịch chưa ghi nhận → đã bù đơn' : `API xác nhận: ${r.sources?.orderStatus ?? 'không có giao dịch'}`,
      r.reconciled ? 'ok' : 'warn'
    );
    void refreshLog();
  } catch (err) {
    toast((err as Error).message, 'err');
  }
}

async function cancelOrder(): Promise<void> {
  if (!state.order) return;
  try {
    const { order } = await api<{ order: OrderView }>(`/api/orders/${state.order.code}/cancel`, { method: 'POST' });
    state.order = order;
    renderStatus(order);
    toast(`Đã hủy ${order.code} · VA Unpaid → Cancelled`);
  } catch (err) {
    toast((err as Error).message, 'err');
  }
}

/* ────────────────────────────── simulator ────────────────────────────── */

async function refreshSimMeta(): Promise<void> {
  if (state.config?.mode !== 'mock') return;
  try {
    const meta = await api<SimMeta>('/api/simulator/meta');
    const sel = $<HTMLSelectElement>('#simVa');
    const current = sel.value;
    sel.innerHTML =
      '<option value="">— không dùng VA —</option>' +
      meta.activeVas.map((v) => `<option value="${v.va}">${v.orderCode} · ${v.va} · ${money(v.amount)} · ${v.status}</option>`).join('');
    sel.value = current;
    if (!sel.value) {
      const pending = meta.activeVas.find((v) => v.status === 'pending');
      if (pending) {
        sel.value = pending.va;
        $<HTMLInputElement>('#simContent').value = pending.content;
        $<HTMLInputElement>('#simAmount').value = String(pending.amount);
      }
    }
    $<HTMLElement>('#quotaText').textContent = `Đã dùng: ${meta.quota.used}/${meta.quota.dailyQuota} (reset 00:00 UTC+7)`;
    $<HTMLElement>('#quotaBar').style.width = `${Math.min(100, (meta.quota.used / meta.quota.dailyQuota) * 100)}%`;
    detectCode();
  } catch {
    /* endpoint chỉ có ở mock */
  }
}

function detectCode(): void {
  const prefix = state.config?.orderCodePrefix ?? 'DH';
  const value = $<HTMLInputElement>('#simContent').value ?? '';
  const m = value.match(new RegExp(`(?:^|[\\s.,;#_-])(${prefix}[A-Z0-9]{4,20})`, 'i'));
  const el = $<HTMLElement>('#simDetect');
  el.textContent = m?.[1]
    ? `mã thanh toán nhận diện được: ${m[1].toUpperCase()}`
    : `không có mã ${prefix}… → SePay sẽ bỏ qua webhook (lọc "chỉ gửi khi có mã")`;
  el.classList.toggle('hit', Boolean(m?.[1]));
}

async function simulate(): Promise<void> {
  const btn = $<HTMLButtonElement>('#btnSim');
  btn.disabled = true;
  try {
    const r = await api<SimResult>('/api/simulator/transaction', {
      method: 'POST',
      body: JSON.stringify({
        va: $<HTMLSelectElement>('#simVa').value || null,
        transferType: $<HTMLSelectElement>('#simType').value,
        amount: Number($<HTMLInputElement>('#simAmount').value),
        content: $<HTMLInputElement>('#simContent').value,
        forceFail: $<HTMLInputElement>('#simFail').checked,
      }),
    });
    renderPipeline(r);
    void refreshSimMeta();
    if (r.orderCode) {
      const { order } = await api<{ order: OrderView }>(`/api/orders/${r.orderCode}`);
      state.order = order;
      renderStatus(order);
    }
    window.setTimeout(() => void refreshLog(), 400);
  } catch (err) {
    toast((err as Error).message, 'err');
  } finally {
    btn.disabled = false;
  }
}

function renderPipeline(r: SimResult): void {
  const box = $<HTMLElement>('#pipeline');
  box.hidden = false;

  const steps = r.steps
    .map(
      (s, i) => `<div class="step">
        <span class="step-num">${i + 1}</span>
        <div><strong>${escapeHtml(s.label)}</strong><p>${escapeHtml(s.detail)}</p></div>
      </div>`
    )
    .join('');

  const d = r.delivery;
  const delivery = d
    ? `<div class="verdict ${d.ok ? 'ok' : 'bad'}">
         ${d.ok ? '✅' : '❌'} POST → HTTP ${d.status} · ${d.ms}ms
         <pre>${escapeHtml(d.body)}</pre>
       </div>`
    : '';

  const ledger = r.bankLedger.orderCode
    ? `${r.bankLedger.orderCode} → ${r.bankLedger.status} · đã nhận ${money(r.bankLedger.paidAmount ?? 0)}`
    : (r.bankLedger.note ?? '—');

  box.innerHTML = `
    ${steps}
    <div class="verdict ${r.webhook.status === 'Gửi' ? 'ok' : 'warn'}">
      Webhook: <strong>${r.webhook.status}</strong>${r.webhook.reason ? ` · lý do bỏ qua: ${escapeHtml(r.webhook.reason)}` : ''}
    </div>
    ${delivery}
    <details open><summary>payload đã ký</summary><pre>${escapeHtml(JSON.stringify(r.payload, null, 2))}</pre></details>
    <p class="hint muted">Sổ cái ngân hàng (mock): ${escapeHtml(ledger)}</p>`;
}

/* ────────────────────────────── log ────────────────────────────── */

const KIND_CLASS: Record<string, string> = {
  paid: 'ok',
  delivery: 'ok',
  rejected: 'bad',
  amount_mismatch: 'bad',
  delivery_failed: 'bad',
  duplicate: 'warn',
  unmatched: 'warn',
  ignored: 'muted',
  settled_noop: 'muted',
  checkout: 'info',
  reconcile: 'info',
};

async function refreshLog(): Promise<void> {
  try {
    const { events } = await api<{ events: WebhookEvent[] }>('/api/webhook-events');
    $<HTMLElement>('#logCount').textContent = events.length ? `· ${events.length} gần nhất` : '';
    const tbody = $<HTMLElement>('#logBody');
    if (!events.length) {
      tbody.innerHTML = '<tr class="muted"><td colspan="7">Chưa có event nào.</td></tr>';
      return;
    }
    tbody.innerHTML = events
      .map((e) => {
        const dir: Record<string, string> = { inbound: '↓ SePay→app', outbound: '↑ SePay gửi', internal: '· nội bộ' };
        const kind = e.kind === 'delivery' && e.ok === false ? 'bad' : (KIND_CLASS[e.kind] ?? '');
        return `<tr class="${kind}">
          <td class="mono">${new Date(e.at).toLocaleTimeString('vi-VN')}</td>
          <td>${dir[e.direction] ?? e.direction}</td>
          <td><code>${e.kind}</code></td>
          <td class="mono">${escapeHtml(e.orderCode ?? e.payload?.code ?? '—')}</td>
          <td class="mono">${e.status ?? (e.ok ? 200 : '—')}</td>
          <td class="mono">${e.attempt ?? '—'}</td>
          <td>${escapeHtml(e.note ?? '')}</td>
        </tr>`;
      })
      .join('');
  } catch {
    /* ignore */
  }
}

async function resetDemo(): Promise<void> {
  await api('/api/demo/reset', { method: 'POST' }).catch(() => undefined);
  location.reload();
}

/* ────────────────────────────── boot ────────────────────────────── */

$<HTMLButtonElement>('#btnCheckout').addEventListener('click', () => void checkout());
$<HTMLButtonElement>('#btnSim').addEventListener('click', () => void simulate());
$<HTMLButtonElement>('#btnReconcile').addEventListener('click', () => void reconcile());
$<HTMLButtonElement>('#btnCancel').addEventListener('click', () => void cancelOrder());
$<HTMLButtonElement>('#btnRefreshLog').addEventListener('click', () => void refreshLog());
$<HTMLButtonElement>('#btnReset').addEventListener('click', () => void resetDemo());
$<HTMLInputElement>('#simContent').addEventListener('input', detectCode);
$<HTMLSelectElement>('#simVa').addEventListener('change', () => {
  const sel = $<HTMLSelectElement>('#simVa');
  const opt = sel.selectedOptions[0];
  if (opt?.value) {
    const code = opt.textContent?.split(' · ')[0];
    if (code) {
      $<HTMLInputElement>('#simContent').value = `${code} thanh toan don hang`;
      detectCode();
    }
  }
});

await Promise.all([loadConfig(), loadCatalog()]);
void refreshSimMeta();
void refreshLog();
window.setInterval(() => void refreshLog(), 4000);

/** Cho phép top-level await: file phải là ES module (HTML nạp bằng type="module"). */
export {};

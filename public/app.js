/**
 * Frontend demo SePay. Chỉ gọi API nội bộ (relative URL) — không có token nào
 * đi qua trình duyệt. Polling /api/orders/:code 2s/lần để bắt trạng thái paid.
 */
const $ = (sel) => document.querySelector(sel);
const money = (n) => new Intl.NumberFormat('vi-VN').format(Number(n) || 0) + '₫';

const state = {
  catalog: [],
  qty: {},
  order: null,
  config: null,
  poll: null,
  countdown: null,
};

/* ───────────────────────────── helpers ───────────────────────────── */

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(body.error || body.message || `HTTP ${res.status}`);
  return body;
}

function toast(msg, kind = 'ok') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast ${kind}`;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), 3200);
}

async function copy(text, label = 'Đã copy') {
  try {
    await navigator.clipboard.writeText(text);
    toast(label);
  } catch {
    toast('Trình duyệt chặn clipboard — bôi đen để copy', 'warn');
  }
}

/* ───────────────────────────── cấu hình ───────────────────────────── */

async function loadConfig() {
  const cfg = await api('/api/config');
  state.config = cfg;
  const modeLabel = { mock: 'MOCK', sandbox: 'SANDBOX (Test mode)', live: 'LIVE ⚠' }[cfg.mode];
  $('#modeChips').innerHTML = [
    `<span class="chip mode-${cfg.mode}" title="Endpoint: ${cfg.apiBase}">${modeLabel}</span>`,
    `<span class="chip" title="Xác thực webhook">webhook: ${cfg.webhookAuth.toUpperCase()}</span>`,
    `<span class="chip" title="Tiền tố mã thanh toán">mã đơn: ${cfg.orderCodePrefix}####</span>`,
    `<span class="chip" title="Bộ lọc webhook">lọc: ${cfg.filters.onlyWithPaymentCode ? 'cần mã' : 'mọi gd'}${cfg.filters.vaOnly ? ' + VA' : ''}</span>`,
  ].join('');
  $('#simMode').textContent = cfg.mode;
  $('#hookUrl').textContent = cfg.webhookPath;
  $('#sim').dataset.mode = cfg.mode;
  if (cfg.mode !== 'mock') {
    $('#sim').classList.add('disabled');
    $('#btnSim').disabled = true;
    $('#btnSim').textContent = 'Chỉ dùng ở SEPAY_MODE=mock';
  }
  $('#samplePayload').textContent = JSON.stringify(
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

/* ───────────────────────────── catalog ───────────────────────────── */

async function loadCatalog() {
  const { items, shipping } = await api('/api/catalog');
  state.catalog = items;
  items.forEach((i) => (state.qty[i.id] = 0));
  $('#items').innerHTML = items
    .map(
      (i) => `
      <li class="item" data-id="${i.id}">
        <span class="emoji">${i.emoji}</span>
        <div class="meta">
          <strong>${i.name}</strong>
          <span class="muted">${i.desc} · ${money(i.price)}</span>
        </div>
        <div class="stepper">
          <button class="sq" data-step="-1" aria-label="giảm">−</button>
          <span class="q" id="q-${i.id}">0</span>
          <button class="sq" data-step="1" aria-label="tăng">+</button>
        </div>
      </li>`
    )
    .join('');

  $('#items').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-step]');
    if (!btn) return;
    const id = btn.closest('.item').dataset.id;
    state.qty[id] = Math.max(0, Math.min(20, state.qty[id] + Number(btn.dataset.step)));
    $(`#q-${id}`).textContent = state.qty[id];
    renderTotals(shipping);
  });
  renderTotals(shipping);
}

function cartItems() {
  return state.catalog.filter((i) => state.qty[i.id] > 0).map((i) => ({ id: i.id, qty: state.qty[i.id] }));
}

function renderTotals(shipping) {
  const lines = state.catalog.filter((i) => state.qty[i.id] > 0);
  const subtotal = lines.reduce((s, i) => s + i.price * state.qty[i.id], 0);
  const fee = subtotal >= shipping.freeOver || subtotal === 0 ? 0 : shipping.fee;
  $('#totals').innerHTML = `
    <div><span>Tạm tính</span><span>${money(subtotal)}</span></div>
    <div><span>Phí ship</span><span>${fee ? money(fee) : 'miễn phí'} <small class="muted">(free từ ${money(shipping.freeOver)})</small></span></div>
    <div class="grand"><span>Tổng</span><span>${money(subtotal + fee)}</span></div>`;
}

/* ───────────────────────────── đơn hàng ───────────────────────────── */

async function checkout() {
  const items = cartItems();
  if (!items.length) return toast('Chọn ít nhất 1 sản phẩm', 'warn');
  $('#btnCheckout').disabled = true;
  try {
    const { order } = await api('/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ items, buyer: { name: $('#buyerName').value } }),
    });
    state.order = order;
    renderOrder(order);
    startPolling();
    toast(`Đã tạo đơn ${order.code}`);
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    $('#btnCheckout').disabled = false;
  }
}

function renderOrder(o) {
  $('#payEmpty').hidden = true;
  $('#payPanel').hidden = false;
  $('#oCode').textContent = o.code;

  const rows = [
    { k: 'Ngân hàng', v: o.gateway, mono: false },
    { k: 'Chủ tài khoản', v: o.accountHolder, mono: false },
    { k: 'Số tài khoản', v: o.accountNumber, copy: true },
    { k: 'Tài khoản ảo (VA)', v: o.va, copy: true },
    { k: 'Số tiền', v: money(o.amount), copy: true },
    { k: 'Nội dung CK', v: o.transferContent, copy: true },
  ];
  $('#copyList').innerHTML = rows
    .map(
      (r) => `<div class="copy-row">
        <span class="k">${r.k}</span>
        <span class="v ${r.mono === false ? '' : 'mono'}">${r.v ?? '—'}</span>
        ${r.copy ? `<button class="tiny ghost" data-copy="${r.v}">copy</button>` : ''}
      </div>`
    )
    .join('');
  $('#copyList').querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => copy(b.dataset.copy)));

  const qr = $('#oQr');
  if (o.qrCodeUrl) {
    qr.src = o.qrCodeUrl;
    qr.hidden = false;
    qr.onerror = () => {
      qr.hidden = true;
      $('.qr-caption').innerHTML = 'Không tải được ảnh QR (cần mạng). Vẫn chuyển khoản theo 4 trường trên + nội dung <code>' + o.transferContent + '</code>.';
    };
  }
  $('#simVa').value = o.va ?? '';
  $('#simAmount').value = o.amount;
  $('#simContent').value = o.transferContent;
  detectCode();
  refreshSimMeta();
}

function statusPill(status) {
  const map = {
    pending: ['Chờ thanh toán', 'warn'],
    paid: ['Đã thanh toán', 'ok'],
    partially_paid: ['Trả một phần', 'warn'],
    expired: ['Hết hạn', 'bad'],
    cancelled: ['Đã hủy', 'bad'],
    underpaid: ['Nhận thiếu', 'bad'],
    overpaid: ['Nhận thừa', 'bad'],
  };
  const [label, kind] = map[status] ?? [status ?? 'chưa có đơn', 'idle'];
  return { label, kind };
}

function renderStatus(o) {
  const { label, kind } = statusPill(o.flag ?? o.status);
  const pill = $('#orderStatus');
  const was = pill.textContent;
  pill.textContent = label;
  pill.className = `pill ${kind}`;
  if (o.status === 'paid' && was !== label) {
    document.body.classList.add('flash');
    setTimeout(() => document.body.classList.remove('flash'), 900);
    toast(`✅ ${o.code} đã nhận đủ ${money(o.amount)} qua ${o.settleLog.at(-1)?.method ?? 'webhook'}`);
  }
  const settle = o.settleLog?.length
    ? `<p class="hint ok">Khớp ${o.settleLog.length} giao dịch · cách: ${o.settleLog.map((s) => s.method).join(' → ')}</p>`
    : '';
  const flag = o.flag ? `<p class="hint err">⚠ ${o.note ?? ''} ${o.flag}</p>` : '';
  $('#reconcileNote').innerHTML = `${settle}${flag}`.trim() || 'Chưa có giao dịch khớp.';
}

function startPolling() {
  clearInterval(state.poll);
  clearInterval(state.countdown);
  state.poll = setInterval(async () => {
    if (!state.order) return;
    try {
      const { order } = await api(`/api/orders/${state.order.code}`);
      state.order = order;
      renderStatus(order);
      if (order.status !== 'pending') clearInterval(state.poll);
    } catch {
      /* server restart — thử lại chu kỳ sau */
    }
  }, 2000);

  state.countdown = setInterval(() => {
    if (!state.order?.expiresAt) return;
    const left = Math.max(0, Math.round((new Date(state.order.expiresAt) - Date.now()) / 1000));
    const m = String(Math.floor(left / 60)).padStart(2, '0');
    const s = String(left % 60).padStart(2, '0');
    $('#oCountdown').textContent = `${m}:${s}`;
    $('#oCountdown').classList.toggle('danger', left < 120);
  }, 500);
}

async function reconcile() {
  if (!state.order) return;
  try {
    const { order, reconciled, sources } = await api(`/api/orders/${state.order.code}/reconcile`, { method: 'POST' });
    state.order = order;
    renderStatus(order);
    toast(
      reconciled ? 'Đối soát phát hiện giao dịch chưa ghi nhận → đã bù đơn' : `API xác nhận: ${sources?.orderStatus ?? 'không có giao dịch'}`,
      reconciled ? 'ok' : 'warn'
    );
    refreshLog();
  } catch (err) {
    toast(err.message, 'err');
  }
}

async function cancelOrder() {
  if (!state.order) return;
  try {
    const { order } = await api(`/api/orders/${state.order.code}/cancel`, { method: 'POST' });
    state.order = order;
    renderStatus(order);
    toast(`Đã hủy ${order.code} · VA Unpaid → Cancelled`);
  } catch (err) {
    toast(err.message, 'err');
  }
}

/* ───────────────────────────── simulator ───────────────────────────── */

async function refreshSimMeta() {
  if (state.config?.mode !== 'mock') return;
  try {
    const meta = await api('/api/simulator/meta');
    const cur = $('#simVa').value;
    $('#simVa').innerHTML =
      '<option value="">— không dùng VA —</option>' +
      meta.activeVas
        .map((v) => `<option value="${v.va}">${v.orderCode} · ${v.va} · ${money(v.amount)} · ${v.status}</option>`)
        .join('');
    $('#simVa').value = cur;
    if (!$('#simVa').value && meta.activeVas.length) {
      const pending = meta.activeVas.find((v) => v.status === 'pending');
      if (pending) {
        $('#simVa').value = pending.va;
        $('#simContent').value = pending.content;
        $('#simAmount').value = pending.amount;
      }
    }
    $('#quotaText').textContent = `Đã dùng: ${meta.quota.used}/${meta.quota.dailyQuota} (reset 00:00 UTC+7)`;
    $('#quotaBar').style.width = `${Math.min(100, (meta.quota.used / meta.quota.dailyQuota) * 100)}%`;
    detectCode();
  } catch {
    /* mock-only endpoint */
  }
}

function detectCode() {
  const prefix = state.config?.orderCodePrefix ?? 'DH';
  const m = ($('#simContent').value ?? '').match(new RegExp(`(?:^|[\\s.,;#_-])(${prefix}[A-Z0-9]{4,20})`, 'i'));
  const el = $('#simDetect');
  el.textContent = m ? `mã thanh toán nhận diện được: ${m[1].toUpperCase()}` : `không có mã ${prefix}… → SePay sẽ bỏ qua webhook (lọc "chỉ gửi khi có mã")`;
  el.classList.toggle('hit', Boolean(m));
}

async function simulate() {
  const body = {
    va: $('#simVa').value || null,
    transferType: $('#simType').value,
    amount: Number($('#simAmount').value),
    content: $('#simContent').value,
    forceFail: $('#simFail').checked,
  };
  $('#btnSim').disabled = true;
  try {
    const r = await api('/api/simulator/transaction', { method: 'POST', body: JSON.stringify(body) });
    renderPipeline(r);
    refreshSimMeta();
    if (r.orderCode) {
      const { order } = await api(`/api/orders/${r.orderCode}`);
      state.order = order;
      renderStatus(order);
    }
    setTimeout(refreshLog, 400);
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    $('#btnSim').disabled = false;
  }
}

function renderPipeline(r) {
  const box = $('#pipeline');
  box.hidden = false;
  const stepHtml = r.steps
    .map(
      (s, i) => `<div class="step">
        <span class="step-num">${i + 1}</span>
        <div><strong>${s.label}</strong><p>${s.detail}</p></div>
      </div>`
    )
    .join('');

  const w = r.webhook;
  const d = r.delivery;
  const delivery = d
    ? `<div class="verdict ${d.ok ? 'ok' : 'bad'}">
         ${d.ok ? '✅' : '❌'} POST ${d.url} → HTTP ${d.status} · ${d.ms}ms
         <pre>${escapeHtml(d.body)}</pre>
       </div>`
    : '';

  box.innerHTML = `
    ${stepHtml}
    <div class="verdict ${w.status === 'Gửi' ? 'ok' : 'warn'}">
      Webhook: <strong>${w.status}</strong>${w.reason ? ` · lý do bỏ qua: ${w.reason}` : ''}
    </div>
    ${delivery}
    <details open><summary>payload đã ký</summary><pre>${escapeHtml(JSON.stringify(r.payload, null, 2))}</pre></details>
    <p class="hint muted">Sổ cái ngân hàng (mock): ${r.bankLedger.orderCode ? `${r.bankLedger.orderCode} → ${r.bankLedger.status} · đã nhận ${money(r.bankLedger.paidAmount)}` : r.bankLedger.note}</p>`;
}

const escapeHtml = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/* ───────────────────────────── log ───────────────────────────── */

async function refreshLog() {
  try {
    const { events } = await api('/api/webhook-events');
    $('#logCount').textContent = events.length ? `· ${events.length} gần nhất` : '';
    if (!events.length) {
      $('#logBody').innerHTML = '<tr class="muted"><td colspan="7">Chưa có event nào.</td></tr>';
      return;
    }
    $('#logBody').innerHTML = events
      .map((e) => {
        const kind = {
          paid: 'ok', delivered: 'ok', delivery: e.ok ? 'ok' : 'bad', rejected: 'bad', duplicate: 'warn',
          amount_mismatch: 'bad', unmatched: 'warn', ignored: 'muted', delivery_failed: 'bad',
          checkout: 'info', reconcile: 'info', settled_noop: 'muted',
        }[e.kind] ?? '';
        const dir = { inbound: '↓ SePay→app', outbound: '↑ SePay gửi', internal: '· nội bộ' }[e.direction] ?? e.direction;
        return `<tr class="${kind}">
          <td class="mono">${new Date(e.at).toLocaleTimeString('vi-VN')}</td>
          <td>${dir}</td>
          <td><code>${e.kind}</code></td>
          <td class="mono">${e.orderCode ?? (e.payload?.code ?? '—')}</td>
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

async function resetDemo() {
  await api('/api/demo/reset', { method: 'POST' }).catch(() => {});
  location.reload();
}

/* ───────────────────────────── boot ───────────────────────────── */

$('#btnCheckout').addEventListener('click', checkout);
$('#btnSim').addEventListener('click', simulate);
$('#btnReconcile').addEventListener('click', reconcile);
$('#btnCancel').addEventListener('click', cancelOrder);
$('#btnRefreshLog').addEventListener('click', refreshLog);
$('#btnReset').addEventListener('click', resetDemo);
$('#simContent').addEventListener('input', detectCode);
$('#simVa').addEventListener('change', () => {
  const opt = [...$('#simVa').options].find((o) => o.value === $('#simVa').value);
  if (opt && opt.value) {
    const [code] = opt.textContent.split(' · ');
    $('#simContent').value = `${code} thanh toan don hang`;
    detectCode();
  }
});

await Promise.all([loadConfig(), loadCatalog()]);
refreshSimMeta();
refreshLog();
setInterval(refreshLog, 4000);

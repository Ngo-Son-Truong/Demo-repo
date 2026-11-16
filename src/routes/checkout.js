/**
 * Checkout + vòng đời đơn hàng.
 *
 * Luồng: khách bấm trả hàng → server tự định giá → tạo đơn hàng VA trên SePay
 * (POST /v2/bank-accounts/{ba_xid}/orders) → trả về số VA + nội dung chuyển khoản
 * + VietQR → khách chuyển tiền → SePay bắn webhook → đơn đổi `paid`.
 *
 * Số tiền LUÔN do server tính từ catalog, không lấy từ client.
 */
import express from 'express';
import { config, isMock, publicConfig } from '../config.js';
import { CATALOG, SHIPPING, priceCart } from '../catalog.js';
import * as store from '../store.js';
import * as sepay from '../sepay/client.js';
import { SePayError } from '../sepay/client.js';

/** SePay: order_code 6-50 ký tự alphanumeric, Vietcombank/Shinhan tối đa 15. */
function assertOrderCodeShape(code) {
  if (!/^[A-Z0-9]{6,15}$/.test(code)) {
    return 'Mã đơn hàng phải 6-15 ký tự A-Z/0-9 (SePay chuẩn hoá về in hoa)';
  }
  return null;
}

export function orderView(order) {
  if (!order) return null;
  const now = Date.now();
  const expiredAt = order.expiresAt ? new Date(order.expiresAt).getTime() : null;
  const expired = Boolean(expiredAt && expiredAt < now) && order.status === 'pending';
  return {
    code: order.code,
    status: expired ? 'expired' : order.status,
    rawStatus: order.status,
    lines: order.lines,
    subtotal: order.subtotal,
    shipping: order.shipping,
    amount: order.amount,
    paidAmount: order.paidAmount ?? 0,
    currency: 'VND',
    buyer: order.buyer,
    gateway: order.gateway,
    accountNumber: order.accountNumber,
    accountHolder: order.accountHolder,
    va: order.va,
    transferContent: order.transferContent,
    qrCodeUrl: order.qrCodeUrl,
    sepayOrderId: order.sepayOrderId,
    createdAt: order.createdAt,
    expiresAt: order.expiresAt,
    secondsLeft: expiredAt ? Math.max(0, Math.round((expiredAt - now) / 1000)) : null,
    flag: order.flag ?? null,
    settleLog: order.settleLog ?? [],
    lastTxnId: order.lastTxnId ?? null,
    note: order.note ?? null,
  };
}

export function createCheckoutRouter() {
  const router = express.Router();

  router.get('/api/catalog', (_req, res) => {
    res.json({ items: CATALOG, shipping: SHIPPING, currency: 'VND' });
  });

  router.get('/api/config', (_req, res) => {
    res.json(publicConfig());
  });

  // ── Tạo đơn + lấy chỉ dẫn thanh toán ─────────────────────────────────────
  router.post('/api/checkout', async (req, res) => {
    const cart = priceCart(req.body?.items);
    if (cart.error) {
      res.status(422).json({ error: cart.error });
      return;
    }
    if (cart.total < config.sim.minAmount) {
      res.status(422).json({ error: `Đơn tối thiểu ${config.sim.minAmount}đ` });
      return;
    }

    const buyer = {
      name: String(req.body?.buyer?.name ?? '').slice(0, 80) || 'Khach hang',
      email: String(req.body?.buyer?.email ?? '').slice(0, 120),
    };

    const code = store.nextOrderCode(config.orders.codePrefix);
    const badCode = assertOrderCodeShape(code);
    if (badCode) {
      res.status(500).json({ error: badCode });
      return;
    }

    try {
      const created = await sepay.createOrder({
        orderCode: code,
        amount: cart.total,
        duration: Math.min(config.orders.ttlSec, config.sepay.vaDurationSec || config.orders.ttlSec),
      });

      const accounts = await sepay.listBankAccounts().catch(() => null);
      const acc = Array.isArray(accounts) ? accounts[0] ?? {} : accounts?.data?.[0] ?? {};

      const order = {
        code,
        status: 'pending',
        lines: cart.lines,
        subtotal: cart.subtotal,
        shipping: cart.shipping,
        amount: cart.total,
        paidAmount: 0,
        buyer,
        // Đọc từ response tạo đơn khi có (mock & sandbox đều trả các field này).
        va: created?.va_number ?? null,
        sepayOrderId: created?.id ?? null,
        gateway: created?.bank_name ?? acc.bank_short_name ?? 'MBBank',
        accountNumber: created?.account_number ?? acc.account_number ?? '',
        accountHolder: created?.account_holder_name ?? acc.account_holder_name ?? '',
        qrCodeUrl: created?.qr_code_url ?? null,
        transferContent: `${code} thanh toan don hang`,
        createdAt: new Date().toISOString(),
        expiresAt: created?.expired_at ? new Date(`${created.expired_at}+07:00`).toISOString() : new Date(Date.now() + config.orders.ttlSec * 1000).toISOString(),
        accumulated: acc.accumulated ?? 0,
      };
      store.putOrder(order);
      store.logEvent({ direction: 'internal', kind: 'checkout', orderCode: code, note: `Tạo VA ${order.va} cho đơn ${code} · ${order.amount}đ` });
      res.status(201).json({ order: orderView(order) });
    } catch (err) {
      resOnApiError(res, err, 'Không tạo được đơn hàng trên SePay');
    }
  });

  // ── Poll trạng thái (frontend gọi mỗi ~2s) ───────────────────────────────
  router.get('/api/orders/:code', (req, res) => {
    const order = store.getOrder(req.params.code);
    if (!order) {
      res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
      return;
    }
    res.json({ order: orderView(order) });
  });

  router.get('/api/orders', (_req, res) => {
    res.json({ orders: store.listOrders(20).map(orderView) });
  });

  // ── Hủy đơn (chỉ Pending — doc don-hang/huy-don-hang) ────────────────────
  router.post('/api/orders/:code/cancel', async (req, res) => {
    const order = store.getOrder(req.params.code);
    if (!order) {
      res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
      return;
    }
    if (order.status !== 'pending') {
      res.status(409).json({ error: `Chỉ hủy được đơn Pending (đang ở trạng thái: ${order.status})` });
      return;
    }
    try {
      await sepay.cancelOrder(order.code, { orderXid: order.sepayOrderId });
      store.markOrder(order.code, { status: 'cancelled', note: 'Đã hủy đơn + chuyển VA Unpaid sang Cancelled' });
      res.json({ order: orderView(store.getOrder(order.code)) });
    } catch (err) {
      resOnApiError(res, err, 'SePay từ chối hủy đơn');
    }
  });

  /**
   * Đối soát — đường đi thứ 2, dùng khi webhook trễ/mất.
   * Doc gợi ý polling `since_id` + transaction_date_sort=asc cho giao dịch mới.
   */
  router.post('/api/orders/:code/reconcile', async (req, res) => {
    const order = store.getOrder(req.params.code);
    if (!order) {
      res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
      return;
    }
    try {
      const [detail, txn] = await Promise.all([
        sepay.getOrder(order.code, { orderXid: order.sepayOrderId }).catch(() => null),
        sepay.findTransactionFor(order).catch(() => null),
      ]);

      const remoteStatus = detail?.status ?? null;
      const matched = [];
      if (String(remoteStatus).toLowerCase() === 'paid' && order.status !== 'paid') {
        matched.push(`GET /orders → ${remoteStatus}`);
        store.settleOrder(order.code, {
          amount: order.amount - (order.paidAmount ?? 0),
          txnId: txn?.id ?? null,
          va: order.va,
          content: txn?.transaction_content ?? null,
          method: 'api-poll (order detail)',
        });
      } else if (txn && order.status !== 'paid') {
        matched.push('GET /transactions khớp nội dung/VA');
        store.settleOrder(order.code, {
          amount: Number(txn.amount_in ?? 0),
          txnId: txn.id ?? null,
          va: txn.va ?? order.va,
          content: txn.transaction_content ?? null,
          method: 'api-poll (transactions)',
        });
      }

      const fresh = store.getOrder(order.code);
      const found = matched.length > 0;
      if (found) {
        store.logEvent({
          direction: 'internal',
          kind: 'reconcile',
          orderCode: order.code,
          note: `Đối soát phát hiện ${found ? 'thanh toán chưa ghi nhận' : 'không có gì mới'} → đơn ${fresh.status.toUpperCase()}`,
        });
      }
      res.json({
        order: orderView(fresh),
        reconciled: found,
        sources: { orderStatus: remoteStatus, transaction: txn, matched },
      });
    } catch (err) {
      resOnApiError(res, err, 'Đối soát thất bại');
    }
  });

  // ── Demo helpers ─────────────────────────────────────────────────────────
  if (isMock()) {
    router.post('/api/demo/reset', (_req, res) => {
      store.resetAll();
      res.json({ ok: true, note: 'Đã xóa data/state.json — đơn hàng, log webhook và quota mô phỏng' });
    });
  }

  return router;
}

function resOnApiError(res, err, prefix) {
  if (err instanceof SePayError) {
    res.status(err.status >= 400 && err.status < 600 ? err.status : 502).json({
      error: `${prefix}: ${err.message}`,
      error_code: err.errorCode,
      detail: err.body,
    });
    return;
  }
  console.error('[checkout]', err);
  res.status(500).json({ error: `${prefix}: ${err.message}` });
}

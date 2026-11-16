/**
 * Checkout + vòng đời đơn hàng.
 *
 * Luồng: khách bấm trả hàng → server tự định giá → tạo đơn hàng VA trên SePay
 * (POST /v2/bank-accounts/{ba_xid}/orders) → trả số VA + nội dung CK + VietQR
 * → khách chuyển tiền → SePay bắn webhook → đơn đổi `paid`.
 *
 * Số tiền LUÔN do server tính từ catalog, không lấy từ body client.
 */
import { Router, type IRouter, type Request, type Response } from 'express';

import { config, isMock, publicConfig } from '../config.ts';
import { CATALOG, SHIPPING, priceCart } from '../catalog.ts';
import * as store from '../store.ts';
import * as sepay from '../sepay/client.ts';
import { SePayError } from '../sepay/client.ts';
import type { OrderRecord, OrderView } from '../types.ts';

/** SePay: order_code 6-50 ký tự alphanumeric; Vietcombank & Shinhan tối đa 15. */
function orderCodeError(code: string): string | null {
  return /^[A-Z0-9]{6,15}$/.test(code) ? null : 'Mã đơn hàng phải 6-15 ký tự A-Z/0-9 (SePay chuẩn hoá về in hoa)';
}

/** "YYYY-MM-DD HH:mm:ss" UTC+7 → ISO string để JS Date dùng được. */
function fromVietnamDateTime(vn: string): string {
  return new Date(`${vn}+07:00`).toISOString();
}

export function orderView(order: OrderRecord): OrderView {
  const expiredAt = order.expiresAt ? new Date(order.expiresAt).getTime() : null;
  const expired = Boolean(expiredAt && expiredAt < Date.now()) && order.status === 'pending';
  const { accumulated: _accumulated, ...rest } = order;
  return {
    ...rest,
    status: expired ? 'expired' : order.status,
    rawStatus: order.status,
    currency: 'VND',
    secondsLeft: expiredAt ? Math.max(0, Math.round((expiredAt - Date.now()) / 1000)) : null,
  };
}

interface CheckoutBody {
  items?: unknown;
  buyer?: { name?: unknown; email?: unknown };
}

export function createCheckoutRouter(): IRouter {
  const router = Router();

  router.get('/api/catalog', (_req: Request, res: Response) => {
    res.json({ items: CATALOG, shipping: SHIPPING, currency: 'VND' });
  });

  router.get('/api/config', (_req: Request, res: Response) => {
    res.json(publicConfig());
  });

  // ── Tạo đơn + lấy chỉ dẫn thanh toán ─────────────────────────────────────
  router.post('/api/checkout', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as CheckoutBody;
    const cart = priceCart(body.items);
    if (cart.error) {
      res.status(422).json({ error: cart.error });
      return;
    }
    if (cart.total < config.sim.minAmount) {
      res.status(422).json({ error: `Đơn tối thiểu ${config.sim.minAmount}đ` });
      return;
    }

    const buyer = {
      name: String(body.buyer?.name ?? '').slice(0, 80) || 'Khach hang',
      email: String(body.buyer?.email ?? '').slice(0, 120),
    };

    const code = store.nextOrderCode(config.orders.codePrefix);
    const badCode = orderCodeError(code);
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

      const accounts = await sepay.listBankAccounts().catch(() => [] as Awaited<ReturnType<typeof sepay.listBankAccounts>>);
      const acc = accounts[0];

      const order: OrderRecord = {
        code,
        status: 'pending',
        lines: cart.lines,
        subtotal: cart.subtotal,
        shipping: cart.shipping,
        amount: cart.total,
        paidAmount: 0,
        buyer,
        // Đọc từ response tạo đơn khi có — mock và sandbox đều trả các field này.
        va: created.va_number ?? null,
        sepayOrderId: created.id ?? null,
        gateway: created.bank_name ?? acc?.bank_short_name ?? 'MBBank',
        accountNumber: created.account_number ?? acc?.account_number ?? '',
        accountHolder: created.account_holder_name ?? acc?.account_holder_name ?? '',
        qrCodeUrl: created.qr_code_url ?? null,
        transferContent: `${code} thanh toan don hang`,
        createdAt: new Date().toISOString(),
        expiresAt: created.expired_at
          ? fromVietnamDateTime(created.expired_at)
          : new Date(Date.now() + config.orders.ttlSec * 1000).toISOString(),
        accumulated: acc?.accumulated ?? 0,
        settleLog: [],
      };
      store.putOrder(order);
      store.logEvent({
        direction: 'internal',
        kind: 'checkout',
        orderCode: code,
        note: `Tạo VA ${order.va} cho đơn ${code} · ${order.amount}đ`,
      });
      res.status(201).json({ order: orderView(order) });
    } catch (err) {
      apiError(res, err, 'Không tạo được đơn hàng trên SePay');
    }
  });

  // ── Poll trạng thái (frontend gọi ~2s/lần) ────────────────────────────────
  router.get('/api/orders/:code', (req: Request, res: Response) => {
    const order = store.getOrder(req.params.code);
    if (!order) {
      res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
      return;
    }
    res.json({ order: orderView(order) });
  });

  router.get('/api/orders', (_req: Request, res: Response) => {
    res.json({ orders: store.listOrders(20).map(orderView) });
  });

  // ── Hủy đơn (chỉ Pending — doc don-hang/huy-don-hang) ─────────────────────
  router.post('/api/orders/:code/cancel', async (req: Request, res: Response) => {
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
      const fresh = store.getOrder(order.code);
      if (fresh) res.json({ order: orderView(fresh) });
      else res.status(500).json({ error: 'Mất đơn hàng sau khi hủy' });
    } catch (err) {
      apiError(res, err, 'SePay từ chối hủy đơn');
    }
  });

  /**
   * Đối soát — đường thứ 2, dùng khi webhook trễ/mất.
   * Doc gợi ý polling `since_id` + `transaction_date_sort=asc` cho giao dịch mới.
   */
  router.post('/api/orders/:code/reconcile', async (req: Request, res: Response) => {
    const order = store.getOrder(req.params.code);
    if (!order) {
      res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
      return;
    }
    try {
      const [detail, txn] = await Promise.all([
        sepay.getOrder(order.code, { orderXid: order.sepayOrderId }).catch(() => null),
        sepay.findTransactionFor({ va: order.va, code: order.code }).catch(() => null),
      ]);

      const remoteStatus = detail?.status ?? null;
      const matched: string[] = [];

      if (remoteStatus === 'Paid' && order.status !== 'paid') {
        matched.push(`GET /orders → ${remoteStatus}`);
        store.settleOrder(order.code, {
          amount: order.amount - order.paidAmount,
          txnId: txn?.id ?? null,
          va: order.va,
          content: txn?.transaction_content ?? null,
          method: 'api-poll (order detail)',
        });
      } else if (txn && order.status !== 'paid') {
        matched.push('GET /transactions khớp nội dung/VA');
        store.settleOrder(order.code, {
          amount: txn.amount_in,
          txnId: txn.id,
          va: txn.va ?? order.va,
          content: txn.transaction_content,
          method: 'api-poll (transactions)',
        });
      }

      const fresh = store.getOrder(order.code);
      if (!fresh) {
        res.status(500).json({ error: 'Mất đơn hàng' });
        return;
      }
      if (matched.length) {
        store.logEvent({
          direction: 'internal',
          kind: 'reconcile',
          orderCode: order.code,
          note: `Đối soát phát hiện thanh toán chưa ghi nhận → đơn ${fresh.status.toUpperCase()}`,
        });
      }
      res.json({ order: orderView(fresh), reconciled: matched.length > 0, sources: { orderStatus: remoteStatus, transaction: txn, matched } });
    } catch (err) {
      apiError(res, err, 'Đối soát thất bại');
    }
  });

  if (isMock()) {
    router.post('/api/demo/reset', (_req: Request, res: Response) => {
      store.resetAll();
      res.json({ ok: true, note: 'Đã xóa data/state.json — đơn hàng, log webhook và quota mô phỏng' });
    });
  }

  return router;
}

function apiError(res: Response, err: unknown, prefix: string): void {
  if (err instanceof SePayError) {
    const status = err.status >= 400 && err.status < 600 ? err.status : 502;
    res.status(status).json({ error: `${prefix}: ${err.message}`, error_code: err.errorCode, detail: err.body });
    return;
  }
  console.error('[checkout]', err);
  res.status(500).json({ error: `${prefix}: ${(err as Error).message}` });
}

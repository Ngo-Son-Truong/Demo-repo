/**
 * "MÔ PHỎNG GIAO DỊCH" — bản sao form trong Test mode của SePay
 * (Test mode → Giao dịch → Mô phỏng). Doc:
 * https://developer.sepay.vn/vi/tien-ich-khac/test-mode/mo-phong-giao-dich
 *
 * Chạy lại đúng 4 bước pipeline của SePay để bạn thấy vì sao một webhook
 * được "Gửi" hay "Bỏ qua", rồi đẩy payload (đã ký) vào endpoint ở
 * src/routes/webhook.js — tức là đi hết đường truyền thật.
 *
 * Chỉ bật khi SEPAY_MODE=mock: ở sandbox/Test mode thật, nút này nằm trên
 * dashboard my.sepay.vn, không có API.
 */
import express from 'express';
import { config, isMock } from '../config.js';
import * as store from '../store.js';
import { bankAccount, formatVietnamDateTime, mockRecordTransaction } from '../sepay/mock.js';
import { evaluateWebhookFilters, extractPaymentCode } from '../sepay/matching.js';
import { deliverWithRetry, endpointUrl } from '../sepay/sender.js';

const guard = (req, res, next) => {
  if (!isMock()) {
    res.status(409).json({
      error:
        'Mô phỏng giao dịch chỉ bật ở SEPAY_MODE=mock. Ở Test mode thật, dùng my.sepay.vn → Test mode → Giao dịch → Mô phỏng.',
    });
    return;
  }
  next();
};

export function createSimulatorRouter() {
  const router = express.Router();

  router.get('/api/simulator/meta', guard, (_req, res) => {
    const acc = bankAccount();
    const activeVas = Object.values(store.snapshot().orders)
      .filter((o) => o.va && o.status !== 'cancelled')
      .map((o) => ({
        va: o.va,
        orderCode: o.code,
        amount: o.amount,
        status: o.status,
        content: `${o.code} thanh toan don hang`,
      }));
    res.json({
      endpoint: endpointUrl(),
      accounts: [{ accountNumber: acc.account_number, holder: acc.account_holder_name, gateway: acc.bank_short_name }],
      activeVas,
      quota: store.simQuota(),
      auth: config.webhook.auth,
      filters: config.webhook.filters,
      limits: { minAmount: config.sim.minAmount, maxAmount: config.sim.maxAmount, maxContentLen: config.sim.maxContentLen },
    });
  });

  router.post('/api/simulator/transaction', guard, async (req, res) => {
    const quota = store.simQuota();
    const steps = [];

    // ── Bước 1: Nhận giao dịch (hạn mức + validate) ────────────────────────
    const amount = Math.trunc(Number(req.body?.amount));
    const direction = req.body?.transferType === 'out' ? 'out' : 'in';
    const va = String(req.body?.va ?? '').trim() || null;
    const accountNumber = String(req.body?.accountNumber ?? '').trim() || bankAccount().account_number;
    const forceFail = Boolean(req.body?.forceFail);

    if (quota.used >= config.sim.dailyQuota) {
      res.status(429).json({
        error: `Vượt hạn mức ${config.sim.dailyQuota} giao dịch mô phỏng/ngày (reset 00:00 UTC+7). Xóa giao dịch cũ để trả quota.`,
        quota,
      });
      return;
    }
    if (!Number.isFinite(amount) || amount < config.sim.minAmount || amount > config.sim.maxAmount) {
      res.status(422).json({
        error: `Số tiền phải từ ${config.sim.minAmount} đến ${config.sim.maxAmount} VND`,
      });
      return;
    }

    const typedContent = String(req.body?.content ?? '').trim();
    if (typedContent.length > config.sim.maxContentLen) {
      res.status(422).json({ error: `Nội dung tối đa ${config.sim.maxContentLen} ký tự` });
      return;
    }
    // Doc: bỏ trống thì hệ thống tự sinh "Giao dich sandbox" + thời điểm.
    const content = typedContent || `Giao dich sandbox ${formatVietnamDateTime()}`;
    store.useSimQuota();
    steps.push({
      key: 'receive',
      label: 'Nhận giao dịch',
      detail: `Ghi bản ghi vào tài khoản ${accountNumber} · Đã dùng ${quota.used + 1}/${config.sim.dailyQuota} lượt mô phỏng hôm nay`,
    });

    // ── Bước 4 (SePay chạy trước khi gửi): nhận diện mã thanh toán ─────────
    const code = extractPaymentCode(content);
    steps.push({
      key: 'code',
      label: 'Nhận diện mã thanh toán',
      detail: code ? `code = ${code} (tiền tố "${config.orders.codePrefix}")` : 'Không khớp tiền tố nào → code = null',
    });

    // ── Bước 3: khớp VA ────────────────────────────────────────────────────
    const vaOrder = va ? store.findByVa(va) : null;
    steps.push({
      key: 'va',
      label: 'Khớp tài khoản ảo (VA)',
      detail: va ? `subAccount = ${va}${vaOrder ? ` → đơn ${vaOrder.code}` : ' (VA không có trong demo này)'}` : 'subAccount = "" (giao dịch không gắn VA)',
    });

    // Payload y hệt webhook Live/Test mode.
    const payload = {
      id: Math.floor(10_000 + Math.random() * 980_000),
      gateway: bankAccount().bank_short_name,
      transactionDate: formatVietnamDateTime(),
      accountNumber,
      subAccount: va ?? '',
      code,
      content,
      transferType: direction,
      description: typedContent ? 'NGUYEN VAN A chuyen tien' : 'Giao dich sandbox',
      transferAmount: amount,
      referenceCode: `SB${Math.random().toString(36).slice(2, 12).toUpperCase()}`,
      accumulated: (vaOrder?.accumulated ?? 5_000_000) + (direction === 'in' ? amount : -amount),
    };

    // ── Bước 2: bộ lọc webhook ──────────────────────────────────────────────
    const filter = evaluateWebhookFilters(payload);
    steps.push({
      key: 'filters',
      label: 'Bộ lọc giao dịch',
      detail: filter.pass
        ? `Webhook "${config.webhook.filters.name}" thỏa bộ lọc → đưa vào hàng đợi gửi`
        : `Webhook "${config.webhook.filters.name}" BỎ QUA: ${filter.reason}`,
    });

    // Ghi sổ cái "ngân hàng" (mock) — độc lập với DB đơn hàng.
    const bank = mockRecordTransaction({ payload, orderCode: code ?? vaOrder?.code });

    let delivery = null;
    if (filter.pass) {
      delivery = await deliverWithRetry(payload, { forceFail });
    }

    const order = vaOrder ?? (code ? store.getOrder(code) : null);
    res.json({
      steps,
      payload,
      webhook: filter.pass ? { status: 'Gửi', url: endpointUrl(), reason: null } : { status: 'Bỏ qua', url: endpointUrl(), reason: filter.reason },
      delivery,
      bankLedger: bank.matched
        ? { orderCode: bank.orderCode, status: bank.record.status, paidAmount: bank.record.paid_amount }
        : { orderCode: null, note: bank.reason },
      orderCode: order?.code ?? null,
      quota: store.simQuota(),
    });
  });

  return router;
}

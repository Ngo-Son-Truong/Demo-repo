/**
 * ENDPOINT NHẬN WEBHOOK SePay — phần code bạn sẽ mang lên production.
 *
 * Doc: https://developer.sepay.vn/vi/sepay-webhooks/tich-hop-webhook
 *
 * 3 điều kiện SePay tính là gửi THÀNH CÔNG:
 *   1. HTTP 200 hoặc 201
 *   2. Body JSON đúng `{"success": true}`
 *   3. Hoàn tất trong 30 giây
 * Thiếu một trong ba → SePay coi là thất bại và retry theo lịch Fibonacci.
 *
 * ba_xid/raw body: route này PHẢI dùng express.raw() — SePay ký trên bytes gốc.
 * Nếu để express.json() parse trước rồi stringify lại, chữ ký sẽ không khớp.
 */
import express from 'express';
import { config, isMock } from '../config.js';
import { verifySignature, verifyApiKey } from '../sepay/signature.js';
import { matchOrder, checkAmount, extractPaymentCode } from '../sepay/matching.js';
import * as store from '../store.js';
import { mockRecordTransaction } from '../sepay/mock.js';

export function createWebhookRouter() {
  const router = express.Router();

  router.post(config.webhook.path, express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
    const startedAt = Date.now();
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ''));
    const receipt = {
      direction: 'inbound',
      attempt: Number(req.get('x-sepay-attempt') ?? 1),
      headers: {
        signature: req.get('x-sepay-signature') ?? null,
        timestamp: req.get('x-sepay-timestamp') ?? null,
        authorization: mask(req.get('authorization')),
        contentType: req.get('content-type') ?? null,
      },
      rawBody: raw.toString('utf8'),
    };

    // 0) Chế độ demo: cho phép ép endpoint trả lỗi để xem SePay retry.
    if (isMock() && req.get('x-demo-force-fail') === '1') {
      fail(res, receipt, 500, 'Demo: ép lỗi 500 để xem lịch retry Fibonacci');
      return;
    }

    // 1) Xác thực — trước khi tin bất kỳ trường nào trong body.
    const auth = authenticate(req, raw);
    if (!auth.ok) {
      fail(res, receipt, auth.status ?? 401, auth.reason);
      return;
    }

    // 2) Parse payload theo Content-Type (SePay hỗ trợ json / urlencoded / multipart).
    let payload;
    try {
      payload = parsePayload(req, raw);
    } catch (err) {
      fail(res, receipt, 400, `Body không parse được: ${err.message}`);
      return;
    }

    const invalid = validatePayload(payload);
    if (invalid) {
      // Vẫn trả success để không phải nhận lại payload rác mãi mãi.
      fail(res, receipt, 422, invalid, { success: true });
      return;
    }

    // 3) Chống trùng: `id` không đổi qua mọi lần retry/replay → dùng làm khóa UNIQUE.
    if (store.hasSeenTxn(payload.id)) {
      const note = `Trùng lặp: transaction id=${payload.id} đã xử lý trước đó`;
      store.logEvent({ ...receipt, kind: 'duplicate', payload, note, ms: Date.now() - startedAt });
      res.status(200).json({ success: true, demo: { note } });
      return;
    }

    // 4) Tiền ra (rút/hoàn) không dùng để xác nhận đơn hàng.
    if (payload.transferType !== 'in') {
      store.markSeenTxn(payload.id);
      const note = `Bỏ qua: transferType=${payload.transferType} (chỉ khớp đơn khi tiền vào)`;
      store.logEvent({ ...receipt, kind: 'ignored', payload, note, ms: Date.now() - startedAt });
      res.status(200).json({ success: true, demo: { note } });
      return;
    }

    // 5) Khớp đơn hàng: subAccount (VA) → code → nội dung.
    const { order, via } = matchOrder(payload);
    if (!order) {
      store.markSeenTxn(payload.id);
      const note = 'Không khớp đơn hàng nào — cần đối soát thủ công';
      store.logEvent({
        ...receipt,
        kind: 'unmatched',
        payload,
        note,
        detectedCode: extractPaymentCode(payload.content),
        ms: Date.now() - startedAt,
      });
      // Trả success vì đã GHI NHẬN; xử lý nợ là việc của queue.
      res.status(200).json({ success: true, demo: { note } });
      return;
    }

    // 6) Kiểm tra số tiền. Sacombank/Vietcombank/Shinhan chỉ nhận ĐÚNG số tiền.
    const money = checkAmount(order, payload);
    if (!money.ok) {
      store.markSeenTxn(payload.id);
      const note =
        money.verdict === 'underpaid'
          ? `Nhận thiếu ${fmt(money.received)}/${fmt(order.amount)} — đơn giữ nguyên, chờ đối soát`
          : `Nhận thừa ${fmt(money.extra)} so với đơn — cần hoàn/đối soát`;
      store.markOrder(order.code, { flag: money.verdict, flagDetail: note });
      store.logEvent({ ...receipt, kind: 'amount_mismatch', payload, orderCode: order.code, note, ms: Date.now() - startedAt });
      res.status(200).json({ success: true, demo: { note } });
      return;
    }

    // 7) Ghi nhận thanh toán.
    store.markSeenTxn(payload.id);
    const { changed, skipped } = store.settleOrder(order.code, {
      amount: money.received,
      txnId: payload.id,
      va: payload.subAccount,
      content: payload.content,
      method: `webhook${via ? ` (khớp ${via})` : ''}`,
    });
    if (isMock()) mockRecordTransaction({ payload, orderCode: order.code });

    const resultOrder = store.getOrder(order.code);
    store.logEvent({
      ...receipt,
      kind: changed ? 'paid' : 'settled_noop',
      payload,
      orderCode: order.code,
      matchedBy: via,
      note: changed
        ? `Đơn ${order.code} → ${resultOrder.status.toUpperCase()} (${fmt(money.received)})`
        : `Bỏ qua ghi nhận: ${skipped}`,
      orderStatus: resultOrder.status,
      ms: Date.now() - startedAt,
    });

    // 8) Phản hồi hợp lệ. Trong hệ thống thật: trả 200 NGAY rồi đẩy queue,
    //    vì xử lý nặng >30s sẽ bị tính là timeout dù server đã nhận request.
    res.status(200).json({ success: true, demo: { orderCode: order.code, status: resultOrder.status, changed } });
  });

  // Log để UI render dòng "Lịch sử gửi".
  router.get('/api/webhook-events', (_req, res) => {
    res.json({ events: store.listEvents() });
  });

  return router;
}

function authenticate(req, raw) {
  if (config.webhook.auth === 'none') return { ok: true };
  if (config.webhook.auth === 'apikey') {
    return verifyApiKey({ authorization: req.get('authorization'), apiKey: config.webhook.apiKey });
  }
  return verifySignature({
    rawBody: raw,
    signature: req.get('x-sepay-signature'),
    timestamp: req.get('x-sepay-timestamp'),
    secret: config.webhook.secret,
    toleranceSec: config.webhook.toleranceSec,
  });
}

function parsePayload(req, raw) {
  const type = (req.get('content-type') ?? '').split(';')[0].trim();
  const text = raw.toString('utf8');
  if (type === 'application/x-www-form-urlencoded') {
    return Object.fromEntries(new URLSearchParams(text));
  }
  if (type === 'multipart/form-data') {
    throw new Error('Demo chỉ hỗ trợ json/urlencoded — cấu hình webhook lại định dạng JSON');
  }
  return JSON.parse(text);
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') return 'payload không phải object';
  if (payload.id === undefined || payload.id === null) return 'thiếu `id` — không chống trùng được';
  if (payload.transferAmount === undefined) return 'thiếu `transferAmount`';
  if (!Number.isFinite(Number(payload.transferAmount))) return '`transferAmount` không phải số';
  return null;
}

function fail(res, receipt, status, reason, bodyOverride) {
  store.logEvent({ ...receipt, kind: 'rejected', note: reason, status });
  // Khi từ chối, KHÔNG trả {"success":true}: để SePay retry đúng kịch bản.
  res.status(status).json(bodyOverride ?? { success: false, message: reason });
}

function mask(v) {
  if (!v) return null;
  return v.length <= 12 ? '****' : `${v.slice(0, 7)}…${v.slice(-4)}`;
}

const fmt = (n) => new Intl.NumberFormat('vi-VN').format(Number(n) || 0) + 'đ';

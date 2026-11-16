/**
 * ENDPOINT NHẬN WEBHOOK SePay — phần code bạn mang lên production.
 *
 * Doc: https://developer.sepay.vn/vi/sepay-webhooks/tich-hop-webhook
 *
 * SePay chỉ tính THÀNH CÔNG khi đủ 3 điều:
 *   1. HTTP 200 hoặc 201
 *   2. Body JSON đúng `{"success": true}`
 *   3. Trả lời trong 30 giây
 * Sai 1 trong 3 → thất bại, SePay retry theo Fibonacci (tối đa 7 lần).
 *
 * Route này phải chạy express.raw() để giữ nguyên bytes cho verify chữ ký.
 */
import express, { Router, type IRouter, type Request, type Response } from 'express';

import { config, isMock } from '../config.ts';
import * as store from '../store.ts';
import type { EventInput } from '../store.ts';
import { normalizeWebhookPayload } from '../sepay/payload.ts';
import { verifyApiKey, verifySignature } from '../sepay/signature.ts';
import { checkAmount, extractPaymentCode, matchOrder } from '../sepay/matching.ts';
import { mockRecordTransaction } from '../sepay/mock.ts';
import type { NormalizeResult, VerifyResult } from '../types.ts';

export function createWebhookRouter(): IRouter {
  const router = Router();

  router.post(config.webhook.path, express.raw({ type: '*/*', limit: '1mb' }), (req: Request, res: Response) => {
    void handleWebhook(req, res);
  });

  router.get('/api/webhook-events', (_req: Request, res: Response) => {
    res.json({ events: store.listEvents() });
  });

  return router;
}

async function handleWebhook(req: Request, res: Response): Promise<void> {
  const startedAt = Date.now();
  const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ''));

  const receipt = {
    direction: 'inbound' as const,
    attempt: Number(req.get('x-sepay-attempt') ?? '1') || 1,
    headers: {
      signature: req.get('x-sepay-signature') ?? null,
      timestamp: req.get('x-sepay-timestamp') ?? null,
      authorization: mask(req.get('authorization')),
      contentType: req.get('content-type') ?? null,
    },
    rawBody: raw.toString('utf8'),
  };

  // 0) Chế độ demo: ép endpoint trả lỗi để xem SePay retry.
  if (isMock() && req.get('x-demo-force-fail') === '1') {
    fail(res, receipt, 500, 'Demo: ép lỗi 500 để xem lịch retry Fibonacci');
    return;
  }

  // 1) Xác thực TRƯỚC khi tin bất kỳ field nào của body.
  const auth = authenticate(req, raw);
  if (!auth.ok) {
    fail(res, receipt, auth.status ?? 401, auth.reason ?? 'Xác thực thất bại');
    return;
  }

  // 2) Parse payload theo Content-Type.
  let parsedInput: unknown;
  try {
    parsedInput = parsePayload(req, raw);
  } catch (err) {
    fail(res, receipt, 400, `Body không parse được: ${(err as Error).message}`);
    return;
  }

  // 3) Validate + chuẩn hóa (mọi field là unknown cho tới đây).
  const normalized = normalizeWebhookPayload(parsedInput) as NormalizeResult;
  if (!normalized.ok) {
    // Payload rác: trả success để SePay ngừng gửi lại, log rõ lý do.
    store.logEvent({ ...receipt, kind: 'rejected', note: normalized.reason, status: 422 });
    res.json({ success: true, demo: { note: `Payload không hợp lệ: ${normalized.reason}` } });
    return;
  }
  const payload = normalized.payload;

  // 4) Chống trùng: `id` không đổi qua retry/replay → dùng làm khóa UNIQUE.
  if (store.hasSeenTxn(payload.id)) {
    const note = `Trùng lặp: transaction id=${payload.id} đã xử lý trước đó`;
    store.logEvent({ ...receipt, kind: 'duplicate', payload, note, ms: Date.now() - startedAt });
    res.json({ success: true, demo: { note } });
    return;
  }

  // 5) Tiền ra (rút/hoàn) không dùng để xác nhận đơn hàng.
  if (payload.transferType !== 'in') {
    store.markSeenTxn(payload.id);
    const note = `Bỏ qua: transferType=${payload.transferType} (chỉ khớp đơn khi tiền vào)`;
    store.logEvent({ ...receipt, kind: 'ignored', payload, note, ms: Date.now() - startedAt });
    res.json({ success: true, demo: { note } });
    return;
  }

  // 6) Khớp đơn: subAccount (VA) → code → nội dung.
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
    // Đã GHI NHẬN thì trả success; xử lý nợ là việc của queue.
    res.json({ success: true, demo: { note } });
    return;
  }

  // 7) Kiểm tra số tiền — Sacombank/VCB/Shinhan chỉ nhận ĐÚNG số tiền.
  const money = checkAmount(order, payload);
  if (!money.ok) {
    store.markSeenTxn(payload.id);
    const note =
      money.verdict === 'underpaid'
        ? `Nhận thiếu ${fmt(money.received)}/${fmt(order.amount)} — đơn giữ nguyên, chờ đối soát`
        : `Nhận thừa ${fmt(money.extra)} so với đơn — cần hoàn/đối soát`;
    store.markOrder(order.code, { flag: money.verdict === 'underpaid' ? 'underpaid' : 'overpaid', flagDetail: note });
    store.logEvent({ ...receipt, kind: 'amount_mismatch', payload, orderCode: order.code, note, ms: Date.now() - startedAt });
    res.json({ success: true, demo: { note } });
    return;
  }

  // 8) Ghi nhận thanh toán.
  store.markSeenTxn(payload.id);
  const { changed, skipped } = store.settleOrder(order.code, {
    amount: money.received,
    txnId: payload.id,
    va: payload.subAccount,
    content: payload.content,
    method: `webhook${via ? ` (khớp ${via})` : ''}`,
  });
  if (isMock()) mockRecordTransaction({ payload, orderCode: order.code });

  const fresh = store.getOrder(order.code);
  store.logEvent({
    ...receipt,
    kind: changed ? 'paid' : 'settled_noop',
    payload,
    orderCode: order.code,
    matchedBy: via,
    note: changed
      ? `Đơn ${order.code} → ${fresh?.status.toUpperCase()} (${fmt(money.received)})`
      : `Bỏ qua ghi nhận: ${skipped}`,
    orderStatus: fresh?.status,
    ms: Date.now() - startedAt,
  });

  // 9) Phản hồi hợp lệ. Hệ thống thật: trả 200 NGAY rồi đẩy queue — xử lý đồng bộ
  //    nặng >30s là timeout dù server đã nhận request.
  res.json({ success: true, demo: { orderCode: order.code, status: fresh?.status, changed } });
}

function authenticate(req: Request, raw: Buffer): VerifyResult {
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

function parsePayload(req: Request, raw: Buffer): unknown {
  const type = (req.get('content-type') ?? 'application/json').split(';')[0]?.trim() ?? 'application/json';
  const text = raw.toString('utf8');
  if (type === 'application/x-www-form-urlencoded') {
    return Object.fromEntries(new URLSearchParams(text));
  }
  if (type === 'multipart/form-data') {
    throw new Error('demo hỗ trợ json/urlencoded — cấu hình webhook lại định dạng JSON');
  }
  return JSON.parse(text);
}

function fail(res: Response, receipt: Omit<EventInput, 'kind'>, status: number, reason: string): void {
  store.logEvent({ ...receipt, kind: 'rejected', note: reason, status });
  // Khi từ chối KHÔNG trả {"success":true}: để SePay retry đúng kịch bản.
  res.status(status).json({ success: false, message: reason });
}

function mask(v: string | undefined): string | null {
  if (!v) return null;
  return v.length <= 12 ? '****' : `${v.slice(0, 7)}…${v.slice(-4)}`;
}

const fmt = (n: number): string => `${new Intl.NumberFormat('vi-VN').format(n || 0)}đ`;

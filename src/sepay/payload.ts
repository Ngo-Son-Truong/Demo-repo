/**
 * Chuẩn hóa body webhook thành SePayWebhookPayload.
 *
 * Body từ SePay là `unknown` ở mép hệ thống — không cast `as SePayWebhookPayload`
 * là chết khi payload đổi shape. File này là nơi duy nhất đọc field thô.
 *
 * Doc: https://developer.sepay.vn/vi/sepay-webhooks/tich-hop-webhook#payload
 */
import type { NormalizeResult, RawWebhookBody, SePayWebhookPayload } from '../types.ts';

const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v));

/** `code` khác các field chuỗi rỗng ở chỗ: null = "không nhận diện được mã". */
const codeOrNull = (v: unknown): string | null => (v === undefined || v === null ? null : String(v));

const intOr = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

export function normalizeWebhookPayload(input: unknown): NormalizeResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, reason: 'payload không phải JSON object' };
  }
  const raw = input as RawWebhookBody;

  // id là khóa chống trùng: thiếu nó là KHÔNG an toàn để xử lý tiếp.
  if (raw.id === undefined || raw.id === null) return { ok: false, reason: 'thiếu `id` — không chống trùng được' };
  if (raw.transferAmount === undefined) return { ok: false, reason: 'thiếu `transferAmount`' };
  const transferAmount = Number(raw.transferAmount);
  if (!Number.isFinite(transferAmount)) return { ok: false, reason: '`transferAmount` không phải số' };
  if (transferAmount < 0) return { ok: false, reason: '`transferAmount` phải luôn dương (doc)' };

  const transferType = raw.transferType === 'out' ? 'out' : raw.transferType === 'in' ? 'in' : null;
  if (!transferType) return { ok: false, reason: `\`transferType\` lạ: ${str(raw.transferType) || '(trống)'}` };

  const payload: SePayWebhookPayload = {
    id: intOr(raw.id, 0),
    gateway: str(raw.gateway),
    transactionDate: str(raw.transactionDate),
    accountNumber: str(raw.accountNumber),
    subAccount: str(raw.subAccount).trim(),
    code: codeOrNull(raw.code),
    content: str(raw.content),
    transferType,
    description: str(raw.description),
    transferAmount: Math.trunc(transferAmount),
    accumulated: intOr(raw.accumulated, 0),
    referenceCode: str(raw.referenceCode),
  };
  return { ok: true, payload };
}

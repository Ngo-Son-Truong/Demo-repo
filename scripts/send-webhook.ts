/**
 * Tự ký và POST một payload SePay tới endpoint webhook của bạn.
 *
 * Dùng khi: (a) chưa muốn bấm nút Mô phỏng trên dashboard, (b) test endpoint sau
 * khi deploy, (c) kiểm tra response có đúng `{"success": true}` hay không.
 *
 *   npm run webhook -- --order DH1001 --amount 585000
 *   npm run webhook -- --order DH1001 --amount 585000 --va SBSEPAYXXXX
 *   npm run webhook -- --url https://abc.ngrok.app/webhooks/sepay --order DH1001 --amount 100000
 *   npm run webhook -- --order DH1001 --amount 585000 --auth apikey --key <KEY>
 *
 * Secret phải khớp Secret Key nhập ở bước "Bảo mật" khi tạo webhook (SEPAY_WEBHOOK_SECRET).
 */
import crypto from 'node:crypto';
import type { SePayWebhookPayload } from '../src/types.ts';

const args = process.argv.slice(2);
const flag = (name: string, fallback?: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};

const url = flag('url', 'http://127.0.0.1:3000/webhooks/sepay') as string;
const orderCode = (flag('order', 'DH1001') as string).toUpperCase();
const amount = Number(flag('amount', '585000'));
const va = flag('va');
const auth = (flag('auth', 'hmac') as string).toLowerCase();
const secret = flag('secret', process.env.SEPAY_WEBHOOK_SECRET ?? 'demo-sandbox-secret-thay-bang-key-cua-ban') as string;
const apiKey = flag('key', process.env.SEPAY_WEBHOOK_API_KEY ?? 'demo-api-key') as string;

/** SePay dùng "YYYY-MM-DD HH:mm:ss" giờ UTC+7, không phải ISO 8601. */
const vnNow = (): string => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');

const payload: SePayWebhookPayload = {
  id: Number(flag('id', String(Math.floor(10_000 + Math.random() * 980_000)))),
  gateway: flag('gateway', 'MBBank') as string,
  transactionDate: vnNow(),
  accountNumber: flag('account', '0123456789') as string,
  subAccount: va ?? '',
  code: orderCode,
  content: flag('content', `${orderCode} thanh toan don hang`) as string,
  transferType: (flag('type', 'in') === 'out' ? 'out' : 'in') as SePayWebhookPayload['transferType'],
  description: flag('desc', 'HO KINH DOANH DEMO chuyen tien') as string,
  transferAmount: amount,
  accumulated: Number(flag('accumulated', '5585000')),
  referenceCode: `SB${crypto.randomBytes(5).toString('hex').toUpperCase()}`,
};

const raw = JSON.stringify(payload);
const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
if (auth === 'hmac') {
  const ts = Math.floor(Date.now() / 1000);
  headers['X-SePay-Timestamp'] = String(ts);
  headers['X-SePay-Signature'] = `sha256=${crypto.createHmac('sha256', secret).update(`${ts}.${raw}`, 'utf8').digest('hex')}`;
} else if (auth === 'apikey') {
  headers.Authorization = `Apikey ${apiKey}`;
}

console.log(`POST ${url}`);
console.log('payload:', raw);
console.log('headers:', JSON.stringify(headers, null, 2));

const res = await fetch(url, { method: 'POST', headers, body: raw });
const text = await res.text();
console.log(`\n← HTTP ${res.status}`);
console.log(text || '(body rỗng)');

const httpOk = res.status === 200 || res.status === 201;
let success = false;
try {
  success = (JSON.parse(text) as { success?: unknown }).success === true;
} catch {
  success = false;
}

console.log(
  success
    ? '\n\x1b[32m✓\x1b[0m Phản hồi hợp lệ theo doc SePay (200/201 + {"success": true}) → SePay KHÔNG retry.'
    : httpOk
      ? '\n\x1b[33m!\x1b[0m HTTP OK nhưng body thiếu {"success": true} → SePay vẫn tính là THẤT BẠI và sẽ retry.'
      : '\n\x1b[31m✗\x1b[0m Thất bại → SePay retry Fibonacci (1,1,2,3,5,8,13 phút, tối đa 7 lần).'
);
process.exitCode = success ? 0 : 1;

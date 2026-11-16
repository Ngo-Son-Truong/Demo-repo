#!/usr/bin/env node
/**
 * Tự ký và POST một payload SePay tới endpoint webhook của bạn.
 * Dùng khi: (a) chưa muốn bấm nút Mô phỏng trên dashboard, (b) test endpoint
 * sau khi deploy, (c) kiểm tra endpoint có trả đúng `{"success": true}` không.
 *
 *   node scripts/send-webhook.mjs --order DH1001 --amount 585000
 *   node scripts/send-webhook.mjs --url http://localhost:3000/webhooks/sepay --order DH1001 --amount 100000
 *   node scripts/send-webhook.mjs --order DH1001 --amount 585000 --va SBSEPAYXXXX
 *   node scripts/send-webhook.mjs --order DH1001 --amount 585000 --auth apikey --key <KEY>
 *
 * Secret lấy từ SEPAY_WEBHOOK_SECRET (giống Secret Key đã nhập ở bước Bảo mật khi tạo webhook).
 */
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const flag = (name, fallback = undefined) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};

const url = flag('url', 'http://127.0.0.1:3000/webhooks/sepay');
const orderCode = (flag('order', 'DH1001') || '').toUpperCase();
const amount = Number(flag('amount', '585000'));
const va = flag('va', null);
const auth = (flag('auth', 'hmac') || 'hmac').toLowerCase();
const secret = flag('secret', process.env.SEPAY_WEBHOOK_SECRET || 'demo-sandbox-secret-thay-bang-key-cua-ban');
const apiKey = flag('key', process.env.SEPAY_WEBHOOK_API_KEY || 'demo-api-key');

const vnNow = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');

const payload = {
  id: Number(flag('id', Math.floor(10_000 + Math.random() * 980_000))),
  gateway: flag('gateway', 'MBBank'),
  transactionDate: vnNow(),
  accountNumber: flag('account', '0123456789'),
  subAccount: va ?? '',
  code: orderCode,
  content: flag('content', `${orderCode} thanh toan don hang`),
  transferType: flag('type', 'in'),
  description: flag('desc', 'HO KINH DOANH DEMO chuyen tien'),
  transferAmount: amount,
  accumulated: Number(flag('accumulated', '5585000')),
  referenceCode: `SB${crypto.randomBytes(5).toString('hex').toUpperCase()}`,
};

const raw = JSON.stringify(payload);
const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
if (auth === 'hmac') {
  const ts = Math.floor(Date.now() / 1000);
  headers['X-SePay-Timestamp'] = String(ts);
  headers['X-SePay-Signature'] = `sha256=${crypto.createHmac('sha256', secret).update(`${ts}.${raw}`, 'utf8').digest('hex')}`;
} else if (auth === 'apikey') {
  headers.Authorization = `Apikey ${apiKey}`;
}

console.log(`POST ${url}`);
console.log('payload:', raw);
console.log('headers :', JSON.stringify(headers, null, 2));

const res = await fetch(url, { method: 'POST', headers, body: raw });
const text = await res.text();
console.log(`\n← HTTP ${res.status}`);
console.log(text || '(body rỗng)');

const valid = [200, 201].includes(res.status);
let success = false;
try {
  success = JSON.parse(text).success === true;
} catch {
  /* body không phải JSON */
}
console.log(
  success
    ? '\n\x1b[32m✓\x1b[0m Phản hồi hợp lệ theo doc SePay (200/201 + {"success": true}) → SePay KHÔNG retry.'
    : valid
      ? '\n\x1b[33m!\x1b[0m HTTP OK nhưng body thiếu {"success": true} → SePay vẫn tính là THẤT BẠI và sẽ retry.'
      : '\n\x1b[31m✗\x1b[0m Thất bại → SePay retry theo Fibonacci (1,1,2,3,5,8,13 phút, tối đa 7 lần).'
);
process.exitCode = success ? 0 : 1;

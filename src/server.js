import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config, isMock, publicConfig } from './config.js';
import { flush } from './store.js';
import { createWebhookRouter } from './routes/webhook.js';
import { createCheckoutRouter } from './routes/checkout.js';
import { createSimulatorRouter } from './routes/simulator.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', true);

/**
 * THỨ TỰ MIDDLEWARE QUAN TRỌNG:
 * route webhook đăng ký TRƯỚC express.json() để req.body còn là raw bytes —
 * SePay ký trên body gốc, parse rồi serialize lại là chữ ký hỏng ngay.
 */
app.use(createWebhookRouter());

app.use(express.json({ limit: '64kb' }));
app.use(createCheckoutRouter());
app.use(createSimulatorRouter());

app.get('/healthz', (_req, res) => res.json({ ok: true, mode: config.mode, uptime: Math.round(process.uptime()) }));
app.get('/api/config', (_req, res) => res.json(publicConfig()));

app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'], maxAge: isMock() ? 0 : '1h' }));

app.use((req, res) => res.status(404).json({ error: 'Not found', path: req.path }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: err.message || 'Internal error' });
});

const server = app.listen(config.port, config.host, () => {
  const line = (s = '─'.repeat(72)) => console.log(s);
  line();
  console.log(`  SePay payment demo  ·  http://localhost:${config.port}`);
  line();
  console.log(`  Chế độ API      : ${config.mode}${isMock() ? '  (giả lập trong process — không cần token)' : ''}`);
  console.log(`  Endpoint SePay  : ${config.sepay.apiBase}/v2`);
  console.log(`  Webhook         : POST ${config.webhook.path}  ·  auth=${config.webhook.auth}`);
  if (config.webhook.auth === 'hmac') {
    console.log(`  HMAC secret     : ${config.webhook.secret.slice(0, 6)}…${config.webhook.secret.slice(-4)} (đổi bằng SEPAY_WEBHOOK_SECRET)`);
  }
  console.log(`  Lọc webhook     : ${JSON.stringify(config.webhook.filters)}`);
  console.log(`  Mã đơn          : tiền tố "${config.orders.codePrefix}" · TTL ${config.orders.ttlSec}s`);
  line();
  if (!isMock() && !config.sepay.bankAccountId) {
    console.log('  ⚠ SEPAY_BANK_ACCOUNT_ID chưa set → GET /v2/bank-accounts để lấy ba_xid rồi bỏ vào .env');
    line();
  }
  if (isMock()) {
    console.log('  Gợi ý: bấm "Tạo đơn & xem chỉ dẫn" → "Mô phỏng giao dịch" → webhook tự chạy, đơn đổi PAID.');
    console.log('  Chuyển sang sandbox thật: đặt SEPAY_MODE=sandbox + SEPAY_API_TOKEN (token trong Test mode → API Access).');
    line();
  }
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    flush();
    server.close(() => process.exit(0));
  });
}

export default app;

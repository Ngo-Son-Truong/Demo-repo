import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextFunction, Request, Response } from 'express';

import { config, isMock, publicConfig } from './config.ts';
import { flush } from './store.ts';
import { createWebhookRouter } from './routes/webhook.ts';
import { createCheckoutRouter } from './routes/checkout.ts';
import { createSimulatorRouter } from './routes/simulator.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', true);

/**
 * THỨ TỰ MIDDLEWARE QUAN TRỌNG:
 * route webhook đăng ký TRƯỚC express.json() để req.body còn là raw bytes —
 * SePay ký trên body gốc, parse rồi serialize lại là chữ ký không khớp.
 */
app.use(createWebhookRouter());

app.use(express.json({ limit: '64kb' }));
app.use(createCheckoutRouter());
app.use(createSimulatorRouter());

app.get('/healthz', (_req: Request, res: Response) => {
  res.json({ ok: true, mode: config.mode, uptime: Math.round(process.uptime()) });
});
app.get('/api/config', (_req: Request, res: Response) => {
  res.json(publicConfig());
});

app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'], maxAge: isMock() ? 0 : '1h' }));

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// Express nhận diện error handler bằng arity 4 — đừng bỏ tham số `next`.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: err.message || 'Internal error' });
});

const server = app.listen(config.port, config.host, () => {
  const line = (s = '─'.repeat(72)): void => console.log(s);
  line();
  console.log(`  SePay payment demo (TypeScript)  ·  http://localhost:${config.port}`);
  line();
  console.log(`  Chế độ API      : ${config.mode}${isMock() ? '  (giả lập trong process — không cần token)' : ''}`);
  console.log(`  Endpoint SePay  : ${config.sepay.apiBase}/v2`);
  console.log(`  Webhook         : POST ${config.webhook.path}  ·  auth=${config.webhook.auth}`);
  if (config.webhook.auth === 'hmac') {
    const s = config.webhook.secret;
    console.log(`  HMAC secret     : ${s.slice(0, 6)}…${s.slice(-4)} (đổi bằng SEPAY_WEBHOOK_SECRET)`);
  }
  console.log(`  Lọc webhook     : ${JSON.stringify(config.webhook.filters)}`);
  console.log(`  Mã đơn          : tiền tố "${config.orders.codePrefix}" · TTL ${config.orders.ttlSec}s`);
  line();
  if (!isMock() && !config.sepay.bankAccountId) {
    console.log('  ⚠ SEPAY_BANK_ACCOUNT_ID chưa set → GET /v2/bank-accounts để lấy ba_xid rồi bỏ vào .env');
    line();
  }
  if (isMock()) {
    console.log('  Gợi ý: "Tạo đơn & xem chỉ dẫn" → "Mô phỏng giao dịch" → webhook tự chạy, đơn đổi PAID.');
    console.log('  Sang sandbox thật: SEPAY_MODE=sandbox + SEPAY_API_TOKEN (token ở Test mode → API Access).');
    line();
  }
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    flush();
    server.close(() => process.exit(0));
  });
}

export default app;

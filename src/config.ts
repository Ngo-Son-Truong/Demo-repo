/**
 * Cấu hình demo SePay (TypeScript).
 *
 * Ba chế độ (SEPAY_MODE):
 *   - mock    : (mặc định) tự giả lập SePay API v2 sandbox + Test mode ngay trong process.
 *               Chạy được ngay, không cần token.
 *   - sandbox : gọi thật https://userapi-sandbox.sepay.vn  (token tạo trong Test mode → API Access)
 *   - live    : gọi thật https://userapi.sepay.vn          (token Live — cẩn thận tiền thật)
 *
 * Nguồn: https://developer.sepay.vn/vi/tien-ich-khac/test-mode
 *        https://developer.sepay.vn/vi/tien-ich-khac/test-mode/api-access
 */
export const SEPAY_MODES = ['mock', 'sandbox', 'live'] as const;
export type SepayMode = (typeof SEPAY_MODES)[number];

export const WEBHOOK_AUTHS = ['hmac', 'apikey', 'none'] as const;
export type WebhookAuth = (typeof WEBHOOK_AUTHS)[number];

/** Loại sự kiện webhook trên dashboard: Tiền vào / Tiền ra / Tất cả. */
export type EventType = 'in' | 'out' | 'all';

export interface WebhookFilters {
  eventType: EventType;
  onlyWithPaymentCode: boolean;
  codePrefixes: string[];
  vaOnly: boolean;
  name: string;
}

export interface AppConfig {
  mode: SepayMode;
  port: number;
  host: string;
  publicUrl: string;
  sepay: {
    apiBase: string;
    token: string;
    bankAccountId: string;
    tid: string;
    vaPrefix: string;
    withQrCode: boolean;
    qrTemplate: string;
    vaDurationSec: number;
  };
  webhook: {
    path: string;
    auth: WebhookAuth;
    secret: string;
    apiKey: string;
    toleranceSec: number;
    filters: WebhookFilters;
  };
  orders: {
    codePrefix: string;
    ttlSec: number;
    allowPartialPayment: boolean;
  };
  sim: {
    dailyQuota: number;
    minAmount: number;
    maxAmount: number;
    maxContentLen: number;
    retryUnitSec: number;
    maxAttempts: number;
  };
}

const env = (key: string, fallback?: string): string | undefined => {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
};
const bool = (key: string, fallback = false): boolean => {
  const v = env(key);
  if (v === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
};
const int = (key: string, fallback: number): number => {
  const v = Number.parseInt(env(key, '') ?? '', 10);
  return Number.isFinite(v) ? v : fallback;
};
const list = (key: string, fallback: string[]): string[] => {
  const v = env(key);
  if (!v) return fallback;
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

let mode = (env('SEPAY_MODE', 'mock') ?? 'mock').toLowerCase() as SepayMode;
if (!SEPAY_MODES.includes(mode)) mode = 'mock';

// Token Test mode chỉ xác thực được trên userapi-sandbox, token Live chỉ gọi được userapi.
const API_BASE: Record<SepayMode, string> = {
  sandbox: 'https://userapi-sandbox.sepay.vn',
  live: 'https://userapi.sepay.vn',
  mock: 'https://userapi-sandbox.sepay.vn',
};

const token = env('SEPAY_API_TOKEN');

if (mode !== 'mock' && !token) {
  throw new Error(
    `SEPAY_MODE=${mode} cần SEPAY_API_TOKEN.\n` +
      '  - Test mode: my.sepay.vn → bật Test mode → API Access → + Thêm API (dùng endpoint userapi-sandbox.sepay.vn)\n' +
      '  - Hoặc chạy thử không cần token: SEPAY_MODE=mock npm run dev'
  );
}

let webhookAuth = (env('SEPAY_WEBHOOK_AUTH', 'hmac') ?? 'hmac').toLowerCase() as WebhookAuth;
if (!WEBHOOK_AUTHS.includes(webhookAuth)) webhookAuth = 'hmac';

const eventTypeRaw = env('SEPAY_WEBHOOK_EVENT_TYPE', 'in');
const eventType: EventType = eventTypeRaw === 'out' || eventTypeRaw === 'all' ? eventTypeRaw : 'in';

export const config: AppConfig = {
  mode,
  port: int('PORT', 3000),
  host: env('HOST', '0.0.0.0') ?? '0.0.0.0',
  publicUrl: env('PUBLIC_URL', '') ?? '',

  sepay: {
    apiBase: API_BASE[mode],
    token: token ?? 'mock-token-khong-dung-that',
    // UUID tài khoản ngân hàng (ba_xid) — lấy từ GET /v2/bank-accounts
    bankAccountId: env('SEPAY_BANK_ACCOUNT_ID', '') ?? '',
    // Vietcombank bắt buộc tid = Terminal ID GỐC, KHÔNG phải xid UUID của SePay.
    tid: env('SEPAY_VCB_TID', '') ?? '',
    // Sacombank bắt buộc va_prefix, ví dụ SEP200001WEB.
    vaPrefix: env('SEPAY_SACOMBANK_VA_PREFIX', '') ?? '',
    withQrCode: bool('SEPAY_WITH_QRCODE', true),
    qrTemplate: env('SEPAY_QRCODE_TEMPLATE', 'compact') ?? 'compact',
    // duration: thời hạn VA (giây). Sacombank mặc định 900s theo doc.
    vaDurationSec: int('SEPAY_VA_DURATION', 900),
  },

  webhook: {
    path: '/webhooks/sepay',
    auth: webhookAuth,
    secret: env('SEPAY_WEBHOOK_SECRET', 'demo-sandbox-secret-thay-bang-key-cua-ban') ?? '',
    apiKey: env('SEPAY_WEBHOOK_API_KEY', 'demo-api-key') ?? '',
    // Chống replay: doc khuyến nghị ±5 phút.
    toleranceSec: int('SEPAY_WEBHOOK_TOLERANCE', 300),
    filters: {
      eventType,
      onlyWithPaymentCode: bool('SEPAY_WEBHOOK_ONLY_WITH_CODE', true),
      codePrefixes: list('SEPAY_WEBHOOK_CODE_PREFIXES', []),
      vaOnly: bool('SEPAY_WEBHOOK_VA_ONLY', false),
      name: env('SEPAY_WEBHOOK_NAME', 'Xác thực thanh toán') ?? 'Xác thực thanh toán',
    },
  },

  orders: {
    // Tiền tố mã thanh toán — doc: Công ty → Cấu hình chung → Cấu trúc mã thanh toán.
    codePrefix: env('ORDER_CODE_PREFIX', 'DH') ?? 'DH',
    ttlSec: int('ORDER_TTL_SEC', 900),
    // Sacombank/Vietcombank/Shinhan chỉ nhận ĐÚNG số tiền; VietinBank chấp nhận trả thiếu.
    allowPartialPayment: bool('ALLOW_PARTIAL_PAYMENT', false),
  },

  // Hạn mức mô phỏng giao dịch trong Test mode: 500/ngày, reset 00:00 UTC+7.
  sim: {
    dailyQuota: int('SIM_DAILY_QUOTA', 500),
    minAmount: 1000,
    maxAmount: 499_000_000,
    maxContentLen: 200,
    // SePay: 1 lần đầu + 7 lần retry, chờ Fibonacci 1,1,2,3,5,8,13 phút (~33 phút).
    // Demo nén: 1 phút = SIM_RETRY_UNIT_SEC giây.
    retryUnitSec: int('SIM_RETRY_UNIT_SEC', 2),
    maxAttempts: int('SIM_MAX_ATTEMPTS', 8),
  },
};

export const isMock = (): boolean => config.mode === 'mock';

/** Info rút gọn, an toàn để đẩy ra frontend (không lộ token/secret). */
export function publicConfig() {
  return {
    mode: config.mode,
    apiBase: config.mode === 'mock' ? `${config.sepay.apiBase} (giả lập trong process)` : config.sepay.apiBase,
    webhookPath: config.webhook.path,
    webhookAuth: config.webhook.auth,
    filters: config.webhook.filters,
    orderCodePrefix: config.orders.codePrefix,
    ttlSec: config.orders.ttlSec,
    allowPartialPayment: config.orders.allowPartialPayment,
    hasBankAccountId: Boolean(config.sepay.bankAccountId),
    sim: {
      dailyQuota: config.sim.dailyQuota,
      minAmount: config.sim.minAmount,
      maxAmount: config.sim.maxAmount,
      maxContentLen: config.sim.maxContentLen,
    },
    secretHint:
      config.webhook.auth === 'hmac'
        ? 'HMAC-SHA256, header X-SePay-Signature: sha256=<hex>, chuỗi ký = "{timestamp}.{raw_body}"'
        : config.webhook.auth === 'apikey'
          ? 'Apikey, header Authorization: Apikey <API_KEY>'
          : 'Không xác thực (chỉ nên dùng khi test)',
  } as const;
}

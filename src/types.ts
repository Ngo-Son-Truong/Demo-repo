/**
 * TOÀN BỘ SHAPE DỮ LIỆU SePay mà demo chạm tới, chép theo tài liệu chính thức.
 *
 * Nguồn:
 *   payload webhook  https://developer.sepay.vn/vi/sepay-webhooks/tich-hop-webhook#payload
 *   API v2 envelope  https://developer.sepay.vn/vi/sepay-api/v2/bat-dau-nhanh
 *   tạo đơn hàng     https://developer.sepay.vn/vi/sepay-api/v2/don-hang/tao-don-hang
 *   chi tiết đơn     https://developer.sepay.vn/vi/sepay-api/v2/don-hang/chi-tiet
 *   danh sách đơn    https://developer.sepay.vn/vi/sepay-api/v2/don-hang/danh-sach
 *   giao dịch        https://developer.sepay.vn/vi/sepay-api/v2/giao-dich/danh-sach
 *
 * Chạy với `erasableSyntaxOnly` nên KHÔNG dùng enum — mọi tập hợp giá trị là
 * union of literal, suy ra được từ `as const` object ở chỗ cần giá trị thật.
 */

/* ────────────────────────────── Webhook ────────────────────────────── */

export type SePayTransferType = 'in' | 'out';

/**
 * Body SePay POST tới endpoint của bạn. 12 trường, KHÔNG thừa không thiếu.
 *
 * null vs chuỗi rỗng (doc nhấn mạnh điểm này):
 *   - `subAccount`  = ""   khi giao dịch không khớp VA  → là chuỗi rỗng, không phải null
 *   - `code`        = null  khi nội dung không khớp tiền tố mã thanh toán nào
 *   → 2 cái đó KHÁC nghĩa. `if (!payload.code)` gộp làm một; phải dùng `=== null`.
 */
export interface SePayWebhookPayload {
  /** ID giao dịch trên SePay. KHÔNG đổi qua mọi lần retry/replay → khóa chống trùng. */
  id: number;
  /** Tên ngân hàng của tài khoản phát sinh giao dịch, ví dụ `MBBank`. */
  gateway: string;
  /** `YYYY-MM-DD HH:mm:ss`, giờ Việt Nam (UTC+7) — không phải ISO 8601. */
  transactionDate: string;
  accountNumber: string;
  /** Số VA chính thức, hoặc mã TKP với VA theo nội dung. `''` nếu không khớp. */
  subAccount: string;
  /** Mã thanh toán trích từ nội dung theo "Cấu trúc mã thanh toán". */
  code: string | null;
  /** Nội dung chuyển khoản GỐC từ ngân hàng — SePay không xử lý. */
  content: string;
  transferType: SePayTransferType;
  /** Mô tả đầy đủ từ ngân hàng; một số ngân hàng không hỗ trợ → `''`. */
  description: string;
  /** always positive, đơn vị VND */
  transferAmount: number;
  /** Số dư sau giao dịch; `0` nếu kết nối không theo dõi số dư. */
  accumulated: number;
  /** Mã tham chiếu ngân hàng; Test mode luôn bắt đầu bằng `SB`. */
  referenceCode: string;
}

/** Body thô trước khi validate — mọi thứ còn `unknown` ở mép hệ thống. */
export type RawWebhookBody = Record<string, unknown>;

export type NormalizeResult =
  | { ok: true; payload: SePayWebhookPayload }
  | { ok: false; reason: string };

/* ────────────────────────────── API v2 ────────────────────────────── */

/** Mọi response v2 bọc trong envelope này. */
export interface SePayEnvelope<T> {
  status: 'success' | 'error';
  message?: string;
  data: T;
  meta?: { pagination?: SePayPagination };
}

export interface SePayPagination {
  total: number;
  per_page: number;
  current_page: number;
  last_page: number;
  has_more: boolean;
}

/** Body lỗi v2 (doc liệt kê theo bảng HTTP + error_code). */
export interface SePayErrorBody {
  status?: 'error';
  message?: string;
  error?: string;
  error_code?: SePayErrorCode;
}

/**
 * error_code hay gặp, ghi lại từ doc để switch/lint được.
 * `(string & {})` giữ autocomplete mà vẫn nhận mã mới SePay thêm sau này.
 */
export type SePayErrorCode =
  | 'duplicate'
  | 'validation_error'
  | 'invalid_state'
  | 'vietinbank_va_order_not_enabled'
  | 'invalid_tid_format'
  | 'invalid_tid'
  | 'vcb_error'
  | 'vcb_connection_error'
  | 'vcb_cancel_not_allowed'
  | 'vcb_cancel_error'
  | 'shinhan_error'
  | 'shinhan_connection_error'
  | 'shinhan_cancel_error'
  | (string & {});

export type SePayOrderStatus = 'Pending' | 'Paid' | 'Partially' | 'Cancelled';
export type SePayVaStatus = 'Unpaid' | 'Paid' | 'Cancelled';

export interface SePayBankAccount {
  id: string;
  account_holder_name: string;
  account_number: string;
  accumulated: number;
  last_transaction: string | null;
  label: string | null;
  /** 1 = đang hoạt động (doc dùng số, không dùng boolean) */
  active: 0 | 1;
  bank_short_name: string;
  bank_full_name: string;
  bank_code: string;
}

/** data của POST /v2/bank-accounts/{ba_xid}/orders — response 201. */
export interface SePayCreatedOrder {
  id: string;
  order_code: string;
  /** VA khách sẽ chuyển vào. Test mode: `SBSEPAY` + 12 ký tự. */
  va_number: string;
  va_holder_name: string | null;
  amount: number;
  status: SePayOrderStatus;
  refund_status: string | null;
  bank_name: string;
  account_holder_name: string;
  account_number: string;
  /** `YYYY-MM-DD HH:mm:ss` UTC+7, hoặc null nếu VA không hết hạn. */
  expired_at: string | null;
  /** base64 PNG `data:image/png;base64,...` khi with_qrcode=1 */
  qr_code?: string;
  qr_code_url?: string;
}

/** GET /v2/bank-accounts/{ba_xid}/orders/{order_xid} — lưu ý `va` là MẢNG. */
export interface SePayOrderDetail {
  id: string;
  order_code: string;
  amount: number;
  paid_amount: number;
  status: SePayOrderStatus;
  refund_status: string | null;
  created_at: string | null;
  bank_name: string;
  account_number: string;
  account_holder_name: string;
  va: Array<{
    va_number: string;
    va_holder_name: string;
    amount: number;
    status: SePayVaStatus;
    expired_at: string | null;
    paid_at: string | null;
  }>;
}

/** Row trong GET /v2/transactions. */
export interface SePayTransactionRow {
  id: string;
  transaction_date: string;
  account_number: string;
  va: string | null;
  transfer_type: SePayTransferType;
  amount_in: number;
  amount_out: number;
  accumulated: number;
  transaction_content: string;
  reference_number: string | null;
  code: string | null;
  bank_brand_name: string;
  bank_account_id: string | null;
  va_id: string | null;
  /** 0 = chưa gửi/thất bại, 1 = thành công, null = không cấu hình webhook */
  webhook_success: 0 | 1 | null;
}

/** Tham số POST /v2/bank-accounts/{ba_xid}/orders. */
export interface CreateOrderInput {
  orderCode: string;
  amount: number;
  duration?: number;
}

/* ────────────────────────────── Demo model ────────────────────────────── */

/** Tham số GET /v2/transactions — doc giao-dich/danh-sach. */
export interface SePayTransactionQuery {
  /** tìm đồng thời trên reference_number / transaction_content / code */
  q?: string;
  bank_account_id?: string;
  va_id?: string;
  bank_brand_name?: string;
  transaction_date_from?: string;
  transaction_date_to?: string;
  amount_in_min?: number;
  amount_in_max?: number;
  amount_out_min?: number;
  amount_out_max?: number;
  reference_number?: string;
  transaction_content?: string;
  transfer_type?: SePayTransferType;
  webhook_success?: 0 | 1;
  /** Doc: polling — truyền UUID giao dịch cuối lần trước; kèm transaction_date_sort=asc. */
  since_id?: string;
  transaction_date_sort?: 'asc' | 'desc';
  amount_in_sort?: 'asc' | 'desc';
  amount_out_sort?: 'asc' | 'desc';
  page?: number;
  /** tối đa 100 */
  per_page?: number;
  fields?: string;
  /** 'iso8601' → mọi datetime trả về ISO +07:00 */
  timestamp_format?: 'iso8601';
}

export type LocalOrderStatus = 'pending' | 'paid' | 'partially_paid' | 'cancelled';
export type AmountFlag = 'underpaid' | 'overpaid';

export interface CartLine {
  id: string;
  name: string;
  price: number;
  emoji: string;
  desc: string;
  qty: number;
  lineTotal: number;
}

export interface SettleEntry {
  at: string;
  amount: number;
  txnId: number | string | null;
  va: string | null;
  content: string | null;
  method: string;
}

export interface OrderRecord {
  code: string;
  status: LocalOrderStatus;
  lines: CartLine[];
  subtotal: number;
  shipping: number;
  amount: number;
  paidAmount: number;
  buyer: { name: string; email: string };
  gateway: string;
  accountNumber: string;
  accountHolder: string;
  va: string | null;
  sepayOrderId: string | null;
  transferContent: string;
  qrCodeUrl: string | null;
  createdAt: string;
  expiresAt: string | null;
  accumulated: number;
  flag?: AmountFlag;
  flagDetail?: string;
  note?: string;
  lastTxnId?: number | string | null;
  settleLog: SettleEntry[];
}

/** View trả cho frontend (đã tính sẵn `expired`/`secondsLeft`). */
export type OrderView = Omit<OrderRecord, 'accumulated' | 'status'> & {
  rawStatus: LocalOrderStatus;
  status: LocalOrderStatus | 'expired';
  currency: 'VND';
  secondsLeft: number | null;
};

export type WebhookEventKind =
  | 'paid'
  | 'settled_noop'
  | 'duplicate'
  | 'ignored'
  | 'unmatched'
  | 'amount_mismatch'
  | 'rejected'
  | 'delivery'
  | 'delivery_failed'
  | 'checkout'
  | 'reconcile';

export interface WebhookEvent {
  id: string;
  at: string;
  direction: 'inbound' | 'outbound' | 'internal';
  kind: WebhookEventKind;
  note?: string;
  status?: number;
  ok?: boolean;
  ms?: number;
  attempt?: number;
  url?: string;
  orderCode?: string;
  matchedBy?: string | null;
  orderStatus?: string;
  detectedCode?: string | null;
  webhook?: string;
  response?: string;
  payload?: SePayWebhookPayload | Record<string, unknown>;
  headers?: Record<string, string | null>;
  rawBody?: string;
}

/* ────────────────────────────── Kết quả trung gian ────────────────────────────── */

export interface VerifyResult {
  ok: boolean;
  reason?: string;
  status?: number;
}

export type MatchVia = 'subAccount' | 'code' | 'content' | null;

export interface FilterVerdict {
  pass: boolean;
  /** Lý do hiển thị trên dashboard SePay khi webhook bị "Bỏ qua". */
  reason?: string;
  filter: boolean;
}

export type AmountVerdict =
  | { ok: true; verdict: 'exact' | 'partial_allowed'; received: number }
  | { ok: false; verdict: 'underpaid'; received: number; missing: number }
  | { ok: false; verdict: 'overpaid'; received: number; extra: number };

/** Sổ cái "phía ngân hàng" của mock — tách khỏi OrderRecord để test đối soát. */
export interface MockBankRecord {
  id: string;
  order_code: string;
  va: string;
  amount: number;
  paid_amount: number;
  status: SePayOrderStatus;
  refund_status: string | null;
  created_at: string;
  expired_at: string | null;
  paid_at?: string | null;
  transactions: SePayTransactionRow[];
}

export type PipelineStepKey = 'receive' | 'code' | 'va' | 'filters';

export interface PipelineStep {
  key: PipelineStepKey;
  label: string;
  detail: string;
}

export interface DeliveryResult {
  ok: boolean;
  status: number;
  ms: number;
  body: string;
  url: string;
  attempt: number;
  curlCode?: number;
}

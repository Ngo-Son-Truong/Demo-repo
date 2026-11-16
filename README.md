# SePay Payment Demo · Node.js + TypeScript

Demo luồng **thanh toán chuyển khoản ngân hàng qua SePay** dựng theo tài liệu chính thức
[developer.sepay.vn](https://developer.sepay.vn/vi/tien-ich-khac/test-mode) — gồm **Webhook** (HMAC-SHA256)
và **SePay API v2** (tạo VA theo đơn hàng, đối soát giao dịch).

Chạy được **ngay lập tức không cần token**: mặc định `SEPAY_MODE=mock` giả lập sandbox SePay
ngay trong process, bao gồm cả nút *Mô phỏng giao dịch* của Test mode. Đổi một biến môi trường là
chuyển sang sandbox thật.

```bash
npm install
npm run dev            # http://localhost:3000  (build app.js cho browser trước, rồi chạy tsx watch)
```

```bash
npm test               # 28 kiểm tra end-to-end (webhook, chữ ký, chống trùng, đối soát…)
npm run typecheck      # tsc --noEmit cho cả server project lẫn web project
```

## Stack

| Lớp | Công nghệ |
| --- | --- |
| Ngôn ngữ | **TypeScript 7** (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `erasableSyntaxOnly`) |
| Runtime | Node.js ≥ 18.17 qua **tsx** (Node 22.18+ còn chạy thẳng `node src/server.ts` nhờ type stripping) |
| HTTP | Express 4 — dependency runtime **duy nhất**; `@types/express` chỉ là devDependency |
| Crypto / fs / fetch | `node:crypto`, `node:fs`, `fetch` built-in — không lib ngoài |
| Frontend | `web/app.ts` → `tsc` biên dịch ra `public/app.js` (ES module thuần, không bundler) |
| Store | `node:fs` ghi `data/state.json` |
| Kiểu dữ liệu | `src/types.ts` — shape payload webhook + API v2 chép theo doc |

Không có build step cho server: `tsx` strip type lúc chạy. `public/app.js` là output của
`npm run build:web` và đã nằm trong `.gitignore`.

---

## Luồng nghiệp vụ

```
Khách bấm "Thanh toán"
      │  POST /api/checkout (server tự tính tiền từ catalog)
      ▼
Server ──► POST /v2/bank-accounts/{ba_xid}/orders      ──► SePay tạo VA theo đơn hàng
      ◄── va_number (SBSEPAY…), qr_code_url, expired_at
      │
      ▼
UI hiện số TK + VA + số tiền + NỘI DUNG CK + VietQR, poll /api/orders/:code mỗi 2s
      │
      │   khách mở app ngân hàng và chuyển khoản
      ▼
SePay ──► POST /webhooks/sepay   (payload 12 trường, ký HMAC-SHA256)
      │        verify chữ ký → chống trùng bằng `id` → khớp VA/code → settle đơn
      ◄── 200 {"success": true}   ← SePay chỉ tính thành công khi đủ 3 điều kiện
      ▼
Đơn `pending` → `paid` (và nút "Đối soát" là đường dự phòng khi webhook trễ/mất)
```

## Ba chế độ

| `SEPAY_MODE` | Endpoint SePay | Dùng khi nào |
| --- | --- | --- |
| `mock` (mặc định) | giả lập trong process | xem UI, test logic, CI — không cần tài khoản |
| `sandbox` | `https://userapi-sandbox.sepay.vn` | tích hợp thật với **Test mode**: token, VA, webhook, giao dịch mô phỏng đều cách ly, không chạm tiền thật |
| `live` | `https://userapi.sepay.vn` | production — **tiền thật** |

Test mode khác Live ở mấy điểm (đều nằm trong doc): token riêng cho `userapi-sandbox`,
VA có tiền tố `SBSEPAY`, **tắt xác thực SSL** nên endpoint HTTP/self-signed vẫn nhận webhook
(thuận tiện test ở localhost), tối đa 500 giao dịch mô phỏng/ngày.

## Chạy với sandbox thật

```bash
cp .env.example .env
# 1. my.sepay.vn → bật Test mode (sidebar) → API Access → + Thêm API → copy token (chỉ hiện 1 lần)
#    → SEPAY_API_TOKEN=...
# 2. curl -X GET https://userapi-sandbox.sepay.vn/v2/bank-accounts \
#      -H "Authorization: Bearer $SEPAY_API_TOKEN"          → lấy UUID  → SEPAY_BANK_ACCOUNT_ID=...
# 3. Test mode → Webhook → Thêm webhook:
#      URL      = https://<tunnel-của-bạn>/webhooks/sepay    (ngrok / cloudflare tunnel)
#      Sự kiện  = Tiền vào          Định dạng = JSON
#      Bảo mật  = HMAC-SHA256, Secret Key = SEPAY_WEBHOOK_SECRET trong .env
# 4. Test mode → Tài khoản ngân hàng → tạo mới (tài khoản "sao chép từ Live" chỉ đọc)
#    Test mode → Giao dịch → Mô phỏng → xem webhook chạy thật
SEPAY_MODE=sandbox npx tsx --env-file=.env src/server.ts
```

Đổi `SEPAY_WEBHOOK_AUTH=apikey` nếu bạn chọn API Key trên dashboard (header `Authorization: Apikey <KEY>`),
hoặc `none` khi test nhanh — endpoint lúc đó ai cũng gọi được, đừng dùng ở production.

## Cấu trúc

```
tsconfig.json            server project (NodeNext, noEmit — tsx lo phần chạy)
tsconfig.web.json        web project (DOM, outDir = public/)
src/
  types.ts               ★ shape SePay: 12 trường payload, envelope, order/transaction…
  config.ts              env → mode mock|sandbox|live, hạn mức, bộ lọc
  catalog.ts             sản phẩm mẫu · định giá ở SERVER (client chỉ gửi {id, qty})
  store.ts               đơn hàng + log webhook, ghi chú UNIQUE theo id giao dịch
  sepay/payload.ts       normalizeWebhookPayload(): unknown → SePayWebhookPayload (type guard)
  sepay/signature.ts     HMAC-SHA256 "{timestamp}.{raw_body}", constant-time, ±5 phút
  sepay/matching.ts      khớp đơn subAccount → code → nội dung · bộ lọc · check số tiền
  sepay/client.ts        REST v2: tạo/hủy/chi tiết đơn, transactions (+ nhánh mock)
  sepay/mock.ts          giả lập sandbox + sổ cái "ngân hàng" độc lập (để test đối soát)
  sepay/sender.ts        [mock] phía SePay gửi webhook + retry Fibonacci 1,1,2,3,5,8,13
  routes/webhook.ts      ★ endpoint bạn cần cho production
  routes/checkout.ts     /api/checkout · /api/orders/:code · /cancel · /reconcile
  routes/simulator.ts    form "Mô phỏng giao dịch" + pipeline 4 bước
  server.ts              install middleware đúng thứ tự (raw trước json)
web/app.ts               UI (TS) → build ra public/app.js
scripts/smoke.ts         test end-to-end · scripts/send-webhook.ts  tự ký payload
docs/SEPAY.md            ánh chiếu demo ↔ từng trang doc, checklist production, bảng lỗi
```

## Ghi chú bảo mật (rút thẳng từ doc)

- **Token chỉ ở server.** Không đặt `Authorization: Bearer …` vào JS phía client/mobile app.
  Route public không bao giờ trả token; `GET /api/config` chỉ trả info ẩn danh.
- **`{"success": true}` là hợp đồng**, không phải `{"status":"ok"}`. 200 mà sai body vẫn bị tính
  là thất bại → SePay retry tới 8 lần trong ~33 phút.
- **Raw body để verify chữ ký.** Route webhook đăng ký `express.raw()` **trước** `express.json()`;
  parse rồi `JSON.stringify` lại sẽ làm lệch chữ ký (escape unicode, thứ tự key, khoảng trắng).
- **Body webhook là `unknown`, không phải `SePayWebhookPayload`.** `src/sepay/payload.ts` là chỗ
  duy nhất đọc field thô và validate; cast `as SePayWebhookPayload` ngay ở route là tự lừa mình.
- **Idempotent.** Cùng một `id` giao dịch có thể đến nhiều lần (retry, admin bấm *Phát lại*,
  nhiều webhook cùng trỏ một URL). Đặt UNIQUE + `INSERT IGNORE`, không thì cộng tiền hai lần.
- **Số tiền từ server.** SePay gửi tiền theo *nội dung chuyển khoản*, nên mã đơn là khóa khớp;
  VA theo đơn hàng giúp khớp chính xác mà không cần đọc nội dung.
- **Webhook không phải nguồn duy nhất.** Có webhook trễ/mất thì `POST /api/orders/:code/reconcile`
  (doc gợi ý polling `since_id` + `transaction_date_sort=asc`) mới là chỗ chốt đơn.

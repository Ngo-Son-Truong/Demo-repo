# Ghi chú tích hợp SePay — ánh chiếu demo ↔ tài liệu

Mỗi quyết định trong demo đều có nguồn. Bảng dưới tra nhanh từ code sang trang doc tương ứng.

| Trong demo | Doc gốc | Điểm cần nhớ |
| --- | --- | --- |
| `SEPAY_MODE=mock/sandbox/live`, hạn mức, `config.sim` | [Tổng quan Test mode](https://developer.sepay.vn/vi/tien-ich-khac/test-mode) | Test mode cách ly hoàn toàn: tài khoản, VA, webhook, API Access, giao dịch mô phỏng. Không có webhook Live nào nhận payload từ Test mode |
| `src/sepay/mock.js` sinh VA `SBSEPAY`+12 ký tự | [Tạo VA Test mode](https://developer.sepay.vn/vi/tien-ich-khac/test-mode/tao-va) | VA chính thức hỗ trợ ACB, BIDV, MBBank, VPBank (cá nhân/HKD), VietinBank (DN), OCB, MSB, Sacombank (cá nhân/HKD), KienLongBank. VCB/TPBank/VietinBank cá nhân dùng **TKP** (3 ký tự, khớp qua nội dung `TKP{mã}`) → `subAccount` sẽ mang mã định dạng đó |
| `SEPAY_API_TOKEN`, `config.sepay.apiBase` | [API Access Test mode](https://developer.sepay.vn/vi/tien-ich-khac/test-mode/api-access) | Token Test mode **chỉ** xác thực trên `userapi-sandbox.sepay.vn`; token Live không dùng ngược lại được. Tối đa 50 token, chỉ hiện đầy đủ 1 lần |
| `routes/simulator.js` (4 bước pipeline, lý do bỏ qua, quota 500/ngày, `referenceCode` mở đầu `SB`) | [Mô phỏng giao dịch](https://developer.sepay.vn/vi/tien-ich-khac/test-mode/mo-phong-giao-dich) | Tiền vào: `accumulated += amount`; tiền ra: `max(0, accumulated − amount)`. Số tiền 1.000 → 499.000.000. Bỏ trống nội dung → tự sinh `Giao dich sandbox` |
| `config.webhook.filters`, 3 chuỗi "lý do bỏ qua" | [Tạo webhook Test mode](https://developer.sepay.vn/vi/tien-ich-khac/test-mode/tao-webhook) | 3 bước (Cơ bản / Tài khoản / Bảo mật). Test mode **tắt xác thực SSL** → endpoint HTTP hoặc self-signed vẫn dùng được khi dev |
| `verifySignature()` + header `X-SePay-Signature` / `X-SePay-Timestamp` | [Xác thực webhook](https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc) | Chuỗi ký = `{timestamp}.{raw_body}`, HMAC-SHA256, hex. API Key: `Authorization: Apikey <KEY>`. Có cả OAuth 2.0 (client credentials) |
| `routes/webhook.js`: `{"success": true}`, raw body, dedupe theo `id` | [Tích hợp webhook](https://developer.sepay.vn/vi/sepay-webhooks/tich-hop-webhook) | Thành công = 200/201 **và** body `{"success": true}` **và** <30s. `code = null` khác `""` — dùng `=== null` nếu cần phân biệt |
| `sender.js` retry, `?forceFail` trong UI | [Xử lý lỗi](https://developer.sepay.vn/vi/sepay-webhooks/xu-ly-loi) | 1 lần đầu + 7 retry, chờ 1,1,2,3,5,8,13 phút (~33 phút), rồi mới đánh dấu Failed. Log mỗi lần gửi có `error_code` cURL (6 DNS, 7 refused, 28 timeout, 51/60 SSL) |
| `client.js` — các path `/v2/...` | [Bắt đầu nhanh API v2](https://developer.sepay.vn/vi/sepay-api/v2/bat-dau-nhanh), [Tạo đơn hàng](https://developer.sepay.vn/vi/sepay-api/v2/don-hang/tao-don-hang), [Chi tiết](https://developer.sepay.vn/vi/sepay-api/v2/don-hang/chi-tiet), [Hủy](https://developer.sepay.vn/vi/sepay-api/v2/don-hang/huy-don-hang), [Giao dịch](https://developer.sepay.vn/vi/sepay-api/v2/giao-dich/danh-sach) | Envelope `{status, data, meta}`; `Authorization: Bearer <token>` |

## Endpoint đã dùng

```http
GET    /v2/bank-accounts                          # lấy ba_xid (UUID tài khoản ngân hàng)
POST   /v2/bank-accounts/{ba_xid}/orders           # tạo VA theo đơn hàng → 201
GET    /v2/bank-accounts/{ba_xid}/orders/{order_xid}   # chi tiết đơn + mảng va[]
DELETE /v2/bank-accounts/{ba_xid}/orders/{order_xid}   # 204 body rỗng, chỉ hủy được Pending
GET    /v2/transactions?q=&since_id=&transfer_type=in  # đối soát / polling
```

`POST /orders` theo ngân hàng:

| Tham số | BIDV | Sacombank | Vietcombank | VietinBank | Shinhan |
| --- | --- | --- | --- | --- | --- |
| `tid` | – | – | **bắt buộc** (Terminal ID gốc, không phải UUID) | – | – |
| `va_prefix` | – | **bắt buộc** | – | – | không truyền |
| `amount` | tùy chọn | **bắt buộc**, chỉ nhận đúng | **bắt buộc**, chỉ nhận đúng | **bắt buộc**, nhận trả thiếu | **bắt buộc**, chỉ nhận đúng |
| `order_code` | 6–50 | 6–50 | **6–15** | 6–50 | **6–15** |

→ demo đặt `ALLOW_PARTIAL_PAYMENT=false`; bật `true` nếu dùng VietinBank (đơn sẽ ở `Partially` tới khi đủ tiền).

## Lỗi thường gặp (doc) và cách demo báo

| HTTP / `error_code` | Nghĩa | Demo xử lý |
| --- | --- | --- |
| `409 duplicate` | trùng `order_code` | mã đơn sinh tuần tự `DH1001…`, Va không trùng |
| `422 validation_error` | thiếu `amount`/`tid`/`va_prefix` | `resOnApiError` trả kèm `error_code` + body gốc để đọc |
| `422 invalid_tid_format` | gửi nhầm UUID SePay thay vì Terminal ID VCB | `SEPAY_VCB_TID` mô tả rõ "Terminal ID gốc" |
| `422 vietinbank_va_order_not_enabled` | chưa đăng ký dịch vụ thu hộ | hiện nguyên văn message trong toast |
| `403 vcb_cancel_not_allowed` | hóa đơn VCB đã trả/đã hủy | test case: hủy đơn `paid` → 409 |
| `503 vcb_connection_error` / `shinhan_connection_error` | tạm gián đoạn | `SePayError` giữ status để caller thử lại |

## Bẫy hay gặp khi test

- **Sandbox không gọi được localhost.** SePay Test mode tắt xác thực SSL và chấp nhận HTTP,
  nhưng vẫn cần URL từ ngoài Internet vào được → `ngrok http 3000` rồi đặt `PUBLIC_URL`
  (demo dùng `PUBLIC_URL` để dựng URL webhook hiển thị trong UI).
- **Trả 200 mà không phải `{"success": true}`** → SePay vẫn retry. Endpoint trả `{"status":"ok"}`
  trông rất ổn nhưng thất bại.
- **Verify trên body đã parse** → chữ ký không khớp. Demo đăng ký route webhook
  *trước* `express.json()` để giữ raw bytes.
- **Webhook tới trước khi đơn hàng入库.** Hy hữu nếu tạo đơn và nhận tiền gần như đồng thời;
  xử lý: nếu không khớp đơn, vẫn trả `success:true` và ghi `unmatched` để đối soát sau
  (demo log `kind: 'unmatched'`).
- **VA quá hạn vẫn nhận tiền.** Tiền vào tài khoản thật, có webhook, nhưng đơn không tự đóng →
  đối soát thủ công. Demo: `secondsLeft` về 0 → UI hiện `expired`, `reconcile` vẫn tìm thấy tiền.
- **Quên cấu hình "Cấu trúc mã thanh toán".** Không có tiền tố `DH` ở
  *Công ty → Cấu hình chung* thì trường `code` luôn `null`, và nếu webhook bật
  "Chỉ gửi khi có mã thanh toán" thì **không có webhook nào được gửi**. Demo tái hiện đúng
  hành vi này ở bước *Bộ lọc giao dịch* trong panel Mô phỏng.

## Checklist trước khi lên Live

- [ ] Endpoint HTTPS chứng chỉ hợp lệ (Live **bắt buộc**, Test mode mới được tắt SSL)
- [ ] `SEPAY_WEBHOOK_AUTH=hmac`, Secret Key tạo ngẫu nhiên, chỉ nằm trong env; `SEPAY_MODE=live`
- [ ] Collider UNIQUE trên `sepay_transaction_id` (`INSERT IGNORE`) — xem `src/store.js`
- [ ] Trả `200 {"success": true}` <30s, đẩy việc nặng sang queue
- [ ] Whitelist [IP SePay](https://developer.sepay.vn/vi/dia-chi-ip) ở firewall/WAF (nếu 403)
- [ ] Job đối soát `GET /v2/transactions?since_id=…&transaction_date_sort=asc` chạy đều
      (webhook chỉ là thông báo, không phải hóa đơn)
- [ ] Theo dõi webhook `Failed` + alert; bật "Tự động gửi lại khi server trả lỗi"
- [ ] Bật filter "Dùng để xác thực thanh toán" → "Chỉ gửi khi có mã thanh toán" để lọc nhiễu
- [ ] Test tiền vào **thừa/thiếu** và test replay trước khi bật traffic thật
- [ ] Cân nhắc package chính thức [sepayvn/laravel-sepay](https://github.com/sepayvn/laravel-sepay) nếu ở Laravel

## Tài liệu tham khảo thêm

- Hạn mức Test mode (số tài khoản, VA/tài khoản=100, webhook=50, API Access=50, mô phỏng=500/ngày): [Hạn mức](https://developer.sepay.vn/vi/tien-ich-khac/test-mode/han-muc)
- So sánh Test mode vs Live: [So sánh](https://developer.sepay.vn/vi/sepay-webhooks/test-mode/so-sanh-voi-live)
- Bảo mật webhook (HTTPS, whitelist IP, chống replay): [Bảo mật](https://developer.sepay.vn/vi/sepay-webhooks/bao-mat)
- Ví dụ production Express + mysql2: [Lập trình webhook Node.js](https://developer.sepay.vn/vi/sepay-webhooks/lap-trinh-webhooks/lap-trinh-webhook-nodejs)

# Cập nhật nội dung OTA

Mục tiêu: đổi cây trồng, công trình, giá cả, bản đồ, lộ trình chơi và chữ hiển thị
**mà không cần người chơi cài lại gì**, đồng thời **không bao giờ** làm hỏng game
của họ.

## Năm nguyên tắc

1. **Không bao giờ chặn.** Game luôn khởi động bằng content đóng kèm hoặc content đã
   cache. Việc hỏi thăm bản mới chạy ngầm; mạng hỏng thì im lặng bỏ qua.
2. **Chỉ dữ liệu, không bao giờ là code.** Không `eval`, không import động, không
   `<script>`. Pack chỉ là JSON và phải qua schema mới được dùng. Đây cũng là ranh
   giới bảo mật.
3. **Cổng semver.** Pack khai `requiresCore`; core chỉ nhận khi phiên bản của mình
   thoả dải đó. Chốt chặn quan trọng nhất — ngăn content mới làm chết core cũ.
4. **Áp dụng ở lần khởi động sau.** Không đổi luật chơi giữa lúc đang chơi dở.
5. **Luôn có đường lui.** `Esc` → *Hoàn tác về bản đóng kèm*.

## Bật lên

Mặc định **tắt**: `CONTENT_URL = ""` trong `src/main.ts`. Đặt nó thành gốc URL nơi
bạn host, ví dụ `https://oni-farm.pages.dev`.

Đẩy nội dung mới:

```bash
# 1. sửa file trong src/content/ và TĂNG contentVersion trong manifest.json
# 2. build — bước này kiểm tra rồi mới đóng gói
npm run content:build
# 3. deploy thư mục public/content/ (hoặc cả dist/) lên host tĩnh
```

`scripts/build-content.mjs` xuất ra:

```
public/content/latest.json          ← con trỏ client hỏi thăm
public/content/<version>/manifest.json   ← kèm checksum từng file
public/content/<version>/*.json
```

## Client làm gì

```
khởi động
   ├─ resolveContent()
   │     ├─ có pack đã cache?  → kiểm LẠI requiresCore + schema từ đầu
   │     │      (core có thể đã nâng cấp kể từ lúc tải; pack từng hợp lệ
   │     │       vẫn có thể trở nên không tương thích)
   │     │      hỏng → xoá cache, quay về pack đóng kèm + báo toast
   │     └─ không  → pack đóng kèm
   └─ game chạy (không chờ mạng)

nền: checkForUpdate()
   ├─ latest.json → có bản mới hơn không?
   ├─ manifest → CỔNG requiresCore  ← kiểm TRƯỚC khi tải phần còn lại
   ├─ tải từng file, ghi đè lên pack đóng kèm
   │     (pack thiếu file nào thì file đó vẫn dùng bản đóng kèm — không thủng lỗ)
   ├─ validatePack() → hỏng thì VỨT, không cache
   └─ cache lại → áp dụng ở lần mở game sau
```

## Save khi content đổi

Save mang cả `coreVersion` lẫn `contentVersion`. Lúc nạp, `migrateForContent()`:

- cây/công trình mà content mới **không còn** → gỡ bỏ an toàn, ghi chú, **không ném lỗi**
- `inventorySlots` đổi → chuẩn hoá lại túi đồ
- `sel`, `energy` bị kẹp về khoảng hợp lệ

`npm run test:sim` có riêng một kịch bản cho việc này (gỡ `pumpkin` rồi nạp save
đang trồng bí đỏ).

## Đổi định dạng save

Đó là **làn chậm**: tăng `SAVE_VERSION` trong `src/core/version.ts` và thêm một bước
trong `migrateSave()` (`src/core/save.ts`). Save từ bản mới hơn sẽ bị từ chối thay vì
đọc bừa.

## Kiểm tra

`npm run test:ota` kiểm chính cái cổng: dải semver, pack sai schema, pack sai
`requiresCore`, và các sửa đổi hợp lệ phải được chấp nhận.

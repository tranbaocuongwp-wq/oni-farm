# OniFarm — theo dõi tiến độ

Bảng này nằm TRONG mã và được cập nhật trong chính commit của mỗi đợt, nên nó
không bao giờ trôi khỏi thứ nó mô tả. Đọc từ dưới lên là đọc lịch sử; đọc phần
cuối là biết còn gì phải làm.

**Chơi ngay:** <https://oni-farm.pages.dev/farm/>

Spec: [`LOI-CHOI.md`](LOI-CHOI.md) (luật chơi) · [`KIEN-TRUC.md`](KIEN-TRUC.md)
(công nghệ) · [`GIAI-THUAT.md`](GIAI-THUAT.md) (giải thuật & số đo).
Vận hành: [`CONTENT.md`](CONTENT.md) · [`OTA.md`](OTA.md) ·
[`DEPLOY.md`](DEPLOY.md) · [`MOBILE-UX.md`](MOBILE-UX.md).

## Luật của mỗi đợt

1. `npm run test:all` (sim + OTA) và `npm run build` sạch trước khi commit.
2. Mọi kịch bản mới phải **cấy lại lỗi** và thấy đúng nó đỏ — một kịch bản không
   bao giờ đỏ được là một kịch bản không kiểm gì cả.
3. Kiểm trên trình duyệt thật (Playwright, 430×932 và 1000×700) cho mọi thay đổi
   giao diện hoặc hành vi nhìn thấy được.
4. Lên mạng xong thì poll asset của Cloudflare tới khi nó trả về JavaScript thật,
   rồi `cmp` từng byte với `dist/`.
5. Đợt nào đụng tới tốc độ thì **đo trước, sửa sau**: `npm run bench` in bảng chi
   phí phần mô phỏng trên một cảnh nặng dựng theo hạt cố định. Sửa mà bảng không
   nhúc nhích thì gỡ bản sửa ra và ghi lại là đã thử — xem Đợt 15.

## Đã lên mạng

| Đợt | Core | Content | Nội dung | Kịch bản mới | Đột biến đã cấy |
|---|---|---|---|---|---|
| 15 | 1.41.1 | 1.42.0 | A* nhanh gấp 2,9 lần (1,338 → 0,468 ms: mảng định kiểu dùng lại + ghi nhớ tính chất ô trong mỗi lần tìm); `npm run bench` đo lại được; cá thôi bị thả xuống mặt đường ở hai nhánh dự phòng, và bán kính tìm ao phủ hết bản đồ; ba chỗ HUD lệch ở khổ hẹp (nút ☰ chui xuống thanh số liệu ở chế độ kbm, nút ☰ neo lệch gốc, icon dự báo rớt khỏi ô lưới thành một chấm lơ lửng); **bản đồ nhỏ thôi vẽ lại cả 1.776 ô mỗi khung** — 1.786 → 45 lệnh `fillRect`, tổng lệnh vẽ 3.007 → 1.265 mỗi khung (−58%) | 137–139 | 12 |
| 14 | 1.40.0 | 1.42.0 | Máng là một BỂ ĐIỂM (món nào cũng đổ, trộn chung, giá cao no lâu, trần 60, `SAVE_VERSION` 10); chó đi tuần thật và tối thì về nhà nằm; Chợ và Quầy thu mua tách ra hai đầu nông trại; đứng trong chuồng thì nút phụ mở BẢNG KHU; bảng khu vẽ lại (thanh mức + "còn ~N ngày", từng con bấm được, đổ máng không cần cầm sẵn) | 133–136 | 5 |
| 13 | 1.39.0 | 1.41.0 | Người làm tự lo mọi việc (cày, gieo, tưới, thu, chữa, đổ máng, rảnh thì kiếm gỗ đá); `doWork` chạy đúng việc được giao; phối hợp không giẫm chân; menu cửa hàng đồng bộ | 129–132 | 9 |
| 12 | 1.38.0 | 1.41.0 | Thức ăn chỉ vào bằng máng hoặc rắc hồ (bỏ cho ăn trực tiếp); nhà cho chó; người làm đổ máng lấy cám từ kho | 127–128 + 69(d) | 3 |
| 11 | 1.37.0 | 1.40.0 | Con vật hết đứng đói cả ngày sau khi ngủ; một lúc chỉ một chế độ điều khiển | 123–126 | 8 |
| 10 | 1.36.0 | 1.40.0 | Camera bám lại nhân vật; nút chính thành CHUYẾN của món đang cầm | 119–122 | 6 |
| 9 | 1.35.0 | 1.40.0 | Hiệu năng đo thật: lớp bão hoà, cache `inZone`, túi A* chung | 116–118 | 3 |
| 8 | 1.34.0 | 1.40.0 | Chiều sâu nội dung: thưởng nấc, chế biến, ăn hồi sức, nhật ký | 110–115 | 6 |
| 7 | 1.33.0 | 1.39.0 | Mở khoá thứ đã viết sẵn: mổ thịt, mục tiêu gần nhất, lý do từ chối | 106–109 | 4 |
| 6 | 1.32.0 | 1.39.0 | Chống hỏng: vòng lặp bọc lỗi, sao lưu save, CI | 103–105 | 3 |

## Còn lại

Theo thứ tự Cường chốt. Mỗi đợt đã khảo sát xong, sẽ chi tiết hoá ngay trước khi
bắt tay.

- **Đợt 16 · Bỏ hệ nhiệm vụ · sổ tay khám phá.** Tiền là cổng duy nhất của cả
  game nên gỡ được sạch; `discovered` ghi ở một chỗ duy nhất trong `commit()`.
  (Vốn là Đợt 15; Cường chuyển Đợt 15 sang tối ưu hiệu năng, nên cả danh sách
  dời xuống một bậc.)
- **Đợt 17 · Bản đồ cao gấp đôi · sông · cầu và bè · giãn công trình.** Nối thêm
  xuống dưới để save cũ không mất gì; cơ chế cầu đã có sẵn.
- **Đợt 18 · Mua bán bằng xe thật.** Trả tiền lúc đặt, xe đậu rồi tự bốc vào kho.
  Xe vẽ to hai ô, có người bốc xếp.
- **Đợt 19 · Diễn hoạt.** Cửa rộng và cao, đi vào là chuyển bản đồ luôn; giường;
  khung riêng cho từng việc.
- **Đợt 20 · Hệ sinh thái rừng.** Thú hoang, cỏ cây, dương xỉ.
- **Đợt 21 · Mỏ quặng hiếm** xuất hiện theo xác suất mỗi đêm.

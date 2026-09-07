# OniFarm — theo dõi tiến độ

Bảng này nằm TRONG mã và được cập nhật trong chính commit của mỗi đợt, nên nó
không bao giờ trôi khỏi thứ nó mô tả. Đọc từ dưới lên là đọc lịch sử; đọc phần
cuối là biết còn gì phải làm.

**Chơi ngay:** <https://oni-farm.pages.dev/farm/>

## Luật của mỗi đợt

1. `npm run test:all` (sim + OTA) và `npm run build` sạch trước khi commit.
2. Mọi kịch bản mới phải **cấy lại lỗi** và thấy đúng nó đỏ — một kịch bản không
   bao giờ đỏ được là một kịch bản không kiểm gì cả.
3. Kiểm trên trình duyệt thật (Playwright, 430×932 và 1000×700) cho mọi thay đổi
   giao diện hoặc hành vi nhìn thấy được.
4. Lên mạng xong thì poll asset của Cloudflare tới khi nó trả về JavaScript thật,
   rồi `cmp` từng byte với `dist/`.

## Đã lên mạng

| Đợt | Core | Content | Nội dung | Kịch bản mới | Đột biến đã cấy |
|---|---|---|---|---|---|
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

- **Đợt 14 · Thức ăn tính bằng ĐIỂM, chó biết tuần tra, tách hai cái quầy.**
  Máng đếm điểm thay vì phần, món nào cũng đổ được và đổ chung được, giá càng cao
  no càng lâu, trần máng 12 → 60. Chó đi tuần thật và tự về nhà khi đói hoặc khi
  tối. Chợ và Quầy thu mua tách ra hai đầu nông trại. Gần chuồng thì nút XEM ưu
  tiên BẢNG KHU. Bảng khu vẽ lại cho dễ nhìn.
- **Đợt 15 · Bỏ hệ nhiệm vụ · sổ tay khám phá.** Tiền là cổng duy nhất của cả
  game nên gỡ được sạch; `discovered` ghi ở một chỗ duy nhất trong `commit()`.
- **Đợt 16 · Bản đồ cao gấp đôi · sông · cầu và bè · giãn công trình.** Nối thêm
  xuống dưới để save cũ không mất gì; cơ chế cầu đã có sẵn.
- **Đợt 17 · Mua bán bằng xe thật.** Trả tiền lúc đặt, xe đậu rồi tự bốc vào kho.
  Xe vẽ to hai ô, có người bốc xếp.
- **Đợt 18 · Diễn hoạt.** Cửa rộng và cao, đi vào là chuyển bản đồ luôn; giường;
  khung riêng cho từng việc.
- **Đợt 19 · Hệ sinh thái rừng.** Thú hoang, cỏ cây, dương xỉ.
- **Đợt 20 · Mỏ quặng hiếm** xuất hiện theo xác suất mỗi đêm.

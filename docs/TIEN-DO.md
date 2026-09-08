# OniFarm — theo dõi tiến độ

Bảng này nằm TRONG mã và được cập nhật trong chính commit của mỗi đợt, nên nó
không bao giờ trôi khỏi thứ nó mô tả. Đọc từ dưới lên là đọc lịch sử; đọc phần
cuối là biết còn gì phải làm.

**Chơi ngay:** <https://oni-farm.pages.dev/farm/>

Spec: [`LOI-CHOI.md`](LOI-CHOI.md) (luật chơi) · [`KIEN-TRUC.md`](KIEN-TRUC.md)
(công nghệ) · [`GIAI-THUAT.md`](GIAI-THUAT.md) (giải thuật & số đo) ·
[`NHAN-DIEN.md`](NHAN-DIEN.md) (logo, màu, trang tĩnh).
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
| 26 | 1.53.0 | 1.53.0 | **NÔNG TRẠI CÓ THỨ ĐỂ NHÌN, VÀ SITE THÀNH MỘT CÁI WIKI.** **Cửa mở ra** khi có người tới gần — nhà, kho, cửa ra: vật thể nay có `frames` kiểu hình dựng LƯỜI, và cánh cửa nhà là một LỚP PHỦ chứ không phải bộ ô nhà thứ hai (32 biến thể tự nối × 10 kiểu = 320 hình dựng lúc mở game cho một thứ chỉ hiện khi đứng sát cửa). **Mười một loại đá và mười bốn thứ gỗ chết** — khác nhau ở bóng dáng VÀ ở việc chúng làm, không phải ở bảng màu. **Mười bốn món đồ trong nhà** (bàn ghế, bếp, kệ sách, sofa) — trong nhà từng là mười bốn ô ván sàn với đúng một cái giường. **Mười tám khung hình cho người**: bê đồ, mệt lả, ngồi nghỉ, vẫy tay, nói chuyện, ngồi xổm, nghiêng bình, quệt mồ hôi… — bốn việc ấy trước dùng chung MỘT khung đứng, nên người làm đứng như tượng. **Bỏ Nhật ký nông trại** theo yêu cầu, và chip mục tiêu thôi làm nút. **Site thành WIKI**: bỏ bốn trang giới thiệu (chúng nói VỀ game cho người chưa chơi), thêm trang Vật phẩm với MỘT TRANG CHI TIẾT CHO MỖI MÓN, thêm trang Tác giả — TRẦN CƯỜNG. Rồi Cường chỉ tiếp: **trang NHÂN VẬT còn thiếu hẳn** — wiki tra được cây, con, đồ, nhà, đất, trời mà bỏ trống đúng cái thứ người chơi điều khiển suốt buổi; nay `player:<hướng>:<khung>` và `worker:<đồ>:<hướng>:<khung>` là khoá sprite hợp lệ, và bảng 18 tư thế ĐỌC TỪ chú thích của các hằng `PF_` trong atlas.ts nên thêm khung thứ 19 mà quên tả là build đỏ. **Hình minh hoạ cho mọi trang còn trống**: trang chủ trước đó chỉ hai trong mười thẻ có hình (Công trình — đúng chỗ người ta vào tìm cái nhà — là một khung rỗng), Lối chơi và Tác giả thì không có lấy một hình. **Nhà cửa lên trang Công trình**: nhà · kho · chợ · quầy · giếng nằm ở `props` chứ không ở `buildings` (đúng về luật chơi: `buildings` chỉ chứa thứ người chơi TỰ XÂY), nhưng người tra cứu không nghĩ như thế. **Bảng rộng cuộn trong khung của nó**: trang Vật phẩm đang đẩy lệch cả trang trên màn 320px mà build vẫn xanh — nay `write()` soát mọi `<table>` phải nằm trong `.table-wrap`, và tiêu đề cột không xuống dòng | — | — |
| 25 | 1.52.0 | 1.52.0 | **VẼ LẠI NGƯỜI, THÚ, TÀU, CÂY RỪNG — VÀ CHO NƯỚC CHẢY THẬT.** Cường xem bản HD rồi chỉ từng chỗ một, và mỗi chỗ hoá ra là một lỗi kiến trúc chứ không phải chuyện nét vẽ. **Con trỏ ô to gấp đôi**: ba lệnh `g.drawImage` ba tham số còn sót khi chuyển sang HD — kịch bản 164 nay quét chính draw.ts để chặn dạng gọi ấy, vì nó đã lọt bốn lần trong một đợt. **Vật nuôi**: mọi con bốn chân từng dựng bằng cùng một quả trứng rồi phân biệt bằng vài cờ rời; nay mỗi loài một HỒ SƠ HÌNH (đường lưng và đường bụng là HÀM theo dọc thân) nên bò lưng thẳng ngực sâu, heo thùng tròn bụng sệ, chó ngực nở bụng thóp, cừu là đám mây có bốn que. **Mười tám tư thế** mỗi con (bảng tham số, không phải 720 bức vẽ), con vật rảnh tự đổi việc theo hàm băm — không thêm một byte nào vào save. **Nước**: hồ, suối, biển và thác là bốn thứ khác nhau, lớp vẽ tự suy ra loại từ hình dạng vùng nước (biển = vùng nối với cổng biển, do content nói ra); mặt nước thành MẢNG LẶP 64×64 nên vệt nước chảy xuyên qua ranh giới ô và hết lưới ô vuông. Suối chảy từ ngoài bản đồ vào hồ cá qua một ghềnh đá rêu. **Thuyền** vẽ lại đúng GÓC NHÌN TỪ TRÊN: buồm là cánh cung phồng dọc thân, không phải tam giác dựng đứng. **Bảy loài cây rừng** rải theo vùng, và cây cao nay UỐN theo gió bốn lát thay vì trượt nguyên khối | 164–165 | 7 |
| 24 | 1.51.0 | 1.51.0 | **HD PIXEL ART, VÀ SÁU MƯƠI MỐT CÂY THÔI GIỐNG NHAU.** Hệ số nghệ thuật `ART = 2` tách hai vai của `TILE`: một ô vẫn là 16 đơn vị THẾ GIỚI (save không đổi, `SAVE_VERSION` giữ 10) nhưng sprite của nó rộng 32 PIXEL. Trên màn hình kích thước không đổi một pixel, mật độ chi tiết gấp bốn — đo trước khi làm: hệ số phóng đang là 4, tức mỗi pixel bị thổi thành ô vuông 4×4, và đó chính là chỗ hình trông thô. HD gần như MIỄN PHÍ lúc chạy (cùng ngần ấy pixel đích), giá là bộ nhớ 0,59 → 2,35 MB và công vẽ lại. `pickScale` nay kẹp về BỘI của ART: sprite 32px vẽ ở hệ số lẻ thì pixel méo và HD sẽ xấu hơn bản cũ. **Gỡ ba bản sao của `TILE`** (atlas · world · camera, không cái nào import cái nào, không kịch bản nào kiểm) — `main.ts` và `draw.ts` từng lấy CỠ ẢNH làm ĐƠN VỊ THẾ GIỚI, và đúng đợt này hai vai tách ra. **Cây trồng vẽ lại từ đầu** theo phản hồi của Cường ("toàn mấy cây giống nhau… khó phân biệt"): thêm ba tham số content `fruitShape` · `pattern` · `leafShape`, nên quả có DÁNG (thon, nhọn, múi, bắp, trái đậu, chùm) và có MẶT NGOÀI (sọc dưa hấu, múi bí đỏ, vân lưới dưa lưới, đốm). Bông lúa trĩu cong hẳn xuống, quả trên giàn treo hẳn xuống, trái đậu chìa khỏi mép tán, búp trà một tôm hai lá. Biểu tượng trong túi đồ cũng theo dáng ấy thay vì 61 cái đĩa tròn. **Bộ đếm lệnh vẽ** (`renderer.stats()`, chỉ DEV) — thứ `KIEN-TRUC.md` muốn từ lâu mà chưa ai viết. Sửa một lỗi lệch NỬA Ô do chính đợt này gây ra: `drawActors` còn dùng `img.width` (pixel ảnh) làm đơn vị thế giới | 161–163 | 7 |
| 23 | 1.50.0 | 1.50.0 | **LỚP VẼ NHANH GẤP BA, RỒI TIÊU CHỖ TRỐNG ẤY VÀO ĐỒ HOẠ.** Đo trước: phần mô phỏng chỉ tốn 0,2% ngân sách một khung — không còn gì để lấy; tiền nằm ở lớp vẽ. **Nền được cache** vào canvas phụ (quá nửa số lệnh vẽ mà gần như không đổi giữa các khung), vô hiệu hoá bằng phép so THAM CHIẾU `s.tiles` — copy-on-write nên một ô đổi là cả mảng đổi; mặt nước và bọt sóng nằm ngoài cache vì chúng động. **Mưa thành một mảng lặp**: 110 lệnh vẽ mỗi khung → một `fillRect`, và rơi mượt thật thay vì nhảy cóc mười lần mỗi giây. 600 → 149 lệnh, 0,90 → 0,30 ms. Rồi tiêu chỗ trống: **cây cỏ đổi màu theo mùa** (`prop.seasonal`, content quyết — xuân lá non, thu vàng cam, đông bạc đi; khác lớp phủ toàn màn ở chỗ nó là trạng thái của TỪNG VẬT), **khói bếp** một nhà một ống, **bướm ban ngày và đom đóm ban đêm** (trang trí thuần, không một thực thể nào vào save). Với gần gấp đôi thực thể vẫn còn rẻ hơn hẳn mốc cũ | 159–160 | 3 |
| 22 | 1.49.0 | 1.49.0 | **MỘT BỘ NÃO cho cả người làm lẫn nút TỰ ĐỘNG**: `CROP_ORDER` là hằng thứ tự dùng chung (`joborder.ts`) — hai bên đã trôi khỏi nhau đúng như tài liệu cảnh báo, nút tự động gieo trước tưới còn người làm tưới trước gieo; và một chuỗi `else if` khiến người làm **không bao giờ gieo được trên luống khô** trong khi người chơi thì gieo được. **DỌN CỎ trong lô** (`clear`, một `UseKind` thật): lô bỏ bê xưa nay là lô chết vĩnh viễn vì không ai được phép nhổ cỏ mọc lan; lằn ranh rút từ content (nhổ tay không + tự mọc qua đêm + trong lô) loại đúng hòn đá và khúc gỗ người chơi đặt. **ĐÒI VẬT TƯ, không tiêu tiền** (`worker.want`, trường tuỳ chọn nên `SAVE_VERSION` giữ 10): bong bóng trên đầu + dòng trên thẻ + chip HUD, báo một lần mỗi món; nút tự động cũng nói "hết hạt" thay vì tắt lặng lẽ. **VIỆC VẶT thay cho đứng đực**: đi tuần, nói chuyện, vuốt ve, bốc xếp — ba việc xã giao không tốn một lần tìm đường nào, đi tuần chịu nguội gấp bốn để không giành nhịp của đàn bò. **DIỄN HOẠT**: người làm dùng hai khung giơ/chạm đã dựng sẵn ba đợt mà chưa ai gọi, cầm đúng đồ nghề theo việc, đội đồ đang vác trên đầu, bắn hạt khi nhát chạm đất. Trời mưa thì thôi đi tưới | 148–158 | 14 |
| 21 | 1.48.0 | 1.48.0 | **NÚT NGỮ CẢNH MỘT NGUỒN**: `pressPlan` (hint.ts) quyết định cú bấm, `hintOf` in nhãn từ chính nó — hết cảnh nhãn "ĐỔ MÁNG"/"THU"/"NGỦ" mà bấm lắc đầu; `main.ts` xoá bộ luật riêng (`nearbyInteract`, `actOnTile`); một ô ngắm, một tầm với, một bán kính con vật; nút phụ biết người làm; dấu ô đích trên bản đồ; dòng "Cách N ô". **THỜI TIẾT CÓ HÀNH VI** (content `speedMul`/`shelter`/`halt`): mưa bão làm chậm mọi thứ ngoài trời, vật nuôi trú (đói vẫn ăn khi mưa, bão thì không), người làm về đứng trước kho, xe thu mua và thuyền không ghé ngày bão; cây/bụi/cỏ lay theo `wind`, mưa nghiêng, lá bay, vũng nước, giọt bắn dưới chân, bò co ro. **CẦU CÓ LAN CAN** theo cạnh giáp nước (lan can dưới vẽ đè lên người), **XE 32×32** hai khung bánh, thuyền có buồm nhấp nhô | 146–147 | 9 |
| 20 | 1.47.0 | 1.47.0 | **THUYỀN BUÔN**: ghé bến biển ba ngày một lần, bán gỗ/đá/sợi cỏ — thứ cửa hàng trên bờ không bao giờ có. Dùng chung bộ máy với xe tải, khác đúng một cờ `sea`; kéo theo bốn chỗ từng ngầm định "xe chạy trên cạn" (sinh ở cổng nào, đi bằng luật nào, hộp va chạm hỏi luật nào, bất biến hiểu nước là gì) | 145 | 5 |
| 19 | 1.46.0 | 1.46.0 | Xe vào từ cổng ở mép PHẢI, vòng qua rừng Nam và **qua sông** rồi mới lên kho (80 bước); tách CẦU ĐƯỜNG (xe chạy được) khỏi cầu tàu đi bộ; bất biến thôi chặn xe ở trần đường đi của con vật | 144 | 3 |
| 18 | 1.45.0 | 1.45.0 | Cổng ra MÉP PHẢI bản đồ — xe thôi hiện ra giữa đồng (Đợt 17 nối đất xuống dưới làm cổng cũ thành ra giữa bản đồ); biển hiệu gắn thẳng lên mặt tiền công trình lớn thay cho tấm ván cắm bên cạnh; sông có bốn lối qua thay vì một; gỡ một khối kiểm biển bị **lặp nguyên văn** trong `validatePack` | 143 | 3 |
| 17 | 1.44.0 | 1.44.0 | **Bản đồ cao gấp đôi**: 48×37 → 48×73, nối thêm xuống DƯỚI nên save cũ giữ nguyên từng ô; sông cắt ngang có cầu gỗ; đất mới để giãn công trình; rừng Nam là khu chặt được thật; biển và cầu tàu ở đáy bản đồ | 142 | 4 |
| 16 | 1.43.0 | 1.43.0 | Hồ cá gọi đúng tên nút (không còn "ĐỔ MÁNG" trước một mặt hồ không có máng); người làm tự lấy cám từ kho đem ra rắc cho cá; `pourFromStore` lọc theo `pen.feeds` | 141 | 3 |
| 15 | 1.42.0 | 1.43.0 | A* nhanh gấp 2,9 lần (1,338 → 0,468 ms: mảng định kiểu dùng lại + ghi nhớ tính chất ô trong mỗi lần tìm); `npm run bench` đo lại được; cá thôi bị thả xuống mặt đường ở hai nhánh dự phòng, và bán kính tìm ao phủ hết bản đồ; ba chỗ HUD lệch ở khổ hẹp (nút ☰ chui xuống thanh số liệu ở chế độ kbm, nút ☰ neo lệch gốc, icon dự báo rớt khỏi ô lưới thành một chấm lơ lửng); **bản đồ nhỏ thôi vẽ lại cả 1.776 ô mỗi khung** — 1.786 → 45 lệnh `fillRect`, tổng lệnh vẽ 3.007 → 1.265 mỗi khung (−58%); logo thành CÂY + cả site lần đầu có favicon; viết lại toàn bộ trang tĩnh (một khuôn duy nhất, trang Luật chơi, bộ nhận diện, sáu chỗ nói sai luật, bốn bảng gõ tay thành sinh từ content); trang tĩnh thôi bị service worker giữ ở bản cũ; **chợ và quầy thành công trình NHIỀU Ô** (`prop.block`) | 137–140 | 21 |
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

- **Sáu lô sprite còn lại của HD.** Đợt 24 dựng xong hạ tầng `ART = 2` và vẽ lại
  trọn bộ cây trồng (lô đông việc nhất, và là thứ Cường chỉ đích danh). Sáu lô
  còn lại vẫn đang chạy ở nét cũ — trông y như trước, vì `px` tô khối `ART × ART`
  và `outline` mặc định dày `ART`: **nền** (cỏ · lối đi · nhựa · bê tông · đất
  cày · nước · bờ · ván, phủ 100% màn hình và đã nằm trong cache nền) · **nhân
  vật và người làm** (28 khung, dùng chung bộ `skins`) · **cây · bụi · cỏ** (mỗi
  hàm nhân bốn bảng màu mùa của Đợt 23) · **công trình** · **vật nuôi** · **icon
  HUD và công cụ**. Mỗi lô một commit, mỗi lô xem trình duyệt. Cảnh giác một chỗ:
  21 vòng `mulberry32` rải chi tiết bằng số vòng lặp CỨNG — giữ nguyên số vòng
  trên diện tích gấp bốn thì mật độ loãng đi bốn lần, và "HD mà trông trống trải
  hơn" là kết quả tệ nhất có thể vì nó đúng kỹ thuật mà sai mục đích.
- **Cắt phần vẽ ngoài khung nhìn.** `drawActors` duyệt toàn bộ `s.entities` và
  chỉ lọc theo bản đồ; đo được 0,094 ms (15%) ở ca xấu nhất, ~0% khi đứng cạnh
  chuồng. Đáng làm thành một commit riêng để đo A/B sạch, và gỡ bỏ nếu trung
  tính — tiền lệ Đợt 15. KHÔNG cắt phần MÔ PHỎNG: xe đi từ cổng ở rìa bản đồ
  vào, chó bắt sâu, người làm cày ở lô bên kia, con vật đói đi ăn.
- **Người chơi kẹt trong ô solid.** Mở game với bản lưu cũ thì console in hàng
  trăm lần "người chơi nằm trong ô solid tại (20.50, 60.50)", và sau đủ số lỗi
  liên tiếp thì vòng lặp tự dừng theo `MAX_CONSECUTIVE_ERRORS` — cả màn hình thế
  giới thành đen trong khi HUD vẫn còn. Ván MỚI không dính. Giả thuyết đáng thử
  trước: cây con mọc qua đêm (`propsMocDuoc`) mọc lên đúng ô người chơi đang
  đứng. Tìm ra khi kiểm trình duyệt cho Đợt 24, chưa sửa.
- **Khách ghé thăm.** Cường: "đôi lúc sẽ có vài người liên lạc hỏi thăm" — NPC
  ghé nông trại, có lời thoại. Chưa khảo sát.
- **Người làm đi về chỗ nghỉ.** Nghỉ mệt 90 phút game (~45 giây thật) là cái đứng
  im dài nhất còn lại; Đợt 22 mới thêm bong bóng, chưa cho họ đi về cạnh kho —
  việc đó đổi VỊ TRÍ lúc nghỉ nên kéo theo bốn kịch bản, để một đợt riêng.
- **Tiếng cho người làm.** Cố ý chưa làm: ba người mỗi người một nhát mỗi 1,5
  phút game sẽ thành xưởng rèn, và tiếng "cuốc" vốn là phản hồi cho cú bấm của
  NGƯỜI CHƠI. Nếu làm thì phải có hai cổng: trong ~6 ô quanh nhân vật, và tối đa
  một tiếng mỗi giây thật.
- **Đợt 18 · Bỏ hệ nhiệm vụ · sổ tay khám phá.** Tiền là cổng duy nhất của cả
  game nên gỡ được sạch; `discovered` ghi ở một chỗ duy nhất trong `commit()`.
  (Vốn là Đợt 15; Cường chuyển Đợt 15 sang tối ưu hiệu năng, rồi Đợt 16 sang
  hồ cá và Đợt 17 sang mở rộng bản đồ — nên cả danh sách dời xuống ba bậc.)
- **Đợt 19 · Mua bán bằng xe thật.** Trả tiền lúc đặt, xe đậu rồi tự bốc vào kho.
  Xe vẽ to hai ô, có người bốc xếp.
- **Đợt 20 · Diễn hoạt.** Cửa rộng và cao, đi vào là chuyển bản đồ luôn; giường;
  khung riêng cho từng việc.
- **Đợt 21 · Hệ sinh thái rừng.** Thú hoang, cỏ cây, dương xỉ.
- **Đợt 22 · Mỏ quặng hiếm** xuất hiện theo xác suất mỗi đêm.

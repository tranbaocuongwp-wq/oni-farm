# Spec giải thuật

Máy tự quyết định thế nào, và **giá của mỗi quyết định**. Luật chơi ở
[`LOI-CHOI.md`](LOI-CHOI.md); cách mã chia tầng ở [`KIEN-TRUC.md`](KIEN-TRUC.md).

Mọi số đo trong tài liệu này lấy từ `npm run bench` (mô phỏng) hoặc từ phép đếm
lệnh vẽ trong trình duyệt (lớp vẽ), trên cảnh chuẩn: **1.776 ô · 360 cây · 27–54
thực thể**, khổ 430×932 @2x. Ngân sách một khung hình 60fps là **16,67 ms**.

---

## 0. Bảng giá — cái gì thật sự tốn

| | Trung vị | % ngân sách |
|---|---|---|
| TICK trọn vẹn (một khung hình) | 0,0282 ms | 0,2% |
| · `catchUpEntities` | 0,0028 | 0,0% |
| · `growCrops` | 0,0200 | 0,1% |
| · `moveActors` | 0,0024 | 0,0% |
| · `runActorSteps` | 0,0001 | 0,0% |
| `autoJob` | 0,0033 | 0,0% |
| **`findPath`** (một lần gọi) | **0,4680** | **2,8%** |
| `checkInvariants` (chỉ ở dev) | 0,0245 | 0,1% |
| nhãn nút: `pressPlan` (ô ngắm trống) | 0,0110 | 0,1% |
| nhãn nút: `infoHint` (ô ngắm trống) | 0,0013 | 0,0% |

Đọc ra ngay: **cả phần mô phỏng gộp lại tốn 0,2% một khung hình**, còn **một lần
gọi A\* tốn gấp năm mươi lần tất cả những thứ đó cộng lại**. Mọi thứ khác là
nhiễu. Đó là lý do tối ưu chỉ đụng vào đúng hai chỗ: A\* và bản đồ nhỏ.

Hai dòng cuối là của Đợt 28, và chúng ở đây để **ngăn một tối ưu**: `main.ts`
gọi `pressPlan` + `infoHint` 60 lần mỗi giây chỉ để in nhãn hai cái nút và đặt
mũi tên đỏ, và đọc mã thì trông rất đắt. Đo ra 0,0123 ms cho cả hai ở ca đắt
nhất — dưới ngưỡng "đáng sửa" tám lần. Đợt 28 đã định cache chúng sau một cái
khoá mười mấy trường; bảng này huỷ mục ấy trước khi nó kịp thành mã.

**Bảng này KHÔNG đo lớp vẽ** — xem mục 10 cho phần ấy, và đọc kỹ lý do ở đó
trước khi tin bất kỳ con số nào về lớp vẽ đo bằng công cụ khác.

---

## 1. A\* — tìm đường

`src/game/pathfind.ts`. Lưới ô, **8 hướng**, **cấm cắt góc**, trả về **mảng chỉ
số ô** (không kể ô xuất phát).

**Chi phí:** 0,468 ms một lần gọi (trước Đợt 15: 1,338 ms).

### Cấu tạo

* **Heap nhị phân** trên hai mảng định kiểu song song (`Float64Array f`,
  `Int32Array i`), dùng lại qua các lần gọi. Quét tuyến tính là O(N²) trên số nút
  mở — với một actor thì còn nhanh hơn, nhưng 20 actor thì đó là thứ giết fps trên
  điện thoại trước tiên.
* **Phá hoà theo CHỈ SỐ Ô.** Hai nút cùng `f` phải **luôn** ra cùng thứ tự, nếu
  không hai lần replay cùng chuỗi action cho hai đường khác nhau — và tất định là
  xương sống của cả dự án (xem [`KIEN-TRUC.md`](KIEN-TRUC.md#5-tất-định--xương-sống-của-cả-dự-án)).
* **Heuristic chia cho hệ số tốc độ LỚN NHẤT** của content. Có ô rẻ hơn 1 (đường
  nhựa) mà vẫn ước lượng theo giá 1 là ước lượng **thừa**, và A\* mất tính tối ưu
  — nó vẫn trả về một đường hợp lệ, chỉ không phải đường ngắn nhất. **Hỏng âm
  thầm, không crash, rất khó thấy.**
* **Dấu phiên (`ky`)** tăng mỗi lần gọi thay cho việc xoá 1.776 ô của `gScore` /
  `cameFrom` / bảng ghi nhớ.

### Ghi nhớ tính chất ô — chỗ thật sự ăn tiền

Ba phép hỏi địa hình — `walkableTile`, `blockedForActor`, `stepSpeed` — mới là chi
phí, **không phải** hàng đợi. Mỗi ô bị hỏi lại một lần cho **mỗi hướng** dẫn tới
nó (tới tám lần), cộng hai lần nữa mỗi khi có ai đi chéo qua góc nó. Mà câu trả
lời **không đổi** trong suốt một lần tìm: cả ba chỉ phụ thuộc
`(state, content, ô, hộp, bơi)`.

Hỏi một lần rồi ghi lại:

| | ms |
|---|---|
| bản gốc (`Map` + heap object) | 1,338 |
| → mảng định kiểu dùng lại | 1,296 — **gần như không ăn thua** |
| → **+ ghi nhớ tính chất ô** | **0,468** |

Số liệu ở dòng giữa là số liệu đáng giá nhất: nó chỉ đúng chỗ còn lại.

### Ràng buộc phải nằm TRONG vòng lặp, không soát lại sau

Xe tải chỉ đi được trên đường. Bản đầu soát lại đường A\* trả về, thấy ô nào không
phải mặt đường thì bỏ cả chuyến — mà A\* luôn trả **đường ngắn nhất**, tức đường
cắt thẳng qua bãi cỏ. Nên hễ đích không nằm đúng một đường thẳng dọc con đường thì
chuyến nào cũng bị bỏ, và chiếc xe đứng chết máy giữa đường.

Lọc trong vòng lặp (`opts.pass`) thì A\* tự tìm **đường vòng theo mặt đường**.
Soát lại sau khi tìm xong thì **không bao giờ** ra được đường đó.

### Các ràng buộc khác

`box` (hộp va chạm — xe rộng hơn người, gà hẹp hơn) · `swims` (loài bơi: nước là
chỗ đi được, cạn là chỗ chặn) · `avoidFarm` (vật nuôi không lập đường qua ô đã
cày — nhưng **chỉ lúc lập đường**, không lúc va chạm, để con bò bị cày dưới chân
vẫn đi ra được) · `leash` (dây xích, để một actor kẹt không quét cả bản đồ) ·
`maxNodes`.

**Kịch bản 138** giữ nguyên một **bản A\* tham chiếu chậm** rồi so **từng ô** trên
144 cặp điểm qua sáu biến thể. Thứ phải canh khi viết lại A\* **không phải tốc độ**
mà là "cùng seed = cùng state".

---

## 2. Kéo dây — làm đường A\* trông tự nhiên

`src/core/navigate.ts`. Đường A\* đi theo tâm từng ô nên trông rất máy móc. Mỗi
khung hình thử **bỏ qua các điểm mốc còn nhìn thấy được** điểm xa hơn, nên nhân
vật cắt chéo tự nhiên thay vì bò theo ô vuông.

Đường ngắm kiểm bằng **cả hộp va chạm**, không phải một điểm — nếu không, đường sẽ
"lách" qua khe hẹp mà thân thực thể không lọt.

**Dừng khi ĐỦ GẦN, không phải khi giẫm lên đích.** Bấm vào ô đất là muốn *cày* nó,
không phải muốn *đứng lên* nó.

---

## 3. Ngân sách A\* — chi phí là HẰNG SỐ theo số con

Không giới hạn thì 20 con vật cùng nghĩ trong một khung là 20 lần A\*.

* Mỗi **bước quyết định** chỉ `MAX_REPLANS_PER_STEP` = **2** con được gọi A\*.
* Lượt xoay vòng theo `planCursor`, nên **20 con hay 60 con thì vẫn ngần ấy lần
  tìm đường mỗi giây**.
* Bước quyết định chạy mỗi `ACTOR_STEP_MINUTES` = 0,5 phút game ≈ **16 khung hình**.
* TICK chạy bù nhiều bước (tab quay lại, cổng dịch chuyển) dùng **chung một túi**
  cho các bước bù — trước đây tới 8 bước × 2 lượt × 2.000 nút trong **một** khung.
  Lối chơi bình thường không đổi một ly (kịch bản 116).

**Ngoại lệ có chủ ý: ĂN không tốn nút A\* nào**, nên nó đứng **trước mọi cổng**.
Trước đây bữa ăn nằm sau bốn cổng — đồng hồ nghỉ, xúc xắc 45%, ngân sách A\*, đồng
hồ nguội — tất cả dựng lên để chặn **chi phí tìm đường**, và chặn nhầm cả bữa ăn.
Con vật đứng sát máng đầy vẫn phải ngủ hết giấc rồi bốc thăm mới được ăn.

---

## 4. Chọn việc — một HẰNG thứ tự, hai hàm quét

`CROP_ORDER` trong **`src/game/joborder.ts`** (module không import gì cả) là thứ
tự việc ruộng dùng chung cho **cả hai** bộ não: `autoJob`/`AUTO_ORDER`
(`hint.ts`, nút AUTO của người chơi) và `cropTask`/`pickTask` (`workers.ts`,
người làm thuê).

```
ĐỔ MÁNG · RẮC HỒ → THU → CHỮA → GIEO → TƯỚI → DỌN CỎ → CÀY
```

Hai **hàm quét** vẫn riêng, và phải riêng: một bên đo khoảng cách từ nhân vật, một
bên đo từ chỗ người làm đang đứng. Nhưng **thứ tự** thì chỉ còn một nguồn.

> Mục này từng ghi "một hàm, hai chỗ dùng" — và nó chưa bao giờ đúng: một bên là
> danh sách chuỗi, một bên là bảng số gõ tay, không có một lời gọi chéo nào. Đúng
> điều mục này cảnh báo đã xảy ra: tới Đợt 22 thì nút AUTO gieo trước tưới còn
> người làm tưới trước gieo. Bài học không phải "viết chung một hàm" mà là **rút
> cái QUYẾT ĐỊNH ra một hằng** — hai hàm khác nhau vẫn được, miễn chúng đọc chung
> một bảng.

Đổ máng và rắc hồ đứng đầu: con vật chết đói được, cây thì chỉ đứng chờ. Và **trời
ướt thì TƯỚI tụt xuống cuối** — sáng mai ruộng ngoài trời tự ẩm.

### Việc vặt của người rảnh: chia theo CHI PHÍ TÌM ĐƯỜNG

Ngân sách A\* (`MAX_REPLANS_PER_STEP` = 2 mỗi bước) dùng **chung** cho cả đàn vật
nuôi, xe và người làm. Trước Đợt 22, một người làm hết việc đứng im 2–6 phút game
và trong suốt thời gian đó **không tiêu một suất nào** — tức cái "đứng ngơ" đang
âm thầm trợ cấp ngân sách cho đàn bò đi ăn. Cho họ đi tuần mà không tính lại là
lấy đúng khoản trợ cấp ấy đi, và triệu chứng hiện ra ở chỗ không ai ngờ: **con vật
chậm được ăn**.

| hạng | việc | A\* | cổng |
|---|---|---|---|
| rẻ (0 nút) | nói chuyện · vuốt ve · bốc xếp cho xe | không | không cổng nào — chỉ xảy ra khi đối tượng ĐÃ ở ngay cạnh, người làm quay mặt về phía đó chứ không đi tới |
| đắt (1 nút) | đi một vòng nông trại | có | `takeBudget()` **+ nguội riêng 8 phút game** (gấp bốn `REPLAN_COOLDOWN`) |

Kịch bản 151 khoá trần **số lần gọi A\*** của người rảnh, và 152 đo **mốc con vật
đầu tiên ăn được** có bị lùi không.

**Xã giao là ĐƠN PHƯƠNG.** Mỗi người tự quyết, không ghi một byte nào lên người
kia; nếu người kia cũng rảnh thì chính luật ấy khiến họ cũng quay lại nhìn. Mọi
cơ chế "A chọn B rồi đi tới B" đều đẻ ra hai bệnh: B đi mất giữa chừng nên A tới
nơi trơ trọi, hoặc A và B đổi chỗ cho nhau mãi. Việc vặt cũng **không đặt
`ai.tx/ty`** — `pickTask` lọc ô "đã có người nhận" theo đúng hai trường ấy, nên
một người đứng nói chuyện mà chiếm ô sẽ khoá ô đó với đồng nghiệp.

**Giới hạn đã biết:** `entities.ts` bỏ qua `workerStep` khi người làm còn đường đi
(`if (cur.ai.path.length) continue`), nên họ **không phản ứng gì trong lúc đang
đi** — bão ập tới giữa đường thì họ đi nốt đoạn còn lại rồi mới trú. Với `MAX_PATH`
= 64 thì đoạn dài nhất chỉ vài giây thật; gỡ cổng đó ra sẽ đổi nhịp của mọi actor
cùng lúc.

**Vành quét kẹp vào biên bản đồ** — bỏ ~9.400 lần gọi rỗng cho mỗi loại việc.
Kịch bản 118 khẳng định kết quả **y hệt** duyệt thô.

### Người làm không giẫm chân nhau

Việc đã có người nhận (ô **và** con vật) được dựng thành `Set` **một lần**, rồi
lọc **ngay trong vòng chấm điểm**. Bản đầu so **sau khi đã chọn xong**, nên người
thứ hai gặp trùng thì đứng phí nguyên một lượt — hai người làm cạnh nhau thành ra
chỉ có một người làm việc. Và nó không so **con vật**, nên hai người vẫn cùng đuổi
một con bò khi nó rời cái ô đã ghi.

**Ô đã thử mà không tới được** bị ghi vào `ai.bad` và không chọn lại. Không có bộ
lọc này thì người làm đứng đơ: hàm luôn trả ô gần nhất, A\* không tìm ra đường,
lượt sau lại trả đúng ô đó. Nhìn từ ngoài y hệt treo máy.

---

## 5. Cây lớn — số học, không mô phỏng

`growCropsIn` cộng phút vào mọi ô **ẩm, có cây, chưa chín, không bệnh**, rồi đẩy
giai đoạn khi đủ ngưỡng. Quét 1.776 ô mỗi khung: **0,0200 ms** — 0,1% ngân sách.

Nó chỉ đụng ô **có cây** và chỉ copy ô **thật sự đổi**, nên không ô nào đổi thì
draft vẫn sạch và `reduce` trả về đúng state cũ.

Cùng nguyên tắc, `catchUpEntities` cộng bù **đồng hồ** cho thực thể trên bản đồ
vắng mặt — **chỉ đồng hồ, không bao giờ vị trí**. Con bò trong chuồng vẫn phải đói
và vẫn ra sữa khi người chơi ở trong nhà, nhưng mô phỏng đường đi của nó lúc không
ai nhìn thì vừa đắt vừa vô nghĩa.

---

## 6. Ngẫu nhiên tái lập được

**mulberry32**, thuần: `(seed) → { v, seed mới }`. Không trạng thái ẩn.

Ba nguồn, tách bạch:

| Nguồn | Rút khi | Dùng cho |
|---|---|---|
| `state.seed` | theo **sự kiện** | thời tiết, bệnh, cỏ lan, sản lượng, sinh thực thể |
| `entity.seed` | mỗi con tự advance | hành vi lang thang của **từng** con |
| — | | vị trí decor: hàm **thuần** của `(x, y)`, không rút gì |
| `entity.seed` | | việc vặt của người làm rảnh (nói chuyện / vuốt ve / đi tuần) — TICK vẫn không đụng `state.seed`, xem kịch bản 60 |
| — | | **hành vi theo thời tiết** (chậm, trú, người làm về kho, xe không tới): đọc thuần `weatherDef`, không rút gì — kịch bản 147 khoá cả chuyện xúc xắc xe thu mua vẫn được rút ngày bão |

Vì sao tách: xem [`KIEN-TRUC.md`](KIEN-TRUC.md#5-tất-định--xương-sống-của-cả-dự-án).

---

## 7. `inZone` — cache theo loại × bản đồ

Bản đầu `.filter()` qua 13 vùng ở **mỗi lần gọi**. Giờ cache theo (loại × bản đồ),
khoá **`WeakMap` theo content** — nên OTA về là tự có cache mới, không phải nhớ
xoá. Kịch bản 117 khẳng định kết quả **y hệt** duyệt thô trên **mọi** ô, **mọi**
vùng, **mọi** bản đồ.

---

## 8. Tự động làm

Cùng hàm với giữ-nút, chỉ khác là không cần giữ. Chờ hết `busy` **và** hết đường
đang đi rồi mới chọn việc mới — nên vẫn **tuần tự** từng việc một.

Tự tắt khi: người chơi tự cầm lái, quanh đây hết việc, hoặc **4 giây không có tiến
triển**.

> Phép đo cuối cùng là thứ quan trọng, và nó tinh tế: thao tác ở đây có **hiệu lực
> TRỄ** (`USE` đặt `busy` rồi mới kiểm năng lượng lúc chạm đất), nên ngay sau khi
> ra lệnh thì **không cách nào** biết nhát này ăn hay trượt. Đếm **bộ đếm thống
> kê** thì đúng với mọi lý do hỏng cùng lúc — hết năng lượng, túi đầy, hết hạt,
> kẹt đường.

---

## 9. Lớp vẽ — sắp theo chiều sâu

Mọi thứ đứng trên mặt đất gom vào một danh sách rồi **sắp theo mép dưới**, nên
nhân vật đi sau gốc cây thì bị che, đi trước thì che cây.

**Ngoại lệ: vật ĐI QUA ĐƯỢC xếp theo mép TRÊN của ô.** Người chơi đứng được lên
chính ô đó (cầu gỗ, bụi cỏ, tấm biển, cái giường). Lấy mép dưới thì nhân vật — xếp
theo `y` của mình, tức **giữa** ô — luôn nhỏ hơn và bị chính cái cầu mình đang
đứng vẽ đè lên: ra hình "đi chui xuống dưới địa hình". Lấy mép trên thì cùng ô là
vật **dưới chân**, còn ô ngay phía dưới vẫn có mép trên lớn hơn nên vẫn đè lên như
cũ. Vật **đặc** không cần luật này — không ai đứng lên được nó.

Phép sắp phải **ổn định**: hai thứ cùng khoá sắp xếp phải giữ nguyên thứ tự đã
gom, nếu không lớp phủ (cây héo, dấu bệnh) có thể chui xuống dưới thứ nó phủ lên.

**Đã thử rồi bỏ:** gom hết vào một **bể dùng lại** để bỏ cấp phát mỗi khung (việc
"chưa làm" số một mà Đợt 9 để lại). Đo A/B trên một trạng thái ghim: **y hệt
nhau**. Gắn đồng hồ từng chặng thì rõ — chặng gom vật thể chỉ tốn **3,4%** thời
gian vẽ; chi phí nằm ở chính các lệnh `drawImage`. Đã gỡ bỏ.

---

## 10. Lớp NỀN được cache — và câu hỏi mà cái khoá đang hỏi

Đợt 15 đã tìm ra chỗ tốn nhất *của HUD*. Đợt 23 hỏi tiếp câu ấy cho **thế giới**:
phần mô phỏng tốn 0,2% ngân sách một khung hình, tức không còn gì để lấy ở đó.
Chỗ tiền nằm ở lớp vẽ. Nó cache lớp nền vào canvas phụ, biến mưa thành một mảng
lặp, và báo **149 lệnh vẽ · 0,30 ms** mỗi khung.

**Con số ấy sai, và cả dự án tin nó suốt năm đợt.**

### Vì sao nó sai: bộ đếm mù đúng chỗ đắt nhất

`renderer.stats()` chỉ bọc ngữ cảnh 2D của canvas **chính**. Renderer còn tạo ba
canvas phụ nữa — cache lớp nền, lớp đêm, mảng nước/mưa — và không cái nào bị
đếm. Mà cache lớp nền chính là chỗ đắt nhất trong cả lớp vẽ. Nói gọn: bộ đếm mù
đúng chỗ cần nhìn.

Còn `scripts/bench.mjs` thì **cố ý** không đo lớp vẽ (canvas trong Node chỉ đo
được phần CPU của mình, không đo được phần trình duyệt thật sự tốn). Nên trước
Đợt 28, dự án **không có công cụ nào nhìn thấy được chỗ đang lag**. Một bộ đếm mù
đúng chỗ đắt nhất còn tệ hơn không có bộ đếm, vì nó làm người ta tin là đã đo
rồi.

Đợt 28 bọc **mọi** ngữ cảnh renderer tạo ra, và thêm `__PF.do(n)` chạy `n` khung
rồi trả p50/p99 — đó là chỗ duy nhất trả lời được câu "một khung hình tốn bao
nhiêu". Đo lại cùng cảnh, và nó tệ hơn dự đoán: **1.544 lệnh vẽ** và **22,05 ms**
mỗi khung, trong khi ngân sách 60fps là 16,7 ms. Riêng lớp vẽ đã vượt ngân sách.

### Cái khoá hỏi sai câu

Khoá vô hiệu hoá của cache nền là `nenTiles === s.tiles`, kèm một lý lẽ nghe rất
xuôi: *"mảng ô là copy-on-write nên một ô đổi là cả mảng đổi — rẻ nhất có thể, và
không có cách nào nó bỏ sót"*. Vế sau đúng. Vế trước mới là vấn đề: **nó cũng
không bao giờ trúng.**

`growCrops` chạy mỗi TICK và gọi `edit()` cho mọi ô ẩm có cây đang lớn — vì
`grow` cộng thêm mỗi khung, không phải chỉ khi sang giai đoạn mới. Một lần `edit`
là nhân bản cả mảng 3.504 ô. Nên trên nông trại đã gieo, `s.tiles` đổi tham chiếu
**mỗi khung hình**, và cache dựng lại mỗi khung hình: đo được `nenVe = 600/600`.

Mà cây lớn lên **không đổi lớp nền một pixel nào**: `veNenVao` đọc đúng năm
trường `g · b · tilled · wet · decor`, không đọc `crop` lấy một lần. Cái khoá chỉ
đang hỏi sai câu.

Đây đúng là con lỗi Đợt 15 đã tìm ra và đã chữa cho **bản đồ nhỏ** (mục 11:
`veODaDoi` so từng ô thay vì so tham chiếu mảng). Lớp vẽ chính không được sửa
cùng, và sống thêm năm đợt.

### Khoá mới: CHỮ KÝ ô

`chuKyNen(t)` gói đúng năm trường ấy thành một số nguyên. Mỗi khung `quetO()`
quét một lượt, **so tham chiếu trước** rồi mới tính chữ ký — mảng là mới mỗi
khung nhưng phần lớn phần tử vẫn là object cũ, chỉ ~360 ô có cây là mới. Một
lượt là ~3.500 phép so tham chiếu (vài micro-giây) thay cho ~900 lệnh vẽ (vài
mili-giây): rẻ hơn hai tới ba bậc.

Cache chỉ dựng lại khi **hộp bao** các ô đổi chữ ký **cắt vùng đã cache** — nên
người làm cày ở góc bản đồ khác không đụng gì tới khung đang hiện.

Cố ý **không** đi đường "chỉ vẽ lại ô đã đổi" như bản đồ nhỏ: ở đó một ô là một
`fillRect` độc lập, ở đây một ô là chồng tới bảy lớp, và viền lô đất lẫn gờ nước
còn đọc `tilled`/`g` của **bốn ô kề** — cày một ô là bốn ô quanh nó phải bỏ viền.
Năm chỗ để sai âm thầm, đổi lấy khoản tiết kiệm chỉ có nghĩa trên những khung vốn
đã hiếm. Dựng lại cả vùng khi có đổi là đủ.

Cùng một lượt quét ấy phục vụ thêm hai khách hàng dùng chung cái khoá sai cũ:
`bangLoaiNuoc` (mỗi khung cấp phát ~17,5 KB, chạy BFS qua ~560 ô nước rồi quét cả
bản đồ ba lượt) và `isIndoor`. Cả hai nay chỉ dựng lại khi có ô đổi **loại nền**
(`t.g`) — một điều hôm nay không bao giờ xảy ra, nhưng khoá bằng phép ĐO chứ
không bằng lời hứa, nên ngày thêm tính năng đào ao thì nó tự đúng.

### Ba chỗ vẽ thừa khác

**Cắt ngoài khung nhìn.** `drawActors` mới chỉ lọc `e.map !== s.mapId`, nên 64
thực thể trên bản đồ đều được sắp hình và đẩy vào lớp vật thể trong khi khung
nhìn điện thoại chỉ chứa khoảng mười cái. Phép cắt phải đặt **sau** khối
`if (e.worker)`: khối ấy cập nhật `phaLam`, và cắt trước nó thì người làm ngoài
khung bị xoá khỏi `phaLam` rồi bắn một **cụm hạt ma** lúc bước vào khung.

**Số lát uốn cây.** Cây lay theo gió bằng cách cắt sprite thành lát ngang. Số lát
từng là hằng số (4 cho cây cao) và ngưỡng "coi như đứng yên" tính bằng **đơn vị
thế giới** — một câu vô nghĩa, vì cùng con số ấy là 0,2 pixel thiết bị ở mức
phóng này và 3 pixel ở mức phóng kia. Nay đếm bằng **pixel thiết bị**, theo biên
độ đỉnh (hằng số cả ngày) chứ không theo độ dịch tức thời: đếm theo độ dịch thì
số lát nhảy 60 lần mỗi giây và viền cây rung lăn tăn. Sương mù còn 5 lát mỗi
khung, bão vẫn 82 — cây **không bao giờ** đứng lại.

**Viền đen.** Mỗi khung tô kín canvas một màu viền rồi tô đè ngay lên đúng ngần
ấy pixel. `pickScale` không bao giờ đẻ ra viền.

### Vạch kẻ mặt đường suy từ HÌNH con đường

Vạch kẻ từng được nướng cứng vào chính ô nhựa: một nét dọc ở cột giữa, có mặt
ở hai trong bốn biến thể, rải ra theo hàm băm toạ độ. Cách ấy đúng chừng nào
mọi con đường trên bản đồ đều chạy DỌC — mà tới Đợt 28 thì bản đồ đúng là chỉ
có một con đường như thế. Đợt 29 mở con đường NGANG đầu tiên và nó sai ngay,
theo kiểu không phép kiểm nào bắt được: hình vẫn vẽ ra, chỉ là vẽ sai chiều.

`vachKeDuong` đo hai đoạn đường liền mạch qua ô (trần 8 ô, vì chỉ cần biết
"dài hơn bề rộng"):

| Đo được | Suy ra |
|---|---|
| đoạn ngắn hơn | BỀ RỘNG con đường |
| đoạn dài hơn | chiều xe chạy |
| hai đoạn BẰNG nhau | NGÃ TƯ — không kẻ vạch nào |
| bề rộng = 1 | không có ranh nào để kẻ → một nét đứt giữa lòng đường |

Mỗi ô sở hữu cái ranh Ở PHÍA GẦN của nó; ô đầu tiên kẻ mép ngoài, ô cuối kẻ
thêm mép ngoài phía xa vì không còn ô nào bên kia kẻ hộ. Tim đường nằm chính
giữa bề rộng. Đường bốn làn vì thế ra đúng: mép trắng · vạch đứt · vàng đôi ·
vạch đứt · mép trắng.

Nhận `laDuong` làm THAM SỐ chứ không đọc thẳng state — bên trong lớp vẽ nó nằm
sau một cái atlas và một cái canvas, mà suy sai thì chỉ thấy được bằng mắt.
Kịch bản 177 dựng lưới bằng chữ và kiểm từng ô.

Vạch phụ thuộc HÀNG XÓM, nên nó chỉ an toàn nhờ đúng quyết định của mục trên:
cache nền dựng lại CẢ VÙNG khi có ô đổi chữ ký, không dựng lại từng ô. Đi
đường "chỉ vẽ lại ô đã đổi" thì cày một ô cạnh đường sẽ để lại vạch cũ.

### Mưa — một mảng lặp

110 lệnh vẽ mỗi khung khi bão, cho một thứ trang trí. Và vì vị trí hạt băm lại
theo từng nhịp 1/10 giây, cả màn mưa *nhảy cóc* mười lần mỗi giây. Nay mưa là một
**mảng lặp** 64×64 tô kín màn bằng đúng một `fillRect`, gốc mảng trôi liên tục
theo thời gian: rẻ hơn hai bậc **và** rơi mượt thật. Bão dùng hai lớp lệch pha —
vẫn chỉ hai lệnh. Gốc mảng (và gốc mặt nước) neo về **lưới pixel thiết bị**: trôi
ở toạ độ phân số thì mỗi khung cả màn bị lấy mẫu lệch một phần pixel, và đó là
một kiểu nhoè không dòng `image-rendering` nào chữa được.

### Bảng, đo cùng một cảnh

Nông trại gieo kín 360 cây · 15 thực thể · 430×932 · 600 khung:

| | Đợt 23 báo | Đo thật, trước Đợt 28 | Sau Đợt 28 |
|---|---|---|---|
| dựng lại cache nền | — | **600/600 khung** | **0/600** |
| `drawImage` mỗi khung | 149 | **1.544** | **463–475** |
| `fillRect` mỗi khung | — | 87 | 16–17 |
| lớp vật thể | — | 287 | 261–266 |
| thời gian `draw()` | 0,30 ms | **22,05 ms** | **4,00–5,03 ms** |
| khung p50 | — | 17,9 ms | **2,7–3,0 ms** |
| khung p99 | — | 221,7 ms | 59,8–81,6 ms |

Cột giữa và cột phải mới so được với nhau — cột trái đo bằng cái bộ đếm mù, trên
bản đồ **một nửa** bản đồ hiện tại, và trước Đợt 24/25/26. Để nguyên nó ở đây,
không xoá, vì bài học nằm ở chỗ hai cột đầu chênh nhau **mười lần**.

### Việc kế tiếp, nếu đo xong vẫn còn đắt

Mỗi ô nước vẽ lại mỗi khung ngoài cache: một `fillRect` cộng tới tám lệnh cho gờ
và bờ — cạnh sông có thể 60 ô, tức ~500 lệnh. Gờ nước là **tĩnh** nhưng phải nằm
**trên** mặt nước động nên không nhét vào cache nền được. Cách chữa: một canvas
cache **thứ hai** cho lớp "trên mặt nước", dán sau lượt tô nước — một lệnh thay
cho ~250.

---

## 10b. Hệ số nghệ thuật — HD mà không đụng một dòng luật chơi

`TILE` mang HAI vai từ ngày đầu: một ô ăn **16 đơn vị thế giới** (toạ độ nằm
trong bản lưu, hộp va chạm, A*) và một sprite rộng **16 pixel**. Hai vai trùng
giá trị nên chưa ai phải tách — cho tới lúc muốn nét đẹp hơn.

Đo trước khi làm, và bốn con số quyết định cả hình dạng của Đợt 24:

| Đo được | Con số | Nghĩa |
|---|---|---|
| Hệ số phóng ở 1000×700 | **4×** | mỗi pixel sprite bị thổi thành ô vuông 4×4 — đó chính là chỗ trông thô |
| Atlas trong bộ nhớ | 484 canvas · **0,59 MB** | ở 2× là **2,35 MB**, không đáng kể |
| Thời gian dựng atlas | **≈ 148 ms** | gấp bốn số pixel mà vẫn dưới ngưỡng thấy được |
| `drawImage` một khung, ruộng lúa kín | **536** (399 vật thể) | HD không thêm một lệnh nào |

**Kết luận quan trọng nhất: HD gần như MIỄN PHÍ lúc chạy.** Sprite 32px vẽ ở hệ
số 2 và sprite 16px vẽ ở hệ số 4 tô **đúng ngần ấy pixel đích**. Chi phí thật là
bộ nhớ (không đáng kể) và công vẽ lại.

`ART = 2` tách hai vai: `world.ts` giữ đơn vị thế giới, `atlas.ts` giữ cỡ ảnh, và
camera nhận `tile` từ `world.ts` thay vì gõ tay. Trước đợt này `main.ts` và
`draw.ts` import `TILE` từ **atlas** rồi dùng nó làm đơn vị thế giới — ba hằng
bằng nhau, không cái nào import cái nào, không kịch bản nào kiểm. Ngày cỡ ảnh đổi
mà thế giới không đổi, hai vai ấy phải tách, nếu không mọi toạ độ lệch nửa ô và
nó im lặng cho tới khi ai đó đi xuyên tường. (Nó đã lệch thật một lần trong đợt:
`drawActors` còn dùng `img.width` làm đơn vị thế giới.)

Hai ràng buộc giữ cho HD không phản tác dụng:

1. **Hệ số phóng phải chia hết cho `ART`.** Sprite 32px vẽ ở hệ số 1,5 thì mỗi
   pixel nguồn trải ra 1,5 pixel đích: ô pixel to nhỏ không đều, và HD trông *xấu
   hơn* bản 16px cũ. `pickScale` kẹp về bội của ART — làm tròn **trần xuống** và
   **sàn lên**, vì làm tròn cả hai xuống thì màn siêu rộng vỡ trần số ô trục dài.
   Kịch bản 162 quét 16 khổ máy.

   **Và ràng buộc ấy, viết như trên, là THIẾU — xem mục 10d.**
2. **Hai cây bút, một hệ toạ độ.** `px` vẫn tô khối `ART × ART` — đó là thứ giữ
   cho art chưa vẽ lại trông y như trước. Art đã vẽ lại dùng `dot` (đúng một
   pixel HD) với bước lưới `Q = 1/ART`, và `outline(…, 1)` cho viền mảnh. Chỗ nào
   còn `px` là chỗ chưa vẽ lại, và điều đó **đọc ra được ngay khi nhìn code**.

Lớp vẽ giữ **toạ độ thế giới** và truyền cỡ đích tường minh qua `put()`. Cách này
tránh phải sửa ~150 biểu thức toạ độ trong `draw.ts` — nhóm rủi ro lớn nhất của
kế hoạch biến mất hẳn. Bốn chỗ cắt lát ảnh dùng source-rect theo **pixel ảnh** và
đích theo **đơn vị thế giới**; hai hệ khác nhau nên chúng phải viết rõ cả hai.

---

## 10c. Sáu mươi mốt cây, và vì sao chúng từng trông giống nhau

Cường nói đúng một câu: *"tính ra là toàn mấy cây giống nhau… toàn màu tự tựa
giống nhau khó phân biệt"*. Câu ấy đúng, và nó đúng vì một lý do đo được.

61 cây chia vào **11 dáng**, nhưng bên trong một dáng thì mọi cây vẽ y hệt nhau
và chỉ khác bảng màu. Mười loại củ ra mười túm lá giống hệt. Năm loại ngũ cốc ra
năm cái quạt giống hệt. Năm quả họ dưa thì **không hiện quả nào cả** — quả chỉ to
bằng `fruitSize * 0.5`, tức hai ba pixel. Và hơn bốn mươi cây mang cùng một sắc
xanh lá, mà ở cỡ mười sáu pixel thì **màu là thứ đọc được sau cùng**.

Chữa bằng ba tham số content mới, đều **tuỳ chọn** nên pack cũ không đổi hình:

| Tham số | Nói điều gì | Ví dụ |
|---|---|---|
| `fruitShape` | bóng dáng của quả | ớt thon nhọn · bắp ngô có hàng hạt · trái đậu dẹt có ngấn · việt quất thành chùm · bông lúa trĩu cong |
| `pattern` | mặt ngoài của quả | sọc dưa hấu · múi bí đỏ · vân lưới dưa lưới · đốm khoai mì |
| `leafShape` | bóng dáng của lá | lá ống của hành · lá tròn mọc đối của húng quế · lá xẻ của ngò · lá bản dài của sả |

Mỗi **dáng cây** tự hiểu tên dáng quả theo cách của mình — `"ear"` ở `stalk` là
bắp ngô, ở `grain` là bông lúa mì. Đó là chủ ý: một bảng tên chung cho mọi dáng
cây thì hoặc dài lê thê, hoặc chung chung tới mức vô nghĩa.

Ba lỗi vẽ tìm ra trong lúc làm, cả ba đều là *"đúng kỹ thuật mà sai hẳn hình"*:

- **Quả mảnh tối đen.** `Math.abs(x) >= w - Q` làm mép tối; với quả mảnh (`w` chỉ
  hơn `Q` một chút) thì **mọi** pixel rơi vào mép. Trái đậu que ra một ngón tay
  đen. Tách thành `veLat()`: mép tối dày đúng một pixel HD, không hơn.
- **Bông lúa bị chính bụi lá nuốt.** Vẽ cọng rồi bông trong **một** lượt thì cọng
  thứ i+1 đè lên bông thứ i — mà bông lúa rủ xuống ngay giữa bụi. Nay hai lượt:
  xong cọng rồi mới tới bông.
- **Bốn cái bông thành hai đôi cánh.** Bông cong ngược *vào giữa* bụi và hạt chìa
  đều hai bên, nên bốn bông chụm lại thành hình con chim. Nay bông vươn *ra
  ngoài* rồi rủ, hạt chỉ bám mặt ngoài của cung.

Kịch bản 163 biến câu than ấy thành một **luật**: hai cây được phép trùng "chữ ký
hình" (dáng cây · dáng quả · hoa văn · dáng lá) chỉ khi bảng màu của chúng cách
nhau tối thiểu 150 (Manhattan RGB của màu lá + màu quả). Cặp sát nhất hiện nay là
158. Nó cũng là dây bẫy cho một cách hỏng rất dễ xảy ra: **thêm cây mới bằng cách
chép object của cây cũ** rồi đổi tên và giá — build vẫn xanh, schema vẫn xanh, và
nông trại lặng lẽ có thêm một cây trùng hình.

---

## 10d. Nét đúng bằng pixel THẬT của màn hình

Mục 10b nói *"tỉ lệ phóng thật của một pixel ảnh là `scale / ART`"*, và cả
`pickScale` lẫn kịch bản 162 đều xây trên câu ấy.

**Câu ấy quên nhân `dpr`.** Tỉ lệ thật — con số lớp vẽ dùng ở mọi phép đặt vị
trí — là `scale × dpr / ART`. Cái thiếu ấy sống được lâu vì danh sách khổ máy của
kịch bản 162 chỉ có dpr **nguyên**, mà với dpr nguyên thì `scale` chẵn kéo theo
tích cũng chẵn: ràng buộc thiếu vẫn cho kết quả đúng, nên không lần nào đỏ.

Ngoài đời dpr lẻ là chuyện thường: Windows ở 125% cho 1,25 · Android tầm trung
cho 1,5 · một số máy cho 2,625 · và **mọi mức zoom của trình duyệt**. Ở những máy
ấy tỉ lệ ra 1,5 · 3,3 · 3,75 — đúng cái "ô pixel to nhỏ không đều" mà mục 10b
tưởng đã chặn.

Cộng thêm một lỗi thứ hai, đơn giản hơn nhiều: camera kẹp `maxDpr: 2`. Trên điện
thoại dpr 3 nghĩa là game vẽ ở **44% số pixel vật lý** (2²/3²) rồi để trình duyệt
phóng cả khung hình lên 1,5 lần. Không dòng `image-rendering` nào cứu được một
phép phóng 1,5 lần.

Đợt 28 sửa cả hai, và sửa ở **`setSize`**, không đụng `pickScale`:

```ts
const kDev = Math.max(ART, Math.ceil((scale * d0) / ART) * ART);
vp.dpr = kDev / scale;                       // dpr HIỆU DỤNG
```

Cách hiển nhiên hơn — cho `pickScale` ăn kích thước pixel **thiết bị** — cũng cho
pixel đều, nhưng nó làm điện thoại 430×932 chỉ còn thấy **10,08 ô** thay vì
**13,44**: đổi luôn tầm nhìn của game để lấy độ nét, một cái giá không ai yêu cầu
phải trả. Cách trên giữ `scale` y nguyên nên số ô nhìn thấy không đổi một ly.

Làm tròn **lên**, không phải làm tròn gần nhất: bội của ART gần nhất có thể nằm
*dưới* dpr thật, và khi ấy ta lại vẽ thiếu pixel — đúng lỗi đang chữa, chỉ nhỏ
hơn. Đo trên 864 khổ máy: 46% khớp chính xác dpr màn hình, và **mọi dpr nguyên
(1 · 2 · 3, tức gần như mọi điện thoại thật) luôn khớp chính xác** vì `scale` vốn
là bội của ART. Chỉ dpr lẻ mới dôi, nhiều nhất 2,56 lần ở một cửa sổ tí hon.

**Trần thật là 100% pixel vật lý, và nay đã chạm trần.** Muốn art *mịn* hơn nữa
thì phải nâng `ART` lên 4, mà với dpr 3 thì `scale × 3 / 4` nguyên đòi `scale` là
bội của 4, trong khi điện thoại đang dùng `scale = 2` — ép lên 4 thì khung nhìn
còn một phần tư diện tích. Nên không còn gì để lấy thêm ở hướng này.

Cái giá: backing store 430×932 đi từ 1,60 lên **3,61 Mpx** (×2,25). Trên máy tính
gần như không tốn gì thêm — `draw()` 5,87·5,24·6,04 ms ở dpr 2 so với
5,63·5,33 ms ở dpr 3 — vì dpr đánh vào **tốc độ tô**, thứ GPU lo rẻ, còn thứ đắt
trên điện thoại là **số lệnh gọi**, mà số lệnh gọi không tăng theo dpr. Đó là lý
do phải dọn ~1.000 lệnh vẽ mỗi khung **trước** rồi mới nâng dpr.

Ba chỗ nhoè nhỏ hơn cùng đợt:

- **Gốc mảng nước và mưa** trôi ở toạ độ phân số → mỗi khung cả mặt sông và cả
  màn mưa bị lấy mẫu lệch một phần pixel. Neo về lưới pixel thiết bị bằng chính
  `snapDev` mà mọi chỗ khác đã dùng từ Đợt 24; hai chỗ này bị bỏ quên vì chúng đi
  qua `setTransform` của pattern chứ không qua `put`.
- **`image-rendering` khai ngược thứ tự** ở tám khối: `pixelated` trước,
  `crisp-edges` sau. Hai giá trị ấy không phải một cặp tiền tố — `crisp-edges`
  không bắt buộc nearest-neighbour, và ở trình duyệt hiểu cả hai thì cái sau
  thắng. Đúng thứ tự là `crisp-edges` trước, `pixelated` sau.
- **Chín cỡ icon phi nguyên**: `1.4em` cho ảnh nguồn 24px ra tỉ lệ 1,70, `74%`
  cho ảnh nguồn 32px ra 1,35. Bề rộng CSS phải bằng **đúng cỡ ảnh nguồn** — đó là
  cỡ duy nhất cho tỉ lệ nguyên ở cả dpr 2 lẫn dpr 3, vì `cssW × dpr / nguồn`
  nguyên với cả hai buộc `cssW` là bội nguyên của cỡ nguồn.

Còn `canvas.style.filter` (lớp rút bão hoà theo mùa) thì **không cần đụng tới**:
`image-rendering` chỉ có việc để làm khi trình duyệt *phóng to* canvas lúc hợp
thành, mà dpr hiệu dụng nay luôn ≥ dpr thật nên phép hợp thành không bao giờ còn
là phóng to (đo lại: tỉ lệ đúng 1,0000). Sửa dpr đã gỡ mất tiền đề của lỗi ấy.

Kịch bản 171 quét 864 khổ máy và ghim bốn điều: tích nguyên và chia hết cho ART ·
tầm nhìn không đổi · không viền đen và khung nhìn phủ đúng hết canvas · dpr hiệu
dụng không bao giờ thấp hơn dpr thật. Vế cuối của nó canh một chỗ vỡ **âm thầm**:
`setZoom` gọi lại `setSize`, nên không nhớ dpr **gốc** riêng thì mỗi lần đổi mức
phóng dpr trôi thêm một nấc. Phép nắn là idempotent khi `scale` giữ nguyên, nên
chỉ khổ máy có `scale` đổi theo mức phóng mới lộ ra — và ở 430×932 cả ba mức
phóng cho cùng `scale`. Một kịch bản chọn tay đúng khổ máy ấy sẽ xanh trong khi
lỗi vẫn còn nguyên; nên 171 quét.

---

## 11. Bản đồ nhỏ — vẽ lại đúng ô đổi màu

Đây là chỗ tốn nhất của lớp vẽ, và nó ẩn suốt mười bốn đợt.

| | Trước | Sau |
|---|---|---|
| `fillRect` mỗi khung | **1.786** | **45** |
| `drawImage` mỗi khung | 1.191 | 1.191 |
| **tổng lệnh vẽ** | **3.007** | **1.265** (−58%) |

1.786 gần đúng bằng số ô của bản đồ (1.776), và đó chính là nó: **bản đồ nhỏ vẽ
lại toàn bộ địa hình, từng ô một, mỗi khung hình** — 59% tổng số lệnh vẽ của cả
trò chơi, cho một bức ảnh gần như không đổi.

Nó **có** cache. Cache hỏi `s.tiles !== lastTiles`, và trên giấy thì hợp lý:
reducer dùng copy-on-write nên mảng chỉ đổi khi có gì đổi. Chỗ hỏng là **"có gì
đổi" xảy ra ở MỌI khung hình** — cây cộng dồn `grow` từng khung, nên chỉ cần một ô
ẩm có cây là cả mảng bị nhân bản. Nông trại đã gieo thì cache **không trúng một
lần nào**.

> Một dòng **đúng về logic, sai về thực tế**, và im lặng vì nó *trông* như đang
> tối ưu. Xem cái bẫy chung ở
> [`KIEN-TRUC.md`](KIEN-TRUC.md#4-draft-copy-on-write-ba-tầng).

Hai tầng thay cho nó:

1. **So TỪNG Ô**, không so tham chiếu mảng. Copy-on-write chỉ thay object của ô
   thật sự đổi, nên một phép so tham chiếu mỗi ô — rẻ, không đụng canvas — tìm ra
   đúng vài ô. → **405**.
2. **Nhớ MÀU đã vẽ của từng ô.** Ô đổi object chưa chắc đổi màu, và phần lớn là
   không: màu chỉ phụ thuộc nền, đất cày, ẩm, công trình, vật thể, và cây **đã
   chín hay chưa** — `grow` không nằm trong công thức. → **45**.

Content đổi (OTA) thì bảng màu đổi theo, phải vẽ lại **hết**.

**Kịch bản 139** canh cả hai chiều, và chiều thứ hai mới quan trọng: vẽ ít đi thì
dễ, vẽ ít mà vẫn **đúng** mới khó. Nó dựng bản đồ nhỏ trên một DOM giả có **ghi
lại ảnh thật sự vẽ ra**, chạy một chuỗi thay đổi thật qua nhiều khung, rồi dựng
một bản đồ nhỏ **mới tinh** cho vẽ một lần trên state cuối — và đòi hai bức ảnh
khớp **từng ô**. *Một cache vẽ ít mà trôi dần thì tệ hơn hẳn không có cache.*

---

## 12. Lớp bão hoà mùa — bài học cũ còn nguyên giá trị

Mùa thu/đông từng vẽ một `fillRect` với `globalCompositeOperation = "saturation"`
phủ **toàn canvas ở độ phân giải thiết bị, mỗi khung**. Blend không tách kênh là
thứ chậm nhất Canvas2D có — 24 trong mỗi 48 ngày, và **vô hình nếu chỉ thử vào
xuân hạ** (14,0 ms → 6,9 ms khi sửa).

Giờ là `filter: saturate()` trên **phần tử** canvas (trình ghép GPU lo), còn lớp
màu mùa là một `div` nằm **ngoài** tầm bộ lọc — nên sắc vàng mùa thu không bị rút
theo cảnh. Chỉ đụng DOM khi **sang mùa**.

Bài học: **thứ chậm nhất thường vô hình ở cấu hình bạn hay thử nhất.**

---

## 12. Camera

Chọn khung nhìn theo **số ô**; chọn hệ số phóng **nguyên** khi có thể (pixel art
phóng theo hệ số lẻ thì ô pixel to nhỏ không đều); **snap camera về world px
nguyên** để chống rung.

Camera **luôn bám nhân vật**. Chấm hết. Đợt 7 từng cho nó bám con vật đang mở bảng
— nghe hợp lý, và là lỗi gặp ngay từ lúc mở game: cái id ấy bị đặt bởi những cú
chạm không hề định mở bảng, rồi không gì xoá nó khi nhân vật đi, nên camera theo
con bò còn nhân vật đi ra khỏi khung.

---

## 13. Autotile

Bờ nước và mép luống tính **lúc vẽ**, chỉ nhìn bốn hàng xóm — state không lưu gì
thêm. Ô đã cày giáp ô chưa cày được viền; ô nước giáp đất được phủ bọt. Nhà tự nối
theo mặt nạ bốn hướng.

Bộ đệm bốn cạnh **dùng lại** cho mọi ô nước — không cấp phát mỗi ô mỗi khung.

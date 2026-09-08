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

Đọc ra ngay: **cả phần mô phỏng gộp lại tốn 0,2% một khung hình**, còn **một lần
gọi A\* tốn gấp năm mươi lần tất cả những thứ đó cộng lại**. Mọi thứ khác là
nhiễu. Đó là lý do tối ưu chỉ đụng vào đúng hai chỗ: A\* và bản đồ nhỏ.

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

## 10. Lớp NỀN được cache, và mưa thành một mảng lặp

Đợt 15 đã tìm ra chỗ tốn nhất *của HUD*. Đợt 23 hỏi tiếp câu ấy cho **thế giới**,
và đo trước khi sửa: phần mô phỏng tốn **0,2%** ngân sách một khung hình, tức
không còn gì để lấy ở đó. Chỗ tiền nằm ở lớp vẽ.

Cảnh đo: 285 ô nhìn thấy · đêm · bão · 28 thực thể.

| | Trước | Sau |
|---|---|---|
| `drawImage` mỗi khung | **600** | **149** |
| thời gian vẽ mỗi khung | **0,90 ms** | **0,30 ms** (−67%) |

Hai chỗ, và cả hai đều là *"thứ này có cần vẽ lại mỗi khung không?"*:

**Nền.** Mỗi ô nhìn thấy tốn ít nhất một `drawImage`, ô đất cày tốn tới sáu (nền ·
lớp đất · viền bốn cạnh) — quá nửa số lệnh của cả khung. Nhưng nền chỉ đổi khi
một ô đổi, khi camera trôi sang ô mới, hoặc khi trời bắt đầu mưa. Nên nó được vẽ
một lần vào canvas phụ (rộng hơn khung nhìn ba ô mỗi bên) rồi dán lại.

Khoá vô hiệu hoá là phép so **THAM CHIẾU** `s.tiles`: mảng ô là copy-on-write nên
một ô đổi là cả mảng đổi. Rẻ nhất có thể, và không có cách nào nó bỏ sót — miễn
là mọi đường sửa ô đều đi qua `dTile`. Kịch bản 159 là dây bẫy cho đúng điều kiện
ấy: sửa một ô tại chỗ thì nó đỏ, vì lỗi đó sẽ làm cache đứng hình mà không ai
thấy ngoài người chơi.

Mặt nước và bọt sóng **không** vào cache (chúng động mỗi khung); danh sách ô nước
được ghi lại lúc dựng cache nên khung sau không phải quét lại cả vùng để tìm.

**Mưa.** 110 lệnh vẽ mỗi khung khi bão — hơn một phần ba tổng số — cho một thứ
trang trí. Và vì vị trí hạt băm lại theo từng nhịp 1/10 giây, cả màn mưa *nhảy
cóc* mười lần mỗi giây. Nay mưa là một **mảng lặp** 64×64 tô kín màn bằng đúng
một `fillRect`, gốc mảng trôi liên tục theo thời gian: rẻ hơn hai bậc **và** rơi
mượt thật. Bão dùng hai lớp lệch pha — vẫn chỉ hai lệnh.

> Chỗ trống ấy tiêu vào đâu: bốn hệ đồ hoạ mới của cùng đợt (cây theo mùa, khói
> bếp, bướm, đom đóm). Đo lại với **51** thực thể — gần gấp đôi cảnh gốc — vẫn là
> 252 lệnh và 0,51 ms, tức vẫn rẻ hơn hẳn mốc 600 lệnh / 0,90 ms ban đầu.

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

# Spec lối chơi

Đây là **hợp đồng luật chơi**: cái gì xảy ra, theo thứ tự nào, và vì sao nó được
quyết như thế. Con số cụ thể nằm ở content (xem [`CONTENT.md`](CONTENT.md)) và
đổi được qua OTA; tài liệu này mô tả **cơ chế**, thứ không đổi khi chỉnh số.

Đọc kèm: [`KIEN-TRUC.md`](KIEN-TRUC.md) (mã chạy ra sao) ·
[`GIAI-THUAT.md`](GIAI-THUAT.md) (máy tự quyết định thế nào) ·
[`MOBILE-UX.md`](MOBILE-UX.md) (chạm và nhìn) · [`NHAN-DIEN.md`](NHAN-DIEN.md)
(trang Luật chơi trên web sinh từ chính những luật này) · [`TIEN-DO.md`](TIEN-DO.md)
(đã làm tới đâu).

---

## 1. Một ngày trong nông trại

Ngày bắt đầu **06:00** (`dayStartMinutes`), sập tối lúc **19:00**
(`daylightEndMinutes` = 1140 phút), và **26:00** (`dayEndMinutes` = 1560) là mốc
ngất — quá giờ mà chưa lên giường thì gục tại chỗ, mất một phần năng lượng
(`passOutEnergy`).

Đồng hồ chạy **liên tục** theo thời gian thật: `realSecondsPerGameTenMinutes` = 5,
tức 5 giây thật = 10 phút game, một ngày ≈ 10 phút thật.

Vòng lõi:

```
CÀY → GIEO → TƯỚI → (chờ cây lớn) → THU → BÁN → mua đồ tốt hơn
```

Mỗi thao tác tốn **năng lượng** (`energyCost`) và **khoá** nhân vật
`actionSeconds` = 0,42 giây. Thao tác chỉ **có hiệu lực** ở mốc `actionImpact`
= 0,5 giữa khoảng đó — trước mốc là giơ công cụ, tới mốc mới chạm đất. Nhờ vậy
mắt thấy đúng thứ tự *vung → chạm → kết quả*, và bấm loạn không nhanh hơn.

> **Hệ quả cho test:** thao tác có **hiệu lực TRỄ**, nên ngay sau khi ra lệnh thì
> không thể biết nhát này ăn hay trượt. Chỗ nào cần biết thì đếm bộ đếm thống kê,
> đừng so state ngay lập tức. Xem [`GIAI-THUAT.md`](GIAI-THUAT.md#8-tự-động-làm).

### Thời tiết đổi hành vi

Mỗi ngày một kiểu thời tiết (content `weather.json`), và từ Đợt 21 kiểu ấy không
chỉ nhân lên tốc độ cây lớn mà còn đổi **việc mọi người và mọi con vật làm**,
qua đúng ba cờ, đều **tắt khi ở trong nhà**:

| Cờ | Mưa | Bão | Nghĩa |
|---|---|---|---|
| `speedMul` | 0,85 | 0,7 | mọi thứ ngoài trời đi chậm lại: người chơi, vật nuôi, người làm, xe, thuyền |
| `shelter` | ✓ | ✓ | vật nuôi **trú**: có chuồng thì về/ở yên trong chuồng (co ro, không loanh quanh), thả rông thì nép gốc cây gần nhất. Con **đói vẫn ra ăn** — mưa dầm ba ngày mà nhịn là mất trứng |
| `halt` | — | ✓ | **ngưng việc ngoài trời**: người làm về đứng ở ô giao nhận trước kho tới sáng (không tốn sức, không hồi sức); xe thu mua và thuyền buôn **không ghé** (thuyền không bù ngày); con đói cũng **không** ra bãi cỏ — một ngày, chịu được |

Ba cờ đọc thuần từ content, **không rút một hạt ngẫu nhiên nào** — xúc xắc xe
thu mua vẫn được rút ngày bão rồi mới bị gác, để thêm luật bão không làm ngày
nắng kế tiếp đổi kết quả. Gió (`wind`) vẫn chỉ là **lớp vẽ**: cây lay, mưa
nghiêng, lá bay, vũng nước — không vào luật.

### Ngủ và sang ngày

Ngủ trên **giường** (không phải cửa nhà). Thứ tự khi sang ngày là **hợp đồng, không
được đảo** — `newDay` trong `src/game/newday.ts`:

| # | Bước | Vì sao đúng chỗ đó |
|---|---|---|
| 1 | `day++`, đồng hồ về 06:00 | |
| 2 | Gom điện của **mọi** bản đồ vào một quỹ | lưới điện chỉ có một |
| 3 | Vòi tưới đánh dấu ô ẩm | **trước** bước 4, nếu không vòi luôn chậm một ngày |
| 4 | Cây lớn: cộng nốt **phần ban ngày còn lại** của hôm qua | ngủ sớm không bị phạt |
| 5 | Làm khô ô không được tưới; cỏ lan; đất cày bỏ hoang | |
| 6 | Tiêu điện từ quỹ bước 2 | |
| 7 | Hồi năng lượng (`sleepRestore`, phạt `lateSleepPenalty` nếu ngủ muộn) | |
| 8 | Đánh giá tiến trình | |

**Mọi bước chạy trên MỌI bản đồ.** Ngủ trong nhà thì ngoài ruộng vẫn phải lớn, vẫn
bị khô, vẫn mọc cỏ. Ngược lại `TICK` (mỗi khung hình) chỉ đụng bản đồ **đang
đứng** — bản đồ đã cất chỉ được quét một lần mỗi đêm.

---

## 2. Cây trồng

**61 cây.** Mỗi cây khai `growthDays` (mảng — số ngày cho từng giai đoạn),
`seasons`, giá hạt, giá bán, `energy` (ăn được), và tuỳ chọn `regrowDays` (thu
xong mọc lại).

### Lớn theo THỜI GIAN, không nhảy cóc lúc ngủ

`CropInstance.grow` đếm **phút game**, không đếm ngày. Mỗi TICK, ô **còn ẩm** và
`minutes < daylightEndMinutes` thì cộng thêm; đủ `growthDays[stage] ×
growthMinutesPerDay` là sang giai đoạn. Cây lớn **trông thấy trong ngày**.

`growthMinutesPerDay` = 700, **cố ý nhỏ hơn** độ dài ban ngày (1140 − 360 = 780).
Đặt bằng đúng 780 thì gieo giữa buổi luôn hụt vài chục phút và tốn thêm trọn một
đêm — tức con số `growthDays` không còn đúng nghĩa "số ngày". Chừa biên 700 thì
gieo bất cứ lúc nào trước ~17:00 vẫn chín đúng số ngày đã ghi.

### Mùa

Mùa **không nằm trong save** — suy ra từ `day`. Thêm một trường nữa chỉ tạo cơ hội
cho hai nguồn sự thật lệch nhau. Đổi `daysPerSeason` qua OTA thì lịch dịch theo,
và đó là hành vi đúng.

* Cây ngoài mùa: **gieo không được**.
* Sang mùa: cây **chưa chín** mà trái mùa thì **héo**.
* Cây **đã chín** thì không sao — không bao giờ mất một vụ đang chờ gặt. Mất giống
  và mất công chăm là đủ đau để phải tính trước; cướp vụ đã chín chỉ làm hậm hực.
* Ô `allSeason` (sàn nhà kính) miễn nhiễm tất cả.

### Bệnh

Mỗi đêm, cây **đang lớn** (chưa chín, khoẻ) có `diseaseChance` = 2% nhiễm bệnh;
kề cây bệnh thì × `diseaseNeighbourMul` = 3, nên bệnh **lan theo luống** nếu bỏ
mặc. Cây bệnh: không lớn, thu chỉ được `sickYieldMul` = 50% sản lượng. Chữa bằng
thuốc, hoặc nhổ bằng cuốc.

### Bỏ bê thì ruộng hoang

Ô đã cày mà bỏ không đủ `tilledIdleDays` = 3 đêm thì **mọc cỏ** và trở lại địa
hình ban đầu. Cỏ dại lan sang ô cỏ trống kề bên với `grassSpreadChance` = 10% mỗi
đêm.

---

## 3. Vật nuôi

**8 loài** + **2 loài sâu bọ**. Mỗi loài khai `pen` (thuộc khu nào), `housing`
(cạn hay `water`), `feed` (ăn được những gì), `fedMinutes` (no bao lâu),
`matureDays`, `starveDays`, `products`, `meat`, `speed`, `box`.

### Khu chuồng dựng sẵn

Nông trại **chia lô sẵn**: `tiles.json:pens` khai ruột từng khu, `farm.ascii` vẽ
hàng rào, mỗi loài khai mình thuộc khu nào. Người chơi **không** phải tự đóng
rào — đóng bằng tay thì mỗi ván một kiểu và chẳng ván nào ra hình cái chuồng.

### Máng là CỬA DUY NHẤT cho thức ăn

Không có "cho ăn trực tiếp". Thức ăn vào bằng **máng** (trên cạn) hoặc **rắc hồ**
(dưới nước).

Máng là một **bể ĐIỂM**, không phải một ngăn đựng món:

* Món nào cũng đổ được, **trộn chung**, trần `troughMax` = 60 điểm.
* Món **giá cao thì no lâu** — một điểm là một điểm, bất kể nó đến từ rơm hay ngô.
* **Khu** quyết định ăn gì (`pen.feed`), không phải con vật. Nên bò, dê, cừu —
  ba loài cùng ăn rơm — dùng **chung một máng**, đúng như chuồng gia súc thật.
* Gà vịt (`feed: null`) mổ sâu trên cỏ nên khu của chúng **cố ý không có máng**.

### Cỏ trên bản đồ là thức ăn THẬT

Con vật đói nhắm bụi cỏ gần nhất, đi tới, ăn — và **bụi cỏ biến mất**. Một đàn
đông sẽ gặm trụi khu quanh chuồng, nên phải để chừa cỏ hoặc cắt cỏ tích rơm. Đó
mới là một quyết định.

Hết cỏ thì đói tiếp, quá `starveDays` thì chết. Chết đói vẫn có thật — chỉ là giờ
nó có **nguyên nhân nhìn thấy được**.

### Con chó

Đi tuần thật: ban ngày qua từng khu, bắt sâu bọ, tối thì **về nhà nằm**. Có nhà
riêng và máng riêng.

---

## 4. Người làm thuê

Thuê `hireFee` = 900đ, lương `wage` = 220đ mỗi `wageEveryDays` = 3 ngày.

Mọi người làm cùng **một** thang việc và **tự phán đoán thứ tự ưu tiên**, làm
**tuần tự** từng việc một. (Vai *chăm cây* / *chăn nuôi* đã bỏ từ core 1.39: nhánh
chăn nuôi vốn bị khoá sau một cái vai mà nhánh cây trồng thì chạy cho cả hai, nên
người "chăn nuôi" xưa nay vẫn đi làm ruộng.)

> "Tự phán đoán" nghĩa là họ tự nhìn ra việc gì đang cần, **không** phải mỗi lần
> lại chọn khác. Thứ tự ưu tiên là **cố định**. Người chơi phải đoán được người
> làm sẽ làm gì — nếu không thì thuê người thành thả một con rối vào ruộng.

Họ cày, gieo, tưới, thu, chữa bệnh, đổ máng, **dọn cỏ dại trong lô**; rảnh thì
đi kiếm gỗ đá **trong rừng** (không đụng cảnh quan người chơi trồng). Có năng lượng riêng
(`energyPerTask` = 4, nghỉ khi dưới `restBelow` = 15, nghỉ `restMinutes` = 90).
Đầy tay (`carryMax` = 24) thì đem về **kho tập trung**.

**Không giẫm chân nhau:** mỗi người một ô, một con vật. Việc đã có người nhận bị
lọc **ngay trong vòng chấm điểm**, nên người thứ hai nhận **việc kế tiếp** thay vì
đứng phí một lượt.

### Một thang việc, hai bộ não

`CROP_ORDER` (`src/game/joborder.ts`) là **hằng thứ tự dùng chung** cho cả người
làm lẫn nút "tự động làm":

```
ĐỔ MÁNG · RẮC HỒ → THU → CHỮA → GIEO → TƯỚI → DỌN CỎ → CÀY
```

> Tài liệu này từng ghi hai bên "dùng chung một hàm" — nhưng chưa bao giờ đúng:
> một bên là danh sách chuỗi, một bên là bảng số gõ tay. Chúng đã trôi khỏi nhau
> đúng như cảnh báo ngay bên trên, và tới Đợt 22 thì nút tự động gieo trước tưới
> còn người làm tưới trước gieo. Nay chỉ còn **một hằng**; hai hàm quét vẫn riêng
> (một bên đo từ người chơi, một bên đo từ chỗ người làm đứng), nhưng thứ tự thì
> không thể lệch nữa.

**Trời ướt thì TƯỚI tụt xuống cuối** — sáng mai ruộng ngoài trời tự ẩm, tưới hôm
nay là đổ nước xuống thứ trời sắp làm hộ.

### Dọn cỏ dại: "mở rộng vườn"

Cỏ dại lan vào lô mỗi đêm và luống bỏ hoang tự mọc cỏ lên chính nó; mà một ô có
vật thể thì **không cày được**. Trước Đợt 22 không ai được phép dọn nó — người làm
chỉ dọn trong rừng, nút tự động thì cố ý không dọn gì — nên **một lô bỏ bê là một
lô chết vĩnh viễn**.

Nay cả hai dọn được, trong đúng một lằn ranh rút từ content: **nhổ được bằng tay
không** (`!prop.tool`) + **tự mọc qua đêm** + **trong lô ruộng**. Ba vế cộng lại
loại đúng hai vật thể `portable` duy nhất — hòn đá và khúc gỗ — tức đúng hai thứ
người chơi vác đặt xuống được. Cây và đá vẫn phải bấm tay như xưa.

### Hết vật tư thì ĐÒI, không tiêu tiền

Kho **đầy** thì xưa nay có báo; kho **thiếu** thì im lặng tuyệt đối — mà thiếu mới
là thứ người chơi sửa được trong một phút. Nay người làm treo một lời kêu
(`worker.want`) khi họ rảnh **vì** hết hạt đúng mùa, hết cám cho khu đang đói, hoặc
hết thuốc mà ruộng có cây bệnh. Lời kêu hiện ở ba chỗ: bong bóng trên đầu, dòng
trên thẻ người làm, và một chip ở HUD gộp lời của cả đội. Báo **đúng một lần** cho
mỗi món; hàng về thì chip tự tắt.

**Họ không bao giờ tiêu tiền của người chơi.** Nút tự động cũng vậy: nó nói "hết
hạt đúng mùa" thay vì tắt lặng lẽ.

### Rảnh việc thì làm việc vặt, không đứng đực

Hết cả việc ruộng lẫn việc rừng thì họ đi một vòng nông trại, đứng nói chuyện với
đồng nghiệp, vuốt ve con vật, hoặc bốc xếp cho chiếc xe đang đậu. **Chỉ là diễn
hoạt** — không đổi một con số cân bằng nào.

Ba việc xã giao **không tốn một lần tìm đường nào**: chúng chỉ xảy ra khi đối
tượng đã đứng ngay cạnh, và người làm quay mặt về phía đó chứ không đi tới. Chỉ
"đi một vòng" mới xin đường, và nó chịu một cái nguội rộng gấp bốn lần thường —
ngân sách tìm đường dùng chung với cả đàn vật nuôi, nên người rảnh không được
phép giành nhịp của một con bò đang đói.

**Bão thì trú** (content `halt`): là một **cổng đứng trước** thang ưu tiên, như
nhánh nghỉ mệt — không xen vào thang, nên thang vẫn cố định và người chơi vẫn đoán
được: trời bão, người làm về đứng ở ô giao nhận trước kho cho tới sáng.

---

## 5. Mua bán và xe cộ

**Chợ** và **Quầy thu mua** đứng **hai đầu** nông trại, không ô nào bấm trúng cả
hai.

Mua một con vật thì **có xe thật** chạy từ **cổng** ở mép bản đồ, theo đường nhựa
vào **điểm giao** cạnh kho, thả hàng, rồi quay ra. Con vật tự đi về khu của nó.
Chở **cá** thì xe đậu ở **bờ ao** — thả ở bãi rồi để con cá "hiện ra" dưới nước
chính là kiểu dịch chuyển tức thời mà cả hệ xe cộ sinh ra để tránh.

Xe **chỉ đi trên đường nhựa và lối đi**, không lội qua ruộng — đó là thứ cho con
đường một lý do tồn tại thật sự. Trần `MAX_VEHICLES` = 3 chiếc cùng lúc; bãi đầy
thì xe xếp hàng ngoài đường.

**Xe thu mua** ghé lấy nông sản trong kho, trả cao hơn quầy một chút (`buyBonus`).
**Thuyền buôn** ghé bến biển ba ngày một lần bán gỗ/đá/sợi cỏ. Ngày **bão**
(`halt`) cả hai không tới, và thuyền không bù ngày — nhịp vẫn tính từ `day`.

Cửa hàng bán **mọi thứ ngay từ đầu** — có tiền là mua được. Không có "??? chưa mở
khoá": bày ra bốn ô khoá là bày bốn lời hứa mà người chơi không làm gì được với
chúng.

---

## 6. Tiến trình

**18 nấc** + **12 mục tiêu**. Nấc chỉ **đánh dấu chặng đường**, phát thưởng
(`reward: { money?, items? }`) và nói một câu chúc mừng — **không mở khoá hàng
hoá**. Xem lại được ở **Nhật ký nông trại**.

Khoá `require` hiểu: `money`, `day`, `tilled`, `planted`, `watered`, `harvested`,
`sold`, `earned`, `built.<id>`. Khoá lạ coi như **không bao giờ thoả** — an toàn
khi content mới dùng khoá mà core cũ chưa biết.

**Thưởng tràn balo thì vào kho**, không rơi mất.

---

## 7. Chế biến, ăn, và hạ tầng

**17 công thức**: một nguyên liệu → một món bán lãi 25–35% (phô mai, cuộn len, cà
phê rang, mứt dâu, chả cá, xúc xích…).

**Ăn để hồi sức**: mọi cây và trứng/sữa có `energy`. Đây là đầu ra **thứ hai** cho
cả 61 cây mà không phải ép mỗi cây một công thức.

**Tiền có chỗ tiêu**: vòi tưới cần **ống nước**, nhà kính cần **tấm kính** — hai
vật tư **chỉ mua được**, không chế từ gỗ đá. Không có chỗ tiêu thì tiền hết ý
nghĩa.

**Đường nhựa** là **nền** vẽ sẵn trong `farm.ascii`, không phải công trình mua
được.

---

## 8. Điều khiển

**Một lúc chỉ một chế độ** — chạm, tay cầm, hoặc bàn phím+chuột — và nó theo
**thiết bị vừa được dùng**, không theo "máy có màn cảm ứng hay không". Chi tiết ở
[`MOBILE-UX.md`](MOBILE-UX.md).

**Nút chính là MỘT NGUỒN** (Đợt 21): `pressPlan` trong `src/game/hint.ts` trả
về đúng một `Press` — *dùng ở ô này / thu con này / mở vật thể này / đi tới rồi
làm / chuyến / từ chối kèm lý do* — và **cả nhãn trên nút lẫn cú bấm** đều đi
từ nó. Thứ tự: công trình đang cầm → con vật tới lứa ở ô ngắm → việc của món
đang cầm ở ô ngắm → thuyền buôn kề bên → vật thể ở ô ngắm → quanh chân
(việc của khu, ô gần nhất làm được, vật thể trong hai ô) → chuyến → lý do. Ô ngắm
là **một** ô cho cả HUD lẫn cú bấm; tầm với là **một** luật (của reducer); con vật
là **một** bán kính. Nhãn không thể nói khác cú bấm vì nó là hình chiếu của cú bấm.

Ba cách làm việc, khác nhau ở đúng một điểm:

| | Đổi tay? | Phạm vi |
|---|---|---|
| **Bấm nút DÙNG** | không | đúng ô đang ngắm |
| **CHUYẾN** (nút chính) | **không bao giờ** | mọi khu mà **món đang cầm** làm được việc |
| **AUTO** | **có** — THU → CHỮA → GIEO → TƯỚI → CÀY | quanh nhân vật |

**Chuyến** làm **gọn từng lô**: khu đang dở còn việc thì làm hết rồi mới sang khu
kế — "ô gần nhất" luân phiên giữa hai lô kề nhau trông rất lung tung, dù mỗi bước
đều đúng là gần nhất.

AUTO tự tắt khi: người chơi tự cầm lái, quanh đây hết việc, hoặc **4 giây không có
tiến triển**.

---

## 9. Ranh giới: cái gì KHÔNG nằm trong luật chơi

Ba thứ trông như luật chơi nhưng **cố ý không phải**:

* **Đích đang đi tới** (bấm-để-đi) — ý định nhất thời của người chơi, không vào save.
* **Hạt bụi, giọt nước, lấp lánh, dấu đích** — trang trí của lớp vẽ, không vào save,
  không ảnh hưởng luật.
* **Mùa** — suy ra từ `day`, xem mục 2.

Vì sao quan trọng: mọi thứ **trong** state đều phải qua reducer, chịu kiểm bất
biến, và migrate được qua OTA. Xem [`KIEN-TRUC.md`](KIEN-TRUC.md#3-một-cửa-duy-nhất).

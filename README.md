# OniFarm

Game nông trại **hiện đại** phong cách pixel, **chơi offline hoàn toàn**.
Cày → gieo → tưới → ngủ → thu hoạch → bán, rồi nâng cấp lên vòi tưới tự động,
nhà kính, pin mặt trời và drone thu hoạch.

**Chơi ngay: https://oni-farm.pages.dev/farm/** — điện thoại, tablet hay máy tính.

**Thiết kế cho ngón tay cái:** chạm để đi, nút hành động tự biết việc (CÀY / GIEO /
TƯỚI / THU / MUA…), nhân vật luôn ở tâm, menu kiểu bottom-sheet, tay thuận trái/phải,
cỡ chữ, khung nhìn, rung, giảm chuyển động. Chi tiết ở [`docs/MOBILE-UX.md`](docs/MOBILE-UX.md).

**Static site thuần** — không server, không backend, không bước đóng gói native.
`npm run build` ra một thư mục `dist/` thả lên bất kỳ host tĩnh nào là chạy.
Web nhiều trang (trang chủ + trang giới thiệu), game nằm ở **`/farm/`**.
Nội dung game cập nhật được **OTA** mà không cần build lại bundle.

---

## Chạy

```bash
npm install
npm run dev        # http://localhost:1420  → trang chủ, game ở /farm/
```

| Lệnh | Việc |
|---|---|
| `npm run dev` | Dev server (đặt `PORT=xxxx` nếu 1420 đã bận) |
| `npm run build` | Build content + xuất static site vào `dist/` |
| `npm run preview` | Xem thử bản build tĩnh ở cổng 1421 |
| `npm run content:build` | Biên dịch + kiểm content, xuất pack OTA |
| `npm run test:sim` | 40 kịch bản mô phỏng game (gợi ý hành động, parse cài đặt, hiệu lực trễ, SWAP balo, ô kế tiếp), Node thuần |
| `npm run test:ota` | Kiểm cổng tương thích + schema của content pack |
| `npm run test:all` | typecheck + cả hai bộ test |
| `npm run icons` | Sinh lại icon PNG |
| `npm run deploy` | Build + deploy toàn bộ site lên Cloudflare Pages |
| `npm run deploy:content` | **Chỉ** đẩy content pack mới — không đụng bundle web |

---

## Chơi thế nào

**Điện thoại / tablet**

| Cử chỉ | Việc |
|---|---|
| Chạm 1 lần vào ô | Nhân vật tự **đi tới** (tìm đường, tự chạy khi xa), ngắm sẵn ô đó |
| Chạm 2 lần | **Làm ngay** tại ô đó |
| Nút lớn góc dưới | Ghi đúng việc sẽ làm: **CÀY · GIEO · TƯỚI · THU · CHẶT · ĐẬP · ĐẶT · MUA · BÁN · CHẾ · NGỦ · VÀO · MÚC**. Ô xa thì bấm là tự đi tới rồi làm. Không làm được thì nói vì sao |
| **Giữ** nút lớn (hoặc bấm liên tục) | Xong nhát này tự sang **ô kế tiếp trong tầm công cụ**, cùng loại việc — cày cả luống mà không phải ngắm từng ô. Hết ô quanh chân thì dừng |
| Nút 🎒 cạnh hotbar | Mở **balo**: hotbar cố định 10 ô, phần túi còn lại (14 ô) nằm trong balo; chạm-chọn hoặc kéo thả để đổi chỗ |
| Nút E | Tương tác thứ trước mặt |
| Nhấn giữ ô hotbar | Xem vật phẩm dùng làm gì |
| Chạm bản đồ nhỏ | Đi xa |
| ☰ | Tạm dừng: lưu, tải, **Cài đặt**, hướng dẫn, cài về màn hình chính |

Mặc định không có joystick; bật được trong Cài đặt cùng tay thuận, cỡ giao diện,
khung nhìn gần/xa, rung, giảm chuyển động. Lần đầu chơi có hướng dẫn 4 bước khoanh
đúng vào nút.

**Máy tính**

| Phím | Việc |
|---|---|
| `W A S D` / mũi tên | Di chuyển · giữ `Shift` để chạy |
| `Space` | Dùng vật phẩm đang cầm lên ô đang ngắm |
| `E` | Tương tác — cửa, giường, máy bán hạt, quầy, giếng |
| `1`–`9`, `0` / lăn chuột / `Tab` | Chọn ô hotbar (10 ô) |
| `I` | Mở balo |
| Giữ `Space` | Tự sang ô kế tiếp trong tầm, cùng loại việc |
| `B` · `M` | Mở cửa hàng · bật/tắt bản đồ nhỏ |
| `Esc` | Tạm dừng: lưu, tải, cài đặt, xuất/nhập file save |
| Bấm chuột 1 / 2 lần | Đi tới ô đó / làm ngay tại ô đó |

**Luật quan trọng nhất:** cây chỉ lớn nếu ô **được tưới trong đêm đó**. Nhìn màu
đất là biết — đất sẫm nghĩa là đêm nay cây sẽ lớn.

**Lộ trình:** xà lách (3 ngày) → thu 5 cây mở cà chua → đủ 800đ mở vòi tưới +
nhà kính → ngày 8 mở pin mặt trời → có pin mới dùng được drone → đủ 3.000đ mở bí đỏ.

---

## Kiến trúc

Trục chính của dự án là **tách CORE khỏi CONTENT**, phát biểu thành một câu luật:

> **Content là DỮ LIỆU THUẦN, không bao giờ là code.**
> Thứ gì cần code mới → phát hành core. Thứ gì chỉ là số/chuỗi/bảng → đẩy OTA.

Luật này vừa là ranh giới kỹ thuật, vừa là ranh giới **bảo mật**: không bao giờ
có chuyện tải code lạ về chạy.

```
input ─▶ dispatch(action) ─▶ reduce() ─▶ state mới ─▶ render + HUD
                                 │
                                 └─▶ save = snapshot của state
```

Một chiều duy nhất. UI **không bao giờ** sửa state trực tiếp — muốn thêm cơ chế
thì thêm `Action`, không thêm biến toàn cục.

```
src/
  content/     ⭐ LÀN NHANH — dữ liệu thuần, đẩy OTA được, không cần build lại
  core/        ⭐ LÀN CHẬM  — engine, store, save, OTA; phải phát hành mới đổi được
  game/        ⚠️ KHÔNG chạm DOM — logic thuần, chạy thẳng trong Node để test
  game/hint.ts ⚠️ gợi ý hành động theo ngữ cảnh cho nút chính — thuần, có test
  art/         sinh toàn bộ pixel art bằng code (viền, 6 khung nhân vật, autotile bờ/mép, icon HUD)
  render/      vẽ canvas, chỉ ĐỌC state; hạt hiệu ứng + lấp lánh + viền rừng là trang trí, không vào state
  ui/          HUD + modal + tutorial bằng DOM
  core/settings.ts  tuỳ chọn của MÁY (tay thuận, cỡ chữ, zoom, rung…) — parse thuần, không vào save
  core/haptics.ts   rung nhẹ khi thao tác (Android)
  farm/        vỏ trang game (/farm/)
  index.html + tinh-nang/ + huong-dan/ + tai-ve/ + privacy/   site tĩnh
```

Ba ràng buộc giữ kiến trúc không mục theo thời gian:

1. **`src/game/` không chạm DOM** và **không import `src/content/`** — content
   luôn được truyền vào qua tham số. Nhờ vậy test bơm được content giả, OTA tráo
   được content lúc chạy, và toàn bộ logic chạy headless trong Node.
2. **`reduce()` là hàm thuần**, không dùng `Date.now()`/`Math.random()` — ngẫu
   nhiên lấy từ `state.seed`. Đây là điều kiện để save/replay/test tái lập được.
3. **Mọi import tương đối có đuôi `.ts`** — bắt buộc để Node chạy TypeScript ở
   chế độ strip-only. Cũng vì lý do đó: **không dùng** parameter property
   (`constructor(private x)`), `enum`, `namespace`, decorator.

### Vì sao không dùng game engine

Thể loại này là **lưới ô + máy trạng thái theo ngày**, không phải physics.
Phaser/Kaboom kéo state vào object của engine (Sprite, Scene, Body) → khó
serialize để save, khó nạp nóng content pack, không test headless được. Model
JSON thuần là thứ làm cho **save + OTA + test** cùng chạy được bằng một cơ chế.
Bản build hiện tại ~155KB (57KB gzip), zero dependency runtime.

Nếu sau này thật sự cần particle/chiến đấu/nhiều scene: bọc Phaser làm **lớp
view thuần** bên trên model hiện có — model không phải viết lại.

### Địa hình khai thác được

`src/content/props.json` là nguồn sự thật duy nhất cho **mọi vật thể đứng trên ô** — cây gỗ
lớn/nhỏ, gốc cây, đá, bụi cỏ, giếng, giường, bàn chế tạo, tường, cửa. Trước đây "đặc hay
không" và "tương tác được gì" nằm rải trong `tiles.json` cộng một `switch` trong renderer;
giờ gom hết về một chỗ, nên **thêm một loại địa hình = thêm một object JSON**:

```json
{ "id": "rock", "name": "Tảng đá", "solid": true,
  "hits": 3, "tool": "MINE",
  "drops": [{ "id": "item:stone", "min": 2, "max": 4 }],
  "art": { "body": "#8a8f98", "dark": "#6b7078", "accent": "#a2a8b1" } }
```

- `hits` + `tool` = khai thác được. Không khai `tool` thì tay không cũng phá (bụi cỏ).
- `becomes` = phá xong để lại gì — cây lớn để lại **gốc cây**, chặt tiếp mới hết.
- `tool.power` trong `items.json` = số nhát ăn mỗi lần vung, nên rìu thép đỡ đúng một nửa công.
- Id lạ (content OTA mới, core chưa biết vẽ) vẫn ra hình mặc định và **coi là đặc** — thà xấu
  còn hơn để người chơi đi xuyên qua thứ đáng lẽ chặn đường.

`Tile.hp` giữ số nhát còn lại; renderer vẽ vạch vàng trên đầu vật thể đang bị đánh dở, vì
không có phản hồi đó thì người chơi bổ mấy nhát rồi tưởng vô ích.

### Chế tạo

`recipes.json`. Nguyên liệu có thể là **vật liệu hoặc chính công cụ cũ**, nên nâng cấp công cụ
chỉ là một công thức ăn cả cái cũ lẫn vật liệu — không cần cơ chế "nâng cấp" riêng. Bàn chế
tạo là một prop có `interact: "CRAFT"`, đặt trong phòng ngủ.

### Nước có hạn

Bình tưới có `capacity`; mỗi lần tưới tốn một nước. Cạn thì ra **giếng** hoặc bờ ao —
cả hai đều là `interact: "REFILL"`, một cái khai ở prop, một cái khai ở `tiles.grounds.water`.

### Nhiều bản đồ rời nhau

Mỗi bản đồ là một **lưới riêng**: nông trại 40×30 (1200 ô), phòng ngủ 14×8 (112 ô).

Bản đầu nhét phòng ngủ vào một góc lưới 40×40 chung, độn **288 ô "hư vô"** chỉ để ngăn cách.
Số ô đó không vô hại: vẫn phải nạp, vẫn bị quét mỗi lần sang ngày, vẫn nằm trong file save,
vẫn hiện thành mảng đen trên bản đồ nhỏ. Tách ra thì **không ô nào tồn tại mà không tới được**.

**Cách biểu diễn:** bản đồ đang chơi nằm ở `state.tiles/w/h` như cũ, các bản đồ khác cất ở
`state.maps`. Nhờ vậy mọi thứ đọc `state.tiles` — va chạm, tìm đường, renderer — **không phải
biết gì** về chuyện có nhiều bản đồ, và mỗi khung hình chỉ duyệt đúng một lưới.
Bất biến đi kèm: `mapId` **không bao giờ** có mặt trong `maps` (`checkInvariants` canh).

Cửa là prop có `interact: "PORTAL"` kèm `portal: {map, x, y}`. Reducer **tự tra đích trong
content** thay vì nhận toạ độ từ UI, nên không ai nhảy bừa sang bản đồ hay toạ độ tuỳ ý.
Loader chặn ngay lúc kiểm pack: cửa trỏ tới bản đồ không tồn tại, hoặc ra ngoài biên bản đồ
đích, đều bị từ chối — đúng cái bẫy khi đẩy OTA đổi map mà quên chỉnh cửa.

Cửa nhà **chỉ để đi vào**; muốn ngủ phải lên **giường**. Camera được báo cả hai thay đổi khi
qua cửa: nhảy vị trí **và** `setWorld` kích thước mới — thiếu cái sau thì nó vẫn kẹp theo biên
bản đồ cũ.

**Bẫy lớn nhất của việc tách map:** ngủ trong nhà thì ngoài ruộng vẫn phải chạy. `newDay` xử
lý **mọi** bản đồ (tăng trưởng, vòi tưới, làm khô, drone, cỏ lan), còn `TICK` — chạy mỗi khung
hình — chỉ đụng bản đồ đang chơi.

### Hiệu năng, đo thật

| | Số đo |
|---|---|
| Ô của bản đồ đang chơi | 1200 |
| Ô thực sự **vẽ** mỗi khung hình | 289 → **75,9% không phải vẽ** |
| Thời gian một khung hình | **0,57 ms** (ngân sách 60fps là 16,7 ms) |
| Ô quét mỗi TICK | 1200, trước khi tách là 1600 → **giảm 25%** |

Nói cho công bằng: renderer **vốn đã** cắt theo khung nhìn từ trước, nên phần "chỉ vẽ cái cần
vẽ" không phải là cái mới. Cái mới là **không còn nạp và quét 288 ô không bao giờ tới được**,
và bản đồ nhỏ chỉ vẽ đúng nơi đang đứng.

### Cây lớn theo thời gian

`CropInstance.grow` đếm **phút game** thay cho số ngày. Ô còn ẩm và `minutes <
daylightEndMinutes` thì mỗi TICK cộng thêm, đủ `growthDays[stage] × growthMinutesPerDay` là
sang giai đoạn — nên cây lớn dần **trông thấy trong ngày** chứ không nhảy cóc lúc ngủ.

Lúc ngủ, phần ban ngày **còn lại** của hôm đó vẫn được cộng nốt. Thiếu chi tiết này thì ngủ
sớm bị phạt mất tiến độ, mà người chơi chẳng có cách nào đoán ra.

Cỏ dại lan sang ô cỏ trống kề bên mỗi đêm (`grassSpreadChance`), còn ô đã cày mà bỏ không thì
dần trở lại thành cỏ (`tilledDecayChance`) — bỏ bê là ruộng hoang.

### Bảng gỡ lỗi

`F2` hoặc `Esc` → *Bảng gỡ lỗi*. Cộng tiền, đầy năng lượng/nước, sang ngày mới, cho cây chín
hết, tự cày + gieo quanh nhân vật, rắc cỏ, rắc cây, mở khoá tất cả, +50 mỗi vật liệu.

Mọi thao tác gỡ lỗi đi qua **một action `DEBUG` trong reducer**, không phải UI thò tay sửa
thẳng state — giữ đúng luật "mọi thay đổi qua một cửa", nên nó cũng chịu kiểm bất biến như
mọi thứ khác.

### Hiển thị & camera

`src/render/camera.ts` là chỗ **duy nhất** trong dự án biết màn hình to nhỏ ra sao.
Mọi thứ khác — logic, tầm với, va chạm, đèn — tính bằng **world px** (1 ô = 16 world px):

```
world px ──▶ camera (rx, ry) ──▶ × scale ──▶ + letterbox ──▶ CSS px ──▶ × dpr ──▶ device px
```

**Khung nhìn định nghĩa bằng SỐ Ô, không bằng pixel.** Cạnh ngắn của màn hình luôn
thấy 9–14 ô (`MIN/MAX_TILES_SHORT`). Dưới 9 ô thì trên điện thoại nhân vật to đùng mà
không thấy gì quanh mình; trên 14 ô thì mỗi ô còn quá ít pixel, chi tiết pixel art nhoè
thành một đám màu, và trên desktop lớn thì lộ gần hết nông trại. Thực tế mọi khổ máy phổ
biến rơi vào 9,6–12,2 ô — chênh nhau chưa tới 1,3 lần.

**Hệ số phóng ưu tiên SỐ NGUYÊN.** Hai ràng buộc số ô ở trên đổi thành một dải cho scale,
rồi lấy số nguyên lớn nhất trong dải (nhiều chi tiết nhất mà vẫn đủ tầm nhìn). Chỉ khi màn
quá nhỏ để chứa nổi một bội nguyên nào mới dùng hệ số lẻ.

**Chống rung (shimmer).** Camera trôi ở toạ độ thực nhưng luôn *vẽ* ở world px nguyên
(`camera.rx/ry`), và offset letterbox được làm tròn về pixel thiết bị. Không có hai thứ này
thì mỗi khung hình các hàng pixel rơi vào ô màn hình khác nhau và cả cảnh trông như lăn tăn.
Đo thực tế khi đi bộ: bước nhảy camera tối đa **1 world px/khung**, không có lần nào giật ngược.

**Bám nhân vật: LUÔN ở chính giữa khung nhìn** (không vùng chết, bám tức thì). Với lối chơi
bấm-để-đi thì tâm màn hình chính là thứ người chơi ngắm vào, nên nhân vật lệch tâm sẽ làm
việc ước lượng khoảng cách bị sai.

**Ở mép bản đồ camera KHÔNG kẹp nữa** (`edgeMode: "center"`, cho phép lộ tối đa nửa khung
nhìn ngoài biên). Lý do rất cụ thể: trên điện thoại dọc khung nhìn cao ~20 ô mà bản đồ chỉ
30 hàng, nên ở nửa trên — khu nhà, nơi chơi nhiều nhất — camera cũ kẹp lại và đẩy nhân vật
lên ngay dưới HUD, đúng chỗ toast và chip mục tiêu che. Phần ngoài biên renderer vẽ **rừng
rậm** (ngoài trời) hoặc **tường tối** (trong nhà) — đọc ra là "hết đất", không phải lỗi.
Bản đồ vẫn 40×30 ô cố định, chỉ khung nhìn co giãn; người chơi còn chọn được mức phóng
gần/vừa/xa trong Cài đặt (`camera.setZoom`, đổi dải số ô chứ không đổi luật).

`MAX_TILES_LONG = 24` là lưới an toàn cho màn siêu dài (điện thoại ngang 20:9, màn ultrawide):
quá ngưỡng thì viền đen còn hơn để người dùng màn rộng nhìn thấy cả bản đồ.

`src/core/screen.ts` nghe ba nguồn — ResizeObserver (khung chứa), orientationchange +
resize (xoay máy, có đo lại sau một nhịp vì mobile hay báo chậm), và matchMedia resolution
(đổi màn hình / đổi mức zoom làm devicePixelRatio đổi).

### Làm việc TUẦN TỰ, có ĐỘ TRỄ và DIỄN HOẠT

Mỗi thao tác khoá nhân vật `balance.actionSeconds` (0,42s): trong lúc đó không thao tác
tiếp và **không bước đi**. Đây là lý do bấm loạn không làm được nhanh hơn — và nó làm cho
việc cày cuốc có sức nặng thay vì cả ruộng xong trong một giây.

**Hiệu lực TRỄ.** Bấm USE không đổi ô ngay: reducer chỉ khoá `busy` và ghi `pending`
(ô đang vung tới). Khi `busy` trôi qua mốc `balance.actionImpact` (0,5 = nửa nhát), TICK
mới gọi `useAt` — lúc đó đất mới lật, hạt mới xuống, nước mới tưới. Renderer đọc cùng con
số đó: trước mốc là khung **giơ** công cụ lên đầu (sprite công cụ nhấc dần theo pha), sau
mốc là khung **chạm** với công cụ đặt về phía ô. Mắt thấy đúng thứ tự giơ → bổ → kết quả,
và âm thanh/hạt/rung (suy từ diff thống kê) tự rơi đúng khoảnh khắc chạm đất.
Ngủ dậy hay bước qua cửa thì nhát dở bị bỏ (`pending = null`), không mang sang ngày mới.
`pending` vào save (v6) kèm bất biến `pending ≠ null ⇒ busy > 0`.

**Giữ nút = làm tiếp.** `src/game/hint.ts › nearestTarget` quét 5×5 ô quanh chân, chỉ lấy
ô **trong tầm với** mà vật phẩm đang cầm làm được việc, ưu tiên cùng loại việc vừa làm
(đang cày không nhảy sang thu hoạch), rồi ô thẳng hàng, rồi khoảng cách. Không tự đi xa —
muốn sang luống khác thì chạm. Vòng lặp chính chỉ tiếp quản sau khi đã giữ quá 0,2s và
nhát trước là một việc trên ô, nên bấm MUA cạnh cửa hàng không bao giờ bị hiểu nhầm.

Ba chi tiết khiến nó không phiền:

- **Thao tác HỤT không bị phạt.** Bấm nhầm vào tảng đá thì không bị đứng hình. Reducer hỏi
  `canUseAt` (đúng bộ luật `useAt` dùng) trước khi khoá; không có việc thì chạy `useAt` ngay
  để nó đẩy toast lý do, không khoá, không `pending`.
- **Nhân vật xoay mặt về ô đang làm**, và có khung hình vung tay riêng. Nhìn là biết đang
  bận chứ không phải game đơ. Chỉ xoay khi ô trong tầm với — nếu không thì `USE` ra ngoài
  tầm sẽ không còn là không-làm-gì tuyệt đối nữa.
- **Ngủ dậy là hết bận**, không mang thao tác dở dang sang ngày mới.

`state.busy` và `state.pending` nằm trong game state (save v2 và v6), kèm bước migrate điền
giá trị mặc định cho save cũ — thiếu bước này thì mọi phép tính với nó ra `NaN` và bất biến vỡ ngay.

### Đi lại

- **Đi bộ 78, chạy 132 world px/giây** (`balance.moveSpeed` / `runSpeed`, chỉnh qua OTA).
  Chạy = giữ `Shift`, hoặc đẩy joystick gần hết cỡ — analog nên không phải học thêm nút.
- **Độ dài vector có ý nghĩa**: joystick đẩy nhẹ thì đi chậm. Đi chéo không nhanh hơn đi thẳng.
- **Bấm-để-đi tự chuyển sang chạy** khi còn cách trên 2,5 ô, bước cuối vẫn đi bộ nên không
  trượt quá đích.

### Bản đồ nhỏ

`src/ui/minimap.ts` — 1 pixel = 1 ô (40×30), phóng to bằng CSS `image-rendering: pixelated`.
Vừa để nhìn tổng thể nông trại (camera bám sát nên bình thường chỉ thấy ~10 ô quanh mình),
vừa là bàn đạp **đi xa**: bấm-để-đi trên khung chính chỉ tới được chỗ đang nhìn thấy, còn
bấm trên bản đồ nhỏ thì tới đâu cũng được. Đi kiểu này là **đi thuần tuý, không thao tác** —
nếu không thì đang cầm cuốc mà bấm bản đồ là tự cày.

Lớp địa hình được cache và chỉ vẽ lại khi mảng ô thật sự đổi. Reducer dùng copy-on-write nên
chỉ cần so **tham chiếu mảng**, không phải quét 1200 ô mỗi khung hình để phát hiện không có
gì đổi. Ô vàng = cây đã chín, khung trắng = khung nhìn hiện tại, chấm trắng = nhân vật.

### Bấm-để-đi

**Chạm MỘT lần là ĐI, chạm HAI lần mới THỰC THI.** Hai ý định này rất dễ lẫn trên màn nhỏ:
đang muốn đi ngang qua ruộng mà lỡ tay cày mất một ô là chuyện bực nhất, nên tách hẳn ra.

- **1 lần** → đi tới ô đó, và ngắm sẵn ô đó (không làm gì cả).
- **2 lần** (dưới 350ms, trong vòng 44px) → thực thi: cày, gieo, tưới, dùng công cụ. Còn ở xa
  thì đi tới rồi mới làm.
- Tới nơi thì ô đó **vẫn đang được ngắm**, nên `Space`/nút DÙNG làm việc ngay — khỏi chạm lại.

Sau một cặp chạm kép thì mốc thời gian được đặt lại, nếu không cú chạm thứ ba lại ghép với cú
thứ hai và thao tác chạy hai lần liền.

`src/core/navigate.ts` là một **cách nhập liệu**, không phải luật chơi: nó chỉ sinh vector
di chuyển từng khung hình y như bàn phím hay joystick, còn mọi thay đổi state vẫn đi qua
action `MOVE`/`USE`. Nhờ vậy `src/game/` không phải biết gì về nó và **định dạng save không
đổi** — đích đến là ý định nhất thời, không đáng lưu vào file.

- **Tìm đường A\*** 8 hướng trên lưới ô, cấm cắt góc (thân nhân vật rộng hơn một điểm).
  Đi thẳng sẽ kẹt cứng ở góc nhà; bản đồ 1200 ô nên A\* rẻ như không.
- **Kéo dây**: mỗi khung bỏ qua các điểm mốc còn nhìn thẳng tới được, nên nhân vật cắt chéo
  tự nhiên thay vì đi zigzag theo tâm từng ô. Kiểm tầm nhìn bằng chính hộp va chạm của nhân
  vật chứ không phải một điểm, để đường đi không "lách" qua khe mà thân không lọt.
- **Tiến vào cho THẲNG HÀNG với lô đất rồi mới làm.** A* ưu tiên bốn ô kề **thẳng**, chỉ khi
  không có đường mới chịu ô kề chéo. Chỉ đo khoảng cách là không đủ: đứng chéo góc cách 1,41 ô
  vẫn "với tới" được, nhưng nhìn xiên và tư thế vung tay chỉ sang hướng chẳng liên quan.
  `alignedTo()` đòi cả ba: đứng trên ô đích hoặc một ô kề THẲNG, lệch ≤ 4px trên trục thẳng
  hàng, và cách ≤ 1,05 ô. Đo thực tế: bấm ô nằm chéo → nhân vật bước một bước sang ô kề thẳng
  (lệch 3px, cách 1,017 ô) rồi mới cày, mặt quay đúng vào lô đất.
- Chạy A* theo **từng nhóm ưu tiên** thay vì gộp một tập: gộp lại thì A* vớ lấy ô gần nhất,
  mà ô chéo thường gần hơn ô thẳng — đúng cái cần tránh.
- Ô đích đặc (cửa hàng, quầy, cửa nhà) thì đích là các ô kề. Tương tác với chúng **không** đòi
  thẳng hàng: mở cửa hàng có động tác vung tay nào đâu mà lệch.
- Đi thuần tuý (bản đồ nhỏ) thì ngược lại — phải **giẫm lên** đúng ô đó mới là tới.
- Cầm công trình ĐẶC thì dừng **cạnh** ô đích, không đứng lên, nếu không sẽ tự nhốt mình.
- Bấm phím di chuyển hoặc kéo joystick là **huỷ** đường đi ngay — không giành tay lái.
- Bỏ cuộc nếu kẹt sau vật cản quá 0,6 giây.

Con trỏ ô cũng đổi nghĩa theo: **trắng** = có việc làm được ở đây (đi tới nếu cần),
**đỏ** = ô vô nghĩa (nước, gốc cây, tảng đá, tường nhà).

### Ngắm ô trên màn hình nhỏ

Trên điện thoại một ô chỉ rộng **32 CSS px** mà đầu ngón tay cần khoảng **44 px** — chạm
trượt là chuyện đương nhiên, không phải người chơi vụng. Ba thứ xử lý việc này, và **không
thứ nào đụng tới tỉ lệ bản đồ** (bản đồ vẫn 40×30 ô cố định, chỉ camera co giãn theo màn hình):

1. **Con trỏ ô nhìn thấy được.** Bản đầu chỉ là 12 chấm 1px ở bốn góc — phóng ×7 trên desktop
   thì đủ, nhưng phóng ×2 trên điện thoại thì gần như vô hình. Giờ là ba lớp: nền mờ làm cả ô
   sáng lên, viền tối 1px tách nó khỏi nền, ngoặc góc dày 2px làm hình dạng nhận biết, cộng
   nhấp nháy nhẹ — chuyển động là thứ mắt bắt được ngay cả khi chỉ liếc qua.

2. **Nắn cú chạm.** Chạm vào mép giữa hai ô thì xét cả 8 ô quanh đó, ưu tiên ô thật sự làm
   được việc với thứ đang cầm, rồi mới tới ô gần điểm chạm nhất. Bán kính nắn tính bằng
   **pixel màn hình** rồi đổi ngược ra world px, nên màn càng nhỏ càng nắn rộng, còn desktop
   thì gần như không nắn. Đo thực tế: chạm lệch 13px (42% cỡ ô) vẫn trúng đúng ô.

3. **Ô ngắm dính lại.** Ngắm xong thì ô đó được giữ chừng nào còn trong tầm với, nên
   **cày → gieo → tưới cùng một ô mà chỉ phải chạm đúng một lần** — sau đó chỉ đổi vật phẩm
   rồi bấm DÙNG. Chuột vừa rê thì chuột được ưu tiên (desktop ngắm bằng chuột là chính), và
   người chơi tự di chuyển thì ô ngắm bị bỏ ngay: xoay người sang hướng khác rồi bấm DÙNG mà
   nhân vật vẫn thò tay về ô sau lưng thì rất khó hiểu.

### Điều khiển cảm ứng

Bàn phím, chuột và cảm ứng đổ về cùng một chỗ (`axis()` + hàng đợi ý định), nên không có
nhánh logic riêng cho mobile và máy lai dùng được cả hai cùng lúc.

**Nút hành động theo ngữ cảnh.** Nút DÙNG cố định là một ẩn số trên điện thoại: đang cầm
gì, ngắm ô nào, ô đó có gì — người chơi phải tự ghép ba thứ trước khi bấm. `src/game/hint.ts`
ghép giúp: từ state + content + ô đang ngắm trả về ĐÚNG MỘT hành động (CÀY/GIEO/TƯỚI/THU/
CHẶT/ĐẬP/ĐẶT/MUA/BÁN/CHẾ/NGỦ/VÀO/MÚC) hoặc lý do không làm được ("Cày trước đã", "Hết nước —
ra giếng", "Cần Rìu gỗ"). Hàm thuần, không DOM, gọi đúng những hàm reducer gọi nên nhãn
không thể lệch với luật; kịch bản sim 37 kiểm nó. Ô ở xa thì bấm nút là tự đi tới rồi làm.

**Mặc định trên cảm ứng: KHÔNG có joystick.** Vùng nhận joystick phải phủ một mảng lớn góc
dưới-trái mới bấm thoải mái — mà mảng đó lại nuốt mọi cú chạm-để-đi rơi vào nó. Từ khi có
chạm-để-đi kèm tìm đường A\*, joystick thành thừa với hầu hết người chơi, nên nó là tuỳ chọn.

**Cài đặt thuộc MÁY, không thuộc ván** (`src/core/settings.ts`, localStorage riêng, không
vào save): điều khiển, tay thuận, cỡ giao diện, khung nhìn, rung, giảm chuyển động, nút ngữ
cảnh, đã xem hướng dẫn. `parseSettings()` là cửa duy nhất — JSON hỏng/cũ/sai kiểu luôn ra
một bản hợp lệ (kịch bản sim 38). Áp dụng chỉ là đặt data-attribute lên `<body>`; CSS diễn
giải, JS không đo đạc bố cục.

**Phản hồi ba kênh** khi thao tác thành công: tiếng 8-bit, hạt hiệu ứng tại ô (bụi/nước/lá/
tia sáng/đá), rung nhẹ (`navigator.vibrate`, Android). Tất cả suy ra từ diff thống kê sau
mỗi dispatch — không cần action riêng, không vào state.

**Hướng dẫn lần đầu** (`src/ui/tutorial.ts`): 4 thẻ ngắn khoanh đúng vào nút hành động,
hotbar, bản đồ nhỏ. Chỉ chạy ở ván mới, bỏ qua được, xem lại trong Cài đặt.

Còn lại: HUD một thanh có icon pixel (mặt trời đổi thành trăng khi tối, đỏ nhấp nháy khi
sắp cạn), chip mục tiêu thu gọn được, toast gộp trùng "×3" nằm trong luồng HUD nên không
bao giờ đè lên nhân vật, modal thành bottom-sheet trên màn dọc, nút ☰ và cụm nút lật theo
tay thuận. Mọi thứ tôn trọng `env(safe-area-inset-*)`. Xem [`docs/MOBILE-UX.md`](docs/MOBILE-UX.md).

### Vì sao pixel art sinh bằng code

Không có file ảnh nào trong repo. Đổi lại: thật sự offline, không lo bản quyền,
art tất định theo seed, và **cây trồng vẽ theo tham số** nên thêm cây mới chỉ là
thêm một object JSON. `src/art/atlas.ts` là **điểm thay thế duy nhất** nếu sau
này muốn dùng tileset PNG — giữ nguyên hình dạng `Atlas`, đổi ruột các hàm `make*()`.

Ba luật đồ hoạ cho màn hình nhỏ (bản thiết kế lại):

1. **Mọi vật thể có viền 1px** (`outline()`): sprite 16px phóng ×2 mà không viền thì tan
   vào nền cỏ. Nền đất thì không viền để mặt ruộng liền.
2. **Đọc bằng hình dạng, không chỉ màu**: đất ướt có vệt nước, cây chín có quả + sao lấp
   lánh, ao có bọt bờ, lô đất có viền, ngoài biên là rừng — ban đêm màu đổi hết mà vẫn đọc được.
   Bờ nước và mép luống là autotile ở lớp vẽ (nhìn hàng xóm lúc vẽ), state không lưu gì.
3. **Nhân vật chibi 6 khung** (đứng, 4 bước đi, vung tay) với mũ đỏ làm điểm nhận diện.

---

## Thêm nội dung mới

Chi tiết ở [`docs/CONTENT.md`](docs/CONTENT.md). Tóm tắt:

**Thêm cây** — thêm một object vào `src/content/crops.json`, thêm `seed:<id>` vào
`unlocks` của một mốc trong `progression.json`, chạy `npm run content:build`. Xong.
Không sửa một dòng code nào.

**Thêm công trình** — thêm vào `buildings.json`. Nếu chỉ dùng các hiệu ứng core đã
biết (`waterRadius`, `autoWet`, `income`, `harvestRadius`) thì cũng không cần sửa code;
`atlas.ts` sẽ vẽ hộp mặc định cho id lạ. Muốn hình riêng thì thêm một `case` trong
`makeBuilding()`. Hiệu ứng **mới** thì phải sửa core → đó là làn chậm.

**Sửa bản đồ** — sửa `src/content/maps/farm.ascii` bằng text editor, mỗi ký tự một ô
(chú giải trong `tiles.json`), rồi `npm run content:build`.

**Đổi cân bằng** — `balance.json`. Toàn bộ giá, số ngày, năng lượng, nhịp thời gian.

`npm run content:build` chạy đúng bộ schema mà game dùng lúc chạy, kèm kiểm tham
chiếu chéo (mở khoá cây không tồn tại, thiết bị cần điện mà không có nguồn điện…),
nên sai là fail ngay ở đây chứ không lọt tới người chơi.

---

## Cập nhật OTA

Xem [`docs/OTA.md`](docs/OTA.md). `CONTENT_URL` trong `src/main.ts` trỏ vào bản đã
deploy (đặt `""` để tắt hẳn, chơi thuần offline). Cách hoạt động:

- Game **luôn** khởi động bằng content đóng kèm hoặc cache; việc hỏi bản mới chạy
  ngầm, hỏng thì im lặng bỏ qua. Không bao giờ chặn.
- Pack khai `requiresCore`; core chỉ nhận khi phiên bản của mình thoả dải semver đó.
  Đây là chốt chặn chính, ngăn content mới làm chết core cũ.
- Pack qua schema mới được cache, và **áp dụng ở lần khởi động sau** — không đổi
  luật giữa lúc đang chơi.
- Luôn có đường lui: **Esc → Hoàn tác về bản đóng kèm**.
- Save mang cả `coreVersion` lẫn `contentVersion`. Save tham chiếu cây/công trình
  mà content mới đã gỡ → `migrateForContent()` gỡ bỏ an toàn, **không bao giờ crash**.

Đẩy nội dung mới mà **không phát hành lại app**:

```bash
# sửa src/content/, TĂNG contentVersion trong manifest.json, rồi:
npm run deploy:content
```

Đã kiểm chứng thật trên bản deploy: bundle mang content 1.0.0 nhận được pack 1.1.0
từ máy chủ, áp dụng ở lần mở kế tiếp; và một pack khai `requiresCore: ^2.0.0` bị
core 1.0.0 **từ chối**, giữ nguyên nội dung đang chạy.

---

## Lưu game

Ba tầng, tự tụt xuống khi tầng trên không dùng được:
**IndexedDB** → **localStorage** → **file JSON** (`Esc` → Xuất/Nhập file save).
Tự lưu khi sang ngày mới, mỗi 30 giây nếu có thay đổi, và khi rời trang.
Không có server, không gửi dữ liệu đi đâu.

---

## Test

`npm run test:sim` chạy **trong Node thuần, không cần trình duyệt** — nhờ ràng buộc
`src/game/` không chạm DOM. Store chạy với `{validate:true, strict:true}` nên bất biến
bị kiểm sau **mọi** dispatch (tiền không âm, năng lượng trong khoảng, cây không lớn
khi chưa tưới, người chơi không nằm trong ô đặc…).

Phủ 40 kịch bản, gồm những thứ dễ hỏng nhất: cây không lớn nếu quên tưới · drone
đứng im khi thiếu điện · save round-trip khớp hoàn toàn · cùng seed cho ra state y
hệt · **load save cũ với content đã gỡ cây thì không crash** · `reduce` không mutate
state cũ · **nhãn nút ngữ cảnh đổi đúng CÀY → GIEO → TƯỚI → THU** · parse cài đặt hỏng vẫn ra hợp lệ ·
**thao tác có hiệu lực trễ đúng mốc chạm đất, nhát dở bị bỏ khi ngủ** · SWAP balo gộp stack và giữ
hai ô công cụ · giữ nút tự sang ô kế tiếp cùng loại việc, hết ô thì dừng.

Lớp UI soát bằng Chromium headless ở bốn khổ máy (checklist trong `docs/MOBILE-UX.md`).

`npm run test:ota` kiểm phần đáng sợ của OTA: pack hỏng/sai schema/sai `requiresCore`
đều bị **từ chối**, còn sửa content hợp lệ thì được nhận.

Trong bản dev còn có cầu `window.__PF` (`store`, `content`, `camera`, `renderer`, `menus`,
`settings()`, `setSetting()`, `tutorial`, `step(dt, times)`) để
script hoá việc kiểm thử trên trình duyệt — cần thiết vì `requestAnimationFrame`
không chạy khi trang bị ẩn.

---

## Chưa có (cố ý)

Mùa & thời tiết, NPC & quan hệ, hầm mỏ & chiến đấu, chăn nuôi, chế biến, cảnh nội
thất, nhiều bản đồ, nhạc nền. Đây là **vertical slice**: một vòng lặp trọn vẹn làm
cho tử tế, thay vì mười thứ làm dở. Kiến trúc content-driven đã chừa sẵn chỗ cho
tất cả — xem "Lộ trình mở rộng" bên dưới.

### Lộ trình mở rộng đề xuất

1. **Mùa + thời tiết** — thêm `seasons.json`, cây có danh sách mùa; mưa tự tưới cả
   ruộng. Gần như toàn bộ là content, core chỉ cần thêm khái niệm mùa vào `newday`.
2. **Nhiều bản đồ** — `maps/` đã là danh sách; thêm cổng dịch chuyển vào `tiles.json`
   và một action `TRAVEL`.
3. **Nhà kính thật** (công trình nhiều ô) — cần core hỗ trợ công trình chiếm nhiều ô.
4. **Chăn nuôi** — cơ chế mới, làn chậm; tái dùng được vòng "sang ngày mới".
5. **Tiled editor** — định dạng map đã là JSON `{w,h,rows}`, viết một bộ chuyển từ
   Tiled sang là dùng được editor đồ hoạ.
6. **Tileset PNG** — thay ruột `atlas.ts`, không đụng file nào khác.

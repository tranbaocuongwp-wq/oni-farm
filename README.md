# OniFarm

Game nông trại **hiện đại** phong cách pixel, **chơi offline hoàn toàn**.
Cày → gieo → tưới → ngủ → thu hoạch → bán, rồi nâng cấp lên vòi tưới tự động,
nhà kính, pin mặt trời và drone thu hoạch.

**Chơi ngay: https://oni-farm.pages.dev/farm/**

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
| `npm run test:sim` | 16 kịch bản mô phỏng game, Node thuần, không cần browser |
| `npm run test:ota` | Kiểm cổng tương thích + schema của content pack |
| `npm run test:all` | typecheck + cả hai bộ test |
| `npm run icons` | Sinh lại icon PNG |
| `npm run deploy` | Build + deploy toàn bộ site lên Cloudflare Pages |
| `npm run deploy:content` | **Chỉ** đẩy content pack mới — không đụng bundle web |

---

## Chơi thế nào

| Phím | Việc |
|---|---|
| `W A S D` / mũi tên | Di chuyển |
| `Space` | Dùng vật phẩm đang cầm lên ô trước mặt |
| `E` | Tương tác — cửa nhà = ngủ, máy = mua hạt, quầy = bán |
| `1`–`9` / lăn chuột | Chọn ô hotbar |
| `B` | Mở nhanh cửa hàng |
| `Esc` | Menu: lưu, tải, xuất/nhập file save |
| Bấm chuột | Làm việc trực tiếp lên ô đó |

Điện thoại: nút ảo tự hiện ở hai góc dưới.

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
  art/         sinh toàn bộ pixel art bằng code
  render/      vẽ canvas, chỉ ĐỌC state
  ui/          HUD + modal bằng DOM
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
Bản build hiện tại ~80KB (29KB gzip), zero dependency runtime.

Nếu sau này thật sự cần particle/chiến đấu/nhiều scene: bọc Phaser làm **lớp
view thuần** bên trên model hiện có — model không phải viết lại.

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

**Bám nhân vật** có vùng chết (1,6 × 1,1 ô) + làm mượt theo hàm mũ không phụ thuộc tốc độ
khung hình, và **kẹp vào biên bản đồ**. Thế giới nhỏ hơn khung nhìn thì căn giữa + letterbox
chứ không kéo lố ra ngoài bản đồ.

`MAX_TILES_LONG = 24` là lưới an toàn cho màn siêu dài (điện thoại ngang 20:9, màn ultrawide):
quá ngưỡng thì viền đen còn hơn để người dùng màn rộng nhìn thấy cả bản đồ.

`src/core/screen.ts` nghe ba nguồn — ResizeObserver (khung chứa), orientationchange +
resize (xoay máy, có đo lại sau một nhịp vì mobile hay báo chậm), và matchMedia resolution
(đổi màn hình / đổi mức zoom làm devicePixelRatio đổi).

### Điều khiển cảm ứng

Bàn phím, chuột và cảm ứng đổ về cùng một chỗ (`axis()` + hàng đợi ý định), nên không có
nhánh logic riêng cho mobile và máy lai dùng được cả hai cùng lúc.

**Joystick động**: vòng điều khiển mọc ra ngay chỗ ngón tay đặt xuống thay vì bắt người
chơi mò tới một vị trí cố định — trên màn nhỏ đây là khác biệt lớn. Kèm nút DÙNG / E cỡ
lớn bên phải và nút ☰ mở menu. Bố cục đổi theo hướng màn qua `body[data-orientation]`,
và mọi thứ tôn trọng `env(safe-area-inset-*)` để không chui vào tai thỏ.

### Vì sao pixel art sinh bằng code

Không có file ảnh nào trong repo. Đổi lại: thật sự offline, không lo bản quyền,
art tất định theo seed, và **cây trồng vẽ theo tham số** nên thêm cây mới chỉ là
thêm một object JSON. `src/art/atlas.ts` là **điểm thay thế duy nhất** nếu sau
này muốn dùng tileset PNG — giữ nguyên hình dạng `Atlas`, đổi ruột các hàm `make*()`.

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

Phủ 16 kịch bản, gồm những thứ dễ hỏng nhất: cây không lớn nếu quên tưới · drone
đứng im khi thiếu điện · save round-trip khớp hoàn toàn · cùng seed cho ra state y
hệt · **load save cũ với content đã gỡ cây thì không crash** · `reduce` không mutate
state cũ.

`npm run test:ota` kiểm phần đáng sợ của OTA: pack hỏng/sai schema/sai `requiresCore`
đều bị **từ chối**, còn sửa content hợp lệ thì được nhận.

Trong bản dev còn có cầu `window.__PF` (`store`, `content`, `step(dt, times)`) để
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

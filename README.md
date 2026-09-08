# OniFarm

Game nông trại **hiện đại** phong cách pixel, **chơi offline hoàn toàn**.
Cày → gieo → tưới → ngủ → thu hoạch → bán, rồi nâng cấp lên vòi tưới tự động,
nhà kính, chăn nuôi và người làm thuê.

**Chơi ngay: https://oni-farm.pages.dev/farm/** — điện thoại, tablet hay máy tính.

**Chơi được bằng TAY CẦM** từ đầu tới cuối — Xbox, PlayStation, Nintendo, hoặc bất
kỳ tay cầm USB/Bluetooth nào trình duyệt nhận ra. Cắm vào là game tự nhận và hiện
sơ đồ nút đúng tên nút của hãng đó.

**Thiết kế cho ngón tay cái:** chạm để đi, nút hành động tự biết việc (CÀY / GIEO /
TƯỚI / THU / MUA…), nhân vật luôn ở tâm, menu kiểu bottom-sheet, tay thuận trái/phải,
cỡ chữ, khung nhìn, rung, giảm chuyển động. Chi tiết ở [`docs/MOBILE-UX.md`](docs/MOBILE-UX.md).

**Static site thuần** — không server, không backend, không bước đóng gói native.
`npm run build` ra một thư mục `dist/` thả lên bất kỳ host tĩnh nào là chạy.
Web nhiều trang (trang chủ + trang giới thiệu), game nằm ở **`/farm/`**.
Nội dung game cập nhật được **OTA** mà không cần build lại bundle.

---

## Tài liệu

Chín tài liệu, liên kết chéo với nhau. Bốn cái đầu là **spec**: đọc để hiểu hệ
thống; số còn lại là **vận hành**: đọc khi cần làm một việc cụ thể.

| Tài liệu | Trả lời câu hỏi |
|---|---|
| [`docs/LOI-CHOI.md`](docs/LOI-CHOI.md) | Luật chơi là gì, và vì sao được quyết như thế |
| [`docs/KIEN-TRUC.md`](docs/KIEN-TRUC.md) | Mã chia tầng ra sao, tất định giữ bằng cách nào |
| [`docs/GIAI-THUAT.md`](docs/GIAI-THUAT.md) | Máy tự quyết định thế nào, và **giá** của mỗi quyết định |
| [`docs/NHAN-DIEN.md`](docs/NHAN-DIEN.md) | Logo, màu, chữ, và cách site tĩnh được dựng |
| [`docs/CONTENT.md`](docs/CONTENT.md) | Thêm/sửa cây, loài, giá, bản đồ |
| [`docs/OTA.md`](docs/OTA.md) | Đẩy nội dung mới mà không build lại |
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | Đưa lên mạng, và xử lý khi hỏng |
| [`docs/MOBILE-UX.md`](docs/MOBILE-UX.md) | Hợp đồng thiết kế lớp chạm & đồ hoạ |
| [`docs/TIEN-DO.md`](docs/TIEN-DO.md) | Đã làm tới đâu, còn gì phải làm |

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
| `npm run test:sim` | 165 kịch bản mô phỏng game (luật chơi, nút ngữ cảnh, vật nuôi, người làm, save/migrate, tay cầm), Node thuần, ~25 giây |
| `npm run test:ota` | Kiểm cổng tương thích + schema của content pack |
| `npm run test:all` | typecheck + cả hai bộ test |
| `npm run bench` | Đo chi phí phần mô phỏng trên một nông trại nặng (xem Đợt 15) |
| `npm run icons` | Sinh lại bộ logo: `favicon.svg` + bốn cỡ PNG, từ một lưới 16×16 trong mã |
| `npm run deploy` | Build + deploy toàn bộ site lên Cloudflare Pages |
| `npm run deploy:content` | **Chỉ** đẩy content pack mới — không đụng bundle web |

---

## Triển khai: sửa ở đâu cũng được, push là tự lên production

**Tên miền chính: <https://oni-farm.pages.dev>** — Cloudflare Pages, project `oni-farm`,
production branch `main`, chưa gắn custom domain.

Project nối thẳng với repo GitHub qua **Cloudflare Pages Git integration**. Quy trình
thường ngày — **không cần MacBook, không cần cài gì**:

1. Sửa code ở bất kỳ đâu (Claude Code trên cloud, GitHub web, máy khác…).
2. `git push` lên nhánh `main`.
3. Cloudflare tự clone repo, `npm install`, chạy `npm run build`, publish `dist/`.
4. Khoảng 6–8 phút sau, `oni-farm.pages.dev` chạy bản mới.

Push lên nhánh khác sinh preview deployment riêng, không đụng production.

Xem tiến độ ở dashboard → **Workers & Pages → oni-farm → Deployments**.

Đường lui khi Git integration hỏng:

```sh
npm run deploy          # build + đẩy cả site từ máy
npm run deploy:content  # chỉ đẩy content pack OTA
```

hoặc chạy tay workflow `.github/workflows/deploy.yml` ở tab **Actions → Run workflow**
(nó dùng 2 secret `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` đã đặt trong repo).

Chi tiết và cách xử lý sự cố: [`docs/DEPLOY.md`](docs/DEPLOY.md).

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

**Lộ trình:** xà lách (3 ngày) → dư vốn thì chuyển sang cà chua → đủ 800đ mua vòi
tưới + nhà kính → đủ 3.000đ mua hạt bí đỏ → rồi tới chăn nuôi và người làm thuê.
Không có bậc mở khoá nào: điều kiện duy nhất là TIỀN.

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
  game/hint.ts ⚠️ `pressPlan`: MỘT nguồn cho cả nhãn lẫn cú bấm của nút chính — thuần, có test
  game/joborder.ts ⚠️ HẰNG thứ tự việc ruộng — nút TỰ ĐỘNG và người làm cùng đọc, không import gì
  art/         sinh toàn bộ pixel art bằng code (viền, 6 khung nhân vật, autotile bờ/mép, icon HUD)
  render/      vẽ canvas, chỉ ĐỌC state; hạt hiệu ứng + lấp lánh + viền rừng là trang trí, không vào state
  ui/          HUD + modal + tutorial bằng DOM
  core/settings.ts  tuỳ chọn của MÁY (tay thuận, cỡ chữ, zoom, rung…) — parse thuần, không vào save
  core/haptics.ts   rung nhẹ khi thao tác (Android)
  farm/        vỏ trang game (/farm/)
  site/sprites.ts   đổ sprite của GAME vào trang tài liệu (một bản sự thật)
  index.html + loi-choi/ + cay-trong/ + vat-nuoi/ + hanh-dong/ + privacy/
  vat-pham/{,<một trang mỗi món>}/ + tac-gia/  ⚙️ SINH RA — scripts/build-site.mjs
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

Mỗi bản đồ là một **lưới riêng**: nông trại 48×37 (1776 ô), phòng ngủ 14×8 (112 ô).

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
lý **mọi** bản đồ (tăng trưởng, vòi tưới, làm khô, cỏ lan, rừng mọc lại), còn `TICK` — chạy mỗi khung
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
bỏ không đủ `tilledIdleDays` đêm thì MỌC CỎ và trở lại địa hình ban đầu — bỏ bê là ruộng hoang.

### Bảng gỡ lỗi

`F2` bật/tắt bảng gỡ lỗi — một **bảng NỔI ở góc trên phải, không chặn game**. 13 lệnh chia ba
nhóm: tài nguyên (tiền, năng lượng, nước, vật liệu) · thời gian (sang ngày, đổi thời
tiết) · ruộng (chín hết, thu tất cả, cày + gieo quanh đây, rắc cỏ, rắc cây, gây bệnh). Cộng
một dòng số liệu sống ở chân bảng.

Trước đây nó là một **modal**, và đó là cái sai: modal dừng thế giới lại, rồi sau mỗi lệnh
lại vẽ lại chính nó — nên thử một thay đổi cân bằng (thêm tiền → sang ngày → xem cây lớn
chưa) tốn nhiều thao tác mở-đóng hơn là thao tác thật. Bảng nổi thì thời gian vẫn trôi và
nhân vật vẫn đi được trong lúc nó mở, nên bấm một lệnh là nhìn thẳng vào thế giới thấy ngay.

Hai chi tiết dễ sai đã xử lý: `pointer-events` chỉ bật trên chính hộp bảng (không thì nửa
màn hình trên mất khả năng chạm-để-đi), và bảng tự nuốt sự kiện chạm của mình (không thì mỗi
lần bấm một chip lại kèm một cú "chạm vào thế giới" xuyên qua).

Mọi thao tác gỡ lỗi đi qua **một action `DEBUG` trong reducer**, không phải UI thò tay sửa
thẳng state — giữ đúng luật "mọi thay đổi qua một cửa", nên nó cũng chịu kiểm bất biến như
mọi thứ khác.

### Tự động làm

Nút **AUTO** cạnh nút DÙNG (hoặc phím `F`) bật chế độ tự động: nhân vật tìm việc gần nhất
làm được với thứ đang cầm, **tự đi tới** nếu ở xa, làm xong mới chọn việc kế tiếp — tuần tự
từng việc một, đúng như khi bạn tự bấm.

Nó khác **chuyến của nút chính** (xem Đợt 10) ở đúng một điểm: nó **tự đổi tay** — đi hết
bậc ưu tiên THU → CHỮA → GIEO → TƯỚI → CÀY. Chuyến của nút chính thì không bao giờ đổi món.

Tự tắt khi: bạn tự cầm lái, quanh đây hết việc, hoặc **4 giây không có tiến triển nào**. Phép
đo cuối cùng là thứ quan trọng: thao tác ở đây có hiệu lực TRỄ (`USE` đặt `busy` rồi mới kiểm
năng lượng lúc chạm đất), nên ngay sau khi ra lệnh thì không cách nào biết nhát này ăn hay
trượt. Đếm bộ đếm thống kê thì đúng với mọi lý do hỏng cùng lúc — hết năng lượng, túi đầy,
hết hạt, kẹt đường.

### Hạ tầng: đường nhựa, hàng rào, kho

**Đường nhựa** là NỀN (`asphalt`) vẽ sẵn trong `farm.ascii`, không còn là công trình mua được.
Trục đường là một phần của bố cục nông trại — cùng lý do với hàng rào: thứ quyết định hình
dáng khu đất thì người thiết kế bản đồ đặt, chứ không để người chơi lát từng ô rồi tự khoét
thủng quy hoạch của chính mình.

Đường làm hai việc: đi trên đó nhanh hơn `speedMul` lần, **và A\* tự vòng qua đường** — vì
chi phí mỗi bước được CHIA cho `speedMul`. Không có luật "ưu tiên đường" riêng nào; thêm một
luật như thế sẽ đá nhau với heuristic. Kèm theo một ràng buộc bắt buộc: heuristic cũng phải
chia cho `speedMul` lớn nhất trong content, nếu không nó ước lượng THỪA và A\* âm thầm mất
tính tối ưu — vẫn ra đường hợp lệ, chỉ là không phải đường ngắn nhất.

**Hàng rào** (`build:fence`) tự nối hình theo hàng xóm — 16 biến thể bitmask dựng sẵn một lần,
sinh từ tham số màu trong content nên thêm kiểu rào mới không cần code. Nó nằm ở lớp thực thể
có `base` chứ không phải lớp nền, vì hàng rào phải che được nhân vật đi phía sau.

Từ core 1.8 hàng rào **không còn là thứ mua/chế/xây được**: nó mang `buildable: false` và chỉ
do BẢN ĐỒ dựng, qua ô `build` trong legend. Xem mục "Khu chuồng dựng sẵn" bên dưới.

### Thức ăn: mỗi loài vài món, mua được, và cho cá ăn từ bờ

`AnimalDef.feed` là DANH SÁCH, không phải một món. Khoá một loài vào đúng một
thứ thì người chơi không có lựa chọn nào, và hết đúng thứ đó là cả đàn chết dù
kho đầy thứ khác. Loader nhận cả `null` lẫn một chuỗi (pack cũ) rồi chuẩn hoá
về mảng ngay tại cửa vào — để cả hai dạng chạy sâu vào trong là mỗi nơi đọc lại
phải tự đoán, và chỗ nào quên đoán thì hỏng âm thầm.

Đi kèm là một cờ mới, `pecks`: "tự nó kiếm được gì" tách hẳn khỏi "đưa gì thì
nó ăn". Trước đây gộp làm một qua `feed: null`, nên vừa cho gà ăn cám được là
lập tức mất luôn khả năng mổ sâu của nó — hai câu khác nhau bị nhét vào một ô.

Thức ăn **mua được**: `MaterialDef.buyPrice` bật một vật liệu lên kệ (tab Thức
ăn), bán ngay từ ngày đầu như mọi thứ khác trên kệ.
Mua đắt hơn tự cắt cỏ: đó là chỗ đánh đổi, không phải chỗ thay thế.

**Cho cá ăn** đi qua nút DÙNG chứ không phải nút TƯƠNG TÁC, vì mặt nước đã nhận
nút tương tác để MÚC nước rồi — gộp hai việc vào một nút thì một trong hai luôn
bị nuốt. Đứng bờ, cầm cám cá, bấm: cả đàn đang đói ăn cùng lúc. Con cá không lên
bờ được và cũng không đặt được cái máng giữa hồ, nên không có đường này thì nó
là con vật duy nhất mua về rồi không cho ăn được.

Một lỗi cùng họ đã sửa ở đây: `migrateForContent` gỡ kẹt cho thực thể bằng luật
của loài ĐI BỘ, mà với loài bơi luật đó ngược hẳn — nước là chỗ nó đứng được,
bờ mới là ô cấm. Nên mỗi lần nạp save, con cá bị "cứu" từ dưới ao lên bãi cỏ,
rồi chính `checkInvariants` tố cáo cái state mà hàm đó vừa dựng. Giờ cả phép
kiểm lẫn phép nhích đều hỏi theo đúng loài (`blockedForActor`/`nudgeForActor`).

### Bỏ hẳn mở khoá; bàn ra sân; leo lên giường mới ngủ (core 1.10)

**Không còn mở khoá.** `GameState.unlocked` và `ProgressionStage.unlocks` bị gỡ
sạch — cửa hàng bán mọi thứ ngay từ ngày đầu, điều kiện duy nhất là TIỀN. Lý do
rất cụ thể: mở tab Vật nuôi lên thấy tám ô "??? chưa mở" là tám lời hứa mà
người chơi không làm gì được với chúng, còn nhìn thấy con bò 800đ thì họ biết
mình đang tiết kiệm để làm gì. Mốc và mục tiêu vẫn còn, nhưng giờ chỉ ĐÁNH DẤU
chặng đường và nói một câu chúc mừng — không chặn gì.

Gỡ luôn cả bộ máy đi kèm: `isUnlocked`, `canBuy`, mấy phép kiểm chéo trong
`validatePack` ("cây nào cũng phải được mốc nào đó mở"), và dòng chữ
`strings.ui.locked`. Để lại một hàm luôn trả `true` thì nơi gọi vẫn tưởng còn
một luật nào đó — mà không còn luật nào cả.

**Bàn chế tạo ra sân trước nhà.** Trước đây nó nằm trong phòng ngủ: muốn chế
một cái rìu là phải mở cửa, đi vào, chế, đi ra. Giờ nó đứng ngay cạnh lối ra
cửa (`legend.C` đổi nền thành lối mòn), cạnh quầy thu mua — cả ba việc "mua,
bán, chế" nằm chung một cái sân.

**Leo lên giường mới ngủ.** Bấm giường không sang ngày ngay nữa: nhân vật nằm
lên ô giường, màn tối dần trong `balance.sleepSeconds` giây rồi TICK mới gọi
`newDay`. Đi qua `busy` sẵn có chứ không dựng một đồng hồ riêng — `busy` đã khoá
mọi thao tác khác, nên không ai cày ruộng trong lúc đang leo lên giường. Cái
giường vì thế phải ĐI LÊN ĐƯỢC (`solid: false`), nếu không thì đặt nhân vật lên
đó là vỡ ngay bất biến "người chơi nằm trong ô solid".

Tư thế nằm là sprite đứng XOAY 90°, không phải một bộ khung hình mới: trong
tranh nhìn từ trên xuống, một hình xoay ngang đọc ra ngay là "đang nằm", và nó
rẻ hơn hẳn bốn khung hình chỉ dùng đúng một giây mỗi ngày.

### Chia vùng đất: ruộng, rừng, và cái hồ (core 1.9)

`tiles.json:zones[]` khai những VÙNG có luật riêng — khác `pens` ở chỗ nó nói về
ĐẤT, không về con vật:

| kind | Luật | Vì sao |
|---|---|---|
| `farm` | CHỈ trong đây mới cuốc được — ruộng chia thành **12 LÔ** riêng, mỗi lô một vùng | ngoài vùng cái cuốc không ăn, nên không ai vô tình băm cả bản đồ thành luống — mà luống bỏ hoang phải mất `tilledIdleDays` đêm mới mọc cỏ lại, tức là gần như không hoàn tác được |
| `forest` | mỗi đêm ô cỏ trống có `balance.forestRegrowChance` mọc lên cây con | rừng chặt xong không mọc lại thì nó là một mỏ gỗ dùng một lần, và chữ "rừng" chỉ là trang trí |

Vắng `zones` = không giới hạn, đúng hành vi trước core 1.9, nên pack cũ không
đổi gì. `validatePack` chặn vùng tràn ra ngoài bản đồ, vùng trỏ vào bản đồ
không có, và **khu ruộng không có lấy một ô cuốc được** — cái cuối là thứ biến
cây cuốc thành đồ trang trí ngay từ phút đầu mà nhìn content không thấy.

**Phân lô kiểu BÀN CỜ.** Ruộng không phải một mảng cỏ to mà là một lưới **4 cột
× 3 hàng = 12 lô**, MỌI lô đúng `6×5` ô, cách nhau đúng một ô **bờ** lát lối
mòn. Bờ là ô `path` nên tự nó đã không cuốc được — nghĩa là ranh giới NHÌN THẤY
ĐƯỢC, không phải một luật vô hình mà người chơi chỉ phát hiện khi bấm hụt. Kịch
bản 71 đo cả ba việc: mọi lô cùng cỡ, khoảng cách giữa các cột (và các hàng)
đều nhau, và giữa hai lô luôn có bờ. Thiếu bất kỳ điều nào thì "phân lô" chỉ là
chia trên giấy còn nhìn vào vẫn là một mảng ruộng liền.

**CẦU GỖ** (`PropDef.bridge`) là vật thể BẮC QUA một ô không đi được. Ô có nó
thì người và vật nuôi qua được bất kể NỀN bên dưới, còn loài BƠI vẫn bơi được
ngay dưới chân cầu — cây cầu nằm TRÊN mặt nước chứ không thay thế mặt nước. Đổi
nền thành gỗ thì rẻ hơn nhiều, nhưng con cá không bơi qua được nữa và cái ao
thủng một đường ngay giữa.

**Cái hồ phải TRŨNG XUỐNG.** Trong tranh nhìn từ trên, chiều sâu đọc ra từ một
BẬC, và một bậc cần hai nửa: `bank` (bóng bờ đổ xuống mặt nước, vẽ trên ô NƯỚC)
và `bankRim` (gờ đất ở mép ô ĐẤT giáp nước). Chỉ có nửa dưới nước thì mặt cỏ
vẫn chạy phẳng lì tới sát mép và cái hồ trông như dán lên đồng cỏ — tôi đã làm
đúng lỗi đó một lần, và phải tô cái gờ thành màu đỏ chói mới nhận ra nó vẫn
đang được vẽ, chỉ là nhạt tới mức mắt gộp luôn vào vệt bọt nước.

### Rà lại toàn bộ vùng chạm cho ngón cái (core 1.14)

Một loạt chỗ mà chuẩn 44px bị hụt vì những lý do rất khác nhau, và không cái nào lộ
ra khi đọc code:

* **Hotbar đè lên nút XÂY ~50px** ở cả ba khổ điện thoại. `--pad-bottom` chừa chỗ cho
  "nút hành động + dòng lý do" mà quên hẳn nút XÂY nằm trên cùng cột — và vì hotbar có
  `z-index` cao hơn nên nó NUỐT cú chạm chứ không chỉ che. Xảy ra đúng lúc người chơi
  đang cầm công trình, tức đúng lúc cần cái nút đó.
* **`min-height: 0` lọt vào hai cái nút** (XÂY và "Tải lại" của thanh cập nhật), ghi đè
  luật chung `button { min-height: var(--tap) }` và biến chúng thành nút 24–27px.
* **Cụm nút `#abtn` nhận chạm ở cấp HỘP**, nên cả phần trống giữa các nút và cái nhãn
  `.why` — vốn không bấm được gì — đều hút chạm rồi im lặng. Một vùng "bấm không ăn"
  bằng 7% màn hình, nằm đúng góc ngón cái quét qua nhiều nhất.
* **Joystick ảo phủ tận mép màn**, đè lên dải home indicator của iOS và mép
  vuốt-để-quay-lại của Android. Đây là chỗ duy nhất trong cả lớp cảm ứng quên
  `safe-area`.
* **Bán kính joystick trong JS là 46 trong khi CSS vẽ vòng 112px** (bán kính 56): núm
  chạy hết tầm khi mới tới 82% vòng. Giờ JS đo thẳng từ vòng nền đang hiện.
* **Kéo tuyến không `setPointerCapture`**: rê ngón ra khỏi canvas là `dragEnd` không
  bao giờ tới, phiên kéo kẹt lại và chỉ thoát được bằng tải lại trang.
* **Nút balo không đổi bên theo tay thuận** — nó là nút 44px duy nhất ở dải đáy, mà để
  cố định bên phải thì với tay trái nó nằm xa ngón cái nhất trong cả màn hình.
* **Cỡ giao diện "Lớn" không nới ô hotbar**: người chơi chọn Lớn vì bấm hụt hotbar,
  rồi thấy hotbar y nguyên.

Chỗ **không sửa được bằng CSS**: hotbar 10 ô trên một hàng thì mỗi ô chỉ được 26–33px
trên điện thoại, vì 10 × 44 cộng khe là hơn 460px — rộng hơn cả màn hình. Đây là số
học, không phải sơ suất, và `docs/MOBILE-UX.md` đã ghi nó là ngoại lệ có chủ ý. Bù
được hai thứ: **vùng chạm cao 44px** bằng một `::before` trong suốt (trục dọc còn chỗ,
mà ngón cái đi từ dưới lên nên sai số dọc là sai số hay gặp nhất), và khe rộng hơn ở
cỡ giao diện Lớn. Muốn ô to thật thì phải giảm `balance.hotbarSlots` — giờ CSS tự tính
theo con số đó thay vì chép tay `--hotbar-slots: 10`.

### Tay cầm chơi được toàn bộ game (core 1.13)

Cắm tay cầm vào là chơi được từ đầu tới cuối, không phải chạm màn hình lần nào.
`src/core/gamepad.ts` là đường vào thứ tư, đổ chung vào `axis()` và `drain()` của
`core/input.ts` — không có nhánh logic riêng nào trong game.

Bốn quyết định đáng ghi:

* **Poll mỗi khung, không nghe `gamepadconnected`.** Chrome và Safari chỉ bắn sự
  kiện đó SAU khi người chơi bấm một nút (chống fingerprinting), nên cắm rồi ngồi
  im là không có sự kiện nào.
* **Tên nút theo HÃNG.** Cùng chỉ số 0, Xbox gọi là "A", PlayStation là "✕", còn
  Nintendo thì ĐẢO: nút mặt dưới là "B". Đoán sai thì chữ sai chứ hành vi không
  đổi, nên đây là chỗ được phép đoán.
* **`mapping !== "standard"` thì chỉ gán cần gạt + hai nút mặt đầu tiên**, và nói
  thẳng trong sơ đồ nút. Quan trọng: lúc đó CSS **không** được giấu nút chạm đi —
  giấu nút XÂY trong khi L3 cũng bị chặn là bịt nốt đường vào cuối cùng của cả
  một tính năng. Nên `body[data-input]` có hai giá trị, `pad` và `pad-std`.
* **Điều hướng menu tập trung ở `main.ts`**, không rải vào từng màn: chọn phần tử
  kế tiếp theo HÌNH HỌC chứ không theo thứ tự DOM (menu xếp lưới hai cột, đi theo
  DOM thì gạt sang phải lại nhảy xuống hàng dưới). Màn mới chỉ cần dùng `shell()`
  là tự chạy được.

**Bài học đắt nhất ở đây là một biến bị quên đọc.** `running` được tính đúng
trong `gamepad.ts`, được nhận đúng vào `padState` ở `input.ts`, rồi hàm
`running()` ngay bên dưới lại quên hỏi nó — trong khi `useHeld()` ở đúng dòng kế
tiếp thì nhớ. Không crash, không cảnh báo: người chơi tay cầm chỉ đi bộ suốt ván,
trong khi màn sơ đồ nút vẫn quảng cáo cả LT lẫn "đẩy mạnh là chạy". Sáu commit
trôi qua mà không ai thấy, vì phần này **không có một dòng test nào**.

Giờ có: `createGamepad()` chỉ chạm `navigator.getGamepads?.()` ở đúng một dòng và
`poll(nowMs)` nhận thời gian làm THAM SỐ chứ không tự gọi `performance.now()` —
cố ý, để tua được. Cắm một `navigator` giả là kiểm được toàn bộ logic khó trong
Node thuần: sườn lên, vùng chết tròn, trễ ngưỡng, nhịp chờ-rồi-mới-lặp
(kịch bản 72). Với trình duyệt thì ghi đè `navigator.getGamepads` bằng
`page.addInitScript` là script hoá được cả đường đi thật.

**Giữ chỗ ngồi khi menu vẽ lại** (`src/ui/focus.ts`) là mảnh cuối, và nó sửa một
lỗi ăn cả chuột lẫn ngón tay chứ không riêng tay cầm: mỗi cú bấm trong menu gọi
lại `open*()`, mà `shell()` xoá sạch `root` — nên tiêu điểm, chỗ cuộn và hoạt
cảnh mở sheet đều bị dựng mới. Mua một thẻ ở cuối lưới bốn mươi thẻ là bị kéo về
đầu lưới. Nhận lại bằng CHỖ NGỒI (toạ độ bố cục + loại điều khiển) chứ không bằng
định danh: menu không có id ổn định, nhưng nó dựng lại đúng bố cục cũ. Vế "loại
điều khiển" chặn một tai nạn thật — bấm `+` tới số tối đa làm `+` bị vô hiệu, và
nếu chỉ so khoảng cách thì vòng vàng rơi xuống nút BÁN nằm ngay dưới nó.

Chỉnh được trong Cài đặt (chỉ hiện khi đang cắm tay cầm): **vùng chết cần gạt** —
con số duy nhất hỏng theo phần cứng, cần gạt mòn nghỉ lệch tâm thì nhân vật tự đi
mãi; **đổi hai nút mặt** cho ai quen tay cầm Nintendo, nơi nút xác nhận nằm đúng vị
trí mà Xbox gọi là B; **đảo trục Y cần ngắm**. Đổi nút cố ý chỉ cho đổi nút MẶT và
VAI — cho đổi Start thì người chơi tự khoá mình ra khỏi menu, mà không vào được menu
thì không có đường nào đặt lại.

Chi tiết ở [`docs/MOBILE-UX.md`](docs/MOBILE-UX.md) mục 3b.

### Quy hoạch lại cả nông trại: bàn cờ, đường sá, biển cắm (core 1.12)

Trước 1.12 bản đồ 40×30 là thứ lớn dần theo từng yêu cầu: cái hồ nhét vào góc trên, dãy
chuồng dán vào rìa đông, rừng rải ở đáy, và giữa chúng là những dải cỏ không thuộc về ai. Nhìn
vào thì đọc ra được "có ruộng, có chuồng, có rừng", nhưng không đọc ra được **ranh giới** —
mà một nông trại không có ranh giới thì cũng không có quy hoạch.

Bản đồ giờ là **48×37**, cắt thành các dải ngang dứt khoát:

```
y=1..7    dải bắc — hồ cá (cầu ra giữa hồ) · nhà + sân · chợ · kho + bãi đậu
y=8       ĐƯỜNG TRỤC BẮC   (asphalt, suốt chiều ngang)
y=9..25   ruộng bàn cờ x=1..29 │ ĐƯỜNG TRỤC DỌC x=30 │ dãy chuồng x=31..46
y=26      ĐƯỜNG TRỤC NAM
y=27..35  rừng, có ngõ xuyên qua
```

Ba con đường nhựa chia bản đồ thành đúng bốn mảnh việc, và cũng chính là đường xe tải chạy từ
cổng phía nam lên tới bãi đậu trước kho. **Đường không còn là công trình mua được** mà là NỀN
`asphalt` vẽ sẵn trong `farm.ascii`: trục đường quyết định hình dáng khu đất, cùng lý do với
hàng rào — thứ đó thuộc về người thiết kế bản đồ, không phải thứ để người chơi lát từng ô rồi
tự khoét thủng quy hoạch của chính mình.

**Biển cắm** (`tiles.signs`) là mảnh cuối. Chia lô rồi thì người chơi phải ĐỌC ĐƯỢC mình đang
đứng ở lô nào mà không phải mở bản đồ nhỏ ra dò — nên mỗi lô, mỗi chuồng, cái nhà, cái kho,
bãi đậu xe, chợ, giếng, hồ cá và rừng đều có một tấm biển. Ba quyết định trong đó:

* **Chữ KHÔNG nằm trong sprite.** Tên khu là chữ Việt có dấu; dựng một bộ phông pixel đủ dấu
  chỉ để in "Lô A1" thì vừa tốn cả ngày vừa khó đọc trên màn điện thoại. `drawSignLabels` in
  chữ ở lớp THIẾT BỊ theo phông của trang, cỡ chữ neo theo `scale` nên phóng to thu nhỏ thì
  biển to nhỏ theo. Vẽ SAU `drawNight`: cái biển vẫn phải đọc được lúc trời tối.
* **Biển đứng BÊN TRONG khu nó gọi tên, ở ô GÓC của khu đó.** Chỗ đầu tiên tôi chọn là con ngõ
  giữa hai lô — sai hai lần liền: ngõ rộng đúng một ô nên tấm biển đè trọn mặt đi, và một tấm
  biển đứng ngoài ranh giới thì lô nào cũng đọc thấy mà chẳng lô nào nhận. Ô góc vừa nằm trong
  lô vừa ở mép ngoài của nó, nên đứng ngoài ngõ vẫn đọc được. `validatePack` chặn: biển trùng
  tên một khu mà cắm ngoài khu đó là pack hỏng. Ao cá là ngoại lệ duy nhất, vì lý do vật lý —
  ruột nó là nước, không cắm cọc xuống được, nên biển của ao đứng sát bờ.
* **Biển ĐỨNG Ở MÉP Ô, không chiếm ô** (`place: "edge"`, core 1.19). Xem mục dưới.

Bản đồ được sinh bằng script rồi mới ghi ra `farm.ascii` — trong đó có một bước **vá liên
thông**: flood-fill từ ô spawn, ô nào đi được mà lạc khỏi khối chính thì đục thông. Rừng rải
ngẫu nhiên luôn đẻ ra vài túi cụt, và một túi cụt trong rừng là thứ không ai phát hiện cho tới
lúc có người đi vào đó.

**Vẽ lại bản đồ thì save cũ phải theo bản đồ mới** (`mergeGrid`, core 1.18). Câu hỏi ở mỗi ô là
"thứ này của ai": cây/đá/bụi là thứ vừa mọc vừa chặt được nên thuộc SAVE, còn nhà/kho/giếng/cầu
là đồ đạc của BẢN ĐỒ. Luật cho vật thể có từ 1.12, nhưng công trình (`tile.b`) thì bị bỏ sót —
ô mới trống là công trình cũ được ở lại vô điều kiện. Hàng rào các khu chuồng chính là công
trình, nên sau khi quy hoạch lại, rào của dãy chuồng ĐỜI TRƯỚC vẫn nằm nguyên chỗ cũ và vắt
chéo qua dãy chuồng mới — trên màn hình rộng nhìn ra ngay là ba cái chuồng chồng lên nhau.
Ranh giới đúng là **ai dựng**, và content đã nói sẵn: `buildable: false` nghĩa là không ai dựng
được nó nữa, nên mọi ô mang nó trong save đều do bản đồ đời trước dựng ⇒ bỏ. Sàn nhà kính người
chơi bỏ tiền ra lát thì `buildable` không tắt ⇒ giữ.

### CHỖ ĐỨNG của một vật thể trong ô (core 1.19)

Lưới có đúng **một** chỗ cho vật thể ở mỗi ô (`tile.prop`). Chừng nào mọi vật thể đều là cây,
đá, nhà — thứ chiếm trọn ô — thì không có gì phải hỏi. Tấm biển phá vỡ giả định đó: nó cao
chín pixel, đứng nép vào mép ô, và thứ duy nhất nó làm là cho người ta ĐỌC. Cho nó một ô của
lưới là bắt người chơi trả hai cái giá cho một thứ chỉ để đọc:

* mỗi lô mất một ô cuốc được (29 thay vì 30 — mười hai lô là mười hai ô);
* và vì legend còn phải nói ô đó **nền** gì, mỗi tấm biển tự đắp một mảng nền dưới chân mình.
  Đây là cái bẫy đã làm hỏng ba lần sửa liền: legend chỉ có một ký tự biển, ghi cứng
  `ground: "path"`, nên dời tấm biển đi đâu nó cũng mang theo cái vỉa hè của mình.

Nên `PropDef` tách hẳn hai câu hỏi vốn hay bị gộp:

| trường | hỏi gì | ví dụ |
|---|---|---|
| `tall` | vẽ CAO tới đâu — có tràn lên ô phía trên không | cây gỗ lớn |
| `place` | ô có bị CHIẾM không | `"tile"` (mặc định) · `"edge"` |

`place: "edge"` nghĩa là **đứng ở mép ô và không chiếm ô**: ô mang biển vẫn cày được, gieo
được, đi qua được như chưa có gì. Và vì lưới chỉ có một chỗ cho vật thể, một vật `"edge"` mà
nằm trong `legend` là tự mâu thuẫn — nó vừa bảo "tôi không chiếm ô" vừa giữ mất đúng cái chỗ
ấy. Nên nó sống ở danh sách riêng của nó (`tiles.signs`) và chỉ là một lớp VẼ; `validatePack`
chặn nếu ai đưa nó ngược vào legend, và chặn luôn `"edge"` + `solid: true` (không chiếm ô nào
thì lấy gì mà chặn). Kịch bản 71 quét cả bản đồ đòi không ô nào mang vật thể `sign`.

Đổi lại, tấm biển giờ có thể đứng ngay trên một luống đang trồng. Đó là lý do có **`signFade`**:
tới gần thì cả tấm ván lẫn dòng chữ mờ dần còn 0,3. Ngược chiều với nhãn chữ (hiện ra khi lại
gần) và cùng một lý do — ở xa thì đọc tên lô nào cũng vô ích, còn lúc đứng ngay đó thì mình đã
biết đang ở lô nào rồi, mà nó lại che đúng chỗ mình đang cày.

### Khu chuồng dựng sẵn (core 1.8)

Trước 1.8, "chuồng" chỉ là chữ `housing: "pen"` trong `AnimalDef` — không có gì trong game ứng
với nó. Con vật mua về lang thang cả bản đồ, và muốn nhốt lại thì người chơi phải tự đóng rào.
Đóng rào bằng tay thì mỗi ván ra một hình khác nhau, và không hình nào ra cái chuồng.

Giờ nông trại **chia lô sẵn**, và cả ba mảnh đều nằm trong content:

| Mảnh | Ở đâu | Nói gì |
|---|---|---|
| Ruột khu | `tiles.json:pens[]` | hình chữ nhật đi được bên trong rào, `feeds` của máng |
| Hàng rào | `maps/farm.ascii` ký tự `F` | legend `{ ground, build: "fence" }` |
| Ai ở khu nào | `actors.json` ô `pen` | id khu, vắng = thả rông thật (con chó) |

Bốn khu: **gia súc** (bò/dê/cừu — có món ăn chung nên **chung một máng**), **heo** (máng
riêng), **gia cầm** (gà/vịt, có máng cám nhưng vẫn mổ sâu trên cỏ), và **hồ cá** (`swim: true`
— ruột là ô nước, không rào vì bờ ao đã là rào, và không máng vì không đặt được máng giữa hồ).

Ba khu trên cạn **xếp chồng và dùng chung bức rào giữa**. Chừa một ngõ giữa hai chuồng thì mỗi
con vật có một hành lang riêng chẳng dẫn đi đâu; dùng chung vách thì cả dãy đọc ra một khu
trại liền mạch. Cổng của cả ba đều mở về phía ngõ dọc chạy sát đường trục — một lối đi, ba
cái cổng.

**Máng** (`src/game/pen.ts`) là chỗ thức ăn NẰM LẠI, không phải chỗ bấm cho ăn: đổ một lần,
máng giữ tới `balance.troughMax` phần, con vật đói tự tới ăn một phần mỗi bữa. Vì thế đi vắng
vài ngày vẫn có cái cho chúng ăn. Số phần nằm ở `Tile.trough` (tuỳ chọn, vắng = rỗng, cùng
kiểu với `age`/`idle` nên save cũ không cần migration), còn LOẠI thức ăn thì không nằm ở ô mà
ở `pen.feeds` — một máng không thuộc khu nào thì không đổ được gì vào, cố ý.

Một luật đáng nhớ: **đói mà máng cạn thì `penGoal` trả `null`**, chứ không gọi con vật về. Gọi
về thì nó bỏ lại đúng vạt cỏ đang đứng để đi tới một cái máng rỗng rồi chết đói cạnh đó. Rào
có cổng, nên đây là "tự về chuồng" chứ không phải "bị nhốt".

`validatePack` chặn năm cách làm hỏng mà nhìn content không thấy: khu tràn ra ngoài bản đồ,
loài trỏ vào khu không tồn tại, khu khai `feed` mà trong ruột không có máng (và ngược lại), ô
đặc lọt vào ruột khu cạn, ô cạn lọt vào ruột khu nước.

**Xây theo tuyến**: cầm công trình → nút TUYẾN → chạm ô đầu, chạm ô cuối. Tuyến đi hình chữ L
(ngang rồi dọc) chứ không phải đường chéo — pixel art đi chéo trông gãy khúc, mà người chơi
phân lô thì nghĩ bằng ô vuông. Trần 24 ô, ô đầu phải trong tầm với, trừ đủ vật liệu và năng
lượng từng ô (không giảm giá theo lô, nếu không thì xây tuyến thành cách lách giá). Hết vật
liệu thì dừng tại đó và báo đã xây được bao nhiêu.

### Kho tập trung

Nhà kho nằm sẵn trên bản đồ, có con đường nhựa dẫn từ mép nam vào tận cửa. `state.store` là
MỘT kho chung dù nhà kho chiếm bao nhiêu ô — cùng tinh thần với "lưới điện chỉ có một" ở bước
2 của `newday`: người chơi nghĩ về *cái kho*, không nghĩ về từng ô tường của nó. Đây cũng là
chỗ người làm thuê sẽ đổ hàng về.

"Cất hết" chỉ cất nông sản và nguyên liệu — **không** cất công cụ và hạt giống, vì cất mất cái
cuốc thì lần sau ra ruộng lại phải chạy về lấy.

### Vật nuôi và hệ thực thể

Tám loài: bò, dê (sữa + thịt) · heo (thịt) · gà, vịt (trứng + thịt, trứng vịt đắt hơn) ·
cừu (lông + thịt) · cá (thịt) · chó (tuần tra đuổi chuột/sóc). "Vừa lấy cái này vừa lấy cái
kia" chính là con có CẢ `products` (thu lặp lại) lẫn `meat` (thu một lần).

**Thêm loài mới = thêm một object trong `actors.json`, không một dòng `.ts`.** `art.form` chọn
một trong bốn dáng (`quadruped` / `bird` / `fish` / `critter`) rồi bộ sinh pixel dựng hình từ
tham số — đúng mô hình cây trồng đang dùng, cố ý KHÔNG bắt chước vật thể (vốn `switch (id)`
với mười mấy case cứng). Lý do: cái giếng và cái ghế băng không chia sẻ giải phẫu nào nên
switch là hợp lý, còn tám loài vật thì cùng một bộ xương, và số loài sẽ còn phình ra.

Bỏ đói thì **chết** — nhưng có báo trước: đói là hiện ngay lớp phủ trên con vật, và phải đói
liên tiếp `starveDays` ngày mới chết. Loài `feed: null` (gà, vịt) tự kiếm ăn nên không bao giờ
chết đói; đi vắng ba ngày mà về thấy gà chết thì vô lý.

Mua xong con vật được **xe chở tới BÃI GIAO NHẬN trước cửa kho** — không hiện ra dưới chân
người chơi. Xem mục dưới.

#### Con vật CÒN NO thì ở trong chuồng (core 1.20)

Người chơi: *"sao mấy con vật nó không ở trong chuồng mà nó chạy tùm lum mặc dù chưa đói"*.
Đúng, và chỗ hỏng nằm ở một khe hở không ai ngờ: `penGoal` trả **null** khi con vật ĐÃ ở
trong khu — về tới rồi thì đừng bắt nó đi tới đi lui nữa. Rồi `actorStep` rơi xuống nhánh
cuối, `wanderGoal`, bốc một ô bất kỳ trong **hình vuông bán kính 4** quanh chỗ đứng. Mà ruột
chuồng chỉ **cao 3 ô**. Nên gần như lần nào nó cũng nhắm ra ngoài, lách qua cổng đi mất, rồi
lần sau `penGoal` mới gọi về — cả đàn ra vào mãi, nhìn ra đúng là chạy tùm lum khắp nông trại.

`penWander` bốc ô trong **ruột khu** thay vì quanh chỗ đứng. Cổng vẫn để mở đúng nghĩa của
nó: con vật ĐÓI mà máng cạn vẫn ra ngoài kiếm cỏ được — bỏ luật đó là đổi "tự về chuồng"
thành "bị nhốt tới chết". Kịch bản 76 đo cả hai chiều: 4000 khung hình với đàn no căng thì
**không một khung nào** có con nào ở ngoài chuồng (trước khi sửa: 13.397), mà vẫn có con đang
đi loanh quanh bên trong; rồi bỏ đói với máng rỗng thì phải ra được.

#### Bãi giao nhận, và lối vào hai làn (core 1.20)

Người chơi: *"xe giao hàng chưa xuất hiện, và đi vào kho chỗ đó biến thành bãi xe giao nhận
đi, nó đứng im luôn, lối vào nông trại có 2 làn xe"*. Ba lỗi chồng nhau:

* **Xe giao hàng dừng giữa trục đường dọc.** Điểm giao cũ là một ô mặt đường ở `(30,4)`, và
  xe đứng đó **12 phút game** để dỡ hàng — nhìn ra là một chiếc xe chết máy chắn ngang con
  đường DUY NHẤT nối nông trại với bên ngoài. Ba ô đậu của xe thu mua thì lại nằm ngay **trên**
  nhánh đường trước kho, nên xe đậu cũng là xe chắn đường.
* **`drivePath` soát lại thay vì ràng buộc.** Nó gọi A\* thường rồi mới duyệt đường trả về, bỏ
  đường nào lạc khỏi mặt đường. Mà A\* luôn trả đường **ngắn nhất** — tức là đường cắt thẳng
  qua bãi cỏ. Nên hễ đích không nằm đúng một đường thẳng dọc con đường thì chuyến nào cũng bị
  bỏ. Chừng nào điểm giao còn nằm thẳng trên trục dọc thì không ai thấy; dời bãi ra trước kho
  là lộ ngay. Nay `PathOptions.pass` cho bên gọi cắm bộ lọc **vào trong vòng lặp** A\*, nên xe
  tự tìm đường VÒNG theo mặt đường.
* **Lối vào một làn.** Xe vào và xe ra đi đúng con đường ấy. Đoạn từ cổng lên tới trục nam giờ
  rộng **hai làn**.

Bãi nằm trên **lối đi** `y=5` trước cửa kho, không trên mặt đường; điểm giao là ô trước cửa
kho. **Mọi** xe đều đậu vào bãi — hàng về thì về tới kho, đúng như một sân giao nhận thật — và
hàng xuống ngay cạnh chiếc xe, tránh mặt đường. Bãi có đúng `MAX_VEHICLES` ô nên hàng đợi
không bao giờ kẹt cứng. Kịch bản 77 khoá lại: ô đậu không được là mặt đường nhưng phải kề mặt
đường, cổng phải có hai làn, xe phải THỰC SỰ đậu vào một ô của bãi trước khi thả hàng, và mọi
ô trên đường đi của xe phải là mặt đường.

#### Hai luật giữ tính tất định

Đây là phần dễ hỏng nhất của cả dự án, nên viết rõ:

**`state.seed` là bất khả xâm phạm trong đường TICK.** Trước khi có thực thể, TICK không rút
một hạt ngẫu nhiên nào — seed chỉ bị rút theo SỰ KIỆN. Nếu 20 con vật cùng rút seed toàn cục
mỗi khung hình thì *số lần* rút phụ thuộc fps, và bất biến "cùng seed + cùng chuỗi action =
state y hệt" vỡ âm thầm: game vẫn chạy, chỉ là replay không khớp và save không tái lập được.
Nên **mỗi con mang hạt riêng**, advance cục bộ. Kịch bản sim 55 canh đúng chỗ này.

**Di chuyển mỗi khung hình, quyết định theo nhịp giờ game.** Nhích theo đường đi thì làm mỗi
khung hình (mượt, không rút số nào); còn *chọn làm gì* chỉ chạy mỗi 0,5 phút game. Số bước là
hàm của `minutes`, mà `minutes` là hàm của tổng `dt` — nên máy 30fps và 120fps cho cùng kết
quả (lệch tối đa một bước do cộng dồn số thực; replay cùng chuỗi `dt` thì khớp tuyệt đối).

Ngân sách: tối đa 2 lần tìm đường mỗi bước cho TOÀN BỘ actor, xoay vòng theo `planCursor` —
nên chi phí A\* là hằng số, 20 con hay 60 con cũng thế. Trần 64 con, A\* của actor bị siết
xuống 900 nút và có dây xích 20 ô.

#### Sâu bọ

Chuột và sóc sinh về ĐÊM, số lượng tỉ lệ với số cây đang chín — ruộng trống thì không có con
nào, ruộng đầy cây chín bỏ đó qua đêm thì trả giá. Chúng ăn lùi cây một giai đoạn chứ không
xoá sạch: mất một đêm công chăm, không mất cả vụ. Chó tuần tra đuổi được chúng trong bán kính
8 ô. Toàn bộ chạy lúc sang ngày, nên TICK không phải gánh thêm gì.

### Người làm thuê

Thuê ở tab **Người làm** trong cửa hàng. Giao một loại việc — *chăm cây* hoặc *chăn nuôi* —
rồi họ tự lo: tìm việc, đi tới, làm, xong mới chọn việc khác. Đầy tay thì đem về kho tập
trung. Mệt thì tự nghỉ, nghỉ xong làm tiếp. **Trả lương 3 ngày một lần**; không đủ tiền thì
họ nghỉ việc chứ không cho nợ — để `money` không bao giờ âm và hậu quả của việc thuê quá tay
là thấy được ngay.

Thứ tự ưu tiên **cố định**, không ngẫu nhiên. "Tự phán đoán" nghĩa là họ tự nhìn ra việc gì
đang cần, chứ không phải mỗi lần lại chọn khác — người chơi phải đoán được người làm sẽ làm
gì, nếu không thì thuê người thành ra thả một con rối vào ruộng.

- *chăm cây*: thu cây chín → chữa cây bệnh (dùng thuốc trong kho) → tưới ô khô
- *chăn nuôi*: thu sữa/trứng/lông tới lứa → cho con vật đói ăn (dùng cỏ trong kho)

**Họ KHÔNG cày và KHÔNG gieo.** Cả hai đều tiêu vật phẩm của người chơi và đều là quyết định
về *bố cục* nông trại; người làm tự ý cày chỗ này gieo chỗ kia thì người chơi mất quyền quy
hoạch ruộng của chính mình.

Về đồ hoạ họ dùng lại **nguyên bộ 28 khung** của nhân vật chính — cả khung vung công cụ — chỉ
đổi bảng màu. Thêm một bộ đồ mới là thêm năm mã màu trong `actors.json`.

Lương trả ở **bước 2 của `newDay`** (bước tiền tệ), bắt buộc trước bước 8 `applyProgression`:
trả sau thì mốc tiến trình theo `money` sẽ tính bằng số tiền chưa trừ lương.

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
Bản đồ vẫn 48×37 ô cố định, chỉ khung nhìn co giãn; người chơi còn chọn được mức phóng
gần/vừa/xa trong Cài đặt (`camera.setZoom`, đổi dải số ô chứ không đổi luật).

`MAX_TILES_LONG = 32` là trần cho **trục dài** (điện thoại ngang 20:9, màn ultrawide). Trần
này từng được thi hành bằng cách CẮT khung nhìn rồi bù hai dải đen — và đó là một lựa chọn
sai (sửa ở core 1.19). Trên cửa sổ 1920×684 nó ăn 192px mỗi bên, gần một phần năm màn hình,
mà người dùng không có cách nào đoán ra tại sao: cùng một trang, thu chiều cao cửa sổ lại một
chút là hai dải đen hiện ra. Điện thoại ngang 20:9 cũng dính 38px mỗi bên. Nay trần ấy thi
hành bằng cách **phóng to cho vừa khung**: nó nâng SÀN của `scale` thay vì cắt `viewW`. Thà
thấy ít ô hơn một chút — thứ không ai nhận ra — còn hơn mất hẳn một phần màn hình, thứ ai
cũng nhận ra. Khi hai ràng buộc đá nhau (khung quá dài so với cạnh ngắn) thì trần trục dài
THẮNG, và vẫn lấy số nguyên để pixel art không có ô to ô nhỏ.

Kịch bản 75 khoá lại: mười hai khổ máy — desktop, cửa sổ dẹt, ultrawide, tablet ngang/dọc,
điện thoại ngang/dọc — đều phải `offX === 0 && offY === 0`, hệ số phóng nguyên, và trục dài
không vượt trần. Ba mức phóng người chơi chọn cũng vậy.

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

**Bấm một lần = làm hết việc của món đang cầm.** Từ Đợt 10 nút chính không còn "giữ nút
thì làm tiếp ô kế": bấm một lần là một **chuyến** (`src/game/run.ts`) — món quyết định việc
và khu, khu nào gọn khu đó, không bao giờ đổi ô hotbar. Chi tiết ở mục Đợt 10.

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

`src/ui/minimap.ts` — 1 pixel = 1 ô (48×37), phóng to bằng CSS `image-rendering: pixelated`.
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
thứ nào đụng tới tỉ lệ bản đồ** (bản đồ vẫn 48×37 ô cố định, chỉ camera co giãn theo màn hình):

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

### Đợt 6–7: an toàn, rồi mở khoá thứ đã viết sẵn (core 1.32–1.33)

Sau khi Đợt 5 lên mạng, ba luồng rà soát toàn bộ mã nguồn ra hơn 40 phát hiện. Hai đợt đầu
của phần còn lại:

**Đợt 6 — an toàn (core 1.32).** Đợt duy nhất mà lỗi của nó không hoàn tác được.
* `step(dt)` từng đứng trần trong vòng lặp: một khung hình ném là `requestAnimationFrame`
  không được đặt lại, và autosave (chỉ nổ trong `step`) chết theo. Giờ mỗi khung được bọc; lỗi
  lẻ thì lưu ngay rồi chạy tiếp, lỗi liên tục 10 khung mới dừng và nói thật.
* Save của bản **mới hơn** từng bị xử như save hỏng: bắt đầu ván mới rồi autosave đè lên trong
  30 giây. Giờ `migrateSaveEx` nói rõ lý do, gặp `newer` thì màn chặn có nút cập nhật và **không
  tạo store** — không có đường nào ghi vào khoá save.
* Save hỏng / quá cũ / vỡ bất biến: **sao lưu nguyên blob** sang `main:backup` trước khi ghi đè;
  màn "Save ra/vào" hiện nút khôi phục khi ô đó có gì.
* Boot, Nạp, Nhập cùng đi qua một cửa (`game/adopt.ts`): migrate → kiểm bất biến → ok/why. Nạp
  hay Nhập vỡ thì giữ nguyên ván đang chơi.
* Bảng gỡ lỗi (`+1k đ`, `Chín hết`…) từng ship thẳng trong lưới menu Tạm dừng. Giờ giấu sau
  **5 lần chạm vào dòng phiên bản** — Cường có dùng nó thật nên không rào hẳn sau DEV.
* `.github/workflows/test.yml` chạy `test:all` trên mọi push. Trước đó 100+ kịch bản không có gì
  bắt phải chạy.

**Đợt 7 — mở khoá thứ đã viết sẵn (core 1.33).** Gần như không có luật chơi mới.
* **Mổ thịt** có nút. Action `SLAUGHTER` viết đủ từ lâu, sim có test, bảng con vật còn in số
  thịt sẽ được — mà không một chỗ nào trong UI dispatch nó.
* Chip mục tiêu chỉ vào cái **gần xong nhất** (`bestGoal`), không phải cái đầu danh sách — nó
  từng kẹt vĩnh viễn ở "Chữa một cây bệnh".
* Vắt sữa, nhặt trứng, chữa cây có tiếng + hạt + rung; mua hàng có tiếng riêng; xu bắn ở chân
  nhân vật chứ không ở ô cuốc lần cuối.
* Hết năng lượng: nút nói **trước** ("Hết năng lượng — về ngủ", không sáng xanh), và khi trượt
  thì đủ bộ tiếng + rung + lắc đầu.
* Reducer từ chối **có lý do**: hai nút của bảng khu từng bấm được mà không có gì xảy ra.
* `Escape` / ☰ / START bóc lớp từ nông tới sâu như nút X — không còn mở menu đè lên chế độ xây.
  Có tay cầm thì lưới Tạm dừng có ô "Sơ đồ nút".
* Menu và hướng dẫn `inert` phần còn lại của trang: Tab không nhảy ra HUD phía sau.
* Công tắc âm thanh đi qua settings nên sống sót qua tải lại.
* Sửa sáu chỗ chữ vẫn nói về nút XÂY / nút E đã bỏ từ Đợt 5.

### Đợt 25: vẽ lại người, thú, tàu, cây rừng — và cho nước chảy thật (core 1.52 · content 1.52)

Cường xem bản HD rồi chỉ từng chỗ một: *"chưa có thấy nhân [vật], mấy cái công trình toà nhà"*, *"chưa thấy
vẽ động vật"*, *"sao con trỏ chuột to quá vậy"*, *"suối chảy nước chảy thác nước, sóng biển nữa — mấy cái này
rất quan trọng"*, *"mấy cái tàu nữa kìa"*, *"vẽ lại hết bộ ảnh tất cả động vật đi cho chân thực vô, sai nhìn
kì quá"*, *"quá ít động tác, tăng mạnh đi"*, *"THÊM 5-7 loại cây rừng"*.

Điều đáng ghi lại: **gần như chỗ nào cũng hoá ra là một lỗi kiến trúc, không phải chuyện nét vẽ.**

#### Con trỏ to gấp đôi — và một dạng lỗi đã lọt bốn lần

Từ Đợt 24 sprite rộng `ART` lần đơn vị thế giới, nên `g.drawImage(img, x, y)` **ba tham số** vẽ theo cỡ pixel
ảnh, tức gấp đôi cỡ thật. Lúc chuyển 47 chỗ sang `put()` tôi bỏ sót ba chỗ vì chúng viết nhiều dòng. Không
phép kiểm nào bắt được: sim không có canvas, `tsc` thấy ba tham số là hợp lệ, build vẫn xanh. Người bắt được
là Cường — tức là nó đã ra tới bản chạy.

Kịch bản 164 nay **quét chính `draw.ts`** để chặn dạng gọi ấy (bỏ chú thích trước khi quét, nếu không chính
dòng tài liệu giải thích luật sẽ làm kịch bản đỏ). Cùng dạng lỗi ấy còn ba chỗ nữa trong `atlas.ts`: con vật
quay trái bị cắt mất một nửa, xe quay trái/lên/xuống trôi khỏi ô, nhãn túi hạt co lại còn một góc. Cách sửa
đúng là **bỏ đi cơ hội viết sai**: gom phép lật và phép xoay về `latNgang()` / `xoayQuanhTam()`.

#### Vì sao mọi con vật từng trông giống nhau

Bản trước dựng **mọi** con bốn chân bằng cùng một quả trứng, rồi phân biệt bằng vài cờ rời rạc (`patch` cho
bò, `fluff` cho cừu, `snout` cho heo). Nhưng con bò khác con heo ở **bóng dáng** chứ không ở đốm: bò lưng
thẳng ngực sâu chân cao, heo thùng tròn bụng sệ chân ngắn, cừu là một đám mây có bốn que, chó ngực nở bụng
thóp. Bốn bóng dáng ấy gộp làm một quả trứng thì tô màu gì cũng vẫn là bốn quả trứng khác màu.

Nay mỗi loài có một **hồ sơ hình**, trong đó đường lưng và đường bụng là **hàm** theo dọc thân — đó là chỗ
khác nhau lớn nhất giữa các loài, và cũng là thứ cho phép con vật cúi, chồm, chổng mông.

Ba lỗi phải sửa sau khi xem trên trình duyệt, cả ba là "đúng ý mà sai hình": cái đầu **chạy ra ngoài mép
canvas** (nay thu THÂN chứ không thu đầu — mất một pixel bề dài không ai để ý, mất cái đầu thì ai cũng để
ý); **cổ dày gần bằng cái đầu** nên con chó ra hình con lạc đà; **đầu đặt cao ngang đường lưng** nên thành
một cái bướu thứ hai mọc trên vai.

#### Mười tám tư thế, mà không vẽ 720 bức

15 tư thế × 4 dáng × 4 hướng × 3 khung là 720 hình — không làm nổi và cũng không nên: chúng khác nhau ở đúng
vài con số của cùng một bộ xương. Nên tư thế là một **bảng tham số**; thêm tư thế mới là thêm một dòng. Con
vật rảnh bốc việc từ bảng trọng số theo `hash2(id, ngày, nhịp)` — tất định, và **không thêm một byte nào vào
save**, vì thêm một trường là thêm một bước migrate và một bất biến phải giữ mãi.

#### Bốn loại nước, và một câu trả lời do content nói ra

Hồ cá, con sông và mặt biển từng dùng **chung** một hình gợn lăn tăn 16×16: dòng sông không chảy về đâu cả,
mặt biển đứng im, và cả ba là một tấm lưới ô vuông lặp lại. Nay lớp vẽ **tự suy ra** loại nước từ hình dạng
vùng nước — trừ BIỂN, thứ được xác định bằng vùng nước nối liền với **cổng biển** (chỗ thuyền buôn đi vào).
Thử đoán bằng "nước chạm mép dưới bản đồ" thì hỏng ngay: bản đồ có viền cây bao quanh nên cả vịnh bị nhận
nhầm thành một con suối chảy ngang.

Mặt nước thành **mảng lặp 64×64** tô bằng `fillRect` (cùng mẹo với lớp mưa của Đợt 23): vệt nước dài hơn cả ô
nên nó chảy xuyên qua ranh giới ô, và không còn chu kỳ nào đủ ngắn để mắt bắt được cái lưới.

#### Con thuyền sai góc nhìn

Nó được vẽ như **nhìn ngang** trong khi cả bản đồ nhìn từ trên xuống — cái buồm tam giác dựng đứng ấy chỉ
đúng nếu người xem đứng ngang mặt nước. Nhìn từ trên, buồm phải là một cánh cung phồng chạy dọc từ cột về
lái. Buồm cũng thôi lấy màu `accent`: `accent` của thuyền là màu gỗ bánh lái, nên lấy nó thì thuyền căng một
lá buồm nâu — cùng dạng lỗi với hai cái sừng hồng của con bò.

#### Bảy loài cây rừng, và cây UỐN chứ không TRƯỢT

Thông · bạch dương · dừa · liễu · phong · tre · cây khô, rải theo vùng (dừa ven biển, liễu ven sông, thông ở
rừng Bắc). Và cây cao nay cắt làm **bốn lát**, mỗi lát dịch theo bình phương độ cao: gốc đứng yên, ngọn đi xa
nhất, thân cong thành một cung. Bản trước cắt hai lát nên cả cái tán dịch nguyên khối — cái cây bị *xô* chứ
không bị *uốn*.

### Đợt 24: HD pixel art, và sáu mươi mốt cây thôi giống nhau (core 1.51 · content 1.51)

Cường: *"tái cấu trúc hàng loạt — nâng cấp đồ hoạ lên HD pixel art"*, rồi giữa đợt: *"tính ra là
toàn mấy cây giống nhau… toàn màu tự tựa giống nhau khó phân biệt."*

#### Một hệ số nghệ thuật, không phải một cuộc vẽ lại từ số không

`TILE` mang hai vai từ ngày đầu: một ô ăn **16 đơn vị thế giới** (toạ độ nằm trong bản lưu, hộp va
chạm, A*) và một sprite rộng **16 pixel**. `ART = 2` tách chúng: một ô vẫn 16 đơn vị thế giới,
sprite của nó rộng 32 pixel. Trên màn hình kích thước **không đổi một pixel**; mật độ chi tiết gấp
bốn. `SAVE_VERSION` giữ nguyên 10 — bản lưu cũ nạp ra đúng từng toạ độ.

Đo trước khi làm, và con số đổi hẳn hình dạng của đợt:

| Đo được | Con số |
|---|---|
| Hệ số phóng ở 1000×700 | 4× — mỗi pixel bị thổi thành ô vuông 4×4, đó chính là chỗ trông thô |
| Atlas trong bộ nhớ | 0,59 MB → **2,35 MB** |
| Thời gian dựng atlas lúc mở game | **≈ 148 ms** |
| `drawImage` một khung, ruộng lúa kín | **536** — HD không thêm một lệnh nào |

**HD gần như miễn phí lúc chạy**: sprite 32px vẽ ở hệ số 2 tô đúng ngần ấy pixel đích như sprite
16px vẽ ở hệ số 4. Giá phải trả là bộ nhớ và công vẽ lại.

Đổi lại phải trả một ràng buộc: **hệ số phóng chia hết cho `ART`**. Sprite 32px vẽ ở hệ số 1,5 thì
mỗi pixel nguồn trải ra 1,5 pixel đích — pixel art hỏng, và HD trông *xấu hơn* bản cũ.

#### Ba bản sao của `TILE`, và một lỗi lệch nửa ô

Có **ba** hằng `TILE` bằng 16, không cái nào import cái nào, không kịch bản nào kiểm chúng khớp
nhau: cỡ ảnh (atlas), đơn vị thế giới (world), và `DEFAULT_CAMERA_CONFIG.tile` gõ tay. Tệ hơn:
`main.ts` và `draw.ts` lấy `TILE` từ **atlas** rồi dùng nó làm đơn vị thế giới. Ngày cỡ ảnh đổi mà
thế giới không đổi — tức đúng đợt này — hai vai ấy phải tách.

Nó đã lệch thật một lần: `drawActors` neo hình bằng `img.width / 2`, mà từ khi có ART một con vật
16 đơn vị thế giới có canvas rộng 32 pixel. Mọi con vật, mọi người làm, mọi chiếc xe đứng lệch
**nửa ô** so với chỗ luật chơi nói họ đang đứng. Bắt được vì đọc lại từng dòng dùng `.width`, không
phải vì test — sim không có canvas nên không gọi được lớp vẽ.

#### Vì sao 61 cây từng trông giống nhau

61 cây chia vào 11 dáng, nhưng **bên trong một dáng thì mọi cây vẽ y hệt nhau, chỉ khác bảng màu**.
Mười loại củ ra mười túm lá giống hệt. Năm loại ngũ cốc ra năm cái quạt giống hệt. Năm quả họ dưa
thì không hiện quả nào cả — quả chỉ to bằng hai ba pixel, nên quả dưa hấu **không thấy được**. Và
hơn bốn mươi cây mang cùng một sắc xanh lá, mà ở cỡ mười sáu pixel thì màu là thứ đọc được sau
cùng.

Ba tham số content mới, đều tuỳ chọn nên pack cũ không đổi hình:

* **`fruitShape`** — dáng quả: ớt thon nhọn, bắp ngô có hàng hạt, trái đậu dẹt có ngấn, việt quất
  thành chùm, bông lúa trĩu cong, chuỗi hoa oải hương, cánh cuộn hoa hồng.
* **`pattern`** — mặt ngoài: sọc dưa hấu, múi bí đỏ, vân lưới dưa lưới, đốm khoai mì.
* **`leafShape`** — dáng lá: lá ống của hành, lá tròn mọc đối của húng quế, lá xẻ của ngò, lá bản
  dài của sả. Chín loại rau thơm thôi là chín cái quạt giống nhau.

Biểu tượng trong túi đồ cũng đi theo: trước đợt này cả 61 cây dùng **đúng một hình** — hai đĩa tròn
lệch nhau, khác mỗi màu. Nay quả trong túi là quả ngoài ruộng, còn cây ăn lá thì là một bó rau bó
theo đúng kiểu lá của nó.

Kịch bản 163 biến chuyện này thành một luật đo được: hai cây trùng "chữ ký hình" chỉ được phép khi
bảng màu của chúng cách nhau tối thiểu 150. Nó bắt cả cách hỏng dễ xảy ra nhất — thêm cây mới bằng
cách chép object của cây cũ rồi đổi tên và giá.

### Đợt 23: lớp vẽ nhanh gấp ba, rồi tiêu chỗ trống ấy vào đồ hoạ (core 1.50 · content 1.50)

Cường: *"tối ưu tiếp tốc độ đi, trạng thái đồ hoạ nhiều vô, tăng thêm sprite nhiều vô."* Hai vế ấy
đi cùng nhau: thêm đồ hoạ mà không dọn chỗ trước là thêm vào một cái ngân sách đã chật.

#### Đo trước, và con số nói ngay chỗ nào KHÔNG đáng sửa

`npm run bench` cho biết cả phần mô phỏng — TICK, A\*, cây lớn, AI — tốn **0,2%** ngân sách một
khung hình. Không còn gì để lấy ở đó. Tiền nằm ở **lớp vẽ**, và nó chưa từng được đo: Đợt 15 mới chỉ
đo HUD. Cảnh đo mới (285 ô, đêm, bão, 28 thực thể): **600 lệnh `drawImage`, 0,90 ms mỗi khung**.

#### Hai câu hỏi, cùng một dạng: "thứ này có cần vẽ lại mỗi khung không?"

**Nền** chiếm quá nửa số lệnh — mỗi ô ít nhất một, ô đất cày tới sáu. Nhưng nó chỉ đổi khi một ô đổi,
khi camera trôi sang ô mới, hoặc khi trời bắt đầu mưa. Nay nó được vẽ một lần vào canvas phụ rồi dán
lại. Khoá vô hiệu hoá là phép so **tham chiếu** `s.tiles`: mảng ô là copy-on-write nên một ô đổi là
cả mảng đổi — rẻ nhất có thể, và không thể bỏ sót. Kịch bản 159 là dây bẫy cho đúng điều kiện ấy:
ngày nào có ai sửa một ô tại chỗ, cache sẽ đứng hình và lỗi đó im lặng, chỉ người chơi thấy.

**Mưa** tốn 110 lệnh mỗi khung khi bão cho một thứ trang trí — và vì vị trí hạt băm lại theo từng
nhịp 1/10 giây, cả màn mưa *nhảy cóc* mười lần mỗi giây. Nay là một mảng lặp 64×64 tô kín màn bằng
đúng một `fillRect`, gốc trôi liên tục: rẻ hơn hai bậc **và** rơi mượt thật.

Kết quả: **600 → 149 lệnh vẽ, 0,90 → 0,30 ms** (−67%).

#### Rồi tiêu chỗ trống ấy

- **Cây cỏ đổi màu theo mùa.** Lớp phủ màu mùa toàn màn đã có từ lâu, nhưng nó nói "đang mùa nào" với
  mọi thứ như nhau, kể cả mặt đường. Cái thiếu là trạng thái của TỪNG VẬT. Vật nào đổi là do content
  quyết (`prop.seasonal`), không phải một bảng id gõ cứng trong mã vẽ. **Hạ là mùa gốc** — giữ nguyên
  bảng màu trong `props.json`, vì con số trong content phải đúng nghĩa ở ít nhất một mùa.
- **Khói bếp**, một nhà một ống khói, chỉ bốc khi trời tối hoặc mùa đông. Cột khói cố ý thấp: ngôi nhà
  nằm sát mép trên bản đồ, mà camera không trôi lên quá mép được — khói cao hơn là bốc thẳng ra sau
  thanh HUD, tức vẽ cho không ai xem.
- **Bướm ban ngày, đom đóm ban đêm.** Trang trí thuần: không một thực thể nào vào save, không một lần
  tìm đường nào; vị trí là hàm thuần của (chỉ số con, đồng hồ vẽ). Nông trại ban ngày vốn im phăng
  phắc trừ lúc có con vật đi ngang, còn ban đêm thì tối và trống.

Đo lại với **51** thực thể — gần gấp đôi cảnh gốc — vẫn là 252 lệnh và 0,51 ms, tức vẫn rẻ hơn hẳn
mốc 600 lệnh / 0,90 ms ban đầu. Đó là điều kiện để lần sau còn thêm được nữa.

### Đợt 22: một bộ não cho cả người làm lẫn nút TỰ ĐỘNG (core 1.49 · content 1.49)

Cường: *"tăng trí tuệ cho các NPC, để họ tự chủ bao quát hầu hết tất cả các công việc trong nông
trại… tránh tình trạng đứng im quá lâu quá nhiều"*, và chốt thêm: *"khi sử dụng tính năng tự động
làm thì cũng phải kế thừa trí thông minh này."* Câu chốt ấy đổi hình dạng cả đợt — mọi thứ dưới đây
phải nằm ở chỗ **cả hai bên cùng đọc**.

#### Bốn lỗi tìm được trước khi thêm được một tính năng nào

Khảo sát định mở đường cho tính năng mới, nhưng va phải bốn thứ hỏng sẵn:

1. **Người làm KHÔNG BAO GIỜ gieo được trên luống khô.** `cropTask` là một chuỗi `else if` mà nhánh
   "đã cày mà chưa ẩm → tưới" đứng trước, nên nó nuốt luôn mọi luống trống khô. Người chơi thì gieo
   được — `canUseAt` không hề đòi `wet`. Hai luật khác nhau cho cùng một động từ, im lặng nhiều đợt.
2. **Hai thang việc đã trôi khỏi nhau.** Nút TỰ ĐỘNG gieo trước tưới, người làm tưới trước gieo —
   đúng thứ `docs/LOI-CHOI.md` cấm ("thứ tự ưu tiên là CỐ ĐỊNH, người chơi phải đoán được"), và hai
   tài liệu còn ghi rằng chúng "dùng chung một hàm". Chúng chưa bao giờ dùng chung gì cả.
3. **Lô bỏ bê là lô chết vĩnh viễn.** Cỏ dại lan vào lô mỗi đêm, luống bỏ hoang tự mọc cỏ lên chính
   nó, mà ô có vật thể thì không cày được — và không ai được phép dọn: người làm chỉ dọn trong rừng,
   nút TỰ ĐỘNG cố ý không dọn gì.
4. **Hết vật tư là im lặng tuyệt đối.** Kho ĐẦY thì có báo; kho THIẾU thì không — mà thiếu mới là
   thứ người chơi sửa được trong một phút.

#### Sửa bằng cách rút cái QUYẾT ĐỊNH ra, không phải viết chung một hàm

`CROP_ORDER` trong `src/game/joborder.ts` — một module **không import gì cả**, và điều đó là bắt
buộc: `hint.ts` đã import `workers.ts`, nên đặt hằng ở một trong hai bên là tạo vòng import. Hai hàm
quét vẫn riêng (một bên đo từ nhân vật, một bên đo từ chỗ người làm đứng), nhưng thứ tự thì chỉ còn
một nguồn. Đó mới là bài học: không phải "viết chung một hàm" mà là rút cái **bảng quyết định** ra.

#### Dọn cỏ: lằn ranh rút từ content, không đoán

Việc mới `clear` là một `UseKind` thật, nên nút TỰ ĐỘNG có nó miễn phí. Nhưng nó phải không bao giờ
đụng cảnh quan người chơi cố ý chừa — nỗi sợ đã ghi thành chú thích trong `workers.ts` từ lâu. Lằn
ranh: **nhổ được bằng tay không** + **tự mọc qua đêm** + **trong lô ruộng**. Ba vế cộng lại loại đúng
hai vật thể `portable` duy nhất của content — hòn đá và khúc gỗ — tức đúng hai thứ người chơi vác đặt
xuống được. Không viết cứng một id nào; OTA đổi bộ cây thì luật tự đúng theo.

#### Cái "đứng ngơ" đang trợ cấp ngân sách cho đàn bò

Đây là chỗ suýt hỏng. Ngân sách A\* (2 suất mỗi bước) dùng **chung** cho cả đàn vật nuôi, xe và người
làm. Một người làm hết việc đứng im 2–6 phút game thì **không tiêu một suất nào** — nên thay nó bằng
"đi tuần" là lấy đúng khoản trợ cấp ấy đi, và triệu chứng hiện ra ở chỗ không ai ngờ: con vật chậm
được ăn. Nên việc vặt chia hai hạng: nói chuyện / vuốt ve / bốc xếp **không tốn một lần tìm đường
nào** (chỉ xảy ra khi đối tượng đã ở ngay cạnh), còn đi tuần chịu một cái nguội rộng gấp bốn. Kịch
bản 151 khoá trần số lần gọi A\*, 152 đo mốc con vật đầu tiên ăn được.

Xã giao là **đơn phương**: mỗi người tự quyết, không ghi gì lên người kia; nếu người kia cũng rảnh
thì chính luật ấy khiến họ cũng quay lại nhìn. Mọi cơ chế "A chọn B rồi đi tới B" đều đẻ ra hai bệnh
— B đi mất giữa chừng, hoặc hai người đổi chỗ cho nhau mãi.

#### Nhìn thấy họ làm việc

Hai khung **giơ** và **chạm** đã được bộ sinh hình dựng và cache sẵn cho mọi bộ đồ từ lâu, chỉ là lớp
vẽ chưa bao giờ yêu cầu chúng cho người làm. Giờ có: giơ cuốc rồi bổ xuống, cầm đúng đồ nghề theo
việc được giao (không theo hotbar — họ không có hotbar), đội món đang đeo trên đầu, hạt bụi bay khi
nhát chạm đất. Cố ý **không có tiếng**: ba người mỗi người một nhát mỗi 1,5 phút game sẽ thành xưởng
rèn, và tiếng "cuốc" vốn là phản hồi cho cú bấm của người chơi.

Lời kêu thiếu hàng đi ba đường: bong bóng chấm hỏi trên đầu, dòng trên thẻ người làm, và một chip
vàng ở HUD gộp lời cả đội. Báo đúng một lần mỗi món; hàng về thì chip tự tắt — cái chip biến mất
chính là phản hồi. **Không ai tiêu một đồng nào của người chơi**, kể cả nút TỰ ĐỘNG: nó nói "hết hạt
đúng mùa" thay vì tắt lặng lẽ.

### Đợt 21: nút ngữ cảnh một nguồn, thời tiết có hành vi, cầu lan can và xe to (core 1.48 · content 1.48)

Cường: "nút ngữ cảnh… vài tình huống vẫn còn rối", "thêm hành động cho nhân vật, động vật, cảnh
quan ảnh hưởng bởi thời tiết gió bão trời mưa", "cầu có lan can, xe to hơn".

#### Nút chính nói một đằng làm một nẻo — vì nó có HAI bộ luật

Khảo sát chỉ ra gốc: nhãn do `hintAt` → `contextAction` tính, còn cú bấm trong `main.ts` đi một bộ
luật khác (`tryAnimal` bán kính 1,4 / `canUseAt` / `tryInteract` qua `nearbyInteract` với công thức
khoảng cách riêng 2,8 ô / chuyến). `contextAction` **không có một lời gọi nào ngoài hint.ts**. Thêm
vào đó: HUD tính nhãn cho ô đang rê chuột, cú bấm dùng ô trước mặt; reducer đo tầm bằng 1,6 ô còn UI
bằng 2,8; XÂY và THU ngược thứ tự giữa nhãn và bấm. Mười một ca rối, cùng một nguyên nhân.

Sửa bằng cách **bỏ một bộ luật**: `pressPlan(state, content, cursor, opts)` trong `src/game/hint.ts`
trả về đúng một `Press` (`deny · build · use · gather · interact · boat · go · run`), `main.ts` chỉ còn
`execute(press)`, và nhãn là `hintOf(press)`. Ba thứ chỉ còn một: ô ngắm (`pressCursor`), tầm với
(luật của reducer), bán kính con vật. Khi nút nói về một ô khác ô ngắm, bản đồ vẽ dấu mờ ở ô đó và
dòng dưới nút ghi "Cách N ô — bấm để đi tới". Nút phụ cũng vậy: `infoHint` biết cả người làm, HUD và
cú bấm cùng gọi nó. Kịch bản 146 dựng 11 tình huống, mỗi ca `deepEq(hintOf(press), hintAt())` — cấy 5
lỗi (XÂY sau THU, bỏ kiểm tầm, cửa thoát cũ, con gần nhất thay vì con tới lứa, dọn dẹp cướp lời) đều
đỏ đúng ca. Tiện thể: NGỦ nay đi qua `INTERACT` nên có cả diễn hoạt leo lên giường lẫn kiểm tầm —
trước đây nút chính dispatch `SLEEP` thẳng và bỏ qua cả hai.

#### Thời tiết đổi hành vi, bằng ba cờ trong content

`weather.json` thêm `speedMul` (mọi thứ ngoài trời chậm lại), `shelter` (vật nuôi trú), `halt`
(người làm về đứng trước kho, xe thu mua và thuyền không ghé, con đói cũng không ra bãi cỏ). Mưa:
0,85 + trú; bão: 0,7 + trú + ngưng. Tất cả tắt trong nhà (`weatherMood`). Hai quyết định đáng ghi:
con **đói vẫn ra ăn khi mưa** (mưa dầm tối đa 3 ngày mà nhịn là mất trứng), và xúc xắc xe thu mua
**vẫn được rút** ngày bão rồi mới gác — gác trước xúc xắc là làm ngày nắng kế tiếp đổi kết quả so với
bản cũ, mà kịch bản 41 không bắt được vì nó chỉ so cùng seed với chính nó. Kịch bản 147 đo tốc độ
bò và người chơi (tỉ lệ đúng 0,7, trong nhà thì không), bò đói máng cạn ở lì trong chuồng ngày bão
nhưng ra ăn ngày mưa, bò no ngày mưa không đi một bước, người làm về ô trước kho với năng lượng không
đổi, 12 ngày bão không xe không thuyền — và chuỗi seed kho-có-hàng khác kho-trống. Lớp vẽ: cây/bụi/cỏ
lay theo `prop.sway × wind`, mưa nghiêng, lá bay từ tán cây (hạt chịu lực ngang `windX`), mặt nước
gợn nhanh hơn, vũng nước trên lối đi, giọt bắn dưới chân, bò co ro (`pose: "huddle"`), người làm
trú có bong bóng giọt nước.

#### Cầu có lan can, xe hai ô

Lan can theo **cạnh giáp nước** chứ không theo "không cùng prop" — đầu cầu tiếp đất phải mở, nếu
không người đi xuyên lan can khi lên cầu (`bridgeRail` đọc bản đồ, atlas dựng sẵn 16 biến thể). Lan
can cạnh DƯỚI là một hình riêng đẩy vào `items` với `base = y·16 + 16 + 5` — nằm sau người đứng trên ô,
trước người ở ô dưới; đây là lần đầu danh sách vẽ có một lớp phủ đè lên actor. Cầu đường: vạch giữa
chỉ vẽ ở mối nối hai cột. Xe: canvas 32×32, thân 24×13 (một rưỡi ô), hai khung bánh, ba dáng suy từ
content (thuyền có buồm và nhấp nhô; xe thu mua sàn phẳng chở kiện; xe giao hàng thùng kín); hộp va
chạm giữ 13×11 nên đường 1 ô vẫn đi được; neo theo kích thước hình nên xe không nhảy vị trí.

### Đợt 15: bản đồ nhỏ thôi vẽ lại cả bản đồ mỗi khung, A* nhanh gấp ba (core 1.41)

Đợt này bắt đầu bằng một câu hỏi mở — "game có chậm không" — nên việc đầu tiên là
**đo**, không phải sửa.

#### Đo trước đã: chậm ở đâu

Đợt 9 đo bằng tay rồi số liệu trôi mất theo phiên làm việc, nên Đợt 15 mở lại đúng
câu hỏi ấy mà không có gì để so. Giờ có `npm run bench` — cùng một cảnh dựng theo
cùng một hạt, chạy lại được bất cứ lúc nào, nên hai lần đo cách nhau nửa năm vẫn
nói chuyện được với nhau.

Cảnh đo: 1.776 ô · 360 cây · 27 thực thể (đông hơn hẳn lối chơi bình thường).

| | Trước | Sau | % ngân sách 60fps |
|---|---|---|---|
| TICK trọn vẹn (một khung hình) | 0,0278 ms | 0,0281 | 0,2% |
| · catchUpEntities | 0,0027 | 0,0028 | 0,0% |
| · growCrops | 0,0198 | 0,0200 | 0,1% |
| · moveActors | 0,0023 | 0,0024 | 0,0% |
| · runActorSteps | 0,0001 | 0,0001 | 0,0% |
| autoJob | 0,0031 | 0,0033 | 0,0% |
| **findPath** | **1,3382** | **0,4680** | **8,0% → 2,8%** |

Kết quả đọc ra ngay từ dòng đầu: **cả phần mô phỏng gộp lại tốn 0,2% một khung
hình**, còn **một lần gọi A* tốn gấp năm mươi lần tất cả những thứ đó cộng lại**.
Mọi thứ khác trong bảng là nhiễu. Nên đợt này chỉ có đúng một chỗ đáng đụng vào.

#### Tốc độ render UI: 3.007 → 1.265 lệnh vẽ mỗi khung

Đo bằng thứ không phụ thuộc lịch trình trình duyệt — **đếm lệnh vẽ**. Trên nông
trại 360 cây + 54 thực thể ở 430×932:

| | Trước | Sau |
|---|---|---|
| `fillRect` | **1.786** | **45** |
| `drawImage` | 1.191 | 1.191 |
| còn lại (save/restore/setTransform/fillText…) | 30 | 29 |
| **tổng** | **3.007** | **1.265** |

1.786 lệnh `fillRect` là gần đúng bằng số ô của bản đồ (1.776), và đó chính là
nó: **bản đồ nhỏ vẽ lại toàn bộ địa hình, từng ô một, mỗi khung hình** — 59%
tổng số lệnh vẽ của cả trò chơi, cho một bức ảnh gần như không đổi.

Nó *có* cache. Cache hỏi `s.tiles !== lastTiles`, và trên giấy thì hợp lý:
reducer dùng copy-on-write nên mảng chỉ đổi khi có gì đổi. Chỗ hỏng là **"có gì
đổi" xảy ra ở MỌI khung hình** — cây trồng cộng dồn `grow` từng khung, nên chỉ
cần một ô ẩm có cây là `dTiles` nhân bản cả mảng. Nông trại đã gieo thì cache
không bao giờ trúng một lần nào. Một dòng đúng về mặt logic, sai về mặt thực tế,
và im lặng suốt mười bốn đợt vì nó *trông* như đang tối ưu.

Hai tầng thay cho nó:

* **So TỪNG Ô, không so tham chiếu mảng.** Copy-on-write chỉ thay object của
  những ô thật sự đổi, nên một phép so tham chiếu cho mỗi ô — rẻ, không đụng
  canvas — tìm ra đúng vài ô cần vẽ. 1.786 → 405.
* **Nhớ MÀU đã vẽ của từng ô.** Ô đổi object chưa chắc đổi màu, và phần lớn là
  không: màu chỉ phụ thuộc nền, đất cày, ẩm, công trình, vật thể, và cây đã chín
  hay chưa — `grow` không nằm trong đó. 405 → **45**.

**Kịch bản 139 canh cả hai chiều**, và chiều thứ hai mới là chiều quan trọng: vẽ
ít đi thì dễ, vẽ ít mà vẫn ĐÚNG mới khó. Nó dựng bản đồ nhỏ trên một DOM giả có
ghi lại ảnh thật sự vẽ ra, chạy một chuỗi thay đổi thật (cây chín, đất khô, xây,
chặt) qua nhiều khung, rồi dựng một bản đồ nhỏ **mới tinh** cho vẽ một lần trên
state cuối — và đòi hai bức ảnh khớp **từng ô**. Một cache vẽ ít mà trôi dần thì
tệ hơn hẳn không có cache. Bốn đột biến đã cấy và thấy đỏ.

#### A*: 1,34 ms → 0,47 ms

Ruột A* vốn đã viết tốt — heap nhị phân, phá hoà tất định, heuristic chia đúng hệ
số tốc độ lớn nhất. Hai thay đổi:

* **`Map` khoá số nguyên và heap object → mảng định kiểu dùng lại.** Hết cấp phát
  sau lần đầu. Đo được: 1,338 → 1,296 ms. **Gần như không ăn thua** — và đó là số
  liệu đáng giá nhất của cả đợt, vì nó chỉ đúng chỗ còn lại.
* **Ghi nhớ tính chất ô trong mỗi lần tìm.** Ba phép hỏi địa hình —
  `walkableTile`, `blockedForActor`, `stepSpeed` — mới là chỗ tốn. Mỗi ô bị hỏi
  lại một lần cho MỖI hướng dẫn tới nó (tới tám lần), cộng hai lần nữa mỗi khi có
  ai đi chéo qua góc nó. Mà câu trả lời không đổi trong suốt một lần tìm: cả ba
  chỉ phụ thuộc (state, content, ô, hộp, bơi). Hỏi một lần rồi ghi lại: 1,296 →
  **0,468 ms, nhanh gấp 2,9 lần.**

Dấu phiên (`ky`) tăng mỗi lần gọi thay cho việc xoá 1.776 ô, nên ghi nhớ không
sống quá một lần tìm.

**Kịch bản 138 canh đúng cái phải canh, và nó không phải tốc độ.** Cả trò chơi dựa
trên "cùng seed + cùng chuỗi action = cùng state", nên A* trả về đường khác một ô
là save cũ replay ra một thế giới khác. Kịch bản giữ nguyên **bản A* tham chiếu
chậm** — chép nguyên ruột trước Đợt 15, quét tuyến tính, `Map` cho mọi thứ — rồi so
từng ô trên 144 cặp điểm qua sáu biến thể (hộp xe tải, tránh ruộng, dây xích hẹp,
trần nút thấp, lọc chỉ-đường, đích nhiều ô). Bốn đột biến đã cấy và thấy đỏ: quên
tăng dấu phiên (25 kịch bản đỏ), lẫn bit "hộp lọt" với bit "đi được", đổi chiều phá
hoà, và dùng chung dấu phiên cho hai bảng ghi nhớ khác nhau.

#### Thứ ĐÃ THỬ rồi bỏ đi

Đợt 9 để lại ba việc "chưa làm", đứng đầu là *"renderer vẫn cấp phát một object +
một closure cho mỗi thứ vẽ mỗi khung (100–400 closure/khung)"*. Đợt này làm thật:
gom hết vào một **bể dùng lại**, closure chỉ giữ cho vài chục ca phức tạp.

Rồi đo A/B trên đúng một trạng thái ghim: **y hệt nhau.** Gắn đồng hồ vào từng
chặng của `draw` thì rõ vì sao — chặng gom vật thể (chỗ cấp phát) chỉ tốn 67 ms
trong tổng 1.971 ms, tức 3,4%; chi phí nằm ở chính các lệnh `drawImage`.

Nên bể dùng lại đã bị **gỡ bỏ**. Một tái cấu trúc không dời được kim thì chỉ là
thêm phức tạp, và ghi lại việc đã thử thì lần sau khỏi thử lại.

Hai việc còn lại của Đợt 9 (`catchUpEntities` chép sâu mỗi khung, `growCropsIn`
quét 1.776 ô mỗi khung) giờ có số đo: 0,0028 ms và 0,0200 ms — cộng lại 0,14%
ngân sách. **Đóng lại, không đáng.**

#### Cá thôi nằm trên mặt đường

Có ba đường thả một con vật xuống bản đồ, và chỉ đường thứ nhất biết tới nước:

| Đường | Khi nào | Trước |
|---|---|---|
| xe giao hàng tới nơi (`doErrand`) | thường ngày | ✓ thả xuống ao |
| hết xe, mua thẳng (`BUY_ANIMAL`) | đội xe kín chuyến | ✗ thả xuống **điểm giao** |
| bảng gỡ lỗi, hết xe | — | ✗ thả **cạnh nhân vật** |

Điểm giao là mặt đường trước cửa kho. Mua một con cá đúng lúc ba chiếc xe đang bận
là con cá nằm trên đường nhựa, bất biến vỡ ở dispatch ngay sau, và ván chơi đỏ mỗi
khung hình cho tới hết đời. Nhánh dự phòng hiếm chạy — và hiếm chính là lý do nó
lọt qua mười bốn đợt.

Thêm `waterSpotForBox`, và nó khác `nearestWaterTile` ở hai chỗ:

* **Xét cả hộp va chạm**, không chỉ tâm ô. Con cá hiện tại rộng 8px nên luôn lọt
  trong một ô 16px — nhưng content sửa được qua OTA, và một con cá to là thứ hoàn
  toàn hợp lệ để thêm. Với thân 20px thì ô ở mép lạch có tâm hợp lệ mà thân thò
  lên hai bờ.
* **Bán kính phủ hết bản đồ.** Hằng 30 của `nearestWaterTile` không với tới: nông
  trại rộng 48 ô, điểm giao ở x=41, ao lớn ở x=2–7. Cách nhau 38 ô — nên câu trả
  lời là "chưa có ao" trong khi cái ao nằm ngay đó.

Kịch bản 137 đi cả ba đường cộng ca "hai mươi tư lượt thả liên tiếp" (chính hình
dạng thật của lỗi: đội xe bão hoà từ giữa chừng, ba con cá chồng lên nhau ở ô
(17,4)). Bốn đột biến đã cấy và thấy đỏ.

#### Ba chỗ HUD lệch

Cả ba đều ở khổ hẹp, và cả ba đều là "nhìn thấy ngay mà đọc mã thì không thấy".

* **Nút ☰ chui xuống dưới thanh số liệu.** Chỗ chừa cho nó ràng vào
  `body:not([data-input="kbm"])`, nên ở chế độ bàn phím + chuột `padding-right`
  về 0 và thanh số liệu giãn hết bề ngang. Mà `#sysbtn` là nút chạm DUY NHẤT
  không bao giờ tắt — kbm giấu joystick, cụm hình thoi và D-pad, nhưng vẫn để ☰
  lại vì không có phím nào thay được nó. Chừa theo cái nút, không theo chế độ nhập.
* **Nút ☰ treo lệch khỏi hàng.** Nó neo theo `10px` cứng còn thanh số liệu neo
  theo `--hud-gap`, nên hai mép trên không bao giờ trùng. Rõ nhất khi thanh xuống
  hai dòng và hai hộp cao khác hẳn nhau. Giờ cả hai đo từ cùng một gốc.
* **Một chấm tròn lơ lửng dưới thanh số liệu.** Đó là icon dự báo ngày mai.
  `.ic` là `inline-grid` + `place-items: center`, nên `::before { content: "›" }`
  không phải chữ trang trí mà là THÊM MỘT Ô LƯỚI: chevron chiếm hàng trên, canvas
  bị đẩy xuống hàng dưới, tụt khỏi hộp 1.5em và lòi ra ngoài đáy thanh. Xếp hàng
  ngang thì chevron về đúng chỗ bên cạnh icon.

### Đợt 14: thức ăn tính bằng ĐIỂM, chó biết đi tuần, và tách hai cái quầy (core 1.40 · content 1.42)

Năm việc từ một lượt chơi thật.

**Máng thôi đếm PHẦN, bắt đầu đếm ĐIỂM.** Luật cũ: mỗi phần làm no HẲN, bất kể đó là bó rơm hay
cân cám đắt gấp năm; và một máng chỉ chứa được một món, nên muốn đổi món phải chờ cả đàn ăn hết.
Cường nói gọn: *"thức ăn j cũng dc, thức ăn càng mắc thì no càng lâu, quản lý thức ăn bằng điểm;
nhiều loại, cho vào chung máng cũng ec"*. Nay `Tile.trough` là số ĐIỂM, `diemThucAn(id)` suy giá
trị dinh dưỡng từ giá bán (kẹp 1..20), một bữa lấy tối đa `DIEM_MOT_BUA` điểm và làm no đúng
`điểm × PHUT_MOI_DIEM` phút — nên món mắc no lâu hơn theo đúng tỉ lệ tiền, không phải theo một
bảng tra tay. Trần máng 12 → **60 điểm**, và `troughId` chỉ còn để VẼ (món đổ gần nhất quyết định
hình cái máng) chứ không còn là khoá của luật ăn. `SAVE_VERSION` lên 10 với một bước nhân máng cũ
×5, giữ nguyên tỉ lệ no của save đang chơi dở.

Máng gần cạn thì bữa nhỏ hơn, và no ít hơn theo đúng tỉ lệ — đó là câu hỏi mà hệ "phần" không
trả lời nổi: một cái máng còn đúng một phần thì con vật ăn xong no bao nhiêu?

**Con chó đi tuần thật.** `job: "patrol"` trước đây chỉ có nghĩa "nhắm thẳng con sâu bọ gần
nhất"; không có sâu thì nó rơi xuống `wanderGoal` bán kính 4 và loanh quanh y hệt con gà. Nay hết
sâu bọ thì nó đi một VÒNG TUẦN — tâm từng lô ruộng và từng chuồng, thứ tự lấy từ content nên cố
định và kiểm được. Sau 20:00 thì thôi nhận chặng mới và về nằm ở nhà chó. Đói thì vẫn về máng
nhà mình như mọi con khác.

**Chợ và Quầy thu mua tách ra hai đầu.** Ảnh Cường gửi: hai cái đứng cách nhau ĐÚNG HAI Ô ở
(26,3) và (28,3) — trên màn hình 430 px một ngón tay phủ trọn cả ba ô, nên định mở cửa hàng hạt
giống là bật ra bảng bán nông sản. Quầy dời sang **(40,5)**, cạnh bãi giao nhận trước cửa kho —
hợp lý cả về chuyện bán hàng là chỗ xe tải tới lấy. Kịch bản 133 quét CẢ bản đồ để khoá điều
thật sự phải đúng: không tồn tại ô đứng nào bấm trúng cả hai.

**Đứng trong chuồng thì nút phụ mở BẢNG KHU.** `interactHint` hỏi con vật trước, khu sau — mà
trong chuồng thì chỗ nào cũng có một con bò trong tầm, nên nút luôn ghi "XEM BÒ" của đúng một
con ngẫu nhiên, trong khi câu người chơi hỏi khi bước vào là "cái chuồng này thế nào". Nay lề
HẸP (`PEN_INSIDE` = 1) hỏi trước: ở trong hoặc sát vách thì bảng khu thắng. Ra ngoài khu mà đứng
cạnh một con lạc thì vẫn "XEM BÒ" — nửa kia của luật, và là dây bẫy chống đảo thứ tự cho xong.

**Bảng khu vẽ lại.** Ba khối theo đúng thứ tự câu hỏi: *máng còn bao nhiêu* (dòng lớn "Máng
26/60 điểm" + thanh mức + **"còn ~2 ngày"** suy từ số con × mức ăn, chứ không bắt người chơi
nhẩm hai hằng số trong mã) → *hai nút phải bấm* → *từng con nào đang cần gì*. Danh sách nay là
TỪNG CON, con đói xếp lên đầu, bấm một dòng là mở thẳng thẻ của nó. Món ăn được hiện thành hàng
icon thay cho một dòng chữ liệt kê năm sáu cái tên. Và nút **Đổ máng** thôi bắt cầm sẵn thức ăn:
`pourBest` lấy từ tay → túi → kho. Trước đây mở bảng ra là gặp một cái nút xám kèm câu "cầm cỏ
khô để đổ" — tức là cái bảng bắt người chơi đóng nó lại, đi tìm đúng món, rồi mở lại.

### Đợt 13: người làm tự lo mọi việc, và cửa hàng thôi nói sai (core 1.39)

Cường gửi ảnh màn hình kèm ba chữ: *"npc k tự làm gì hết"*, và *"menu và chợ công trình chưa
đồng bộ"*.

**Vì sao họ đứng không: họ bị cấm gần hết mọi việc.** Người làm chỉ được thu hoạch, chữa cây và
tưới. Không cày, không gieo — luật cũ, và lý do khi ấy đúng: cày chỗ nào gieo chỗ nào là quyết
định bố cục, người làm tự ý thì người chơi mất quyền quy hoạch. Nhưng luật ấy viết hồi cả bản đồ
đều cày được. Từ khi có VÙNG, cuốc chỉ ăn trong `zones` loại `farm`, và mấy cái lô ấy sinh ra
đúng để trồng trọt. Trên một nông trại đã tưới xong và chưa tới vụ thì họ thật sự **không còn
việc nào hợp lệ** — đứng im là đúng luật, và luật sai.

Giờ một thang duy nhất: thu sản phẩm → đổ máng → thu hoạch → chữa → tưới → **gieo** → **cày** →
về kho → **rảnh thì vào rừng kiếm gỗ đá**. Hạt lấy từ kho và phải đúng mùa (hai lớp canh: một ở
`pickTask` để không nhận việc, một ở `doWork` để không nhặt nhầm hạt). Cày chỉ trong lô, không
đụng sàn chuồng. Kiếm tài nguyên **chỉ trong rừng** — không có ràng buộc ấy thì họ dọn sạch mấy
cái cây người chơi cố ý chừa lại quanh sân, và không có nút hoàn tác nào cho chuyện đó.

**Và một lỗi thật sự làm họ đứng đơ.** `doWork` không biết mình được giao việc gì — nó SUY LẠI từ
ô đích, và nhánh "có con vật ở gần" đứng trước rồi thoát sớm. Cái máng nằm giữa chuồng, quanh
máng lúc nào cũng có con vật, nên **mọi chuyến đi đổ máng đều về tay không**. Giờ `pickTask` ghi
loại việc vào `ai.job` và `doWork` chạy đúng việc ấy; kịch bản 132 vây kín cái máng bằng bò đói
và bắt họ vẫn đổ được.

**Phối hợp.** Tập "đã có người nhận" — cả ô lẫn con vật — dựng một lần ở đầu và lọc ngay trong
vòng chấm điểm, nên người thứ hai nhận **việc kế tiếp** thay vì đứng phí một lượt. Đo được: ba
người rảnh 12,4 % số lượt khi có tập, 26,3 % khi bỏ nó.

**Vai "chăm cây" / "chăn nuôi" biến mất** (đã bắt đầu ở Đợt 12, nay xong cả UI). Một nút "Thuê
người làm", không còn "Đổi việc", và thẻ người làm nói **việc đang làm** — "đang đi đổ máng",
"đang đi kiếm gỗ đá" — thay vì một cái vai không còn nghĩa gì, hay một toạ độ ô chỉ người viết
code đọc được.

**Cửa hàng.** Tiêu đề đổi theo tab: tab Thợ từng đội chữ "Cửa hàng hạt giống". Và bảng giá công
trình **bấm được**: bấm một công trình là vào thẳng chế độ quy hoạch với đúng nó đã chọn sẵn —
trước đây thẻ bị vô hiệu hoá, người chơi bấm thử không thấy gì rồi tự đi tìm chế độ xây ở chỗ
khác.

Kịch bản 129–132 mới; chín đột biến đều đỏ đúng chỗ. Trình duyệt thật: hai người làm cày 42 ô và
gieo hết 40 hạt trong hai phút, không ai giẫm chân ai.

Tiến độ của cả lộ trình theo dõi ở [`docs/TIEN-DO.md`](docs/TIEN-DO.md).

### Đợt 12: máng là cửa duy nhất, và con chó có nhà (core 1.38 · content 1.41)

Ba yêu cầu của Cường, và chúng hoá ra là **một** luật.

**"Cho động vật ăn là chỉ cho vào máng, hoặc rải xuống hồ; còn lại chúng tự ăn — không được bơm
thức ăn trực tiếp."** Trước đây có hai đường song song cùng làm một việc: đổ máng, và đứng cạnh
con vật bấm CHO ĂN. Đường thứ hai bơm thẳng `fed = fedMinutes` vào con vật, đi vòng qua cả hệ
thống máng — máng còn bao nhiêu phần, loài này ăn được món nào, con vật có tới được chỗ ăn không.
Hai đường thì sớm muộn cũng lệch, và đã lệch: đường máng hỏi món ĐANG NẰM trong máng, đường trực
tiếp lục cả túi tìm bất cứ món nào. Người chơi cho ăn kiểu ấy thì cái máng thành đồ trang trí.
Giờ chỉ còn hai cửa — `pourIntoTrough` và `feedPond` — và cả hai đổ vào **cùng một chỗ dữ liệu**
mà con vật đọc để tự ăn. Gỡ hẳn `FEED`, `feedAnimal`, nhãn `CHO ĂN`, và loại việc `feed`.

**Người làm cũng đi qua cửa ấy.** Họ từng bơm thẳng `fed` vào con vật y như đường tắt vừa bỏ —
nên người chơi đổ máng thì máng vơi, người làm cho ăn thì máng không nhúc nhích, và hai cách kể
hai câu chuyện khác nhau về cùng một đàn. Giờ họ **xúc cám từ kho đổ vào máng** (`pourFromStore`),
đúng việc người chơi làm. Kho rỗng thì không nhận việc, chứ không đứng đổ bằng tay không.

Và **vai "chăm cây" / "chăn nuôi" biến mất**. Nó vốn đã mỏng hơn vẻ ngoài: nhánh chăn nuôi bị
khoá sau `job === "livestock"`, còn nhánh cây trồng chạy cho cả hai — người "chăn nuôi" xưa nay
vẫn đi làm ruộng. Bỏ cái khoá là mọi người làm cùng một thang: thu sản phẩm → đổ máng → việc
trên ruộng → về kho.

**Nhà chó.** Con chó khai `housing: "free"` nhưng lại ăn ké máng chuồng bò — mà chuồng bò nhận cỏ
khô, thứ chó không ăn, nên nó thường xuyên nhịn cạnh một cái máng đầy. Giờ nó có khu riêng
`doghouse` ở góc đông sân sau, sát cái kho: một cái nhà chó, một cái máng nhận đúng hai món nó
ăn, một tấm biển. **Không rào** — rào lại là chặn đúng việc đi tuần của nó; và kịch bản 67 đổi
theo cho đúng luật: rào là để GIỮ, nên chỉ khu nào nhốt (`housing: "pen"`) mới cần rào.

Khu chó chỉ chiếm **hai hàng trên** của sân sau. Sân sau là khoảnh đất trống duy nhất đủ rộng để
bày một mảng vòi tưới hay nhà kính; lấn xuống hàng thứ ba là cắt mất nó, và cả nông trại không
còn chỗ nào khác — kịch bản 51 bắt được đúng chuyện đó ngay lần đầu thử.

Kịch bản 127–128 và phần (d) của 69 viết lại. Đột biến: bỏ việc đổ máng · đổ máng không trừ kho ·
nối lại nhãn CHO ĂN dưới một loại việc khác — cả ba đều đỏ. Trình duyệt thật: đứng cạnh bò đói
với cỏ khô trong tay, bấm cả nút chính lẫn nút phụ, bò vẫn đói và cỏ khô không mất một bó nào;
con chó đói tự về máng nhà nó ăn.

### Đợt 11: con vật đói cả ngày, và một lúc chỉ một chế độ điều khiển (core 1.36 → 1.37)

Cường chơi bản 1.36 rồi báo: *"mặc dù là máng có thức ăn, nhưng mấy con vật đói nó không có ăn
mà nó cứ chấm than miết"*, và *"cho phép mấy con động vật ở trong chuồng di chuyển xuyên qua
nhau"*. Hoá ra là **một lỗi duy nhất**, và nó cũng giải thích luôn chuyện thứ hai.

**Đồng hồ trong ngày LÙI mỗi sáng, còn kế hoạch của con vật thì không.** `entities.ts` hỏi "con
này vừa nghĩ xong chưa" bằng `minutes - planAt < REPLAN_COOLDOWN`. `planAt` là mốc trên đồng hồ
trong ngày; `newDay` kéo `minutes` từ 1560 về 360 mà không đụng tới `planAt`. Con nào nghĩ lúc
1535 hôm qua thì sáng nay phép trừ ra −1175, nhỏ hơn 2, nên nó bị bắt "nghỉ" cho tới khi hôm nay
trôi qua đúng cái mốc của hôm qua — **gần trọn một ngày**. Dòng ấy đứng trước cả nhánh "đói thì
ăn", nên con vật không ăn, và trước cả nhánh lang thang, nên nó **đứng chết một chỗ**. Đo được:
bò đứng cạnh máng 12 phần cỏ khô, `fed = 0`, chấm than trên đầu, từ 6 giờ sáng tới tối. Cả đàn
đứng im cùng lúc — đọc ra thành "tụi nó kẹt nhau". **Người làm thuê dính cùng một phép so**, nên
sáng ra họ cũng đứng. Lỗi có từ commit thêm `REPLAN_COOLDOWN`, không phải hồi quy gần đây.

* `newDay` xoá kế hoạch hôm qua của **mọi** thực thể: `planAt`, `until`, và cả đường đang đi dở.
* Phép so mới `dangNghi()` coi một mốc ở "tương lai" là đã hết hạn — lưới thứ hai, để save cũ
  đang kẹt cũng tự lành ở khung hình đầu tiên.
* **Đói thì hỏi bữa ăn TRƯỚC bốn cái cổng** (đồng hồ nghỉ, xúc xắc nghỉ 45 %, ngân sách A*, đồng
  hồ nguội). Bốn cổng ấy dựng lên để canh chi phí TÌM ĐƯỜNG, mà ăn thì không tốn một nút A* nào.
  Đo được: đứng sát máng, hỏi trước thì ăn ở bước quyết định kế tiếp (15 khung); hỏi sau thì 90.
* `penGoal` chọn ô đứng cạnh máng phải **đứng được** (hỏi `blockedForActor`, không chỉ hỏi
  `prop === null` — công trình nằm ở `t.b`) và phải là ô **gần con vật nhất**, không phải ô đầu
  tiên của một danh sách cố định. Xây một cái vòi tưới ngay dưới máng là đủ để cả chuồng chết đói
  cạnh máng đầy, và bảy ô trống còn lại không bao giờ được xét.
* Đích kiếm ăn mà không có đường thì rơi xuống lang thang trong khu, thay vì đứng nghỉ rồi thử
  lại **đúng cái đích chết ấy** mãi mãi.

**Con vật đã đi xuyên qua nhau từ đầu** — `blockedForActor` chỉ đọc ô đất, không đọc danh sách
thực thể, và người chơi cũng đi xuyên con vật. Không sửa gì; cái nhìn thấy là hệ quả của lỗi trên.

**Một lúc chỉ một chế độ điều khiển.** `body.touch` chốt một lần lúc khởi động và không bao giờ
gỡ; `data-input` chỉ nói "có tay cầm cắm", không nói "đang dùng tay cầm". Hai cờ độc lập, nên
điện thoại cắm tay cầm hiện **cùng lúc** cụm nút chạm lẫn hai dải gợi ý tay cầm, còn laptop có
màn cảm ứng bị coi là điện thoại vĩnh viễn (giấu số phím hotbar, in bảng hướng dẫn kiểu chạm).

`core/inputmode.ts` (thuần, test được trong Node) trả lời **một** câu hỏi: thiết bị nào vừa được
dùng? Nút thì đổi ngay; cần gạt phải giữ 150 ms (cần mòn nghỉ lệch tâm không được lật cả HUD).
**Tay cầm ma** — cái bóng `connected: true, buttons: []` Chrome để lại sau khi rút — không gửi
tín hiệu nào nên không bao giờ thắng; trước đây nó đủ sức bật `pad-std`, mà `pad-std` thì ẩn
joystick lẫn tắt cụm nút chạm, tức bịt sạch đường vào. Khoá cứng được trong Cài đặt (Tự nhận /
Cảm ứng / Tay cầm / Phím + chuột), nhưng khoá vào thiết bị không có thật thì bị bỏ qua.

`body[data-input]` giờ mang **một** giá trị và là nguồn duy nhất cho CSS; `body.touch` tụt xuống
thành cờ *khả năng*. Chơi phím + chuột thì ẩn cần gạt và cụm nút hành động nhưng **giữ nút ☰** —
nó là đường vào menu bằng chuột. Hướng dẫn lần đầu có thêm bảng riêng cho tay cầm.

Kịch bản 123–126, mỗi cái cấy lại lỗi và thấy đúng nó đỏ: ngủ dậy là cả đàn lẫn người làm đều
làm việc ngay · ô đứng cạnh máng phải đứng được và phải gần nhất · đói thì ăn ở bước kế · và
bảng loại trừ chế độ (mỗi chế độ bật đúng một lớp giao diện). Trình duyệt thật ở 430×932 và
1000×700: bốn chuyển đổi chế độ, tay cầm ma không thắng, khoá cứng có hiệu lực.

### Đợt 10: camera bám lại nhân vật, và nút chính thành CHUYẾN của món đang cầm (core 1.36)

Cường chơi bản 1.35 và báo hai chuyện: **camera không đi theo nhân vật — ngay từ lúc mở game**,
và **nút ngữ cảnh hay đi lung tung**. Luật anh đặt, nguyên văn: *"đang chọn cái gì [ở hotbar]
có thể làm được ở khu vực nào thì phải di chuyển về khu vực đó để tiến hành làm, lặp lại chuyện
đó, không có tự ý thay đổi công cụ."*

**Camera.** Cả game có đúng một chỗ gọi `camera.follow()`, và Đợt 7 cho nó bám *con vật đang mở
bảng*. Nghe hợp lý — nhưng `cardAnimal` được đặt bởi **mỗi cú chạm-để-đi rơi trong 1,4 ô quanh
một con vật** (cách đi chính trên điện thoại, 24 con đi khắp sân), và không gì xoá nó khi nhân
vật đi bằng joystick. Nên camera theo con bò, nhân vật đi ra khỏi khung; mở menu rồi đóng thì
"hết" vì `modal` xoá `cardAnimal` — đó là lý do khó tái hiện. Giờ: **camera luôn bám nhân vật,
chấm hết**; chạm-để-đi là để đi, không mở bảng; mở bảng là việc của nút XEM và nút vai; thẻ
không vẽ ra được thì `cardAnimal` cũng bị xoá (bịt ca "khoá camera mà không có nút ×").

**Nút chính.** Bản Đợt 5 sửa `contextAction` (bán kính 6 ô, lọc dọn dẹp, xếp theo món) nhưng nó
bị che bởi `continueWork` đứng trước: bán kính 12, không lọc dọn dẹp, và `lastKind` **không bao
giờ được xoá khi đổi ô hotbar** — cày một nhát rồi đổi sang hạt, mọi cú bấm sau vẫn "làm tiếp
việc cày". Cộng thêm nhánh đi-tới-ô-ngắm hỏi `tileActionable` mù món, và nhánh giữ-nút cũng gọi
`continueWork`. Và không có chỗ nào chọn đích **theo khu**: 12 lô là 12 hình chữ nhật không gì
phân biệt — đứng giữa A1 và A2, ô "gần nhất" luân phiên hai lô.

Giờ nút chính là **một chuyến** (`src/game/run.ts`, thuần, test được trong Node):

| Món đang cầm | Việc | Khu tìm việc |
|---|---|---|
| Cuốc | cày, nhổ cây bệnh | từng lô ruộng |
| Hạt / bình tưới / thuốc | gieo / tưới (cạn thì múc rồi làm tiếp) / chữa | từng lô |
| Thức ăn | đổ máng / cho cá ăn | **chỉ những khu nhận món đó** (`pens[].feeds`) |
| Rìu / cuốc chim | chặt / đập | **chỉ trong Rừng** |
| Tay không | thu cây chín, thu sữa/trứng | từng lô, rồi từng chuồng |

* Bấm một lần: làm **hết việc của món đó**, khu đang dở làm cho gọn rồi mới sang khu kế (khu
  đầu = khu đang đứng trong nếu có việc, không thì khu gần nhất). Dừng khi hết việc / hết món /
  hết sức — có toast nói lý do — hoặc bấm lại, đổi ô hotbar, tự cầm lái, mở menu, đổi bản đồ.
* **Không bao giờ đổi ô hotbar.** `slot` ghi lúc bắt đầu và mọi câu hỏi đều hỏi `canUseAt(…,
  slot)`; hết hạt là ô đó trống và vẫn là ô đang chọn. Công tắc "Tự động làm" trong Tạm dừng (có
  đổi tay) là thứ khác, giữ nguyên.
* Nút ghi **DỪNG** (đỏ) trong lúc chạy; dải dưới hotbar ghi "Đang làm: CÀY · Lô A2".
* Gỡ hẳn `continueWork`, `AUTO_RADIUS`, nhánh giữ-nút, `lastKind`. Nhánh đi-tới-ô-ngắm chỉ còn
  khi ô đó thật sự có việc với món đang cầm hoặc có gì để tương tác.
* Kịch bản 119–122, mỗi cái cấy lại lỗi để chắc nó đỏ: món → việc → khu và `sel` không đổi;
  đứng trong A2 thì cày hết A2 dù A1 gần hơn, khu đang dở thắng khu gần hơn; chạy trọn chuyến
  gieo tới hết hạt (số ô gieo = số hạt, bình cạn → bước đầu là đi múc); rìu không bao giờ nhắm
  cây trang trí ngoài rừng. Trình duyệt thật ở 430×932 và 1000×700: đi tay 10 ô sau khi chạm
  cạnh bò → camera đi theo, nhân vật ở tâm; mở bảng bằng XEM rồi đi → vẫn theo nhân vật; cuốc ở
  A2 → 30 ô A2 rồi 30 ô A1, không một lần xen kẽ; cám → đổ hết rồi "Hết Cám tổng hợp — dừng."

### Đợt 9: hiệu năng, đo thật (core 1.35)

Đo trên máy này ở khổ 430×932 @2x, nông trại 24 con vật + 60 cây, 240 khung mỗi mẫu:

| Cảnh | Trước | Sau |
|---|---|---|
| Xuân, trưa | 6,9 ms/khung | 7,4 |
| **Đông, trưa** (`desat` 0,52) | **14,0** | **6,9** |
| **Đông, tối** (đèn) | **19,0** | **11,4** |
| Xuân, tự động BẬT | 7,7 | 7,5 |
| `autoJob` cầm cuốc (Node) | 1,04 ms | 0,80 |

* **Lớp bão hoà là thủ phạm lớn nhất.** Mùa thu/đông từng vẽ một `fillRect` với
  `globalCompositeOperation = "saturation"` phủ toàn canvas ở độ phân giải thiết bị, mỗi khung —
  blend không tách kênh, thứ chậm nhất Canvas2D có, 24 trong mỗi 48 ngày, và vô hình nếu chỉ thử
  vào xuân hạ. Giờ là `filter: saturate()` trên phần tử canvas (trình ghép GPU lo), còn lớp màu mùa
  là một `div` nằm ngoài tầm bộ lọc — nên sắc vàng mùa thu không bị rút theo cảnh, đúng cái lý do
  thứ tự "rút trước, phủ sau" ngày xưa phải giữ. Chỉ đụng DOM khi sang mùa.
* Đèn ban đêm: gradient dựng một lần cho mỗi (bán kính, cường độ) rồi vẽ qua `translate` — trước
  đây `createRadialGradient` + ba `addColorStop` cho mỗi đèn mỗi khung.
* `inZone` thôi `.filter()` 13 vùng ở mỗi lần gọi (cache theo loại × bản đồ, khoá WeakMap theo
  content nên OTA tự có cache mới). `autoJob` kẹp vành quét vào biên bản đồ — bỏ ~9.400 lần gọi
  rỗng cho mỗi loại việc. Kịch bản 117–118 khẳng định kết quả **y hệt** duyệt thô.
* TICK chạy bù nhiều bước (tab quay lại, cổng dịch chuyển) dùng chung MỘT túi A* cho các bước bù
  thay vì mỗi bước một túi: trước đây tới 16 lượt × 2.000 nút trong một khung hình. Lối chơi bình
  thường không đổi một ly (kịch bản 116).
* Khi menu mở, thôi ép layout mỗi khung: ghi nhớ tiêu điểm chỉ khi tiêu điểm hoặc chỗ cuộn đổi;
  thôi `querySelector` sáu lần một khung khi không có lớp phủ nào.
* Thứ CHƯA làm, nói thẳng: renderer vẫn cấp phát một object + một closure cho mỗi thứ vẽ mỗi khung
  (100–400 closure/khung); `catchUpEntities` vẫn chép sâu mỗi con vật mỗi khung; `growCropsIn` vẫn
  quét 1.776 ô mỗi khung. Cả ba đo được dưới 0,1 ms trên máy này — chưa đáng một lần tái cấu trúc.

### Đợt 8: chiều sâu nội dung (core 1.34 · content 1.40)

Rà soát ra ba lỗ hổng: 14 nấc tiến trình là ghi-rồi-bỏ (`stagesDone` không được một file UI nào
đọc, sáu toast vẫn rao "mở khoá" cây của một hệ thống đã xoá), nông sản chỉ có đúng một đầu ra
là quầy bán (58/61 cây, cả 12 sản phẩm chăn nuôi), và tiền hết ý nghĩa vì vòi tưới lẫn nhà kính
chế miễn phí được từ gỗ + đá.

* **Nấc có phần thưởng** (`reward: { money?, items? }`) và xem lại được ở **Nhật ký nông trại**
  (ô trong Tạm dừng, hoặc bấm chip mục tiêu). 18 nấc, xếp tăng dần, thêm nấc cho chăn nuôi
  (`gathered`), chế biến (`crafted`), thuê người (`hired`) và một nấc xa "Huyền thoại". Thưởng
  tràn balo thì vào kho.
* **Ăn để hồi sức**: mọi cây và trứng/sữa có `energy`; nút "Ăn" trong balo. Đầu ra thứ hai cho
  cả 61 cây mà không phải ép mỗi cây một công thức.
* **Tám công thức chế biến** một nguyên liệu → một món bán lãi 25–35%: phô mai, phô mai dê, cuộn
  len, cà phê rang, trà sấy, mứt dâu, chả cá, xúc xích. Nông sản làm thức ăn: gà/vịt ăn lúa, lúa
  mì, lúa mạch, đậu nành; bò/dê/cừu ăn ngô, khoai mì; cá ăn ngô.
* **Tiền có chỗ tiêu**: vòi tưới cần **ống nước** (120đ), nhà kính cần **tấm kính** (60đ) — hai
  vật tư chỉ mua; tab "Thức ăn" thành "Vật tư", bán luôn thuốc trừ sâu 35đ. Cừu 700đ → 520đ, lông
  mỗi 2 ngày 1–2 cuộn: hết là món hàng bẫy.
* HUD ghi **năm** từ năm thứ hai; tên người làm nằm trong `actors.workers.names`.
* Cheat "materials" chỉ cho vật liệu thô (30 loại × một chồng thì balo 28 ô đầy cứng).

### Đợt 1–5 (core 1.25–1.31)

| Bản | Nội dung |
|---|---|
| 1.25 | **Đợt 1** — hết mất công cụ chế tạo khi nạp save · đồng hồ vật nuôi chạy thật · con có chuồng thôi bị bốc qua rào mỗi đêm · `dEntity` chép sâu · migrate hỏng thì lùi về ván mới |
| 1.26 | Tay cầm: một nút, một thanh gợi ý dưới hotbar |
| 1.27 | Máng bốn mức theo món · rắc cám xuống hồ, cá bơi tới ăn · hết năng lượng thì lắc đầu |
| 1.28 | Nút ngữ cảnh đeo hình đồ đang cầm |
| 1.29 · content 1.38 | **Đợt 2** — `sellable()` một nguồn cho cả 5 đường bán · cờ `materials[].sell` · quầy chia hai mục |
| 1.30 · content 1.39 | **Đợt 4** — người làm đi được tới lô xa (bán kính quét + dây buộc cả hai đầu) · thôi bôi đen ô tốt · kho đầy thì đứng chờ · chó tuần bắt được chuột đầu kia bản đồ |
| 1.31 | **Đợt 5** — nút chính quyết định bằng *món đang cầm × bán kính 6 ô quanh chân* rồi tự đi tới làm, không quét cả bản đồ · nút phụ chỉ tra cứu · **gỡ hẳn** vành "dè chừng" (xem ghi chú ở mục core 1.23 bên dưới) · cụm chạm còn đúng hai nút 80/64px · pad: A hành động, B tra cứu, X quay lại |

### Sơ đồ nút tay cầm: một nút một việc, một việc một nút (core 1.24)

Cái người chơi bắt lỗi không phải một nút sai, mà là **sơ đồ tự mâu thuẫn**. Ba chỗ chồng chéo,
và cả ba chỉ nhìn ra khi đọc kỹ mười dòng `if` rải rác:

* **RT làm đúng việc của A** — sơ đồ nút in thẳng ra: *"Dùng (thay cho A)"*. Một việc, hai nút.
* **LT vừa là CHẠY vừa là phím phụ** để vai nhảy năm ô. Một nút, hai việc.
* **Đẩy cần gạt hết cỡ cũng là chạy**, nên chạy có **hai** cách điều khiển; còn hotbar thì có
  **ba** (vai, cò + vai, cần phải).

Trong khi đó việc **ngắm** — thứ chuột và ngón tay đều làm được — thì tay cầm không có đường
nào, và **mức phóng** chỉ mở được trong Cài đặt.

Nay có `PAD_MAP`: **một bảng, một nguồn**. `input.ts` đọc nó để gán nút, `menus.ts` dựng sơ đồ
nút **từ chính nó** — nên màn hình không bao giờ hứa một nút mà máy không làm, đúng cái lỗi
"Chạy" từng chết âm thầm sáu commit. Kịch bản 81 kiểm thẳng trên bảng: không nút nào hai việc,
không việc nào hai nút, và **không nút mặt/vai/cò/cần nào bỏ trống**.

| | |
|---|---|
| Cần trái / D-pad | Đi |
| **Cần phải** | **Rê ô ngắm** — cày/gieo/thu ô chéo mà không phải xoay người |
| A · B | Dùng · Tương tác |
| X · Y | Tự động làm · Balo |
| LB · RB | Ô hotbar trước · sau |
| LT | Giữ để chạy |
| **RT** | **Đổi mức phóng** gần → vừa → xa |
| View · Menu | Bản đồ nhỏ · Menu tạm dừng |
| LS · RS | Chế độ xây dựng · Mở lại sơ đồ nút |

Và **hai dải chỉ dẫn không được cùng hiện**. Ở chế độ tay cầm có dải góc (`.padctx`, nói việc
của nút A ngoài ruộng) và thanh giữa (`#padbar`, nói việc của nút A trong lớp phủ đang mở). Khi
mở menu thì cả hai cùng nói về nút A nhưng nói hai thứ khác nhau, và người chơi phải tự đoán
cái nào đang thật. Trước đây dải góc chỉ **mờ đi** (opacity .45) — mờ vẫn là đang nói. Nay nó
tắt hẳn.

### Con vật DÈ CHỪNG, và hai cái nút bám theo quanh mình (core 1.23)

> **Đã gỡ ở core 1.31.** Cường nói ba lần rằng anh không muốn con vật đứng lại khi anh tới
> gần, và đo lại thì lo ngại mà vành này sinh ra để chữa không đứng vững: trễ một thao tác
> 0,21 s, con nhanh nhất nhích 0,39 ô, tầm với 1,4 ô. Đoạn dưới giữ nguyên làm sử liệu thiết
> kế — vì sao nó từng có, và vì sao bỏ được.

**Vành dè chừng.** Luật "tới gần thì đứng lại" vẫn chạy, nhưng nó là một cái **công tắc** ở
đúng hai ô: ngoài hai ô con vật phóng đúng tốc độ, trong hai ô nó đứng phắt lại. Người chơi đi
tới thấy nó nhơn nhơn đi lại cho tới lúc bụp một cái đứng im — cảm giác đọc ra đúng là "nó
chẳng để ý gì tới mình". Con vật thật thì **ngần ngừ trước đã**. Nên có vành thứ hai
(`WARY_TILES = 4.5`): trong vành đó tốc độ giảm dần từ 100% xuống 25%, rồi tới hai ô mới dừng
hẳn. Hệ số nhân vào **bước đi**, không vào `speed` của content — content nói con vật đi nhanh
bao nhiêu, đây là chuyện nó đang dè chừng; trộn vào nhau thì mỗi lần chỉnh cân bằng lại phải
nhớ trừ hao cho cái vành này.

**Nút phụ quét cả ô CHÉO.** Bốn ô kề thẳng bỏ sót đúng những ca hay gặp nhất: đứng chéo góc
quầy thu mua, đứng cách cái giếng một ô vì có hòn đá chen giữa — nút tắt ngóm mà không nói vì
sao, và người chơi phải xê dịch mò cho tới lúc nó sáng lại. Nay quét cả hình vuông bán kính 2
và lấy vật thể **gần nhất**, không phải cái đầu tiên trong một mảng cố định.

**Nút chính bám theo quanh chân** (`contextAction`). Thứ tự: con vật trong tầm đang tới lứa →
việc của cả khu (đổ máng, thu cả đàn) → việc làm được với thứ đang cầm ở ô gần nhất quanh chân.
Ranh giới quan trọng nhất nằm ở chỗ **"ô đang ngắm có gì"**, không ở chỗ "có giải thích được
không":

* Ô có **vật** — cái cây, luống rau, công trình — hoặc đang vác đồ: người chơi *chủ ý* chỉ vào
  nó, và "Cần rìu" / "Lùi ra rồi đặt" đúng là câu họ đang hỏi. Nút nhường lời.
* Ô **đất trống**: đứng trên ngõ cầm cuốc, ngắm vào chính con ngõ dưới chân, mà ruộng ngay bên
  cạnh — "Ngoài khu ruộng" đúng nhưng vô ích, còn "CÀY" thì làm được việc.

Nhãn vẫn không nói dối: nó hứa cày, và ô nó dắt tới đúng là ô cày được. (Từ Đợt 21 cả nhãn
lẫn cú bấm đi qua `pressPlan` — xem mục Đợt 21; câu "một nguồn" ở đây từng đúng rồi trôi mất khi
`main.ts` mọc thêm bộ luật riêng.)

### Chở cá tới tận ao, và BẢNG KHU (core 1.22)

**Cá phải được chở TỚI AO.** Xe chở cá đậu ở bãi giao nhận trước cửa kho rồi con cá "hiện ra"
dưới ao ở đầu kia nông trại — đúng cú dịch chuyển tức thời mà cả hệ thống xe cộ sinh ra để
tránh. Nay `pondDock()` tìm ô mặt đường sát bờ ao (phải có mặt nước trong tầm ba ô, nếu không
thì đứng đó thả xuống đâu), xe chạy tới đó, và hàng xuống ở chỗ nước gần **chiếc xe** chứ
không phải gần điểm giao.

**Và những con cá đang nằm trên bờ.** Quy hoạch lại bản đồ là cái ao dời đi nửa nông trại, mà
phép gỡ kẹt lúc nạp save chỉ dò quanh vài ô — quanh chỗ con cá thì ba mươi ô nữa cũng chưa có
giọt nước nào. Nó nằm lại đúng chỗ cũ, và mỗi lần mở game lại thấy đàn cá phơi trên cỏ. Nay khi
dò quanh bó tay thì con vật được **đưa về KHU của chính nó** — con cá về ao, con bò về chuồng.
Khu là câu trả lời đúng chứ không phải câu trả lời tiện: dời nó tới ô trống gần nhất trên bản
đồ thì nó thoát kẹt nhưng lại đứng ở một chỗ chẳng liên quan gì tới nó.

**BẢNG KHU.** Cả hai nút trước đây chỉ biết **đúng một ô**. Đứng giữa chuồng gà, cầm bó rơm,
ngắm vào một ô bê tông trống thì nút chính ghi "DÙNG" và bấm không ra gì — dù cái máng chỉ cách
ba ô. Và muốn biết chuồng có việc gì phải làm thì phải đi tới bấm vào **từng con một**: ba mươi
con gà là ba mươi lần bấm chỉ để biết có quả trứng nào chưa.

* **Nút chính** (`penAction`) nói việc của **chỗ đang đứng**, không chỉ việc của một ô: cầm
  thức ăn khu nhận và máng còn chỗ → *ĐỔ MÁNG*, dắt tới đúng cái máng; có con tới lứa → *THU*,
  dắt tới con gần nhất. Xếp **sau** mọi việc của ô đang ngắm — nếu không nó cướp mất việc cụ
  thể hơn.
* **Nút phụ** mở bảng khu: bao nhiêu con, mấy con đói, mấy con tới lứa, máng còn mấy phần, gộp
  theo **loài** (người chơi đếm theo loài, không đếm theo con). Kèm hai việc chiếm gần hết thời
  gian ở chuồng: *Đổ máng* và *Thu tất cả*. Xếp sau con vật và sau vật thể — cái máng, cái
  giếng là thứ cụ thể hơn.
* Cố ý **không** có nút bán/mổ thịt trong bảng: đó là việc không quay lui được, và một nút
  không quay lui được nằm cạnh hai nút bấm hàng ngày là một cái bẫy. Bán thịt vẫn ở bảng của
  **từng con**, nơi người chơi đã nhìn thẳng vào con vật đó.

Hai action mới `PEN_GATHER` / `PEN_POUR` đều đòi người chơi **đang đứng ở chỗ cái khu**. Bảng
chỉ mở được khi đứng đó nên trong game điều kiện luôn đúng; kiểm trong reducer là để nó không
nhận một lệnh "thu trứng chuồng gà" phát từ đầu kia nông trại — reducer là chỗ duy nhất giữ
luật, UI chỉ là một cách gọi nó.

### Vẽ lại toàn bộ: cây trồng, vật nuôi, địa hình, vật tư (core 1.21)

Ba luật, và cả ba đều là chuyện **khối** chứ không phải chuyện thêm chi tiết. Ở 16px, thêm
chi tiết chỉ làm hình bẩn hơn; thứ mắt đọc được là hình dạng và ba tông sáng-giữa-tối.

**1. Khối, không phải mảng phẳng.** Con vật trước kia là hình chữ nhật + hình vuông dán vào
cạnh; cây trồng là `disc` + vệt thẳng; tán cây là ba đĩa tròn rắc pixel ngẫu nhiên. Nay tất cả
dựng bằng elip (`Surface.ell`) và một hàm dựng khối chung: vành tối ôm mép dưới, thân giữa,
vệt nắng chếch trên-trái. Cùng một khối lượng pixel, khác hẳn ở chỗ mắt đọc ra hình cầu chứ
không đọc ra hình tròn tô màu.

**2. Đường ngăn, không phải chồng lấn.** Đây là chỗ khó nhất và là chỗ tôi sai vài lần liền.
Vẽ mười cái lá chồng lên nhau ở cỡ 16px thì chúng gộp thành một mảng đặc — cây rau thơm ra một
cục tím, bụi lúa ra một cục xanh. Hai công cụ giải nó:

* `la()` vẽ lá to hình **giọt nước** (phình giữa, thon ngọn) với mép tối ở **cả hai** bên, và
  bề dày mép tối tính **theo bề ngang lá** chứ không phải một hằng số — lấy hằng số thì lá
  mảnh hoá ra tối hết.
* `soi()` vẽ lá **mảnh** bằng đúng hai pixel: một tối một sáng. Hai sợi kề nhau vì thế luôn có
  đường ngăn, dù chen sát tới đâu. Hành, lúa, cà rốt, cỏ đều dùng nó.

Cùng lý do đó, tán lá dựng bằng **cụm** vẽ lần lượt (vành tối rồi ruột sáng, từng cụm một), chứ
không phải vẽ hết vành tối rồi mới vẽ hết ruột sáng — vẽ theo lớp thì lớp sáng lấp mất mọi
đường ngăn và năm cụm gộp lại thành đúng một khối lồi.

**3. Viền theo màu vật, không phải màu đen.** Viền đen tuyền biến mọi thứ thành hình dán. Cây
cối viền bằng chính màu lá tối đi hai nấc. Và con vật có **hai** tông tối, hai vai khác nhau:
`vien` là mặt tối của chính màu thân (con bò trắng có mặt tối màu xám), còn `bodyDark` là màu
**vật liệu khác** — đốm, tai, đuôi, móng. Trộn chúng làm một là lỗi của bản trước: con bò viền
đen kịt đọc ra một cái sọ.

Ba trường mới trong `AnimalArt`, mỗi trường là một nét đọc được từ xa, và tất cả nằm trong
content chứ không phải `switch (id)`: `snout` (mõm — lợn tròn, chó nhọn), `crest` (mào + yếm gà;
tắt thì thành mỏ bẹt vịt), `tailUp` (đuôi dựng của chó).

**Và một lỗi dùng được, không phải lỗi thẩm mỹ.** `makeMaterialIcon` có sáu hình vẽ tay và một
nhánh `else` gom tất cả phần còn lại — nghĩa là **mười bốn món** (sữa, sữa dê, trứng gà, trứng
vịt, len, thuốc, tám loại thịt) dùng chung đúng một hình "bó cỏ". Trong túi đồ, trong kho, ở
quầy bán, chúng là mười bốn ô giống hệt nhau và người chơi phải đọc chữ mới biết mình cầm gì.
Nay mỗi món có dáng riêng — chai, quả trứng, cuộn len, miếng thịt có vân mỡ và khúc xương,
miếng phi lê cá — dáng nói "đây là cái gì" trước, màu mới nói "của con nào".

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

**Thêm cây** — thêm một object vào `src/content/crops.json`, chạy
`npm run content:build`. Xong. Không sửa một dòng code nào.

**Thêm công trình** — thêm vào `buildings.json`. Nếu chỉ dùng các hiệu ứng core đã
biết (`waterRadius`, `autoWet`, `speedMul`) thì cũng không cần sửa code;
`atlas.ts` sẽ vẽ hộp mặc định cho id lạ. Muốn hình riêng thì thêm một `case` trong
`makeBuilding()`. Hiệu ứng **mới** thì phải sửa core → đó là làn chậm.

**Sửa bản đồ** — sửa `src/content/maps/farm.ascii` bằng text editor, mỗi ký tự một ô
(chú giải trong `tiles.json`), rồi `npm run content:build`.

**Đổi cân bằng** — `balance.json`. Toàn bộ giá, số ngày, năng lượng, nhịp thời gian.

`npm run content:build` chạy đúng bộ schema mà game dùng lúc chạy, kèm kiểm tham
chiếu chéo (mốc đòi cây không tồn tại, con vật ăn thứ không có trên kệ…),
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

## PWA: cài về máy, chơi offline, và cập nhật

Cài từ trình duyệt (Chrome: *Cài ứng dụng*; iOS Safari: *Thêm vào màn hình chính*). Sau đó
game chạy toàn màn hình, không thanh địa chỉ, và **chơi được khi mất mạng**.

**Precache bằng Workbox** (`vite-plugin-pwa`). Bản service worker viết tay trước đây cache
DẦN theo lúc dùng, nên cài game vào màn hình chính rồi mất mạng *ngay* là mở ra trắng: HTML
có trong cache nhưng bundle JS thì chưa. Danh sách file có hash trong tên nên không thể liệt
kê bằng tay — đó đúng là việc của Workbox.

**Content pack OTA KHÔNG precache**, chỉ `NetworkFirst` với timeout 4 giây. Nó có vòng đời
riêng (xem *Cập nhật OTA*), và bản đóng kèm trong bundle đã bảo chứng offline rồi — cache nó
chỉ tạo ra một cách để người chơi kẹt ở pack cũ.

**Cập nhật KHÔNG tự động chiếm quyền.** `registerType: "prompt"`: có bản mới thì hiện một
thanh nhỏ *"Có bản mới — Tải lại"*, bấm mới tải. Người chơi đang giữa một ngày trong game mà
trang tự làm mới thì mất phần chưa lưu. Bản viết tay trước đây gọi `skipWaiting()` ngay lúc
cài, nên bản mới lặng lẽ thay bản cũ — và ai mở PWA suốt ngày thì ở lại bản cũ vô thời hạn vì
trang không bao giờ được tải lại. Nay còn chủ động hỏi lại mỗi 30 phút, đúng vì lý do đó.

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

Phủ 69 kịch bản, gồm những thứ dễ hỏng nhất: cây không lớn nếu quên tưới · đặt
đồ xuống không nhốt được người chơi · save round-trip khớp hoàn toàn · cùng seed cho ra state y
hệt · **load save cũ với content đã gỡ cây thì không crash** · `reduce` không mutate
state cũ · **nhãn nút ngữ cảnh đổi đúng CÀY → GIEO → TƯỚI → THU** · parse cài đặt hỏng vẫn ra hợp lệ ·
**thao tác có hiệu lực trễ đúng mốc chạm đất, nhát dở bị bỏ khi ngủ** · SWAP balo gộp stack và giữ
hai ô công cụ · chuyến của món đang cầm làm gọn từng lô, dừng khi hết hạt, không đổi ô hotbar.

Lớp UI soát bằng Chromium headless ở bốn khổ máy (checklist trong `docs/MOBILE-UX.md`).

`npm run test:ota` kiểm phần đáng sợ của OTA: pack hỏng/sai schema/sai `requiresCore`
đều bị **từ chối**, còn sửa content hợp lệ thì được nhận.

Trong bản dev còn có cầu `window.__PF` (`store`, `content`, `camera`, `renderer`, `menus`,
`settings()`, `setSetting()`, `tutorial`, `step(dt, times)`) để
script hoá việc kiểm thử trên trình duyệt — cần thiết vì `requestAnimationFrame`
không chạy khi trang bị ẩn.

---

## Chế độ xây dựng

Công trình KHÔNG đặt được bằng nút DÙNG. Cả hai — vòi tưới và sàn nhà kính — đi
qua `src/ui/buildmode.ts`. Hàng rào KHÔNG: nó là địa hình dựng sẵn của các khu
chuồng (`buildable: false`).

Vì sao: đặt từng ô là thao tác của việc SỬA, còn kéo một tuyến đường ra kho hay
kéo một con đường ra kho là việc QUY HOẠCH — nghĩ theo đoạn, không theo ô. Trộn
hai đường vào một nút thì ra địa hình lởm chởm: mỗi ô là một lần ước lượng bằng
mắt, và hai mươi lần ước lượng thì không lần nào giống nhau.

Ba điều làm chế độ này khác:

· **Thời gian đứng yên** — vòng lặp không dispatch TICK. Nhân vật vẫn đi lại
  được để ngắm chỗ; chỉ đồng hồ là dừng.
· **Kéo thành đoạn** — `input.setDrag()` mở luồng ý định `drag`/`dragEnd`. Phải
  bật thủ công: đường bấm-để-đi đã chỉnh rất kỹ để không giật, và đổ thêm một
  luồng vào mỗi khung hình là cách nhanh nhất làm hỏng lại nó.
· **Vẽ bao nhiêu tính tiền bấy nhiêu** — `buildLine()` dùng hàng có sẵn trong
  balo trước, hết thì trừ tiền tại chỗ theo `def.price`. Bán theo chồng ở cửa
  hàng nghĩa là bắt người chơi đoán "cần bao nhiêu ô đường", mà đoán sai con số đó
  chính là lý do người ta ngại vẽ dài. Tab "Công trình" trong cửa hàng vì thế
  chỉ còn là BẢNG GIÁ.

`canUseAt` trả `null` cho công trình (chứ không trả `"build"` rồi để `useAt`
lặng lẽ bỏ qua): hai hàm đó phải luôn nói cùng một câu, nếu không thì nút báo
làm được mà bấm không có gì xảy ra.

---

## Vật nuôi tự đi tìm cỏ

`src/game/graze.ts`. Trước đây bỏ đói chỉ là một cái đồng hồ đếm ngược: con bò
đứng giữa bãi cỏ dày vẫn chết đói sau bốn ngày, còn gà vịt thì mỗi đêm tự no
lại một nửa từ hư không kể cả khi cả nông trại đã lát nhựa. Cả hai đều là con
số thay cho hành vi.

Giờ cỏ trên bản đồ là thức ăn thật. Con vật đói nhắm tới bụi cỏ gần nhất, đi
tới, ăn — và bụi cỏ BIẾN MẤT. Một đàn đông sẽ gặm trụi khu quanh chuồng, nên
người chơi phải chừa cỏ hoặc phải cắt cỏ tích rơm. Hết cỏ thì vẫn chết đói theo
đúng `starveDays` cũ, chỉ là giờ nó có nguyên nhân nhìn thấy được.

Ai ăn được gì do CONTENT nói: loài có `feed` tìm bụi cỏ nào RỤNG RA đúng thứ
đó; loài `feed: null` (gà, vịt) mổ sâu trên nền cỏ thường nên gần như không bao
giờ chết đói. `grazeNight()` chạy lúc sang ngày vì người chơi ngủ là cả đêm trôi
qua trong một action — không có khung hình nào để con vật đi tới bãi cỏ.

---

## Trang tài liệu — một cái WIKI (`/`)

Cường, Đợt 25: *"loại bỏ các trang tĩnh khác, chỉ để lại [game] và docs; trình
bày trang tài liệu này giống như wiki — lối chơi, các vật, chi tiết vật. Tác giả
/ story: TRẦN CƯỜNG"*.

Bốn trang giới thiệu cũ đã gỡ hẳn: chúng nói VỀ game cho người chưa chơi, còn
wiki nói về THỨ TRONG game cho người đang chơi — hai thể loại không trộn được.
Nay còn Trang chính, Lối chơi, Cây trồng, Vật nuôi, Vật phẩm (kèm **một trang
chi tiết cho mỗi món**), Hành động, Tác giả và Quyền riêng tư — tất cả
**sinh ra từ chính content** bằng `scripts/build-site.mjs` (chạy trong
`npm run build`, trước `vite build` vì vite phải thấy file HTML mới quét được).

Hai quyết định đáng nhớ:

**Số liệu sinh lúc build, hình vẽ lúc chạy.** Viết tay 61 thẻ cây nghĩa là mỗi
lần chỉnh giá phải sửa hai chỗ, và chỉ cần quên một lần là trang tài liệu nói
sai — tệ hơn hẳn so với không có trang tài liệu. Nên số liệu đọc thẳng từ
`crops.json`/`actors.json`. Còn hình thì `src/site/sprites.ts` gọi đúng
`buildAtlas()` mà game gọi, nên không có file ảnh nào để cũ đi. Tắt JS thì trang
vẫn đọc được trọn vẹn — chỉ mất phần minh hoạ.

**Cắt viền trong suốt trước khi phóng to.** Sprite cây cao 24px nhưng cây xà
lách chỉ chiếm 9px dưới đáy (phần trên chừa cho cây cao như ngô). Vẽ nguyên ô là
một cây bé xíu nằm dưới đáy một khung rỗng. `trim()` đo khung nhỏ nhất còn chứa
hết phần có vẽ, nhớ lại bằng `WeakMap`, rồi phóng theo hệ số NGUYÊN.

Chữ trên các trang này cố ý không có từ kỹ thuật nào: không "reducer", không
"tick", không "state". "Cây chỉ lớn khi bạn ngủ" là câu người chơi cần, còn
`newday.ts` là chuyện của README này.

---

## Chưa có (cố ý)

NPC & quan hệ, hầm mỏ & chiến đấu, chế biến nông sản (sữa → phô mai), nhạc nền,
nhiều ngôn ngữ. Mùa, thời tiết, chăn nuôi, người làm thuê, xe cộ và nhiều bản đồ
thì **đã có** — xem các mục tương ứng ở trên.

### Lộ trình mở rộng đề xuất

1. **Chế biến** — máy làm phô mai, lò sấy. Là công trình `kind: "object"` có kho
   riêng; tái dùng nguyên vòng "sang ngày mới".
2. **Nhà kính thật** (công trình nhiều ô) — cần core hỗ trợ công trình chiếm
   nhiều ô, thứ mà "nhóm khối" của hàng rào/kho đã dọn sẵn một nửa đường.
3. **Nhiều ngôn ngữ** — `strings.json` đã tách sẵn theo `lang`; thêm ngôn ngữ là
   thêm một file vào manifest, không đụng code.
4. **Tiled editor** — định dạng map đã là JSON `{w,h,rows}`, viết một bộ chuyển
   từ Tiled sang là dùng được editor đồ hoạ.
5. **Tileset PNG** — thay ruột `atlas.ts`, không đụng file nào khác. Lưu ý: trang
   thư viện cũng đọc atlas, nên đổi ruột là đổi luôn hình trên trang tài liệu —
   đúng ý đồ.

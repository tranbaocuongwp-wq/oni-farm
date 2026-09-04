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
  site/sprites.ts   đổ sprite của GAME vào trang tài liệu (một bản sự thật)
  index.html + tinh-nang/ + huong-dan/ + cach-hoat-dong/ + tai-ve/ + privacy/
  thu-vien/{,cay-trong,vat-nuoi,hanh-dong}/   ⚙️ SINH RA — scripts/build-site.mjs
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

`F2` bật/tắt bảng gỡ lỗi — một **bảng NỔI ở góc trên phải, không chặn game**. 13 lệnh chia ba
nhóm: tài nguyên (tiền, năng lượng, nước, vật liệu, mở khoá) · thời gian (sang ngày, đổi thời
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

Nó dùng **chính hàm** `nearestTarget` mà chế độ giữ-nút-DÙNG đang dùng, chỉ khác hai tham số
(`radius`, `requireReach`). Cố ý viết một lần: sau này AI người làm thuê cũng gọi đúng hàm
đó, nếu tách hai đường thì thứ tự ưu tiên của người chơi và của người làm sẽ trôi khỏi nhau.

Tự tắt khi: bạn tự cầm lái, quanh đây hết việc, hoặc **4 giây không có tiến triển nào**. Phép
đo cuối cùng là thứ quan trọng: thao tác ở đây có hiệu lực TRỄ (`USE` đặt `busy` rồi mới kiểm
năng lượng lúc chạm đất), nên ngay sau khi ra lệnh thì không cách nào biết nhát này ăn hay
trượt. Đếm bộ đếm thống kê thì đúng với mọi lý do hỏng cùng lúc — hết năng lượng, túi đầy,
hết hạt, kẹt đường.

### Hạ tầng: đường nhựa, hàng rào, kho

**Đường nhựa** là công trình sàn (`build:road`, chế từ đá), không phải nền — cố ý: `mergeGrid`
dựng lại NỀN từ bản đồ mỗi lần cập nhật content, nên đường ghi vào nền sẽ bị xoá sạch sau một
lần đẩy OTA, còn `Tile.b` thì được giữ. Nền `asphalt` vẫn có để người thiết kế bản đồ vẽ sẵn
đường trục.

Đường làm hai việc: đi trên đó nhanh hơn `speedMul` lần, **và A\* tự vòng qua đường** — vì
chi phí mỗi bước được CHIA cho `speedMul`. Không có luật "ưu tiên đường" riêng nào; thêm một
luật như thế sẽ đá nhau với heuristic. Kèm theo một ràng buộc bắt buộc: heuristic cũng phải
chia cho `speedMul` lớn nhất trong content, nếu không nó ước lượng THỪA và A\* âm thầm mất
tính tối ưu — vẫn ra đường hợp lệ, chỉ là không phải đường ngắn nhất.

**Hàng rào** (`build:fence`, chế từ gỗ) tự nối hình theo hàng xóm — 16 biến thể bitmask dựng
sẵn một lần, sinh từ tham số màu trong content nên thêm kiểu rào mới không cần code. Nó nằm ở
lớp thực thể có `base` chứ không phải lớp nền, vì hàng rào phải che được nhân vật đi phía sau.

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

Mua xong con vật được **giao tới điểm giao CỐ ĐỊNH** cạnh quầy bán, cuối con đường nhựa —
không hiện ra dưới chân người chơi.

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
trả sau thì mốc mở khoá theo `money` sẽ tính bằng số tiền chưa trừ lương.

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

## Chế độ xây dựng

Công trình KHÔNG đặt được bằng nút DÙNG. Tất cả — vòi tưới, nhà kính, pin mặt
trời, drone, đường nhựa, hàng rào — đi qua `src/ui/buildmode.ts`.

Vì sao: đặt từng ô là thao tác của việc SỬA, còn dựng hàng rào quanh chuồng hay
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
  hàng nghĩa là bắt người chơi đoán "cần bao nhiêu ô rào", mà đoán sai con số đó
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

## Trang tài liệu (`/thu-vien/`)

Bốn trang tra cứu — cây trồng, vật nuôi, hành động, và "cách game vận hành" —
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

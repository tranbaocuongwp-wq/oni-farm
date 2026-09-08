# Bộ nhận diện

Logo, màu, chữ, và cách site được dựng. Đây là **hợp đồng**: đổi thứ ở đây là
đổi mặt của cả sản phẩm, nên đổi thì đổi ở một chỗ.

Đọc kèm: [`MOBILE-UX.md`](MOBILE-UX.md) (lớp chạm và đồ hoạ trong game) ·
[`KIEN-TRUC.md`](KIEN-TRUC.md) (mã chia tầng) ·
[`LOI-CHOI.md`](LOI-CHOI.md) (luật chơi mà trang Luật chơi kể lại).

---

## 1. Logo — một file, dùng ở mọi nơi

**Cái cây.** Trước đó là ngôi nhà, và ngôi nhà sai ở hai điểm: nó đọc ra là
"bất động sản" hơn là "nông trại", và ở 16px trên tab trình duyệt thì mái, tường,
cửa sổ, luống đất dồn lại thành một vệt xám không ra hình gì. Cây chỉ có hai
khối — tán và thân — nên nó vẫn là cái cây ở mọi cỡ.

Nguồn: **`scripts/make-icons.mjs`**. Từ Đợt 26 hình dựng ở lưới **32×32** và
dựng bằng ĐÚNG CÁCH GAME DỰNG CÂY — tán là năm khối tròn chồng nhau, viền tính
tự động từ pixel đặc. Trước đó là một lưới 16×16 gõ tay: bốn lần ít chi tiết hơn
game, nên trên màn hình chính điện thoại (192px) icon trông thô hơn hẳn thứ nó
dẫn vào. Không có file ảnh
nào nằm sẵn trong repo; `npm run icons` dựng lại toàn bộ:

| Tệp | Dùng ở đâu |
|---|---|
| `favicon.svg` | tab trình duyệt · dấu cây trên nav · nét ở mọi cỡ |
| `favicon-32.png` | dự phòng cho trình duyệt không đọc favicon SVG |
| `icon-180.png` | `apple-touch-icon` — đúng cỡ Apple khuyến nghị |
| `icon-192.png`, `icon-512.png` | icon PWA (`manifest.webmanifest`) |
| `icon-source.png` | 1024px, nguồn dự phòng khi cần cỡ khác |

SVG dựng từ **chính** lưới sinh ra PNG (gộp pixel cùng màu liền nhau thành một
`<rect>`), nên **không có bản sao nào để trôi khỏi nhau**. Sửa lưới là cả bộ đổi
theo, kể cả dấu cây trên nav — nav dùng thẳng `/favicon.svg`.

### Ba điều kiện của hình logo

* **Maskable.** Android cắt icon theo hình tuỳ máy (tròn, vuông bo, giọt nước),
  chỉ đảm bảo giữ vòng tròn giữa. Nên nền **phủ kín** và cây nằm gọn trong
  **24/32 ô giữa** — cắt kiểu nào cũng không xén mất ngọn hay gốc.
* **Đọc được ở 16px.** Ba mức đậm nhạt rõ ràng (tán sáng · tán tối · viền), không
  dựa vào chi tiết nhỏ hơn một pixel lưới.
* **Mang màu thương hiệu.** Hai quả `--gold` — đúng màu vàng của HUD trong game
  và của chữ ONI trên web.

> Bản vẽ đầu tán đối xứng và hai quả cân nhau: nó đọc ra thành một **khuôn mặt**.
> Bản hiện tại đổ bóng theo **một** hướng sáng và đặt hai quả lệch nhau.

---

## 2. Màu — GAME một bộ, TRANG TÀI LIỆU một bộ

Đây là chỗ đổi lớn nhất ở Đợt 26, và nó bắt đầu từ một câu của Cường: *"tại sao
không phải trình bày giống như một trang web thông thường thôi, thân thiện với
mọi thiết bị, mà cứ làm cho nó màu mè lên làm chi"*.

Câu ấy đúng. Trước đó site khoác nguyên bộ nhận diện của game: nền nâu tối, khung
gỗ, chữ vàng, nút nổi bám đáy màn hình. **Trong game thì bộ ấy đúng** — nó là một
phần của thế giới đang chơi, và người chơi đang ở trong thế giới đó. **Trên trang
tra cứu thì nó chỉ làm chữ khó đọc hơn và trang nặng hơn**, mà không nói thêm
được điều gì: người vào đây để tra một con số, không để ngắm.

Nên hai bộ tách hẳn nhau:

| | Game (`src/style.css`) | Trang tài liệu (`src/site/site.css`) |
|---|---|---|
| Nền | nâu tối, khung gỗ | trắng (`#fff`), xám nhạt cho hộp |
| Chữ | kem trên nâu | đen trên trắng, 16px cố định |
| Nhấn | vàng `--gold`, xanh `--green` | liên kết xanh cổ điển, gạch chân |
| Viền | hai pixel, có bóng đổ | một pixel `#c8ccd1`, không bóng |
| Nút | nổi, có bóng, bám đáy màn | liên kết thường trong dòng |

Bộ token của site còn đúng **ba vai**, và cả ba đảo được sang nền tối theo cài
đặt máy (`prefers-color-scheme`) mà **không** đổi một khoảng cách nào:

| Token | Vai |
|---|---|
| `--chu` / `--chu-nhat` | chữ chính / chữ phụ |
| `--nen` → `--nen-3` | ba bậc nền, nhạt dần ra ngoài |
| `--xanh` / `--do` | số dương / số âm trong bảng |

Toàn bộ CSS site nay hơn 300 dòng, thay cho 970 dòng cũ.

---

## 3. Chữ — cố định, không co giãn

```
thân bài  16px / 1.6     KHÔNG clamp
h1        30px           26px dưới 760px
h2        22px
h3        17px
chú thích 14px
bảng      15px
```

**Vì sao thôi dùng `clamp()`.** Cỡ chữ co theo bề ngang màn hình nghe thì hay,
nhưng trên điện thoại nó cho ra chữ 15px — và dưới 16px thì Safari trên iOS
**tự phóng to cả trang** khi chạm vào ô nhập, còn người mắt kém thì phải chụm
ngón để đọc. 16px cố định là cỡ mà mọi trình duyệt coi là "chữ thường"; nó không
đẹp hơn, nó chỉ đọc được ở mọi máy mà không phải làm gì thêm.

Thêm bậc thứ năm là mở đường cho "cỡ nào cũng được", và trang sẽ trôi thành mỗi
mục một cỡ. Bốn bậc đủ cho mọi trang hiện có.

Font là **sans hệ thống** (`system-ui`) — tiếng Việt có nhiều dấu chồng, và font
hệ thống là font được máy đó dựng chữ Việt tốt nhất. Không tải font ngoài: một
trang chơi được offline thì không nên chờ mạng để hiện chữ.

**Khoảng cách** là bội của 4 (`--k1` … `--k7`), để mọi thứ rơi đúng một lưới.

---

## 3b. Hình minh hoạ và liên kết nội bộ

Cường: *"cái nào sử dụng được hình minh hoạ, hoặc là link nội bộ trong bài viết,
thì phải gắn vào hết — ví dụ nói về cỏ thì phải có cái hình kế bên"*.

Luật: **mọi tên của một thứ trong game đều đi qua `nhan(key)`** — hàm này trả về
sprite + tên + liên kết tới trang chi tiết của chính nó. Một hàm, nên không có
chỗ nào để quên, và thêm một trang chi tiết mới là mọi chỗ nhắc tên tự có liên
kết.

Bảng khoá → trang:

| Khoá sprite | Trang |
|---|---|
| `crop:<id>` | `/cay-trong/<id>/` |
| `animal:<id>` | `/vat-nuoi/<id>/` |
| `item:<id>` | `/vat-pham/vp-<id>/` |
| `tool:<id>` | `/vat-pham/vp-tool-<id>/` |
| `build:<id>` | `/cong-trinh/<id>/` |
| `prop:<id>` | `/dia-hinh/<id>/` |

Thứ chưa có trang riêng thì **vẫn có hình**: thiếu trang là lý do để không liên
kết, không phải lý do để bỏ luôn hình minh hoạ.

**Không trang nào được để trống hình.** Trang chủ từng có mười thẻ mà chỉ hai
thẻ có hình — trong tám thẻ trống có cả Công trình, tức đúng chỗ người ta vào
tìm cái nhà. Lối chơi và Tác giả thì không có lấy một hình nào. Nay mỗi thẻ mang
hình của **chính thứ nó dẫn tới**, và mỗi mục lớn của Lối chơi mở đầu bằng một
dải `.wgal`.

**Khoá nhân vật** nhận cả hướng và khung, nên trang Nhân vật bày ra được từng tư
thế thay vì nói suông:

| Khoá | Nghĩa |
|---|---|
| `player` · `player:<hướng>` · `player:<hướng>:<khung>` | nhân vật chính |
| `worker:<đồ>` · `worker:<đồ>:<hướng>:<khung>` | người làm, `<đồ>` là chỉ số bộ màu |
| `ui:<tên>` · `weather:<id>` | biểu tượng HUD · biểu tượng trời |

Hướng phải là `down`/`up`/`left`/`right` và khung phải nằm trong
`0..PLAYER_FRAMES-1`, `kiemKhoaSprite` soát cả hai — gõ sai thì build đỏ chứ
không lặng lẽ vẽ khung 0 ở mọi ô.

Danh sách **18 tư thế** trên trang Nhân vật không gõ tay: builder đọc chú thích
`/** ... */` phía trên từng hằng `PF_` trong `src/art/atlas.ts`. Thêm khung thứ
19 mà quên chú thích thì build đỏ ngay, chứ trang không âm thầm bỏ sót nó.

---

## 3c. Ghi phiên bản trên mỗi trang

Cường: *"ghi chép tài liệu phiên bản cho từng loại trang"*.

Mọi trang in ở chân bài: **Số liệu theo bản: nội dung `X` · lõi `Y`**. Đọc thẳng
từ `src/content/manifest.json` và `src/core/version.ts` lúc build, nên nó không
thể trôi khoi thứ nó mô tả.

Vì sao một wiki game bắt buộc phải có: luật chơi đổi theo bản. Một trang nói "cà
chua bán 75" mà không nói bản nào thì người đọc không có cách nào biết con số đã
cũ hay chưa — và một con số cũ không có nhãn còn tệ hơn không có con số.

| Loại trang | Số liệu đến từ |
|---|---|
| Cây trồng · Vật nuôi · Vật phẩm · Công trình · Địa hình · Thời tiết | content pack (`contentVersion`) |
| Hành động · Biểu tượng | mã game (`CORE_VERSION`) |
| Lối chơi | cả hai — luật ở content, cách bấm ở mã |

---

## 3d. Bảng phải cuộn trong khung của nó

Một `<table>` rộng hơn màn 320px mà không nằm trong `<div class="table-wrap">`
sẽ đẩy lệch **cả trang**: người đọc phải vuốt ngang cả bài để xem nốt một cột,
và tiêu đề trôi mất khỏi mép trái. Trang Vật phẩm đã mắc đúng lỗi này và build
vẫn xanh, vì không có gì soát.

Nay `write()` trong `scripts/build-site.mjs` soát mọi trang trước khi ghi: thấy
một `<table>` không có `class="table-wrap"` ngay trước nó là **ném lỗi**. Phép
soát ấy tìm ra hai chỗ ngay lần chạy đầu.

Kèm hai luật CSS đi cùng:

- `thead th { white-space: nowrap }` — để "Chế tạo từ" đừng vỡ thành ba dòng và
  hàng tiêu đề cao gấp ba phần thân bảng. Thà để bảng rộng ra rồi cuộn: cuộn thì
  **thấy được**, còn chữ vỡ vụn thì chỉ khó đọc.
- `.gia { white-space: nowrap }` — số và đồng xu là **một** đơn vị đọc; không có
  nó thì trên màn 320px hình xu rơi xuống dòng dưới, tách khỏi con số của nó.

`.table-wrap` còn có bóng mờ hai mép (bốn lớp `background`, hai lớp `local` bám
theo nội dung và hai lớp `scroll` là bóng) để người đọc **biết** là còn cột bên
phải — không cần một dòng JS nào.

---

## 4. Thành phần

| Lớp | Dùng khi |
|---|---|
| `.hero` | đầu trang: `h1` + một câu `.tag` |
| `section` / `section.alt` | một mục; `.alt` đổi nền để hai mục kề nhau tách ra |
| `.lead` | câu mở của một mục, cỡ lớn hơn thân bài |
| `.grid` + `.card` | ba–bốn ý ngang hàng, mỗi ý một thẻ có `h3` |
| `.note` | một câu phụ chú dưới cùng một mục |
| `table.luat` | bảng hai cột "điều gì / ra sao" |
| `.chips` + `.chip` | nhãn ngắn xếp hàng; `a.chip` là chip bấm được |
| `table.so-sanh` | bảng nhiều cột số, tiêu đề dính khi cuộn, số căn phải |
| `.table-wrap` | bọc mọi bảng rộng để nó cuộn ngang trong khung riêng |
| `.sp` (`<canvas data-sprite>`) | ô chờ sprite, `src/site/sprites.ts` vẽ vào |

`table.luat` dùng `<th scope="row">` chứ không phải `<td>` in đậm — trình đọc màn
hình đọc được "Thức dậy: 6:00" thay vì hai ô rời nhau. Ở màn hẹp hơn 520px nó xếp
chồng, nhãn nằm trên giá trị.

---

## 5. Site được dựng thế nào

**Một khuôn duy nhất.** `page()` trong `scripts/build-site.mjs` là chỗ duy nhất
quyết định `<head>`, nav và chân trang của **cả 11 trang**.

```
scripts/build-site.mjs   vỏ trang + thư viện + trang Luật chơi
src/site/noi-dung/*.html phần CHỮ của sáu trang giới thiệu
src/site/site.css        bộ nhận diện
public/favicon.svg       logo
```

Trước đây bảy trang giới thiệu **tự chép** lấy vỏ của mình, còn `page()` chỉ phục
vụ bốn trang thư viện — mười một bản sao của cùng một cái vỏ. Chúng đã trôi khỏi
nhau đúng như phải thế: bốn trang không khai một dòng `rel="icon"` nào, nên tab
trình duyệt hiện icon mặc định suốt nhiều tháng mà không ai thấy.

**Chữ nằm trong HTML, không nằm trong chuỗi JS.** Sửa một câu thì mở
`src/site/noi-dung/<trang>.html` — không phải đi tìm dấu backtick trong một file
JavaScript và né `${`.

### Mọi con số — và mọi BẢNG — sinh từ nguồn

Không chỉ con số lẻ: bốn cái bảng của trang Tính năng (cây làm ví dụ, công
trình, địa hình khai thác được, công thức chế tạo) đều **sinh từ content**, kể
cả việc *chọn* ba cây làm ví dụ (nhanh nhất · thu lại được · bán đắt nhất — lấy
bằng dữ liệu, không bằng trí nhớ).

Bản gõ tay của chúng đã sai ở bốn chỗ cùng lúc: vòi tưới ghi "4 ô kề" trong khi
nó tưới 8, bụi cỏ ghi "1–3 sợi cỏ" trong khi nó ra 2–3 sợi **và** 1–2 gỗ, cuốc
chim ghi "6 gỗ + 3 đá" trong khi công thức là 6 gỗ + 6 sợi cỏ, và bảng chế tạo
bỏ sót hẳn một công cụ (cuốc chim thép).

#### Khoá `{{...}}`

Viết `{{soCay}}` trong file nội dung, builder thay lúc build. Gõ một khoá không
có thật thì **build đỏ ngay**, chứ không lặng lẽ để lại `{{soKichBan}}` giữa
trang. Bảng khoá ở `SO_LIEU` trong `build-site.mjs`; mỗi khoá đọc từ content
hoặc từ chính mã nguồn (`soKichBan` **đếm** `test(` trong `scripts/sim.mjs`).

> Vì sao gắt thế: trang Tính năng từng khoe **"63 kịch bản kiểm thử"** và con số
> ấy đứng yên suốt bảy đợt trong khi bộ test lớn hơn gấp đôi — ngay trên trang tự
> nhận *"số trên trang không bao giờ lệch với số trong game"*. Không ai nói dối
> cả: một con số gõ tay thì không có gì buộc nó phải đúng, còn một con số đếm
> được thì không có cách nào sai.

### Vite tự quét trang

`vite.config.ts` không liệt kê trang nữa — nó quét mọi `index.html` dưới `src/`.
Danh sách gõ tay ở đó là bản sao thứ hai của danh sách trang trong builder, và
thêm một trang mà quên một trong hai chỗ thì trang đó hoặc không được build, hoặc
build ra mà không ai tới được.

Builder còn **tự soát** hai chuyện, và cả hai đều đã cấy lỗi để chắc nó đỏ được:

* Mọi mục trong `NAV` phải có một trang thật được sinh ra — chứ không phải người
  dùng bấm vào rồi gặp 404.
* Mọi khoá `data-sprite` phải trỏ tới thứ có thật trong content. Khoá sai không
  báo lỗi gì — nó chỉ vẽ ra một ô trống, và một ô trống giữa hàng chục ô có hình
  thì không ai nhận ra là thiếu. Kiểm ngay lúc sinh thẻ (`cx()`).
* Mọi việc trong `UseKind` (đọc thẳng từ `src/game/actions.ts`) phải có một mục
  trên trang **Hành động**. Trang ấy từng dạy một nút *"CHO ĂN — đứng cạnh con
  vật và bấm"* suốt ba đợt **sau khi** cho ăn trực tiếp đã bị gỡ khỏi game, và
  thiếu hẳn ba việc có thật (đổ máng, rắc hồ, nhấc/đặt). Danh sách là chữ viết
  tay, `UseKind` là mã — không có gì buộc hai thứ phải khớp, cho tới khi có dòng
  soát này.

---

## 6. Bản đồ trang

Từ Đợt 25 site KHÔNG còn là trang giới thiệu mà là một **wiki**: thanh bên tra
cứu luôn hiện, tiêu đề bài có gạch dưới, hộp thông tin bên phải, mục lục đầu
bài. Bốn trang giới thiệu cũ (Tính năng · Hướng dẫn · Cách game vận hành · Cài
về máy) đã gỡ — chúng nói VỀ game cho người chưa chơi, còn wiki nói về THỨ
TRONG game cho người đang chơi.

| Trang | Nội dung đến từ |
|---|---|
| `/` Trang chính | **sinh từ content** — `trangChinhPage()` |
| `/loi-choi/` | **sinh từ content** — `luatChoiPage()` |
| `/cay-trong/` · `/vat-nuoi/` · `/hanh-dong/` | **sinh từ content** |
| `/cay-trong/<id>/` — một trang cho MỖI cây (61) | **sinh từ content** |
| `/vat-nuoi/<id>/` — một trang cho MỖI loài (10) | **sinh từ content** |
| `/vat-pham/` + một trang cho MỖI món (37) | **sinh từ content** |
| `/cong-trinh/` + một trang cho MỖI công trình | **sinh từ content** — kể cả nhà cửa dựng sẵn |
| `/dia-hinh/` + một trang cho MỖI vật thể (70) | **sinh từ content** |
| `/thoi-tiet/` · `/bieu-tuong/` | **sinh từ content** và từ mã |
| `/nhan-vat/` | **sinh từ atlas.ts** — 18 tư thế × 4 hướng, người làm |
| `/tac-gia/` | `tacGiaPage()` — Trần Cường, story |
| `/privacy/` | `noi-dung/privacy.html` |
| `/farm/` | chính game — không dùng vỏ này |

Trang **Luật chơi** là bản dành cho người chơi của [`LOI-CHOI.md`](LOI-CHOI.md):
tài liệu trong `docs/` nói **vì sao** luật được quyết như thế, còn trang web chỉ
trả lời *"chơi thì phải biết gì"* — và mọi số đọc thẳng từ content, nên không có
cách nào nó nói sai giờ ngủ hay sai xác suất bệnh.

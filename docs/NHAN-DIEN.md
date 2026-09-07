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

Nguồn: **`scripts/make-icons.mjs`**, một lưới 16×16 ký tự. Không có file ảnh
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
  **12/16 ô giữa** — cắt kiểu nào cũng không xén mất ngọn hay gốc.
* **Đọc được ở 16px.** Ba mức đậm nhạt rõ ràng (tán sáng · tán tối · viền), không
  dựa vào chi tiết nhỏ hơn một pixel lưới.
* **Mang màu thương hiệu.** Hai quả `--gold` — đúng màu vàng của HUD trong game
  và của chữ ONI trên web.

> Bản vẽ đầu tán đối xứng và hai quả cân nhau: nó đọc ra thành một **khuôn mặt**.
> Bản hiện tại đổ bóng theo **một** hướng sáng và đặt hai quả lệch nhau.

---

## 2. Màu — có VAI, không có tên

Token định nghĩa ở `src/site/site.css` (`:root`), dùng chung với game
(`src/style.css`) để site và game trông như **một** sản phẩm.

| Token | Vai |
|---|---|
| `--gold` `#ffd84a` | tiền · thương hiệu · thứ cần chú ý · nhãn hàng trong bảng |
| `--green` `#6cc94f` | cây · làm được · thành công |
| `--red` `#e05d5d` | hỏng · thiếu · từ chối |
| `--blue` `#5aa9e6` | liên kết · nước · đồng hồ |
| `--ink` / `--ink-dim` / `--ink-mute` | chữ chính / chữ phụ / chữ mờ |
| `--bg` → `--panel-3` | năm bậc nền, tối dần vào trong |
| `--edge` / `--edge-hi` | viền thường / viền nổi |

**Dùng đúng vai thì trang tự đọc được.** Người đọc học một lần rằng vàng là tiền
và đỏ là hỏng, rồi không cần chú giải nào nữa. Lấy `--gold` để trang trí một tiêu
đề không nói về tiền là phá đúng cái quy ước đó.

---

## 3. Chữ — bốn bậc, không hơn

```
--chu-to    clamp(28px, 7vw, 44px)     h1 trong hero
--chu-muc   clamp(20px, 4.2vw, 27px)   h2 — tên một mục
--chu-the   clamp(16px, 2.9vw, 18px)   h3 — tên một thẻ
--chu-nho   13.5px                     chú thích, nhãn, chip
```

Thân bài `clamp(15px, 2.6vw, 16.5px)`, `line-height: 1.7`.

Thêm bậc thứ năm là mở đường cho "cỡ nào cũng được", và trang sẽ trôi thành mỗi
mục một cỡ. Bốn bậc đủ cho mọi trang hiện có.

Font là **sans hệ thống** (`system-ui`) — tiếng Việt có nhiều dấu chồng, và font
hệ thống là font được máy đó dựng chữ Việt tốt nhất. Không tải font ngoài: một
trang chơi được offline thì không nên chờ mạng để hiện chữ.

**Khoảng cách** là bội của 4 (`--k1` … `--k7`), để mọi thứ rơi đúng một lưới.

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

### Mọi con số sinh từ nguồn

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
* Mọi việc trong `UseKind` (đọc thẳng từ `src/game/actions.ts`) phải có một mục
  trên trang **Hành động**. Trang ấy từng dạy một nút *"CHO ĂN — đứng cạnh con
  vật và bấm"* suốt ba đợt **sau khi** cho ăn trực tiếp đã bị gỡ khỏi game, và
  thiếu hẳn ba việc có thật (đổ máng, rắc hồ, nhấc/đặt). Danh sách là chữ viết
  tay, `UseKind` là mã — không có gì buộc hai thứ phải khớp, cho tới khi có dòng
  soát này.

---

## 6. Bản đồ trang

| Trang | Nội dung đến từ |
|---|---|
| `/` | `noi-dung/trang-chu.html` |
| `/tinh-nang/` | `noi-dung/tinh-nang.html` |
| `/luat-choi/` | **sinh từ content** — `luatChoiPage()` |
| `/thu-vien/` + 3 trang con | **sinh từ content** |
| `/huong-dan/` | `noi-dung/huong-dan.html` |
| `/cach-hoat-dong/` | `noi-dung/cach-hoat-dong.html` |
| `/tai-ve/` | `noi-dung/tai-ve.html` |
| `/privacy/` | `noi-dung/privacy.html` |
| `/farm/` | chính game — không dùng vỏ này |

Trang **Luật chơi** là bản dành cho người chơi của [`LOI-CHOI.md`](LOI-CHOI.md):
tài liệu trong `docs/` nói **vì sao** luật được quyết như thế, còn trang web chỉ
trả lời *"chơi thì phải biết gì"* — và mọi số đọc thẳng từ content, nên không có
cách nào nó nói sai giờ ngủ hay sai xác suất bệnh.

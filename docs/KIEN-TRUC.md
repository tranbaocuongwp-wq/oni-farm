# Spec công nghệ & kiến trúc

Mã chạy ra sao, và **vì sao chia như thế**. Luật chơi ở
[`LOI-CHOI.md`](LOI-CHOI.md); các thuật toán ở [`GIAI-THUAT.md`](GIAI-THUAT.md).

Nền tảng: **static site thuần**. Không server, không backend, không bước đóng gói
native. `npm run build` ra một thư mục `dist/` thả lên host tĩnh nào cũng chạy.
TypeScript + Vite, **không phụ thuộc runtime nào** — không React, không thư viện
game, không thư viện tiện ích.

---

## 1. Hai làn: CORE và CONTENT

Đây là quyết định kiến trúc lớn nhất của dự án.

```
   LÀN CHẬM (core)                    LÀN NHANH (content)
   ────────────────                   ───────────────────
   src/core/  src/game/               src/content/*.json
   src/render/  src/ui/               61 cây · 8 loài · 25 vật thể
   luật chơi, máy móc                 giá cả · bản đồ · chữ · cân bằng

   đổi ⇒ phải build lại bundle        đổi ⇒ đẩy OTA, không build lại
```

Core **không bao giờ** viết `switch (id)` cho một cây hay một loài cụ thể. Nó chỉ
biết các **hệ số**: `growMul`, `diseaseMul`, `speedMul`, `shelter`, `halt`,
`feed`, `housing`, `pen`. Ý nghĩa "mưa", "bão", "con bò" là chuyện của content —
kể cả chuyện *bão thì ai trú, ai không tới* (Đợt 21): core chỉ đọc ba cờ. Thêm một kiểu thời tiết mới, một
loài mới, một mùa thứ năm — **không sửa một dòng mã nào**.

Chi tiết vận hành: [`CONTENT.md`](CONTENT.md) · [`OTA.md`](OTA.md).

---

## 2. Chiều phụ thuộc — một chiều, có chủ đích

```
   core/  ──▶  game/  ──▶  (render/, ui/)
     ▲                          │
     └──── main.ts ghép lại ◀───┘
```

* `src/game/` là **luật chơi thuần**: không DOM, không `window`, không `import`
  xuống `core/` trừ đúng `core/version.ts`. Nhờ vậy **test thẳng trong Node**,
  không cần trình duyệt, và không bao giờ lệch với luật chơi thật.
* `src/core/` là hạ tầng: store, save, settings, input, OTA, vòng lặp.
* `src/render/` và `src/ui/` **chỉ đọc** state. Không bao giờ sửa.
* `main.ts` là chỗ duy nhất ghép tất cả và chạm vào DOM.

> Đó là lý do A\* nằm ở `game/pathfind.ts` chứ không ở `core/`: con bò tìm đường
> **bên trong reducer**, mà reducer không được phép với xuống `core/`. Phần thuần
> nằm ở `game/`, còn `core/navigate.ts` (bấm-để-đi — một **cách nhập liệu**)
> import ngược lên dùng lại.

---

## 3. Một cửa duy nhất

Mọi thay đổi state đi qua đúng một chỗ:

```
dispatch(action) → reduce() thuần → kiểm bất biến → báo cho người nghe
```

UI và renderer **chỉ đọc**. Một cơ chế này làm ba việc khó cùng chạy được:

| | Là gì |
|---|---|
| **Save** | `store.snapshot()` |
| **Test** | replay một mảng `Action` rồi so state |
| **OTA** | tráo tham số `content`, cấu trúc state không đổi |

**30 loại action.** `GameState` là **JSON thuần** — không class, không `Map`,
không tham chiếu vòng. Đường đi của thực thể là **mảng chỉ số ô** (số), không phải
mảng object: gọn hơn hẳn trong save và không có gì để lệch.

### Kiểm bất biến

`checkInvariants` chạy sau **mọi** dispatch ở bản dev và trong toàn bộ test
(`validate: true, strict: true`), **tắt ở bản phát hành**. Vỡ bất biến là ném lỗi
**ngay tại action gây ra nó**, không phải ba phút sau ở một chỗ khác.

Đo được: 0,0235 ms mỗi lần trên nông trại 1.776 ô — rẻ, nhưng vẫn tắt ở bản chơi
thật vì nó không mua gì cho người chơi.

---

## 4. Draft: copy-on-write ba tầng

`reduce()` phải **thuần** — không sửa state cũ. Clone sâu cả cây thì đắt, và làm
renderer mất mọi tham chiếu cũ. Nên:

```ts
const d = draft(state);
const t = dTile(d, i);   // chỉ clone MẢNG tiles + ĐÚNG ô đó
t.wet = true;
return commit(d);        // đổi → object mới; không đổi → trả y nguyên state cũ
```

Ba tầng, chỉ clone khi **thật sự ghi**:

```
maps (object) → maps[id] (StoredMap + mảng tiles) → từng ô
```

Bản đồ không đổi gì trong đêm thì **giữ nguyên tham chiếu cũ**. Store so
`next === state` để bỏ qua render.

> **Cái bẫy đi kèm, và nó đã cắn thật.** "Không đổi thì giữ tham chiếu" nghe như
> một phép so tham chiếu là đủ để biết có gì đổi. Nhưng cây trồng cộng dồn `grow`
> **mỗi khung hình**, nên chỉ cần một ô ẩm có cây là cả mảng `tiles` bị nhân bản —
> mọi khung, không trừ khung nào. Bản đồ nhỏ tin vào phép so ấy và **vẽ lại cả
> 1.776 ô mỗi khung** suốt mười bốn đợt. Xem
> [`GIAI-THUAT.md`](GIAI-THUAT.md#10-bản-đồ-nhỏ--vẽ-lại-đúng-ô-đổi-màu).

---

## 5. Tất định — xương sống của cả dự án

Bất biến: **cùng seed + cùng chuỗi action = state y hệt.** Save, replay, và toàn
bộ 169 kịch bản sim đều dựa vào nó.

Hai luật giữ nó:

**Luật 1 — `state.seed` là bất khả xâm phạm trong đường TICK.**
TICK không rút một hạt ngẫu nhiên nào. Seed chỉ bị rút theo **sự kiện** (sang
ngày, thu hoạch, mua bán). Nếu 20 con vật cùng rút seed toàn cục mỗi khung hình
thì *số lần rút* phụ thuộc số khung hình, mà số khung hình phụ thuộc fps — và cả
việc có mở modal hay không. Bất biến vỡ ngay, mà **vỡ âm thầm**.
→ Mỗi con mang `seed` riêng, advance cục bộ; hạt ban đầu rút từ `state.seed` đúng
một lần lúc **sinh ra**, và sinh ra luôn là một action.

**Luật 2 — DI CHUYỂN mỗi khung, QUYẾT ĐỊNH theo nhịp giờ game.**
Nhích theo đường thì làm mỗi khung (mượt, thuần). Còn *chọn làm gì* chỉ chạy mỗi
`ACTOR_STEP_MINUTES` = 0,5 phút game. Số bước là hàm của `state.minutes`, mà
`minutes` là hàm của tổng `dt` đã dispatch — nên replay cho cùng số bước bất kể
máy chạy 30 hay 120 fps. Đếm bằng **chỉ số nguyên** (`actStep`), không phải bộ
tích luỹ float, để không trôi qua save/load.

PRNG là **mulberry32** thuần: `(seed) → { v, seed mới }`. Không có trạng thái ẩn.

---

## 6. Vòng lặp

`createLoop` tách khỏi mọi thứ khác để test không cần `requestAnimationFrame`.

* `dt` bị **kẹp trần** (`maxDt` = 1/20): chuyển tab rồi quay lại không được sinh
  một `dt` khổng lồ làm nhân vật xuyên tường.
* `dt` cũng bị **kẹp sàn** ở 0: mốc thời gian của khung rAF đầu tiên có thể sớm
  hơn `performance.now()` lúc `start()`, cho ra `dt` âm.
* Một khung **ném lỗi không làm vòng lặp chết** — khung sau thường tự lành. Nhưng
  `MAX_CONSECUTIVE_ERRORS` = 10 khung liên tiếp lỗi thì dừng hẳn và **nói thật**:
  lúc đó state đã hỏng, chạy tiếp chỉ là ghi đè save bằng một state hỏng.
* `step(dt)` gọi tay (test, bench) **không nuốt lỗi**.

---

## 7. Nhiều bản đồ

Bản đồ **đang chơi** nằm ở `tiles/w/h`; các bản đồ khác nằm trong `maps`. Đi qua
cửa là `PORTAL`: đổi `mapId`, cất bản đồ cũ, nạp bản đồ mới.

Camera phải được báo **cả hai** thay đổi: nhảy vị trí **và** `setWorld` kích thước
mới — thiếu cái sau thì nó vẫn kẹp theo biên bản đồ cũ.

`newDay` xử lý **mọi** bản đồ; `TICK` chỉ đụng bản đồ đang chơi. Xem
[`LOI-CHOI.md`](LOI-CHOI.md#ngủ-và-sang-ngày).

---

## 8. Lưu và cập nhật

**Save** — ba tầng, tự tụt xuống khi tầng trên không dùng được:

1. **IndexedDB** — chính.
2. **localStorage** — dự phòng (ẩn danh, Safari khoá IDB, WebView lạ).
3. **File JSON** — người chơi tự xuất/nhập.

Save mang `coreVersion` + `contentVersion`, nên content đổi qua OTA thì game biết
đường **migrate** thay vì crash. `SAVE_VERSION` hiện tại là **10**. Có sao lưu tự
động phòng khi save chính hỏng.

**OTA** — content pack tải về, kiểm cổng tương thích (`requiresCore` khớp semver
với `CORE_VERSION`) rồi mới nhận. Pack thiếu file thì ghép với bản đóng kèm. Chi
tiết ở [`OTA.md`](OTA.md).

**PWA** — precache bằng Workbox, và một **thanh báo bản mới** thay vì âm thầm
thay. Chơi offline hoàn toàn.

---

## 9. Lớp vẽ

Canvas 2D, pixel art. Mọi thứ vẽ bằng **world px**; đúng **một** phép biến đổi ở
đầu mỗi khung đổi sang pixel màn hình:

```
setTransform(scale·dpr, 0, 0, scale·dpr, offX·dpr, offY·dpr)
```

Nhờ vậy phần còn lại của renderer không cần biết màn hình to nhỏ ra sao.
`src/render/camera.ts` là chỗ **duy nhất** biết kích thước màn hình.

`dpr` ở đây là **dpr HIỆU DỤNG**, không phải `devicePixelRatio` của trình duyệt:
`setSize` nắn nó sao cho `scale × dpr` luôn là bội nguyên của `ART`, vì đó mới là
tỉ lệ phóng thật của một pixel ảnh (xem `GIAI-THUAT.md` mục 10d — chỗ này từng
thiếu đúng thừa số `dpr` và đó là một nửa chữ "mờ"). Nó luôn **bằng hoặc lớn hơn**
dpr thật của màn hình, không bao giờ nhỏ hơn.

Bốn luật giữ nét pixel và giữ tốc độ:

1. `imageSmoothingEnabled = false`, hệ số phóng **nguyên** khi có thể, camera snap
   về **world px nguyên** — nửa pixel lệch là đủ làm cả màn hình mờ và rung.
2. **Khung nhìn tính theo SỐ Ô**, không theo pixel — điều kiện để game công bằng
   giữa điện thoại và desktop.
3. **Cắt theo khung nhìn**: 1.776 ô nhưng chỉ ~289 ô được vẽ (75,9% không phải vẽ).
4. **Ngày/đêm đục lỗ**: phủ tối lên một lớp riêng rồi **đục** bằng
   `destination-out` ở chỗ có đèn, vẽ ở **nửa** độ phân giải màn hình.

Bờ nước và mép luống là **autotile ở lớp vẽ** — chỉ nhìn hàng xóm lúc vẽ, state
không lưu thêm gì.

Chi tiết đồ hoạ và UX chạm: [`MOBILE-UX.md`](MOBILE-UX.md).

---

## 10. Kiểm thử

| Lệnh | Việc |
|---|---|
| `npm run test:sim` | **169 kịch bản** mô phỏng, Node thuần, ~30 giây |
| `npm run test:ota` | cổng tương thích + schema content pack |
| `npm run test:all` | typecheck + cả hai |
| `npm run bench` | bảng chi phí phần mô phỏng trên cảnh nặng cố định |

Mọi store trong sim bật `{ validate: true, strict: true }`.

**Luật quan trọng nhất của bộ test:** mọi kịch bản mới phải **cấy lại lỗi** và
thấy đúng nó đỏ. *Một kịch bản không bao giờ đỏ được là một kịch bản không kiểm gì
cả.* Xem cột "Đột biến đã cấy" trong [`TIEN-DO.md`](TIEN-DO.md).

Kịch bản phải **đồng bộ** — một hàm `async` lọt vào thì khung test ghi ✓ ngay,
rồi mọi assertion chạy ở microtask sau và hỏng cũng chỉ thành unhandled rejection.
Khung test chặn đúng cái bẫy đó.

---

## 11. Đo hiệu năng

**Đo trước, sửa sau.** `npm run bench` in bảng chi phí trên một cảnh dựng theo hạt
cố định, nên hai lần đo cách nhau nửa năm vẫn so được với nhau.

Sửa mà bảng **không nhúc nhích** thì **gỡ bản sửa ra** và ghi lại là đã thử — Đợt
15 làm đúng thế với bể dùng lại cho lớp vẽ. Một tái cấu trúc không dời được kim
thì chỉ là thêm phức tạp.

Lớp vẽ **không** đo được trong Node (canvas ở Node chỉ đo phần CPU của mình, ra
một con số trông chính xác mà không đúng với cái gì cả). Đo nó trong trình duyệt
qua `window.__PF.step()` ở bản dev, hoặc **đếm lệnh vẽ** — thước đo không phụ
thuộc lịch trình của trình duyệt.

Từ Đợt 24 bộ đếm ấy có thật, không còn là mong muốn: `renderer.stats()` trả
`{ drawImage, fillRect, items, culled, nenVe, lat, ms }` của khung vừa vẽ (chỉ
bản DEV — nó bọc `g.drawImage`/`g.fillRect` nên không được phép tồn tại trong bản
phát hành). Cùng đợt, thời gian **dựng atlas** lúc mở game cũng in ra console ở
bản dev.

**Đọc kỹ chỗ này trước khi tin một con số về lớp vẽ.** Từ Đợt 24 tới Đợt 27 bộ
đếm chỉ bọc ngữ cảnh của canvas **chính**. Renderer còn tạo ba canvas phụ nữa —
cache lớp nền, lớp đêm, mảng nước/mưa — và không cái nào bị đếm, trong khi cache
lớp nền là chỗ đắt nhất của cả lớp vẽ. Nó báo 149 lệnh vẽ mỗi khung; đo lại sau
khi bọc đủ thì con số thật là **1.544**. Một bộ đếm mù đúng chỗ đắt nhất còn tệ
hơn không có bộ đếm, vì nó làm người ta tin là đã đo rồi. Đợt 28 bọc **mọi** ngữ
cảnh renderer tạo ra — hàm `boc()` dùng chung; thêm ngữ cảnh mới mà quên bọc là
lặp lại đúng lỗi ấy.

Đo một khung: `__PF.step(0.016, 3)` rồi `__PF.renderer.stats()`. Đo cả một phiên:
**`__PF.do(n)`** chạy `n` khung rồi trả `{nenVe, drawImage, fillRect, items,
culled, lat, draw ms, khung p50/p99, backing Mpx}` — đó là chỗ duy nhất trả lời
được câu "một khung hình tốn bao nhiêu", vì `bench.mjs` cố ý không đo lớp vẽ.

Hai trường trong bảng ấy có một tiền lệ đáng nhớ: `culled` được khai từ Đợt 24 và
**không có lấy một dòng nào cộng vào** trong cả repo, nên nó báo 0 suốt bốn đợt —
và 0 đọc ra như "không có gì để cắt", trong khi thật ra có 53 thứ để cắt mỗi
khung. `lat` suýt lặp lại đúng thế trong chính Đợt 28. Khai một trường thống kê
mà không cộng vào nó thì tệ hơn là không khai.

---

## 12. Triển khai

Cloudflare Pages, project `oni-farm`, production branch `main`, nối thẳng với
GitHub. Push lên `main` là tự build và publish; nhánh khác sinh preview riêng.

Sau khi lên mạng thì **poll asset tới khi nó trả về JavaScript thật, rồi `cmp`
từng byte với `dist/`** — không tin vào "deploy xong rồi". Chi tiết:
[`DEPLOY.md`](DEPLOY.md).

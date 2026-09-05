# Trải nghiệm điện thoại & hệ đồ hoạ

Tài liệu này là **hợp đồng thiết kế** cho lớp UI/đồ hoạ: luật nào giữ, con số nào
cố định, và một thay đổi phải qua những chốt nào. Đọc trước khi sửa bất cứ thứ gì
trong `src/ui/`, `src/art/`, `src/render/`, `src/style.css`.

---

## 1. Nguyên tắc

1. **Ngón tay cái là người dùng.** Mọi thứ bấm được ≥ 44 CSS px (`--tap`) — và khi
   HÌNH không thể to bằng ngần ấy thì **vùng chạm vẫn phải**, nới bằng một `::before`
   trong suốt (ô hotbar, nút ‹ › × của bảng vật nuôi, dấu ✕ của thanh cập nhật).
   Nút hành động chính 72px, nút phụ 52px. Không có nút nào cần hai tay.

   Ngoại lệ có chủ ý: **hotbar cố định 10 ô** trên một hàng, không cuộn — cỡ ô tính
   từ bề ngang khả dụng nên chỉ được 26–33px trên điện thoại. Đây là SỐ HỌC chứ không
   phải sơ suất: 10 × 44 cộng khe là hơn 460px, rộng hơn cả màn. Bù lại bằng vùng chạm
   cao 44px (trục dọc còn chỗ, mà ngón cái đi từ dưới lên nên sai số dọc là sai số hay
   gặp nhất) và bằng khe rộng hơn ở cỡ giao diện Lớn. Muốn ô to thật thì phải giảm
   `balance.hotbarSlots` — CSS tự tính theo, `renderHotbar` đẩy số đó vào
   `--hotbar-slots`.

   **Đừng để `min-height: 0` lọt vào một cái nút.** Luật chung
   `button { min-height: var(--tap) }` là thứ giữ chuẩn 44px, và một dòng ghi đè nó
   trong khối riêng của nút là cách âm thầm nhất để tạo ra một nút 24px. Đã dính hai
   lần: nút XÂY và nút "Tải lại" của thanh cập nhật.

   **Hộp bao ngoài không được `pointer-events: auto`.** Chỉ NÚT mới nhận chạm. Cụm
   `#abtn` là một cột cao gần 140px, rộng tới 46vw vì cái nhãn `.why` — để cả hộp nhận
   chạm là dựng một vùng "bấm không ăn" bằng 7% màn hình, đúng góc ngón cái quét qua
   nhiều nhất. `#hud` đã làm đúng từ đầu: gốc `none`, bật lại từng thứ.
8. **Thao tác có độ trễ và diễn hoạt.** Bấm không đổi ô ngay: giơ công cụ → chạm đất
   (mốc `actionImpact`) → kết quả. Reducer và renderer đọc cùng một con số.
9. **Không zoom.** `touch-action: manipulation` toàn cục (khu chơi `none`), cộng JS chặn
   gesturestart / véo hai ngón / chạm kép ngoài nút / Ctrl+lăn — pixel art giữ đúng tỉ lệ.
2. **Nhân vật LUÔN ở tâm màn hình.** Với lối chơi chạm-để-đi, tâm là chỗ mắt nhìn.
   Camera không kẹp ở mép bản đồ nữa (`edgeMode: "center"`); phần ngoài biên vẽ
   rừng/tường tối (`atlas.voidOut/voidIn`), không bao giờ là màn đen.
3. **Nút chính phải nói nó sẽ làm gì.** `src/game/hint.ts` tính ra ĐÚNG MỘT hành
   động cho ô đang ngắm — HUD chỉ in nhãn. Không làm được thì in lý do ngắn.
4. **Không có gì đè lên nhân vật.** Toast nằm trong luồng `.hud-top` (dưới chip mục
   tiêu), cụm nút ở góc dưới, hotbar ở đáy. Vùng giữa màn hình luôn trống.
5. **Sở thích thuộc MÁY, không thuộc VÁN.** Mọi tuỳ chọn (tay thuận, cỡ chữ, zoom,
   rung, joystick…) ở `core/settings.ts` + localStorage, không bao giờ vào save.
6. **Hiệu ứng không vào state.** Hạt, lấp lánh, dấu đích, thẻ "Ngày N", tutorial
   là trang trí của lớp vẽ/DOM. Reducer và file save không biết chúng tồn tại.
7. **Đọc được bằng hình dạng.** Đất ướt có vệt nước, cây chín có quả + sao, ao có
   bọt bờ, lô đất có viền — không dựa vào màu đơn thuần (ban đêm màu đổi hết).

---

## 2. Bố cục HUD

```
┌ [tiền] [ngày] [giờ] [năng lượng ▬▬] [nước] ────────────── [☰] ┐  .hud-top / .stat-bar
│ (🏳 mục tiêu — chip, bấm để thu gọn)                            │  .goal-chip
│ (toast, toast…)                                                 │  #toasts
│                                                                 │
│                        NHÂN VẬT Ở TÂM                           │
│                                                                 │
│ [bản đồ nhỏ]                              (lý do)               │  .hud-mid · #abtn .why
│                                        [E]  [ CÀY ]             │  #abtn
└──────────────── [hotbar 9 ô] ───────────────────────────────────┘  .hud-bottom
```

Bốn trục thích ứng, **CSS diễn giải, JS chỉ đặt data-attribute lên `<body>`**:

| Trục | Attribute | Do ai đặt | Tác dụng |
|---|---|---|---|
| Hướng màn | `data-orientation` = portrait/landscape | `core/screen.ts` | dọc: hotbar né cụm nút; ngang: hotbar dịch khỏi cụm nút, bản đồ nhỏ lên trên |
| Tay thuận | `data-hand` = right/left | settings | lật cụm nút, nút ☰, joystick, bản đồ nhỏ sang bên kia |
| Cỡ giao diện | `data-ui` = auto/small/large | settings | ghi đè token `--fs`, `--slot`, `--btn-a/b` |
| Chuyển động | `data-motion` = full/reduce | settings + `prefers-reduced-motion` | tắt animation/transition, renderer bỏ hạt + sparkle + nhấp nháy |

Thêm `body.touch` (thiết bị cảm ứng) bật lớp `#touch`; `data-control=stick` bật
joystick; `data-ctx=off` tắt nhãn ngữ cảnh.

**Token** — mọi màu/cỡ khai ở `:root` của `src/style.css`. Thêm thành phần mới thì
dùng token có sẵn hoặc thêm token, không viết số trực tiếp. `site.css` dùng cùng
bảng màu để trang tĩnh và game là một sản phẩm.

---

## 3. Điều khiển cảm ứng

| Cử chỉ | Kết quả | Ở đâu |
|---|---|---|
| Chạm 1 lần | đi tới ô (A*), ngắm sẵn ô đó, vòng vàng đánh dấu đích | `main.ts` case "pointer", `core/navigate.ts` |
| Chạm 2 lần (< 350ms, < 44px) | làm ngay tại ô; xa thì đi tới rồi làm | như trên |
| Nút hành động | làm việc ghi trên nút với ô đang ngắm; ô xa thì tự đi tới rồi làm | `main.ts` case "use" |
| **Giữ** nút hành động (> 0,2s) hoặc bấm liên tục | xong nhát này tự sang ô kế tiếp **trong tầm**, cùng loại việc; hết ô thì dừng, không tự đi xa | `game/hint.ts › nearestTarget`, `main.ts › continueWork` |
| Nút 🎒 / phím `I` | mở balo: hotbar cố định 10 ô + 14 ô balo; chạm-chọn-chạm hoặc kéo thả để đổi chỗ (action `SWAP`) | `ui/menus.ts › openBag` |
| Nút E | tương tác thứ trước mặt (không theo ô ngắm) | case "interact" |
| Nhấn giữ ô hotbar (380ms) | tooltip tên + công dụng | `ui/hud.ts` |
| Chạm bản đồ nhỏ | đi thuần tuý tới ô đó | `ui/minimap.ts` |
| Kéo một tuyến | `setPointerCapture` NGAY lúc chạm xuống — không giữ thì ngón rê ra khỏi canvas là `dragEnd` không bao giờ tới và phiên kéo kẹt vĩnh viễn | `core/input.ts › onDown` |
| Chạm chip mục tiêu | thu gọn/mở | `ui/hud.ts` |

Nắn cú chạm (`snapTap`): xét 9 ô quanh điểm chạm, ưu tiên ô làm được việc, bán kính
tính bằng pixel màn hình rồi đổi ra world px — màn càng nhỏ nắn càng rộng.

Ô ngắm dính (`aimed`): giữ chừng nào còn trong tầm với; bỏ khi tự đi/đổi bản đồ.

**Phản hồi khi thao tác thành công** (suy từ diff thống kê trong `main.ts`, không
cần action riêng): âm thanh 8-bit + hạt tại ô (`renderer.burst`) + rung
(`core/haptics.ts`, chỉ Android). Thao tác hụt: tiếng "deny" + rung mẫu khác.

---

## 3b. Tay cầm chơi game (`src/core/gamepad.ts`)

Tay cầm là **đường vào thứ tư**, đổ chung vào `axis()` và `drain()` của
`core/input.ts` — không có nhánh logic riêng nào trong game. Nhưng nó là hệ
**HỎI VÒNG**, không phát sự kiện: `input.poll(performance.now())` phải chạy
đúng một lần mỗi khung, TRƯỚC khi ai hỏi `axis()` hay `drain()`.

Vì sao poll chứ không nghe `gamepadconnected`: Chrome và Safari chỉ bắn sự kiện
đó SAU khi người chơi bấm một nút (chống fingerprinting). Cắm rồi ngồi im thì
không có sự kiện nào.

| Nút | Ngoài ruộng | Trong menu |
|---|---|---|
| A (0) | dùng — cày/gieo/tưới/thu; giữ để làm tiếp ô kế bên | chọn |
| B (1) | tương tác — cửa hàng, giường, giếng, kho, con vật | thoát |
| X (2) | bật/tắt tự động làm | — |
| Y (3) | balo | — |
| LB/RB (4,5) | đổi ô hotbar (giữ LT: nhảy 5 ô) | đổi tab |
| LT (6) | **chạy** | giữ + vai: nhảy 5 ô hotbar |
| RT (7) | dùng | — |
| Back (8) | bản đồ nhỏ — bật con trỏ ô, gạt để rê, A để đi | — |
| Start (9) | menu tạm dừng | thoát |
| L3 (10) | chế độ xây dựng | — |
| R3 (11) | mở lại sơ đồ nút | — |
| Cần trái / D-pad | đi (analog, độ dài vector có nghĩa) | chuyển tiêu điểm |
| Cần phải | đổi ô hotbar | cuộn thân menu |

**Bảy luật không được phá:**

1. **Chỉ bắt SƯỜN LÊN.** `getGamepads()` trả "đang giữ", game cần "vừa bấm".
   Không so với khung trước thì giữ A một giây là sáu mươi lệnh.
2. **KHÔNG giữ tham chiếu `Gamepad`.** Chrome trả ảnh chụp mới mỗi lần gọi;
   giữ cái cũ thì `buttons` đóng băng vĩnh viễn. Bẫy kinh điển và im lặng.
3. **Vùng chết HÌNH TRÒN**, không cắt theo trục — cắt theo trục thì đẩy chéo
   nhẹ ra một hướng thẳng và nhân vật đi giật tám hướng. Chỉnh được trong Cài
   đặt (`padDead`), vì đây là con số hỏng theo PHẦN CỨNG: cần gạt mòn nghỉ lệch
   tâm thì nhân vật tự đi mãi.
4. **`mapping !== "standard"` thì CHỈ gán cần gạt + hai nút mặt đầu tiên**, và
   nói thẳng trong sơ đồ nút. Chỉ số nút của tay cầm lạ là thứ tự thô của phần
   cứng. Lúc đó `body[data-input]` là `"pad"` chứ không phải `"pad-std"`, và
   CSS **không** được giấu nút chạm đi — giấu là bịt nốt đường vào cuối cùng.
5. **Sơ đồ nút chỉ bày nút THẬT SỰ có** (`i < info.buttons`). Quảng cáo "L3 mở
   chế độ xây" trên tay cầm mười nút là chỉ người chơi đi bấm cái không tồn tại.
6. **Mọi thứ sơ đồ nút hứa thì phải làm được thật.** Đây từng là chỗ hỏng:
   `running` được tính đúng trong `gamepad.ts` rồi bị `input.ts` quên đọc, nên
   người chơi tay cầm đi bộ suốt ván trong khi màn sơ đồ vẫn quảng cáo hai cách
   chạy. Kịch bản 72 giờ là dây bẫy cho đúng việc đó.
7. **Cần gạt phải TRẢI LẠI phần trên vùng chết** ra đủ 0..1, y hệt joystick ảo.
   Không trải thì vượt ngưỡng là tốc độ nhảy cóc từ 0 lên 28%, và cả dải đầu cần gạt
   thành vô dụng. Nhưng ngưỡng gạt-một-nấc trong menu (`ON`/`OFF`) phải đo trên giá
   trị **THÔ** — hai câu hỏi khác nhau, hai thước khác nhau.
8. **Đổi nút chỉ cho đổi nút MẶT và VAI** (0–7). Cho đổi Start hay L3 thì người chơi
   tự khoá mình ra khỏi menu, mà không vào được menu thì không có đường nào đặt lại.
9. **Đảo trục Y chỉ đụng cần NGẮM**, không đụng cần đi — "đẩy lên để đi lên" là quy
   ước của game nhìn từ trên xuống, không ai đảo cái đó.
10. **Rung đi chung công tắc với rung điện thoại.** `buzz()` gọi cả hai qua
   `setPadRumble`; `setHaptics(false)` tắt cả hai. Trước đây tắt "Rung" trong
   Cài đặt không tắt rung tay cầm.

**Điều hướng menu** tập trung hết ở `main.ts`, KHÔNG rải vào từng màn:
`focusRoot()` (hỏi từng lớp theo thứ tự ưu tiên, không dùng selector gộp — vì
`querySelector` trả phần tử đầu theo DOM chứ không theo thứ tự viết), `ungVien`,
`moveFocus` (chọn theo HÌNH HỌC), `focusIn`, `cycleTab`. Màn mới chỉ cần dùng
`shell()` và `role="button"` là tự chạy được.

**Giữ chỗ ngồi khi menu vẽ lại** (`src/ui/focus.ts`): mỗi cú bấm gọi lại
`open*()`, mà `shell()` xoá sạch `root` — nên tiêu điểm, chỗ cuộn và hoạt cảnh
mở sheet đều bị dựng mới. Nhận lại bằng **chỗ ngồi** (toạ độ bố cục + loại điều
khiển), không bằng định danh: menu không có id ổn định nhưng nó dựng lại đúng
bố cục cũ. Dùng `offsetLeft/offsetTop` chứ KHÔNG `getBoundingClientRect` — ở
đúng khung hình cần đo thì hoạt cảnh đang làm lệch toạ độ màn hình tới 40px.
Vế "loại điều khiển" chặn một tai nạn thật: bấm `+` tới số tối đa làm `+` bị vô
hiệu, và nếu chỉ so khoảng cách thì vòng vàng rơi xuống nút BÁN ngay dưới nó.

**Hộp xác nhận phải là modal của game**, không được dùng `confirm()` gốc —
`confirm()` chặn cả vòng lặp JS nên `poll()` ngừng chạy và tay cầm chết cứng.
Dùng `askConfirm()` trong `menus.ts`.

**Ô bấm được phải nghe `click`**, không chỉ chuỗi pointer: tay cầm chọn bằng
`el.click()`, mà `click` do script tạo ra không kèm `pointerdown` nào.

---

## 4. Nút hành động theo ngữ cảnh (`src/game/hint.ts`)

Hàm thuần `hintAt(state, content, x, y)` → `{ kind, label, ready, why }`.

Thứ tự ưu tiên **trùng với reducer**:

1. Có vật thể tương tác ở ô hoặc 4 ô kề → MUA / BÁN / CHẾ / NGỦ / MÚC / VÀO.
2. `canUseAt(..., ignoreReach = true)` → THU / CÀY / TƯỚI / GIEO / ĐẶT / CHẶT / ĐẬP
   (thu hoạch luôn thắng, như `useAt`).
3. Không có gì → `label: "DÙNG"`, `why` là câu ngắn ưu tiên nói về **vật phẩm đang
   cầm** ("Cày trước đã", "Đã tưới rồi", "Hết nước — ra giếng", "Cần Rìu gỗ"…).

`ready` = trong tầm với. CSS tô nút: xanh sáng khi `ready`, xanh dương khi phải đi
tới, vàng khi THU, xám khi không có gì. Test: `scripts/sim.mjs` kịch bản 37.

Vì hàm gọi đúng những hàm mà reducer gọi, nhãn **không thể lệch** với luật chơi.
Thêm một loại hành động mới = thêm một dòng vào `LABEL`, kèm test.

---

## 5. Cài đặt (`src/core/settings.ts`)

```ts
{ v, control, hand, uiScale, zoom, haptics, reduceMotion, tutorialSeen, contextButton }
```

- `parseSettings(raw)` là **cửa duy nhất**: nhận bất kỳ thứ gì, luôn trả về hợp lệ,
  khoá lạ bị bỏ, sai kiểu về mặc định. Idempotent. Test: kịch bản 38.
- `applySettings()` chỉ đặt data-attribute lên `<body>`. Không đo đạc bố cục.
- Đổi `zoom` → `camera.setZoom()` → dải số ô mới (gần 7–11, vừa 9–14, xa 12–18) →
  `renderer.applyViewport()` → `camera.jumpTo(player)`.
- Thêm tuỳ chọn mới: thêm khoá vào `Settings` + `DEFAULT_SETTINGS` + `parseSettings`
  + một hàng trong `menus.openSettings()`. Tăng `SETTINGS_VERSION` **chỉ khi đổi
  nghĩa** một khoá cũ.

---

## 6. Hệ đồ hoạ (`src/art/atlas.ts`)

| Lớp | Quy tắc |
|---|---|
| Nền (cỏ, lối đi, đất, nước, sàn) | KHÔNG viền, để mặt ruộng liền. 6 biến thể cỏ (2 có hoa), 4 lối đi, 2 đất khô/ướt. |
| Vật thể đứng trên đất (props, cây trồng, công trình `object`, nhân vật, icon) | `outline()` 1px màu `P.outline`. Bóng đổ mờ không bị viền (ngưỡng alpha 128). |
| Nhân vật | 4 hướng × 7 khung: 0 đứng, 1–4 đi (8 khung/giây), 5 chạm (`PLAYER_ACT_FRAME`), 6 giơ (`PLAYER_RAISE_FRAME`). Pha vung = `1 − busy/actionSeconds`; trước `actionImpact` là giơ, sau là chạm. Công cụ trong tay: `atlas.held(kind, steel)` 8×8, đặt theo hướng và pha. |
| Cây trồng | vẽ theo tham số `crops.json > art`, viền, quả chỉ khi chín. Renderer thêm sao lấp lánh (`atlas.sparkle`) lệch pha theo toạ độ. |
| Autotile ở lớp vẽ | `atlas.shore[side][frame]` cho nước giáp đất; `atlas.soilEdge[side]` cho đất cày giáp ô chưa cày; `atlas.voidOut/voidIn` ngoài biên. State không lưu gì. |
| Icon HUD | `atlas.ui(name)` 12×12: coin, day, sun, moon, energy, water, goal. |
| Con trỏ & dấu đích | `cursorOk/cursorNo` (ô ngắm) khác `navMark[3]` (đích đang đi) để phân biệt "sẽ làm ở đó" và "sẽ tới đó". |

Bảng màu `P` là chỗ duy nhất đổi tông. Màu của vật thể/cây/công trình vẫn lấy từ
content (`art.body/dark/accent`) nên OTA đổi được.

**Hiệu ứng hạt** (`render/draw.ts`): 6 loại (`dust water leaf spark stone coin`),
tất định theo chỉ số hạt, trần 240 hạt, tự tắt khi `reduceMotion`.

**Chuyển ngày**: `main.ts` giữ mốc `dayFadeAt`; renderer phủ đen 0,35s rồi mở sáng
0,9s; HUD hiện thẻ "Ngày N" + ghi chú (ngủ / ngất).

---

## 7. Menu (`src/ui/menus.ts`)

- Desktop: hộp giữa màn. Màn dọc ≤ 640px: **bottom sheet** (CSS `@media`, menu
  không biết). Có tay cầm, nút ✕ tròn 44px, footer chừa `safe-area-inset-bottom`.
- Cửa hàng: 5 tab Hạt / Thức ăn / Xây / Vật nuôi / Thợ (nhớ tab đang chọn).
- Quầy bán: stepper ± theo từng mặt hàng, "Bán tất cả · tổng".
- Chế tạo: nguyên liệu dạng chip có icon, đỏ khi thiếu.
- Tạm dừng: lưu/tải/xuất/nhập, Cài đặt, Hướng dẫn, **Cài về màn hình chính** (chỉ
  hiện khi bắt được `beforeinstallprompt`), Gỡ lỗi, Chơi mới.
- Hướng dẫn: nội dung khác nhau cho cảm ứng và bàn phím.

---

## 8. Tutorial (`src/ui/tutorial.ts`)

Chỉ chạy khi `tutorialSeen = false` **và** ván mới (save cũ = đã biết chơi). Mỗi bước
một thẻ + vòng khoanh phần tử thật (`#abtn .a`, `#hotbar`, `#minimap`). Thẻ tự đặt ở
nửa màn hình đối diện phần tử. Esc/Bỏ qua thoát; Enter/Space tiếp. Xem lại trong
Cài đặt.

---

## 9. Chốt kiểm tra trước khi merge

```bash
npm run test:all       # typecheck + 73 kịch bản sim (37 hint · 38 settings · 17 hiệu lực trễ · 39 SWAP · 40 nearestTarget · 72 tay cầm · 73 chỗ ngồi) + OTA
npm run build
```

Rồi chạy bản dev và soát bằng Chromium ở tối thiểu bốn khổ:
iPhone dọc (390×844), iPhone ngang, Android nhỏ (360×740), desktop 1280×800.
Những thứ phải đúng ở mọi khổ:

- [ ] nhân vật ở tâm, không bị HUD/toast che
- [ ] nút hành động đổi nhãn CÀY → GIEO → TƯỚI khi đổi hotbar trên cùng một ô
- [ ] giữ nút 3s trên lối đi giữa 6 ô cỏ → cả 6 ô được cày, nhân vật giơ cuốc rồi mới thấy đất lật
- [ ] hotbar 10 ô + nút balo vừa một hàng ở 360px; kéo hạt từ hotbar xuống balo và ngược lại
- [ ] chạm kép trên canvas, véo hai ngón: `visualViewport.scale` vẫn 1
- [ ] hotbar không đè lên cụm nút; ngang thì hotbar không chui dưới nút
- [ ] modal cuộn được, nút Đóng trong tầm ngón cái, không bị safe-area cắt
- [ ] tay trái lật đủ: nút, ☰, bản đồ nhỏ, joystick
- [ ] **tay cầm**: cắm vào → `data-input` đổi; LT làm nhân vật CHẠY; A chọn được
      ô balo; bấm nút trong menu không làm mất chỗ đang đứng; hộp xác nhận điều
      hướng được; rút ra → nút chạm sống lại. Dùng tay cầm GIẢ: ghi đè
      `navigator.getGamepads` bằng `page.addInitScript` là script hoá được hết.
- [ ] **tay cầm lạ** (`mapping: ""`): nút XÂY chạm vẫn hiện, cụm nút vẫn bấm được
- [ ] không có `pageerror` trong console
- [ ] `ms/khung` (logic + vẽ) dưới 10ms trên viewport điện thoại, kể cả với GPU phần mềm (đo được 7,6–9,1ms)

Cầu test `window.__PF` (bản dev) có `settings()`, `setSetting()`, `tutorial`,
`renderer`, `camera` để script hoá các bước trên.

# Trải nghiệm điện thoại & hệ đồ hoạ

Tài liệu này là **hợp đồng thiết kế** cho lớp UI/đồ hoạ: luật nào giữ, con số nào
cố định, và một thay đổi phải qua những chốt nào. Đọc trước khi sửa bất cứ thứ gì
trong `src/ui/`, `src/art/`, `src/render/`, `src/style.css`.

---

## 1. Nguyên tắc

1. **Ngón tay cái là người dùng.** Mọi thứ bấm được ≥ 44 CSS px (`--tap`). Nút hành
   động chính 72px, nút phụ 52px, ô hotbar ≥ 38px. Không có nút nào cần hai tay.
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
┌ [tiền] [ngày] [giờ] [năng lượng ▬▬] [nước] [điện] ─────── [☰] ┐  .hud-top / .stat-bar
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
| Nút E | tương tác thứ trước mặt (không theo ô ngắm) | case "interact" |
| Nhấn giữ ô hotbar (380ms) | tooltip tên + công dụng | `ui/hud.ts` |
| Chạm bản đồ nhỏ | đi thuần tuý tới ô đó | `ui/minimap.ts` |
| Chạm chip mục tiêu | thu gọn/mở | `ui/hud.ts` |

Nắn cú chạm (`snapTap`): xét 9 ô quanh điểm chạm, ưu tiên ô làm được việc, bán kính
tính bằng pixel màn hình rồi đổi ra world px — màn càng nhỏ nắn càng rộng.

Ô ngắm dính (`aimed`): giữ chừng nào còn trong tầm với; bỏ khi tự đi/đổi bản đồ.

**Phản hồi khi thao tác thành công** (suy từ diff thống kê trong `main.ts`, không
cần action riêng): âm thanh 8-bit + hạt tại ô (`renderer.burst`) + rung
(`core/haptics.ts`, chỉ Android). Thao tác hụt: tiếng "deny" + rung mẫu khác.

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
| Nhân vật | 4 hướng × 6 khung: 0 đứng, 1–4 đi (8 khung/giây), 5 thao tác (`PLAYER_ACT_FRAME`). |
| Cây trồng | vẽ theo tham số `crops.json > art`, viền, quả chỉ khi chín. Renderer thêm sao lấp lánh (`atlas.sparkle`) lệch pha theo toạ độ. |
| Autotile ở lớp vẽ | `atlas.shore[side][frame]` cho nước giáp đất; `atlas.soilEdge[side]` cho đất cày giáp ô chưa cày; `atlas.voidOut/voidIn` ngoài biên. State không lưu gì. |
| Icon HUD | `atlas.ui(name)` 12×12: coin, day, sun, moon, energy, water, power, goal. |
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
- Cửa hàng: tab Hạt giống / Công trình (nhớ tab đang chọn).
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
npm run test:all       # typecheck + 38 kịch bản sim (có 37: hint, 38: settings) + OTA
npm run build
```

Rồi chạy bản dev và soát bằng Chromium ở tối thiểu bốn khổ:
iPhone dọc (390×844), iPhone ngang, Android nhỏ (360×740), desktop 1280×800.
Những thứ phải đúng ở mọi khổ:

- [ ] nhân vật ở tâm, không bị HUD/toast che
- [ ] nút hành động đổi nhãn CÀY → GIEO → TƯỚI khi đổi hotbar trên cùng một ô
- [ ] hotbar không đè lên cụm nút; ngang thì hotbar không chui dưới nút
- [ ] modal cuộn được, nút Đóng trong tầm ngón cái, không bị safe-area cắt
- [ ] tay trái lật đủ: nút, ☰, bản đồ nhỏ, joystick
- [ ] không có `pageerror` trong console
- [ ] `ms/khung` (logic + vẽ) dưới 10ms trên viewport điện thoại, kể cả với GPU phần mềm (đo được 7,6–9,1ms)

Cầu test `window.__PF` (bản dev) có `settings()`, `setSetting()`, `tutorial`,
`renderer`, `camera` để script hoá các bước trên.

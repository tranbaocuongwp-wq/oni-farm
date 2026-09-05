/* ============================================================================
   INPUT — gom bàn phím + chuột + cảm ứng thành "ý định" mà game hiểu.

   Ở đây KHÔNG có luật chơi. Nó chỉ trả lời hai câu:
     · người chơi đang muốn đi hướng nào  (axis, vector đã chuẩn hoá)
     · người chơi vừa bấm cái gì          (hàng đợi edge)

   Bốn đường vào cùng đổ về một chỗ, nên không có nhánh logic riêng cho cảm ứng:
     bàn phím  → tập phím đang giữ  ─┐
     joystick  → vector analog      ─┼─▶ axis()
     nút ảo    → phím giả           ─┤
     tay cầm   → cần gạt + D-pad    ─┘

   Tay cầm khác ba đường kia ở một điểm: nó không phát sự kiện, phải HỎI VÒNG
   mỗi khung hình (xem `core/gamepad.ts`). Nên `poll()` phải được gọi đúng một
   lần mỗi khung, trước `axis()` và `drain()`.

   Toạ độ trỏ được trả về bằng WORLD PX, không phải pixel màn hình — phần còn
   lại của game không bao giờ phải nghĩ bằng đơn vị màn hình.
============================================================================ */

import { PAD, createGamepad, type PadInfo } from "./gamepad.ts";

export type Intent =
  | { t: "use" }
  | { t: "interact" }
  | { t: "select"; slot: number }
  | { t: "selectDelta"; d: number }
  | { t: "menu" }
  | { t: "shop" }
  | { t: "inventory" }
  | { t: "map" }
  | { t: "debug" }
  /** Bật/tắt chế độ TỰ ĐỘNG LÀM. */
  | { t: "auto" }
  /** Bấm/chạm vào thế giới — toạ độ WORLD px.
   *  `double` = cú chạm thứ hai của một lần chạm kép. Luật điều khiển:
   *  chạm MỘT lần là ĐI tới đó, chạm HAI lần mới THỰC THI (cày, gieo, dùng
   *  công cụ). Tách hai ý định ra như vậy thì trên màn nhỏ không còn chuyện
   *  định đi mà lại lỡ tay cày mất một ô. */
  | { t: "pointer"; wx: number; wy: number; double: boolean }
  /* ---- KÉO một tuyến (hàng rào, đường nhựa) ----------------------------
     Chỉ phát khi `setDrag(true)`. Cố ý phải bật thủ công chứ không phát mọi
     lúc: đường bấm-để-đi đã được chỉnh rất kỹ để không giật (xem `pointer`),
     và đổ thêm một luồng ý định vào mỗi khung hình ngón tay di chuyển là cách
     nhanh nhất để làm hỏng nó lần nữa. */
  | { t: "drag"; wx: number; wy: number }
  | { t: "dragEnd" }
  /* ---- điều hướng MENU bằng tay cầm ------------------------------------
     Menu là DOM, mà tay cầm không có con trỏ. Ba ý định này để vòng lặp chính
     tự chuyển tiêu điểm giữa các nút trong tấm sheet đang mở. */
  | { t: "navDir"; dx: number; dy: number }
  | { t: "navOk" }
  | { t: "navBack" }
  /** Mở chế độ xây dựng (tay cầm: L3). */
  | { t: "build" }
  /** Mở sơ đồ nút tay cầm (tay cầm: R3). */
  | { t: "padHelp" }
  /** Gạt hướng trên bản đồ khi KHÔNG ở trong menu — dùng để rê con trỏ ô
   *  trong chế độ xây dựng, nơi tay cầm không có chuột để trỏ. */
  | { t: "padAim"; dx: number; dy: number }
  /** Cuộn nội dung menu bằng cần phải. */
  | { t: "navScroll"; dy: number };

export interface Input {
  /** hướng đi mong muốn, độ dài <= 1 */
  axis(): { x: number; y: number };
  /** Bật/tắt luồng ý định `drag`/`dragEnd`. Chỉ bật khi đang vẽ tuyến. */
  setDrag(on: boolean): void;
  /** lấy và XOÁ hàng đợi ý định rời rạc */
  drain(): Intent[];
  /** Vị trí trỏ bằng WORLD px — chỉ trả về khi chuột VỪA cử động gần đây.
   *  Chuột đứng yên một chỗ không được cướp quyền ngắm của bàn phím: người chơi
   *  đi tiếp rồi bấm Space thì phải tác động vào ô TRƯỚC MẶT, chứ không phải ô
   *  mà con trỏ vô tình nằm lên. Trên thiết bị cảm ứng luôn là null. */
  pointer(): { x: number; y: number } | null;
  /** joystick đang được giữ — dùng để ẩn con trỏ ô cho đỡ rối */
  stickActive(): boolean;
  /** Đang muốn CHẠY: giữ Shift, hoặc đẩy joystick gần hết cỡ. Analog nên người
   *  chơi không phải học thêm nút nào — đẩy mạnh là chạy, đúng trực giác. */
  running(): boolean;
  /** Nút DÙNG (Space / nút ảo) đang được GIỮ. Vòng lặp chính dùng nó để tự
   *  chuyển sang ô kế tiếp trong tầm sau khi xong một nhát. */
  useHeld(): boolean;
  /** Đọc tay cầm cho khung hình này. Gọi ĐÚNG MỘT LẦN, trước `axis()`/`drain()`. */
  poll(nowMs: number): void;
  /** Có tay cầm đang cắm không — HUD dùng để đổi gợi ý phím. */
  padConnected(): boolean;
  /** Tay cầm nào đang cắm và nó có gì — để hiện ĐÚNG tên nút, và để biết có
   *  được phép gán các nút phụ hay không. */
  padInfo(): PadInfo;
  /** Rung tay cầm (nếu có). */
  rumble(ms: number, strong?: number): void;
  detach(): void;
}

const RUN_KEYS = new Set(["ShiftLeft", "ShiftRight"]);
const USE_KEYS = new Set(["Space", "Enter"]);

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

export interface JoystickRefs {
  /** vùng nhận chạm (thường là nửa dưới-trái màn hình) */
  zone: HTMLElement;
  /** vòng nền, di chuyển tới chỗ ngón tay đặt xuống */
  base: HTMLElement;
  /** núm, chạy theo ngón tay trong bán kính cho phép */
  knob: HTMLElement;
  /** bán kính tối đa của núm, CSS px */
  radius?: number;
}

export interface InputOptions {
  /** đổi toạ độ màn hình → WORLD px; null nếu bấm ra ngoài khung nhìn */
  toWorld(clientX: number, clientY: number): { x: number; y: number } | null;
  /** true khi đang mở modal — chặn di chuyển nhưng vẫn cho Esc */
  isModalOpen(): boolean;
  joystick?: JoystickRefs;
}

export function createInput(target: HTMLElement, opts: InputOptions): Input {
  const pad = createGamepad();
  /** Trạng thái tay cầm của khung hình HIỆN TẠI. */
  let padState = { connected: false, axis: { x: 0, y: 0 }, running: false, useHeld: false };
  const held = new Set<string>();
  const queue: Intent[] = [];
  let ptr: { x: number; y: number } | null = null;
  let ptrAt = 0;
  /** Lần chạm gần nhất, để nhận ra chạm kép. `tile` là ô THẾ GIỚI đã chạm. */
  let lastTap = { t: 0, x: -1e9, y: -1e9, tx: -1e9, ty: -1e9 };
  /** Hai cú chạm cách nhau dưới ngần này ms thì tính là chạm kép.
   *
   *  450 chứ không phải 350: chạm kép hai lần trúng một mục tiêu nhỏ trên điện
   *  thoại chậm hơn hẳn chạm kép trên chuột, và cửa sổ hẹp làm cú thứ hai rơi
   *  ra ngoài — người chơi thấy "bấm mãi không ăn" nên bấm dồn, mà mỗi cú bấm
   *  lại huỷ chuyến đi đang chạy. Safari cũng lấy ~500ms cho chạm kép. */
  const DOUBLE_MS = 450;
  /** …và phải trong khoảng này (CSS px) — ngón tay rung vài pixel là bình thường. */
  const DOUBLE_DIST = 44;
  /** Sau ngần này ms không cử động, con trỏ coi như "bỏ đó", nhường cho bàn phím. */
  const POINTER_STALE_MS = 1500;

  const push = (i: Intent) => {
    // hàng đợi có trần để một phím kẹt không làm phình bộ nhớ vô hạn
    if (queue.length < 32) queue.push(i);
  };

  /* ------------------------------------------------------------ bàn phím */
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const modal = opts.isModalOpen();

    if (e.code === "Escape") {
      push({ t: "menu" });
      e.preventDefault();
      return;
    }
    /* F2 đi qua hàng rào `modal` — vì BẢNG GỠ LỖI tự nó được tính là modal
       (`main.ts` isModalOpen), nên phím mở nó cũng là phím duy nhất đóng được
       nó, mà nếu chặn ở đây thì nó chỉ mở được chứ không tắt được. Escape cũng
       không cứu: `case "menu"` thấy không có menu nào mở nên bật menu Tạm dừng
       đè lên. Còn lại đúng một cái nút ✕ hai chục pixel. */
    if (e.code === "F2") {
      push({ t: "debug" });
      e.preventDefault();
      return;
    }
    if (modal) return;

    if (MOVE_KEYS[e.code] || RUN_KEYS.has(e.code)) {
      held.add(e.code);
      if (MOVE_KEYS[e.code]) e.preventDefault();
      return;
    }
    switch (e.code) {
      case "Space":
      case "Enter":
        held.add(e.code);
        push({ t: "use" });
        e.preventDefault();
        break;
      case "KeyE":
        push({ t: "interact" });
        break;
      case "KeyB":
        push({ t: "shop" });
        break;
      case "KeyI":
        push({ t: "inventory" });
        break;
      case "KeyM":
        push({ t: "map" });
        break;
      case "KeyF":
        push({ t: "auto" });
        break;
      case "Tab":
        push({ t: "selectDelta", d: e.shiftKey ? -1 : 1 });
        e.preventDefault();
        break;
      default: {
        // 1–9 → ô 1–9, 0 → ô 10 (hotbar cố định 10 ô)
        const m = /^Digit([0-9])$/.exec(e.code);
        if (m) push({ t: "select", slot: m[1] === "0" ? 9 : +m[1]! - 1 });
      }
    }
  };

  const onKeyUp = (e: KeyboardEvent) => held.delete(e.code);

  // Mất focus (alt-tab, mở modal) mà không xoá phím đang giữ thì nhân vật sẽ tự
  // đi mãi một hướng — lỗi kinh điển.
  const onBlur = () => held.clear();

  /* --------------------------------------------------------------- chuột */
  /** Đang bắt kéo không, và ngón/chuột nào đang giữ tuyến. */
  let dragOn = false;
  let dragId: number | null = null;

  const onMove = (e: PointerEvent) => {
    // Đang vẽ tuyến thì NGÓN TAY cũng phải được rê: cả tính năng là "ấn ở đầu
    // đoạn, rê tới cuối". Đây là ngoại lệ duy nhất của luật bên dưới.
    if (dragOn && dragId === e.pointerId) {
      const q = opts.toWorld(e.clientX, e.clientY);
      if (q) push({ t: "drag", wx: q.x, wy: q.y });
      if (e.pointerType === "touch") return;
    }
    // Ngón tay không phải con trỏ: nó không "rê" quanh màn hình để ngắm, nên
    // không cho chạm cập nhật vị trí ngắm — nếu không, ô đang nhắm sẽ dính lại
    // ở chỗ vừa chạm.
    if (e.pointerType === "touch") return;
    ptr = opts.toWorld(e.clientX, e.clientY);
    ptrAt = performance.now();
  };

  const onUp = (e: PointerEvent) => {
    if (!dragOn || dragId !== e.pointerId) return;
    dragId = null;
    push({ t: "dragEnd" });
  };

  const onDown = (e: PointerEvent) => {
    const p = opts.toWorld(e.clientX, e.clientY);
    if (!p) return;
    const now = performance.now();
    if (e.pointerType !== "touch") {
      ptr = p;
      ptrAt = now;
    }
    // Hai phép đo, chấp nhận cú nào đúng cũng được:
    //   · CÙNG MỘT Ô  — phép đo đúng nghĩa, và không phụ thuộc mức phóng. Ở
    //     scale 5 một ô rộng 80 CSS px, nên hai cú chạm vào hai góc của CÙNG ô
    //     cách nhau 113 px và ngưỡng 44 px sẽ trượt — chạm kép hỏng dù người
    //     chơi làm đúng.
    //   · KHOẢNG CÁCH — cứu trường hợp ngược lại: trên điện thoại ô chỉ rộng 32
    //     px nên ngón tay lệch một chút là rơi sang ô bên cạnh.
    const tx = Math.floor(p.x / 16);
    const ty = Math.floor(p.y / 16);
    const isDouble =
      now - lastTap.t < DOUBLE_MS &&
      ((tx === lastTap.tx && ty === lastTap.ty) ||
        Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < DOUBLE_DIST);
    // Sau một cú chạm kép thì đặt lại mốc, nếu không chạm lần thứ ba sẽ lại
    // được tính là kép và thao tác chạy hai lần liền.
    lastTap = { t: isDouble ? 0 : now, x: e.clientX, y: e.clientY, tx, ty };
    if (dragOn && dragId === null) dragId = e.pointerId;
    push({ t: "pointer", wx: p.x, wy: p.y, double: isDouble });
  };

  const onLeave = () => {
    ptr = null;
  };

  const onWheel = (e: WheelEvent) => {
    if (opts.isModalOpen()) return;
    push({ t: "selectDelta", d: e.deltaY > 0 ? 1 : -1 });
    e.preventDefault();
  };

  /* ------------------------------------------------------------ joystick */
  let stick = { x: 0, y: 0 };
  let stickId: number | null = null;
  const js = opts.joystick;
  const radius = js?.radius ?? 46;
  /** Dưới ngưỡng này coi như không đẩy — ngón tay đặt hờ không làm nhân vật trôi. */
  const STICK_DEAD = 0.24;
  /** Đẩy quá ngưỡng này thì chuyển sang chạy. */
  const STICK_RUN = 0.86;

  const stickReset = () => {
    stickId = null;
    stick = { x: 0, y: 0 };
    if (js) {
      js.base.style.opacity = "0";
      js.knob.style.transform = "translate(-50%,-50%)";
    }
  };

  const stickDown = (e: PointerEvent) => {
    if (stickId !== null || opts.isModalOpen()) return;
    stickId = e.pointerId;
    js!.zone.setPointerCapture(e.pointerId);
    // Joystick ĐỘNG: mọc ra ngay chỗ ngón tay đặt xuống, thay vì bắt người chơi
    // mò tới một vòng tròn cố định. Trên màn nhỏ đây là khác biệt lớn.
    const r = js!.zone.getBoundingClientRect();
    js!.base.style.left = `${e.clientX - r.left}px`;
    js!.base.style.top = `${e.clientY - r.top}px`;
    js!.base.style.opacity = "1";
    js!.base.dataset["ox"] = String(e.clientX);
    js!.base.dataset["oy"] = String(e.clientY);
    e.preventDefault();
  };

  const stickMove = (e: PointerEvent) => {
    if (stickId !== e.pointerId) return;
    const ox = Number(js!.base.dataset["ox"] ?? 0);
    const oy = Number(js!.base.dataset["oy"] ?? 0);
    let dx = e.clientX - ox;
    let dy = e.clientY - oy;
    const len = Math.hypot(dx, dy);
    if (len > radius) {
      dx = (dx / len) * radius;
      dy = (dy / len) * radius;
    }
    js!.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

    const nx = dx / radius;
    const ny = dy / radius;
    const mag = Math.hypot(nx, ny);
    if (mag < STICK_DEAD) {
      stick = { x: 0, y: 0 };
    } else {
      // Trải lại phần trên vùng chết ra full 0..1 để không bị "nhảy cóc" tốc độ
      // ngay khi vượt ngưỡng.
      const k = Math.min(1, (mag - STICK_DEAD) / (1 - STICK_DEAD)) / mag;
      stick = { x: nx * k, y: ny * k };
    }
    e.preventDefault();
  };

  const stickUp = (e: PointerEvent) => {
    if (stickId !== e.pointerId) return;
    stickReset();
    e.preventDefault();
  };

  /* --------------------------------------------------------------- gắn */
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerdown", onDown);
  target.addEventListener("pointerleave", onLeave);
  target.addEventListener("pointerup", onUp);
  target.addEventListener("pointercancel", onUp);
  target.addEventListener("wheel", onWheel, { passive: false });

  if (js) {
    js.zone.addEventListener("pointerdown", stickDown);
    js.zone.addEventListener("pointermove", stickMove);
    js.zone.addEventListener("pointerup", stickUp);
    js.zone.addEventListener("pointercancel", stickUp);
    stickReset();
  }

  return {
    poll(nowMs) {
      const st = pad.poll(nowMs);
      padState = {
        connected: st.connected,
        axis: st.axis,
        running: st.running,
        // Giữ A (hoặc cò phải) = giữ nút DÙNG, nên "giữ để làm tiếp ô kế bên"
        // chạy y hệt như giữ Space.
        useHeld: st.held.has(PAD.A) || st.held.has(PAD.RT),
      };
      if (!st.connected) return;

      const modal = opts.isModalOpen();

      /* Trong MENU thì tay cầm điều khiển TIÊU ĐIỂM, không điều khiển nhân vật.
         Không tách hai chế độ thì bấm A để chọn "Chơi mới" cũng đồng thời vung
         cuốc xuống ô dưới chân. */
      if (modal) {
        if (st.navDir) push({ t: "navDir", dx: st.navDir.x, dy: st.navDir.y });
        if (st.pressed.has(PAD.A)) push({ t: "navOk" });
        if (st.pressed.has(PAD.B) || st.pressed.has(PAD.START)) push({ t: "navBack" });
        // Cần phải cuộn nội dung menu — cửa hàng có bốn mươi thẻ hạt.
        if (st.aimDir?.y) push({ t: "navScroll", dy: st.aimDir.y });
        // Vai đổi TAB trong menu — main.ts hiểu `selectDelta` theo ngữ cảnh.
        if (pad.info().standard) {
          if (st.pressed.has(PAD.LB)) push({ t: "selectDelta", d: -1 });
          if (st.pressed.has(PAD.RB)) push({ t: "selectDelta", d: 1 });
        }
        return;
      }

      /* Sơ đồ nút — mọi thứ trong game phải với tới được bằng tay cầm, không có
         chức năng nào chỉ mở được bằng chuột hay ngón tay.

         Y là BALO chứ không phải cửa hàng: cửa hàng là một cái nhà, đi tới nó
         rồi bấm B là xong. Balo thì không có chỗ nào trên bản đồ để đi tới.

         ⚠️ CHỈ gán khi trình duyệt xác nhận "standard mapping". Không standard
         thì chỉ số nút là thứ tự THÔ của phần cứng và mỗi hãng một kiểu — gán
         bừa thì người chơi bấm nút phía trên lại ra mở balo, hoặc chẳng ra gì.
         Lúc đó chỉ giữ hai nút mặt đầu tiên (gần như mọi tay cầm đều xếp nút
         "xác nhận" và "huỷ" ở đó) cộng cần gạt, và nói thẳng trong sơ đồ nút. */
      const std = pad.info().standard;
      if (st.pressed.has(PAD.A) || (std && st.pressed.has(PAD.RT))) push({ t: "use" });
      if (st.pressed.has(PAD.B)) push({ t: "interact" });
      /* START đứng NGOÀI hàng rào `std`, cùng lý do với nhánh trong menu ở
         trên: nút "start/options" nằm ở chỉ số 9 trên gần như mọi tay cầm, kể
         cả loại trình duyệt không nhận ra sơ đồ. Và nếu đoán sai thì cái giá
         chỉ là mở nhầm một cái menu đóng lại được — rẻ hơn nhiều so với việc
         người chơi KHÔNG CÓ đường nào mở menu, tức là không vào được Cài đặt,
         không lưu, không thoát, và không cả tới được chế độ xây dựng. Trước
         đây Start đóng được menu (nhánh modal) mà không mở được — một chiều. */
      if (st.pressed.has(PAD.START)) push({ t: "menu" });
      if (std) {
        if (st.pressed.has(PAD.X)) push({ t: "auto" });
        if (st.pressed.has(PAD.Y)) push({ t: "inventory" });
        /* Giữ CÒ TRÁI thì vai nhảy NĂM ô một nhịp. Hotbar có mười ô mà vai chỉ
           đi từng ô: muốn tới ô tám phải bấm bảy lần, trong khi bàn phím chỉ
           cần một phím số. Năm ô là nửa hotbar — hai nhịp là tới bất cứ đâu. */
        const buoc = st.held.has(PAD.LT) ? 5 : 1;
        if (st.pressed.has(PAD.LB)) push({ t: "selectDelta", d: -buoc });
        if (st.pressed.has(PAD.RB)) push({ t: "selectDelta", d: buoc });
        if (st.pressed.has(PAD.BACK)) push({ t: "map" });
        if (st.pressed.has(PAD.L3)) push({ t: "build" });
        if (st.pressed.has(PAD.R3)) push({ t: "padHelp" });
      }
      // Rê con trỏ Ô: chỉ có nghĩa trong chế độ xây dựng, nhưng phát vô điều
      // kiện cho gọn — main.ts bỏ qua khi không cần.
      if (st.navDir) push({ t: "padAim", dx: st.navDir.x, dy: st.navDir.y });

      /* CẦN PHẢI = chọn đồ ở hotbar. Cần trái đi, cần phải chọn — hai ngón cái
         làm hai việc cùng lúc, nên vừa chạy vừa đổi công cụ mà không phải dừng
         lại. Gạt lên/xuống cũng đổi ô, để không phải nhớ chỉ có trái/phải. */
      if (st.aimDir) push({ t: "selectDelta", d: st.aimDir.x || st.aimDir.y });
    },
    padConnected: () => padState.connected,
    padInfo: () => pad.info(),
    rumble: (ms, strong) => pad.rumble(ms, strong),

    setDrag(on) {
      dragOn = on;
      if (!on) dragId = null;
    },
    axis() {
      let x = 0;
      let y = 0;
      for (const code of held) {
        const v = MOVE_KEYS[code];
        if (!v) continue;
        x += v[0];
        y += v[1];
      }
      if (x === 0 && y === 0 && (stick.x !== 0 || stick.y !== 0)) {
        x = stick.x;
        y = stick.y;
      }
      // Tay cầm là đường vào CUỐI: bàn phím và joystick cảm ứng thắng, để cắm
      // tay cầm rồi vẫn gõ WASD được mà không phải rút ra.
      if (x === 0 && y === 0 && (padState.axis.x !== 0 || padState.axis.y !== 0)) {
        x = padState.axis.x;
        y = padState.axis.y;
      }
      const len = Math.hypot(x, y);
      // chuẩn hoá để đi chéo không nhanh hơn đi thẳng
      return len > 1 ? { x: x / len, y: y / len } : { x, y };
    },
    drain() {
      if (queue.length === 0) return [];
      return queue.splice(0, queue.length);
    },
    pointer: () => (ptr && performance.now() - ptrAt < POINTER_STALE_MS ? ptr : null),
    stickActive: () => stickId !== null,
    /* Ba đường vào đều nói được câu "đang chạy", và cả ba phải được hỏi.
       Dòng này từng quên mất tay cầm trong khi `useHeld` ngay dưới thì nhớ —
       một sự bất đối xứng không ai nhìn ra khi đọc, vì nó không crash, không
       cảnh báo, chỉ làm người cầm tay cầm đi bộ suốt ván mà không hiểu vì sao.
       Tệ hơn: sơ đồ nút vẫn quảng cáo cả LT lẫn "đẩy mạnh là chạy". */
    running: () =>
      padState.running ||
      held.has("ShiftLeft") ||
      held.has("ShiftRight") ||
      Math.hypot(stick.x, stick.y) >= STICK_RUN,
    useHeld: () => padState.useHeld || [...USE_KEYS].some((k) => held.has(k)),
    detach() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerdown", onDown);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
      target.removeEventListener("pointerleave", onLeave);
      target.removeEventListener("wheel", onWheel);
      if (js) {
        js.zone.removeEventListener("pointerdown", stickDown);
        js.zone.removeEventListener("pointermove", stickMove);
        js.zone.removeEventListener("pointerup", stickUp);
        js.zone.removeEventListener("pointercancel", stickUp);
      }
      held.clear();
    },
  };
}

/** Nút bấm ảo: bơm phím giả vào cùng đường xử lý ở trên, nên không có nhánh
 *  logic riêng cho cảm ứng. */
export function bindTouchButton(el: HTMLElement, code: string) {
  const fire = (type: "keydown" | "keyup") => {
    window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  };
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.setPointerCapture(e.pointerId);
    el.classList.add("down");
    fire("keydown");
  });
  const stop = (e: PointerEvent) => {
    e.preventDefault();
    el.classList.remove("down");
    fire("keyup");
  };
  el.addEventListener("pointerup", stop);
  el.addEventListener("pointercancel", stop);
}

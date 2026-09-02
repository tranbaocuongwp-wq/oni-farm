/* ============================================================================
   INPUT — gom bàn phím + chuột + cảm ứng thành "ý định" mà game hiểu.

   Ở đây KHÔNG có luật chơi. Nó chỉ trả lời hai câu:
     · người chơi đang muốn đi hướng nào  (axis, vector đã chuẩn hoá)
     · người chơi vừa bấm cái gì          (hàng đợi edge)

   Ba đường vào cùng đổ về một chỗ, nên không có nhánh logic riêng cho cảm ứng:
     bàn phím  → tập phím đang giữ  ─┐
     joystick  → vector analog      ─┼─▶ axis()
     nút ảo    → phím giả           ─┘

   Toạ độ trỏ được trả về bằng WORLD PX, không phải pixel màn hình — phần còn
   lại của game không bao giờ phải nghĩ bằng đơn vị màn hình.
============================================================================ */

export type Intent =
  | { t: "use" }
  | { t: "interact" }
  | { t: "select"; slot: number }
  | { t: "selectDelta"; d: number }
  | { t: "menu" }
  | { t: "shop" }
  | { t: "inventory" }
  /** bấm/chạm vào thế giới — toạ độ WORLD px */
  | { t: "pointer"; wx: number; wy: number };

export interface Input {
  /** hướng đi mong muốn, độ dài <= 1 */
  axis(): { x: number; y: number };
  /** lấy và XOÁ hàng đợi ý định rời rạc */
  drain(): Intent[];
  /** Vị trí trỏ bằng WORLD px — chỉ trả về khi chuột VỪA cử động gần đây.
   *  Chuột đứng yên một chỗ không được cướp quyền ngắm của bàn phím: người chơi
   *  đi tiếp rồi bấm Space thì phải tác động vào ô TRƯỚC MẶT, chứ không phải ô
   *  mà con trỏ vô tình nằm lên. Trên thiết bị cảm ứng luôn là null. */
  pointer(): { x: number; y: number } | null;
  /** joystick đang được giữ — dùng để ẩn con trỏ ô cho đỡ rối */
  stickActive(): boolean;
  detach(): void;
}

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
  const held = new Set<string>();
  const queue: Intent[] = [];
  let ptr: { x: number; y: number } | null = null;
  let ptrAt = 0;
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
    if (modal) return;

    if (MOVE_KEYS[e.code]) {
      held.add(e.code);
      e.preventDefault();
      return;
    }
    switch (e.code) {
      case "Space":
      case "Enter":
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
      case "Tab":
        push({ t: "selectDelta", d: e.shiftKey ? -1 : 1 });
        e.preventDefault();
        break;
      default: {
        const m = /^Digit([1-9])$/.exec(e.code);
        if (m) push({ t: "select", slot: +m[1]! - 1 });
      }
    }
  };

  const onKeyUp = (e: KeyboardEvent) => held.delete(e.code);

  // Mất focus (alt-tab, mở modal) mà không xoá phím đang giữ thì nhân vật sẽ tự
  // đi mãi một hướng — lỗi kinh điển.
  const onBlur = () => held.clear();

  /* --------------------------------------------------------------- chuột */
  const onMove = (e: PointerEvent) => {
    // Ngón tay không phải con trỏ: nó không "rê" quanh màn hình để ngắm, nên
    // không cho chạm cập nhật vị trí ngắm — nếu không, ô đang nhắm sẽ dính lại
    // ở chỗ vừa chạm.
    if (e.pointerType === "touch") return;
    ptr = opts.toWorld(e.clientX, e.clientY);
    ptrAt = performance.now();
  };

  const onDown = (e: PointerEvent) => {
    const p = opts.toWorld(e.clientX, e.clientY);
    if (!p) return;
    if (e.pointerType !== "touch") {
      ptr = p;
      ptrAt = performance.now();
    }
    push({ t: "pointer", wx: p.x, wy: p.y });
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
  target.addEventListener("wheel", onWheel, { passive: false });

  if (js) {
    js.zone.addEventListener("pointerdown", stickDown);
    js.zone.addEventListener("pointermove", stickMove);
    js.zone.addEventListener("pointerup", stickUp);
    js.zone.addEventListener("pointercancel", stickUp);
    stickReset();
  }

  return {
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
    detach() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerdown", onDown);
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

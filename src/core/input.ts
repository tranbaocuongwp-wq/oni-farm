/* ============================================================================
   INPUT — gom bàn phím + chuột + cảm ứng thành "ý định" mà game hiểu.

   Ở đây KHÔNG có luật chơi. Nó chỉ trả lời hai câu:
     · người chơi đang muốn đi hướng nào  (axis)
     · người chơi vừa bấm cái gì          (hàng đợi edge)

   Tách ra như vậy để đổi cách điều khiển (thêm gamepad, đổi phím) không phải
   động vào reducer.
============================================================================ */

export type Intent =
  | { t: "use" }
  | { t: "interact" }
  | { t: "select"; slot: number }
  | { t: "selectDelta"; d: number }
  | { t: "menu" }
  | { t: "shop" }
  | { t: "inventory" }
  | { t: "pointer"; sx: number; sy: number };

export interface Input {
  /** hướng đi mong muốn, đã chuẩn hoá về độ dài <= 1 */
  axis(): { x: number; y: number };
  /** lấy và XOÁ hàng đợi ý định rời rạc */
  drain(): Intent[];
  /** Vị trí con trỏ trong toạ độ canvas nội bộ — chỉ trả về khi chuột VỪA cử
   *  động gần đây. Chuột đứng yên một chỗ không được phép cướp quyền ngắm của
   *  bàn phím: người chơi đi tiếp rồi bấm Space thì phải tác động vào ô TRƯỚC
   *  MẶT, chứ không phải ô mà con trỏ vô tình nằm lên. */
  pointer(): { x: number; y: number } | null;
  detach(): void;
}

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

export interface InputOptions {
  /** đổi toạ độ pixel màn hình sang toạ độ canvas nội bộ */
  toCanvas(clientX: number, clientY: number): { x: number; y: number } | null;
  /** true khi đang mở modal — chặn di chuyển nhưng vẫn cho Esc */
  isModalOpen(): boolean;
}

export function createInput(target: HTMLElement, opts: InputOptions): Input {
  const held = new Set<string>();
  const queue: Intent[] = [];
  let ptr: { x: number; y: number } | null = null;
  let ptrAt = 0;
  /** Sau ngần này ms không cử động, con trỏ coi như "bỏ đó" và nhường lại cho bàn phím. */
  const POINTER_STALE_MS = 1500;

  const push = (i: Intent) => {
    // hàng đợi có trần để một phím kẹt không làm phình bộ nhớ vô hạn
    if (queue.length < 32) queue.push(i);
  };

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

  const onKeyUp = (e: KeyboardEvent) => {
    held.delete(e.code);
  };

  // Mất focus (alt-tab, mở modal) mà không xoá phím đang giữ thì nhân vật
  // sẽ tự đi mãi một hướng — lỗi kinh điển.
  const onBlur = () => held.clear();

  const onMove = (e: PointerEvent) => {
    ptr = opts.toCanvas(e.clientX, e.clientY);
    ptrAt = performance.now();
  };

  const onDown = (e: PointerEvent) => {
    const p = opts.toCanvas(e.clientX, e.clientY);
    if (!p) return;
    ptr = p;
    ptrAt = performance.now();
    push({ t: "pointer", sx: p.x, sy: p.y });
  };

  const onLeave = () => {
    ptr = null;
  };

  const onWheel = (e: WheelEvent) => {
    if (opts.isModalOpen()) return;
    push({ t: "selectDelta", d: e.deltaY > 0 ? 1 : -1 });
    e.preventDefault();
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerdown", onDown);
  target.addEventListener("pointerleave", onLeave);
  target.addEventListener("wheel", onWheel, { passive: false });

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
      const len = Math.hypot(x, y);
      // chuẩn hoá để đi chéo không nhanh hơn đi thẳng
      return len > 1 ? { x: x / len, y: y / len } : { x, y };
    },
    drain() {
      if (queue.length === 0) return [];
      return queue.splice(0, queue.length);
    },
    pointer: () => (ptr && performance.now() - ptrAt < POINTER_STALE_MS ? ptr : null),
    detach() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerdown", onDown);
      target.removeEventListener("pointerleave", onLeave);
      target.removeEventListener("wheel", onWheel);
      held.clear();
    },
  };
}

/** Nút bấm ảo cho điện thoại: bơm phím giả vào cùng đường xử lý ở trên,
 *  nên không có nhánh logic riêng cho cảm ứng. */
export function bindTouchButton(el: HTMLElement, code: string) {
  const fire = (type: "keydown" | "keyup") => {
    window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  };
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    fire("keydown");
  });
  const stop = (e: PointerEvent) => {
    e.preventDefault();
    fire("keyup");
  };
  el.addEventListener("pointerup", stop);
  el.addEventListener("pointercancel", stop);
}

/* Toast — hiển thị `state.log` rồi báo cho store biết đã hiện xong.

   Reducer chỉ đẩy thông điệp vào state; nó không biết gì về DOM. UI đọc, vẽ,
   rồi dispatch LOG_SEEN để dọn. Nhờ vậy thông điệp cũng nằm trong save/replay
   như mọi thứ khác, và test kiểm được "action này có báo đúng câu không".

   Trên màn nhỏ, toast là thứ dễ thành rác nhất: bấm nhầm ba lần là ba dòng
   "Không cày được" chồng lên nhau che mất ruộng. Nên:
     · cùng một câu lặp lại trong lúc dòng cũ còn hiện → gộp thành "×2, ×3"
     · tối đa 2 dòng, dòng cũ nhất bị đẩy ra
     · toast "bad" ngắn hơn toast "good": lỗi thì người chơi đã biết ngay,
       còn "Đã nhận 3 gỗ" thì cần thời gian đọc
     · toast "info" bỏ luôn ô icon — nó không mang thông tin gì, chỉ chiếm chỗ */

import type { LogEntry } from "../game/types.ts";

export interface Toasts {
  show(entries: readonly LogEntry[]): number;
  /** thông báo tự phát từ UI (không đi qua state), ví dụ kết quả lưu game */
  say(text: string, kind?: LogEntry["kind"]): void;
}

const ICON: Record<LogEntry["kind"], string> = { info: "", good: "✓", bad: "!" };

export function createToasts(root: HTMLElement): Toasts {
  interface Live {
    el: HTMLElement;
    text: string;
    count: number;
    timer: number;
  }
  const live: Live[] = [];

  const retire = (t: Live) => {
    const i = live.indexOf(t);
    if (i >= 0) live.splice(i, 1);
    t.el.classList.add("fade");
    window.setTimeout(() => t.el.remove(), 260);
  };

  const push = (text: string, kind: LogEntry["kind"]) => {
    const ttl = kind === "bad" ? 1400 : kind === "good" ? 2000 : 1700;

    // Gộp câu trùng: bấm nhầm liên tục không được biến thành một cột toast.
    const dup = live.find((t) => t.text === text);
    if (dup) {
      dup.count++;
      clearTimeout(dup.timer);
      dup.timer = window.setTimeout(() => retire(dup), ttl);
      const n = dup.el.querySelector<HTMLElement>(".n");
      if (n) n.textContent = `×${dup.count}`;
      dup.el.classList.remove("bump");
      void dup.el.offsetWidth; // khởi động lại animation
      dup.el.classList.add("bump");
      return;
    }

    const el = document.createElement("div");
    el.className = `toast ${kind}`;
    const ico = document.createElement("span");
    ico.className = "ico";
    ico.textContent = ICON[kind];
    const body = document.createElement("span");
    body.className = "t";
    body.textContent = text;
    const n = document.createElement("span");
    n.className = "n";
    el.append(ico, body, n);
    root.appendChild(el);

    const t: Live = { el, text, count: 1, timer: window.setTimeout(() => retire(t), ttl) };
    live.push(t);
    while (live.length > 2) {
      const old = live[0]!;
      clearTimeout(old.timer);
      retire(old);
    }
  };

  return {
    show(entries) {
      let last = 0;
      for (const e of entries) {
        push(e.text, e.kind);
        last = Math.max(last, e.id);
      }
      return last;
    },
    say: (text, kind = "info") => push(text, kind),
  };
}

/* Toast — hiển thị `state.log` rồi báo cho store biết đã hiện xong.

   Reducer chỉ đẩy thông điệp vào state; nó không biết gì về DOM. UI đọc, vẽ,
   rồi dispatch LOG_SEEN để dọn. Nhờ vậy thông điệp cũng nằm trong save/replay
   như mọi thứ khác, và test kiểm được "action này có báo đúng câu không". */

import type { LogEntry } from "../game/types.ts";

export interface Toasts {
  show(entries: readonly LogEntry[]): number;
  /** thông báo tự phát từ UI (không đi qua state), ví dụ kết quả lưu game */
  say(text: string, kind?: LogEntry["kind"]): void;
}

export function createToasts(root: HTMLElement): Toasts {
  const push = (text: string, kind: LogEntry["kind"]) => {
    const el = document.createElement("div");
    el.className = `toast ${kind}`;
    el.textContent = text;
    root.appendChild(el);
    // giữ tối đa 5 dòng để không che hết màn hình
    while (root.childElementCount > 5) root.firstElementChild?.remove();
    setTimeout(() => el.classList.add("fade"), 2600);
    setTimeout(() => el.remove(), 3100);
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

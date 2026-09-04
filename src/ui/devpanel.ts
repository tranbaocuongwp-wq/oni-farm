/* ============================================================================
   DEVPANEL — bảng gỡ lỗi NỔI, không chặn game.

   Trước đây bảng gỡ lỗi là một MODAL: nó dừng thế giới lại, và sau mỗi lệnh lại
   phải vẽ lại chính nó, nên muốn chạy ba lệnh là ba lần mở–đóng. Thử một thay
   đổi cân bằng (thêm tiền → sang ngày → xem cây lớn chưa) mất nhiều thao tác mở
   đóng hơn là thao tác thật.

   Bảng này thì nằm đè lên góc trên, luôn hiện, và KHÔNG được tính vào biến
   `modal` của main.ts — đó chính là điểm mấu chốt: game vẫn chạy, thời gian vẫn
   trôi, nhân vật vẫn đi được trong lúc bảng mở. Bấm một lệnh rồi nhìn thẳng vào
   thế giới thấy ngay kết quả.

   Hai chi tiết dễ sai:
   · `pointer-events` chỉ bật trên chính hộp bảng, không bật trên lớp phủ —
     nếu không thì cả nửa màn hình trên không chạm-để-đi được nữa.
   · Bảng tự nuốt sự kiện `pointerdown` của mình. Không có nó thì mỗi lần bấm
     một chip lại kèm theo một cú "chạm vào thế giới" xuyên qua, và nhân vật
     lững thững đi về phía góc màn hình.
============================================================================ */

import type { Content, DebugOp, GameState } from "../game/types.ts";
import { CORE_VERSION } from "../core/version.ts";
import { currentSeason, dayOfSeason } from "../game/season.ts";

export interface DevPanel {
  toggle(): void;
  open(): void;
  close(): void;
  isOpen(): boolean;
  /** gọi mỗi khung hình; tự bỏ qua khi đóng hoặc khi không có gì đổi */
  update(s: GameState, content: Content): void;
}

export interface DevHandlers {
  debug(op: DebugOp, n?: number): void;
}

/** Nhóm lệnh — gom theo việc người ta thật sự làm khi thử, không theo thứ tự
 *  chúng tình cờ được viết ra. */
const GROUPS: { title: string; items: [label: string, op: DebugOp, n?: number][] }[] = [
  {
    title: "Tài nguyên",
    items: [
      ["+1k đ", "money", 1000],
      ["Năng lượng", "energy"],
      ["Nước", "water"],
      ["Vật liệu", "materials"],
      ["Mở khoá", "unlockAll"],
    ],
  },
  {
    title: "Thời gian",
    items: [
      ["Sang ngày", "skipDay"],
      ["Thời tiết", "weather"],
    ],
  },
  {
    title: "Ruộng",
    items: [
      ["Chín hết", "growAll"],
      ["Thu tất cả", "harvestAll"],
      ["Cày + gieo", "plantAround"],
      ["Rắc cỏ", "addGrass"],
      ["Rắc cây", "addTrees"],
      ["Gây bệnh", "sickAround"],
    ],
  },
];

export function createDevPanel(host: HTMLElement, h: DevHandlers): DevPanel {
  let open = false;
  /** chữ của dòng số liệu lần vẽ trước — chỉ ghi DOM khi thật sự đổi */
  let lastStat = "";

  host.innerHTML = `
    <div class="dev-head">
      <b>Gỡ lỗi</b>
      <button type="button" class="dev-x" aria-label="Đóng bảng gỡ lỗi">×</button>
    </div>
    <div class="dev-body"></div>
    <div class="dev-stat mono"></div>`;

  const body = host.querySelector<HTMLElement>(".dev-body")!;
  const stat = host.querySelector<HTMLElement>(".dev-stat")!;

  for (const g of GROUPS) {
    const lab = document.createElement("div");
    lab.className = "dev-group";
    lab.textContent = g.title;
    body.appendChild(lab);

    const grid = document.createElement("div");
    grid.className = "dev-grid";
    for (const [label, op, n] of g.items) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "dev-btn";
      b.textContent = label;
      b.addEventListener("click", () => h.debug(op, n));
      grid.appendChild(b);
    }
    body.appendChild(grid);
  }

  const api: DevPanel = {
    toggle: () => api[open ? "close" : "open"](),
    open() {
      open = true;
      host.hidden = false;
      lastStat = "";
    },
    close() {
      open = false;
      host.hidden = true;
    },
    isOpen: () => open,
    update(s, content) {
      if (!open) return;
      const sea = currentSeason(s, content);
      const when = sea ? `${sea.name} ${dayOfSeason(s.day, content)}` : `ngày ${s.day}`;
      const line =
        `${when} · ${Math.floor(s.minutes / 60)}:${String(Math.floor(s.minutes) % 60).padStart(2, "0")}` +
        ` · ${s.money}đ · nl ${Math.round(s.energy)} · nước ${Math.round(s.water)}` +
        ` · ${s.mapId} ${Math.floor(s.player.x / 16)},${Math.floor(s.player.y / 16)}` +
        ` · c${content.contentVersion}/k${CORE_VERSION}`;
      if (line === lastStat) return;
      lastStat = line;
      stat.textContent = line;
    },
  };

  host.querySelector<HTMLElement>(".dev-x")!.addEventListener("click", () => api.close());

  // Nuốt mọi cú chạm rơi vào bảng: không để nó xuyên xuống thành "chạm vào thế
  // giới" rồi nhân vật lững thững đi về phía góc màn hình.
  for (const ev of ["pointerdown", "pointerup", "click"] as const)
    host.addEventListener(ev, (e) => e.stopPropagation());

  api.close();
  return api;
}

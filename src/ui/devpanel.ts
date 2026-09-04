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
      ["+3 giờ", "skipHours", 3],
      ["Sang mùa", "nextSeason"],
      ["Thời tiết", "weather"],
    ],
  },
  {
    title: "Ruộng · quanh đây",
    items: [
      ["Cày + gieo", "plantAround"],
      ["Rắc cỏ", "addGrass"],
      ["Rắc cây", "addTrees"],
      ["Gây bệnh", "sickAround"],
    ],
  },
  {
    title: "Ruộng · CẢ BẢN ĐỒ",
    items: [
      ["Cày hết", "tillMap"],
      ["Gieo hết", "plantMap"],
      ["Tưới hết", "waterMap"],
      ["Chín hết", "growAll"],
      ["Thu tất cả", "harvestAll"],
      ["Dọn cỏ", "clearMap"],
    ],
  },
  {
    title: "Thực thể",
    items: [
      ["+ Vật nuôi", "spawnAnimal"],
      ["+ Sâu bọ", "spawnPest"],
      ["+ Người làm", "spawnWorker"],
      ["Xe thu mua", "callBuyer"],
      ["Dọn sạch", "clearEntities"],
    ],
  },
];

export function createDevPanel(host: HTMLElement, h: DevHandlers): DevPanel {
  let open = false;
  /** chữ của dòng số liệu lần vẽ trước — chỉ ghi DOM khi thật sự đổi */
  let lastStat = "";

  /* Thu gọn còn đúng thanh tiêu đề + dòng số liệu. Bảng có năm nhóm lệnh nên
     nó cao; mà phần lớn thời gian thử nghiệm là NHÌN thế giới chứ không bấm.
     Thu gọn giữ được dòng số liệu (thứ đáng nhìn liên tục) mà trả lại màn hình. */
  let mini = false;

  host.innerHTML = `
    <div class="dev-head">
      <b>Gỡ lỗi</b>
      <button type="button" class="dev-min" aria-label="Thu gọn bảng gỡ lỗi">–</button>
      <button type="button" class="dev-x" aria-label="Đóng bảng gỡ lỗi">×</button>
    </div>
    <div class="dev-body"></div>
    <div class="dev-stat mono"></div>`;

  const body = host.querySelector<HTMLElement>(".dev-body")!;
  const stat = host.querySelector<HTMLElement>(".dev-stat")!;

  for (const g of GROUPS) {
    const lab = document.createElement("div");
    lab.className = `dev-group${g.title.includes("BẢN ĐỒ") ? " wide" : ""}`;
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

  /* ---- KÉO ĐỂ DỜI CHỖ ---------------------------------------------------
     Bảng cắm cứng ở góc phải-trên, mà đúng cái đang cần soi thường nằm ngay
     dưới nó — và ô mình vừa cày thì không nhìn thấy. Kéo thanh tiêu đề để dời
     đi chỗ khác.

     Vị trí lưu ở `localStorage` chứ không ở settings: đây là thói quen của
     người ĐANG GỠ LỖI trên đúng cái máy này, không phải một tuỳ chọn của game,
     và nó không đáng để leo vào đường settings có phiên bản + migrate. */
  const POS_KEY = "oni-farm:devpanel-pos";

  const datViTri = (x: number, y: number) => {
    const w = host.offsetWidth || 220;
    const h2 = host.offsetHeight || 200;
    // Kẹp trong màn hình, chừa lại ít nhất một mẩu để còn kéo ngược ra được.
    const cx = Math.max(4, Math.min(window.innerWidth - w - 4, x));
    const cy = Math.max(4, Math.min(window.innerHeight - Math.min(h2, 80) - 4, y));
    host.style.left = `${cx}px`;
    host.style.top = `${cy}px`;
    host.style.right = "auto";
  };

  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) {
      const v = JSON.parse(raw) as { x: number; y: number };
      if (Number.isFinite(v?.x) && Number.isFinite(v?.y)) datViTri(v.x, v.y);
    }
  } catch {
    /* localStorage bị chặn / dữ liệu hỏng — cứ để bảng ở chỗ mặc định */
  }

  {
    const head = host.querySelector<HTMLElement>(".dev-head")!;
    let keo: { id: number; dx: number; dy: number } | null = null;

    head.addEventListener("pointerdown", (e) => {
      // Bấm vào nút × hay nút thu gọn thì KHÔNG phải là kéo.
      if ((e.target as HTMLElement).closest("button")) return;
      const r = host.getBoundingClientRect();
      keo = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top };
      head.setPointerCapture(e.pointerId);
      host.classList.add("dragging");
      e.preventDefault();
    });

    head.addEventListener("pointermove", (e) => {
      if (!keo || keo.id !== e.pointerId) return;
      datViTri(e.clientX - keo.dx, e.clientY - keo.dy);
    });

    const thaTay = (e: PointerEvent) => {
      if (!keo || keo.id !== e.pointerId) return;
      keo = null;
      host.classList.remove("dragging");
      try {
        const r = host.getBoundingClientRect();
        localStorage.setItem(POS_KEY, JSON.stringify({ x: r.left, y: r.top }));
      } catch {
        /* không lưu được thì thôi — lần sau về chỗ mặc định */
      }
    };
    head.addEventListener("pointerup", thaTay);
    head.addEventListener("pointercancel", thaTay);
  }

  host.querySelector<HTMLElement>(".dev-x")!.addEventListener("click", () => api.close());
  const minBtn = host.querySelector<HTMLButtonElement>(".dev-min")!;
  minBtn.addEventListener("click", () => {
    mini = !mini;
    host.classList.toggle("mini", mini);
    minBtn.textContent = mini ? "+" : "–";
    minBtn.setAttribute("aria-label", mini ? "Mở rộng bảng gỡ lỗi" : "Thu gọn bảng gỡ lỗi");
  });

  // Nuốt mọi cú chạm rơi vào bảng: không để nó xuyên xuống thành "chạm vào thế
  // giới" rồi nhân vật lững thững đi về phía góc màn hình.
  for (const ev of ["pointerdown", "pointerup", "click"] as const)
    host.addEventListener(ev, (e) => e.stopPropagation());

  api.close();
  return api;
}

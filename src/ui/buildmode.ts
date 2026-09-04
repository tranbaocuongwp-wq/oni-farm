/* ============================================================================
   BUILDMODE — chế độ XÂY DỰNG: thời gian đứng yên, kéo thả địa hình.

   Vì sao cần một chế độ riêng thay vì cứ đặt từng ô như cũ:

   Đặt từng ô là thao tác của việc SỬA — thêm một cái vòi tưới vào chỗ còn
   thiếu. Nhưng dựng hàng rào quanh chuồng, kéo một con đường ra kho, lát sân
   trước nhà là việc QUY HOẠCH: nó nghĩ theo đoạn và theo mảng, không theo ô.
   Làm việc quy hoạch bằng công cụ sửa thì địa hình ra lởm chởm — đúng thứ
   Cường mô tả là "rối địa hình" — vì mỗi ô là một lần ước lượng lại bằng mắt,
   và ước lượng bằng mắt hai mươi lần thì không lần nào giống lần nào.

   Ba điều làm chế độ này khác hẳn:

   · THỜI GIAN ĐỨNG YÊN. Không phải để dễ hơn, mà vì quy hoạch là lúc người ta
     ngồi nhìn và nghĩ. Đồng hồ chạy trong lúc đó biến việc nghĩ thành việc mất
     mát, và người chơi sẽ vội — mà vội là ra đúng cái địa hình lởm chởm kia.
   · KÉO THÀNH ĐOẠN. Ấn ở đầu, rê tới cuối, nhả tay. Đường đi theo hình chữ L
     nên đoạn nào cũng thẳng, kể cả khi tay rê chéo.
   · XÂY ĐƯỢC XA. Bỏ kiểm tầm với. Vật liệu và năng lượng vẫn trừ đủ, nên nó
     không phải là cách qua mặt cân bằng — chỉ là không bắt người chơi lê từng
     bước tới sát mỗi ô rào.

   Bảng chọn chỉ bày thứ ĐANG CÓ TRONG TÚI. Bày cả những thứ chưa mua thì đây
   thành cửa hàng thứ hai, mà cửa hàng đã có một cái rồi.
============================================================================ */

import type { Content, GameState } from "../game/types.ts";
import type { Atlas } from "../art/atlas.ts";

export interface BuildMode {
  isOpen(): boolean;
  open(): void;
  close(): void;
  toggle(): void;
  /** Gọi mỗi khung hình khi đang mở — vẽ lại bảng chọn nếu túi đổi. */
  update(s: GameState, content: Content): void;
}

export interface BuildHandlers {
  /** Chọn ô hotbar này (chính là cách "cầm" công trình lên). */
  select(slot: number): void;
}

export function createBuildMode(
  host: HTMLElement,
  atlas: Atlas,
  h: BuildHandlers,
): BuildMode {
  let open = false;
  /** Dấu vân tay của bảng chọn lần vẽ trước — chỉ dựng lại DOM khi thật sự đổi. */
  let last = "";

  host.innerHTML = `
    <div class="bm-bar">
      <b>Chế độ xây dựng</b>
      <span class="bm-note">thời gian đang dừng · ấn rồi rê để kéo một đoạn</span>
      <button type="button" class="bm-x">Xong</button>
    </div>
    <div class="bm-pal" role="listbox" aria-label="Chọn thứ để xây"></div>`;

  const pal = host.querySelector<HTMLElement>(".bm-pal")!;

  const api: BuildMode = {
    isOpen: () => open,
    open() {
      open = true;
      host.hidden = false;
      last = "";
    },
    close() {
      open = false;
      host.hidden = true;
    },
    toggle: () => api[open ? "close" : "open"](),

    update(s, content) {
      if (!open) return;
      /* Chỉ những ô HOTBAR đang cầm được công trình. Cố ý không quét cả balo:
         "cầm lên" trong game này = chọn một ô hotbar, nên thứ không ở hotbar
         thì không cầm được, và bày nó ra chỉ để bấm vào không có gì xảy ra. */
      const slots = Math.max(0, content.balance.hotbarSlots | 0);
      const items: { slot: number; id: string; n: number; def: Content["buildings"][string] }[] = [];
      for (let i = 0; i < slots; i++) {
        const v = s.inv[i];
        if (!v?.id.startsWith("build:")) continue;
        const def = content.buildings[v.id.slice(6)];
        if (def) items.push({ slot: i, id: v.id.slice(6), n: v.n, def });
      }

      const key = items.map((it) => `${it.slot}:${it.id}:${it.n}`).join("|") + `#${s.sel}`;
      if (key === last) return;
      last = key;

      pal.innerHTML = "";
      if (!items.length) {
        const p = document.createElement("div");
        p.className = "bm-empty";
        p.textContent = "Chưa có gì để xây — mua ở cửa hàng rồi để vào hotbar.";
        pal.appendChild(p);
        return;
      }

      for (const it of items) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = `bm-item${s.sel === it.slot ? " on" : ""}`;
        b.setAttribute("role", "option");
        b.setAttribute("aria-selected", String(s.sel === it.slot));

        const src = atlas.buildings[it.id];
        if (src) {
          const c = document.createElement("canvas");
          c.width = src.width;
          c.height = src.height;
          c.getContext("2d")!.drawImage(src, 0, 0);
          c.className = "icon";
          b.appendChild(c);
        }
        const nm = document.createElement("span");
        nm.className = "nm";
        nm.textContent = it.def.name;
        const n = document.createElement("span");
        n.className = "n";
        n.textContent = String(it.n);
        b.append(nm, n);
        b.addEventListener("click", () => h.select(it.slot));
        pal.appendChild(b);
      }
    },
  };

  host.querySelector<HTMLElement>(".bm-x")!.addEventListener("click", () => api.close());

  // Nuốt cú chạm của chính bảng: không để nó rơi xuống bản đồ thành một đoạn
  // hàng rào dựng ngay dưới ngón tay vừa bấm nút "Xong".
  for (const ev of ["pointerdown", "pointerup", "click"] as const)
    host.addEventListener(ev, (e) => e.stopPropagation());

  api.close();
  return api;
}

/* ============================================================================
   BUILDMODE — chế độ XÂY DỰNG: thời gian đứng yên, kéo thả địa hình.

   Vì sao cần một chế độ riêng thay vì cứ đặt từng ô như cũ:

   Đặt từng ô là thao tác của việc SỬA — thêm một cái vòi tưới vào chỗ còn
   thiếu. Nhưng kéo một con đường ra kho, lát sân trước nhà, trải một vạt sàn
   nhà kính là việc QUY HOẠCH: nó nghĩ theo đoạn và theo mảng, không theo ô.
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

   VẼ BAO NHIÊU TÍNH TIỀN BẤY NHIÊU. Bảng chọn bày mọi công trình đã mở khoá;
   có sẵn trong balo thì dùng trước, hết thì trừ tiền ngay theo đơn giá mỗi ô.
   Bắt mua trước rồi mới được vẽ nghĩa là bắt người chơi đoán "cần bao nhiêu ô
   rào" — và đoán sai con số đó chính là lý do người ta ngại vẽ dài.
============================================================================ */

import type { Content, GameState } from "../game/types.ts";
import type { Atlas } from "../art/atlas.ts";

export interface BuildMode {
  /** Công trình đang chọn để vẽ, hoặc null. */
  picked(): string | null;
  isOpen(): boolean;
  open(): void;
  close(): void;
  toggle(): void;
  /** Gọi mỗi khung hình khi đang mở — vẽ lại bảng chọn nếu túi đổi. */
  update(s: GameState, content: Content): void;
}

export interface BuildHandlers {
  /** Người chơi đổi sang công trình này. */
  select(id: string): void;
}

export function createBuildMode(
  host: HTMLElement,
  atlas: Atlas,
  h: BuildHandlers,
): BuildMode {
  let open = false;
  /** Công trình đang chọn. Sống ở ĐÂY chứ không phải ở `state.sel`: từ khi tiền
   *  trả theo số ô vẽ thì không cần "cầm" nó trên hotbar nữa, và bắt nó chiếm
   *  một ô hotbar chỉ để chọn là làm hỏng hotbar của người chơi. */
  let sel: string | null = null;
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
    picked: () => sel,
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
      /* Bày MỌI công trình đã mở khoá, không chỉ thứ đang có trong túi.
         Vì tiền trả theo SỐ Ô VẼ: có sẵn trong balo thì dùng trước, hết thì
         mua ngay tại chỗ. Nên bắt người chơi phải mua trước rồi mới thấy nó
         trong bảng là bắt họ đoán "cần bao nhiêu ô rào" — mà đoán sai con số
         đó chính là lý do người ta ngại vẽ dài. */
      const items: { id: string; n: number; def: Content["buildings"][string] }[] = [];
      for (const id of content.buildingOrder) {
        const def = content.buildings[id];
        if (!def || def.buildable === false) continue;
        let n = 0;
        for (const v of s.inv) if (v?.id === `build:${id}`) n += v.n;
        items.push({ id, n, def });
      }

      const key = items.map((it) => `${it.id}:${it.n}`).join("|") + `#${sel}#${s.money}`;
      if (key === last) return;
      last = key;

      pal.innerHTML = "";
      if (!items.length) {
        const p = document.createElement("div");
        p.className = "bm-empty";
        p.textContent = "Chưa mở khoá công trình nào — chơi tiếp để mở.";
        pal.appendChild(p);
        return;
      }
      if (sel && !items.some((it) => it.id === sel)) sel = null;
      if (!sel) sel = items[0]!.id;

      for (const it of items) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = `bm-item${sel === it.id ? " on" : ""}`;
        b.setAttribute("role", "option");
        b.setAttribute("aria-selected", String(sel === it.id));

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
        const pr = document.createElement("span");
        pr.className = "pr";
        // Có sẵn trong balo thì nói rõ là dùng đồ có sẵn, không trừ tiền.
        pr.textContent = it.n > 0 ? `có ${it.n}` : `${it.def.price}đ/ô`;
        b.append(nm, pr);
        b.addEventListener("click", () => {
          sel = it.id;
          last = "";
          h.select(it.id);
        });
        pal.appendChild(b);
      }
    },
  };

  host.querySelector<HTMLElement>(".bm-x")!.addEventListener("click", () => api.close());

  // Nuốt cú chạm của chính bảng: không để nó rơi xuống bản đồ thành một đoạn
  // đường nhựa lát ngay dưới ngón tay vừa bấm nút "Xong".
  for (const ev of ["pointerdown", "pointerup", "click"] as const)
    host.addEventListener(ev, (e) => e.stopPropagation());

  api.close();
  return api;
}

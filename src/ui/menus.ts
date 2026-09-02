/* ============================================================================
   MENU — cửa hàng, quầy thu mua, tạm dừng, hướng dẫn.

   Modal là DOM chứ không vẽ lên canvas: chữ sắc nét, cuộn được, dùng được bàn
   phím, và thêm một mục mới chỉ là thêm một hàng HTML.

   Menu KHÔNG tự sửa state. Nó gọi callback, callback dispatch action, rồi menu
   vẽ lại từ state mới. Một chiều duy nhất, nên không có chuyện UI và state lệch nhau.
============================================================================ */

import type { Content, GameState } from "../game/types.ts";
import type { Atlas } from "../art/atlas.ts";
import { CORE_VERSION } from "../core/version.ts";

export interface MenuHandlers {
  buy(id: string, n: number): void;
  sell(id: string, n: number): void;
  sellAll(): void;
  save(): void;
  load(): void;
  exportSave(): void;
  importSave(): void;
  newGame(): void;
  toggleMute(): boolean;
  isMuted(): boolean;
  revertContent(): void;
  contentInfo(): { version: string; source: string; pending: string | null };
}

export interface Menus {
  isOpen(): boolean;
  close(): void;
  openShop(): void;
  openSell(): void;
  openPause(): void;
  openHelp(): void;
  /** vẽ lại modal đang mở sau khi state đổi (mua xong, bán xong) */
  refresh(): void;
}

const money = (n: number) => `${n.toLocaleString("vi-VN")}đ`;

export function createMenus(
  root: HTMLElement,
  atlas: Atlas,
  getState: () => GameState,
  getContent: () => Content,
  h: MenuHandlers,
): Menus {
  let current: (() => void) | null = null;

  const close = () => {
    current = null;
    root.classList.remove("open");
    root.innerHTML = "";
  };

  // bấm ra ngoài để đóng — nhưng không đóng khi bấm bên trong modal
  root.addEventListener("pointerdown", (e) => {
    if (e.target === root) close();
  });

  function icon(id: string): HTMLElement {
    const src = atlas.icon(id);
    const c = document.createElement("canvas");
    c.width = src?.width ?? 16;
    c.height = src?.height ?? 16;
    if (src) c.getContext("2d")!.drawImage(src, 0, 0);
    return c;
  }

  interface Shell {
    body: HTMLElement;
    foot: HTMLElement;
  }

  function shell(title: string, sub: string): Shell {
    root.innerHTML = "";
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML = `
      <header>
        <div><h2></h2><div class="sub"></div></div>
        <button data-x>Đóng <kbd>Esc</kbd></button>
      </header>
      <div class="body"></div>
      <footer></footer>`;
    (modal.querySelector("h2") as HTMLElement).textContent = title;
    (modal.querySelector(".sub") as HTMLElement).textContent = sub;
    modal.querySelector("[data-x]")!.addEventListener("click", close);
    root.appendChild(modal);
    root.classList.add("open");
    return {
      body: modal.querySelector(".body") as HTMLElement,
      foot: modal.querySelector("footer") as HTMLElement,
    };
  }

  function row(opts: {
    id: string;
    name: string;
    desc: string;
    price: string;
    locked?: boolean;
    action?: { label: string; disabled: boolean; onClick: () => void };
  }): HTMLElement {
    const el = document.createElement("div");
    el.className = `row${opts.locked ? " locked" : ""}`;
    el.appendChild(icon(opts.id));
    const info = document.createElement("div");
    info.className = "info";
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = opts.name;
    const desc = document.createElement("div");
    desc.className = "desc";
    desc.textContent = opts.desc;
    info.append(name, desc);
    el.appendChild(info);
    const price = document.createElement("div");
    price.className = "price";
    price.textContent = opts.price;
    el.appendChild(price);
    if (opts.action) {
      const b = document.createElement("button");
      b.className = "primary";
      b.textContent = opts.action.label;
      b.disabled = opts.action.disabled;
      b.addEventListener("click", opts.action.onClick);
      el.appendChild(b);
    }
    return el;
  }

  /* ------------------------------------------------------------ CỬA HÀNG */
  function openShop() {
    current = openShop;
    const s = getState();
    const c = getContent();
    const { body, foot } = shell(
      c.strings.ui["shop"] ?? "Cửa hàng",
      `Bạn có ${money(s.money)} · hàng khoá sẽ mở theo tiến trình nông trại`,
    );

    const mk = (id: string, name: string, desc: string, price: number) => {
      const unlocked = s.unlocked.includes(id);
      const itemId = id.startsWith("seed:") ? id : `build:${id}`;
      body.appendChild(
        row({
          id: itemId,
          name,
          desc: unlocked ? desc : "Chưa mở khoá — chơi tiếp để mở",
          price: money(price),
          locked: !unlocked,
          action: {
            label: "Mua",
            disabled: !unlocked || s.money < price,
            onClick: () => {
              h.buy(id, 1);
              openShop();
            },
          },
        }),
      );
    };

    const head = (t: string) => {
      const d = document.createElement("div");
      d.style.cssText = "color:var(--ink-dim);font-size:11px;margin-top:6px";
      d.textContent = t;
      body.appendChild(d);
    };

    head("HẠT GIỐNG");
    for (const id of c.cropOrder) {
      const crop = c.crops[id]!;
      const days = crop.growthDays.reduce((a, b) => a + b, 0);
      const regrow = crop.regrowDays ? `, mọc lại ${crop.regrowDays} ngày` : "";
      mk(`seed:${id}`, crop.seedName, `${days} ngày · bán ${money(crop.sellPrice)}${regrow}`, crop.seedPrice);
    }

    head("CÔNG TRÌNH HIỆN ĐẠI");
    for (const id of c.buildingOrder) {
      const b = c.buildings[id]!;
      mk(id, b.name, b.desc, b.price);
    }

    const hint = document.createElement("div");
    hint.className = "sub";
    hint.textContent = "Mua xong chọn ở hotbar rồi bấm Space để đặt xuống ruộng.";
    foot.appendChild(hint);
  }

  /* --------------------------------------------------------- QUẦY THU MUA */
  function openSell() {
    current = openSell;
    const s = getState();
    const c = getContent();

    const stock = s.inv
      .map((slot, i) => ({ slot, i }))
      .filter((x) => x.slot?.id.startsWith("crop:")) as {
      slot: { id: string; n: number };
      i: number;
    }[];

    const total = stock.reduce(
      (sum, x) => sum + (c.crops[x.slot.id.slice(5)]?.sellPrice ?? 0) * x.slot.n,
      0,
    );

    const { body, foot } = shell(
      c.strings.ui["sell"] ?? "Quầy thu mua",
      stock.length ? `Tổng nếu bán hết: ${money(total)}` : "Túi chưa có nông sản nào",
    );

    for (const { slot } of stock) {
      const crop = c.crops[slot.id.slice(5)];
      if (!crop) continue;
      body.appendChild(
        row({
          id: slot.id,
          name: `${crop.name} ×${slot.n}`,
          desc: `${money(crop.sellPrice)} / cái`,
          price: money(crop.sellPrice * slot.n),
          action: {
            label: "Bán",
            disabled: false,
            onClick: () => {
              h.sell(slot.id, slot.n);
              openSell();
            },
          },
        }),
      );
    }

    if (!stock.length) {
      const d = document.createElement("div");
      d.className = "sub";
      d.textContent = "Trồng và thu hoạch trước đã, rồi quay lại đây bán.";
      body.appendChild(d);
    }

    const all = document.createElement("button");
    all.className = "primary";
    all.textContent = `${c.strings.ui["sellAll"] ?? "Bán tất cả"} (${money(total)})`;
    all.disabled = stock.length === 0;
    all.addEventListener("click", () => {
      h.sellAll();
      openSell();
    });
    foot.appendChild(all);
  }

  /* ------------------------------------------------------------ TẠM DỪNG */
  function openPause() {
    current = openPause;
    const c = getContent();
    const info = h.contentInfo();
    const { body, foot } = shell(
      "Tạm dừng",
      `Nội dung ${info.version} (${info.source}) · core ${CORE_VERSION}`,
    );

    const mkBtn = (label: string, fn: () => void, cls = "") => {
      const b = document.createElement("button");
      b.className = cls;
      b.textContent = label;
      b.addEventListener("click", fn);
      return b;
    };

    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:6px";
    grid.append(
      mkBtn(c.strings.ui["save"] ?? "Lưu game", () => h.save(), "primary"),
      mkBtn(c.strings.ui["load"] ?? "Tải game", () => h.load()),
      mkBtn(c.strings.ui["export"] ?? "Xuất file save", () => h.exportSave()),
      mkBtn(c.strings.ui["import"] ?? "Nhập file save", () => h.importSave()),
    );
    body.appendChild(grid);

    const muteLabel = (m: boolean) => (m ? "Âm thanh: TẮT" : "Âm thanh: BẬT");
    const mute = mkBtn(muteLabel(h.isMuted()), () => {
      mute.textContent = muteLabel(h.toggleMute());
    });
    body.appendChild(mute);

    if (info.pending) {
      const note = document.createElement("div");
      note.className = "sub";
      note.textContent = `Có nội dung ${info.pending} đang chờ — tải lại trang để áp dụng.`;
      body.appendChild(note);
    }
    if (info.source === "ota") {
      body.appendChild(
        mkBtn(c.strings.ui["contentRevert"] ?? "Hoàn tác về bản đóng kèm", () => {
          h.revertContent();
          close();
        }),
      );
    }

    body.appendChild(mkBtn("Hướng dẫn chơi", () => openHelp()));
    body.appendChild(
      mkBtn(
        c.strings.ui["newGame"] ?? "Chơi mới",
        () => {
          if (confirm("Bắt đầu nông trại mới? Tiến trình chưa lưu sẽ mất.")) {
            h.newGame();
            close();
          }
        },
        "danger",
      ),
    );

    foot.appendChild(mkBtn(c.strings.ui["resume"] ?? "Tiếp tục", close, "primary"));
  }

  /* ------------------------------------------------------------ HƯỚNG DẪN */
  function openHelp() {
    current = openHelp;
    const { body, foot } = shell("Hướng dẫn", "Vòng lặp nông trại trong một màn hình");
    body.innerHTML = `
      <div class="help-grid">
        <span class="k"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span>Di chuyển (hoặc phím mũi tên)</span>
        <span class="k"><kbd>Space</kbd></span><span>Dùng vật phẩm đang cầm lên ô trước mặt</span>
        <span class="k"><kbd>E</kbd></span><span>Tương tác: cửa nhà = ngủ, máy = mua hạt, quầy = bán</span>
        <span class="k"><kbd>1</kbd>–<kbd>9</kbd></span><span>Chọn ô trong hotbar (hoặc lăn chuột)</span>
        <span class="k"><kbd>B</kbd></span><span>Mở cửa hàng nhanh</span>
        <span class="k"><kbd>Esc</kbd></span><span>Menu: lưu, tải, xuất/nhập file save</span>
        <span class="k">Chuột</span><span>Bấm vào ô để làm việc ở đó</span>
      </div>
      <div class="sub" style="margin-top:10px;line-height:1.7">
        <b style="color:var(--gold)">Vòng lặp:</b> cầm cuốc cày ô cỏ → chọn hạt gieo xuống →
        cầm bình tưới → về nhà bấm <kbd>E</kbd> ở cửa để ngủ. Cây chỉ lớn nếu ô ĐƯỢC TƯỚI
        trong đêm đó. Chín thì bấm <kbd>Space</kbd> để thu, mang ra quầy bán.
        <br><br>
        <b style="color:var(--gold)">Nông trại hiện đại:</b> đủ tiền sẽ mở vòi tưới tự động
        (khỏi tưới tay), sàn nhà kính (ô luôn ẩm), pin mặt trời (ra tiền + ra ĐIỆN) và
        drone thu hoạch (cần điện từ pin mặt trời).
      </div>`;
    const back = document.createElement("button");
    back.className = "primary";
    back.textContent = "Đã hiểu";
    back.addEventListener("click", close);
    foot.appendChild(back);
  }

  return {
    isOpen: () => root.classList.contains("open"),
    close,
    openShop,
    openSell,
    openPause,
    openHelp,
    refresh: () => current?.(),
  };
}

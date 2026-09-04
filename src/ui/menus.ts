/* ============================================================================
   MENU — cửa hàng, quầy thu mua, chế tạo, tạm dừng, cài đặt, hướng dẫn.

   Modal là DOM chứ không vẽ lên canvas: chữ sắc nét, cuộn được, dùng được bàn
   phím, và thêm một mục mới chỉ là thêm một hàng HTML.

   Menu KHÔNG tự sửa state. Nó gọi callback, callback dispatch action, rồi menu
   vẽ lại từ state mới. Một chiều duy nhất, nên không có chuyện UI và state lệch nhau.

   Thiết kế lại cho điện thoại:
     · Trên màn dọc, modal là BOTTOM SHEET: trượt từ đáy lên, tay cầm ở trên,
       nút Đóng nằm trong tầm ngón cái. Trên desktop vẫn là hộp giữa màn hình.
       CSS quyết định, menu không biết.
     · Cửa hàng chia TAB (Hạt giống / Công trình) thay vì một danh sách dài.
     · Quầy thu mua có nút ±: bán một phần để giữ lại hạt/nông sản.
     · Mọi hàng cao ≥ 52px, nút ≥ 44px — chuẩn ngón tay.
     · Bảng CÀI ĐẶT gom mọi tuỳ chọn của máy: điều khiển, tay thuận, cỡ chữ,
       khung nhìn, rung, âm thanh, giảm chuyển động.
============================================================================ */

import type { Content, DebugOp, GameState } from "../game/types.ts";
import type { Atlas } from "../art/atlas.ts";
import { CORE_VERSION } from "../core/version.ts";
import type { Settings } from "../core/settings.ts";

export interface MenuHandlers {
  buy(id: string, n: number): void;
  craft(id: string): void;
  canCraft(id: string): boolean;
  /** Còn thiếu gì để làm được công thức này. */
  missingFor(id: string): { id: string; need: number; have: number }[];
  debug(op: DebugOp, n?: number): void;
  sell(id: string, n: number): void;
  sellAll(): void;
  save(): void;
  load(): void;
  exportSave(): void;
  importSave(): void;
  newGame(): void;
  toggleMute(): boolean;
  isMuted(): boolean;
  settings(): Settings;
  /** Đổi MỘT khoá settings; main lưu + áp dụng rồi trả về bản mới. */
  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): Settings;
  revertContent(): void;
  contentInfo(): { version: string; source: string; pending: string | null };
  /** Có thể cài PWA không (đã bắt được beforeinstallprompt). */
  canInstall(): boolean;
  install(): void;
  /** Mở lại hướng dẫn lần đầu. */
  replayTutorial(): void;
  /** Thiết bị đang dùng cảm ứng — để ẩn phần bàn phím trong Hướng dẫn. */
  isTouch(): boolean;
}

export interface Menus {
  isOpen(): boolean;
  close(): void;
  openShop(): void;
  openSell(): void;
  openCraft(): void;
  openDebug(): void;
  openPause(): void;
  openSettings(): void;
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
  /** tab đang chọn của cửa hàng — nhớ giữa các lần mở */
  let shopTab: "seed" | "build" = "seed";
  /** số lượng đang chọn ở quầy bán, theo id */
  const sellQty = new Map<string, number>();

  const close = () => {
    current = null;
    root.classList.remove("open");
    root.innerHTML = "";
  };

  root.addEventListener("pointerdown", (e) => {
    if (e.target === root) close();
  });

  function icon(id: string, size = 16): HTMLElement {
    const src = atlas.icon(id);
    const c = document.createElement("canvas");
    c.width = src?.width ?? 16;
    c.height = src?.height ?? 16;
    if (src) c.getContext("2d")!.drawImage(src, 0, 0);
    c.className = "icon";
    c.style.width = `${size * 2}px`;
    c.style.height = `${size * 2}px`;
    return c;
  }

  interface Shell {
    modal: HTMLElement;
    body: HTMLElement;
    foot: HTMLElement;
  }

  function shell(title: string, sub: string, cls = ""): Shell {
    root.innerHTML = "";
    const modal = document.createElement("div");
    modal.className = `modal ${cls}`;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.innerHTML = `
      <div class="grip" aria-hidden="true"></div>
      <header>
        <div class="hd"><h2></h2><div class="sub"></div></div>
        <button type="button" class="x" data-x aria-label="Đóng">✕</button>
      </header>
      <div class="body"></div>
      <footer></footer>`;
    (modal.querySelector("h2") as HTMLElement).textContent = title;
    (modal.querySelector(".sub") as HTMLElement).textContent = sub;
    modal.querySelector("[data-x]")!.addEventListener("click", close);
    root.appendChild(modal);
    root.classList.add("open");
    return {
      modal,
      body: modal.querySelector(".body") as HTMLElement,
      foot: modal.querySelector("footer") as HTMLElement,
    };
  }

  const mkBtn = (label: string, fn: () => void, cls = "") => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    b.textContent = label;
    b.addEventListener("click", fn);
    return b;
  };

  const note = (text: string, cls = "sub") => {
    const d = document.createElement("div");
    d.className = cls;
    d.textContent = text;
    return d;
  };

  function row(opts: {
    id: string;
    name: string;
    desc: string;
    price: string;
    locked?: boolean;
    action?: { label: string; disabled: boolean; onClick: () => void };
    extra?: HTMLElement;
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
    const right = document.createElement("div");
    right.className = "right";
    const price = document.createElement("div");
    price.className = "price";
    price.textContent = opts.price;
    right.appendChild(price);
    if (opts.extra) right.appendChild(opts.extra);
    if (opts.action) {
      const b = mkBtn(opts.action.label, opts.action.onClick, "primary");
      b.disabled = opts.action.disabled;
      right.appendChild(b);
    }
    el.appendChild(right);
    return el;
  }

  /* ------------------------------------------------------------ CỬA HÀNG */
  function openShop() {
    current = openShop;
    const s = getState();
    const c = getContent();
    const { body, foot } = shell(
      c.strings.ui["shop"] ?? "Cửa hàng",
      `Bạn có ${money(s.money)}`,
      "sheet",
    );

    const tabs = document.createElement("div");
    tabs.className = "tabs";
    const mkTab = (id: typeof shopTab, label: string) => {
      const b = mkBtn(label, () => {
        shopTab = id;
        openShop();
      }, `tab${shopTab === id ? " on" : ""}`);
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(shopTab === id));
      tabs.appendChild(b);
    };
    mkTab("seed", "Hạt giống");
    mkTab("build", "Công trình");
    body.appendChild(tabs);

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

    if (shopTab === "seed") {
      for (const id of c.cropOrder) {
        const crop = c.crops[id]!;
        const days = crop.growthDays.reduce((a, b) => a + b, 0);
        const regrow = crop.regrowDays ? ` · mọc lại ${crop.regrowDays} ngày` : "";
        mk(`seed:${id}`, crop.seedName, `${days} ngày · bán ${money(crop.sellPrice)}${regrow}`, crop.seedPrice);
      }
      foot.appendChild(note("Mua xong chọn ở hotbar rồi bấm GIEO lên luống đã cày."));
    } else {
      for (const id of c.buildingOrder) {
        const b = c.buildings[id]!;
        mk(id, b.name, b.desc, b.price);
      }
      foot.appendChild(note("Chọn ở hotbar rồi bấm ĐẶT lên ô trống. Hàng khoá sẽ mở theo tiến trình."));
    }
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
      stock.length ? `Bán hết được ${money(total)}` : "Túi chưa có nông sản nào",
      "sheet",
    );

    for (const { slot } of stock) {
      const crop = c.crops[slot.id.slice(5)];
      if (!crop) continue;
      const qty = Math.max(1, Math.min(slot.n, sellQty.get(slot.id) ?? slot.n));
      sellQty.set(slot.id, qty);

      const stepper = document.createElement("div");
      stepper.className = "stepper";
      const minus = mkBtn("−", () => {
        sellQty.set(slot.id, Math.max(1, qty - 1));
        openSell();
      });
      minus.disabled = qty <= 1;
      minus.setAttribute("aria-label", "Bớt một");
      const num = document.createElement("span");
      num.textContent = `${qty}/${slot.n}`;
      const plus = mkBtn("+", () => {
        sellQty.set(slot.id, Math.min(slot.n, qty + 1));
        openSell();
      });
      plus.disabled = qty >= slot.n;
      plus.setAttribute("aria-label", "Thêm một");
      stepper.append(minus, num, plus);

      body.appendChild(
        row({
          id: slot.id,
          name: `${crop.name} ×${slot.n}`,
          desc: `${money(crop.sellPrice)} / cái`,
          price: money(crop.sellPrice * qty),
          extra: stepper,
          action: {
            label: "Bán",
            disabled: false,
            onClick: () => {
              h.sell(slot.id, qty);
              sellQty.delete(slot.id);
              openSell();
            },
          },
        }),
      );
    }

    if (!stock.length) body.appendChild(note("Trồng và thu hoạch trước đã, rồi quay lại đây bán."));

    const all = mkBtn(`${c.strings.ui["sellAll"] ?? "Bán tất cả"} · ${money(total)}`, () => {
      h.sellAll();
      sellQty.clear();
      openSell();
    }, "primary wide");
    all.disabled = stock.length === 0;
    foot.appendChild(all);
  }

  /* ----------------------------------------------------------- CHẾ TẠO */
  function openCraft() {
    current = openCraft;
    const c = getContent();
    const { body, foot } = shell("Bàn chế tạo", "Ghép vật liệu và công cụ cũ thành đồ tốt hơn", "sheet");

    const label = (id: string) => {
      const [kind, ref] = id.split(":") as [string, string];
      if (kind === "item") return c.materials[ref]?.name ?? ref;
      if (kind === "tool") return c.tools[ref]?.name ?? ref;
      if (kind === "build") return c.buildings[ref]?.name ?? ref;
      if (kind === "seed") return c.crops[ref]?.seedName ?? ref;
      if (kind === "crop") return c.crops[ref]?.name ?? ref;
      return id;
    };

    for (const rc of c.recipes) {
      const missing = h.missingFor(rc.id);
      const okNow = h.canCraft(rc.id);

      const el = document.createElement("div");
      el.className = `row${okNow ? "" : " locked"}`;
      el.appendChild(icon(rc.out.id));

      const info = document.createElement("div");
      info.className = "info";
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = rc.name + (rc.out.n > 1 ? ` ×${rc.out.n}` : "");
      const need = document.createElement("div");
      need.className = "desc need";
      for (const v of rc.in) {
        const m = missing.find((x) => x.id === v.id);
        const have = m ? m.have : v.n;
        const chip = document.createElement("span");
        chip.className = `chip${m ? " short" : ""}`;
        chip.appendChild(icon(v.id, 8));
        const t = document.createElement("span");
        t.textContent = `${label(v.id)} ${have}/${v.n}`;
        chip.appendChild(t);
        need.appendChild(chip);
      }
      info.append(name, need);
      if (rc.desc) info.appendChild(note(rc.desc, "desc dim"));
      el.appendChild(info);

      const right = document.createElement("div");
      right.className = "right";
      const b = mkBtn("Chế tạo", () => {
        h.craft(rc.id);
        openCraft();
      }, "primary");
      b.disabled = !okNow;
      right.appendChild(b);
      el.appendChild(right);
      body.appendChild(el);
    }

    foot.appendChild(note("Gỗ từ chặt cây · đá từ đập đá · sợi từ phát bụi cỏ (tay không)."));
  }

  /* ------------------------------------------------------------ GỠ LỖI */
  function openDebug() {
    current = openDebug;
    const c = getContent();
    const { body, foot } = shell("Bảng gỡ lỗi", "Công cụ thử nghiệm — không phải cách chơi thật");

    const grid = document.createElement("div");
    grid.className = "grid2";
    const add = (label: string, op: DebugOp, n?: number) => {
      grid.appendChild(mkBtn(label, () => {
        h.debug(op, n);
        openDebug();
      }));
    };
    add("+1.000đ", "money", 1000);
    add("Đầy năng lượng", "energy");
    add("Đầy bình nước", "water");
    add("+50 mỗi vật liệu", "materials");
    add("Mở khoá tất cả", "unlockAll");
    add("Sang ngày mới", "skipDay");
    add("Cho cây chín hết", "growAll");
    add("Thu hoạch tất cả", "harvestAll");
    add("Tự cày + gieo quanh đây", "plantAround");
    add("Rắc cỏ quanh đây", "addGrass");
    add("Rắc cây nhỏ quanh đây", "addTrees");
    body.appendChild(grid);

    const s = getState();
    const stat = document.createElement("div");
    stat.className = "sub mono";
    stat.style.marginTop = "8px";
    stat.innerHTML = [
      `ngày ${s.day} · ${Math.floor(s.minutes)}′ · ${s.money}đ`,
      `năng lượng ${Math.round(s.energy)}/${c.balance.energyMax} · nước ${Math.round(s.water)}`,
      `ô: ${s.w}×${s.h} · vị trí ${Math.floor(s.player.x / 16)},${Math.floor(s.player.y / 16)}`,
      `content ${c.contentVersion} · core ${CORE_VERSION}`,
    ].join("<br>");
    body.appendChild(stat);

    foot.appendChild(mkBtn("Đóng", close, "primary"));
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

    const grid = document.createElement("div");
    grid.className = "grid2";
    grid.append(
      mkBtn(c.strings.ui["save"] ?? "Lưu game", () => h.save(), "primary"),
      mkBtn(c.strings.ui["load"] ?? "Tải game", () => h.load()),
      mkBtn(c.strings.ui["export"] ?? "Xuất file save", () => h.exportSave()),
      mkBtn(c.strings.ui["import"] ?? "Nhập file save", () => h.importSave()),
    );
    body.appendChild(grid);

    const list = document.createElement("div");
    list.className = "menu-list";
    list.append(
      mkBtn("⚙ Cài đặt", () => openSettings()),
      mkBtn("? Hướng dẫn chơi", () => openHelp()),
    );
    if (h.canInstall()) list.appendChild(mkBtn("⤓ Cài về màn hình chính", () => h.install(), "accent"));
    list.appendChild(mkBtn("Bảng gỡ lỗi", () => openDebug(), "dim"));
    body.appendChild(list);

    if (info.pending) body.appendChild(note(`Có nội dung ${info.pending} đang chờ — tải lại trang để áp dụng.`));
    if (info.source === "ota") {
      body.appendChild(
        mkBtn(c.strings.ui["contentRevert"] ?? "Hoàn tác về bản đóng kèm", () => {
          h.revertContent();
          close();
        }),
      );
    }

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

    foot.appendChild(mkBtn(c.strings.ui["resume"] ?? "Tiếp tục", close, "primary wide"));
  }

  /* ------------------------------------------------------------ CÀI ĐẶT */
  function openSettings() {
    current = openSettings;
    const { body, foot } = shell("Cài đặt", "Tuỳ chọn của máy này — không nằm trong file save", "sheet");

    /** Một hàng chọn nhiều giá trị (segmented control). */
    const seg = <K extends keyof Settings>(
      title: string,
      hint: string,
      key: K,
      options: { v: Settings[K]; label: string }[],
    ) => {
      const cur = h.settings()[key];
      const wrap = document.createElement("div");
      wrap.className = "setting";
      const head = document.createElement("div");
      head.className = "st-head";
      head.innerHTML = `<b></b><span class="sub"></span>`;
      (head.querySelector("b") as HTMLElement).textContent = title;
      (head.querySelector("span") as HTMLElement).textContent = hint;
      const ctl = document.createElement("div");
      ctl.className = "segment";
      ctl.setAttribute("role", "radiogroup");
      for (const o of options) {
        const b = mkBtn(o.label, () => {
          h.setSetting(key, o.v);
          openSettings();
        }, o.v === cur ? "on" : "");
        b.setAttribute("role", "radio");
        b.setAttribute("aria-checked", String(o.v === cur));
        ctl.appendChild(b);
      }
      wrap.append(head, ctl);
      body.appendChild(wrap);
    };

    const toggle = (title: string, hint: string, get: () => boolean, set: (v: boolean) => void) => {
      const wrap = document.createElement("div");
      wrap.className = "setting toggle";
      const head = document.createElement("div");
      head.className = "st-head";
      head.innerHTML = `<b></b><span class="sub"></span>`;
      (head.querySelector("b") as HTMLElement).textContent = title;
      (head.querySelector("span") as HTMLElement).textContent = hint;
      const sw = document.createElement("button");
      sw.type = "button";
      sw.className = `switch${get() ? " on" : ""}`;
      sw.setAttribute("role", "switch");
      sw.setAttribute("aria-checked", String(get()));
      sw.setAttribute("aria-label", title);
      sw.innerHTML = `<i></i>`;
      sw.addEventListener("click", () => {
        set(!get());
        openSettings();
      });
      wrap.append(head, sw);
      body.appendChild(wrap);
    };

    const touch = h.isTouch();
    if (touch) {
      seg("Điều khiển", "Chạm: cả màn hình là chỗ chạm. Joystick: góc dưới-trái dành cho cần điều khiển.", "control", [
        { v: "tap", label: "Chạm để đi" },
        { v: "stick", label: "Joystick" },
      ]);
      seg("Tay thuận", "Lật cụm nút hành động sang bên ngón cái của bạn.", "hand", [
        { v: "right", label: "Phải" },
        { v: "left", label: "Trái" },
      ]);
    }
    seg("Cỡ giao diện", "Chữ và nút to hơn nếu màn hình nhỏ hoặc mắt mỏi.", "uiScale", [
      { v: "small", label: "Nhỏ" },
      { v: "auto", label: "Tự động" },
      { v: "large", label: "Lớn" },
    ]);
    seg("Khung nhìn", "Gần: nhân vật to, thấy ít ô. Xa: thấy nhiều ruộng hơn.", "zoom", [
      { v: "near", label: "Gần" },
      { v: "normal", label: "Vừa" },
      { v: "far", label: "Xa" },
    ]);
    toggle("Nút hành động theo ngữ cảnh", "Nút chính hiện CÀY / GIEO / TƯỚI… thay vì chữ DÙNG cố định.",
      () => h.settings().contextButton, (v) => h.setSetting("contextButton", v));
    toggle("Âm thanh", "Tiếng 8-bit tổng hợp, không có file nhạc.",
      () => !h.isMuted(), () => h.toggleMute());
    if (touch)
      toggle("Rung khi thao tác", "Rung nhẹ khi cày/gieo/tưới thành công (Android).",
        () => h.settings().haptics, (v) => h.setSetting("haptics", v));
    toggle("Giảm chuyển động", "Tắt nhấp nháy, lấp lánh và hạt hiệu ứng.",
      () => h.settings().reduceMotion, (v) => h.setSetting("reduceMotion", v));

    body.appendChild(mkBtn("Xem lại hướng dẫn lần đầu", () => {
      close();
      h.replayTutorial();
    }));

    foot.appendChild(mkBtn("Xong", close, "primary wide"));
  }

  /* ------------------------------------------------------------ HƯỚNG DẪN */
  function openHelp() {
    current = openHelp;
    const touch = h.isTouch();
    const { body, foot } = shell("Hướng dẫn", "Vòng lặp nông trại trong một màn hình", "sheet");
    const keys = touch
      ? `
      <div class="help-grid">
        <span class="k">Chạm 1 lần</span><span>Nhân vật <b>đi tới</b> ô đó và ngắm sẵn ô đó</span>
        <span class="k">Chạm 2 lần</span><span><b>Làm ngay</b> tại ô đó: cày, gieo, tưới, thu…</span>
        <span class="k">Nút lớn</span><span>Làm việc ghi trên nút với ô đang ngắm</span>
        <span class="k">Nút E</span><span>Tương tác với thứ trước mặt: cửa, giường, quầy</span>
        <span class="k">Nhấn giữ ô hotbar</span><span>Xem vật phẩm đó dùng để làm gì</span>
        <span class="k">Bản đồ nhỏ</span><span>Bấm vào để đi xa; ô vàng = cây chín</span>
      </div>`
      : `
      <div class="help-grid">
        <span class="k"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span>Di chuyển (hoặc mũi tên) · giữ <kbd>Shift</kbd> để chạy</span>
        <span class="k"><kbd>Space</kbd></span><span>Dùng vật phẩm đang cầm lên ô đang ngắm</span>
        <span class="k"><kbd>E</kbd></span><span>Tương tác: cửa, giường, máy bán hạt, quầy, giếng</span>
        <span class="k"><kbd>1</kbd>–<kbd>9</kbd></span><span>Chọn ô hotbar (hoặc lăn chuột / <kbd>Tab</kbd>)</span>
        <span class="k"><kbd>B</kbd> <kbd>M</kbd></span><span>Cửa hàng nhanh · bật/tắt bản đồ nhỏ</span>
        <span class="k"><kbd>Esc</kbd></span><span>Tạm dừng: lưu, tải, cài đặt</span>
        <span class="k">Bấm 1 / 2 lần</span><span>Đi tới ô đó / làm ngay tại ô đó</span>
      </div>`;
    body.innerHTML = `${keys}
      <div class="help-text">
        <p><b>Vòng lặp:</b> cầm cuốc <b>CÀY</b> ô cỏ → chọn hạt <b>GIEO</b> → cầm bình <b>TƯỚI</b>
        → về nhà lên giường <b>NGỦ</b>. Cây chỉ lớn ở ô <b>đã tưới</b> (đất sẫm màu). Chín thì
        <b>THU</b>, mang ra quầy <b>BÁN</b>.</p>
        <p><b>Ngắm một lần, làm ba việc:</b> ô đã ngắm được giữ lại chừng nào bạn còn đứng gần.
        Cày xong đổi sang hạt rồi bấm nút, đổi sang bình rồi bấm nút — không cần chạm lại.</p>
        <p><b>Làm từng việc một:</b> mỗi thao tác mất một nhịp ngắn. Bấm loạn không nhanh hơn.</p>
        <p><b>Khai thác:</b> chế <b>rìu</b> để chặt cây lấy gỗ, <b>cuốc chim</b> để đập đá.
        Bụi cỏ dại tay không phát được, ra sợi. Vạch vàng trên đầu vật thể = số nhát còn lại.</p>
        <p><b>Nước có hạn:</b> bình cạn thì ra <b>giếng</b> hoặc bờ ao bấm <b>MÚC</b>.</p>
        <p><b>Nhà:</b> bấm <b>VÀO</b> ở cửa. Trong nhà có giường (ngủ) và bàn chế tạo. Ngủ trong
        nhà thì ruộng ngoài kia vẫn lớn cây, vòi tưới vẫn tưới.</p>
        <p><b>Hiện đại hoá:</b> đủ tiền mở vòi tưới tự động, sàn nhà kính (luôn ẩm), pin mặt trời
        (ra tiền + điện) và drone thu hoạch (cần điện).</p>
      </div>`;
    foot.appendChild(mkBtn("Đã hiểu", close, "primary wide"));
  }

  return {
    isOpen: () => root.classList.contains("open"),
    close,
    openShop,
    openSell,
    openCraft,
    openDebug,
    openPause,
    openSettings,
    openHelp,
    refresh: () => current?.(),
  };
}

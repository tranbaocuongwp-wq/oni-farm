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
import { cropInSeason, currentSeason, dayOfSeason } from "../game/season.ts";
import type { Settings } from "../core/settings.ts";

export interface MenuHandlers {
  buy(id: string, n: number): void;
  /** Đổi chỗ hai ô túi đồ (balo ⇄ hotbar). */
  swap(a: number, b: number): void;
  craft(id: string): void;
  canCraft(id: string): boolean;
  /** Còn thiếu gì để làm được công thức này. */
  missingFor(id: string): { id: string; need: number; have: number }[];
  debug(op: DebugOp, n?: number): void;
  /** Kho tập trung: cất / lấy / cất hết / bán hết. */
  storePut(slot: number, n: number): void;
  storeTake(slot: number, n: number): void;
  storePutAll(): void;
  storeSellAll(): void;
  /** Mua một con vật — nó được giao tới điểm giao cố định. */
  buyAnimal(def: string): void;
  hire(job: "crops" | "livestock"): void;
  fire(id: number): void;
  assign(id: number, job: "crops" | "livestock"): void;
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
  /** Mở chế độ xây dựng (dừng thời gian, kéo thả địa hình). */
  buildMode(): void;
  install(): void;
  /** Bật/tắt bảng gỡ lỗi nổi. Phải có NÚT chứ không chỉ có phím tắt — điện
   *  thoại không có bàn phím, mà đây là thiết bị chơi chính. */
  toggleDevPanel(): void;
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
  openStore(): void;
  openCraft(): void;
  openPause(): void;
  openSettings(): void;
  openBag(): void;
  openHelp(): void;
  /** vẽ lại modal đang mở sau khi state đổi (mua xong, bán xong) */
  refresh(): void;
}

const money = (n: number) => `${n.toLocaleString("vi-VN")}đ`;

/** Tên hiển thị của một id vật phẩm — kho trộn cả nông sản lẫn nguyên liệu. */
function itemLabel(id: string, c: Content): string {
  if (id.startsWith("crop:")) return c.crops[id.slice(5)]?.name ?? id;
  if (id.startsWith("item:")) return c.materials[id.slice(5)]?.name ?? id;
  if (id.startsWith("seed:")) return c.crops[id.slice(5)]?.seedName ?? id;
  if (id.startsWith("tool:")) return c.tools[id.slice(5)]?.name ?? id;
  if (id.startsWith("build:")) return c.buildings[id.slice(6)]?.name ?? id;
  return id;
}

export function createMenus(
  root: HTMLElement,
  atlas: Atlas,
  getState: () => GameState,
  getContent: () => Content,
  h: MenuHandlers,
): Menus {
  let current: (() => void) | null = null;
  /** tab đang chọn của cửa hàng — nhớ giữa các lần mở */
  let shopTab: "seed" | "build" | "animal" | "worker" = "seed";
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

  /**
   * Ảnh minh hoạ cho một id.
   *
   * `atlas.icon` chỉ biết vật phẩm (tool/item/seed/crop/build). Con vật và người
   * làm không phải vật phẩm — cố ý, vì con vật sống không bao giờ vào túi đồ —
   * nên phải hỏi đúng nguồn của chúng ở đây, nếu không cửa hàng hiện toàn ô
   * trống.
   */
  function artFor(id: string): HTMLCanvasElement | null {
    if (id.startsWith("animal:")) return atlas.animal(id.slice(7), "down", 0);
    if (id.startsWith("worker:")) return atlas.worker(Number(id.slice(7)) || 0, "down", 0);
    // Hạt giống: hiện CÂY ĐÃ CHÍN chứ không phải gói hạt. Sáu mươi mốt gói giấy
    // trông giống hệt nhau thì người chơi không phân biệt được gì; nhìn cái cây
    // là biết mình đang mua gì.
    if (id.startsWith("plant:")) {
      const frames = atlas.crops[id.slice(6)];
      return frames?.[frames.length - 1] ?? null;
    }
    return atlas.icon(id);
  }

  function icon(id: string, size = 16): HTMLElement {
    const src = artFor(id);
    const c = document.createElement("canvas");
    c.width = src?.width ?? 16;
    c.height = src?.height ?? 16;
    if (src) c.getContext("2d")!.drawImage(src, 0, 0);
    c.className = "icon";
    // Giữ đúng tỉ lệ: sprite cây cao 24px chứ không vuông 16px, ép vuông là bóp
    // méo cả cây thành một cục.
    const k = (size * 2) / Math.max(c.width, c.height);
    c.style.width = `${Math.round(c.width * k)}px`;
    c.style.height = `${Math.round(c.height * k)}px`;
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


  /* --------------------------------------------------------- LƯỚI THẺ mua
     Cửa hàng dùng LƯỚI cho mọi tab, không dùng danh sách dòng.

     Danh sách dòng đọc được khi có năm mục. Cửa hàng này có tới bốn mươi loại
     hạt trong một mùa, tám loài vật, sáu công trình — xếp dọc thì phải cuộn để
     xem hết, và cuộn thì không so sánh được hai thứ với nhau. Lưới cho thấy
     tất cả cùng lúc, và mỗi thẻ có HÌNH nên nhận ra bằng mắt chứ không phải
     bằng cách đọc tên.
  */

  /** Một thẻ mua: cả thẻ là nút bấm. */
  function buyCard(o: {
    art: string;
    name: string;
    subs: string[];
    price: string;
    locked?: boolean;
    disabled?: boolean;
    onClick: () => void;
  }): HTMLElement {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `shop-card${o.locked ? " locked" : ""}`;
    card.disabled = !!o.disabled;
    card.appendChild(icon(o.art, 22));
    const nm = document.createElement("div");
    nm.className = "nm";
    nm.textContent = o.name;
    card.appendChild(nm);
    for (const t of o.subs) {
      if (!t) continue;
      const sub = document.createElement("div");
      sub.className = "sub";
      sub.textContent = t;
      card.appendChild(sub);
    }
    const pr = document.createElement("div");
    pr.className = "pr";
    pr.textContent = o.price;
    card.appendChild(pr);
    card.addEventListener("click", o.onClick);
    return card;
  }

  /** Thẻ có NHIỀU nút (người làm: đổi việc / cho nghỉ). Không thể là <button>
   *  vì nút lồng trong nút là HTML không hợp lệ và bấm sẽ trúng cả hai. */
  function infoCard(o: {
    art: string;
    name: string;
    subs: string[];
    buttons: { label: string; onClick: () => void; cls?: string }[];
  }): HTMLElement {
    const card = document.createElement("div");
    card.className = "shop-card wide";
    card.appendChild(icon(o.art, 22));
    const nm = document.createElement("div");
    nm.className = "nm";
    nm.textContent = o.name;
    card.appendChild(nm);
    for (const t of o.subs) {
      if (!t) continue;
      const sub = document.createElement("div");
      sub.className = "sub";
      sub.textContent = t;
      card.appendChild(sub);
    }
    const bar = document.createElement("div");
    bar.className = "acts";
    for (const b of o.buttons) bar.appendChild(mkBtn(b.label, b.onClick, b.cls));
    card.appendChild(bar);
    return card;
  }

  const cardGrid = (): HTMLElement => {
    const g = document.createElement("div");
    g.className = "shop-grid";
    return g;
  };

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
    mkTab("animal", "Vật nuôi");
    mkTab("worker", "Người làm");
    body.appendChild(tabs);

    if (shopTab === "seed") {
      // Chỉ bày hạt GIEO ĐƯỢC HÔM NAY. Bày cả 61 loại rồi để người chơi mua
      // nhầm hạt trái mùa là bẫy tiền — mà danh sách 61 dòng cũng không ai đọc
      // hết. Lọc theo mùa vừa khỏi bẫy, vừa biến cửa hàng thành thứ ĐÁNG xem
      // lại mỗi đầu mùa.
      /* LƯỚI THẺ chứ không phải danh sách dòng. Một mùa có tới 40 loại hạt;
         bốn mươi dòng chữ xếp dọc thì không ai đọc hết, mà cũng không so sánh
         được với nhau. Thẻ có ẢNH CÂY ĐÃ CHÍN nên nhìn là biết đang mua gì. */
      const grid = cardGrid();
      let shown = 0;
      for (const id of c.cropOrder) {
        if (!cropInSeason(id, s.day, c)) continue;
        const crop = c.crops[id]!;
        const mo = s.unlocked.includes(`seed:${id}`);
        const days = crop.growthDays.reduce((a, b) => a + b, 0);
        grid.appendChild(
          buyCard({
            art: `plant:${id}`,
            name: mo ? crop.name : "???",
            subs: [
              mo ? `${days}n · ${money(crop.sellPrice)}${crop.regrowDays ? " ↻" : ""}` : "chưa mở",
            ],
            price: money(crop.seedPrice),
            locked: !mo,
            disabled: !mo || s.money < crop.seedPrice,
            onClick: () => {
              h.buy(`seed:${id}`, 1);
              openShop();
            },
          }),
        );
        shown++;
      }
      body.appendChild(grid);
      const sea = currentSeason(s, c);
      const left = c.daysPerSeason - dayOfSeason(s.day, c);
      foot.appendChild(
        note(
          sea
            ? `Mùa ${sea.name} — ${shown} loại hạt đang bán, còn ${left} ngày nữa sang mùa. Mua xong chọn ở hotbar rồi bấm GIEO lên luống đã cày.`
            : "Mua xong chọn ở hotbar rồi bấm GIEO lên luống đã cày.",
        ),
      );
    } else if (shopTab === "worker") {
      const cfg = c.workers;
      const dsach = s.entities.filter((e) => e.kind === "worker" && e.worker);
      body.appendChild(
        note(
          `Thuê ${money(cfg.hireFee)} · lương ${money(cfg.wage)} mỗi ${cfg.wageEveryDays} ngày. ` +
            `Không đủ tiền trả lương thì họ nghỉ việc.`,
        ),
      );
      const grid = document.createElement("div");
      grid.className = "grid2";
      grid.append(
        mkBtn("Thuê — chăm cây", () => { h.hire("crops"); openShop(); },
          s.money >= cfg.hireFee ? "primary" : "dim"),
        mkBtn("Thuê — chăn nuôi", () => { h.hire("livestock"); openShop(); },
          s.money >= cfg.hireFee ? "primary" : "dim"),
      );
      body.appendChild(grid);

      body.appendChild(note(dsach.length ? `Đang thuê ${dsach.length} người` : "Chưa thuê ai."));
      const gw = cardGrid();
      for (const e of dsach) {
        const w = e.worker!;
        const deo = w.carry.reduce((n, v) => n + (v ? v.n : 0), 0);
        gw.appendChild(
          infoCard({
            art: `worker:${e.id}`,
            name: w.name,
            subs: [
              w.job === "crops" ? "chăm cây" : "chăn nuôi",
              `sức ${Math.round(w.energy)}/${cfg.energyMax}`,
              `đeo ${deo}/${cfg.carryMax}`,
              `lương ngày ${w.paidDay + cfg.wageEveryDays}`,
            ],
            buttons: [
              {
                label: "Đổi việc",
                onClick: () => {
                  h.assign(e.id, w.job === "crops" ? "livestock" : "crops");
                  openShop();
                },
              },
              {
                label: "Cho nghỉ",
                cls: "dim",
                onClick: () => {
                  h.fire(e.id);
                  openShop();
                },
              },
            ],
          }),
        );
      }
      if (dsach.length) body.appendChild(gw);
    } else if (shopTab === "animal") {
      const ga = cardGrid();
      for (const id of c.animalOrder) {
        const a = c.animals[id]!;
        if (a.job === "pest") continue; // chuột sóc không phải hàng bán
        const mo = s.unlocked.includes(`animal:${id}`);
        const sanPham = a.products.map((p) => itemLabel(p.id, c)).join(", ");
        const thit = a.meat ? itemLabel(a.meat.id, c) : null;
        ga.appendChild(
          buyCard({
            art: `animal:${id}`,
            name: mo ? a.name : "???",
            // Trên thẻ hẹp thì mỗi dòng phải NGẮN. Gộp hết vào một dòng dài như
            // bản danh sách cũ là chữ tràn ra ba dòng và lưới cao thấp lởm chởm.
            subs: mo
              ? [
                  sanPham || (thit ? `thịt: ${thit}` : ""),
                  a.feed ? `ăn ${itemLabel(a.feed, c)}` : "tự kiếm ăn",
                  a.housing === "pen" ? "cần rào" : a.housing === "water" ? "dưới ao" : "thả rông",
                ]
              : ["chưa mở"],
            price: money(a.price),
            locked: !mo,
            disabled: !mo || s.money < a.price,
            onClick: () => {
              h.buyAnimal(id);
              openShop();
            },
          }),
        );
      }
      body.appendChild(ga);
      const drop = c.tiles.dropoff;
      foot.appendChild(
        note(
          drop
            ? `Mua xong con vật được giao tới ĐIỂM GIAO cố định cạnh quầy — ô (${drop.x}, ${drop.y}), cuối con đường nhựa. Ra đó đón.`
            : "Mua xong con vật được thả ở điểm giao.",
        ),
      );
    } else {
      const gb = cardGrid();
      for (const id of c.buildingOrder) {
        const b = c.buildings[id]!;
        const mo = s.unlocked.includes(id);
        /* KHÔNG có nút Mua nữa: công trình trả tiền theo SỐ Ô VẼ trong chế độ
           xây dựng. Bán theo chồng thì người chơi phải đoán "cần bao nhiêu ô
           rào" trước khi vẽ, mà đoán sai con số đó chính là lý do người ta ngại
           vẽ dài. Tab này giờ là BẢNG GIÁ: xem có gì, bao nhiêu một ô. */
        gb.appendChild(
          buyCard({
            art: `build:${id}`,
            name: mo ? b.name : "???",
            subs: [mo ? b.desc : "chưa mở khoá"],
            price: `${money(b.price)}/ô`,
            locked: !mo,
            disabled: true,
            onClick: () => {},
          }),
        );
      }
      body.appendChild(gb);
      foot.appendChild(
        note(
          "Đây là BẢNG GIÁ. Công trình xây trong CHẾ ĐỘ XÂY DỰNG (menu Tạm dừng, " +
            "hoặc nút XÂY cạnh nút hành động): thời gian dừng lại, ấn rồi rê để kéo " +
            "cả một đoạn, vẽ bao nhiêu ô thì trả tiền bấy nhiêu. Hàng khoá mở theo tiến trình.",
        ),
      );
    }
  }

  /* --------------------------------------------------------- QUẦY THU MUA */
  /* --------------------------------------------------------------- KHO */
  function openStore() {
    current = openStore;
    const s = getState();
    const c = getContent();

    const inStore = s.store
      .map((slot, i) => ({ slot, i }))
      .filter((x) => x.slot !== null) as { slot: { id: string; n: number }; i: number }[];
    const inBag = s.inv
      .map((slot, i) => ({ slot, i }))
      .filter((x) => x.slot !== null && (x.slot.id.startsWith("crop:") || x.slot.id.startsWith("item:"))) as {
      slot: { id: string; n: number };
      i: number;
    }[];

    const dang = inStore.reduce((n, x) => n + x.slot.n, 0);
    const banDuoc = inStore.reduce(
      (sum, x) => sum + (x.slot.id.startsWith("crop:") ? (c.crops[x.slot.id.slice(5)]?.sellPrice ?? 0) * x.slot.n : 0),
      0,
    );

    const { body, foot } = shell(
      "Kho tập trung",
      `${dang} món · ${s.store.length} ô${banDuoc > 0 ? ` · bán hết được ${money(banDuoc)}` : ""}`,
      "sheet",
    );

    const grid = document.createElement("div");
    grid.className = "grid2";
    grid.append(
      mkBtn("Cất hết nông sản", () => {
        h.storePutAll();
        openStore();
      }, "primary"),
      mkBtn("Bán hết trong kho", () => {
        h.storeSellAll();
        openStore();
      }, banDuoc > 0 ? "accent" : "dim"),
    );
    body.appendChild(grid);

    body.appendChild(note("TRONG KHO — bấm để lấy ra túi"));
    if (!inStore.length) body.appendChild(note("Kho đang trống."));
    for (const { slot, i } of inStore)
      body.appendChild(
        row({
          id: slot.id,
          name: `${itemLabel(slot.id, c)} ×${slot.n}`,
          desc: "",
          price: "",
          action: { label: "Lấy", disabled: false, onClick: () => { h.storeTake(i, slot.n); openStore(); } },
        }),
      );

    body.appendChild(note("TRONG TÚI — bấm để cất vào kho"));
    if (!inBag.length) body.appendChild(note("Túi không có gì để cất."));
    for (const { slot, i } of inBag)
      body.appendChild(
        row({
          id: slot.id,
          name: `${itemLabel(slot.id, c)} ×${slot.n}`,
          desc: "",
          price: "",
          action: { label: "Cất", disabled: false, onClick: () => { h.storePut(i, slot.n); openStore(); } },
        }),
      );

    foot.appendChild(mkBtn("Đóng", close, "primary"));
  }

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

  /* --------------------------------------------------------------- BALO */
  /** Ô đang được nhấc lên (chạm-để-chọn rồi chạm ô đích), -1 = không. */
  let picked = -1;

  function openBag() {
    current = openBag;
    const s = getState();
    const c = getContent();
    const hb = c.balance.hotbarSlots;
    const total = s.inv.length;
    const { body, foot } = shell(
      "Balo",
      "Hotbar cố định 10 ô. Chạm một món rồi chạm ô đích để đổi chỗ — hoặc kéo thả.",
      "sheet",
    );

    const nameOf = (id: string) => {
      const [kind, ref] = id.split(":") as [string, string];
      if (kind === "tool") return c.tools[ref]?.name ?? ref;
      if (kind === "seed") return c.crops[ref]?.seedName ?? ref;
      if (kind === "crop") return c.crops[ref]?.name ?? ref;
      if (kind === "build") return c.buildings[ref]?.name ?? ref;
      if (kind === "item") return c.materials[ref]?.name ?? ref;
      return id;
    };

    const mkSlot = (i: number) => {
      const it = s.inv[i] ?? null;
      const el = document.createElement("div");
      el.className = `bslot${it ? "" : " empty"}${i === picked ? " picked" : ""}${i < 2 ? " locked" : ""}${i === s.sel ? " sel" : ""}`;
      el.dataset["slot"] = String(i);
      el.setAttribute("role", "button");
      if (it) {
        el.appendChild(icon(it.id, 11));
        if (it.n > 1) {
          const n = document.createElement("span");
          n.className = "n";
          n.textContent = String(it.n);
          el.appendChild(n);
        }
        el.title = nameOf(it.id);
        el.setAttribute("aria-label", nameOf(it.id));
      }
      return el;
    };

    const section = (title: string, from: number, to: number, cls: string) => {
      const h = document.createElement("div");
      h.className = "bag-head";
      h.textContent = title;
      const grid = document.createElement("div");
      grid.className = `bag-grid ${cls}`;
      for (let i = from; i < to; i++) grid.appendChild(mkSlot(i));
      body.append(h, grid);
      return grid;
    };

    const gHot = section("HOTBAR (1–9, 0)", 0, Math.min(hb, total), "hot");
    const gBag = section(`BALO (${total - hb} ô)`, hb, total, "bag");

    const tapSlot = (i: number) => {
      if (picked < 0) {
        if (!s.inv[i] || i < 2) return; // ô trống / công cụ cố định không nhấc được
        picked = i;
        openBag();
        return;
      }
      if (picked === i) {
        picked = -1;
        openBag();
        return;
      }
      const from = picked;
      picked = -1;
      h.swap(from, i);
      openBag();
    };

    // Kéo thả bằng pointer: nhấc ô nguồn, thả lên ô đích. Chạm nhanh (không kéo)
    // rơi về luật chạm-chọn ở trên nên cả hai cách cùng chạy.
    let drag: { from: number; ghost: HTMLElement; moved: boolean; id: number } | null = null;
    const slotAt = (x: number, y: number): number => {
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>(".bslot");
      return el?.dataset["slot"] ? +el.dataset["slot"] : -1;
    };
    const onDown = (e: PointerEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>(".bslot");
      if (!el?.dataset["slot"]) return;
      const i = +el.dataset["slot"];
      if (!s.inv[i] || i < 2) {
        tapSlot(i);
        return;
      }
      const ghost = el.cloneNode(true) as HTMLElement;
      ghost.classList.add("ghost");
      // cloneNode KHÔNG sao chép pixel của canvas — vẽ lại icon vào bản sao
      const srcCanvas = el.querySelector("canvas");
      const dstCanvas = ghost.querySelector("canvas");
      if (srcCanvas && dstCanvas) dstCanvas.getContext("2d")!.drawImage(srcCanvas, 0, 0);
      ghost.style.left = `${e.clientX}px`;
      ghost.style.top = `${e.clientY}px`;
      drag = { from: i, ghost, moved: false, id: e.pointerId };
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved) {
        drag.moved = true;
        document.body.appendChild(drag.ghost);
      }
      drag.ghost.style.left = `${e.clientX}px`;
      drag.ghost.style.top = `${e.clientY}px`;
    };
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      d.ghost.remove();
      if (!d.moved) {
        tapSlot(d.from);
        return;
      }
      const to = slotAt(e.clientX, e.clientY);
      if (to >= 0 && to !== d.from) {
        picked = -1;
        h.swap(d.from, to);
      }
      openBag();
    };
    for (const g of [gHot, gBag]) {
      g.addEventListener("pointerdown", onDown);
      g.addEventListener("pointermove", onMove);
      g.addEventListener("pointerup", onUp);
      g.addEventListener("pointercancel", onUp);
    }

    foot.appendChild(note(picked >= 0 ? "Chạm ô đích để đổi chỗ, chạm lại để bỏ." : "Hai ô công cụ đầu (cuốc, bình) cố định."));
    foot.appendChild(mkBtn("Đóng", () => {
      picked = -1;
      close();
    }, "primary"));
  }

  /* ------------------------------------------------------------ GỠ LỖI */

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
      mkBtn("🎒 Balo", () => openBag()),
      mkBtn("🏗 Chế độ xây dựng", () => {
        close();
        h.buildMode();
      }, "accent"),
      mkBtn("⚙ Cài đặt", () => openSettings()),
      mkBtn("? Hướng dẫn chơi", () => openHelp()),
    );
    if (h.canInstall()) list.appendChild(mkBtn("⤓ Cài về màn hình chính", () => h.install(), "accent"));
    list.appendChild(
      mkBtn("Bảng gỡ lỗi", () => {
        close();
        h.toggleDevPanel();
      }, "dim"),
    );
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
    openStore,
    openCraft,
    openPause,
    openSettings,
    openBag,
    openHelp,
    refresh: () => current?.(),
  };
}

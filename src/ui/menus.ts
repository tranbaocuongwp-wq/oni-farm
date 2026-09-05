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
import type { Atlas, UiIcon } from "../art/atlas.ts";
import { CORE_VERSION } from "../core/version.ts";
import { cropInSeason, currentSeason, dayOfSeason } from "../game/season.ts";
import type { Settings } from "../core/settings.ts";
import { padButtonName, type PadInfo } from "../core/gamepad.ts";
import { PAD_MAP, type PadBind } from "../core/input.ts";
import { penSummary } from "../game/animals.ts";

export interface MenuHandlers {
  buy(id: string, n: number): void;
  /** Đổi chỗ hai ô túi đồ (balo ⇄ hotbar). */
  swap(a: number, b: number): void;
  /** Bỏ hẳn một ô túi đồ. */
  drop(slot: number): void;
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
  /** Thu HẾT sản phẩm tới lứa trong một khu. */
  penGather(pen: string): void;
  /** Đổ thức ăn đang cầm vào máng của một khu. */
  penPour(pen: string): void;
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
  /** Tay cầm nào đang cắm — để bảng nút hiện ĐÚNG tên nút của máy đó. */
  padInfo(): PadInfo;
  /** Mở chế độ xây dựng (dừng thời gian, kéo thả địa hình). */
  buildMode(): void;
  /** Hỏi server xem có bản mới không. Trả về câu trả lời để hiện ngay. */
  checkUpdate(): Promise<string>;
  /** BUỘC cập nhật: xoá sạch cache, gỡ service worker, tải lại trang. */
  forceUpdate(): Promise<void>;
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
  /** Bảng KHU CHUỒNG / AO — mở bằng nút phụ khi đứng ở chỗ cái khu. */
  openPen(id: string): void;
  /** Bảng nút tay cầm — mở tự động lần đầu nhận ra tay cầm. */
  openPadHelp(): void;
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
  let shopTab: "seed" | "feed" | "build" | "animal" | "worker" = "seed";
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

  /**
   * Hộp XÁC NHẬN của game, thay cho `confirm()` của trình duyệt.
   *
   * `confirm()` chặn cả vòng lặp JS trong lúc nó mở. Với chuột thì không sao,
   * nhưng tay cầm là hệ HỎI VÒNG: `input.poll()` ngừng chạy nghĩa là không nút
   * nào được đọc nữa, và người chơi ngồi nhìn một hộp thoại mà tay cầm không
   * bấm được. Ba việc không quay lui được — bỏ hẳn một món, xoá cache, chơi
   * ván mới — vì thế đều là ngõ cụt.
   *
   * Dựng bằng chính `shell()` thì nó tự thừa hưởng hạ tầng tiêu điểm: D-pad đi
   * lại được, nút ✕ đeo tên nút huỷ, B đóng.
   *
   * `quayLai` là màn phải vẽ lại sau khi chọn xong — hộp xác nhận đứng ĐÈ lên
   * một menu đang mở, mà `shell()` thì xoá sạch `root`, nên phải tự dựng lại.
   */
  function askConfirm(
    title: string,
    text: string,
    onYes: () => void,
    quayLai: (() => void) | null = current,
  ): void {
    const { body, foot } = shell(title, "", "sheet ask");
    body.appendChild(note(text));
    const g = document.createElement("div");
    g.className = "grid2";
    g.appendChild(
      mkBtn("Thôi", () => {
        if (quayLai) quayLai();
        else close();
      }, "dim"),
    );
    g.appendChild(
      mkBtn("Đồng ý", () => {
        onYes();
      }, "primary"),
    );
    foot.appendChild(g);
    /* Tiêu điểm rơi vào nút "Thôi" trước — nút đầu tiên trong khung. Với một
       câu hỏi không quay lui được thì mặc định an toàn phải là KHÔNG. */
  }

  function shell(title: string, sub: string, cls = ""): Shell {
    root.innerHTML = "";
    const modal = document.createElement("div");
    modal.className = `modal ${cls}`;
    /* KHOÁ MÀN. `title` là thứ duy nhất mọi màn đều có và không đổi giữa hai
       lần vẽ lại của CÙNG một màn — nên nó đủ để trả lời câu hỏi mà main.ts
       cần: "tấm sheet vừa xuất hiện là màn cũ vẽ lại, hay là một màn khác?".
       Cũ thì tìm lại đúng nút người chơi đang đứng; khác thì về nút đầu. */
    modal.dataset["menu"] = title;
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

  /**
   * Nút có ICON PIXEL đứng trước chữ.
   *
   * Cố ý không dùng emoji: emoji là FONT của hệ điều hành, nên cùng một ký tự
   * ra một hình trên iPhone, một hình khác trên Android, và trên vài máy thì
   * ra ô vuông rỗng. Trong một game mà từng điểm ảnh đều do mình vẽ, một cái
   * emoji bóng loáng nằm giữa menu là thứ lộ ra ngay.
   */
  const iconBtn = (name: UiIcon, label: string, fn: () => void, cls = "") => {
    const b = mkBtn("", fn, `ico-btn ${cls}`.trim());
    const src = atlas.ui(name);
    const c = document.createElement("canvas");
    c.width = src.width;
    c.height = src.height;
    c.getContext("2d")!.drawImage(src, 0, 0);
    c.className = "bi";
    const t = document.createElement("span");
    t.textContent = label;
    b.append(c, t);
    return b;
  };

  /**
   * Ô VUÔNG icon-trên-chữ. Menu tạm dừng có mười một mục; xếp thành nút một
   * hàng thì cao bảy hàng và tràn quá một màn hình điện thoại — nên "Chơi mới",
   * nút nguy hiểm nhất, lại phải cuộn mới thấy. Ô vuông ba cột thì cả menu gọn
   * trong bốn hàng và mắt quét một lượt là hết.
   */
  const tileBtn = (name: UiIcon, label: string, fn: () => void, cls = "") => {
    const b = mkBtn("", fn, `tile ${cls}`.trim());
    const src = atlas.ui(name);
    const c = document.createElement("canvas");
    c.width = src.width;
    c.height = src.height;
    c.getContext("2d")!.drawImage(src, 0, 0);
    c.className = "bi";
    const t = document.createElement("span");
    t.textContent = label;
    b.append(c, t);
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

  /** MỘT dòng nói công trình này làm gì. Suy từ `effects` chứ không chép tay,
   *  nên thêm hiệu ứng mới trong content là thẻ tự có chữ. */
  function tomTatCongTrinh(b: Content["buildings"][string]): string {
    const e = b.effects ?? {};
    const y: string[] = [];
    if (e.waterRadius) y.push(`tưới ${e.waterRadius * 4} ô kề`);
    if (e.autoWet) y.push("luôn ẩm");
    if (e.allSeason) y.push("mọi mùa");
    if (e.speedMul) y.push(`đi nhanh ×${e.speedMul}`);
    if (y.length) return y.join(" · ");
    return b.kind === "floor" ? "lát nền" : "công trình";
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
    // Nhãn NGẮN: năm tab mà nhãn hai chữ thì chúng xuống dòng, và hàng tab cao
    // gần bằng một hàng hàng hoá — trong khi nó chỉ là cái để chọn chỗ đứng.
    mkTab("seed", "Hạt");
    mkTab("feed", "Thức ăn");
    mkTab("build", "Xây");
    mkTab("animal", "Vật nuôi");
    mkTab("worker", "Thợ");
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
        const days = crop.growthDays.reduce((a, b) => a + b, 0);
        grid.appendChild(
          buyCard({
            art: `plant:${id}`,
            name: crop.name,
            subs: [`${days}n · ${money(crop.sellPrice)}${crop.regrowDays ? " ↻" : ""}`],
            price: money(crop.seedPrice),
            disabled: s.money < crop.seedPrice,
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
    } else if (shopTab === "feed") {
      /* THỨC ĂN mua được. Có tab này vì nuôi mà chỉ trông vào việc đi cắt cỏ
         là một ngõ cụt: hết cỏ quanh chuồng thì cả đàn chết dù trong túi đầy
         tiền. Mua thì đắt hơn tự cắt — đó là chỗ đánh đổi, không phải chỗ
         thay thế. Món nào loài nào ăn được thì ghi thẳng lên thẻ. */
      const gf = cardGrid();
      let coMon = 0;
      for (const id of c.materialOrder) {
        const m = c.materials[id]!;
        const gia = m.buyPrice ?? 0;
        if (gia <= 0) continue;
        coMon++;
        const an = c.animalOrder
          .filter((a) => c.animals[a]?.job !== "pest" && c.animals[a]?.feed.includes(`item:${id}`))
          .map((a) => c.animals[a]!.name);
        gf.appendChild(
          buyCard({
            art: `item:${id}`,
            name: m.name,
            subs: [an.length ? (an.length > 2 ? `cho ${an.length} loài` : `cho ${an.join(", ")}`) : "chưa loài nào ăn"],
            price: money(gia),
            disabled: s.money < gia,
            onClick: () => {
              h.buy(`item:${id}`, 1);
              openShop();
            },
          }),
        );
      }
      body.appendChild(gf);
      foot.appendChild(
        note(
          coMon
            ? "Đổ vào MÁNG trong khu chuồng để cả đàn ăn dần, hoặc đứng cạnh con vật bấm CHO ĂN. Cá thì đứng bờ ao bấm CHO CÁ ĂN."
            : "Chưa có thức ăn nào bày bán.",
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
        const sanPham = a.products.map((p) => itemLabel(p.id, c)).join(", ");
        const thit = a.meat ? itemLabel(a.meat.id, c) : null;
        ga.appendChild(
          buyCard({
            art: `animal:${id}`,
            name: a.name,
            // Trên thẻ hẹp thì mỗi dòng phải NGẮN. Gộp hết vào một dòng dài như
            // bản danh sách cũ là chữ tràn ra ba dòng và lưới cao thấp lởm chởm.
            /* MỘT dòng: thứ người chơi cần để quyết định mua hay không là nó
               CHO RA CÁI GÌ. Ăn gì và về khu nào đọc được ở bảng Vật nuôi và
               trang Thư viện — nhồi cả ba vào một ô 88px thì ô nào cũng ba
               dòng chữ vụn và cả lưới cao thấp lởm chởm. */
            subs: [sanPham || thit || "nuôi lấy thịt"],
            price: money(a.price),
            disabled: s.money < a.price,
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
        // Hàng rào là ĐỊA HÌNH dựng sẵn của các khu chuồng, không phải hàng.
        // Để nó nằm trong bảng giá thì người chơi sẽ đi tìm chỗ mua cho bằng
        // được — một cuộc đi tìm không có đích.
        if (b.buildable === false) continue;
        /* KHÔNG có nút Mua nữa: công trình trả tiền theo SỐ Ô VẼ trong chế độ
           xây dựng. Bán theo chồng thì người chơi phải đoán "cần bao nhiêu ô
           rào" trước khi vẽ, mà đoán sai con số đó chính là lý do người ta ngại
           vẽ dài. Tab này giờ là BẢNG GIÁ: xem có gì, bao nhiêu một ô. */
        gb.appendChild(
          buyCard({
            art: `build:${id}`,
            name: b.name,
            // MỘT dòng tóm tắt, suy từ `effects`. Nhồi cả `desc` vào ô rộng
            // 88px thì mỗi thẻ thành một cột chữ tám dòng — đúng cái làm bảng
            // giá trông rối. Đoạn mô tả đầy đủ nằm ở trang Thư viện.
            subs: [tomTatCongTrinh(b)],
            price: `${money(b.price)}/ô`,
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
            "cả một đoạn, vẽ bao nhiêu ô thì trả tiền bấy nhiêu. ",
        ),
      );
    }
  }

  /* --------------------------------------------------------- QUẦY THU MUA */
  /* --------------------------------------------------------------- KHO */
  /**
   * BẢNG KHU — trả lời đúng câu hỏi người chơi hỏi khi đi ngang một cái chuồng:
   * "ở đây có việc gì phải làm không?".
   *
   * Trước đây câu đó chỉ trả lời được bằng cách đi tới bấm vào TỪNG con một:
   * ba mươi con gà là ba mươi lần bấm chỉ để biết có quả trứng nào chưa. Bảng
   * này gom lại theo LOÀI (người chơi đếm theo loài, không đếm theo con) và
   * đặt ngay cạnh đó hai việc chiếm gần hết thời gian ở chuồng: đổ máng và thu
   * sản phẩm.
   *
   * Cố ý KHÔNG có nút bán/mổ thịt: đó là việc không quay lui được, và một nút
   * không quay lui được nằm cạnh hai nút bấm hàng ngày là một cái bẫy. Bán thịt
   * vẫn ở bảng của TỪNG con, nơi người chơi đã nhìn thẳng vào con vật đó.
   */
  function openPen(id: string) {
    current = () => openPen(id);
    const s = getState();
    const c = getContent();
    const pen = (c.tiles.pens ?? []).find((p) => p.id === id);
    if (!pen) {
      close();
      return;
    }
    const tt = penSummary(s, c, pen);
    const camId = s.inv[s.sel]?.id ?? null;
    const doDuoc = !!tt.mang && !!camId && tt.feeds.includes(camId) && tt.mang.n < tt.mang.max;

    const { body, foot } = shell(
      tt.name,
      tt.n === 0
        ? "Chưa có con nào"
        : `${tt.n} con${tt.doi ? ` · ${tt.doi} đang đói` : ""}${tt.toiLua ? ` · ${tt.toiLua} tới lứa` : ""}`,
      "sheet",
    );

    if (tt.mang) {
      const day = tt.mang.n >= tt.mang.max;
      body.appendChild(
        note(
          `Máng: ${tt.mang.n}/${tt.mang.max} phần` +
            (day ? " — đã đầy" : doDuoc ? "" : ` · cầm ${tt.feeds.map((f: string) => itemLabel(f, c)).join(" / ")} để đổ`),
        ),
      );
    } else if (tt.swim) {
      body.appendChild(
        note(`Ao không có máng — đứng bờ, cầm ${tt.feeds.map((f: string) => itemLabel(f, c)).join(" / ")} rồi rắc xuống nước.`),
      );
    }

    const g = document.createElement("div");
    g.className = "grid2";
    if (tt.mang)
      g.appendChild(
        mkBtn(
          "Đổ máng",
          () => {
            h.penPour(id);
            openPen(id);
          },
          doDuoc ? "primary" : "dim",
        ),
      );
    g.appendChild(
      mkBtn(
        tt.toiLua ? `Thu tất cả (${tt.toiLua})` : "Thu tất cả",
        () => {
          h.penGather(id);
          openPen(id);
        },
        tt.toiLua ? "accent" : "dim",
      ),
    );
    body.appendChild(g);

    if (tt.loai.length === 0) body.appendChild(note("Mua vật nuôi ở cửa hàng — xe sẽ chở tới tận nơi."));
    for (const l of tt.loai) {
      const row = document.createElement("div");
      row.className = "row";
      const left = document.createElement("div");
      left.className = "info";
      const ic = c.animals[l.def];
      left.innerHTML =
        `<div class="name">${l.name} ×${l.n}</div>` +
        `<div class="desc">` +
        [
          l.toiLua ? `${l.toiLua} tới lứa` : "",
          l.doi ? `${l.doi} đói` : "",
          l.chuaLon ? `${l.chuaLon} chưa lớn` : "",
          !l.toiLua && !l.doi && !l.chuaLon ? "đang khoẻ" : "",
        ]
          .filter(Boolean)
          .join(" · ") +
        (ic?.products.length ? ` · cho ${ic.products.map((q) => itemLabel(q.id, c)).join(", ")}` : "") +
        `</div>`;
      row.appendChild(left);
      body.appendChild(row);
    }

    foot.appendChild(mkBtn("Đóng", close, "dim"));
  }

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
  /**
   * Bỏ cú `click` đi kèm sau một lần KÉO THẢ, bằng một cửa sổ thời gian ngắn.
   *
   * Phải sống ngoài `openBag`: chính lần dựng lại bảng sau khi kéo đã xoá mọi
   * biến bên trong hàm đó.
   *
   * Và phải là MỐC THỜI GIAN chứ không phải một cờ bật/tắt. Cú `click` sau khi
   * nhả chuột KHÔNG chắc chắn xảy ra — bảng vừa được dựng lại nên trình duyệt
   * có thể đổi đích hoặc bỏ hẳn nó. Cờ bật lên mà không ai tắt thì nó nằm lại
   * và nuốt đúng cú chạm hợp lệ TIẾP THEO: kéo một món xong là cú chạm sau đó
   * không ăn, mà chẳng có dấu hiệu gì. Mốc thời gian thì tự hết hạn.
   */
  let boQuaClickToi = 0;

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
      // Ô trống / công cụ cố định: không nhấc được, nên không mở phiên kéo.
      // Việc chạm-chọn để `click` lo — xem chú thích ở chỗ gắn sự kiện.
      if (!s.inv[i] || i < 2) return;
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
      // Chạm rồi nhả mà KHÔNG kéo: để `click` lo, đừng làm gì ở đây.
      if (!d.moved) return;
      const to = slotAt(e.clientX, e.clientY);
      if (to >= 0 && to !== d.from) {
        picked = -1;
        h.swap(d.from, to);
      }
      /* Vừa KÉO xong nên menu sắp được dựng lại — bỏ cú `click` đi kèm. Không
         bỏ thì nó rơi vào ô nằm ở đúng toạ độ đó TRONG BẢNG MỚI (một ô khác
         hẳn) và nhấc nhầm món. */
      boQuaClickToi = performance.now() + 350;
      openBag();
    };
    /* PHÂN VAI DỨT KHOÁT giữa hai đường vào:
         · chuỗi POINTER chỉ lo việc KÉO THẢ;
         · `click` lo việc CHẠM-CHỌN — và chỉ mình nó.

       Vì sao không để `pointerup` lo chạm-chọn như trước: tay cầm bấm nút A
       bằng `el.click()`, mà một `click` do script tạo ra không kèm
       `pointerdown`/`pointerup` nào — nên cả màn Balo là màn chết với tay cầm.
       Nhưng thêm `click` bên cạnh `pointerup` thì hỏng đường chạm: `pointerup`
       vẽ lại bảng ngay lập tức, rồi cú `click` đi sau rơi vào ô nằm ở ĐÚNG
       TOẠ ĐỘ ĐÓ trong bảng MỚI — một ô khác hẳn — và món bị đổi chỗ thay vì
       được nhấc. Tôi đã đo đúng cảnh đó: chạm ô 2, click rơi vào ô 13.

       Giao hẳn cho `click` thì cả hai đường đi chung một cửa, và cú chạm thật
       không còn vẽ lại gì trước khi `click` kịp bắn. Chỉ đường KÉO mới phải
       chặn cú click đi kèm — xem `boQuaClickToi`. */
    const onClick = (e: MouseEvent) => {
      if (performance.now() < boQuaClickToi) {
        boQuaClickToi = 0;
        return;
      }
      const el = (e.target as HTMLElement).closest<HTMLElement>(".bslot");
      if (!el?.dataset["slot"]) return;
      tapSlot(+el.dataset["slot"]);
    };
    for (const g of [gHot, gBag]) {
      g.addEventListener("pointerdown", onDown);
      g.addEventListener("pointermove", onMove);
      g.addEventListener("pointerup", onUp);
      g.addEventListener("pointercancel", onUp);
      g.addEventListener("click", onClick);
    }

    foot.appendChild(
      note(
        picked >= 0
          ? "Chạm ô đích để đổi chỗ, hoặc bấm BỎ MÓN NÀY để vứt đi."
          : "Chạm một món để chọn. Hai ô công cụ đầu (cuốc, bình) cố định.",
      ),
    );

    /* BỎ MÓN. Túi có 24 ô và không có cách nào dọn: nhặt phải một chồng gỗ vụn
       hay mua nhầm hạt trái mùa là ô đó chiếm chỗ tới hết ván, mà quầy thu mua
       thì không nhận mọi thứ. Nút này chỉ hiện khi đã CHỌN một món — nút vứt
       lúc nào cũng nằm đó là nút chỉ chờ bấm nhầm. */
    const chon = picked >= 0 ? s.inv[picked] : null;
    const g2 = document.createElement("div");
    g2.className = "grid2";
    if (chon && picked >= 2) {
      g2.appendChild(
        mkBtn(`Bỏ ${nameOf(chon.id)}${chon.n > 1 ? ` ×${chon.n}` : ""}`, () => {
          const ten = `${nameOf(chon.id)}${chon.n > 1 ? ` ×${chon.n}` : ""}`;
          askConfirm(`Bỏ hẳn ${ten}?`, "Món này biến mất khỏi túi và không lấy lại được.", () => {
            const i = picked;
            picked = -1;
            h.drop(i);
            openBag();
          }, openBag);
        }, "dim"),
      );
    }
    g2.appendChild(mkBtn("Đóng", () => {
      picked = -1;
      close();
    }, "primary"));
    foot.appendChild(g2);
  }

  /* ------------------------------------------------------------ GỠ LỖI */

  /* ------------------------------------------------------- BẢNG NÚT TAY CẦM */

  /**
   * Sơ đồ nút, mở TỰ ĐỘNG lần đầu game nhận ra tay cầm.
   *
   * Không tự mở thì người chơi cắm tay cầm vào, bấm loạn vài nút, thấy nhân vật
   * nhúc nhích rồi tự kết luận "chắc chỉ đi được thôi" — và không bao giờ biết
   * Y mở cửa hàng. Một màn hình đọc mười giây đổi lấy chuyện đó là đáng.
   */
  function openPadHelp() {
    current = openPadHelp;
    const info = h.padInfo();
    const ten = (i: number) => padButtonName(info, i);
    const { body } = shell(
      info.connected ? "Đã nhận tay cầm" : "Tay cầm",
      info.connected
        ? `${info.id.replace(/\s*\(.*?\)\s*$/, "") || "Không rõ tên"} · ${info.buttons} nút · ${info.axes} trục`
        : "Chưa thấy tay cầm nào",
      "sheet",
    );

    if (window.innerWidth < window.innerHeight)
      body.appendChild(
        note(
          "Bạn đang cầm máy DỌC. Xoay NGANG để thấy rộng hơn hẳn — chơi tay cầm thì " +
            "không cần chừa chỗ cho ngón tay nữa, cả màn hình dành cho nông trại.",
          "sub warn",
        ),
      );

    if (info.connected && !info.standard)
      body.appendChild(
        note(
          "Trình duyệt KHÔNG nhận ra sơ đồ nút chuẩn của tay cầm này, nên game chỉ " +
            "dùng cần gạt và hai nút mặt đầu tiên — gán bừa các nút còn lại thì bấm " +
            "một đằng ra một nẻo. Cắm qua cổng USB, hoặc thử trình duyệt khác, thường " +
            "là nhận đúng.",
          "sub warn",
        ),
      );

    /* Bảng này dựng TỪ `PAD_MAP` chứ không gõ tay lại. Gõ tay lại là hai bản
       sao của cùng một sơ đồ, và chúng trôi khỏi nhau ngay lần sửa đầu tiên —
       đúng cái đã xảy ra: màn hình quảng cáo "Đẩy mạnh là chạy" và "cò phải =
       dùng" trong khi máy làm khác.

       Chỉ bày những nút tay cầm THẬT SỰ có. Quảng cáo "L3 mở chế độ xây" trên
       một tay cầm mười nút là hướng dẫn người chơi đi bấm một cái không tồn
       tại — tệ hơn hẳn so với không nhắc tới nó. */
    const co = (m: PadBind) =>
      info.connected && (!m.canStd || info.standard) && (!m.canStd || m.nut < info.buttons);
    const map: [string, string][] = [
      ["Cần trái / D-pad", "Đi."],
      ["Cần phải", "Rê ô ngắm — cày/gieo/thu ô chéo mà không phải xoay người."],
    ];
    for (const m of PAD_MAP) if (co(m)) map.push([ten(m.nut), m.mo]);
    /* Gộp một dòng cho mỗi NGỮ CẢNH. Hai dòng cùng nhãn "Trong menu" xếp liền
       nhau đọc ra như một lỗi sao chép, và mắt phải đọc cả hai mới biết chúng
       nói hai chuyện khác nhau. */
    map.push([
      "Trong menu",
      `Cần gạt chuyển ô, ${ten(0)} chọn, ${ten(1)} thoát. Cần phải cuộn.` +
        (info.standard ? ` ${ten(4)} / ${ten(5)} đổi tab.` : ""),
    ]);
    map.push([
      "Khi xây dựng",
      `Cần phải rê ô, ${ten(0)} đặt mốc rồi ${ten(0)} lần nữa để xây, ${ten(1)} huỷ.` +
        (info.standard ? ` ${ten(4)} / ${ten(5)} đổi công trình.` : ""),
    ]);

    const grid = document.createElement("div");
    grid.className = "pad-map";
    for (const [nut, y] of map) {
      const b = document.createElement("b");
      b.textContent = nut;
      const t = document.createElement("span");
      t.textContent = y;
      grid.append(b, t);
    }
    body.appendChild(grid);
    body.appendChild(mkBtn("Bắt đầu chơi", () => close(), "primary"));
  }

  /* ---------------------------------------------------- SAVE RA / VÀO FILE */
  function openSaveFile() {
    current = openSaveFile;
    const { body } = shell("Save ra / vào file", "Mang tiến trình sang máy khác", "sheet");
    const g = document.createElement("div");
    g.className = "grid2";
    g.append(
      iconBtn("file", "Xuất ra file", () => h.exportSave(), "primary"),
      iconBtn("file", "Nhập từ file", () => h.importSave()),
    );
    body.appendChild(g);
    body.appendChild(
      note("File save là JSON thuần — mở xem được, chép đi đâu cũng nhập lại được."),
    );
    body.appendChild(mkBtn("← Quay lại", () => openPause()));
  }

  /* ------------------------------------------------------------- CẬP NHẬT */
  function openUpdate() {
    current = openUpdate;
    const info = h.contentInfo();
    const c = getContent();
    const { body } = shell(
      "Cập nhật",
      `Nội dung ${info.version} (${info.source}) · core ${CORE_VERSION}`,
      "sheet",
    );

    const upNote = note(
      info.pending
        ? `Đã tải về nội dung ${info.pending} — bấm "Cập nhật ngay" để áp dụng.`
        : "Đang chạy bản mới nhất đã tải về. Game tự tìm bản mới khi có mạng.",
    );
    body.appendChild(upNote);

    const row = document.createElement("div");
    row.className = "grid2";
    const btnCheck = iconBtn("reload", "Kiểm tra", async () => {
      btnCheck.disabled = true;
      upNote.textContent = "Đang hỏi máy chủ…";
      upNote.textContent = await h.checkUpdate();
      btnCheck.disabled = false;
    });
    row.append(
      btnCheck,
      iconBtn("install", "Cập nhật ngay", () => {
        // Xoá sạch cache rồi tải lại — phải hỏi, và phải nói rõ save không mất
        // (save nằm ở IndexedDB, không nằm trong cache).
        askConfirm(
          "Xoá bộ nhớ đệm và tải lại?",
          "Tải về bản mới nhất. Tiến trình đã lưu KHÔNG mất — save nằm ở chỗ khác, không nằm trong bộ nhớ đệm.",
          () => void h.forceUpdate(),
        );
      }, "primary"),
    );
    body.appendChild(row);

    if (info.source === "ota")
      body.appendChild(
        mkBtn(c.strings.ui["contentRevert"] ?? "Hoàn tác về bản đóng kèm", () => {
          h.revertContent();
          close();
        }, "dim"),
      );

    body.appendChild(mkBtn("← Quay lại", () => openPause()));
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

    /* MỘT lưới ô vuông cho tất cả. Trước đây menu này là bốn khối rời (lưới
       lưu/tải, danh sách chức năng, ghi chú cập nhật, hai nút cập nhật) — bốn
       nhịp đọc cho một việc duy nhất là "tôi muốn bấm cái gì". */
    const tiles = document.createElement("div");
    tiles.className = "menu-tiles";
    tiles.append(
      tileBtn("build", "Xây dựng", () => {
        close();
        h.buildMode();
      }, "accent"),
      tileBtn("bag", "Balo", () => openBag()),
      tileBtn("gear", "Cài đặt", () => openSettings()),
      tileBtn("save", c.strings.ui["save"] ?? "Lưu game", () => h.save(), "primary"),
      tileBtn("load", c.strings.ui["load"] ?? "Tải game", () => h.load()),
      tileBtn("file", "Save ra/vào", () => openSaveFile()),
      tileBtn("help", "Hướng dẫn", () => openHelp()),
      tileBtn("reload", "Cập nhật", () => openUpdate()),
      tileBtn("bug", "Gỡ lỗi", () => {
        close();
        h.toggleDevPanel();
      }, "dim"),
    );
    if (h.canInstall()) tiles.appendChild(tileBtn("install", "Cài về máy", () => h.install(), "accent"));
    body.appendChild(tiles);

    // Chỉ còn nhắc khi THẬT SỰ có bản đang chờ — dòng này từng hiện vĩnh viễn
    // vì `pendingContentVersion` trả về cả bản đang chạy.
    if (info.pending)
      body.appendChild(note(`Có nội dung ${info.pending} đang chờ — mở Cập nhật để áp dụng.`));

    if (info.source === "ota") {
      body.appendChild(
        mkBtn(c.strings.ui["contentRevert"] ?? "Hoàn tác về bản đóng kèm", () => {
          h.revertContent();
          close();
        }, "dim"),
      );
    }

    body.appendChild(
      mkBtn(
        c.strings.ui["newGame"] ?? "Chơi mới",
        () => {
          askConfirm("Bắt đầu nông trại mới?", "Tiến trình chưa lưu sẽ mất.", () => {
            h.newGame();
            close();
          });
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
    /* Chỉ hiện khi ĐANG CẮM tay cầm. Bày một mục "vùng chết cần gạt" cho người
       chơi bằng chuột là bắt họ đọc một câu chẳng nói gì về máy của họ. */
    if (h.padInfo().connected)
      seg(
        "Vùng chết cần gạt",
        "Cần gạt mòn thì nghỉ lệch tâm và nhân vật tự đi mãi. Nới rộng nếu máy bạn bị vậy.",
        "padDead",
        [
          { v: "hep", label: "Hẹp" },
          { v: "normal", label: "Vừa" },
          { v: "rong", label: "Rộng" },
        ],
      );
    if (h.padInfo().connected) {
      const t = (i: number) => padButtonName(h.padInfo(), i);
      toggle(`Đổi ${t(0)} với ${t(1)}`, "Cho ai quen tay cầm Nintendo: nút xác nhận đổi chỗ với nút huỷ.",
        () => h.settings().padSwapAB, (v) => h.setSetting("padSwapAB", v));
      toggle(`Đổi ${t(2)} với ${t(3)}`, "Đổi nốt hai nút mặt còn lại.",
        () => h.settings().padSwapXY, (v) => h.setSetting("padSwapXY", v));
      toggle("Đảo trục Y cần ngắm", "Gạt cần phải lên thì con trỏ đi xuống. Chỉ đụng cần NGẮM, không đụng cần đi.",
        () => h.settings().padInvertY, (v) => h.setSetting("padInvertY", v));
    }
    toggle("Nút hành động theo ngữ cảnh", "Nút chính hiện CÀY / GIEO / TƯỚI… thay vì chữ DÙNG cố định.",
      () => h.settings().contextButton, (v) => h.setSetting("contextButton", v));
    toggle("Âm thanh", "Tiếng 8-bit tổng hợp, không có file nhạc.",
      () => !h.isMuted(), () => h.toggleMute());
    /* Một công tắc cho CẢ HAI đường rung. Trước đây nó chỉ tắt rung điện
       thoại, tay cầm vẫn rung — và mục này còn bị giấu khi chơi bằng tay cầm
       trên máy tính, tức là không có cách nào tắt. */
    if (touch || h.padInfo().connected)
      toggle("Rung khi thao tác", "Rung nhẹ khi cày/gieo/tưới thành công — cả điện thoại lẫn tay cầm.",
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
        <p><b>Hiện đại hoá:</b> có tiền là mua được ngay, không phải mở khoá gì —
        vòi tưới tự động (mỗi sáng tự tưới quanh nó) và sàn nhà kính (ô luôn ẩm).</p>
      </div>`;
    foot.appendChild(mkBtn("Đã hiểu", close, "primary wide"));
  }

  return {
    isOpen: () => root.classList.contains("open"),
    close,
    openShop,
    openPadHelp,
    openSell,
    openStore,
    openCraft,
    openPause,
    openSettings,
    openBag,
    openHelp,
    openPen,
    refresh: () => current?.(),
  };
}

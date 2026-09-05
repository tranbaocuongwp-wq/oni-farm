/* ============================================================================
   HUD — thanh trạng thái, mục tiêu, hotbar, nút hành động theo ngữ cảnh.

   Chỉ đọc state. Cập nhật theo kiểu "so rồi mới sửa": chỉ ghi vào DOM khi giá
   trị thật sự đổi. HUD được gọi mỗi khung hình nên nếu ghi vô điều kiện thì
   trình duyệt phải tính lại layout 60 lần/giây một cách vô ích.

   Bố cục thiết kế lại cho điện thoại:

     ┌ tiền · ngày/giờ · năng lượng · nước ───────────────── [☰] ┐   ← thanh trên, 1 hàng
     │ 🎯 mục tiêu (chip, bấm để ẩn/hiện)                        │
     │                                                            │
     │                    (thế giới)                              │
     │                                                            │
     │ [bản đồ nhỏ]                        [E]  [ CÀY ]           │   ← nút hành động
     └────────── [hotbar 9 ô, ô to ≥ 44px] ──────────────────────┘

   · Thanh trên gom MỌI con số vào một hàng có icon, thay vì một hộp 5 dòng chữ
     che mất góc ruộng.
   · Mục tiêu là một "chip" bấm được: mặc định hiện, bấm là thu gọn.
   · Nút hành động chính đổi NHÃN theo ô đang ngắm (CÀY/GIEO/TƯỚI/THU/MUA…).
     Nhãn do src/game/hint.ts tính — HUD chỉ in.
   · Năng lượng thấp / nước cạn: vòng đỏ nhấp nháy quanh con số, không cần
     đọc chữ.
============================================================================ */

import type { Content, GameState } from "../game/types.ts";
import { itemName } from "../game/items.ts";
import { currentSeason, dayOfSeason } from "../game/season.ts";
import type { Atlas, UiIcon } from "../art/atlas.ts";
import type { Hint } from "../game/hint.ts";
import type { AnimalStats } from "../game/animals.ts";
import type { WorkerCard } from "../game/workers.ts";

export interface Hud {
  update(
    s: GameState,
    content: Content,
    hint: Hint | null,
    /** Việc NÚT TƯƠNG TÁC sẽ làm — nhãn riêng, vì nó là một nút khác. */
    iHint: { label: string } | null,
  ): void;
  /** Tên nút "dùng" của tay cầm đang cắm (A / ✕ / B…). Rỗng = không có tay cầm. */
  /** hotbar bấm được bằng chuột/chạm */
  onSelect(fn: (slot: number) => void): void;
  /** nút balo cạnh hotbar */
  onBag(fn: () => void): void;
  /** Hiện thẻ "Ngày N" khi sang ngày mới. */
  dayBanner(day: number, note?: string): void;
  /**
   * Bảng thống kê một con vật. `null` = ẩn đi.
   *
   * CHỈ hiện khi người chơi CHẠM vào con vật — không tự bật khi đi ngang qua.
   * Bản đầu tự hiện mỗi lần đứng gần, và trên điện thoại nó che mất một phần
   * tư màn hình đúng lúc đang cần nhìn ruộng.
   */
  showAnimal(st: AnimalStats | WorkerCard | null): void;
  /** Người chơi bấm × trên bảng vật nuôi. */
  onAnimalClose(fn: () => void): void;
  /** Người chơi bấm ‹ hoặc › để xem con kế bên. */
  onAnimalCycle(fn: (d: number) => void): void;
}

/** 360 → "6:00", 1290 → "21:30", 1500 → "1:00" (qua nửa đêm) */
export function formatClock(minutes: number): string {
  const total = Math.floor(minutes / 10) * 10;
  const h24 = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${h24}:${String(m).padStart(2, "0")}`;
}

export function itemLabel(id: string, content: Content): string {
  const [kind, ref] = id.split(":") as [string, string];
  switch (kind) {
    case "tool":
      return content.tools[ref]?.name ?? ref;
    case "seed":
      return content.crops[ref]?.seedName ?? ref;
    case "crop":
      return content.crops[ref]?.name ?? ref;
    case "build":
      return content.buildings[ref]?.name ?? ref;
    case "item":
      return content.materials[ref]?.name ?? ref;
    default:
      return id;
  }
}

/** Mô tả ngắn cho tooltip nhấn giữ trên hotbar. */
export function itemHint(id: string, content: Content): string {
  const [kind, ref] = id.split(":") as [string, string];
  switch (kind) {
    case "tool": {
      const t = content.tools[ref];
      if (!t) return "";
      if (t.action === "TILL") return "Cày ô cỏ thành luống";
      if (t.action === "WATER") return `Tưới luống · chứa ${t.capacity ?? 0} nước`;
      if (t.action === "CHOP") return `Chặt cây lấy gỗ · ${t.power ?? 1} nhát/lần`;
      if (t.action === "MINE") return `Đập đá lấy đá · ${t.power ?? 1} nhát/lần`;
      return "";
    }
    case "seed": {
      const c = content.crops[ref];
      if (!c) return "";
      const days = c.growthDays.reduce((a, b) => a + b, 0);
      return `Gieo lên luống đã cày · ${days} ngày · bán ${c.sellPrice}đ`;
    }
    case "crop": {
      const c = content.crops[ref];
      return c ? `Bán ${c.sellPrice}đ/cái ở quầy thu mua` : "";
    }
    case "build": {
      const b = content.buildings[ref];
      return b ? b.desc : "";
    }
    case "item": {
      const m = content.materials[ref];
      return m ? `Vật liệu chế tạo · bán ${m.sellPrice}đ` : "";
    }
    default:
      return "";
  }
}

export function createHud(root: HTMLElement, atlas: Atlas): Hud {
  root.innerHTML = `
    <div class="hud-top">
      <div class="stat-bar" role="status" aria-live="off">
        <span class="stat money"><i class="ic" data-ic="coin"></i><b id="hud-money">0</b></span>
        <span class="stat day"><i class="ic" data-ic="day"></i><span id="hud-day">1</span></span>
        <span class="stat clock"><i class="ic" data-ic="sun" id="hud-clock-ic"></i><span id="hud-clock">6:00</span></span>
        <span class="stat energy" id="hud-energy-stat">
          <i class="ic" data-ic="energy"></i>
          <span class="meter" id="hud-bar"><i style="width:100%"></i></span>
          <span id="hud-energy">100</span>
        </span>
        <span class="stat water" id="hud-water-line"><i class="ic" data-ic="water"></i><span id="hud-water">0</span></span>
        <span class="stat weather" id="hud-wx-line" title="Thời tiết hôm nay · dự báo ngày mai"><i class="ic" id="hud-wx"></i><span id="hud-wx-name"></span><i class="ic next" id="hud-wx-next"></i></span>
      </div>
      <button class="goal-chip" id="goal-box" type="button" aria-label="Mục tiêu hiện tại">
        <i class="ic" data-ic="goal"></i><span id="goal">—</span>
      </button>
      <div id="toasts" aria-live="polite"></div>
    </div>
    <div class="hud-mid">
      <div class="mid-col">
        <div id="animal-card" class="animal-card" hidden></div>
        <div id="minimap" class="minimap"><canvas></canvas></div>
      </div>
    </div>
    <div class="hud-bottom">
      <!-- Tên thứ vừa cầm lên. Hiện một nhịp rồi tự mờ đi: đổi ô hotbar mà
           không có gì cho biết vừa cầm cái gì thì người chơi phải nhìn xuống
           đếm ô, hoặc bấm thử rồi xem chuyện gì xảy ra. -->
      <div id="selname" class="selname" hidden></div>
      <div class="hotbar-wrap">
        <div id="hotbar" class="hotbar" role="toolbar" aria-label="Hotbar"></div>
        <button type="button" id="bag-btn" class="bag-btn" aria-label="Mở balo"><i class="ic" data-ic="bag"></i><span class="n" id="bag-count"></span></button>
      </div>
      <!-- Thanh gợi ý của CHẾ ĐỘ TAY CẦM. Nằm ngay DƯỚI hotbar, trong luồng,
           không trôi nổi trên mặt ruộng: bản cũ để nó ở góc dưới-phải, đúng chỗ
           cụm nút đang đứng, nên hai thứ đè lên nhau và cùng in ra chữ "DÙNG". -->
      <div id="padctx" class="padctx"></div>
    </div>
    <div id="tip" class="tip" hidden></div>
    <div id="day-banner" class="day-banner" hidden><b></b><span></span></div>`;

  // icon HUD lấy từ atlas — cùng bộ pixel với thế giới
  for (const el of root.querySelectorAll<HTMLElement>("i.ic[data-ic]")) {
    const name = el.dataset["ic"] as Parameters<Atlas["ui"]>[0];
    const src = atlas.ui(name);
    const c = document.createElement("canvas");
    c.width = src.width;
    c.height = src.height;
    c.getContext("2d")!.drawImage(src, 0, 0);
    el.appendChild(c);
  }

  const $ = <T extends HTMLElement>(id: string) => root.querySelector(`#${id}`) as T;
  const elMoney = $("hud-money");
  const elDay = $("hud-day");
  const elClock = $("hud-clock");
  const elClockIc = $("hud-clock-ic");
  const elEnergy = $("hud-energy");
  const elEnergyStat = $("hud-energy-stat");
  const elBar = $("hud-bar");
  const elBarFill = elBar.querySelector("i") as HTMLElement;
  const elWater = $("hud-water");
  const elWaterLine = $("hud-water-line");
  const elGoal = $("goal");
  const elGoalBox = $("goal-box");
  const elWx = $("hud-wx");
  const elWxName = $("hud-wx-name");
  const elWxNext = $("hud-wx-next");
  const putIcon = (host: HTMLElement, src: HTMLCanvasElement) => {
    host.innerHTML = "";
    const c = document.createElement("canvas");
    c.width = src.width;
    c.height = src.height;
    c.getContext("2d")!.drawImage(src, 0, 0);
    host.appendChild(c);
  };
  const elHotbar = $("hotbar");
  const elTip = $("tip");
  const elBanner = $("day-banner");

  let selectFn: (slot: number) => void = () => {};
  let bagFn: () => void = () => {};
  const elBagBtn = $("bag-btn");
  const elBagCount = $("bag-count");
  elBagBtn.addEventListener("click", () => bagFn());
  const prev = {
    money: -1, day: -1, clock: "", night: false, energy: -1, water: -1, cap: -1,
    goal: "", hotbar: "", hint: "", bag: -1, wx: "", sel: "",
  };

  /* ---- tên thứ đang cầm ------------------------------------------------
     Hiện MỘT NHỊP mỗi khi đổi ô hotbar rồi tự mờ. Không phải một nhãn thường
     trực: thứ đang cầm đã có hình trong ô sáng ở hotbar và trong cụm nút, nên
     để chữ nằm đó mãi là chiếm chỗ để nói một thứ đang hiện sẵn. Nhưng ngay
     LÚC ĐỔI thì hình chưa kịp vào mắt — nhất là khi đổi bằng vai tay cầm, lúc
     mắt đang nhìn nhân vật chứ không nhìn hotbar. */
  const elSelName = root.querySelector<HTMLElement>("#selname")!;
  let selTimer = 0;

  const flashSel = (s: GameState, content: Content, hint: Hint | null) => {
    const slot = s.inv[s.sel];
    const ten = slot ? `${itemLabel(slot.id, content)}${slot.n > 1 ? ` ×${slot.n}` : ""}` : "Tay không";
    /* Kèm luôn VIỆC nút ngữ cảnh sẽ làm với thứ vừa cầm.
       Biết mình đang cầm "Hạt cà chua" chưa đủ — câu người chơi thật sự hỏi là
       "bấm nút kia bây giờ thì chuyện gì xảy ra". Ghép hai câu trả lời vào một
       dòng thì đổi ô hotbar xong là biết ngay, khỏi liếc thêm xuống nút. */
    elSelName.textContent = hint?.kind ? `${ten} · ${hint.label}` : ten;
    elSelName.hidden = false;
    elSelName.classList.remove("fade");
    void elSelName.offsetWidth; // ép chạy lại hoạt ảnh
    elSelName.classList.add("fade");
    window.clearTimeout(selTimer);
    selTimer = window.setTimeout(() => {
      elSelName.hidden = true;
    }, 1600);
  };

  /* ---- mục tiêu: chip bấm để thu gọn ---- */
  elGoalBox.addEventListener("click", () => elGoalBox.classList.toggle("collapsed"));

  /* ---- hotbar: chạm chọn, nhấn giữ xem mô tả ---- */
  let holdTimer = 0;
  let holdSlot: HTMLElement | null = null;
  const hideTip = () => {
    elTip.hidden = true;
    holdSlot = null;
  };
  elHotbar.addEventListener("pointerdown", (e) => {
    const slot = (e.target as HTMLElement).closest<HTMLElement>(".slot");
    if (!slot?.dataset["slot"]) return;
    holdSlot = slot;
    clearTimeout(holdTimer);
    holdTimer = window.setTimeout(() => {
      if (holdSlot !== slot) return;
      const name = slot.dataset["name"];
      const desc = slot.dataset["desc"];
      if (!name) return;
      elTip.innerHTML = "";
      const b = document.createElement("b");
      b.textContent = name;
      elTip.appendChild(b);
      if (desc) {
        const d = document.createElement("span");
        d.textContent = desc;
        elTip.appendChild(d);
      }
      elTip.hidden = false;
      // đặt tooltip ngay trên ô đang giữ, kẹp trong khung
      const r = slot.getBoundingClientRect();
      const hr = root.getBoundingClientRect();
      elTip.style.left = `${Math.max(8, Math.min(hr.width - 8, r.left + r.width / 2 - hr.left))}px`;
      elTip.style.bottom = `${hr.bottom - r.top + 8}px`;
    }, 380);
  });
  const endHold = () => {
    clearTimeout(holdTimer);
    window.setTimeout(hideTip, 900);
  };
  elHotbar.addEventListener("pointerup", endHold);
  elHotbar.addEventListener("pointercancel", endHold);
  elHotbar.addEventListener("pointerleave", endHold);
  elHotbar.addEventListener("click", (e) => {
    const slot = (e.target as HTMLElement).closest<HTMLElement>(".slot");
    if (slot?.dataset["slot"]) selectFn(+slot.dataset["slot"]);
  });

  function renderHotbar(s: GameState, content: Content) {
    const n = content.balance.hotbarSlots;
    /* CSS tính cỡ ô bằng cách chia bề ngang cho SỐ Ô, mà số ô thật nằm trong
       content (đẩy OTA được). Trước đây `--hotbar-slots: 10` là một con số
       chép tay trong `style.css`: đổi `hotbarSlots` qua OTA thì hàng ô tràn ra
       ngoài màn hoặc chừa một khoảng trống, và không ai nghĩ tới file CSS. */
    document.documentElement.style.setProperty("--hotbar-slots", String(n));
    const key = `${s.sel}|${s.inv
      .slice(0, n)
      .map((x) => (x ? `${x.id}x${x.n}` : "-"))
      .join(",")}`;
    if (key === prev.hotbar) return;
    prev.hotbar = key;

    elHotbar.innerHTML = "";
    for (let i = 0; i < n; i++) {
      const it = s.inv[i] ?? null;
      const el = document.createElement("div");
      el.className = `slot${i === s.sel ? " sel" : ""}${it ? "" : " empty"}`;
      el.dataset["slot"] = String(i);
      el.setAttribute("role", "button");
      el.innerHTML = `<span class="k">${(i + 1) % 10}</span>`;
      if (it) {
        const icon = atlas.icon(it.id);
        if (icon) {
          const c = document.createElement("canvas");
          c.width = icon.width;
          c.height = icon.height;
          c.getContext("2d")!.drawImage(icon, 0, 0);
          el.appendChild(c);
        }
        if (it.n > 1) {
          const nEl = document.createElement("span");
          nEl.className = "n";
          nEl.textContent = String(it.n);
          el.appendChild(nEl);
        }
        const name = itemLabel(it.id, content);
        el.title = name;
        el.dataset["name"] = name;
        el.dataset["desc"] = itemHint(it.id, content);
        el.setAttribute("aria-label", name);
      }
      elHotbar.appendChild(el);
    }
  }

  function currentGoal(s: GameState, content: Content): string {
    const g = content.goals.find((x) => !s.goalsDone.includes(x.id));
    if (!g) return "Xong hết mục tiêu — cứ thoải mái làm nông!";
    const [k, need] = Object.entries(g.require)[0] ?? [];
    if (!k || need === undefined) return g.text;
    const have = readStat(s, k);
    return have < need && need > 1 ? `${g.text} <b>${have}/${need}</b>` : g.text;
  }

  function readStat(s: GameState, key: string): number {
    if (key === "money") return s.money;
    if (key === "day") return s.day;
    if (key.startsWith("built.")) return s.stats.built[key.slice(6)] ?? 0;
    return (s.stats as unknown as Record<string, number>)[key] ?? 0;
  }

  let bannerTimer = 0;

  /* ---- bảng thống kê con vật ---------------------------------------------
     Vẽ lại BẰNG CHUỖI mỗi lần đổi, nhưng chỉ khi chuỗi thật sự khác: thẻ này
     cập nhật mỗi khung hình, mà đặt lại `innerHTML` mỗi khung hình thì con trỏ
     chuột nhấp nháy và trình duyệt dựng lại DOM 60 lần một giây cho một thứ
     đứng yên. */
  const elAnimal = root.querySelector<HTMLElement>("#animal-card")!;
  let animalKey = "";
  let onClose: () => void = () => {};
  let onCycle: (d: number) => void = () => {};

  /** "còn 3 giờ" / "còn 2 ngày" — người chơi nghĩ bằng giờ với ngày, không
   *  bằng phút game. */
  const wait = (minutes: number): string => {
    if (minutes <= 0) return "sẵn sàng";
    if (minutes < 60) return `còn ${Math.ceil(minutes)} phút`;
    if (minutes < 1440) return `còn ${Math.ceil(minutes / 60)} giờ`;
    return `còn ${Math.ceil(minutes / 1440)} ngày`;
  };

  return {
    onAnimalClose(fn) {
      onClose = fn;
    },
    onAnimalCycle(fn) {
      onCycle = fn;
    },
    showAnimal(st) {
      if (!st) {
        if (animalKey !== "") {
          animalKey = "";
          elAnimal.hidden = true;
          elAnimal.innerHTML = "";
        }
        return;
      }
      const key = JSON.stringify(st);
      if (key === animalKey) return;
      animalKey = key;

      /* NGƯỜI LÀM: cùng tấm thẻ, khác nội dung. Câu quan trọng nhất là "đang
         làm gì" — người chơi trả lương ba ngày một lần cho một người tự đi lại
         trên bản đồ, và câu hỏi duy nhất khi nhìn thấy họ là "có đang làm gì
         không, hay đứng không?". Không trả lời được thì lương thành khoản chi mù. */
      if (st.kind === "worker") {
        elAnimal.innerHTML =
          `<div class="hd"><b>${st.name}</b>` +
          `<button type="button" class="ax prev" aria-label="Người trước">‹</button>` +
          `<button type="button" class="ax next" aria-label="Người sau">›</button>` +
          `<button type="button" class="ax" aria-label="Đóng bảng">×</button></div>` +
          `<div class="mnote">${st.doing}</div>` +
          `<div class="mrow" title="Sức: ${Math.round(st.energy * 100)}%"><i class="ri" data-ic="energy"></i>` +
          `<span class="mbar ${st.energy < 0.2 ? "bad" : ""}"><i style="width:${Math.round(st.energy * 100)}%"></i></span></div>` +
          `<div class="mrow" title="Đang đeo ${st.carried}/${st.carryMax}"><i class="ri" data-ic="bag"></i>` +
          `<span class="mbar ${st.carry >= 1 ? "ok" : ""}"><i style="width:${Math.round(st.carry * 100)}%"></i></span></div>` +
          `<div class="mnote">${st.job} · lương ${st.wage}đ ngày ${st.payDay}</div>`;
        for (const el of elAnimal.querySelectorAll<HTMLElement>("i.ri")) {
          const src = atlas.ui(el.dataset["ic"] as UiIcon);
          const c = document.createElement("canvas");
          c.width = src.width;
          c.height = src.height;
          c.getContext("2d")!.drawImage(src, 0, 0);
          el.appendChild(c);
        }
        const bindW = (sel: string, fn: () => void) =>
          elAnimal.querySelector<HTMLElement>(sel)!.addEventListener("click", (e) => {
            e.stopPropagation();
            fn();
          });
        bindW(".ax.prev", () => onCycle(-1));
        bindW(".ax.next", () => onCycle(1));
        elAnimal
          .querySelectorAll<HTMLElement>(".ax:not(.prev):not(.next)")
          .forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); onClose(); }));
        elAnimal.hidden = false;
        return;
      }

      /* THANH thay cho CHỮ.

         Ba con số duy nhất người chơi cần đọc ở đây — lớn tới đâu, no tới đâu,
         còn bao lâu tới lứa — đều là "phần trăm của một quãng". Thanh nói điều
         đó trong một liếc mắt và cao 6px; câu chữ "còn 14 giờ" nói cùng chuyện
         đó bằng một hàng chữ cao 20px mà vẫn phải đọc mới hiểu. Thẻ từ hơn
         trăm pixel xuống còn khoảng sáu mươi.

         Con số chỉ còn lại ở chỗ thanh KHÔNG nói được: mấy ngày nữa thì chết
         đói, và bán thịt được mấy phần. */
      const rows: string[] = [];
      const bar = (ic: UiIcon, pct: number, cls: string, tip: string) =>
        `<div class="mrow" title="${tip}"><i class="ri" data-ic="${ic}"></i>` +
        `<span class="mbar ${cls}"><i style="width:${Math.round(Math.max(0, Math.min(1, pct)) * 100)}%"></i></span></div>`;

      // lớn tới đâu — đầy là trưởng thành
      const lon = st.mature ? 1 : st.ageDays / Math.max(1, st.ageDays + st.daysToMature);
      rows.push(
        bar("day", lon, st.mature ? "ok" : "", st.mature ? "Đã trưởng thành" : `Lớn sau ${st.daysToMature} ngày`),
      );
      // no tới đâu
      rows.push(
        bar("energy", st.fed, st.hungry ? "bad" : "", st.hungry ? `Đói — chết sau ${st.daysToStarve} ngày` : `No ${Math.round(st.fed * 100)}%`),
      );
      if (st.hungry)
        rows.push(`<div class="mnote bad">Đói · chết sau ${st.daysToStarve} ngày</div>`);

      for (const p of st.products) {
        // Tiến độ = phần chu kỳ ĐÃ trôi qua. Chưa lớn hay đang đói thì đồng hồ
        // đứng, nên thanh cũng phải đứng — vẽ nó chạy tiếp là nói dối.
        const pct = p.ready ? 1 : 1 - p.minutesLeft / Math.max(1, p.everyMinutes);
        const vi = !st.mature ? "chờ lớn" : st.hungry ? "đang đói" : p.ready ? "tới lứa" : wait(p.minutesLeft);
        rows.push(
          `<div class="mrow" title="${p.name} — ${vi}">` +
            `<i class="ri" data-item="${p.id}"></i>` +
            `<span class="mbar ${p.ready ? "ok" : ""}"><i style="width:${Math.round(pct * 100)}%"></i></span></div>`,
        );
      }
      // Thịt là một con SỐ, không phải một quãng — thanh không nói được gì.
      if (st.meat && st.mature)
        rows.push(
          `<div class="mrow"><i class="ri" data-item="${st.meat.id}"></i>` +
            `<b class="mval">${st.meat.min === st.meat.max ? st.meat.min : `${st.meat.min}–${st.meat.max}`}</b></div>`,
        );

      /* Hai mũi tên ‹ › nhảy sang con KẾ BÊN. Không có chúng thì muốn so hai
         con bò phải đi tới tận nơi từng con — mà so sánh chính là lý do người
         ta mở bảng này ra. */
      elAnimal.innerHTML =
        `<div class="hd"><i class="pic"></i><b>${st.name}</b>` +
        `<button type="button" class="ax prev" aria-label="Con trước">‹</button>` +
        `<button type="button" class="ax next" aria-label="Con sau">›</button>` +
        `<button type="button" class="ax" aria-label="Đóng bảng vật nuôi">×</button></div>` +
        rows.join("");
      const bind = (sel: string, fn: (e: Event) => void) =>
        elAnimal.querySelector<HTMLElement>(sel)!.addEventListener("click", (e) => {
          e.stopPropagation();
          fn(e);
        });
      bind(".ax.prev", () => onCycle(-1));
      bind(".ax.next", () => onCycle(1));
      elAnimal
        .querySelectorAll<HTMLElement>(".ax:not(.prev):not(.next)")
        .forEach((b) =>
          b.addEventListener("click", (e) => {
            e.stopPropagation();
            onClose();
          }),
        );
      // Đổ icon vào các ô nhãn: `data-ic` lấy từ bộ HUD, `data-item` vẽ đúng
      // vật phẩm (chai sữa, quả trứng) nên không phải nhớ nghĩa của ký hiệu nào.
      for (const el of elAnimal.querySelectorAll<HTMLElement>("i.ri")) {
        const src = el.dataset["ic"]
          ? atlas.ui(el.dataset["ic"] as UiIcon)
          : atlas.icon(el.dataset["item"] ?? "");
        if (!src) continue;
        const c = document.createElement("canvas");
        c.width = src.width;
        c.height = src.height;
        c.getContext("2d")!.drawImage(src, 0, 0);
        el.appendChild(c);
      }

      const pic = elAnimal.querySelector<HTMLElement>(".pic");
      const src = atlas.animal(st.def, "down", 0);
      if (pic && src) {
        const c = document.createElement("canvas");
        c.width = src.width;
        c.height = src.height;
        c.getContext("2d")!.drawImage(src, 0, 0);
        pic.appendChild(c);
      }
      elAnimal.hidden = false;
    },
    update(s, content, hint, iHint) {
      if (s.money !== prev.money) {
        const up = prev.money >= 0 && s.money > prev.money;
        prev.money = s.money;
        elMoney.textContent = s.money.toLocaleString("vi-VN") + "đ";
        if (up) {
          elMoney.classList.remove("bump");
          void elMoney.offsetWidth;
          elMoney.classList.add("bump");
        }
      }
      if (s.day !== prev.day) {
        prev.day = s.day;
        // "Xuân 3" chứ không phải "Ngày 27": người chơi cần biết đang ở đâu
        // TRONG MÙA để tính còn kịp gieo lứa nữa không, chứ số ngày cộng dồn
        // từ đầu ván thì chẳng nói lên điều gì.
        const sea = currentSeason(s, content);
        elDay.textContent = sea
          ? `${sea.name} ${dayOfSeason(s.day, content)}`
          : String(s.day);
      }
      const clock = formatClock(s.minutes);
      if (clock !== prev.clock) {
        prev.clock = clock;
        elClock.textContent = clock;
      }
      const night = s.minutes >= content.balance.daylightEndMinutes;
      if (night !== prev.night) {
        prev.night = night;
        const src = atlas.ui(night ? "moon" : "sun");
        const c = elClockIc.querySelector("canvas");
        if (c) {
          c.width = src.width;
          c.height = src.height;
          c.getContext("2d")!.drawImage(src, 0, 0);
        }
        elClockIc.classList.toggle("night", night);
      }
      const energy = Math.round(s.energy);
      if (energy !== prev.energy) {
        prev.energy = energy;
        const max = content.balance.energyMax;
        elEnergy.textContent = String(energy);
        elBarFill.style.width = `${Math.max(0, Math.min(100, (energy / max) * 100))}%`;
        const ratio = energy / max;
        elBar.className = `meter${ratio < 0.15 ? " crit" : ratio < 0.35 ? " low" : ""}`;
        elEnergyStat.classList.toggle("warn", ratio < 0.15);
      }

      let cap = 0;
      for (const slot of s.inv) {
        if (!slot?.id.startsWith("tool:")) continue;
        const t = content.tools[slot.id.slice(5)];
        if (t?.capacity) cap = Math.max(cap, t.capacity);
      }
      const water = Math.round(s.water);
      if (water !== prev.water || cap !== prev.cap) {
        prev.water = water;
        prev.cap = cap;
        elWater.textContent = `${water}/${cap}`;
        elWaterLine.classList.toggle("warn", cap > 0 && water <= cap * 0.15);
        elWaterLine.hidden = cap <= 0;
      }

      const goal = currentGoal(s, content);
      if (goal !== prev.goal) {
        prev.goal = goal;
        elGoal.innerHTML = goal;
        elGoalBox.classList.remove("collapsed");
        elGoalBox.classList.remove("flash");
        void elGoalBox.offsetWidth;
        elGoalBox.classList.add("flash");
      }

      // thời tiết hôm nay + dự báo — icon từ atlas, tên từ content
      const wxKey = `${s.weather?.today ?? ""}|${s.weather?.tomorrow ?? ""}`;
      if (wxKey !== prev.wx) {
        prev.wx = wxKey;
        const today = s.weather?.today ?? "";
        const next = s.weather?.tomorrow ?? "";
        putIcon(elWx, atlas.weatherIcon(today));
        putIcon(elWxNext, atlas.weatherIcon(next));
        elWxName.textContent = content.weathers?.[today]?.name ?? "";
        const line = $("hud-wx-line");
        line.title = `Hôm nay: ${content.weathers?.[today]?.name ?? today} · Ngày mai: ${content.weathers?.[next]?.name ?? next}`;
      }

      renderHotbar(s, content);

      // số món trong balo (ngoài hotbar) — để biết có gì để lôi ra
      let bag = 0;
      for (let i = content.balance.hotbarSlots; i < s.inv.length; i++) if (s.inv[i]) bag++;
      if (bag !== prev.bag) {
        prev.bag = bag;
        elBagCount.textContent = bag > 0 ? String(bag) : "";
        elBagBtn.classList.toggle("has", bag > 0);
      }

      /* Đổi ô hotbar, HOẶC thứ nằm trong ô đang cầm đổi (dùng hết hạt, chặt
         xong cây làm số gỗ đổi) — cả hai đều là "thứ trên tay tôi vừa khác đi",
         và cả hai đều đáng báo. */
      const selKey = `${s.sel}:${s.inv[s.sel]?.id ?? ""}`;
      if (selKey !== prev.sel) {
        // Lần vẽ ĐẦU TIÊN thì không báo: người chơi chưa đổi gì cả, và một cái
        // nhãn nhảy ra ngay khi vừa vào game là nhiễu, không phải thông tin.
        if (prev.sel !== "") flashSel(s, content, hint);
        prev.sel = selKey;
      }

      // nút hành động theo ngữ cảnh — do main gắn DOM nút, HUD chỉ đổi nhãn qua
      // data-attribute trên <body> để CSS/nút đọc; nhẹ hơn là sửa nhiều phần tử
      const hk = `${hint ? `${hint.label}|${hint.ready ? 1 : 0}|${hint.why ?? ""}` : ""}|${s.inv[s.sel]?.id ?? ""}|${iHint?.label ?? ""}`;
      if (hk !== prev.hint) {
        prev.hint = hk;
        const btn = document.querySelector<HTMLElement>("#abtn .a");
        const why = document.querySelector<HTMLElement>("#abtn .why");
        if (btn) {
          btn.textContent = hint?.label ?? "DÙNG";
          btn.dataset["kind"] = hint?.kind ?? "none";
          btn.classList.toggle("ready", !!hint?.ready);
          btn.classList.toggle("far", !!hint && !hint.ready && hint.kind !== null);
          btn.setAttribute("aria-label", hint?.label ?? "Dùng vật phẩm");
        }
        if (why) {
          why.textContent = hint?.why ?? "";
          why.hidden = !hint?.why;
        }
        /* Nút TƯƠNG TÁC cũng phải nói nó sẽ làm gì. Từ khi nút chính thôi mở
           cửa hàng, chữ "MUA" không còn hiện ở đâu nữa — mà không thấy chữ đó
           thì người chơi đứng trước quầy mà không biết bấm cái gì. */
        const bb = document.querySelector<HTMLElement>("#abtn .b");
        if (bb) {
          bb.textContent = iHint?.label ?? "E";
          bb.classList.toggle("ready", !!iHint);
          bb.setAttribute("aria-label", iHint?.label ?? "Tương tác");
        }
        /* Thanh gợi ý cho TAY CẦM — nói ĐÚNG NHỮNG GÌ CÁI NÚT KHÔNG NÓI ĐƯỢC.

           Cái nút đã in ra việc sắp làm ("DÙNG", "CÀY", "THU", "ĐỔ MÁNG"). Nếu
           thanh này in lại đúng chữ đó thì người chơi đọc một câu hai lần —
           và ở bản cũ nó còn nằm chồng lên chính cái nút, nên hai chữ "DÙNG"
           đè lên nhau. Nó ở đây để nói hai thứ khác:

             · ĐANG CẦM GÌ — cùng chữ "DÙNG" mà cầm cuốc là cày, cầm hạt là
               gieo. Chơi tay cầm thì mắt đang ở nhân vật, không ở dải hotbar.
             · VÌ SAO CHƯA LÀM ĐƯỢC — "xa quá", "chưa cày", "hết nước".

           Không có gì để nói thì thanh biến mất hẳn, không để lại một dải rỗng. */
        const pc = document.querySelector<HTMLElement>("#padctx");
        if (pc) {
          pc.innerHTML = "";
          const heldId = s.inv[s.sel]?.id;
          const src = heldId ? atlas.icon(heldId) : null;
          if (src) {
            const c = document.createElement("canvas");
            c.width = src.width;
            c.height = src.height;
            c.getContext("2d")!.drawImage(src, 0, 0);
            c.className = "it";
            pc.appendChild(c);
          }
          if (heldId) {
            const t = document.createElement("span");
            t.textContent = itemName(heldId, content);
            pc.appendChild(t);
          }
          if (hint?.why) {
            const w = document.createElement("i");
            w.textContent = hint.why;
            pc.appendChild(w);
          }
          pc.hidden = !heldId && !hint?.why;
        }
      }
    },
    onSelect(fn) {
      selectFn = fn;
    },
    onBag(fn) {
      bagFn = fn;
    },
    dayBanner(day, note) {
      clearTimeout(bannerTimer);
      (elBanner.querySelector("b") as HTMLElement).textContent = `Ngày ${day}`;
      (elBanner.querySelector("span") as HTMLElement).textContent = note ?? "";
      elBanner.hidden = false;
      elBanner.classList.remove("show");
      void elBanner.offsetWidth;
      elBanner.classList.add("show");
      bannerTimer = window.setTimeout(() => {
        elBanner.hidden = true;
      }, 2400);
    },
  };
}

/* ============================================================================
   HUD — tiền, ngày, đồng hồ, năng lượng, điện, mục tiêu, hotbar.

   Chỉ đọc state. Cập nhật theo kiểu "so rồi mới sửa": chỉ ghi vào DOM khi giá
   trị thật sự đổi. HUD được gọi mỗi khung hình nên nếu ghi vô điều kiện thì
   trình duyệt phải tính lại layout 60 lần/giây một cách vô ích.
============================================================================ */

import type { Content, GameState } from "../game/types.ts";
import type { Atlas } from "../art/atlas.ts";

export interface Hud {
  update(s: GameState, content: Content): void;
  /** hotbar bấm được bằng chuột/chạm */
  onSelect(fn: (slot: number) => void): void;
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
    default:
      return id;
  }
}

export function createHud(root: HTMLElement, atlas: Atlas): Hud {
  root.innerHTML = `
    <div class="hud-row">
      <div class="hud-box">
        <div class="hud-line"><span>Tiền</span><b id="hud-money">0</b></div>
        <div class="hud-line"><span>Ngày</span><span><span id="hud-day">1</span> · <span class="clock" id="hud-clock">6:00</span></span></div>
        <div class="hud-line"><span>Năng lượng</span><span id="hud-energy">100</span></div>
        <div class="bar" id="hud-bar"><i style="width:100%"></i></div>
        <div class="hud-line" id="hud-power-line"><span>Điện</span><span id="hud-power">0</span></div>
      </div>
      <div class="hud-box" id="goal-box">
        <div class="hud-line"><span>Mục tiêu</span></div>
        <div id="goal">—</div>
      </div>
    </div>
    <div class="hud-row" style="justify-content:center">
      <div id="hotbar"></div>
    </div>`;

  const $ = <T extends HTMLElement>(id: string) => root.querySelector(`#${id}`) as T;
  const elMoney = $("hud-money");
  const elDay = $("hud-day");
  const elClock = $("hud-clock");
  const elEnergy = $("hud-energy");
  const elBar = $("hud-bar");
  const elBarFill = elBar.querySelector("i") as HTMLElement;
  const elPower = $("hud-power");
  const elPowerLine = $("hud-power-line");
  const elGoal = $("goal");
  const elHotbar = $("hotbar");

  let selectFn: (slot: number) => void = () => {};
  // ghi nhớ giá trị đã vẽ để bỏ qua lần cập nhật không đổi gì
  const prev = { money: -1, day: -1, clock: "", energy: -1, power: -1, goal: "", hotbar: "" };

  elHotbar.addEventListener("click", (e) => {
    const slot = (e.target as HTMLElement).closest<HTMLElement>(".slot");
    if (slot?.dataset["slot"]) selectFn(+slot.dataset["slot"]);
  });

  function renderHotbar(s: GameState, content: Content) {
    const n = content.balance.hotbarSlots;
    // khoá nhận diện: đổi thì mới vẽ lại, tránh dựng lại DOM mỗi khung hình
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
      el.className = `slot${i === s.sel ? " sel" : ""}`;
      el.dataset["slot"] = String(i);
      el.innerHTML = `<span class="k">${i + 1}</span>`;
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
        el.title = itemLabel(it.id, content);
      }
      elHotbar.appendChild(el);
    }
  }

  function currentGoal(s: GameState, content: Content): string {
    const g = content.goals.find((x) => !s.goalsDone.includes(x.id));
    if (!g) return "Xong hết mục tiêu — cứ thoải mái làm nông!";
    // hiện thêm tiến độ với mục tiêu đếm được
    const [k, need] = Object.entries(g.require)[0] ?? [];
    if (!k || need === undefined) return g.text;
    const have = readStat(s, k);
    return have < need ? `${g.text} <b>(${have}/${need})</b>` : g.text;
  }

  function readStat(s: GameState, key: string): number {
    if (key === "money") return s.money;
    if (key === "day") return s.day;
    if (key.startsWith("built.")) return s.stats.built[key.slice(6)] ?? 0;
    return (s.stats as unknown as Record<string, number>)[key] ?? 0;
  }

  return {
    update(s, content) {
      if (s.money !== prev.money) {
        prev.money = s.money;
        elMoney.textContent = s.money.toLocaleString("vi-VN") + "đ";
      }
      if (s.day !== prev.day) {
        prev.day = s.day;
        elDay.textContent = String(s.day);
      }
      const clock = formatClock(s.minutes);
      if (clock !== prev.clock) {
        prev.clock = clock;
        elClock.textContent = clock;
      }
      const energy = Math.round(s.energy);
      if (energy !== prev.energy) {
        prev.energy = energy;
        const max = content.balance.energyMax;
        elEnergy.textContent = `${energy}/${max}`;
        elBarFill.style.width = `${Math.max(0, Math.min(100, (energy / max) * 100))}%`;
        const ratio = energy / max;
        elBar.className = `bar${ratio < 0.15 ? " crit" : ratio < 0.35 ? " low" : ""}`;
      }

      let power = 0;
      for (const t of s.tiles) {
        if (!t.b) continue;
        power += content.buildings[t.b]?.power.produce ?? 0;
      }
      if (power !== prev.power) {
        prev.power = power;
        elPower.textContent = String(power);
        // chỉ hiện dòng Điện khi nông trại đã có thiết bị điện — đỡ rối lúc đầu game
        elPowerLine.style.display = power > 0 ? "" : "none";
      }

      const goal = currentGoal(s, content);
      if (goal !== prev.goal) {
        prev.goal = goal;
        elGoal.innerHTML = goal;
      }

      renderHotbar(s, content);
    },
    onSelect(fn) {
      selectFn = fn;
    },
  };
}

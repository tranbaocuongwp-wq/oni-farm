/* ============================================================================
   NEWDAY — chuyển ngày. Thứ tự các bước ở đây là HỢP ĐỒNG, đừng đảo:

     1. day++ , minutes = dayStartMinutes
     2. thu tiền income + tính tổng điện sinh ra (power)
     3. tưới tự động (waterRadius / autoWet) — ĐÁNH DẤU TRƯỚC
     4. cây lớn lên: cộng nốt phần ban ngày còn lại cho các ô `wet`
     5. làm khô: ô không được tưới tự động thì wet = false
        5b. cỏ dại mọc lan, đất cày bỏ không thì hoang trở lại
     6. drone thu hoạch, tiêu điện từ quỹ `power`, duyệt theo chỉ số ô tăng dần
     7. hồi năng lượng
     8. đánh giá progression

   Bước 3 phải trước bước 4, nếu không thì vòi tưới luôn chậm một ngày.
============================================================================ */

import type { Content } from "./types.ts";
import type { Draft } from "./state.ts";
import { applyProgression, dTile, nextRandom, toastKey, touch } from "./state.ts";
import { harvestTile } from "./actions.ts";
import { idx, playerOverlapsTile, weedProp } from "./world.ts";

/* ---------------------------------------------------------- tăng trưởng */

/**
 * Cộng `minutes` PHÚT GAME BAN NGÀY vào mọi ô ẩm có cây chưa chín, và đẩy sang
 * giai đoạn sau khi đủ ngưỡng `growthDays[stage] * growthMinutesPerDay`.
 *
 * Đây là trái tim của luật "cây lớn theo THỜI GIAN": TICK gọi nó mỗi khung hình
 * với phần ban ngày vừa trôi qua, còn `newDay` gọi một phát cho phần ban ngày
 * còn lại của hôm nay. Cộng lại đúng bằng nhau, nên đi ngủ sớm không thiệt.
 *
 * Hiệu năng: chỉ đụng vào ô CÓ CÂY và chỉ copy ô thật sự đổi (dTile) — không ô
 * nào đổi thì draft vẫn sạch và `reduce` trả về đúng state cũ.
 */
export function growCrops(d: Draft, content: Content, minutes: number): void {
  if (!Number.isFinite(minutes) || minutes <= 0) return;
  const per = Math.max(1, content.balance.growthMinutesPerDay);
  const tiles = d.s.tiles;
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    if (!t || !t.crop || !t.wet) continue;
    const def = content.crops[t.crop.id];
    if (!def) continue;
    let stage = t.crop.stage;
    if (stage >= def.growthDays.length) continue; // đã chín, đứng yên
    let grow = (Number.isFinite(t.crop.grow) ? t.crop.grow : 0) + minutes;
    while (stage < def.growthDays.length) {
      const need = Math.max(1, (def.growthDays[stage] ?? 1) * per);
      if (grow < need) break;
      grow -= need;
      stage += 1;
    }
    if (stage >= def.growthDays.length) {
      stage = def.growthDays.length;
      grow = 0;
    }
    const m = dTile(d, i);
    if (!m || !m.crop) continue;
    m.crop.stage = stage;
    m.crop.grow = grow;
  }
}

/* --------------------------------------------- cỏ mọc / đất cày bỏ hoang */

/**
 * Một đêm trôi qua trên mặt đất:
 *   · ô cỏ TRỐNG kề một ô có `decor: "tuft"` thì có `grassSpreadChance` mọc cỏ dại;
 *   · ô đã cày mà BỎ KHÔNG thì có `tilledDecayChance` trở lại thành cỏ.
 *
 * Ngẫu nhiên rút từ `state.seed` nên tái lập được. Ô người chơi đang đứng đè
 * lên thì không mọc gì — không ai bị nhốt trong bụi cỏ lúc đang ngủ.
 */
function nightGround(d: Draft, content: Content): void {
  const bal = content.balance;
  const spreadChance = Number.isFinite(bal.grassSpreadChance) ? bal.grassSpreadChance : 0;
  const decayChance = Number.isFinite(bal.tilledDecayChance) ? bal.tilledDecayChance : 0;
  const weed = weedProp(content);
  const w = d.s.w;
  const h = d.s.h;
  const tiles = d.s.tiles;

  const hasTuftNeighbour = (x: number, y: number): boolean => {
    for (let ny = y - 1; ny <= y + 1; ny++) {
      for (let nx = x - 1; nx <= x + 1; nx++) {
        if ((nx === x && ny === y) || nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (tiles[idx(w, nx, ny)]?.decor === "tuft") return true;
      }
    }
    return false;
  };

  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    if (!t) continue;
    const x = i % w;
    const y = (i - x) / w;

    // đất cày bỏ không → cỏ mọc lại
    if (t.tilled && !t.crop && t.b === null) {
      if (decayChance > 0) {
        const r = nextRandom(d.s.seed);
        touch(d).seed = r.seed;
        if (r.v < decayChance) {
          const m = dTile(d, i);
          if (m) {
            m.tilled = false;
            m.wet = false;
          }
        }
      }
      continue;
    }

    // cỏ dại lan sang ô cỏ trống bên cạnh
    if (
      weed &&
      spreadChance > 0 &&
      t.g === "grass" &&
      t.prop === null &&
      t.b === null &&
      t.crop === null &&
      !t.tilled &&
      !playerOverlapsTile(d.s, x, y) &&
      hasTuftNeighbour(x, y)
    ) {
      const r = nextRandom(d.s.seed);
      touch(d).seed = r.seed;
      if (r.v < spreadChance) {
        const m = dTile(d, i);
        if (m) {
          m.prop = weed.id;
          m.hp = Math.max(0, Math.floor(weed.hits ?? 0));
        }
      }
    }
  }
}

/** Ngủ sau mốc này (phút trong ngày) coi là ngủ muộn → lateSleepPenalty.
 *  1440 = 24:00. dayEndMinutes mặc định 1560 (26:00) nên khoảng 24:00–26:00
 *  là "ngủ muộn", còn quá 26:00 là ngất. */
export const LATE_SLEEP_MINUTES = 1440;

export interface NewDayOptions {
  /** true = ngất vì quá giờ (TICK), false = chủ động đi ngủ. */
  passedOut: boolean;
}

export function newDay(d: Draft, content: Content, opts: NewDayOptions): void {
  const bal = content.balance;
  const w = d.s.w;
  const h = d.s.h;
  const sleptAt = d.s.minutes;

  // ---- 1. sang ngày mới -------------------------------------------------
  const s0 = touch(d);
  s0.day = s0.day + 1;
  s0.minutes = bal.dayStartMinutes;
  s0.sleeping = false;
  // Ngủ dậy là hết bận — không mang thao tác dở dang sang ngày mới.
  s0.busy = 0;

  // ---- 2. thu nhập + điện ----------------------------------------------
  let income = 0;
  let power = 0;
  for (let i = 0; i < d.s.tiles.length; i++) {
    const t = d.s.tiles[i];
    if (!t || !t.b) continue;
    const def = content.buildings[t.b];
    if (!def) continue;
    income += def.effects.income ?? 0;
    power += def.power?.produce ?? 0;
  }
  if (income !== 0) touch(d).money = d.s.money + income;

  // ---- 3. tưới tự động (đánh dấu trước khi cây lớn) ----------------------
  const autoWet = new Set<number>();
  for (let i = 0; i < d.s.tiles.length; i++) {
    const t = d.s.tiles[i];
    if (!t || !t.b) continue;
    const def = content.buildings[t.b];
    if (!def) continue;
    if (def.effects.autoWet) autoWet.add(i);
    const r = def.effects.waterRadius ?? 0;
    if (r > 0) {
      const bx = i % w;
      const by = (i - bx) / w;
      for (let y = by - r; y <= by + r; y++) {
        for (let x = bx - r; x <= bx + r; x++) {
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          const j = idx(w, x, y);
          const tt = d.s.tiles[j];
          if (!tt) continue;
          if (tt.prop !== null || tt.g === "water") continue;
          autoWet.add(j);
        }
      }
    }
  }
  for (const i of autoWet) {
    const t = d.s.tiles[i];
    if (t && !t.wet) {
      const m = dTile(d, i);
      if (m) m.wet = true;
    }
  }

  // ---- 4. cây lớn lên: cộng nốt phần BAN NGÀY còn lại của hôm nay --------
  // Trong ngày, TICK đã cộng dần từng phút cho ô ẩm. Đi ngủ là bỏ qua quãng
  // còn lại tới lúc trời tối, nên cộng cho đủ ở đây — ngủ sớm không bị thiệt,
  // mà ban ngày vẫn thấy cây nhích lên trông thấy.
  growCrops(d, content, Math.max(0, bal.daylightEndMinutes - sleptAt));

  // ---- 5. làm khô --------------------------------------------------------
  for (let i = 0; i < d.s.tiles.length; i++) {
    const t = d.s.tiles[i];
    if (!t || !t.wet) continue;
    if (autoWet.has(i)) continue;
    const m = dTile(d, i);
    if (m) m.wet = false;
  }

  // ---- 5b. cỏ mọc lan, đất cày bỏ không thì hoang trở lại ----------------
  nightGround(d, content);

  // ---- 6. drone ----------------------------------------------------------
  let budget = power;
  let warnedNoPower = false;
  let warnedFull = false;
  for (let i = 0; i < d.s.tiles.length; i++) {
    const t = d.s.tiles[i];
    if (!t || !t.b) continue;
    const def = content.buildings[t.b];
    if (!def) continue;
    const r = def.effects.harvestRadius ?? 0;
    if (r <= 0) continue;
    const need = def.power?.consume ?? 0;
    if (need > budget) {
      if (!warnedNoPower) {
        toastKey(d, content, "droneNoPower", "bad");
        warnedNoPower = true;
      }
      continue;
    }
    budget -= need;

    const bx = i % w;
    const by = (i - bx) / w;
    for (let y = by - r; y <= by + r; y++) {
      for (let x = bx - r; x <= bx + r; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const j = idx(w, x, y);
        const tt = d.s.tiles[j];
        if (!tt || !tt.crop) continue;
        const cd = content.crops[tt.crop.id];
        if (!cd || tt.crop.stage < cd.growthDays.length) continue;
        const res = harvestTile(d, content, j, false);
        if (res.overflow > 0 && !warnedFull) {
          toastKey(d, content, "invFull", "bad");
          warnedFull = true;
        }
      }
    }
  }

  // ---- 7. năng lượng -----------------------------------------------------
  const ratio = opts.passedOut
    ? bal.passOutEnergy
    : sleptAt >= LATE_SLEEP_MINUTES
      ? bal.lateSleepPenalty
      : bal.sleepRestore;
  const energy = Math.round(bal.energyMax * ratio);
  touch(d).energy = Math.max(0, Math.min(bal.energyMax, energy));

  // ---- 8. progression ----------------------------------------------------
  applyProgression(d, content);
}

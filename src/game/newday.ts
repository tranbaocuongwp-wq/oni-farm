/* ============================================================================
   NEWDAY — chuyển ngày. Thứ tự các bước ở đây là HỢP ĐỒNG, đừng đảo:

     1. day++ , minutes = dayStartMinutes
     2. thu tiền income + tính tổng điện sinh ra (power)
     3. tưới tự động (waterRadius / autoWet) — ĐÁNH DẤU TRƯỚC
     4. cây lớn lên: chỉ ô `wet` mới tính ngày
     5. làm khô: ô không được tưới tự động thì wet = false
     6. drone thu hoạch, tiêu điện từ quỹ `power`, duyệt theo chỉ số ô tăng dần
     7. hồi năng lượng
     8. đánh giá progression

   Bước 3 phải trước bước 4, nếu không thì vòi tưới luôn chậm một ngày.
============================================================================ */

import type { Content } from "./types.ts";
import type { Draft } from "./state.ts";
import { applyProgression, dTile, toastKey, touch } from "./state.ts";
import { harvestTile } from "./actions.ts";
import { idx } from "./world.ts";

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

  // ---- 4. cây lớn lên (chỉ ô ướt) ---------------------------------------
  for (let i = 0; i < d.s.tiles.length; i++) {
    const t = d.s.tiles[i];
    if (!t || !t.crop || !t.wet) continue;
    const def = content.crops[t.crop.id];
    if (!def) continue;
    const stage = t.crop.stage;
    if (stage >= def.growthDays.length) continue; // đã chín, đứng yên
    const m = dTile(d, i);
    if (!m || !m.crop) continue;
    m.crop.days += 1;
    const need = def.growthDays[stage] ?? 1;
    if (m.crop.days >= need) {
      m.crop.stage = stage + 1;
      m.crop.days = 0;
    }
  }

  // ---- 5. làm khô --------------------------------------------------------
  for (let i = 0; i < d.s.tiles.length; i++) {
    const t = d.s.tiles[i];
    if (!t || !t.wet) continue;
    if (autoWet.has(i)) continue;
    const m = dTile(d, i);
    if (m) m.wet = false;
  }

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

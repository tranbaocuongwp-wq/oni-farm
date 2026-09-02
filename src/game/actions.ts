/* ============================================================================
   ACTIONS — cày / tưới / gieo / thu hoạch / đặt công trình.

   Tất cả đi qua `useAt()`: một nút bấm duy nhất, hành vi phụ thuộc vật phẩm
   đang cầm. Luật ưu tiên: ô có cây CHÍN thì luôn thu hoạch trước, bất kể đang
   cầm gì — người chơi không phải đổi tay liên tục.
============================================================================ */

import type { Content, Tile } from "./types.ts";
import type { Draft } from "./state.ts";
import { dStats, dTile, randInt, setInv, toastKey, touch } from "./state.ts";
import { addItem, removeItem, selectedItemId } from "./inventory.ts";
import { parseItem } from "./items.ts";
import {
  canPlaceBuilding,
  inReach,
  isRipe,
  isTillableTile,
  tileIndexAt,
} from "./world.ts";

/* --------------------------------------------------------------- thu hoạch */

/** Lùi cây về giai đoạn sao cho cần đúng `regrowDays` ngày nữa mới chín lại.
 *  Ví dụ cà chua growthDays [1,1,1,2], regrowDays 3 → stage 2 (1+2 = 3 ngày). */
export function regrowStage(growthDays: readonly number[], regrowDays: number): {
  stage: number;
  days: number;
} {
  let suffix = 0;
  let k = growthDays.length;
  for (let i = growthDays.length - 1; i >= 0; i--) {
    suffix += growthDays[i] ?? 0;
    k = i;
    if (suffix >= regrowDays) break;
  }
  const days = Math.max(0, suffix - regrowDays);
  const cap = Math.max(0, (growthDays[k] ?? 1) - 1);
  return { stage: k, days: Math.min(days, cap) };
}

export interface HarvestResult {
  ok: boolean;
  amount: number;
  /** số món KHÔNG nhét được vào túi */
  overflow: number;
}

/** Thu hoạch ô `i`. `spendEnergy` = false khi drone làm thay. */
export function harvestTile(
  d: Draft,
  content: Content,
  i: number,
  spendEnergy: boolean,
): HarvestResult {
  const cur = d.s.tiles[i];
  if (!cur || !cur.crop) return { ok: false, amount: 0, overflow: 0 };
  const def = content.crops[cur.crop.id];
  if (!def) return { ok: false, amount: 0, overflow: 0 };
  if (cur.crop.stage < def.growthDays.length) return { ok: false, amount: 0, overflow: 0 };

  const cost = spendEnergy ? content.balance.energyCost.harvest : 0;
  if (spendEnergy && d.s.energy < cost) {
    toastKey(d, content, "noEnergy", "bad");
    return { ok: false, amount: 0, overflow: 0 };
  }

  const roll = randInt(d.s.seed, def.yieldMin, def.yieldMax);
  const amount = Math.max(0, roll.v);
  const s = touch(d);
  s.seed = roll.seed;

  const added = addItem(s.inv, `crop:${def.id}`, amount);
  setInv(d, added.inv);
  const overflow = amount - added.added;

  const t = dTile(d, i);
  if (t) {
    if (def.regrowDays !== null && def.regrowDays !== undefined) {
      const r = regrowStage(def.growthDays, def.regrowDays);
      t.crop = { id: def.id, stage: r.stage, days: r.days, regrown: true };
    } else {
      t.crop = null; // ô vẫn giữ trạng thái đã cày
    }
  }

  const st = dStats(d);
  st.harvested += 1;
  if (cost > 0) touch(d).energy = Math.max(0, d.s.energy - cost);

  return { ok: true, amount, overflow };
}

/* --------------------------------------------------------------------- USE */

function hasEnergy(d: Draft, cost: number): boolean {
  return d.s.energy >= cost;
}

function spend(d: Draft, cost: number): void {
  if (cost <= 0) return;
  const s = touch(d);
  s.energy = Math.max(0, s.energy - cost);
}

function till(d: Draft, content: Content, i: number, cur: Tile): void {
  if (!isTillableTile(cur, content)) {
    toastKey(d, content, "cannotTill", "bad");
    return;
  }
  const cost = content.balance.energyCost.till;
  if (!hasEnergy(d, cost)) {
    toastKey(d, content, "noEnergy", "bad");
    return;
  }
  const t = dTile(d, i);
  if (!t) return;
  t.tilled = true;
  t.wet = false;
  spend(d, cost);
  dStats(d).tilled += 1;
}

function water(d: Draft, content: Content, i: number, cur: Tile): void {
  if (!cur.tilled || cur.wet) return; // không đổi gì thì im lặng
  const cost = content.balance.energyCost.water;
  if (!hasEnergy(d, cost)) {
    toastKey(d, content, "noEnergy", "bad");
    return;
  }
  const t = dTile(d, i);
  if (!t) return;
  t.wet = true;
  spend(d, cost);
  dStats(d).watered += 1;
}

function plant(d: Draft, content: Content, i: number, cur: Tile, cropId: string): void {
  const def = content.crops[cropId];
  if (!def) return;
  if (!cur.tilled) {
    toastKey(d, content, "cannotPlant", "bad");
    return;
  }
  if (cur.crop) {
    toastKey(d, content, "occupied", "bad");
    return;
  }
  if (cur.b) {
    const bd = content.buildings[cur.b];
    if (!bd || bd.kind !== "floor") {
      toastKey(d, content, "cannotPlant", "bad");
      return;
    }
  }
  const cost = content.balance.energyCost.plant;
  if (!hasEnergy(d, cost)) {
    toastKey(d, content, "noEnergy", "bad");
    return;
  }
  const left = removeItem(d.s.inv, `seed:${cropId}`, 1);
  if (!left) return;
  setInv(d, left);

  const t = dTile(d, i);
  if (!t) return;
  t.crop = { id: cropId, stage: 0, days: 0, regrown: false };
  spend(d, cost);
  dStats(d).planted += 1;
}

function build(d: Draft, content: Content, i: number, x: number, y: number, id: string): void {
  const def = content.buildings[id];
  if (!def) return;
  if (!canPlaceBuilding(d.s, content, id, x, y)) {
    toastKey(d, content, "cannotBuild", "bad");
    return;
  }
  const cost = content.balance.energyCost.build;
  if (!hasEnergy(d, cost)) {
    toastKey(d, content, "noEnergy", "bad");
    return;
  }
  const left = removeItem(d.s.inv, `build:${id}`, 1);
  if (!left) return;
  setInv(d, left);

  const t = dTile(d, i);
  if (!t) return;
  t.b = id;
  spend(d, cost);
  const st = dStats(d);
  st.built[id] = (st.built[id] ?? 0) + 1;
  toastKey(d, content, "built", "good", def.name);
}

/** Kiểm tra nhanh cho UI: bấm vào ô này bây giờ có làm được gì không. */
export type UseKind = "harvest" | "till" | "water" | "plant" | "build" | null;

export function canUseAt(
  state: import("./types.ts").GameState,
  content: Content,
  x: number,
  y: number,
): UseKind {
  const i = tileIndexAt(state, x, y);
  if (i < 0) return null;
  if (!inReach(state, x, y)) return null;
  const cur = state.tiles[i];
  if (!cur) return null;
  if (isRipe(cur, content)) return "harvest";

  const held = selectedItemId(state.inv, state.sel);
  const it = held ? parseItem(held) : null;
  if (!it) return null;

  if (it.kind === "tool") {
    const tool = content.tools[it.ref];
    if (!tool) return null;
    if (tool.action === "TILL") return isTillableTile(cur, content) ? "till" : null;
    if (tool.action === "WATER") return cur.tilled && !cur.wet ? "water" : null;
    return null;
  }
  if (it.kind === "seed") {
    if (!content.crops[it.ref]) return null;
    if (!cur.tilled || cur.crop) return null;
    if (cur.b && content.buildings[cur.b]?.kind !== "floor") return null;
    return "plant";
  }
  if (it.kind === "build") {
    return canPlaceBuilding(state, content, it.ref, x, y) ? "build" : null;
  }
  return null;
}

export function useAt(d: Draft, content: Content, x: number, y: number): void {
  const i = tileIndexAt(d.s, x, y);
  if (i < 0) return;
  if (!inReach(d.s, x, y)) return; // ngoài tầm với: bỏ qua, không toast
  const cur = d.s.tiles[i];
  if (!cur) return;

  // Luật ưu tiên: cây chín thì thu hoạch trước mọi thứ.
  if (isRipe(cur, content)) {
    const r = harvestTile(d, content, i, true);
    if (r.ok && r.overflow > 0) toastKey(d, content, "invFull", "bad");
    return;
  }

  const held = selectedItemId(d.s.inv, d.s.sel);
  if (!held) return;
  const it = parseItem(held);
  if (!it) return;

  switch (it.kind) {
    case "tool": {
      const tool = content.tools[it.ref];
      if (!tool) return;
      if (tool.action === "TILL") till(d, content, i, cur);
      else if (tool.action === "WATER") water(d, content, i, cur);
      return;
    }
    case "seed":
      plant(d, content, i, cur, it.ref);
      return;
    case "build":
      build(d, content, i, x, y, it.ref);
      return;
    case "crop":
      return; // nông sản không dùng lên ô được
  }
}

/* ---------------------------------------------------------------- INTERACT */

/* Cầu nối cho làn render/UI: interactAt/nearbyInteract cài đặt ở world.ts
   (chúng chỉ tra cứu legend), nhưng UI nhập từ đây cho cùng chỗ với useAt. */
export { interactAt, nearbyInteract } from "./world.ts";

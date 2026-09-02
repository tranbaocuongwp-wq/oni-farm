/* ============================================================================
   INVARIANTS — lưới an toàn.

   `checkInvariants()` được store gọi sau MỌI dispatch khi bật validate. Trả về
   danh sách chuỗi mô tả lỗi (rỗng = ổn). Không bao giờ ném lỗi.

   `migrateForContent()` là chốt chặn cho OTA: save cũ gặp content mới đã gỡ
   cây/công trình thì phải sống sót, không được ném lỗi và không được để lại
   state vi phạm bất biến.
============================================================================ */

import type { Content, GameState, Tile } from "./types.ts";
import {
  TILE,
  blockedAt,
  buildFromMap,
  nudgeOutOfSolid,
  tileCenterX,
  tileCenterY,
} from "./world.ts";
import { TOOL_SLOTS, normalizeInventory, toolIds } from "./inventory.ts";
import { parseItem } from "./items.ts";

export function checkInvariants(state: GameState, content: Content): string[] {
  const e: string[] = [];
  const bal = content.balance;

  // ---- số học cơ bản ----------------------------------------------------
  if (!Number.isFinite(state.money)) e.push(`money không hữu hạn: ${state.money}`);
  else if (state.money < 0) e.push(`money âm: ${state.money}`);

  if (!Number.isFinite(state.busy) || state.busy < 0)
    e.push(`busy phải là số >= 0, nhận: ${state.busy}`);
  if (!Number.isFinite(state.energy)) e.push(`energy không hữu hạn: ${state.energy}`);
  else if (state.energy < 0 || state.energy > bal.energyMax)
    e.push(`energy ${state.energy} ngoài [0, ${bal.energyMax}]`);

  if (!Number.isFinite(state.minutes)) e.push(`minutes không hữu hạn: ${state.minutes}`);
  else if (state.minutes < bal.dayStartMinutes || state.minutes > bal.dayEndMinutes)
    e.push(`minutes ${state.minutes} ngoài [${bal.dayStartMinutes}, ${bal.dayEndMinutes}]`);

  if (!Number.isInteger(state.day) || state.day < 1) e.push(`day phải là số nguyên >= 1, nhận ${state.day}`);
  if (!Number.isFinite(state.seed) || state.seed < 0) e.push(`seed không hợp lệ: ${state.seed}`);

  // ---- lưới ô ------------------------------------------------------------
  if (state.w !== content.map.w || state.h !== content.map.h)
    e.push(`kích thước lưới ${state.w}x${state.h} khác bản đồ ${content.map.w}x${content.map.h}`);
  if (state.tiles.length !== state.w * state.h)
    e.push(`tiles.length = ${state.tiles.length}, phải là w*h = ${state.w * state.h}`);

  let cropOnUntilled = 0;
  let badStage = 0;
  const missingCrop = new Set<string>();
  const missingBuild = new Set<string>();
  for (let i = 0; i < state.tiles.length; i++) {
    const t = state.tiles[i];
    if (!t) {
      e.push(`tiles[${i}] rỗng`);
      continue;
    }
    if (t.b !== null && !content.buildings[t.b]) missingBuild.add(t.b);
    if (t.crop) {
      if (!t.tilled) cropOnUntilled++;
      const def = content.crops[t.crop.id];
      if (!def) missingCrop.add(t.crop.id);
      else if (
        !Number.isInteger(t.crop.stage) ||
        t.crop.stage < 0 ||
        t.crop.stage > def.growthDays.length
      )
        badStage++;
    }
  }
  if (cropOnUntilled) e.push(`${cropOnUntilled} ô có cây mà chưa cày`);
  if (badStage) e.push(`${badStage} ô có crop.stage ngoài [0, growthDays.length]`);
  for (const id of missingCrop) e.push(`cây '${id}' không tồn tại trong content`);
  for (const id of missingBuild) e.push(`công trình '${id}' không tồn tại trong content`);

  // ---- túi đồ ------------------------------------------------------------
  if (state.inv.length !== bal.inventorySlots)
    e.push(`inv.length = ${state.inv.length}, phải là inventorySlots = ${bal.inventorySlots}`);
  for (let i = 0; i < state.inv.length; i++) {
    const s = state.inv[i];
    if (s === null || s === undefined) continue;
    if (typeof s.id !== "string" || !parseItem(s.id))
      e.push(`inv[${i}] có id không hợp lệ: ${String(s.id)}`);
    if (!Number.isInteger(s.n) || s.n < 1) e.push(`inv[${i}] có n = ${s.n}, phải là số nguyên >= 1`);
  }
  const tools = toolIds(content);
  for (let i = 0; i < TOOL_SLOTS; i++) {
    const want = tools[i];
    const got = state.inv[i];
    if (!want) continue;
    if (!got || got.id !== want) e.push(`ô công cụ ${i} phải là '${want}', đang là '${got?.id ?? "trống"}'`);
  }

  if (!Number.isInteger(state.sel) || state.sel < 0 || state.sel >= bal.hotbarSlots)
    e.push(`sel = ${state.sel}, phải nằm trong [0, ${bal.hotbarSlots})`);

  // ---- người chơi --------------------------------------------------------
  if (!Number.isFinite(state.player.x) || !Number.isFinite(state.player.y))
    e.push(`player toạ độ không hữu hạn: (${state.player.x}, ${state.player.y})`);
  else if (blockedAt(state, content, state.player.x, state.player.y))
    e.push(
      `người chơi nằm trong ô solid tại (${(state.player.x / TILE).toFixed(2)}, ${(state.player.y / TILE).toFixed(2)})`,
    );

  // ---- log ---------------------------------------------------------------
  if (!Number.isInteger(state.logSeq) || state.logSeq < 0) e.push(`logSeq không hợp lệ: ${state.logSeq}`);
  for (const l of state.log) if (l.id > state.logSeq) e.push(`log có id ${l.id} > logSeq ${state.logSeq}`);

  return e;
}

/* ==========================================================================
   MIGRATE — sống sót qua OTA đổi content
========================================================================== */

export interface MigrateResult {
  state: GameState;
  notes: string[];
}

/** Chỉnh save cho khớp content MỚI. Không bao giờ ném lỗi. */
export function migrateForContent(state: GameState, content: Content): MigrateResult {
  const notes: string[] = [];
  try {
    const bal = content.balance;
    const fresh = buildFromMap(content);
    const sameSize = state.w === fresh.w && state.h === fresh.h;
    if (!sameSize)
      notes.push(
        `bản đồ đổi kích thước ${state.w}x${state.h} → ${fresh.w}x${fresh.h}; dựng lại lưới, giữ lại phần trùng`,
      );

    const droppedCrops = new Set<string>();
    const droppedBuilds = new Set<string>();
    let lostToTerrain = 0;

    const tiles: Tile[] = new Array<Tile>(fresh.w * fresh.h);
    for (let y = 0; y < fresh.h; y++) {
      for (let x = 0; x < fresh.w; x++) {
        const ni = y * fresh.w + x;
        const base = fresh.tiles[ni];
        const t: Tile = base
          ? { ...base }
          : { g: "grass", prop: null, decor: null, tilled: false, wet: false, crop: null, b: null };

        const oi = x < state.w && y < state.h ? y * state.w + x : -1;
        const old = oi >= 0 ? state.tiles[oi] : undefined;
        if (old) {
          t.tilled = old.tilled === true;
          t.wet = old.wet === true;

          if (old.b) {
            if (content.buildings[old.b]) t.b = old.b;
            else droppedBuilds.add(old.b);
          }
          if (old.crop && typeof old.crop.id === "string") {
            const def = content.crops[old.crop.id];
            if (!def) {
              droppedCrops.add(old.crop.id);
            } else {
              const stage = Math.max(0, Math.min(def.growthDays.length, Math.floor(old.crop.stage) || 0));
              const days = Math.max(0, Math.floor(old.crop.days) || 0);
              t.crop = { id: old.crop.id, stage, days, regrown: old.crop.regrown === true };
            }
          }

          // địa hình mới có thể đã biến ô thành cây/đá/nước → dọn cho sạch
          if (t.prop !== null || t.g === "water") {
            if (t.crop || t.b || t.tilled) lostToTerrain++;
            t.crop = null;
            t.b = null;
            t.tilled = false;
            t.wet = false;
          }
          if (t.crop && !t.tilled) t.tilled = true; // giữ bất biến "có cây thì đã cày"
        }
        tiles[ni] = t;
      }
    }

    for (const id of droppedCrops) notes.push(`gỡ cây '${id}' khỏi ruộng — content mới không còn`);
    for (const id of droppedBuilds) notes.push(`gỡ công trình '${id}' khỏi ruộng — content mới không còn`);
    if (lostToTerrain) notes.push(`${lostToTerrain} ô bị địa hình mới đè lên, đã dọn sạch`);

    // ---- túi đồ ----------------------------------------------------------
    const invRes = normalizeInventory(state.inv, content);
    if (state.inv.length !== invRes.inv.length)
      notes.push(`đổi kích thước túi ${state.inv.length} → ${invRes.inv.length} ô`);
    for (const id of new Set(invRes.dropped)) notes.push(`bỏ vật phẩm '${id}' khỏi túi — content mới không còn`);

    // ---- mở khoá / thống kê ---------------------------------------------
    const unlocked = state.unlocked.filter((u) => {
      if (u.startsWith("seed:")) {
        if (content.crops[u.slice(5)]) return true;
        notes.push(`bỏ mở khoá '${u}' — cây không còn`);
        return false;
      }
      if (content.buildings[u]) return true;
      notes.push(`bỏ mở khoá '${u}' — công trình không còn`);
      return false;
    });

    const built: Record<string, number> = {};
    for (const [k, v] of Object.entries(state.stats.built ?? {})) {
      if (Number.isFinite(v) && v > 0) built[k] = Math.floor(v);
    }

    // ---- các trường vô hướng --------------------------------------------
    const money = Number.isFinite(state.money) ? Math.max(0, state.money) : bal.startMoney;
    const energy = Number.isFinite(state.energy)
      ? Math.max(0, Math.min(bal.energyMax, state.energy))
      : bal.energyMax;
    const minutes = Number.isFinite(state.minutes)
      ? Math.max(bal.dayStartMinutes, Math.min(bal.dayEndMinutes, state.minutes))
      : bal.dayStartMinutes;
    const day = Number.isInteger(state.day) && state.day >= 1 ? state.day : 1;
    const sel = Math.max(0, Math.min(Math.max(1, bal.hotbarSlots | 0) - 1, Math.floor(state.sel) || 0));
    const seed = Number.isFinite(state.seed) && state.seed >= 0 ? state.seed >>> 0 : 1;

    let next: GameState = {
      ...state,
      contentVersion: content.contentVersion,
      seed: seed || 1,
      day,
      minutes,
      money,
      energy,
      w: fresh.w,
      h: fresh.h,
      tiles,
      inv: invRes.inv,
      sel,
      unlocked,
      stagesDone: [...state.stagesDone],
      goalsDone: [...state.goalsDone],
      stats: { ...state.stats, built },
      log: [...state.log],
      logSeq: Number.isInteger(state.logSeq) ? state.logSeq : 0,
      sleeping: false,
      busy: 0,
    };

    // ---- người chơi không được kẹt trong tường ---------------------------
    let px = Number.isFinite(state.player.x) ? state.player.x : tileCenterX(content.tiles.spawn.x);
    let py = Number.isFinite(state.player.y) ? state.player.y : tileCenterY(content.tiles.spawn.y);
    if (blockedAt(next, content, px, py)) {
      const fixed = nudgeOutOfSolid(next, content, px, py);
      if (fixed.x === px && fixed.y === py) {
        const sp = content.tiles.spawn;
        px = tileCenterX(sp.x);
        py = tileCenterY(sp.y);
      } else {
        px = fixed.x;
        py = fixed.y;
      }
      notes.push("người chơi bị kẹt trong địa hình mới, đã dời ra chỗ trống");
    }
    next = { ...next, player: { ...state.player, x: px, y: py } };

    return { state: next, notes };
  } catch (err) {
    notes.push(`migrate gặp lỗi bất ngờ, giữ nguyên state: ${String(err)}`);
    return { state, notes };
  }
}

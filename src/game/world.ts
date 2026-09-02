/* ============================================================================
   WORLD — lưới ô, va chạm, truy vấn không gian.

   Thuần tuý, không DOM. Renderer và UI dùng chung các hàm này để hỏi "ô kia
   là gì / đi vào được không / có với tới không" thay vì tự đoán.

   Quy ước toạ độ (QUAN TRỌNG, cả hai làn phải theo):
     · 1 ô = TILE = 16 px.
     · `player.x/y` là TÂM hitbox người chơi, tính bằng pixel thế giới (float).
       Hitbox = PLAYER_W x PLAYER_H px, căn giữa quanh (x, y).
       Tâm ô (tx,ty) = ((tx+0.5)*16, (ty+0.5)*16).
============================================================================ */

import type {
  Content,
  GameState,
  GroundKind,
  InteractKind,
  Tile,
} from "./types.ts";

export const TILE = 16;
export const PLAYER_W = 10;
export const PLAYER_H = 10;
/** px mỗi giây */
export const PLAYER_SPEED = 60;
/** tầm với tính bằng SỐ Ô, đo từ tâm người chơi tới tâm ô */
export const REACH_TILES = 1.6;

/* ------------------------------------------------------------------ legend */

export interface LegendIndex {
  solidProps: Set<string>;
  solidGrounds: Set<GroundKind>;
  interactByProp: Record<string, InteractKind>;
  interactByGround: Record<string, InteractKind>;
}

const legendCache = new WeakMap<Content, LegendIndex>();

/** Bảng tra suy ra từ `content.tiles.legend`, có nhớ đệm theo tham chiếu Content.
 *  Cần thiết vì `Tile` không lưu lại ký tự legend gốc. */
export function legendIndex(content: Content): LegendIndex {
  const hit = legendCache.get(content);
  if (hit) return hit;
  const ix: LegendIndex = {
    solidProps: new Set<string>(),
    solidGrounds: new Set<GroundKind>(),
    interactByProp: {},
    interactByGround: {},
  };
  for (const entry of Object.values(content.tiles.legend)) {
    if (!entry) continue;
    if (entry.solid) {
      if (entry.prop) ix.solidProps.add(entry.prop);
      else ix.solidGrounds.add(entry.ground);
    }
    if (entry.interact) {
      if (entry.prop) ix.interactByProp[entry.prop] = entry.interact;
      else ix.interactByGround[entry.ground] = entry.interact;
    }
  }
  legendCache.set(content, ix);
  return ix;
}

/* -------------------------------------------------------------- truy vấn ô */

export function idx(w: number, x: number, y: number): number {
  return y * w + x;
}

export function inBounds(state: GameState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < state.w && y < state.h;
}

export function tileAt(state: GameState, x: number, y: number): Tile | null {
  if (!inBounds(state, x, y)) return null;
  return state.tiles[idx(state.w, x, y)] ?? null;
}

export function tileIndexAt(state: GameState, x: number, y: number): number {
  return inBounds(state, x, y) ? idx(state.w, x, y) : -1;
}

/** Dựng lớp ô tĩnh từ `content.map` + legend. Mọi ô bắt đầu chưa cày, khô, trống. */
export function buildFromMap(content: Content): { w: number; h: number; tiles: Tile[] } {
  const { w, h, rows } = content.map;
  const tiles: Tile[] = new Array<Tile>(w * h);
  for (let y = 0; y < h; y++) {
    const row = rows[y] ?? "";
    for (let x = 0; x < w; x++) {
      const ch = row[x] ?? ".";
      const e = content.tiles.legend[ch];
      tiles[idx(w, x, y)] = {
        g: e?.ground ?? "grass",
        prop: e?.prop ?? null,
        decor: e?.decor ?? null,
        tilled: false,
        wet: false,
        crop: null,
        b: null,
      };
    }
  }
  return { w, h, tiles };
}

/** Ô này chặn người chơi không? Ngoài bản đồ cũng coi là chặn. */
export function isSolid(state: GameState, content: Content, x: number, y: number): boolean {
  const t = tileAt(state, x, y);
  if (!t) return true;
  return isSolidTile(t, content);
}

export function isSolidTile(t: Tile, content: Content): boolean {
  if (t.b) {
    const def = content.buildings[t.b];
    if (def) {
      if (def.solid) return true;
      // sàn (floor) thay nền ô, luôn đi lên được
      if (def.kind === "floor") return false;
    }
  }
  const ix = legendIndex(content);
  if (t.prop && ix.solidProps.has(t.prop)) return true;
  return ix.solidGrounds.has(t.g);
}

/** Có cày được không (chưa xét năng lượng / tầm với). */
export function isTillable(state: GameState, content: Content, x: number, y: number): boolean {
  const t = tileAt(state, x, y);
  if (!t) return false;
  return isTillableTile(t, content);
}

export function isTillableTile(t: Tile, _content: Content): boolean {
  return t.g === "grass" && t.prop === null && t.b === null && !t.tilled && t.crop === null;
}

/** Đặt được công trình `id` lên ô này không (chưa xét tiền/năng lượng/tầm với). */
export function canPlaceBuilding(
  state: GameState,
  content: Content,
  id: string,
  x: number,
  y: number,
): boolean {
  const def = content.buildings[id];
  const t = tileAt(state, x, y);
  if (!def || !t) return false;
  if (t.b !== null) return false;
  if (t.prop !== null) return false;
  const ix = legendIndex(content);
  if (ix.solidGrounds.has(t.g)) return false; // không xây trên nước
  if (def.kind === "object" && t.crop !== null) return false;
  if (def.kind === "floor" && t.g !== "grass" && t.g !== "path") return false;
  if (def.solid && playerOverlapsTile(state, x, y)) return false;
  return true;
}

/* ------------------------------------------------------- toạ độ & tầm với */

export function tileCenterX(tx: number): number {
  return (tx + 0.5) * TILE;
}
export function tileCenterY(ty: number): number {
  return (ty + 0.5) * TILE;
}
export function pixelToTileX(px: number): number {
  return Math.floor(px / TILE);
}
export function pixelToTileY(py: number): number {
  return Math.floor(py / TILE);
}

/** Ô mà người chơi đang đứng. */
export function playerTile(state: GameState): { x: number; y: number } {
  return { x: pixelToTileX(state.player.x), y: pixelToTileY(state.player.y) };
}

/** Khoảng cách từ tâm người chơi tới tâm ô, tính bằng SỐ Ô. */
export function distToTile(state: GameState, x: number, y: number): number {
  const dx = tileCenterX(x) - state.player.x;
  const dy = tileCenterY(y) - state.player.y;
  return Math.sqrt(dx * dx + dy * dy) / TILE;
}

/** Ô có nằm trong tầm với để USE/INTERACT không. */
export function inReach(state: GameState, x: number, y: number): boolean {
  return distToTile(state, x, y) <= REACH_TILES;
}

/** Hitbox người chơi (px thế giới). */
export function playerRect(x: number, y: number): { l: number; t: number; r: number; b: number } {
  return { l: x - PLAYER_W / 2, t: y - PLAYER_H / 2, r: x + PLAYER_W / 2, b: y + PLAYER_H / 2 };
}

export function playerOverlapsTile(state: GameState, x: number, y: number): boolean {
  const r = playerRect(state.player.x, state.player.y);
  const l = x * TILE;
  const t = y * TILE;
  return r.r > l && r.l < l + TILE && r.b > t && r.t < t + TILE;
}

/** Hitbox tại (cx,cy) có đè lên ô solid nào không. */
export function blockedAt(state: GameState, content: Content, cx: number, cy: number): boolean {
  const r = playerRect(cx, cy);
  const EPS = 1e-6;
  const x0 = Math.floor(r.l / TILE);
  const x1 = Math.floor((r.r - EPS) / TILE);
  const y0 = Math.floor(r.t / TILE);
  const y1 = Math.floor((r.b - EPS) / TILE);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (isSolid(state, content, x, y)) return true;
    }
  }
  return false;
}

/* ------------------------------------------------------------- tương tác */

/** Loại tương tác của ô (SLEEP/SHOP/SELL), KHÔNG xét tầm với. Hàm thuần cho UI. */
export function interactAt(
  state: GameState,
  content: Content,
  x: number,
  y: number,
): InteractKind | null {
  const t = tileAt(state, x, y);
  if (!t) return null;
  const ix = legendIndex(content);
  if (t.prop && ix.interactByProp[t.prop]) return ix.interactByProp[t.prop] ?? null;
  return ix.interactByGround[t.g] ?? null;
}

/** Ô tương tác gần nhất trong tầm với — UI dùng để hiện gợi ý / mở modal. */
export function nearbyInteract(
  state: GameState,
  content: Content,
): { kind: InteractKind; x: number; y: number } | null {
  const p = playerTile(state);
  const rad = Math.ceil(REACH_TILES);
  let best: { kind: InteractKind; x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let y = p.y - rad; y <= p.y + rad; y++) {
    for (let x = p.x - rad; x <= p.x + rad; x++) {
      if (!inBounds(state, x, y)) continue;
      if (!inReach(state, x, y)) continue;
      const kind = interactAt(state, content, x, y);
      if (!kind) continue;
      const d = distToTile(state, x, y);
      if (d < bestD) {
        bestD = d;
        best = { kind, x, y };
      }
    }
  }
  return best;
}

/* --------------------------------------------------------------- cây trồng */

/** Số giai đoạn của cây; chín khi stage === ripeStage. */
export function ripeStage(content: Content, cropId: string): number {
  return content.crops[cropId]?.growthDays.length ?? 0;
}

/** Ô này có cây đã chín không. */
export function isRipe(t: Tile | null, content: Content): boolean {
  if (!t || !t.crop) return false;
  const def = content.crops[t.crop.id];
  if (!def) return false;
  return t.crop.stage >= def.growthDays.length;
}

/* ---------------------------------------------------------------- cứu kẹt */

/** Vị trí hợp lệ gần nhất khi bị kẹt trong ô solid (dùng bởi migrate). */
export function nudgeOutOfSolid(
  state: GameState,
  content: Content,
  x: number,
  y: number,
): { x: number; y: number } {
  if (!blockedAt(state, content, x, y)) return { x, y };
  const cx = Math.floor(x / TILE);
  const cy = Math.floor(y / TILE);
  for (let r = 0; r <= 24; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const px = (cx + dx + 0.5) * TILE;
        const py = (cy + dy + 0.5) * TILE;
        if (!blockedAt(state, content, px, py)) return { x: px, y: py };
      }
    }
  }
  return { x, y };
}

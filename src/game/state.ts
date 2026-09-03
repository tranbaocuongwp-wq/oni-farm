/* ============================================================================
   STATE — tạo game mới, PRNG tất định, và bộ "draft" copy-on-write.

   `reduce()` phải THUẦN: không được sửa `state` cũ. Thay vì clone sâu cả cây
   (đắt, và làm renderer mất mọi tham chiếu cũ), ta dùng draft:

       const d = draft(state);
       const t = dTile(d, i);   // chỉ clone mảng tiles + đúng ô đó
       t.wet = true;
       return commit(d);        // đổi thì trả object mới, không đổi thì trả y nguyên

   Nhờ vậy phần không đụng tới vẫn dùng chung tham chiếu, và store so sánh
   `next === state` để bỏ qua render.
============================================================================ */

import type {
  Content,
  GameState,
  InvSlot,
  LogEntry,
  PlayerState,
  Stats,
  StoredMap,
  Tile,
} from "./types.ts";
import { CORE_VERSION, SAVE_VERSION } from "../core/version.ts";
import { buildAllMaps, mapIdsOf, tileCenterX, tileCenterY } from "./world.ts";
import { createInventory } from "./inventory.ts";
import { evaluateProgression } from "./progression.ts";

/* Cầu nối cho làn render/UI: main.ts nhập migrateForContent từ đây, còn phần
   cài đặt nằm cạnh checkInvariants (cùng một mối lo: giữ state hợp lệ). */
export { migrateForContent } from "./invariants.ts";
export type { MigrateResult } from "./invariants.ts";

/** Số toast tối đa giữ lại trong state. */
export const LOG_LIMIT = 30;

/* ------------------------------------------------------------------- PRNG */

/** mulberry32 — một bước, thuần: (seed) -> { v in [0,1), seed mới }. */
export function nextRandom(seed: number): { v: number; seed: number } {
  const a = (seed + 0x6d2b79f5) | 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const v = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { v, seed: a >>> 0 };
}

/** Số nguyên trong [min,max] (bao gồm hai đầu). */
export function randInt(seed: number, min: number, max: number): { v: number; seed: number } {
  if (max <= min) return { v: min, seed: nextRandom(seed).seed };
  const r = nextRandom(seed);
  return { v: min + Math.floor(r.v * (max - min + 1)), seed: r.seed };
}

/* ------------------------------------------------------------------ draft */

export interface Draft {
  base: GameState;
  s: GameState;
  changed: boolean;
}

export function draft(base: GameState): Draft {
  return { base, s: { ...base }, changed: false };
}

/** Trả state cũ nguyên vẹn nếu không có gì đổi (store dựa vào đó để bỏ render). */
export function commit(d: Draft): GameState {
  return d.changed ? d.s : d.base;
}

/** Đánh dấu "có thay đổi" cho các trường vô hướng (money, energy, day...). */
export function touch(d: Draft): GameState {
  d.changed = true;
  return d.s;
}

export function dTiles(d: Draft): Tile[] {
  if (d.s.tiles === d.base.tiles) d.s.tiles = d.base.tiles.slice();
  d.changed = true;
  return d.s.tiles;
}

/** Lấy bản sao có thể sửa của ô thứ `i`. null nếu chỉ số sai. */
export function dTile(d: Draft, i: number): Tile | null {
  if (i < 0 || i >= d.base.tiles.length) return null;
  const tiles = dTiles(d);
  const cur = tiles[i];
  if (!cur) return null;
  if (cur === d.base.tiles[i]) {
    const copy: Tile = { ...cur, crop: cur.crop ? { ...cur.crop } : null };
    tiles[i] = copy;
    return copy;
  }
  return cur;
}

/* ------------------------------------------------- bản đồ đã cất (nhiều map)

   Bản đồ ĐANG chơi nằm ở `tiles/w/h`; các bản đồ khác nằm trong `maps`. Việc
   sang ngày mới phải chạm tới TẤT CẢ, nên cần đúng một cách viết dùng chung
   cho cả hai chỗ — đó là `MapView`: một cửa sổ đọc/ghi lên MỘT lưới, có sẵn
   copy-on-write riêng.

   Copy-on-write ba tầng, chỉ clone khi THẬT SỰ ghi:
     `maps` (object) → `maps[id]` (StoredMap + mảng tiles) → từng ô.
   Bản đồ không đổi gì trong đêm thì giữ nguyên tham chiếu cũ.
--------------------------------------------------------------------------- */

/** Bản sao sửa được của chính object `maps`. */
export function dMaps(d: Draft): Record<string, StoredMap> {
  if (d.s.maps === d.base.maps) d.s.maps = { ...d.base.maps };
  d.changed = true;
  return d.s.maps;
}

/** Bản sao sửa được của bản đồ đã cất `id` (kèm mảng tiles riêng). */
export function dStoredMap(d: Draft, id: string): StoredMap | null {
  const cur = d.s.maps?.[id];
  if (!cur) return null;
  const maps = dMaps(d);
  const m = maps[id];
  if (!m) return null;
  if (m === d.base.maps?.[id]) {
    const copy: StoredMap = { w: m.w, h: m.h, tiles: m.tiles.slice(), awayAt: m.awayAt };
    maps[id] = copy;
    return copy;
  }
  return m;
}

/**
 * Cửa sổ đọc/ghi lên một lưới ô.
 *
 * `tiles` được THAY khi lưới bị clone, nên nơi gọi phải đọc `v.tiles[i]` mỗi
 * lần chứ đừng giữ lại tham chiếu mảng qua các lần `edit()`.
 */
export interface MapView {
  id: string;
  /** true nếu đây là bản đồ người chơi đang đứng (`state.tiles`). */
  active: boolean;
  w: number;
  h: number;
  tiles: Tile[];
  /** Bản sao sửa được của ô `i` trên lưới này; null nếu chỉ số sai. */
  edit: (i: number) => Tile | null;
}

/** Cửa sổ lên bản đồ ĐANG chơi. */
export function activeView(d: Draft): MapView {
  const v: MapView = {
    id: d.s.mapId,
    active: true,
    w: d.s.w,
    h: d.s.h,
    tiles: d.s.tiles,
    edit: (i) => {
      const t = dTile(d, i);
      v.tiles = d.s.tiles;
      return t;
    },
  };
  return v;
}

/** Cửa sổ lên một bản đồ ĐÃ CẤT; null nếu state không giữ bản đồ đó. */
export function storedView(d: Draft, id: string): MapView | null {
  const cur = d.s.maps?.[id];
  if (!cur) return null;
  const v: MapView = {
    id,
    active: false,
    w: cur.w,
    h: cur.h,
    tiles: cur.tiles,
    edit: (i) => {
      const m = dStoredMap(d, id);
      if (!m || i < 0 || i >= m.tiles.length) return null;
      v.tiles = m.tiles;
      const t = m.tiles[i];
      if (!t) return null;
      const baseTiles = d.base.maps?.[id]?.tiles;
      if (baseTiles && t === baseTiles[i]) {
        const copy: Tile = { ...t, crop: t.crop ? { ...t.crop } : null };
        m.tiles[i] = copy;
        return copy;
      }
      return t;
    },
  };
  return v;
}

/** MỌI bản đồ trong state, theo thứ tự tất định của content. Dùng cho việc sang
 *  ngày mới và cho debug `harvestAll` — KHÔNG dùng trong TICK. */
export function mapViews(d: Draft, content: Content): MapView[] {
  const out: MapView[] = [];
  for (const id of mapIdsOf(d.s, content)) {
    if (id === d.s.mapId) out.push(activeView(d));
    else {
      const v = storedView(d, id);
      if (v) out.push(v);
    }
  }
  return out;
}

export function dInv(d: Draft): InvSlot[] {
  if (d.s.inv === d.base.inv) d.s.inv = d.base.inv.slice();
  d.changed = true;
  return d.s.inv;
}

export function setInv(d: Draft, inv: InvSlot[]): void {
  d.s.inv = inv;
  d.changed = true;
}

export function dStats(d: Draft): Stats {
  if (d.s.stats === d.base.stats) {
    d.s.stats = { ...d.base.stats, built: { ...d.base.stats.built } };
  }
  d.changed = true;
  return d.s.stats;
}

export function dPlayer(d: Draft): PlayerState {
  if (d.s.player === d.base.player) d.s.player = { ...d.base.player };
  d.changed = true;
  return d.s.player;
}

/* ------------------------------------------------------------------ toast */

/** Đẩy toast lấy chữ từ content.strings.msg. Thiếu khoá thì dùng chính khoá. */
export function toastKey(
  d: Draft,
  content: Content,
  key: string,
  kind: LogEntry["kind"] = "info",
  suffix?: string,
): void {
  const base = content.strings?.msg?.[key] ?? key;
  toastText(d, suffix ? `${base} ${suffix}` : base, kind);
}

/** Đẩy toast bằng chữ có sẵn (progression toast / goal text). */
export function toastText(d: Draft, text: string, kind: LogEntry["kind"] = "info"): void {
  if (d.s.log === d.base.log) d.s.log = d.base.log.slice();
  d.s.logSeq = d.s.logSeq + 1;
  d.s.log.push({ id: d.s.logSeq, text, kind });
  if (d.s.log.length > LOG_LIMIT) d.s.log = d.s.log.slice(d.s.log.length - LOG_LIMIT);
  d.changed = true;
}

/* ------------------------------------------------------------ progression */

/** Áp kết quả progression vào draft (mở khoá + toast). Gọi sau mọi action đổi stats. */
export function applyProgression(d: Draft, content: Content): void {
  const res = evaluateProgression(d.s, content);
  if (!res) return;
  if (res.unlocked.length) d.s.unlocked = [...d.s.unlocked, ...res.unlocked];
  if (res.stagesDone.length) d.s.stagesDone = [...d.s.stagesDone, ...res.stagesDone];
  if (res.goalsDone.length) d.s.goalsDone = [...d.s.goalsDone, ...res.goalsDone];
  d.changed = true;
  for (const t of res.toasts) toastText(d, t.text, t.kind);
}

/* ------------------------------------------------------------- game mới */

export function createNewGame(content: Content, seed = 1): GameState {
  const { mapId, w, h, tiles, maps } = buildAllMaps(content);
  const spawn = content.tiles.spawn;
  const player: PlayerState = {
    x: tileCenterX(spawn.x),
    y: tileCenterY(spawn.y),
    dir: "down",
    moving: false,
    anim: 0,
  };

  const state: GameState = {
    save: SAVE_VERSION,
    coreVersion: CORE_VERSION,
    contentVersion: content.contentVersion,
    seed: (seed >>> 0) || 1,

    day: 1,
    minutes: content.balance.dayStartMinutes,
    money: content.balance.startMoney,
    energy: content.balance.energyMax,

    player,

    mapId,

    w,
    h,
    tiles,
    maps,

    inv: createInventory(content),
    sel: 0,

    unlocked: [],
    stagesDone: [],
    goalsDone: [],
    stats: {
      tilled: 0,
      planted: 0,
      watered: 0,
      harvested: 0,
      sold: 0,
      earned: 0,
      built: {},
    },

    log: [],
    logSeq: 0,
    sleeping: false,
    busy: 0,

    water: Math.max(0, Math.floor(content.balance.startWater ?? 0)),
  };

  // Áp ngay mốc `start` (require rỗng) để cửa hàng có hàng từ giây đầu tiên.
  const d = draft(state);
  applyProgression(d, content);
  return commit(d);
}

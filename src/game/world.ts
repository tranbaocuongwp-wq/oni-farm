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
  GroundDef,
  GroundKind,
  InteractKind,
  PropDef,
  StoredMap,
  Tile,
} from "./types.ts";

export const TILE = 16;
export const PLAYER_W = 10;
export const PLAYER_H = 10;
/** px mỗi giây */
export const PLAYER_SPEED = 60;
/** tầm với tính bằng SỐ Ô, đo từ tâm người chơi tới tâm ô */
export const REACH_TILES = 1.6;

/* -------------------------------------------------- tra cứu nền & vật thể */

/* Trước đây tính "đặc"/"tương tác" được SUY từ legend của bản đồ. Giờ chúng là
   DỮ LIỆU: nằm trong props.json (vật thể) và tiles.json > grounds (nền). Nhờ
   vậy thêm một loại địa hình mới không phải sửa dòng code nào ở đây. */

/** Tính chất của NỀN. Nền lạ (content mới, core cũ) trả null → không đặc. */
export function groundDef(content: Content, g: GroundKind): GroundDef | null {
  return content.tiles.grounds?.[g] ?? null;
}

/**
 * Hệ số tốc độ dưới điểm (px thế giới). Ngoài bản đồ = 1.
 *
 * Lấy giá trị LỚN HƠN giữa nền và công trình đứng trên nó. Đường người chơi tự
 * xây là một CÔNG TRÌNH chứ không phải nền — cố ý: `mergeGrid` dựng lại nền từ
 * bản đồ mỗi lần cập nhật content, nên đường ghi vào nền sẽ bị xoá sạch sau một
 * lần đẩy OTA, còn `Tile.b` thì được giữ nguyên. Nền `asphalt` vẫn có để người
 * thiết kế bản đồ vẽ sẵn đường trục.
 */
export function speedMulAt(state: GameState, content: Content, px: number, py: number): number {
  // `tileAt` nhận toạ độ Ô, không phải pixel thế giới — phải đổi.
  const t = tileAt(state, Math.floor(px / TILE), Math.floor(py / TILE));
  if (!t) return 1;
  let m = 1;
  const gm = groundDef(content, t.g)?.speedMul;
  if (typeof gm === "number" && gm > m) m = gm;
  if (t.b) {
    const bm = content.buildings[t.b]?.effects.speedMul;
    if (typeof bm === "number" && bm > m) m = bm;
  }
  return m;
}

/** Hệ số tốc độ lớn nhất mà content cho phép — heuristic của A* phải chia cho
 *  con số này, nếu không nó ước lượng THỪA và A* mất tính tối ưu. */
export function maxSpeedMul(content: Content): number {
  let m = 1;
  for (const g of Object.values(content.tiles.grounds ?? {})) {
    const v = g?.speedMul;
    if (typeof v === "number" && v > m) m = v;
  }
  for (const b of Object.values(content.buildings)) {
    const v = b?.effects.speedMul;
    if (typeof v === "number" && v > m) m = v;
  }
  return m;
}

/** Định nghĩa vật thể theo id. Vật thể LẠ trả null — nơi gọi phải coi nó là
 *  đặc và không khai thác được, chứ không được sập. */
export function propDef(content: Content, id: string | null): PropDef | null {
  if (!id) return null;
  return content.props[id] ?? null;
}

/** Vật thể đứng trên ô (x,y), null nếu ô trống / ngoài bản đồ / prop lạ. */
export function propAt(
  state: GameState,
  content: Content,
  x: number,
  y: number,
): PropDef | null {
  const t = tileAt(state, x, y);
  return t ? propDef(content, t.prop) : null;
}

/** BẢN ĐỒ + ô ĐÍCH của cửa dịch chuyển ở (x,y), null nếu ô này không phải cửa.
 *  Đích luôn tra từ content — không ai dịch chuyển tới bản đồ hay toạ độ tuỳ ý. */
export function portalAt(
  state: GameState,
  content: Content,
  x: number,
  y: number,
): { map: string; x: number; y: number } | null {
  const def = propAt(state, content, x, y);
  const p = def?.portal;
  if (!p || typeof p.map !== "string" || !p.map) return null;
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  return { map: p.map, x: Math.floor(p.x), y: Math.floor(p.y) };
}

/** Vật thể "cỏ dại" dùng khi cỏ mọc lan ban đêm: vật thể khai thác được mà
 *  TAY KHÔNG cũng phá được và không để lại gì. Lấy từ content nên đổi
 *  props.json là đổi luôn thứ mọc lên, không phải sửa code. */
export function weedProp(content: Content): PropDef | null {
  for (const id of content.propOrder) {
    const p = content.props[id];
    if (p && p.hits && p.hits > 0 && !p.tool && !p.becomes && !p.grow && !p.spread) return p;
  }
  return null;
}

/** Vật thể "cây gỗ nhỏ" (bảng gỡ lỗi rắc cây): cần rìu, cao một ô, phá là hết. */
export function saplingProp(content: Content): PropDef | null {
  for (const id of content.propOrder) {
    const p = content.props[id];
    if (p && p.hits && p.hits > 0 && p.tool === "CHOP" && !p.tall && !p.becomes && !p.spread) return p;
  }
  return null;
}

/** Ô này có vật thể khai thác được không (cây/đá/bụi cỏ). */
export function harvestableAt(
  state: GameState,
  content: Content,
  x: number,
  y: number,
): PropDef | null {
  const def = propAt(state, content, x, y);
  if (!def || !def.hits || def.hits <= 0) return null;
  return def;
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

/* ------------------------------------------------------------ dựng bản đồ */

/** Bản đồ mở đầu ván mới. Spawn trỏ vào bản đồ không tồn tại thì lùi về bản đồ
 *  đầu tiên trong `mapOrder` — thà vào nhầm phòng còn hơn không vào được đâu. */
export function spawnMapId(content: Content): string {
  const want = content.tiles?.spawn?.map;
  if (typeof want === "string" && content.maps[want]) return want;
  return content.mapOrder[0] ?? "";
}

/** Bản đồ `id` ĐANG ở trong state, dù nó là bản đồ hoạt động hay đã cất.
 *  UI/minimap dùng hàm này để vẽ bất kỳ bản đồ nào mà không phải phân biệt. */
export function getMap(state: GameState, id: string): StoredMap | null {
  // Bản đồ đang chơi không "vắng mặt" — nó đang được TICK nuôi — nên `awayAt`
  // của nó chỉ là chỗ giữ chỗ để hai nhánh cùng một kiểu.
  if (id === state.mapId)
    return { w: state.w, h: state.h, tiles: state.tiles, awayAt: state.minutes };
  return state.maps?.[id] ?? null;
}

/** Danh sách bản đồ trong state theo thứ tự ỔN ĐỊNH của content (bản đồ lạ,
 *  không còn trong content, xếp cuối theo thứ tự chữ cái). Mọi vòng lặp đa bản
 *  đồ phải đi qua đây để kết quả tất định. */
export function mapIdsOf(state: GameState, content: Content): string[] {
  const have = new Set<string>([state.mapId, ...Object.keys(state.maps ?? {})]);
  const out: string[] = [];
  for (const id of content.mapOrder) {
    if (have.delete(id)) out.push(id);
  }
  for (const id of [...have].sort()) out.push(id);
  return out;
}

/** Dựng lớp ô tĩnh của MỘT bản đồ từ `content.maps[mapId]` + legend.
 *  Mọi ô bắt đầu chưa cày, khô, trống. Bản đồ không tồn tại → null. */
export function buildFromMap(content: Content, mapId: string): StoredMap | null {
  const data = content.maps?.[mapId];
  if (!data) return null;
  const { w, h, rows } = data;
  const tiles: Tile[] = new Array<Tile>(w * h);
  for (let y = 0; y < h; y++) {
    const row = rows[y] ?? "";
    for (let x = 0; x < w; x++) {
      const ch = row[x] ?? ".";
      const e = content.tiles.legend[ch];
      const prop = e?.prop ?? null;
      tiles[idx(w, x, y)] = {
        g: e?.ground ?? "grass",
        prop,
        decor: e?.decor ?? null,
        tilled: false,
        wet: false,
        crop: null,
        b: null,
        hp: propDef(content, prop)?.hits ?? 0,
      };
    }
  }
  // Bản đồ vừa dựng coi như "cất từ đầu ngày": chưa ai bước vào, nên cả ngày
  // hôm nay đều là thời gian vắng mặt.
  return { w, h, tiles, awayAt: content.balance.dayStartMinutes };
}

/** Dựng TẤT CẢ bản đồ cho một ván mới.
 *
 *  Bản đồ spawn trở thành bản đồ HOẠT ĐỘNG (`mapId` + `w/h/tiles`), phần còn
 *  lại nằm trong `maps`. Bất biến: `mapId` không bao giờ có mặt trong `maps`. */
export function buildAllMaps(content: Content): {
  mapId: string;
  w: number;
  h: number;
  tiles: Tile[];
  maps: Record<string, StoredMap>;
} {
  const mapId = spawnMapId(content);
  const maps: Record<string, StoredMap> = {};
  let active: StoredMap | null = null;
  for (const id of content.mapOrder) {
    const built = buildFromMap(content, id);
    if (!built) continue;
    if (id === mapId) active = built;
    else maps[id] = built;
  }
  const a: StoredMap = active ?? { w: 0, h: 0, tiles: [], awayAt: content.balance.dayStartMinutes };
  return { mapId, w: a.w, h: a.h, tiles: a.tiles, maps };
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
  if (t.prop) {
    const def = content.props[t.prop];
    // Vật thể lạ (content mới thêm, core chưa biết) → coi như đặc cho an toàn.
    if (!def) return true;
    if (def.solid) return true;
  }
  return groundDef(content, t.g)?.solid === true;
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
  if (groundDef(content, t.g)?.solid === true) return false; // không xây trên nước
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

/** Hitbox tại (cx,cy) có đè lên ô solid nào không. Vỏ mỏng cho kích thước
 *  người chơi — mọi nơi gọi cũ không phải sửa gì. */
export function blockedAt(state: GameState, content: Content, cx: number, cy: number): boolean {
  return blockedAtBox(state, content, cx, cy, PLAYER_W, PLAYER_H);
}

/**
 * Ô này đi được với một thực thể BƠI hay ĐI BỘ.
 *
 * Loài dưới nước đảo ngược luật: nước là chỗ đi được, cạn là chỗ chặn. Không có
 * cái này thì con cá được thả xuống sẽ đứng trên đường nhựa như một con cá đi
 * bộ, còn cái ao thì nó không bao giờ vào được — vì nước là ô ĐẶC với mọi thứ
 * khác trong game.
 */
export function tileOkFor(t: Tile | null, content: Content, swims: boolean): boolean {
  if (!t) return false;
  if (!swims) return !isSolidTile(t, content);
  if (t.prop || t.b) return false;
  return t.g === "water";
}

/** Hộp va chạm của một thực thể BƠI/ĐI BỘ tại (cx,cy) có nằm gọn trong vùng đi
 *  được không. */
export function blockedForActor(
  state: GameState,
  content: Content,
  cx: number,
  cy: number,
  bw: number,
  bh: number,
  swims: boolean,
): boolean {
  if (!swims) return blockedAtBox(state, content, cx, cy, bw, bh);
  const EPS = 1e-6;
  const x0 = Math.floor((cx - bw / 2) / TILE);
  const x1 = Math.floor((cx + bw / 2 - EPS) / TILE);
  const y0 = Math.floor((cy - bh / 2) / TILE);
  const y1 = Math.floor((cy + bh / 2 - EPS) / TILE);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) if (!tileOkFor(tileAt(state, x, y), content, true)) return true;
  return false;
}

/** Ô NƯỚC gần (x,y) nhất — dùng để thả cá xuống ao thay vì lên mặt đường. */
export function nearestWaterTile(
  state: GameState,
  content: Content,
  x: number,
  y: number,
  maxR = 30,
): { x: number; y: number } | null {
  for (let r = 0; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = x + dx;
        const ty = y + dy;
        if (tileOkFor(tileAt(state, tx, ty), content, true)) return { x: tx, y: ty };
      }
  }
  return null;
}

/** Hộp va chạm KÍCH THƯỚC BẤT KỲ tại (cx,cy) có đè lên ô đặc nào không.
 *  Xe tải rộng hơn người, con gà hẹp hơn — dùng chung một hộp cố định thì xe
 *  sẽ tìm ra đường mà thân nó không lọt. */
export function blockedAtBox(
  state: GameState,
  content: Content,
  cx: number,
  cy: number,
  bw: number,
  bh: number,
): boolean {
  const r = { l: cx - bw / 2, t: cy - bh / 2, r: cx + bw / 2, b: cy + bh / 2 };
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
  const def = propDef(content, t.prop);
  if (def?.interact) return def.interact;
  return groundDef(content, t.g)?.interact ?? null;
}

/** Ô tương tác gần nhất trong tầm với — UI dùng để hiện gợi ý / mở modal.
 *  `only` lọc theo một loại tương tác (bàn chế tạo, chỗ múc nước...). */
export function nearbyInteract(
  state: GameState,
  content: Content,
  only?: InteractKind,
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
      if (only && kind !== only) continue;
      const d = distToTile(state, x, y);
      if (d < bestD) {
        bestD = d;
        best = { kind, x, y };
      }
    }
  }
  return best;
}

/** Đang đứng cạnh một ô tương tác loại này không (giếng, bàn chế tạo...). */
export function hasNearbyInteract(
  state: GameState,
  content: Content,
  kind: InteractKind,
): boolean {
  return nearbyInteract(state, content, kind) !== null;
}

/** Tầm với cho INTERACT/PORTAL: rộng hơn USE một chút.
 *
 *  Ngoài tầm với hình tròn, mọi ô KỀ (kể cả kề chéo) ô đang đứng đều tính là
 *  với tới — nếu không thì đứng lệch vài pixel trong ô cạnh cửa là bấm E không
 *  ăn, mà người chơi thì không thấy có gì khác. */
export function inInteractRange(state: GameState, x: number, y: number): boolean {
  if (inReach(state, x, y)) return true;
  const p = playerTile(state);
  return Math.abs(p.x - x) <= 1 && Math.abs(p.y - y) <= 1;
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

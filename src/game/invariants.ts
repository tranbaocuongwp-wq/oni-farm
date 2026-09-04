/* ============================================================================
   INVARIANTS — lưới an toàn.

   `checkInvariants()` được store gọi sau MỌI dispatch khi bật validate. Trả về
   danh sách chuỗi mô tả lỗi (rỗng = ổn). Không bao giờ ném lỗi.

   `migrateForContent()` là chốt chặn cho OTA: save cũ gặp content mới đã gỡ
   cây/công trình (hoặc gỡ hẳn MỘT BẢN ĐỒ) thì phải sống sót, không được ném lỗi
   và không được để lại state vi phạm bất biến.

   Bất biến quan trọng nhất của việc tách nhiều bản đồ:
     · `state.mapId` phải có trong `content.maps`;
     · `state.mapId` KHÔNG BAO GIỜ có mặt trong `state.maps`;
     · mọi bản đồ trong content đều phải có mặt đúng một lần (hoặc là bản đồ
       đang chơi, hoặc nằm trong `maps`).
============================================================================ */

import type { Content, GameState, StoredMap, Tile } from "./types.ts";
import {
  TILE,
  blockedAt,
  buildFromMap,
  nudgeOutOfSolid,
  spawnMapId,
  tileCenterX,
  tileCenterY,
} from "./world.ts";
import { TOOL_SLOTS, normalizeInventory, toolIds } from "./inventory.ts";
import { parseItem } from "./items.ts";

/** Kiểm mọi ô của MỘT lưới. `where` chỉ để ghi vào thông điệp lỗi. */
function checkGrid(tiles: Tile[], content: Content, where: string, e: string[]): void {
  let cropOnUntilled = 0;
  let badStage = 0;
  let badGrow = 0;
  let badHp = 0;
  const missingCrop = new Set<string>();
  const missingBuild = new Set<string>();
  const missingProp = new Set<string>();

  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    if (!t) {
      e.push(`${where}: tiles[${i}] rỗng`);
      continue;
    }
    if (t.b !== null && !content.buildings[t.b]) missingBuild.add(t.b);
    if (t.prop !== null && !content.props[t.prop]) missingProp.add(t.prop);
    if (!Number.isFinite(t.hp) || t.hp < 0) badHp++;
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
      if (!Number.isFinite(t.crop.grow) || t.crop.grow < 0) badGrow++;
    }
  }

  if (cropOnUntilled) e.push(`${where}: ${cropOnUntilled} ô có cây mà chưa cày`);
  if (badStage) e.push(`${where}: ${badStage} ô có crop.stage ngoài [0, growthDays.length]`);
  if (badGrow) e.push(`${where}: ${badGrow} ô có crop.grow không hữu hạn hoặc âm`);
  if (badHp) e.push(`${where}: ${badHp} ô có hp không hữu hạn hoặc âm`);
  for (const id of missingCrop) e.push(`${where}: cây '${id}' không tồn tại trong content`);
  for (const id of missingBuild) e.push(`${where}: công trình '${id}' không tồn tại trong content`);
  for (const id of missingProp) e.push(`${where}: vật thể '${id}' không tồn tại trong content`);
}

export function checkInvariants(state: GameState, content: Content): string[] {
  const e: string[] = [];
  const bal = content.balance;

  // ---- số học cơ bản ----------------------------------------------------
  if (!Number.isFinite(state.money)) e.push(`money không hữu hạn: ${state.money}`);
  else if (state.money < 0) e.push(`money âm: ${state.money}`);

  if (!Number.isFinite(state.busy) || state.busy < 0)
    e.push(`busy phải là số >= 0, nhận: ${state.busy}`);
  if (state.pending !== null && state.pending !== undefined) {
    const p = state.pending;
    if (!(state.busy > 0)) e.push(`pending ${JSON.stringify(p)} nhưng busy = ${state.busy}`);
    if (!Number.isInteger(p.x) || !Number.isInteger(p.y) || p.x < 0 || p.y < 0 || p.x >= state.w || p.y >= state.h)
      e.push(`pending ngoài bản đồ: ${JSON.stringify(p)}`);
  }
  if (!Number.isFinite(state.energy)) e.push(`energy không hữu hạn: ${state.energy}`);
  else if (state.energy < 0 || state.energy > bal.energyMax)
    e.push(`energy ${state.energy} ngoài [0, ${bal.energyMax}]`);

  if (!Number.isFinite(state.minutes)) e.push(`minutes không hữu hạn: ${state.minutes}`);
  else if (state.minutes < bal.dayStartMinutes || state.minutes > bal.dayEndMinutes)
    e.push(`minutes ${state.minutes} ngoài [${bal.dayStartMinutes}, ${bal.dayEndMinutes}]`);

  if (!Number.isInteger(state.day) || state.day < 1) e.push(`day phải là số nguyên >= 1, nhận ${state.day}`);
  if (!Number.isFinite(state.seed) || state.seed < 0) e.push(`seed không hợp lệ: ${state.seed}`);

  if (!Number.isFinite(state.water)) e.push(`water không hữu hạn: ${state.water}`);
  else if (state.water < 0) e.push(`water âm: ${state.water}`);

  // ---- bản đồ đang chơi --------------------------------------------------
  const activeDef = typeof state.mapId === "string" ? content.maps?.[state.mapId] : undefined;
  if (!activeDef) e.push(`mapId '${String(state.mapId)}' không có trong content.maps`);
  else if (state.w !== activeDef.w || state.h !== activeDef.h)
    e.push(
      `kích thước lưới ${state.w}x${state.h} khác bản đồ '${state.mapId}' ${activeDef.w}x${activeDef.h}`,
    );
  if (state.tiles.length !== state.w * state.h)
    e.push(`tiles.length = ${state.tiles.length}, phải là w*h = ${state.w * state.h}`);
  checkGrid(state.tiles, content, `bản đồ '${String(state.mapId)}'`, e);

  // ---- các bản đồ đã cất -------------------------------------------------
  const stored: Record<string, StoredMap> =
    state.maps && typeof state.maps === "object" ? state.maps : {};
  if (!state.maps || typeof state.maps !== "object") e.push("maps phải là object tên → bản đồ");

  // BẤT BIẾN CỐT LÕI: bản đồ đang chơi không được nằm cả trong `maps`, nếu
  // không thì có hai bản sao và một trong hai sẽ âm thầm bị mất.
  if (Object.prototype.hasOwnProperty.call(stored, state.mapId))
    e.push(`bản đồ đang chơi '${state.mapId}' KHÔNG được có mặt trong maps`);

  for (const id of Object.keys(stored)) {
    if (id === state.mapId) continue; // đã báo ở trên
    const m = stored[id];
    const def = content.maps?.[id];
    if (!m || !Array.isArray(m.tiles)) {
      e.push(`maps['${id}'] không phải bản đồ hợp lệ`);
      continue;
    }
    if (!def) e.push(`maps['${id}'] không có trong content.maps`);
    else if (m.w !== def.w || m.h !== def.h)
      e.push(`maps['${id}'] kích thước ${m.w}x${m.h} khác content ${def.w}x${def.h}`);
    if (m.tiles.length !== m.w * m.h)
      e.push(`maps['${id}'].tiles.length = ${m.tiles.length}, phải là w*h = ${m.w * m.h}`);
    // awayAt hỏng thì mọi phép cộng bù ra NaN và cây đứng hình vĩnh viễn —
    // im lặng, nên phải bắt ở đây.
    if (!Number.isFinite(m.awayAt)) e.push(`maps['${id}'].awayAt phải là số (đang là ${String(m.awayAt)})`);
    checkGrid(m.tiles, content, `maps['${id}']`, e);
  }

  for (const id of content.mapOrder) {
    if (id === state.mapId) continue;
    if (!Object.prototype.hasOwnProperty.call(stored, id))
      e.push(`thiếu bản đồ '${id}' — content có mà state không giữ`);
  }

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

/** Những thứ nhặt được trong lúc trộn lưới, gom lại để chỉ ghi chú MỘT lần cho
 *  cả thế giới thay vì lặp lại theo từng bản đồ. */
interface MergeLog {
  crops: Set<string>;
  builds: Set<string>;
  props: Set<string>;
  lostToTerrain: number;
}

/**
 * Trộn một lưới CŨ (từ save) lên một lưới MỚI dựng từ content.
 *
 * Bản đồ lo phần CÔNG TRÌNH TĨNH (nhà/tường/cửa), người chơi lo phần KHAI THÁC
 * (cây/đá/bụi cỏ) và mọi thứ mình đặt lên (cày/tưới/cây trồng/công trình).
 */
function mergeGrid(
  old: { w: number; h: number; tiles: Tile[]; awayAt?: number } | null,
  fresh: StoredMap,
  content: Content,
  log: MergeLog,
): StoredMap {
  const tiles: Tile[] = new Array<Tile>(fresh.w * fresh.h);
  for (let y = 0; y < fresh.h; y++) {
    for (let x = 0; x < fresh.w; x++) {
      const ni = y * fresh.w + x;
      const base = fresh.tiles[ni];
      const t: Tile = base
        ? { ...base }
        : { g: "grass", prop: null, decor: null, tilled: false, wet: false, crop: null, b: null, hp: 0 };

      const oi = old && x < old.w && y < old.h ? y * old.w + x : -1;
      const prev = old && oi >= 0 ? old.tiles[oi] : undefined;
      if (prev) {
        t.tilled = prev.tilled === true;
        t.wet = prev.wet === true;

        // ---- vật thể: bản đồ lo phần CÔNG TRÌNH, người chơi lo phần KHAI THÁC
        //
        // Cây/đá/bụi cỏ là thứ người chơi chặt đi được, nên trạng thái của
        // chúng thuộc về save chứ không phải bản đồ — nếu lấy lại từ bản đồ
        // thì mở game lần sau là cả rừng mọc lại. Ngược lại nhà/tường/cửa
        // không khai thác được: bản đồ mới nói sao thì theo vậy.
        const freshDef = t.prop ? content.props[t.prop] : undefined;
        const freshIsHarvestable = !!freshDef?.hits;
        if (t.prop === null || freshIsHarvestable) {
          const oldProp = typeof prev.prop === "string" ? prev.prop : null;
          if (oldProp === null) {
            t.prop = null;
          } else if (content.props[oldProp]) {
            t.prop = oldProp;
          } else {
            log.props.add(oldProp);
            t.prop = null;
          }
        }
        // hp: giữ nếu còn hợp lệ, không thì trả về đầy máu (save v2 không có
        // trường này nên mọi ô về 0 — 0 ở đây phải hiểu là "chưa biết").
        const propNow = t.prop ? content.props[t.prop] : undefined;
        const full = Math.max(0, Math.floor(propNow?.hits ?? 0));
        const keep = prev.prop === t.prop && Number.isFinite(prev.hp) && prev.hp > 0;
        t.hp = keep ? Math.min(Math.floor(prev.hp), full) : full;

        if (prev.b) {
          if (content.buildings[prev.b]) t.b = prev.b;
          else log.builds.add(prev.b);
        }
        if (prev.crop && typeof prev.crop.id === "string") {
          const def = content.crops[prev.crop.id];
          if (!def) {
            log.crops.add(prev.crop.id);
          } else {
            const stage = Math.max(0, Math.min(def.growthDays.length, Math.floor(prev.crop.stage) || 0));
            const raw = Number(prev.crop.grow);
            const grow = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
            t.crop = { id: prev.crop.id, stage, grow, regrown: prev.crop.regrown === true };
          }
        }

        // địa hình mới có thể đã biến ô thành cây/đá/nước → dọn cho sạch
        if (t.prop !== null || t.g === "water") {
          if (t.crop || t.b || t.tilled) log.lostToTerrain++;
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
  // Mốc vắng mặt là tiến độ của NGƯỜI CHƠI, không phải của bản đồ: content mới
  // dựng lại lưới thì vẫn phải giữ, nếu không đổi content sẽ tặng không một
  // ngày tăng trưởng cho mọi bản đồ đang cất.
  const awayAt = Number.isFinite(old?.awayAt) ? (old as { awayAt: number }).awayAt : fresh.awayAt;
  return { w: fresh.w, h: fresh.h, tiles, awayAt };
}

/** Chỉnh save cho khớp content MỚI. Không bao giờ ném lỗi. */
export function migrateForContent(state: GameState, content: Content): MigrateResult {
  const notes: string[] = [];
  try {
    const bal = content.balance;
    const spawnId = spawnMapId(content);

    // ---- bản đồ đang chơi ------------------------------------------------
    const rawMapId = typeof state.mapId === "string" ? state.mapId : "";
    const mapIdOk = !!content.maps?.[rawMapId];
    let mapId = mapIdOk ? rawMapId : spawnId;
    if (!mapIdOk)
      notes.push(
        rawMapId
          ? `bản đồ đang chơi '${rawMapId}' không còn trong content — về '${spawnId}'`
          : `save không nói đang ở bản đồ nào — về '${spawnId}'`,
      );

    // ---- gom mọi lưới CŨ, tra theo tên bản đồ ----------------------------
    const oldGrids: Record<string, { w: number; h: number; tiles: Tile[]; awayAt?: number }> = {};
    const rawStored: Record<string, unknown> =
      state.maps && typeof state.maps === "object" ? (state.maps as Record<string, unknown>) : {};
    for (const id of Object.keys(rawStored)) {
      const m = rawStored[id] as StoredMap | undefined;
      if (!m || !Array.isArray(m.tiles)) continue;
      const w = Number.isInteger(m.w) ? m.w : 0;
      const h = Number.isInteger(m.h) ? m.h : 0;
      oldGrids[id] = { w, h, tiles: m.tiles, awayAt: m.awayAt };
    }
    // Lưới đang chơi. `mapId` hỏng thì đoán nó là bản đồ spawn — save v3 chỉ có
    // đúng một lưới và đó luôn là bản đồ chính; đoán thế giữ được cả ruộng, còn
    // đoán sai thì cùng lắm mất phần chồng lấn. Nhưng nếu `maps` ĐÃ có sẵn bản
    // đồ spawn thì cái đó mới là thật, lưới mồ côi kia bỏ đi.
    if (Array.isArray(state.tiles) && !oldGrids[mapId])
      oldGrids[mapId] = {
        w: Number.isInteger(state.w) ? state.w : 0,
        h: Number.isInteger(state.h) ? state.h : 0,
        tiles: state.tiles,
      };

    // ---- dựng lại từng bản đồ theo content MỚI ---------------------------
    const log: MergeLog = { crops: new Set(), builds: new Set(), props: new Set(), lostToTerrain: 0 };
    const rebuilt: Record<string, StoredMap> = {};
    for (const id of content.mapOrder) {
      const fresh = buildFromMap(content, id);
      if (!fresh) continue;
      const old = oldGrids[id] ?? null;
      if (!old) notes.push(`dựng mới bản đồ '${id}' — save chưa có`);
      else if (old.w !== fresh.w || old.h !== fresh.h)
        notes.push(
          `bản đồ '${id}' đổi kích thước ${old.w}x${old.h} → ${fresh.w}x${fresh.h}; dựng lại lưới, giữ lại phần trùng`,
        );
      rebuilt[id] = mergeGrid(old, fresh, content, log);
    }
    for (const id of new Set([...Object.keys(oldGrids), rawMapId]))
      if (id && !rebuilt[id]) notes.push(`bỏ bản đồ '${id}' — content mới không còn`);

    for (const id of log.crops) notes.push(`gỡ cây '${id}' khỏi ruộng — content mới không còn`);
    for (const id of log.builds) notes.push(`gỡ công trình '${id}' khỏi ruộng — content mới không còn`);
    for (const id of log.props) notes.push(`gỡ vật thể '${id}' khỏi bản đồ — content mới không còn`);
    if (log.lostToTerrain) notes.push(`${log.lostToTerrain} ô bị địa hình mới đè lên, đã dọn sạch`);

    if (!rebuilt[mapId]) {
      const fallback = Object.keys(rebuilt)[0] ?? "";
      if (fallback !== mapId) notes.push(`bản đồ '${mapId}' không dựng được — về '${fallback}'`);
      mapId = fallback;
    }
    const active: StoredMap = rebuilt[mapId] ?? {
      w: 0,
      h: 0,
      tiles: [],
      awayAt: content.balance.dayStartMinutes,
    };
    const maps: Record<string, StoredMap> = {};
    for (const id of Object.keys(rebuilt)) if (id !== mapId) maps[id] = rebuilt[id]!;

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
    // save cũ (v2) không có bình tưới: rót cho đầy theo balance hiện tại
    const water = Number.isFinite(state.water)
      ? Math.max(0, Math.floor(state.water))
      : Math.max(0, Math.floor(bal.startWater ?? 0));

    let next: GameState = {
      ...state,
      contentVersion: content.contentVersion,
      seed: seed || 1,
      day,
      minutes,
      money,
      energy,
      mapId,
      w: active.w,
      h: active.h,
      tiles: active.tiles,
      maps,
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
      pending: null,
      water,
    };

    // ---- người chơi không được kẹt trong tường ---------------------------
    const sp = content.tiles.spawn;
    // Đổi bản đồ đang chơi thì toạ độ cũ vô nghĩa (lưới khác hẳn) — về ô spawn.
    const moved = mapId !== rawMapId;
    let px = moved || !Number.isFinite(state.player.x) ? tileCenterX(sp.x) : state.player.x;
    let py = moved || !Number.isFinite(state.player.y) ? tileCenterY(sp.y) : state.player.y;
    if (moved) notes.push("đổi bản đồ đang chơi, đặt lại người chơi ở ô bắt đầu");
    if (blockedAt(next, content, px, py)) {
      const fixed = nudgeOutOfSolid(next, content, px, py);
      if (fixed.x === px && fixed.y === py) {
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

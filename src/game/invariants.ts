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
  blockedForActor,
  buildFromMap,
  nudgeForActor,
  nudgeOutOfSolid,
  penOfAnimal,
  spawnMapId,
  tileCenterX,
  tileCenterY,
} from "./world.ts";
import { TOOL_SLOTS, normalizeInventory, toolIds } from "./inventory.ts";
import { isKnownItem, parseItem } from "./items.ts";
import { normalizeStore, storeErrors } from "./storage.ts";
import { MAX_ENTITIES, MAX_PATH, pruneEntities, capEntities } from "./entities.ts";

/** Kiểm mọi ô của MỘT lưới. `where` chỉ để ghi vào thông điệp lỗi. */
function checkGrid(tiles: Tile[], content: Content, where: string, e: string[]): void {
  let cropOnUntilled = 0;
  let badStage = 0;
  let badGrow = 0;
  let badHp = 0;
  let badSick = 0;
  let badAge = 0;
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
      if (t.crop.sick !== undefined && t.crop.sick !== true) badSick++;
    }
    if (t.age !== undefined && (!Number.isFinite(t.age) || t.age < 0)) badAge++;
  }

  if (cropOnUntilled) e.push(`${where}: ${cropOnUntilled} ô có cây mà chưa cày`);
  if (badStage) e.push(`${where}: ${badStage} ô có crop.stage ngoài [0, growthDays.length]`);
  if (badGrow) e.push(`${where}: ${badGrow} ô có crop.grow không hữu hạn hoặc âm`);
  if (badHp) e.push(`${where}: ${badHp} ô có hp không hữu hạn hoặc âm`);
  if (badSick) e.push(`${where}: ${badSick} ô có crop.sick khác true/vắng`);
  if (badAge) e.push(`${where}: ${badAge} ô có age không hữu hạn hoặc âm`);
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

  // ---- thời tiết ---------------------------------------------------------
  const wx = state.weather;
  if (!wx || typeof wx !== "object") e.push("weather phải là object");
  else {
    if (!content.weathers[wx.today]) e.push(`weather.today '${String(wx.today)}' không có trong content`);
    if (!content.weathers[wx.tomorrow]) e.push(`weather.tomorrow '${String(wx.tomorrow)}' không có trong content`);
    if (!Number.isInteger(wx.wetStreak) || wx.wetStreak < 0) e.push(`weather.wetStreak không hợp lệ: ${wx.wetStreak}`);
    if (!Number.isInteger(wx.driedDay) || wx.driedDay < 0) e.push(`weather.driedDay không hợp lệ: ${wx.driedDay}`);
  }
  if (!Number.isFinite(state.stats?.cured) || state.stats.cured < 0)
    e.push(`stats.cured không hợp lệ: ${String(state.stats?.cured)}`);

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

  // kho tập trung
  e.push(...storeErrors(state, content));

  /* ---- thực thể ---------------------------------------------------------
     Hàm này chạy sau MỌI dispatch khi bật validate, và test sim chạy strict —
     nên một con vật bị đẩy vào tường sẽ NÉM LỖI ngay tại action gây ra nó, chứ
     không lặng lẽ trôi vào save. Đó là chốt chặn quan trọng nhất của cả hệ
     thực thể. */
  if (!Array.isArray(state.entities)) e.push("entities phải là mảng");
  else {
    if (state.entities.length > MAX_ENTITIES)
      e.push(`entities.length = ${state.entities.length}, vượt trần ${MAX_ENTITIES}`);
    const ids = new Set<number>();
    for (const en of state.entities) {
      if (!en || typeof en !== "object") {
        e.push("entities có phần tử không phải object");
        continue;
      }
      if (!Number.isInteger(en.id) || en.id < 1) e.push(`thực thể id = ${en.id} không hợp lệ`);
      else if (ids.has(en.id)) e.push(`trùng id thực thể ${en.id}`);
      else ids.add(en.id);
      if (en.id > state.entSeq) e.push(`thực thể ${en.id} có id lớn hơn entSeq ${state.entSeq}`);
      // Người làm thuê KHÔNG nằm trong bảng loài — họ có bảng cấu hình riêng.
      if (en.kind === "worker") {
        if (!en.worker) e.push(`thực thể ${en.id}: kind 'worker' nhưng thiếu khối worker`);
        else {
          const cfg = content.workers;
          if (!Number.isFinite(en.worker.energy) || en.worker.energy < 0 || en.worker.energy > cfg.energyMax)
            e.push(`người làm ${en.id}: năng lượng ${en.worker.energy} ngoài [0, ${cfg.energyMax}]`);
          if (!Array.isArray(en.worker.carry)) e.push(`người làm ${en.id}: carry phải là mảng`);
          if (en.worker.paidDay > state.day)
            e.push(`người làm ${en.id}: paidDay ${en.worker.paidDay} lớn hơn ngày hiện tại`);
        }
      } else if (en.kind === "vehicle") {
        if (!content.vehicles[en.def])
          e.push(`xe ${en.id}: loại '${en.def}' không có trong content`);
        if (!en.veh) e.push(`xe ${en.id}: thiếu khối veh`);
      } else if (!content.animals[en.def])
        e.push(`thực thể ${en.id}: loài '${en.def}' không có trong content`);
      if (!content.maps[en.map]) e.push(`thực thể ${en.id}: bản đồ '${en.map}' không có trong content`);
      if (!Number.isFinite(en.x) || !Number.isFinite(en.y))
        e.push(`thực thể ${en.id}: toạ độ không hữu hạn`);
      else if (en.map === state.mapId) {
        const box =
          en.kind === "worker"
            ? content.workers.box
            : en.kind === "vehicle"
              ? content.vehicles[en.def]?.box
              : content.animals[en.def]?.box;
        // Loài dưới nước ĐẢO NGƯỢC luật: với nó, nước mới là chỗ hợp lệ. Dùng
        // phép kiểm chung ở đây sẽ báo mọi con cá là "nằm trong ô đặc".
        const swims = content.animals[en.def]?.housing === "water";
        if (box && blockedForActor(state, content, en.x, en.y, box.w, box.h, swims))
          e.push(
            `thực thể ${en.id} ('${en.def}') nằm trong ô solid tại ` +
              `(${(en.x / 16).toFixed(2)}, ${(en.y / 16).toFixed(2)})`,
          );
      }
      if (!Array.isArray(en.ai?.path)) e.push(`thực thể ${en.id}: ai.path phải là mảng`);
      else {
        if (en.ai.path.length > MAX_PATH)
          e.push(`thực thể ${en.id}: ai.path dài ${en.ai.path.length}, vượt trần ${MAX_PATH}`);
        for (const i of en.ai.path)
          if (!Number.isInteger(i) || i < 0)
            e.push(`thực thể ${en.id}: ai.path có chỉ số ô không hợp lệ ${i}`);
      }
      for (const [k, v] of [
        ["ai.until", en.ai?.until],
        ["animal.age", en.animal?.age],
        ["animal.fed", en.animal?.fed],
        ["animal.hungryDays", en.animal?.hungryDays],
        ["seed", en.seed],
      ] as [string, unknown][])
        if (!Number.isFinite(v as number) || (v as number) < 0)
          e.push(`thực thể ${en.id}: ${k} phải là số >= 0 (đang là ${String(v)})`);
    }
  }
  if (!Number.isInteger(state.entSeq) || state.entSeq < 0)
    e.push(`entSeq = ${state.entSeq}, phải là số nguyên >= 0`);
  if (!Number.isInteger(state.actStep) || state.actStep < 0)
    e.push(`actStep = ${state.actStep}, phải là số nguyên >= 0`);

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
  mapId: string,
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
        /* Luống cày chỉ theo save khi ô MỚI vẫn là đất cỏ. Quy hoạch lại bản đồ
           là chuyện có thật: ô hôm qua là ruộng, hôm nay là mặt đường. Bê
           nguyên `tilled` sang thì mặt đường nhựa hiện ra một vệt đất cày, mà
           không luật nào dọn nó đi — `tilledIdleDays` chỉ đếm cho ô cỏ. */
        t.tilled = prev.tilled === true && t.g === "grass";
        t.wet = prev.wet === true && t.g === "grass";

        /* ---- vật thể: BẢN ĐỒ lo bố cục, SAVE lo thứ người chơi đụng vào
         *
         * Cây/đá/bụi/cỏ là thứ vừa MỌC vừa CHẶT được, nên "còn hay đã mất"
         * thuộc về save — lấy lại từ bản đồ thì mở game lần sau là cả rừng mọc
         * lại. Ngược lại nhà, quầy, giếng, kho, cầu, rào, biển là ĐỒ ĐẠC của
         * bản đồ: bản đồ nói sao theo vậy.
         *
         * Luật CŨ hỏi thiếu: nó chỉ nhìn ô MỚI, nên ô mới TRỐNG là chép nguyên
         * vật thể cũ sang, kể cả công trình, kể cả khi nền mới là mặt nước hay
         * mặt đường. Chừng nào địa hình không đổi thì không ai thấy; tới lúc
         * quy hoạch lại cả nông trại thì cái nhà cũ, cái kho cũ, cái giếng cũ
         * mọc lại GIỮA HỒ và GIỮA ĐƯỜNG của bản đồ mới. Nên phải hỏi cả hai
         * đầu: vật thể cũ thuộc về ai, và nền mới có chỗ cho nó không. */
        const freshProp = t.prop;
        const freshIsHarvestable = !!(freshProp ? content.props[freshProp]?.hits : 0);
        let oldProp = typeof prev.prop === "string" ? prev.prop : null;
        if (oldProp && !content.props[oldProp]) {
          log.props.add(oldProp);
          oldProp = null;
        }
        const oldDef = oldProp ? content.props[oldProp] : undefined;
        const truoc = t.prop;
        t.prop = (() => {
          // Ô bản đồ là CÔNG TRÌNH → bản đồ thắng, không bàn.
          if (freshProp !== null && !freshIsHarvestable) return freshProp;
          if (oldProp === null) return null; // ván trước ô này trống (đã chặt)
          // Vật VÁC ĐƯỢC là do chính tay người chơi đặt xuống → theo người chơi.
          if (oldDef?.portable) return t.g === "water" ? null : oldProp;
          // Cây cỏ: giữ, nhưng chỉ ở chỗ nó MỌC ĐƯỢC. Nền mới là nhựa hay nước
          // thì cái cây đó là địa hình của bản đồ đời trước, không phải của ai.
          if (oldDef?.hits) return t.g === "grass" ? oldProp : null;
          // Vật thể cũ là ĐỒ ĐẠC của bản đồ đời trước → bỏ, theo bản đồ mới.
          return freshProp;
        })();
        if (truoc !== t.prop && (truoc !== null || oldProp !== null)) {
          if (oldProp !== null && t.prop !== oldProp) log.lostToTerrain++;
        }
        // hp: giữ nếu còn hợp lệ, không thì trả về đầy máu (save v2 không có
        // trường này nên mọi ô về 0 — 0 ở đây phải hiểu là "chưa biết").
        const propNow = t.prop ? content.props[t.prop] : undefined;
        const full = Math.max(0, Math.floor(propNow?.hits ?? 0));
        const keep = prev.prop === t.prop && Number.isFinite(prev.hp) && prev.hp > 0;
        t.hp = keep ? Math.min(Math.floor(prev.hp), full) : full;

        /* Công trình do BẢN ĐỒ dựng (hàng rào các khu chuồng, `buildable:
           false`) THẮNG công trình cũ của người chơi ở cùng ô. Nếu để bên kia
           thắng thì một ô đường nhựa lát từ ván trước sẽ khoét thủng hàng rào
           mới, và cái chuồng đó thành cái chuồng không bao giờ đóng được.

           Và cùng câu hỏi đó phải hỏi ngược lại: ô mới TRỐNG thì công trình cũ
           có được ở lại không? Chỉ khi nó là của NGƯỜI CHƠI. `buildable: false`
           nghĩa là không ai dựng được nó nữa, nên mọi ô mang nó trong save đều
           do bản đồ ĐỜI TRƯỚC dựng — quy hoạch lại nông trại là hàng rào cũ
           phải đi theo bản đồ cũ. Để lại thì trên màn hình rộng nhìn ra ngay:
           rào của dãy chuồng cũ vắt chéo qua dãy chuồng mới, ba cái chuồng
           chồng lên nhau thành một mớ ô vuông. Đây đúng là luật đã áp cho vật
           thể ở trên ("đồ đạc của bản đồ đời trước → bỏ"), chỉ là hồi đó quên
           áp cho công trình. */
        const capBanDo = t.b;
        if (prev.b) {
          const cuDef = content.buildings[prev.b];
          if (!cuDef) log.builds.add(prev.b);
          else if (cuDef.buildable === false) {
            if (capBanDo !== prev.b) log.lostToTerrain++;
          } else if (capBanDo === null) t.b = prev.b;
          else log.lostToTerrain++;
        }

        /* Thức ăn còn trong máng (hoặc đang nổi trên mặt nước của hồ) là của
           người chơi đổ vào, giữ lại — miễn ô đó vẫn còn nhận được thức ăn sau
           khi content đổi.

           Save CŨ chỉ có con SỐ, chưa có tên món: suy ra từ `feeds` của khu
           chứa ô đó. Không suy thì mọi cái máng đang đầy của người chơi cũ hoá
           thành trơ — có số nhưng không con nào ăn được, vì giờ con vật hỏi
           "món nằm đó có phải thứ tôi ăn không". */
        const nhanDo = t.prop === "trough" || t.g === "water";
        const nhanDoTruoc = prev.prop === "trough" || prev.g === "water";
        if (nhanDo && nhanDoTruoc) {
          const con = Number(prev.trough);
          if (Number.isFinite(con) && con > 0) {
            const tran = Math.max(1, Math.floor(content.balance.troughMax ?? 12));
            const cu = typeof prev.troughId === "string" ? prev.troughId : null;
            const khu = (content.tiles.pens ?? []).find(
              (q) =>
                q.map === mapId &&
                x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h,
            );
            const mon =
              cu && isKnownItem(cu, content) && (khu?.feeds ?? []).includes(cu)
                ? cu
                : ((khu?.feeds ?? [])[0] ?? null);
            if (mon) {
              // Kẹp về trần MỚI: hạ `troughMax` qua OTA mà không kẹp thì máng
              // vượt trần và không bao giờ đổ thêm được nữa.
              t.trough = Math.min(tran, Math.floor(con));
              t.troughId = mon;
            }
          }
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
            if (prev.crop.sick === true) t.crop.sick = true;
          }
        }
        // tuổi vật thể: chỉ có nghĩa khi vẫn là đúng vật thể đó
        if (t.prop !== null && prev.prop === t.prop && Number.isFinite(prev.age) && (prev.age as number) > 0)
          t.age = Math.floor(prev.age as number);

        // địa hình mới có thể đã biến ô thành cây/đá/nước/HÀNG RÀO → dọn cho sạch
        if (t.prop !== null || t.g === "water" || (capBanDo !== null && content.buildings[capBanDo]?.solid)) {
          if (t.crop || t.tilled || (t.b && t.b !== capBanDo)) log.lostToTerrain++;
          t.crop = null;
          t.b = capBanDo; // giữ hàng rào bản đồ vừa dựng, bỏ mọi thứ chồng lên
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
/**
 * Ô trong KHU của loài này mà con vật đứng được, hoặc null.
 *
 * Dùng khi phép gỡ kẹt tại chỗ bó tay. Khu là câu trả lời ĐÚNG chứ không phải
 * câu trả lời tiện: con cá thuộc về cái ao, con bò thuộc về cái chuồng — dời
 * nó tới ô trống gần nhất trên bản đồ thì nó thoát kẹt nhưng lại đứng ở một
 * chỗ chẳng liên quan gì tới nó.
 */
function veChoCua(
  probe: GameState,
  content: Content,
  defId: string,
  box: { w: number; h: number },
  boi: boolean,
): { x: number; y: number } | null {
  const pen = penOfAnimal(content, defId);
  const vung = pen && pen.map === probe.mapId ? pen : null;
  const x0 = vung ? vung.x : 1;
  const y0 = vung ? vung.y : 1;
  const x1 = vung ? vung.x + vung.w : probe.w - 1;
  const y1 = vung ? vung.y + vung.h : probe.h - 1;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const cx = x * TILE + TILE / 2;
      const cy = y * TILE + TILE / 2;
      if (!blockedForActor(probe, content, cx, cy, box.w, box.h, boi)) return { x: cx, y: cy };
    }
  return null;
}

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
      rebuilt[id] = mergeGrid(old, fresh, content, log, id);
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

    // ---- thực thể --------------------------------------------------------
    // Bỏ con vật mà content mới không còn (giống cách cây/công trình bị gỡ), rồi
    // XOÁ SẠCH đường đi: lưới vừa được dựng lại nên chỉ số ô cũ có thể trỏ vào
    // chỗ vô nghĩa. Và đẩy con nào đang kẹt trong tường ra ngoài, đúng như đang
    // làm cho người chơi.
    const entRaw = Array.isArray(state.entities) ? state.entities : [];
    const entPruned = pruneEntities(entRaw, content);
    for (const id of new Set(entPruned.dropped))
      notes.push(`bỏ con vật '${id}' — content mới không còn`);
    const entities = capEntities(entPruned.list).map((en) => {
      const box =
        en.kind === "worker"
          ? content.workers.box
          : en.kind === "vehicle"
            ? content.vehicles[en.def]?.box
            : content.animals[en.def]?.box;
      const fixed = { ...en, ai: { ...en.ai, path: [] as number[] } };
      const grid = en.map === mapId ? active : rebuilt[en.map];
      if (grid) {
        const probe: GameState = {
          ...state,
          mapId: en.map,
          w: grid.w,
          h: grid.h,
          tiles: grid.tiles,
        };
        /* Hỏi theo ĐÚNG loài. Con cá bơi: nước là chỗ nó đứng được, bờ mới
           là ô cấm. Dùng luật đi bộ ở đây thì mỗi lần nạp save (và mỗi lần đẩy
           OTA) con cá lại bị "gỡ kẹt" từ dưới ao lên bãi cỏ — rồi chính
           `checkInvariants` bên dưới tố cáo cái state mà hàm này vừa tạo ra. */
        const boi = en.kind === "animal" && content.animals[en.def]?.housing === "water";
        if (box && blockedForActor(probe, content, fixed.x, fixed.y, box.w, box.h, boi)) {
          const p = nudgeForActor(probe, content, fixed.x, fixed.y, box.w, box.h, boi);
          fixed.x = p.x;
          fixed.y = p.y;
          /* Gỡ kẹt tại chỗ chỉ dò quanh vài ô. Đủ cho "con bò kẹt trong hàng
             rào mới", KHÔNG đủ cho con cá: quy hoạch lại bản đồ là cái ao dời
             đi nửa nông trại, và quanh chỗ con cá đang nằm thì ba mươi ô nữa
             cũng chưa có giọt nước nào. Nó nằm lại trên bờ, mỗi lần nạp save
             lại nằm đúng chỗ cũ — người chơi nhìn thấy đàn cá phơi trên cỏ.
             Nên khi dò quanh thất bại thì ĐƯA VỀ KHU của chính nó. */
          if (blockedForActor(probe, content, fixed.x, fixed.y, box.w, box.h, boi)) {
            const ve = veChoCua(probe, content, en.def, box, boi);
            if (ve) {
              fixed.x = ve.x;
              fixed.y = ve.y;
              notes.push(`đưa '${en.def}' lạc chỗ về đúng khu của nó`);
            }
          }
        }
      }
      return fixed;
    });
    /* Vật đang vác phải là một prop CÒN TỒN TẠI trong content mới. Pack OTA gỡ
       bỏ "khúc gỗ" mà người chơi đang vác một khúc thì nó thành một chuỗi trỏ
       vào hư không — và ô nào đặt xuống cũng ra một vật thể không vẽ được. */
    const carry =
      typeof state.carry === "string" && content.props[state.carry] ? state.carry : null;

    const entSeq = Math.max(
      Number.isFinite(state.entSeq) ? Math.floor(state.entSeq) : 0,
      ...entities.map((e) => e.id),
      0,
    );

    // ---- kho tập trung ---------------------------------------------------
    // Nong/cắt về đúng số ô content quy định, và bỏ ô hỏng. Đồ thừa khi kho bị
    // thu nhỏ thì mất — có ghi chú, không im lặng.
    const storeBefore = Array.isArray(state.store) ? state.store.filter(Boolean).length : 0;
    const store = normalizeStore(state.store, content);
    const storeAfter = store.filter(Boolean).length;
    if (storeBefore !== storeAfter)
      notes.push(`kho: giữ ${storeAfter}/${storeBefore} ô có đồ (content đổi số ô)`);

    // ---- thống kê --------------------------------------------------------
    const built: Record<string, number> = {};
    for (const [k, v] of Object.entries(state.stats.built ?? {})) {
      if (Number.isFinite(v) && v > 0) built[k] = Math.floor(v);
    }
    const cured = Number.isFinite(state.stats.cured) && state.stats.cured > 0 ? Math.floor(state.stats.cured) : 0;

    // ---- thời tiết: kiểu không còn trong content → về kiểu đầu tiên --------
    const wxRaw = (state.weather ?? {}) as Partial<GameState["weather"]>;
    const fixWx = (id: unknown, what: string): string => {
      if (typeof id === "string" && content.weathers[id]) return id;
      if (id) notes.push(`thời tiết ${what} '${String(id)}' không còn trong content — về '${content.weatherFirst}'`);
      return content.weatherFirst;
    };
    const weather: GameState["weather"] = {
      today: fixWx(wxRaw.today, "hôm nay"),
      tomorrow: fixWx(wxRaw.tomorrow, "ngày mai"),
      wetStreak: Number.isInteger(wxRaw.wetStreak) && (wxRaw.wetStreak as number) >= 0 ? (wxRaw.wetStreak as number) : 0,
      driedDay: Number.isInteger(wxRaw.driedDay) && (wxRaw.driedDay as number) >= 0 ? (wxRaw.driedDay as number) : 0,
    };

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
      store,
      entities,
      entSeq,
      actStep: Number.isFinite(state.actStep) ? Math.max(0, Math.floor(state.actStep)) : 0,
      planCursor: Number.isFinite(state.planCursor) ? Math.max(0, Math.floor(state.planCursor)) : 0,
      sel,
      carry,
      stagesDone: [...state.stagesDone],
      goalsDone: [...state.goalsDone],
      stats: { ...state.stats, built, cured },
      weather,
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

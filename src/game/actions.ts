/* ============================================================================
   ACTIONS — cày / tưới / gieo / thu hoạch / xây / CHẶT ĐẬP / CHẾ TẠO / MÚC NƯỚC.

   Phần lớn đi qua `useAt()`: một nút bấm duy nhất, hành vi phụ thuộc vật phẩm
   đang cầm và thứ đang có trên ô. Luật ưu tiên: ô có cây CHÍN thì luôn thu
   hoạch trước, bất kể đang cầm gì — người chơi không phải đổi tay liên tục.
   Sau đó tới VẬT THỂ trên ô (cây/đá/bụi cỏ), rồi mới tới công cụ/hạt/công trình.

   Không hàm nào ở đây tự sinh ngẫu nhiên bằng Math.random: mọi thứ rút từ
   `state.seed` qua randInt() và ghi seed mới trở lại state.
============================================================================ */

import type { Content, GameState, PropDef, RecipeDef, Tile, ToolAction, ToolDef } from "./types.ts";
import type { Draft, MapView } from "./state.ts";
import { activeView, dStats, dTile, randInt, setInv, toastKey, toastText, touch } from "./state.ts";
import { addItem, canAdd, countItem, removeForCraft, removeItem, selectedItemId } from "./inventory.ts";
import { itemName, parseItem } from "./items.ts";
import { cureTile, pullTile } from "./disease.ts";
import {
  canFeedPond,
  canPourInto,
  feedPond,
  pourIntoTrough,
  troughFeedsAt,
  troughMax,
  troughStock,
} from "./pen.ts";
import { cropInSeason, currentSeason, tileAllSeason } from "./season.ts";
import {
  anyEntityOverlapsTile,
  canPlaceBuilding,
  hasNearbyInteract,
  inReach,
  isRipe,
  inZone,
  isTillable,
  isTillableTile,
  playerOverlapsTile,
  propDef,
  tileIndexAt,
  isSolid,
} from "./world.ts";

/* ---------------------------------------------------- đặt xuống có nhốt ai */

/**
 * Đặt thứ đang VÁC xuống ô (x,y) thì có NHỐT ai vào trong nó không?
 *
 * Hai vật vác được — hòn đá và khúc gỗ — đều là vật ĐẶC, mà hitbox người chơi
 * (10px) hẹp hơn một ô (16px) nên đứng lệch một chút là đè lên tới hai ô. Đặt
 * hòn đá xuống một ô mình đang đè lên thì mọi hướng đi đều đụng nó: nhân vật
 * đứng chết một chỗ cho tới lúc tải lại trang. Con vật và người làm cũng vậy.
 *
 * `canPlaceBuilding` đã chặn đúng chuyện này cho CÔNG TRÌNH ngay từ đầu; đường
 * VÁC ĐỒ thì quên mất — đây là chỗ trả lại luật đó.
 */
export function putdownWouldTrap(
  state: GameState,
  content: Content,
  x: number,
  y: number,
): boolean {
  if (!state.carry) return false;
  const def = propDef(content, state.carry);
  // Vật lạ (content mới thêm, core chưa biết) → coi như đặc, cùng luật với
  // `isSolidTile`. Vật khai báo không đặc thì đứng đè lên nó cũng chẳng sao.
  if (def && !def.solid) return false;
  return playerOverlapsTile(state, x, y) || anyEntityOverlapsTile(state, content, x, y);
}

/* ------------------------------------------------------- công cụ đang cầm */

/** Công cụ đang cầm ở hotbar, null nếu đang cầm thứ khác / tay không.
 *  `sel` cho phép hỏi về một ô hotbar khác — xem `canUseAt`. */
export function heldTool(state: GameState, content: Content, sel = state.sel): ToolDef | null {
  const held = selectedItemId(state.inv, sel);
  const it = held ? parseItem(held) : null;
  if (!it || it.kind !== "tool") return null;
  return content.tools[it.ref] ?? null;
}

/** Sức chứa bình tưới đang cầm; không cầm bình nào thì lấy bình to nhất trong túi. */
export function waterCapacity(state: GameState, content: Content): number {
  const held = heldTool(state, content);
  if (held && held.action === "WATER") return Math.max(0, Math.floor(held.capacity ?? 0));
  let best = 0;
  for (const s of state.inv) {
    if (!s) continue;
    const it = parseItem(s.id);
    if (!it || it.kind !== "tool") continue;
    const def = content.tools[it.ref];
    if (def && def.action === "WATER") best = Math.max(best, Math.floor(def.capacity ?? 0));
  }
  return best;
}

/** Tên công cụ đầu tiên làm được việc này — để ghép câu "Cần Rìu gỗ." */
function toolNameFor(content: Content, action: ToolAction): string {
  for (const id of content.toolOrder) {
    const t = content.tools[id];
    if (t && t.action === action) return t.name;
  }
  return action === "MINE" ? "cuốc chim" : "rìu";
}

/* --------------------------------------------------------------- thu hoạch */

/** Lùi cây về giai đoạn sao cho cần đúng `regrowDays` ngày nữa mới chín lại.
 *  Ví dụ cà chua growthDays [1,1,1,2], regrowDays 3 → stage 2 (1+2 = 3 ngày).
 *  `grow` trả về tính bằng PHÚT GAME (xem CropInstance.grow). */
export function regrowStage(
  growthDays: readonly number[],
  regrowDays: number,
  minutesPerDay: number,
): { stage: number; grow: number } {
  let suffix = 0;
  let k = growthDays.length;
  for (let i = growthDays.length - 1; i >= 0; i--) {
    suffix += growthDays[i] ?? 0;
    k = i;
    if (suffix >= regrowDays) break;
  }
  const per = Math.max(1, minutesPerDay);
  const spare = Math.max(0, suffix - regrowDays) * per;
  const cap = Math.max(0, (growthDays[k] ?? 1) * per - 1);
  return { stage: k, grow: Math.min(spare, cap) };
}

export interface HarvestResult {
  ok: boolean;
  amount: number;
  /** số món KHÔNG nhét được vào túi */
  overflow: number;
}

/** Thu hoạch ô `i` của bản đồ ĐANG chơi. `spendEnergy` = false khi drone làm thay. */
export function harvestTile(
  d: Draft,
  content: Content,
  i: number,
  spendEnergy: boolean,
): HarvestResult {
  return harvestTileIn(d, content, activeView(d), i, spendEnergy);
}

/** Thu hoạch ô `i` trên MỘT bản đồ bất kỳ (kể cả bản đồ đã cất).
 *
 *  Túi đồ, tiền, seed và thống kê là của cả ván chứ không của riêng bản đồ nào,
 *  nên drone ngoài ruộng vẫn đổ đồ vào đúng cái túi người chơi đang mang. */
export function harvestTileIn(
  d: Draft,
  content: Content,
  v: MapView,
  i: number,
  spendEnergy: boolean,
): HarvestResult {
  const cur = v.tiles[i];
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
  // Cây bệnh cho ít hơn — làm tròn xuống nhưng không dưới 1 (vẫn có gì đó để
  // khỏi thấy vô nghĩa khi cố thu).
  const sickMul = cur.crop.sick ? Math.max(0, Math.min(1, content.balance.sickYieldMul ?? 1)) : 1;
  const amount = Math.max(cur.crop.sick ? 1 : 0, Math.floor(Math.max(0, roll.v) * sickMul));
  const s = touch(d);
  s.seed = roll.seed;

  const added = addItem(s.inv, `crop:${def.id}`, amount);
  setInv(d, added.inv);
  const overflow = amount - added.added;

  const t = v.edit(i);
  if (t) {
    if (def.regrowDays !== null && def.regrowDays !== undefined) {
      const r = regrowStage(def.growthDays, def.regrowDays, content.balance.growthMinutesPerDay);
      t.crop = { id: def.id, stage: r.stage, grow: r.grow, regrown: true };
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

function till(d: Draft, content: Content, i: number, cur: Tile, x: number, y: number): void {
  /* NGOÀI khu ruộng thì nói RÕ là ngoài khu, đừng dùng chung câu "không cày
     được ở đây": hai lý do khác nhau dẫn tới hai việc khác nhau — một cái là
     dọn ô, cái kia là đi chỗ khác. */
  if (!inZone(d.s, content, "farm", x, y)) {
    toastText(d, "Ngoài khu ruộng — cuốc không ăn ở đây.", "bad");
    return;
  }
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
  // Bình cạn thì KHÔNG tưới được và cũng không tốn năng lượng — ra giếng đã.
  if (!(d.s.water > 0)) {
    toastText(d, "Bình hết nước rồi.", "bad");
    return;
  }
  const cost = content.balance.energyCost.water;
  if (!hasEnergy(d, cost)) {
    toastKey(d, content, "noEnergy", "bad");
    return;
  }
  const t = dTile(d, i);
  if (!t) return;
  t.wet = true;
  spend(d, cost);
  touch(d).water = Math.max(0, d.s.water - 1);
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
  if (!cropInSeason(cropId, d.s.day, content) && !tileAllSeason(cur, content)) {
    const s = currentSeason(d.s, content);
    toastKey(d, content, "outOfSeason", "bad", s ? `(${def.name} không hợp mùa ${s.name})` : undefined);
    return;
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
  t.crop = { id: cropId, stage: 0, grow: 0, regrown: false };
  spend(d, cost);
  dStats(d).planted += 1;
}

/** Tuyến dài nhất xây được một lần. Đủ để rào một lô hoặc nối kho ra cổng,
 *  không đủ để một cú chạm phủ kín nông trại. */
export const MAX_LINE = 24;

/**
 * Các ô của một tuyến hình CHỮ L: đi ngang trước rồi đi dọc.
 *
 * Không dùng Bresenham chéo: hàng rào và đường chéo trong pixel art trông gãy
 * khúc, mà người chơi phân lô thì nghĩ bằng ô vuông chứ không bằng đường thẳng
 * hình học. Chữ L dễ đoán — nhìn hai đầu là biết tuyến sẽ chạy đâu.
 */
export function linePath(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const sx = x1 >= x0 ? 1 : -1;
  const sy = y1 >= y0 ? 1 : -1;
  for (let x = x0; x !== x1 + sx; x += sx) out.push({ x, y: y0 });
  for (let y = y0 + sy; y !== y1 + sy; y += sy) out.push({ x: x1, y });
  return out.slice(0, MAX_LINE);
}

/**
 * Xây cả một tuyến trong MỘT thao tác.
 *
 * Luật, và lý do từng cái:
 * · Phải đang cầm đúng `build:<id>` — cùng điều kiện với đặt từng ô.
 * · Ô ĐẦU phải trong tầm với. Giữ nguyên bất biến "ngoài tầm thì không làm gì"
 *   mà không phải dựng một máy trạng thái đi-rồi-xây.
 * · Trừ ĐỦ năng lượng và ĐỦ một vật phẩm cho mỗi ô. Không giảm giá theo lô —
 *   nếu không thì xây tuyến trở thành cách lách giá.
 * · Hết vật liệu hoặc hết năng lượng thì DỪNG ở đó và báo đã xây được bao nhiêu.
 *   Ô không đặt được (có cây, có vật thể) thì bỏ qua, không tính là thất bại.
 */
export function buildLine(
  d: Draft,
  content: Content,
  id: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  /** Bỏ kiểm tầm với — xem ghi chú của action BUILD_LINE. */
  far = false,
): { placed: number; wanted: number } {
  const out = { placed: 0, wanted: 0 };
  const def = content.buildings[id];
  if (!def) return out;
  if (!far && selectedItemId(d.s.inv, d.s.sel) !== `build:${id}`) return out;
  if (!far && !inReach(d.s, x0, y0)) {
    toastKey(d, content, "tooFar", "bad");
    return out;
  }
  // Chưa mở khoá thì không xây được, kể cả khi đủ tiền — mốc tiến trình là mốc.
  if (!d.s.unlocked.includes(id)) {
    toastKey(d, content, "locked", "bad");
    return out;
  }

  const cells = linePath(x0 | 0, y0 | 0, x1 | 0, y1 | 0);
  out.wanted = cells.length;
  const cost = content.balance.energyCost.build;
  let mua = 0; // số ô phải trả tiền tại chỗ
  let hetTien = false;

  for (const c of cells) {
    const i = tileIndexAt(d.s, c.x, c.y);
    if (i < 0) continue;
    if (!canPlaceBuilding(d.s, content, id, c.x, c.y)) continue;
    if (!hasEnergy(d, cost)) break;

    /* VẼ BAO NHIÊU TÍNH TIỀN BẤY NHIÊU.
       Có sẵn trong túi thì dùng trước; hết thì mua ngay tại chỗ theo đơn giá.
       Hai đường thay vì một là có chủ ý: người chơi cũ đã trót mua cả chồng
       vật liệu thì số hàng đó vẫn dùng được (không thành rác trong balo), còn
       người chơi mới thì không phải đoán "cần bao nhiêu ô" trước khi vẽ — mà
       đoán sai con số đó chính là lý do người ta ngại vẽ dài. */
    const left = removeItem(d.s.inv, `build:${id}`, 1);
    if (left) setInv(d, left);
    else {
      if (d.s.money < def.price) {
        hetTien = true;
        break;
      }
      touch(d).money = d.s.money - def.price;
      mua++;
    }

    const t = dTile(d, i);
    if (!t) break;
    t.b = id;
    spend(d, cost);
    const st = dStats(d);
    st.built[id] = (st.built[id] ?? 0) + 1;
    out.placed++;
  }

  if (out.placed === 0) toastKey(d, content, hetTien ? "noMoney" : "cannotBuild", "bad");
  else {
    const tien = mua > 0 ? ` · ${mua * def.price}đ` : "";
    toastText(d, `${def.name}: đã xây ${out.placed}/${out.wanted} ô${tien}`, "good");
    if (hetTien) toastKey(d, content, "noMoney", "bad");
  }
  return out;
}

/* ------------------------------------------------------------- chặt / đập */

/** Việc mà một nhát vung lên vật thể này được tính là gì.
 *  Vật thể không khai `tool` (bụi cỏ) thì tay không cũng phá được → CHOP. */
function breakAction(def: PropDef, tool: ToolDef | null): ToolAction {
  if (def.tool) return def.tool;
  if (tool && (tool.action === "CHOP" || tool.action === "MINE")) return tool.action;
  return "CHOP";
}

/** Đang cầm đúng thứ để phá vật thể này không. */
function canBreakWith(def: PropDef, tool: ToolDef | null): boolean {
  if (!def.hits || def.hits <= 0) return false;
  if (!def.tool) return true; // tay không cũng phá được
  return tool !== null && tool.action === def.tool;
}

/** Một nhát vung. Trừ hp, hết hp thì biến thành `becomes` (hoặc biến mất) và
 *  rơi vật phẩm. Ô vừa dọn xong hết đặc ngay — đi qua được luôn. */
function breakProp(d: Draft, content: Content, i: number, cur: Tile, def: PropDef): void {
  const tool = heldTool(d.s, content);
  const act = breakAction(def, tool);
  const cost = act === "MINE" ? content.balance.energyCost.mine : content.balance.energyCost.chop;
  if (!hasEnergy(d, cost)) {
    toastKey(d, content, "noEnergy", "bad");
    return;
  }

  // Chỉ công cụ ĐÚNG việc mới được tính `power` (rìu thép bổ 2 nhát mỗi lần).
  const power =
    tool && tool.action === act ? Math.max(1, Math.floor(tool.power ?? 1)) : 1;

  const full = Math.max(1, Math.floor(def.hits ?? 1));
  const hp0 = Number.isFinite(cur.hp) && cur.hp > 0 ? Math.floor(cur.hp) : full;

  const t = dTile(d, i);
  if (!t) return;
  spend(d, cost);

  const left = hp0 - power;
  if (left > 0) {
    t.hp = left;
    return;
  }

  // ---- vỡ ----
  const next = def.becomes ? propDef(content, def.becomes) : null;
  t.prop = next ? next.id : null;
  t.hp = next ? Math.max(0, Math.floor(next.hits ?? 0)) : 0;

  let overflow = false;
  for (const drop of def.drops ?? []) {
    const lo = Math.max(0, Math.floor(drop.min));
    const hi = Math.max(lo, Math.floor(drop.max));
    const roll = randInt(d.s.seed, lo, hi);
    touch(d).seed = roll.seed;
    const n = Math.max(0, roll.v);
    if (n <= 0) continue;
    const r = addItem(d.s.inv, drop.id, n);
    setInv(d, r.inv);
    if (r.added < n) overflow = true;
    if (r.added > 0) toastText(d, `Nhận ${itemName(drop.id, content)} ×${r.added}`, "good");
  }
  if (overflow) toastKey(d, content, "invFull", "bad");
}

/* ----------------------------------------------------------- kiểm tra USE */

/** Kiểm tra nhanh cho UI: bấm vào ô này bây giờ có làm được gì không. */
export type UseKind =
  | "harvest" | "till" | "water" | "plant" | "build" | "chop" | "mine"
  /** xịt thuốc cho cây bệnh (cầm item:medicine) */
  | "cure"
  /** nhổ cây bệnh (cầm cuốc) */
  | "pull"
  /** TAY KHÔNG nhấc một vật thể vác được lên (khúc gỗ, hòn đá) */
  | "lift"
  /** đổ thức ăn đang cầm vào MÁNG của khu chuồng */
  | "pour"
  /** rắc thức ăn xuống mặt hồ cho cá */
  | "feedpond"
  /** đang vác thì ĐẶT xuống một ô trống */
  | "putdown"
  | null;

/**
 * Ô này làm được việc gì với vật phẩm đang cầm?
 *
 * `ignoreReach` dùng cho việc NGẮM: khi người chơi chạm hụt sang ô bên cạnh, ta
 * cần biết ô nào quanh đó là ô "có nghĩa" để nắn cú chạm về đúng chỗ — mà lúc
 * đó nhân vật còn đứng xa, chưa ô nào trong tầm với cả.
 */
export function canUseAt(
  state: GameState,
  content: Content,
  x: number,
  y: number,
  ignoreReach = false,
  /**
   * Ô hotbar GIẢ ĐỊNH đang cầm. Mặc định là ô đang chọn thật.
   *
   * Có tham số này để "tự động làm" hỏi được câu "nếu tôi cầm cái cuốc thì ô
   * này có việc không?" mà KHÔNG phải đổi ô chọn thật rồi đổi lại — đổi thật
   * nghĩa là hotbar nhấp nháy và mỗi lần thử là một dispatch vào state.
   */
  sel = state.sel,
): UseKind {
  const i = tileIndexAt(state, x, y);
  if (i < 0) return null;
  if (!ignoreReach && !inReach(state, x, y)) return null;
  const cur = state.tiles[i];
  if (!cur) return null;

  /* ĐANG VÁC thì hai tay bận: việc DUY NHẤT làm được là đặt xuống.
     Xét trước cả thu hoạch — nếu không thì đang vác hòn đá mà đi ngang cây
     chín là nút đổi thành THU, bấm vào thì không có gì xảy ra (tay đang bận),
     đúng lớp lỗi "nút nói một đằng làm một nẻo". */
  if (state.carry) {
    if (cur.prop !== null || cur.crop !== null || cur.b !== null) return null;
    if (cur.tilled) return null; // đặt hòn đá lên luống vừa cày thì phí cả luống
    if (isSolid(state, content, x, y)) return null;
    // Đặt xuống chân mình = tự xây tường quanh chân — xem `putdownWouldTrap`.
    if (putdownWouldTrap(state, content, x, y)) return null;
    return "putdown";
  }

  if (isRipe(cur, content)) return "harvest";

  /* MÁNG ăn: xét TRƯỚC nhánh vật thể chung. Cái máng không có `hits` nên nhánh
     dưới sẽ trả null cho nó — tức là đứng trước máng, cầm bó rơm, mà nút bảo
     không làm được gì. */
  if (cur.prop === "trough" && canPourInto(state, content, x, y)) return "pour";

  /* MẶT HỒ: đứng bờ rắc thức ăn xuống cho cá. Đi qua nút DÙNG chứ không phải
     nút TƯƠNG TÁC, vì nước đã nhận nút tương tác để MÚC nước rồi — gộp hai
     việc vào một nút thì một trong hai luôn bị nuốt, và cái bị nuốt là cái
     người chơi đang cần. */
  if (canFeedPond(state, content, x, y)) return "feedpond";

  // Vật thể trên ô chặn mọi việc khác: hoặc phá được nó, hoặc không làm gì.
  if (cur.prop !== null) {
    const def = propDef(content, cur.prop);
    if (!def) return null; // vật thể lạ → coi như không khai thác được
    /* TAY KHÔNG + vật vác được → NHẤC LÊN, không phá.
       Xét ở đây chứ không xét sau: nhánh này `return` trước, nên đặt luật nhấc
       ở dưới thì nó không bao giờ chạy tới. Và chỉ khi tay TRỐNG: cầm cái rìu
       mà bấm vào khúc gỗ thì ý định rõ ràng là chặt nó ra gỗ. */
    if (def.portable && selectedItemId(state.inv, sel) === null) return "lift";
    const tool = heldTool(state, content, sel);
    if (!canBreakWith(def, tool)) return null;
    return breakAction(def, tool) === "MINE" ? "mine" : "chop";
  }

  const held = selectedItemId(state.inv, sel);
  const it = held ? parseItem(held) : null;

  if (!it) return null;

  // Cây bệnh: thuốc thì chữa, cuốc thì nhổ. Xét trước công cụ thường vì cuốc
  // lên ô có cây vốn "không làm được gì".
  if (cur.crop?.sick) {
    if (it.kind === "item" && it.ref === "medicine") return "cure";
    if (it.kind === "tool" && content.tools[it.ref]?.action === "TILL") return "pull";
  }

  if (it.kind === "tool") {
    const tool = content.tools[it.ref];
    if (!tool) return null;
    if (tool.action === "TILL") return isTillable(state, content, x, y) ? "till" : null;
    if (tool.action === "WATER") return cur.tilled && !cur.wet && state.water > 0 ? "water" : null;
    return null;
  }
  if (it.kind === "seed") {
    if (!content.crops[it.ref]) return null;
    if (!cur.tilled || cur.crop) return null;
    if (cur.b && content.buildings[cur.b]?.kind !== "floor") return null;
    // Trái mùa thì con trỏ phải báo NGAY, đừng để người chơi đi tới nơi rồi mới
    // biết. Sàn nhà kính miễn nhiễm.
    if (!cropInSeason(it.ref, state.day, content) && !tileAllSeason(cur, content)) return null;
    return "plant";
  }
  /* Công trình KHÔNG đặt được bằng nút DÙNG nữa — chúng đi qua CHẾ ĐỘ XÂY
     DỰNG (`src/ui/buildmode.ts`).

     Đặt từng ô là thao tác của việc sửa, mà kéo một con đường ra kho hay trải
     một vạt sàn nhà kính là việc quy hoạch: nghĩ theo đoạn, không theo ô. Trộn
     hai đường vào một nút là cách chắc chắn nhất để ra địa hình lởm chởm — mỗi
     ô một lần ước lượng bằng mắt, hai mươi lần thì không lần nào giống nhau.

     Trả `null` ở đây (chứ không trả "build" rồi để `useAt` lặng lẽ bỏ qua) là
     có chủ ý: `canUseAt` và `useAt` phải LUÔN nói cùng một câu, nếu không thì
     nút báo làm được mà bấm không có gì xảy ra — đúng lớp lỗi vừa phải đi tìm
     mất nửa buổi ở chỗ tầm với 1,6 với 1,8 ô. */
  return null;
}

export function useAt(d: Draft, content: Content, x: number, y: number): void {
  const i = tileIndexAt(d.s, x, y);
  if (i < 0) return;
  if (!inReach(d.s, x, y)) return; // ngoài tầm với: bỏ qua, không toast
  const cur = d.s.tiles[i];
  if (!cur) return;

  /* ---- ĐANG VÁC: đặt xuống, và chỉ thế thôi ----------------------------- */
  if (d.s.carry) {
    if (cur.prop !== null || cur.crop !== null || cur.b !== null || cur.tilled) {
      toastText(d, "Chỗ này không đặt xuống được.", "bad");
      return;
    }
    if (isSolid(d.s, content, x, y)) {
      toastText(d, "Chỗ này không đặt xuống được.", "bad");
      return;
    }
    /* Nói RÕ lý do, đừng dùng chung câu "không đặt xuống được": người chơi
       đang đứng ngay đó thì cái họ cần biết là LÙI RA, không phải là ô này
       hỏng. Đây cũng là câu chặn cuối — `canUseAt` đã trả null nên nút không
       mời bấm, nhưng bàn phím và tự-động vẫn gọi thẳng vào đây. */
    if (putdownWouldTrap(d.s, content, x, y)) {
      toastText(d, "Đang đứng chắn chỗ — lùi ra rồi đặt.", "bad");
      return;
    }
    const pd = propDef(content, d.s.carry);
    const t = dTile(d, i);
    if (!t) return;
    t.prop = d.s.carry;
    t.hp = Math.max(0, Math.floor(pd?.hits ?? 0));
    touch(d).carry = null;
    toastText(d, `Đã đặt ${pd?.name ?? "vật"} xuống.`, "good");
    return;
  }

  /* ---- TAY KHÔNG: nhấc vật thể vác được lên ------------------------------
     Chỉ chặn khi vật thể VÁC ĐƯỢC. Chặn mọi vật thể ở đây thì bụi cỏ — thứ
     tay không vẫn phá được từ đầu — bỗng dưng không phá được nữa (kịch bản 22
     bắt đúng chỗ này). */
  if (selectedItemId(d.s.inv, d.s.sel) === null && cur.prop !== null) {
    const pd = propDef(content, cur.prop);
    if (pd?.portable) {
      // Chỉ vác được MỘT thứ: `carry` là một chuỗi, không phải một danh sách.
      const t = dTile(d, i);
      if (!t) return;
      t.prop = null;
      t.hp = 0;
      touch(d).carry = pd.id;
      toastText(d, `Đang vác ${pd.name}.`, "info");
      return;
    }
  }

  // Luật ưu tiên: cây chín thì thu hoạch trước mọi thứ.
  if (isRipe(cur, content)) {
    const r = harvestTile(d, content, i, true);
    if (r.ok && r.overflow > 0) toastKey(d, content, "invFull", "bad");
    return;
  }

  // MẶT HỒ: rắc thức ăn cho cá. Cùng thứ tự với `canUseAt`.
  if (canFeedPond(d.s, content, x, y)) {
    feedPond(d, content, x, y);
    return;
  }

  // MÁNG ăn: đổ thức ăn đang cầm vào. Cùng thứ tự với `canUseAt`.
  if (cur.prop === "trough") {
    if (canPourInto(d.s, content, x, y)) {
      pourIntoTrough(d, content, x, y);
      return;
    }
    const feeds = troughFeedsAt(d.s, content, x, y);
    if (!feeds.length) toastText(d, "Máng này không thuộc khu nào — không đổ được gì.", "bad");
    else if (troughStock(d.s, x, y) >= troughMax(content)) toastText(d, "Máng đã đầy.", "info");
    else
      toastText(d, `Cầm ${feeds.map((f) => itemName(f, content)).join(" / ")} rồi đổ vào máng.`, "bad");
    return;
  }

  // Vật thể trên ô: chặt/đập, hoặc báo cầm sai công cụ.
  if (cur.prop !== null) {
    const def = propDef(content, cur.prop);
    if (!def || !def.hits || def.hits <= 0) return; // nhà/tường/giếng: không làm gì
    const tool = heldTool(d.s, content);
    if (!canBreakWith(def, tool)) {
      toastText(d, `Cần ${toolNameFor(content, def.tool ?? "CHOP")}.`, "bad");
      return;
    }
    breakProp(d, content, i, cur, def);
    return;
  }

  const held = selectedItemId(d.s.inv, d.s.sel);
  if (!held) return;
  const it = parseItem(held);
  if (!it) return;

  if (cur.crop?.sick) {
    if (it.kind === "item" && it.ref === "medicine") {
      cureTile(d, content, activeView(d), i, true);
      return;
    }
    if (it.kind === "tool" && content.tools[it.ref]?.action === "TILL") {
      pullTile(d, content, activeView(d), i, true);
      return;
    }
  }

  switch (it.kind) {
    case "tool": {
      const tool = content.tools[it.ref];
      if (!tool) return;
      if (tool.action === "TILL") till(d, content, i, cur, x, y);
      else if (tool.action === "WATER") water(d, content, i, cur);
      return;
    }
    case "seed":
      plant(d, content, i, cur, it.ref);
      return;
    case "build":
      // Công trình đi qua CHẾ ĐỘ XÂY DỰNG, không qua nút DÙNG — xem `canUseAt`.
      return;
    case "crop":
    case "item":
      return; // nông sản / vật liệu không dùng lên ô được
  }
}

/* ------------------------------------------------------------ múc nước */

/** Múc đầy bình ở giếng hoặc bờ nước. Ô cho múc nước = prop/nền có
 *  `interact: "REFILL"` (giếng, và nền `water`). */
export function refill(d: Draft, content: Content): void {
  if (!hasNearbyInteract(d.s, content, "REFILL")) {
    toastText(d, "Phải đứng cạnh giếng hoặc bờ nước.", "bad");
    return;
  }
  const cap = waterCapacity(d.s, content);
  if (cap <= 0) return;
  if (d.s.water >= cap) return; // đã đầy: không đổi gì
  touch(d).water = cap;
  toastText(d, `Đã múc đầy bình (${cap}).`, "good");
}

/* -------------------------------------------------------------- chế tạo */

export function findRecipe(content: Content, id: string): RecipeDef | null {
  for (const r of content.recipes) if (r.id === id) return r;
  return null;
}

/** Đủ nguyên liệu để làm công thức này không. KHÔNG xét vị trí — chỗ đứng do
 *  reducer/`craft()` kiểm, còn UI thì dùng hàm này để bật/tắt nút. */
export function canCraft(state: GameState, content: Content, recipeId: string): boolean {
  const r = findRecipe(content, recipeId);
  if (!r) return false;
  for (const need of r.in) {
    if (countItem(state.inv, need.id) < Math.max(0, Math.floor(need.n))) return false;
  }
  return true;
}

/** Còn thiếu những gì — UI hiện "Gỗ 2/4". Đủ hết thì trả mảng rỗng. */
export function missingFor(
  state: GameState,
  content: Content,
  recipeId: string,
): { id: string; need: number; have: number }[] {
  const r = findRecipe(content, recipeId);
  if (!r) return [];
  const out: { id: string; need: number; have: number }[] = [];
  for (const need of r.in) {
    const want = Math.max(0, Math.floor(need.n));
    const have = countItem(state.inv, need.id);
    if (have < want) out.push({ id: need.id, need: want, have });
  }
  return out;
}

/** Chế tạo. Nguyên liệu có thể gồm CẢ CÔNG CỤ (nâng cấp ăn cái cũ).
 *  Ngoại lệ: hai ô công cụ đầu (cuốc/bình tưới) là vĩnh viễn — công thức nào
 *  "ăn" chúng thì vẫn được tính là đủ nguyên liệu, nhưng chúng không mất đi. */
export function craft(d: Draft, content: Content, recipeId: string): void {
  const r = findRecipe(content, recipeId);
  if (!r) return;
  if (!hasNearbyInteract(d.s, content, "CRAFT")) {
    toastText(d, "Phải đứng cạnh bàn chế tạo.", "bad");
    return;
  }
  const missing = missingFor(d.s, content, recipeId);
  if (missing.length > 0) {
    const what = missing
      .map((m) => `${itemName(m.id, content)} ${m.have}/${m.need}`)
      .join(", ");
    toastText(d, `Thiếu nguyên liệu: ${what}.`, "bad");
    return;
  }
  const outN = Math.max(1, Math.floor(r.out.n));
  if (!canAdd(d.s.inv, r.out.id, outN)) {
    toastKey(d, content, "invFull", "bad");
    return;
  }

  let inv = d.s.inv;
  for (const need of r.in) {
    const n = Math.max(0, Math.floor(need.n));
    const left = removeForCraft(inv, need.id, n);
    if (!left) return; // đã kiểm ở trên, nhưng thà không làm gì còn hơn làm nửa vời
    inv = left;
  }
  const added = addItem(inv, r.out.id, outN);
  setInv(d, added.inv);
  toastText(d, `Đã chế tạo ${itemName(r.out.id, content)} ×${outN}.`, "good");
}

/* ---------------------------------------------------------------- INTERACT */

/* Cầu nối cho làn render/UI: interactAt/nearbyInteract cài đặt ở world.ts
   (chúng chỉ tra cứu content), nhưng UI nhập từ đây cho cùng chỗ với useAt. */
export { interactAt, nearbyInteract, portalAt, propAt } from "./world.ts";

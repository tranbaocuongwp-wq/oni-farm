/* ============================================================================
   VEHICLES — xe từ NGOÀI bản đồ chạy vào.

   Vì sao có file này: mua một con bò rồi thấy nó bụp một cái hiện ra giữa
   chuồng thì mất hết tính tự nhiên. Nên mua xong sẽ có một chiếc xe chạy từ
   CỔNG ở mép bản đồ, theo con đường nhựa vào tới ĐIỂM GIAO cạnh quầy, thả hàng
   xuống, rồi quay ra. Con vật tự đi vào chỗ của nó sau đó.

   Hai vai, dùng chung một bộ máy:
     · `delivery` — chở hàng vào: thả một con vật (hoặc một chiếc xe) rồi đi.
     · `buyer`    — tới mua: gom sạch nông sản trong KHO với giá cao hơn quầy
                    một chút, trả tiền, rồi đi.

   Máy trạng thái đúng bốn nấc, và toàn bộ nằm trong save:

       (sinh ở CỔNG) ──▶ vào ──▶ chờ/làm việc ──▶ ra ──▶ (biến mất ở CỔNG)

   Xe chỉ đi được trên ĐƯỜNG và LỐI ĐI, không lội qua ruộng — đó là thứ cho con
   đường nhựa ở mốc B một lý do tồn tại thật sự, chứ không chỉ để đi nhanh hơn.
============================================================================ */

import type { Content, Entity, GameState, InvSlot, VehicleDef } from "./types.ts";
import type { Draft } from "./state.ts";
import { dEntity, randInt, toastText, touch } from "./state.ts";
import { setStore } from "./storage.ts";
import { removeEntity } from "./entities.ts";
import { sellPriceOf } from "./items.ts";
import { TILE, idx, nearestWaterTile, tileAt } from "./world.ts";
import { findPath } from "./pathfind.ts";
import { LEASH_TILES, MAX_NODES_ACTOR, MAX_PATH, spawnEntity } from "./entities.ts";

/** Xe đứng chờ ở điểm giao bao nhiêu phút game trước khi quay ra. */
const WAIT_MINUTES = 12;

/** Trần số xe cùng lúc — bãi đậu trước kho chỉ chứa được ngần này, xe tới sau
 *  phải xếp hàng ngoài đường chờ. */
export const MAX_VEHICLES = 3;

export function vehicleDef(content: Content, id: string): VehicleDef | null {
  return content.vehicles[id] ?? null;
}

export function vehicleCount(s: GameState): number {
  return s.entities.reduce((n, e) => n + (e.kind === "vehicle" ? 1 : 0), 0);
}

/**
 * Ô này xe đi được không.
 *
 * CHỈ đường nhựa và lối đi. Xe tải lội qua luống rau là thứ không ai muốn thấy,
 * và cấm nó ở đây khiến việc lát đường trở thành một quyết định có hậu quả thật
 * — không có đường thì xe không tới được kho.
 */
export function driveable(s: GameState, content: Content, x: number, y: number): boolean {
  const t = tileAt(s, x, y);
  if (!t) return false;
  if (t.prop) return false;
  if (t.b) {
    const def = content.buildings[t.b];
    if (def && def.kind !== "floor") return false;
    if (def?.effects.speedMul) return true; // đường người chơi tự xây
  }
  return t.g === "asphalt" || t.g === "path";
}

/** Tìm đường CHO XE: chỉ men theo đường, nên phải tự lọc chứ không dùng
 *  `walkableTile` chung được. */
function drivePath(
  s: GameState,
  content: Content,
  from: { x: number; y: number },
  to: { x: number; y: number },
  box: { w: number; h: number },
): number[] | null {
  // Dùng lại A* chung nhưng chặn trước bằng `driveable`: nếu ô đích không phải
  // đường thì khỏi tìm cho tốn.
  if (!driveable(s, content, to.x, to.y)) return null;
  const path = findPath(s, content, from.x, from.y, new Set([idx(s.w, to.x, to.y)]), {
    maxNodes: MAX_NODES_ACTOR,
    box,
    leash: { x: Math.floor((from.x + to.x) / 2), y: Math.floor((from.y + to.y) / 2), r: LEASH_TILES + 10 },
  });
  if (!path) return null;
  // Bỏ đường nào lạc ra khỏi mặt đường — thà không tới còn hơn lội qua ruộng.
  for (const i of path) {
    if (!driveable(s, content, i % s.w, (i / s.w) | 0)) return null;
  }
  return path.slice(0, MAX_PATH);
}

/* -------------------------------------------------------------------- sinh */

/** Cho một chiếc xe vào bản đồ ở CỔNG, mang theo một việc. */
export function sendVehicle(
  d: Draft,
  content: Content,
  defId: string,
  errand: NonNullable<Entity["veh"]>["errand"],
): number | null {
  const def = vehicleDef(content, defId);
  const gate = content.tiles.gate;
  if (!def || !gate) return null;
  if (gate.map !== d.s.mapId) return null;
  if (vehicleCount(d.s) >= MAX_VEHICLES) return null;

  const id = spawnEntity(d, content, {
    def: defId,
    map: gate.map,
    x: gate.x * TILE + TILE / 2,
    y: gate.y * TILE + TILE / 2,
    kind: "vehicle",
  });
  if (id === null) return null;
  const i = d.s.entities.findIndex((e) => e.id === id);
  const e = dEntity(d, i);
  if (!e) {
    /* Không gắn được khối `veh` thì PHẢI bỏ luôn chiếc xe.
       Một chiếc xe không có khối việc là thực thể chết: `vehicleStep` bỏ qua nó
       nên nó đứng im mãi mãi, mà `checkInvariants` thì ném lỗi sau MỖI tick —
       tức một dòng lỗi đỏ mỗi khung hình, và save đó hỏng vĩnh viễn. Thà không
       có chuyến giao hàng còn hơn. */
    removeEntity(d, id);
    return null;
  }
  e.veh = { role: errand?.kind === "buy" ? "buyer" : "delivery", cargo: [], errand, wait: 0, done: false };
  e.ai.phase = "in";
  return id;
}

/**
 * Ô đậu TRỐNG gần kho nhất cho chiếc xe `id`, hoặc null nếu bãi đã đầy.
 *
 * "Trống" nghĩa là chưa xe nào khác đang nhắm tới hoặc đang đứng đó. Thứ tự
 * duyệt là thứ tự khai trong content, nên kết quả TẤT ĐỊNH — không cần một hàng
 * đợi riêng trong state, cũng không có gì để lệch qua save/load.
 */
export function freeParkSpot(
  s: GameState,
  content: Content,
  selfId: number,
): { x: number; y: number } | null {
  const pk = content.tiles.parking;
  if (!pk || pk.map !== s.mapId) return null;
  for (const spot of pk.spots) {
    let taken = false;
    for (const e of s.entities) {
      if (e.kind !== "vehicle" || e.id === selfId) continue;
      if (e.ai.tx === spot.x && e.ai.ty === spot.y) {
        taken = true;
        break;
      }
      if (Math.floor(e.x / TILE) === spot.x && Math.floor(e.y / TILE) === spot.y) {
        taken = true;
        break;
      }
    }
    if (!taken) return spot;
  }
  return null;
}

/* -------------------------------------------------------------------- bước */

/**
 * Một lượt của một chiếc xe. Trả true nghĩa là đã xử lý xong lượt này.
 *
 * `takeBudget()` xin một suất tìm đường — dùng chung ngân sách với vật nuôi và
 * người làm, nên tổng số lần A* mỗi giây vẫn là hằng số.
 */
export function vehicleStep(
  d: Draft,
  content: Content,
  index: number,
  takeBudget: () => boolean,
): boolean {
  const cur = d.s.entities[index];
  if (!cur?.veh) return false;
  const def = vehicleDef(content, cur.def);
  const gate = content.tiles.gate;
  const drop = content.tiles.dropoff ?? content.tiles.spawn;
  if (!def || !gate) return false;

  const e = dEntity(d, index);
  if (!e?.veh) return false;
  const v = e.veh;

  const cx = Math.floor(e.x / TILE);
  const cy = Math.floor(e.y / TILE);
  const box = def.box;

  // ---- đang chờ ở điểm giao ---------------------------------------------
  if (v.wait > 0) {
    v.wait = Math.max(0, v.wait - 0.5);
    if (v.wait > 0) return true;
    doErrand(d, content, index);
    v.done = true;
    e.ai.phase = "out";
    e.ai.path = [];
    return true;
  }

  // ---- đang ra khỏi bản đồ ------------------------------------------------
  if (e.ai.phase === "out") {
    if (Math.abs(cx - gate.x) + Math.abs(cy - gate.y) <= 1) {
      removeEntity(d, e.id);
      return true;
    }
    if (e.ai.path.length) return true;
    if (!takeBudget()) return true;
    const p = drivePath(d.s, content, { x: cx, y: cy }, gate, box);
    if (p) e.ai.path = p;
    else removeEntity(d, e.id); // không về được thì thôi, đừng kẹt mãi
    return true;
  }

  /* ---- đang vào --------------------------------------------------------
     Xe THU MUA đậu ở BÃI ĐẬU trước kho; xe GIAO HÀNG thì tới thẳng điểm giao.
     Bãi đầy thì xe đứng chờ ngoài đường — đó chính là hàng đợi, không cần cấu
     trúc gì thêm trong state. */
  let dich = drop;
  if (v.role === "buyer") {
    const spot = freeParkSpot(d.s, content, e.id);
    if (!spot) {
      v.wait = 2; // bãi đầy: chờ rồi hỏi lại
      return true;
    }
    dich = { map: drop.map, x: spot.x, y: spot.y };
    e.ai.tx = spot.x;
    e.ai.ty = spot.y;
  }

  if (Math.abs(cx - dich.x) + Math.abs(cy - dich.y) <= 1) {
    v.wait = WAIT_MINUTES;
    e.ai.phase = "wait";
    e.ai.path = [];
    return true;
  }
  if (e.ai.path.length) return true;
  if (!takeBudget()) return true;
  const p = drivePath(d.s, content, { x: cx, y: cy }, dich, box);
  if (p && p.length) e.ai.path = p;
  else {
    // Không có đường vào — thường là người chơi chưa lát đường tới kho. Đứng
    // chờ một lát rồi thử lại thay vì biến mất, để họ thấy chiếc xe đang đợi.
    v.wait = 3;
  }
  return true;
}

/* -------------------------------------------------------------------- việc */

function doErrand(d: Draft, content: Content, index: number): void {
  const e = d.s.entities[index];
  if (!e?.veh?.errand) return;
  const er = e.veh.errand;
  const drop = content.tiles.dropoff ?? content.tiles.spawn;

  if (er.kind === "drop") {
    const def = content.animals[er.animal];
    // Loài dưới nước phải xuống AO, không phải xuống mặt đường: nước là ô đặc
    // với mọi thứ khác, nên thả cá lên đường là con cá đó kẹt trên cạn vĩnh viễn.
    let px = drop.x;
    let py = drop.y + 1;
    if (def?.housing === "water") {
      const ao = nearestWaterTile(d.s, content, drop.x, drop.y);
      if (!ao) {
        toastText(d, "Chưa có ao để thả cá — hàng bị trả lại.", "bad");
        return;
      }
      px = ao.x;
      py = ao.y;
    }
    const id = spawnEntity(d, content, {
      def: er.animal,
      map: drop.map,
      x: px * TILE + TILE / 2,
      y: py * TILE + TILE / 2,
    });
    if (id !== null && def)
      toastText(
        d,
        def.housing === "water" ? `${def.name} đã được thả xuống ao.` : `${def.name} đã được giao tới.`,
        "good",
      );
    return;
  }

  // xe thu mua: gom sạch nông sản trong kho, trả cao hơn quầy `buyBonus`
  const vd = vehicleDef(content, e.def);
  const bonus = 1 + (vd?.buyBonus ?? 0);
  let count = 0;
  let gain = 0;
  const store: InvSlot[] = d.s.store.slice();
  for (let i = 0; i < store.length; i++) {
    const s = store[i];
    if (!s || !s.id.startsWith("crop:")) continue;
    const unit = sellPriceOf(s.id, content);
    if (unit <= 0) continue;
    count += s.n;
    gain += Math.round(unit * bonus) * s.n;
    store[i] = null;
  }
  if (count > 0) {
    setStore(d, store);
    const st = touch(d);
    st.money = st.money + gain;
    st.stats = { ...st.stats, sold: st.stats.sold + count, earned: st.stats.earned + gain };
    toastText(d, `Xe thu mua lấy ${count} món · +${gain}đ`, "good");
  } else {
    toastText(d, "Xe thu mua tới nhưng kho trống.", "info");
  }
}

/* ------------------------------------------------------------ sang ngày mới */

/** Thỉnh thoảng cho một xe thu mua ghé, nếu kho có hàng. Gọi lúc sang ngày. */
export function maybeSendBuyer(d: Draft, content: Content): boolean {
  if (!content.vehicles["buyer"]) return false;
  const coHang = d.s.store.some((v) => v && v.id.startsWith("crop:"));
  if (!coHang) return false;
  if (vehicleCount(d.s) >= MAX_VEHICLES) return false;

  const r = randInt(d.s.seed, 0, 2);
  touch(d).seed = r.seed;
  if (r.v !== 0) return false; // khoảng một phần ba số ngày

  return sendVehicle(d, content, "buyer", { kind: "buy" }) !== null;
}

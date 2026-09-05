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
import { sellPriceOf, sellable } from "./items.ts";
import { TILE, idx, nearestWaterTile, tileAt } from "./world.ts";
import { findPath } from "./pathfind.ts";
import { LEASH_TILES, MAX_PATH, spawnEntity } from "./entities.ts";

/** Xe đứng chờ ở điểm giao bao nhiêu phút game trước khi quay ra. */
const WAIT_MINUTES = 12;

/* Ngân sách A* cho XE rộng hơn của vật nuôi: xe men theo mặt đường nên đường
   đi của nó dài hơn hẳn đường chim bay, và nó chỉ tìm mỗi chuyến một lần chứ
   không tìm lại mỗi bước như con vật đi lang thang. */
const MAX_NODES_VEHICLE = 2600;

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
  // Chặn trước bằng `driveable`: ô đích không phải mặt đường thì khỏi tìm.
  if (!driveable(s, content, to.x, to.y)) return null;
  const path = findPath(s, content, from.x, from.y, new Set([idx(s.w, to.x, to.y)]), {
    maxNodes: MAX_NODES_VEHICLE,
    box,
    /* Mặt đường là RÀNG BUỘC của phép tìm, không phải phép soát lại sau khi
       tìm xong: A* luôn trả đường NGẮN NHẤT, mà đường ngắn nhất thì cắt thẳng
       qua bãi cỏ. Soát lại là bỏ cả chuyến — chiếc xe đứng chờ rồi thả hàng
       ngay giữa đường. Lọc trong vòng lặp thì nó tự tìm đường VÒNG theo đường
       nhựa, đúng như một chiếc xe thật. */
    pass: (x, y) => driveable(s, content, x, y),
    leash: { x: Math.floor((from.x + to.x) / 2), y: Math.floor((from.y + to.y) / 2), r: LEASH_TILES + 14 },
  });
  if (!path) return null;
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

/**
 * Ô mặt đường GẦN AO nhất — chỗ xe dừng để thả cá xuống nước.
 *
 * Vì sao không thả ở bãi giao nhận như mọi thứ khác: bãi nằm trước cửa kho, ở
 * đầu kia nông trại, cách mặt nước ba mươi ô. Thả cá ở đó rồi để nó "xuất hiện"
 * dưới ao là đúng cái kiểu dịch chuyển tức thời mà cả hệ thống xe cộ này sinh
 * ra để tránh. Chở cá thì phải chở tới AO.
 */
export function pondDock(s: GameState, content: Content): { x: number; y: number } | null {
  const ao = (content.tiles.pens ?? []).find((p) => p.swim && p.map === s.mapId);
  if (!ao) return null;
  const cx = ao.x + ao.w / 2;
  const cy = ao.y + ao.h / 2;
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  /* Quét một vành quanh ao, không quét cả bản đồ: chỗ đậu phải SÁT ao thì cái
     cần cẩu mới với tới, và quét hẹp thì rẻ. */
  for (let y = ao.y - 3; y <= ao.y + ao.h + 2; y++)
    for (let x = ao.x - 3; x <= ao.x + ao.w + 2; x++) {
      if (!driveable(s, content, x, y)) continue;
      // phải có mặt nước trong tầm với, nếu không thì đứng đây thả xuống đâu
      if (!nearestWaterTile(s, content, x, y, 3)) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
  return best;
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
     MỌI xe đều ĐẬU VÀO BÃI trước cửa kho — cả xe thu mua lẫn xe giao hàng.
     Trước đây chỉ xe thu mua vào bãi, còn xe giao hàng dừng ngay trên điểm
     giao giữa TRỤC ĐƯỜNG DỌC rồi đứng đó mười hai phút: nhìn ra là một chiếc
     xe chết máy chắn ngang con đường duy nhất nối nông trại với bên ngoài.
     Hàng về thì về tới kho, đúng như một cái sân giao nhận thật.

     Bãi đầy thì xe đứng chờ ngoài đường — đó chính là hàng đợi, không cần cấu
     trúc gì thêm trong state. Bãi có đúng `MAX_VEHICLES` ô nên không kẹt cứng. */
  /* Chở CÁ thì đích là BỜ AO, không phải bãi giao nhận. Ao ở đầu kia nông
     trại, nên thả ở bãi rồi để con cá hiện ra dưới nước là đúng kiểu dịch
     chuyển tức thời mà cả hệ thống xe cộ này sinh ra để tránh. */
  const chocCa =
    v.errand?.kind === "drop" && content.animals[v.errand.animal]?.housing === "water"
      ? pondDock(d.s, content)
      : null;
  const spot = chocCa ?? freeParkSpot(d.s, content, e.id);
  if (!spot) {
    v.wait = 2; // bãi đầy: chờ rồi hỏi lại
    return true;
  }
  const dich = { map: drop.map, x: spot.x, y: spot.y };
  e.ai.tx = spot.x;
  e.ai.ty = spot.y;

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

/**
 * Ô đứng được ngay cạnh (x,y) — chỗ để hàng xuống khi xe đã đậu.
 *
 * Ưu tiên phía DƯỚI rồi mới sang hai bên: bãi giao nhận nằm ngay dưới bức
 * tường kho, nên phía trên gần như luôn là ô đặc.
 */
function beside(s: GameState, content: Content, x: number, y: number): { x: number; y: number } | null {
  const quanh: [number, number][] = [
    [-1, 0],
    [1, 0],
    [0, 1],
    [0, -1],
    [-1, 1],
    [1, 1],
  ];
  const duocKhong = (nx: number, ny: number): boolean => {
    const t = tileAt(s, nx, ny);
    if (!t || t.g === "water") return false;
    if (t.prop && content.props[t.prop]?.solid) return false;
    if (t.b && content.buildings[t.b]?.solid) return false;
    return true;
  };
  /* Hai lượt: lượt đầu TRÁNH MẶT ĐƯỜNG. Thả con gà xuống giữa nhánh đường thì
     nó đứng đó cho tới lúc tự nghĩ ra đường về chuồng, mà trong lúc ấy chiếc xe
     sau phải lách qua nó. Hết chỗ mới chịu để xuống mặt đường. */
  for (const [dx, dy] of quanh) {
    const nx = x + dx;
    const ny = y + dy;
    if (duocKhong(nx, ny) && tileAt(s, nx, ny)?.g !== "asphalt") return { x: nx, y: ny };
  }
  for (const [dx, dy] of quanh) {
    const nx = x + dx;
    const ny = y + dy;
    if (duocKhong(nx, ny)) return { x: nx, y: ny };
  }
  return null;
}

function doErrand(d: Draft, content: Content, index: number): void {
  const e = d.s.entities[index];
  if (!e?.veh?.errand) return;
  const er = e.veh.errand;
  const drop = content.tiles.dropoff ?? content.tiles.spawn;

  if (er.kind === "drop") {
    const def = content.animals[er.animal];
    /* Thả hàng NGAY CẠNH CHIẾC XE, không phải ở một toạ độ cố định nào khác:
       xe đậu ở ô nào trong bãi là hàng xuống ở đó. Lấy điểm giao làm chỗ dựa
       khi quanh xe không còn ô nào đứng được. */
    const bai = beside(d.s, content, Math.floor(e.x / TILE), Math.floor(e.y / TILE));
    let px = bai ? bai.x : drop.x;
    let py = bai ? bai.y : drop.y + 1;
    // Loài dưới nước phải xuống AO, không phải xuống mặt đường: nước là ô đặc
    // với mọi thứ khác, nên thả cá lên đường là con cá đó kẹt trên cạn vĩnh viễn.
    if (def?.housing === "water") {
      /* Đổ xuống chỗ nước gần CHIẾC XE — xe đã đỗ sát bờ ao rồi. Hỏi từ điểm
         giao (trước cửa kho) thì con cá rơi xuống ao ở đầu kia bản đồ, mà đó
         chính là cú dịch chuyển vừa bỏ công đi tránh. */
      const ao =
        nearestWaterTile(d.s, content, Math.floor(e.x / TILE), Math.floor(e.y / TILE), 6) ??
        nearestWaterTile(d.s, content, drop.x, drop.y);
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

  // xe thu mua: gom sạch hàng bán được trong kho, trả cao hơn quầy `buyBonus`
  const vd = vehicleDef(content, e.def);
  const bonus = 1 + (vd?.buyBonus ?? 0);
  let count = 0;
  let gain = 0;
  const store: InvSlot[] = d.s.store.slice();
  for (let i = 0; i < store.length; i++) {
    const s = store[i];
    if (!s || !sellable(s.id, content)) continue;
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
  // Có hàng BÁN ĐƯỢC — không chỉ nông sản. Một kho đầy sữa với len mà xe thu
  // mua không thèm ghé là đúng cái lỗi đã làm cả nghề chăn nuôi thành vô nghĩa.
  const coHang = d.s.store.some((v) => v && sellable(v.id, content));
  if (!coHang) return false;
  if (vehicleCount(d.s) >= MAX_VEHICLES) return false;

  const r = randInt(d.s.seed, 0, 2);
  touch(d).seed = r.seed;
  if (r.v !== 0) return false; // khoảng một phần ba số ngày

  return sendVehicle(d, content, "buyer", { kind: "buy" }) !== null;
}

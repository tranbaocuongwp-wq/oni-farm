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
import { weatherDef } from "./weather.ts";
import type { Draft } from "./state.ts";
import { dEntity, randInt, toastText, touch } from "./state.ts";
import { hash2 } from "../core/rng.ts";
import { setStore } from "./storage.ts";
import { removeEntity } from "./entities.ts";
import { sellPriceOf, sellable } from "./items.ts";
import { TILE, idx, nearestWaterTile, tileAt, waterSpotForBox } from "./world.ts";
import { findPath } from "./pathfind.ts";
import { LEASH_TILES, MAX_PATH_VEHICLE, spawnEntity } from "./entities.ts";

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

/**
 * Số xe CỦA NÔNG TRANG đang trên bản đồ — xe giao hàng, xe thu mua, thuyền.
 *
 * KHÔNG kể xe chạy ngang trên quốc lộ. Chúng là trang trí: một hôm đường đông
 * mà xe giao hàng của người chơi không vào được thì trang trí đang cướp chỗ của
 * luật chơi, và đó là thứ không bao giờ được phép. Xe chạy ngang có trần riêng
 * (`MAX_TRAFFIC`).
 */
export function vehicleCount(s: GameState): number {
  return s.entities.reduce(
    (n, e) => n + (e.kind === "vehicle" && e.veh?.errand?.kind !== "transit" ? 1 : 0),
    0,
  );
}

/**
 * Ô này xe đi được không.
 *
 * CHỈ đường nhựa và lối đi. Xe tải lội qua luống rau là thứ không ai muốn thấy,
 * và cấm nó ở đây khiến việc lát đường trở thành một quyết định có hậu quả thật
 * — không có đường thì xe không tới được kho.
 */
/**
 * Ô này ĐI ĐƯỢC với loại xe `def` không.
 *
 * Thuyền và xe tải dùng CHUNG toàn bộ bộ máy — sinh ở cổng, tìm đường, làm
 * việc, rồi đi ra — và khác nhau đúng ở câu hỏi này. Tách bằng một hàm chứ
 * không bằng một hệ thống thứ hai.
 */
export function driveableFor(
  s: GameState,
  content: Content,
  def: VehicleDef | null,
  x: number,
  y: number,
): boolean {
  if (!def?.sea) return driveable(s, content, x, y);
  const t = tileAt(s, x, y);
  if (!t) return false;
  /* Thuyền đi trên MẶT NƯỚC, và cây cầu là vật cản chứ không phải mặt đường —
     đúng chiều ngược lại với xe tải. Cầu bắc TRÊN mặt nước, thuyền chui không
     lọt. */
  if (t.prop) return false;
  if (t.b) return false;
  return t.g === "water";
}

export function driveable(s: GameState, content: Content, x: number, y: number): boolean {
  const t = tileAt(s, x, y);
  if (!t) return false;
  /* Chỉ chặn vật thể ĐẶC. Bản cũ từ chối MỌI ô có `prop`, nên một khúc gỗ người
     chơi vừa đặt xuống mặt đường là chặn đứng cả xe giao hàng lẫn xe thu mua —
     không thông báo gì, chỉ có `v.wait = 3` lặp lại tới hết đời. Mà chính khúc
     gỗ ấy thì người chơi đi qua được. */
  if (t.prop && content.props[t.prop]?.solid !== false) return false;
  /* CẦU ĐƯỜNG bắc qua nước: xe chạy được, dù NỀN dưới nó là nước.

     Không phải cầu nào cũng vậy, và đó là chỗ tôi làm sai một lần rồi. Nhận
     MỌI vật `bridge` là đường xe thì cái cầu tàu giữa ao cũng thành mặt đường
     — `pondDock` đi tìm "ô đường gần ao nhất" liền trả về một ô nằm GIỮA HỒ,
     và chiếc xe chở cá không bao giờ tới nơi được. Cầu tàu để câu cá, cầu gỗ
     để đi bộ, chỉ cây cầu có `drive` mới chở nổi xe tải. */
  if (t.prop && content.props[t.prop]?.drive) return true;
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
  def: VehicleDef | null = null,
): number[] | null {
  // Chặn trước: ô đích không đi được với loại xe này thì khỏi tìm.
  if (!driveableFor(s, content, def, to.x, to.y)) return null;
  const path = findPath(s, content, from.x, from.y, new Set([idx(s.w, to.x, to.y)]), {
    maxNodes: MAX_NODES_VEHICLE,
    box,
    /* Mặt đường là RÀNG BUỘC của phép tìm, không phải phép soát lại sau khi
       tìm xong: A* luôn trả đường NGẮN NHẤT, mà đường ngắn nhất thì cắt thẳng
       qua bãi cỏ. Soát lại là bỏ cả chuyến — chiếc xe đứng chờ rồi thả hàng
       ngay giữa đường. Lọc trong vòng lặp thì nó tự tìm đường VÒNG theo đường
       nhựa, đúng như một chiếc xe thật. */
    /* THUYỀN hỏi hộp va chạm bằng luật BƠI. Không có dòng này thì `findPath`
       kiểm thân con thuyền bằng luật đi bộ — và với luật ấy mọi ô nước đều là
       ô đặc, nên con thuyền không tìm ra đường ở giữa biển. */
    swims: def?.sea === true,
    pass: (x, y) => driveableFor(s, content, def, x, y),
    leash: { x: Math.floor((from.x + to.x) / 2), y: Math.floor((from.y + to.y) / 2), r: LEASH_TILES + 14 },
  });
  if (!path) return null;
  return path.slice(0, MAX_PATH_VEHICLE);
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
  /* Sinh ra ở ĐÚNG cổng của loại xe ấy: thuyền ngoài biển, xe ngoài đường.
     Thiếu chỗ này thì con thuyền hiện ra giữa rừng, không ô nào quanh nó đi
     được, và nó bị dọn đi ngay ở bước đầu tiên — biến mất trước khi người chơi
     kịp thấy. */
  const gate = (def?.sea ? content.tiles.seaGate : content.tiles.gate) ?? content.tiles.gate;
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
  /* THUYỀN ra vào bằng CỔNG BIỂN, xe bằng cổng đường. Cùng một máy trạng thái,
     chỉ khác hai cái mốc. */
  const gate = (def?.sea ? content.tiles.seaGate : content.tiles.gate) ?? content.tiles.gate;
  const drop = content.tiles.dropoff ?? content.tiles.spawn;
  if (!def || !gate) return false;

  const e = dEntity(d, index);
  if (!e?.veh) return false;
  const v = e.veh;

  const cx = Math.floor(e.x / TILE);
  const cy = Math.floor(e.y / TILE);
  const box = def.box;

  /* ---- ĐI NGANG QUA: xe trên quốc lộ ------------------------------------

     Nó không có việc gì ở nông trang, nên nó không đi qua bất kỳ trạng thái
     nào của máy trạng thái bên dưới: không đỗ bãi, không chờ, không "xong việc
     rồi quay ra". Một chặng, tới nơi thì biến mất.

     Xét TRƯỚC `v.wait` và trước mọi nhánh cổng: nếu để nó rơi vào nhánh "đang
     vào" thì nó sẽ đi tìm bãi đậu trước cửa kho và đứng đó — một chiếc xe buýt
     đỗ trong sân nông trại, và bãi thì hết chỗ cho xe giao hàng thật. */
  if (v.errand?.kind === "transit") {
    /* Đường đã dựng SẴN lúc sinh — một đường thẳng dọc làn — nên ở đây không
       gọi A* lấy một lần. Đó không phải chuyện tiết kiệm vặt: `takeBudget()` là
       NGÂN SÁCH A* DÙNG CHUNG của cả bản đồ, và xe chạy ngang mà tiêu vào đó
       thì người làm thuê hết lượt xin đường. Đúng lỗi ấy đã xảy ra ở bản đầu —
       kịch bản 151 đếm được 127 lần gọi A* trong 400 phút game, trần là 120.

       Trang trí không bao giờ được tiêu ngân sách của luật chơi. */
    if (e.ai.path.length) return true;
    removeEntity(d, e.id); // hết đường = đã ra tới mép, biến mất
    return true;
  }

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
    const p = drivePath(d.s, content, { x: cx, y: cy }, gate, box, def);
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
  /* THUYỀN BUÔN cập BẾN ở cuối cầu tàu — một ô nước cố định trong content.
     Nó không dùng bãi đậu: bãi nằm trước cửa kho, trên cạn. */
  const ben = def.sea ? (content.tiles.dock ?? null) : null;
  const spot = ben ?? chocCa ?? freeParkSpot(d.s, content, e.id);
  if (!spot) {
    v.wait = 2; // bãi đầy: chờ rồi hỏi lại
    return true;
  }
  const dich = { map: drop.map, x: spot.x, y: spot.y };
  e.ai.tx = spot.x;
  e.ai.ty = spot.y;

  if (Math.abs(cx - dich.x) + Math.abs(cy - dich.y) <= 1) {
    /* Thuyền ở lại LÂU HƠN hẳn: người chơi phải đi bộ xuống tận bến biển ở đáy
       bản đồ, và một cái sạp mở mười hai phút thì tới nơi là nó đã nhổ neo. */
    v.wait = def.sea ? (def.stayMinutes ?? WAIT_MINUTES) : WAIT_MINUTES;
    e.ai.phase = "wait";
    e.ai.path = [];
    return true;
  }
  if (e.ai.path.length) return true;
  if (!takeBudget()) return true;
  const p = drivePath(d.s, content, { x: cx, y: cy }, dich, box, def);
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

  /* THUYỀN chỉ đứng đó cho người chơi tới mua. Không thả hàng, không gom
     hàng — cả `doErrand` với nó là một việc rỗng, và đó là đúng. */
  if (er.kind === "shop") return;

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
        waterSpotForBox(d.s, content, def.box, Math.floor(e.x / TILE), Math.floor(e.y / TILE), 6) ??
        waterSpotForBox(d.s, content, def.box, drop.x, drop.y);
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
/**
 * THUYỀN BUÔN có ghé hôm nay không.
 *
 * Cứ ba ngày một lần, và tính THẲNG TỪ `day` chứ không rút xúc xắc: người chơi
 * phải ĐOÁN ĐƯỢC hôm nào thuyền tới thì mới có lý do đi bộ xuống tận bến biển
 * ở đáy bản đồ. Một sự kiện ngẫu nhiên ở một nơi đi mất hai phút thì không ai
 * đi lần thứ hai.
 *
 * Nó cũng không cần điều kiện gì khác: thuyền đến để BÁN, nên kho trống hay
 * đầy đều không liên quan — khác hẳn xe thu mua.
 */
/* ------------------------------------------------------- XE CHẠY TRÊN QUỐC LỘ

   Cường: *"có xe buýt chạy ngang… xem như là đường quốc lộ"*.

   Con đường chỉ là một dải nhựa cho tới khi có gì đó chạy trên nó. Nhưng thứ
   chạy trên quốc lộ KHÔNG phải chuyện của nông trang: nó không mua, không bán,
   không đỗ, và người chơi không tương tác được với nó. Nó có mặt để nông trang
   nằm cạnh một thế giới đang chạy chứ không nằm giữa hư vô.

   Vì thế nó có TRẦN RIÊNG (`MAX_TRAFFIC`), không ăn vào `MAX_VEHICLES`. Dùng
   chung trần thì một hôm đông xe buýt là xe giao hàng của người chơi không vào
   được — trang trí cướp chỗ của luật chơi, đúng thứ không bao giờ được phép. */

/** Nhiều nhất ngần này xe chạy ngang cùng lúc. */
export const MAX_TRAFFIC = 3;

/** Bao nhiêu phút game giữa hai lượt thử cho xe ra đường. */
const NHIP_XE_PHUT = 7;

export function trafficCount(s: GameState): number {
  let n = 0;
  for (const e of s.entities) if (e.kind === "vehicle" && e.veh?.errand?.kind === "transit") n++;
  return n;
}

/**
 * Thử cho MỘT xe ra quốc lộ. Gọi mỗi khung hình; tự thưa ra theo đồng hồ game.
 *
 * `truoc`/`nay` là mốc phút game của khung trước và khung này — cùng cách
 * `weatherTick` nhận nhịp, nên một khung dài (máy chậm, tab vừa hiện lại)
 * không sinh ra một đoàn xe.
 */
export function maybeSendTraffic(d: Draft, content: Content, truoc: number, nay: number): boolean {
  const hw = content.tiles.highway;
  if (!hw || hw.map !== d.s.mapId || hw.lanes.length === 0) return false;
  // Vắt qua mốc nhịp chưa? Không thì thôi.
  if (Math.floor(truoc / NHIP_XE_PHUT) === Math.floor(nay / NHIP_XE_PHUT)) return false;
  if (trafficCount(d.s) >= MAX_TRAFFIC) return false;
  /* Bão thì đường vắng — cùng luật với xe thu mua và thuyền buôn. Người chơi
     nhìn ra đường thấy vắng tanh là một cách nữa để bão có mặt. */
  if (weatherDef(d.s, content).halt) return false;

  /* Chọn LÀN và LOẠI XE bằng HÀM BĂM THUẦN, tuyệt đối KHÔNG đụng `state.seed`.

     Đây là luật cứng của cả hệ thực thể, và kịch bản 55 là dây bẫy cho nó:
     đường TICK không được rút một hạt nào từ dòng ngẫu nhiên dùng chung. Lý do:
     TICK chạy mỗi KHUNG HÌNH, nên số lần rút phụ thuộc fps và cả việc người
     chơi có mở modal hay không. Rút ở đây là bất biến "cùng seed + cùng chuỗi
     action = state y hệt" vỡ ngay, và vỡ âm thầm — game vẫn chạy, chỉ replay
     không còn khớp và save không tái lập được. (Tôi đã viết đúng cái lỗi ấy ở
     bản đầu của hàm này; kịch bản 55 bắt được ngay.)

     Băm theo (ngày, nhịp) thì cùng một lúc trong cùng một ngày luôn cho cùng
     chiếc xe, dù máy chạy 30 hay 120 khung mỗi giây. */
  const nhip = Math.floor(nay / NHIP_XE_PHUT);
  const lan = hw.lanes[hash2(d.s.day, nhip, 0x51) % hw.lanes.length]!;
  // xe máy đông hơn xe buýt, như ngoài đời
  const loai = hash2(d.s.day, nhip, 0x77) % 3 === 0 ? "bus" : "moto";
  if (!content.vehicles[loai]) return false;

  /* Vào ở đầu NGƯỢC với chiều đi: làn 'e' chạy sang đông nên vào từ mép tây. */
  const vao = lan.dir === "e" ? hw.x0 : hw.x1;
  const ra = lan.dir === "e" ? hw.x1 : hw.x0;
  return sendTransit(d, content, loai, { x: vao, y: lan.y }, { x: ra, y: lan.y }) !== null;
}

/** Thả một chiếc xe vào `tu`, cho nó chạy tới `den` rồi biến mất. */
function sendTransit(
  d: Draft,
  content: Content,
  defId: string,
  tu: { x: number; y: number },
  den: { x: number; y: number },
): number | null {
  const def = vehicleDef(content, defId);
  if (!def) return null;
  if (!driveableFor(d.s, content, def, tu.x, tu.y)) return null;
  const id = spawnEntity(d, content, {
    def: defId,
    map: d.s.mapId,
    x: tu.x * TILE + TILE / 2,
    y: tu.y * TILE + TILE / 2,
    kind: "vehicle",
    // Sinh ra từ TICK → tự mang hạt, không đụng `state.seed`. Xem SpawnOptions.
    seed: hash2(tu.x, tu.y, d.s.entSeq + 1),
  });
  if (id === null) return null;
  const i = d.s.entities.findIndex((e) => e.id === id);
  const e = dEntity(d, i);
  if (!e) {
    removeEntity(d, id);
    return null;
  }
  e.veh = {
    role: "delivery",
    cargo: [],
    errand: { kind: "transit", tx: den.x, ty: den.y },
    wait: 0,
    done: false,
  };
  e.ai.phase = "in";
  /* ĐƯỜNG ĐI DỰNG THẲNG, không qua A*. Làn là một hàng ô nhựa liền mạch từ mép
     này sang mép kia — không có gì để tìm. Gọi A* ở đây vừa thừa vừa tiêu vào
     ngân sách dùng chung của người làm và vật nuôi. */
  const buoc: number[] = [];
  const huong = den.x > tu.x ? 1 : -1;
  for (let x = tu.x + huong; ; x += huong) {
    buoc.push(tu.y * d.s.w + x);
    if (x === den.x) break;
  }
  e.ai.path = buoc;
  return id;
}

export function maybeSendBoat(d: Draft, content: Content): boolean {
  const def = content.vehicles["boat"];
  if (!def || !content.tiles.seaGate || !content.tiles.dock) return false;
  if (d.s.day % 3 !== 0) return false;
  // Bão thì thuyền không ra khơi — và không bù ngày: nhịp ba ngày vẫn tính từ
  // `day`, người chơi nhìn dự báo hôm trước là biết.
  if (weatherDef(d.s, content).halt) return false;
  if (vehicleCount(d.s) >= MAX_VEHICLES) return false;
  return sendVehicle(d, content, "boat", { kind: "shop" }) !== null;
}

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

  /* Bão thì xe không tới. Xét SAU khi rút xúc xắc, để chuỗi seed của mọi ngày
     y hệt như không có luật này — thêm một ngày bão không được làm ngày nắng
     kế tiếp đổi kết quả. */
  if (weatherDef(d.s, content).halt) return false;

  return sendVehicle(d, content, "buyer", { kind: "buy" }) !== null;
}

/* ============================================================================
   WORKERS — người làm thuê.

   Họ làm đúng như Cường mô tả: được giao MỘT loại việc (chăm cây hoặc chăn
   nuôi), trong phạm vi đó thì TỰ phán đoán thứ tự ưu tiên, và làm TUẦN TỰ từng
   việc một — xong việc này mới chọn việc khác. Có năng lượng riêng; mệt thì tự
   nghỉ rồi làm tiếp. Đầy tay thì đem hàng về kho tập trung.

   Thứ tự ưu tiên CỐ ĐỊNH, không ngẫu nhiên. "Tự phán đoán" ở đây nghĩa là họ tự
   nhìn ra việc gì đang cần, chứ không phải mỗi lần lại chọn khác — người chơi
   phải đoán được người làm sẽ làm gì, nếu không thì thuê người thành ra thả một
   con rối vào ruộng.

   Đáng chú ý: hàm chọn việc dùng CHUNG với nút "tự động làm" của người chơi
   (`nearestTarget` trong hint.ts). Viết một lần dùng hai chỗ — nếu tách hai
   đường thì thứ tự ưu tiên của người chơi và của người làm sẽ trôi khỏi nhau
   theo thời gian, và không ai nhận ra cho tới lúc chúng đã khác hẳn.
============================================================================ */

import type { Content, Entity, GameState, InvSlot, WorkerJob } from "./types.ts";
import type { Draft } from "./state.ts";
import { dEntity, randInt, toastKey, toastText, touch } from "./state.ts";
import { addItem, canAdd } from "./inventory.ts";
import { setStore, storeHasRoom } from "./storage.ts";
import { MAX_ENTITIES, removeEntity } from "./entities.ts";
import { TILE, tileIndexAt, idx } from "./world.ts";
import { animalDef, entityAt } from "./entities.ts";
import { readyProduct } from "./animals.ts";

/** Tên gọi cho vui — không ảnh hưởng luật chơi, chỉ để người chơi phân biệt. */
const NAMES = ["Tư", "Bảy", "Hùng", "Lan", "Sáu", "Mai", "Dũng", "Hạnh", "Tí", "Nga"];

export function isWorker(e: Entity): boolean {
  return e.kind === "worker" && !!e.worker;
}

export function workerCount(s: GameState): number {
  return s.entities.reduce((n, e) => n + (isWorker(e) ? 1 : 0), 0);
}

/** Tổng số món một người đang đeo. */
export function carried(w: { carry: InvSlot[] }): number {
  return w.carry.reduce((n, v) => n + (v ? v.n : 0), 0);
}

/* ------------------------------------------------------------------- thuê */

export function hireWorker(d: Draft, content: Content, job: WorkerJob): number | null {
  const cfg = content.workers;
  if (d.s.money < cfg.hireFee) {
    toastKey(d, content, "noMoney", "bad");
    return null;
  }
  const drop = content.tiles.dropoff ?? content.tiles.spawn;
  if (drop.map !== d.s.mapId) {
    toastKey(d, content, "deliverElsewhere", "info");
    return null;
  }
  /* TRẦN THỰC THỂ. Hàm này tự `push` vào `s.entities` thay vì đi qua
     `spawnEntity`, nên nó bỏ qua `MAX_ENTITIES` — thuê đủ người là
     `checkInvariants` báo vỡ sau MỖI dispatch, rồi `capEntities` cắt cụt danh
     sách ở lần migrate kế tiếp: mất cả người làm lẫn vật nuôi, không báo trước.
     Người làm và vật nuôi dùng chung một trần, nên phải hỏi ở đây. */
  if (d.s.entities.length >= MAX_ENTITIES) {
    toastText(d, "Nông trại đã đông kín — không thuê thêm được nữa.", "bad");
    return null;
  }

  const s = touch(d);
  const id = s.entSeq + 1;
  s.entSeq = id;
  s.money = s.money - cfg.hireFee;

  const rn = randInt(s.seed, 0, NAMES.length - 1);
  s.seed = rn.seed;
  const rs = randInt(s.seed, 0, Math.max(0, cfg.skins.length - 1));
  s.seed = rs.seed;

  const e: Entity = {
    id,
    kind: "worker",
    def: "worker",
    map: drop.map,
    x: drop.x * TILE + TILE / 2,
    y: drop.y * TILE + TILE / 2,
    dir: "down",
    anim: 0,
    seed: (rs.seed ^ (id * 40503)) >>> 0,
    ai: { phase: "idle", until: 0, tx: -1, ty: -1, path: [], planAt: -999 },
    animal: { age: 0, fed: 0, hungryDays: 0, prod: [] },
    worker: {
      name: NAMES[rn.v] ?? "Tư",
      skin: rs.v,
      job,
      energy: cfg.energyMax,
      paidDay: s.day,
      carry: [],
    },
  };
  s.entities = [...s.entities, e];
  d.changed = true;
  toastText(d, `Đã thuê ${e.worker!.name} — việc: ${job === "crops" ? "chăm cây" : "chăn nuôi"}.`, "good");
  return id;
}

export function fireWorker(d: Draft, content: Content, id: number): boolean {
  const e = d.s.entities.find((x) => x.id === id);
  if (!e || !isWorker(e)) return false;
  // Hàng đang đeo KHÔNG bốc hơi: đổ hết vào kho trước khi cho nghỉ.
  dumpToStore(d, content, e);
  const name = e.worker!.name;
  removeEntity(d, id);
  toastText(d, `${name} đã nghỉ việc.`, "info");
  return true;
}

export function assignJob(d: Draft, id: number, job: WorkerJob): boolean {
  const i = d.s.entities.findIndex((x) => x.id === id);
  if (i < 0) return false;
  const e = dEntity(d, i);
  if (!e?.worker) return false;
  e.worker.job = job;
  // Đổi việc thì bỏ luôn việc đang làm dở — nếu không họ vẫn lụi hụi làm nốt
  // cái việc thuộc nghề cũ, và người chơi tưởng lệnh không ăn.
  e.ai = { ...e.ai, phase: "idle", until: 0, tx: -1, ty: -1, path: [] };
  return true;
}

/* --------------------------------------------------------------- đổ hàng */

/** Đổ sạch thứ đang đeo vào kho tập trung. */
export function dumpToStore(d: Draft, content: Content, e: Entity): number {
  if (!e.worker || !e.worker.carry.length) return 0;
  let moved = 0;
  let store = d.s.store;
  const con: InvSlot[] = [];
  for (const v of e.worker.carry) {
    if (!v) continue;
    if (!canAdd(store, v.id, v.n)) {
      con.push(v);
      continue;
    }
    const r = addItem(store, v.id, v.n);
    store = r.inv;
    moved += r.added;
  }
  if (moved > 0) setStore(d, store);
  else if (con.length)
    /* KHO ĐẦY và người làm vẫn ôm nguyên hàng. Báo ở ĐÂY chứ không ở `pickTask`:
       hàm này chỉ chạy khi họ đã đứng tới cái kho, tức là đúng một lần mỗi
       chuyến — tự tiết chế, không cần cờ đếm nào trong save. */
    toastKey(d, content, "storeFullWorker", "bad");

  const i = d.s.entities.indexOf(e);
  const m = dEntity(d, i);
  if (m?.worker) m.worker.carry = con;
  return moved;
}

/** Thêm hàng vào tay người làm; trả số thật sự nhận được (trần `carryMax`). */
export function giveToWorker(
  d: Draft,
  content: Content,
  index: number,
  id: string,
  n: number,
): number {
  const e = dEntity(d, index);
  if (!e?.worker) return 0;
  const room = Math.max(0, content.workers.carryMax - carried(e.worker));
  const take = Math.min(n, room);
  if (take <= 0) return 0;
  const cur = e.worker.carry.find((v) => v && v.id === id);
  if (cur) cur.n += take;
  else e.worker.carry = [...e.worker.carry, { id, n: take }];
  return take;
}

/* ------------------------------------------------------------------ lương */

/**
 * Trả lương. Gọi ở BƯỚC 2 của `newDay` — bước tiền tệ.
 *
 * Phải nằm TRƯỚC bước 8 (`applyProgression`): nếu trả sau, mốc tiến trình theo
 * `money` sẽ được tính bằng số tiền CHƯA trừ lương, tức là mở khoá bằng tiền
 * chưa thật sự có.
 *
 * Không đủ tiền thì người làm nghỉ việc chứ không cho nợ — để `money` không bao
 * giờ âm, và để hậu quả của việc thuê quá tay là thấy được ngay.
 */
export function payWages(d: Draft, content: Content): { paid: number; quit: number } {
  const cfg = content.workers;
  const out = { paid: 0, quit: 0 };
  const nghi: number[] = [];

  for (let i = 0; i < d.s.entities.length; i++) {
    const cur = d.s.entities[i]!;
    if (!isWorker(cur)) continue;

    /* Xoá SỔ ĐEN mỗi sáng. Người chơi có thể đã phá cái hàng rào chắn đường
       trong ngày hôm qua, và nhớ mãi một chỗ không tới được là nhớ một thứ đã
       cũ — người làm sẽ bỏ qua vĩnh viễn một góc ruộng đã thông từ lâu. */
    if (cur.ai.bad?.length) {
      const e0 = dEntity(d, i);
      if (e0) delete e0.ai.bad;
    }

    const w = cur.worker!;
    if (d.s.day - w.paidDay < cfg.wageEveryDays) continue;

    if (d.s.money < cfg.wage) {
      nghi.push(cur.id);
      out.quit++;
      continue;
    }
    touch(d).money = d.s.money - cfg.wage;
    const e = dEntity(d, i);
    if (e?.worker) e.worker.paidDay = d.s.day;
    out.paid += cfg.wage;
  }

  for (const id of nghi) {
    const e = d.s.entities.find((x) => x.id === id);
    if (e) dumpToStore(d, content, e);
    removeEntity(d, id);
  }
  if (out.paid > 0) toastText(d, `Đã trả lương ${out.paid}đ.`, "info");
  if (out.quit > 0) toastKey(d, content, "wageUnpaid", "bad", `×${out.quit}`);
  return out;
}

/** Hồi năng lượng cho mọi người làm — gọi ở bước 7 cùng lúc hồi cho người chơi. */
export function restWorkers(d: Draft, content: Content): void {
  for (let i = 0; i < d.s.entities.length; i++) {
    if (!isWorker(d.s.entities[i]!)) continue;
    const e = dEntity(d, i);
    if (e?.worker) e.worker.energy = content.workers.energyMax;
  }
}

/* ------------------------------------------------------------- chọn việc */

export type TaskKind = "use" | "gather" | "feed" | "dump";

export interface Task {
  kind: TaskKind;
  tx: number;
  ty: number;
  /** Con vật cần tới, cho `gather`/`feed`. Xem `AiState.ent`. */
  ent?: number;
}

/**
 * Việc TIẾP THEO cho một người làm, theo thứ tự ưu tiên cố định của nghề.
 *
 * Chỉ gọi khi họ vừa XONG một việc, không phải mỗi bước — nên chi phí quét vẫn
 * là vài lần mỗi phút chứ không phải mỗi khung hình.
 */
export function pickTask(s: GameState, content: Content, e: Entity): Task | null {
  const w = e.worker;
  if (!w) return null;

  /* Ô đã thử mà KHÔNG TỚI ĐƯỢC thì đừng chọn lại. Không có bộ lọc này thì
     người làm đứng đơ: hàm này luôn trả về ô gần nhất, A* không tìm ra đường
     tới nó, lượt sau lại trả về đúng ô đó. Nhìn từ ngoài y hệt treo máy. */
  const bad = e.ai.bad;
  const xau = (x: number, y: number): boolean =>
    !!bad?.length && bad.includes(idx(s.w, x, y));

  const cho = Math.max(0, content.workers.carryMax - carried(w));

  /* VỀ KHO ĐỔ — nhưng chỉ khi kho CÒN CHỖ.

     `dumpToStore` trả phần không cất được lại vào tay. Kho đầy thì tay vẫn đầy,
     nên lượt sau `pickTask` lại ra lệnh "về kho", lại đi tới, lại đổ được 0
     món — một vòng lặp không có lối ra, không toast, không đổi việc. Người chơi
     nhìn thấy một người làm đi tới đi lui giữa ruộng và cái kho đầy, mãi mãi.

     `storeHasRoom` đã nằm sẵn trong `storage.ts` từ lâu, chú thích của chính nó
     ghi "dùng cho toast và cho AI người làm SAU NÀY" — AI viết xong rồi mà chưa
     ai gọi nó. Đây là chỗ nó sinh ra để đứng. */
  const veKho = (): Task | null => {
    if (carried(w) <= 0) return null;
    const conCho = w.carry.some((v) => v && storeHasRoom(s.store, v.id));
    if (!conCho) return null;
    const kho = findStoreTile(s, content);
    return kho ? { kind: "dump", tx: kho.x, ty: kho.y } : null;
  };

  // Đầy tay thì việc duy nhất là về kho. Đứng trước mọi thứ khác — người thật
  // cũng vậy, không ai ôm đầy tay rồi còn cúi xuống nhặt thêm.
  if (cho <= 0) return veKho();

  const cx = Math.floor(e.x / TILE);
  const cy = Math.floor(e.y / TILE);
  /* Bán kính quét THƯỜNG. Cố ý hẹp: người làm nên làm gọn khu quanh mình chứ
     không nhảy từ góc này sang góc kia nông trại, và quét hẹp thì rẻ. */
  const R = 14;
  /* …nhưng khi quanh đó KHÔNG CÓ GÌ thì quét cả bản đồ một lần.

     Không có bước này thì thuê người xong họ đứng im mãi mãi ở điểm giao hàng:
     ô thả người nằm ở (41,5) còn các lô ruộng ở tận nửa kia, xa hơn 14 ô. Người
     chơi trả 900đ rồi nhìn một người đứng yên cả ngày — đo trên trình duyệt
     thật: 20 giây, 24 ô lúa chín, không nhặt một quả nào.

     Chỉ chạy khi vòng hẹp đã trắng tay, nên chi phí thêm gần như bằng không
     trong lúc họ đang có việc. */
  const RX = Math.max(s.w, s.h);

  if (w.job === "livestock") {
    // 1) con vật tới lứa → thu; 2) con vật đói → cho ăn
    let best: Task | null = null;
    let bestD = Infinity;
    for (const a of s.entities) {
      if (a.map !== s.mapId || a.kind !== "animal") continue;
      const def = animalDef(content, a.def);
      if (!def) continue;
      const ax = Math.floor(a.x / TILE);
      const ay = Math.floor(a.y / TILE);
      const dist = Math.abs(ax - cx) + Math.abs(ay - cy);
      if (dist > RX) continue;
      const pi = readyProduct(a, content);
      const kind: TaskKind | null =
        pi >= 0 ? "gather" : def.feed && a.animal.fed <= 0 ? "feed" : null;
      if (!kind) continue;
      if (xau(ax, ay)) continue;
      /* Không đủ chỗ cho MỨC SẢN LƯỢNG CAO NHẤT thì đừng nhận việc thu.
         `giveToWorker` kẹp theo `carryMax` và trả về số THẬT SỰ nhận, nhưng
         `doWork` vẫn reset `prod` / xoá cây bất kể — nên ở mức `carryMax − 1`,
         thu một luống cho 3 quả là 2 quả bốc hơi. Đọc `p.max` từ content nên
         không phải rút hạt ngẫu nhiên chỉ để rồi bỏ. */
      if (kind === "gather" && cho < (def.products[pi]?.max ?? 1)) continue;
      // thu luôn thắng cho ăn: sản phẩm để lâu không mất, nhưng tay đang rảnh
      // thì nên nhặt trước
      const score = (kind === "gather" ? 0 : 1000) + dist;
      if (score < bestD) {
        bestD = score;
        best = { kind, tx: ax, ty: ay, ent: a.id };
      }
    }
    if (best) return best;
  }

  // Việc trên RUỘNG. Dùng chính bộ chấm điểm của `nearestTarget` nhưng đo từ vị
  // trí NGƯỜI LÀM chứ không phải từ người chơi, nên phải tự quét ở đây.
  const job = cropTask(s, content, cx, cy, R, xau, cho) ?? cropTask(s, content, cx, cy, RX, xau, cho);
  if (job) return job;

  // Hết việc mà tay còn hàng thì tranh thủ về kho đổ.
  return veKho();
}

/** Ô kho gần nhất trên bản đồ đang chơi. */
export function findStoreTile(s: GameState, content: Content): { x: number; y: number } | null {
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x < s.w; x++) {
      const t = s.tiles[y * s.w + x];
      if (!t?.prop) continue;
      if (content.props[t.prop]?.interact === "STORE") return { x, y };
    }
  return null;
}

/**
 * Việc đồng áng gần nhất: thu cây chín → chữa cây bệnh → tưới ô khô.
 *
 * KHÔNG cày và KHÔNG gieo: cả hai đều tiêu vật phẩm của người chơi (hạt giống)
 * và đều là quyết định về BỐ CỤC nông trại. Người làm thuê tự ý cày chỗ này
 * gieo chỗ kia thì người chơi mất quyền quy hoạch ruộng của chính mình.
 */
function cropTask(
  s: GameState,
  content: Content,
  cx: number,
  cy: number,
  R: number,
  /** Ô người làm này vừa không tới được — xem `AiState.bad`. */
  xau: (x: number, y: number) => boolean,
  /** Chỗ trống còn lại trên tay. Cùng lý do với nhánh chăn nuôi: thu một luống
   *  mà tay chỉ còn một chỗ thì phần thừa BỐC HƠI, chứ không nằm lại trên cây. */
  cho: number,
): Task | null {
  let best: Task | null = null;
  let bestScore = Infinity;
  for (let y = Math.max(0, cy - R); y <= Math.min(s.h - 1, cy + R); y++) {
    for (let x = Math.max(0, cx - R); x <= Math.min(s.w - 1, cx + R); x++) {
      const t = s.tiles[y * s.w + x];
      if (!t) continue;
      let uu = -1;
      if (t.crop) {
        const cd = content.crops[t.crop.id];
        if (cd && t.crop.stage >= cd.growthDays.length) uu = 0; // chín
        else if (t.crop.sick) uu = 1; // bệnh
        else if (t.tilled && !t.wet) uu = 2; // khô
      } else if (t.tilled && !t.wet) uu = 2;
      if (uu < 0) continue;
      if (xau(x, y)) continue;
      // Thu hoạch mà không đủ chỗ cho `yieldMax` thì để đó, về kho đổ đã.
      if (uu === 0 && t.crop) {
        const cd = content.crops[t.crop.id];
        if (cd && cho < cd.yieldMax) continue;
      }
      const score = uu * 1000 + Math.abs(x - cx) + Math.abs(y - cy);
      if (score < bestScore) {
        bestScore = score;
        best = { kind: "use", tx: x, ty: y };
      }
    }
  }
  return best;
}

/* ------------------------------------------------------------ bảng thông tin */

/** Mọi thứ người chơi cần biết về MỘT người làm, ở dạng dữ liệu thuần. */
export interface WorkerCard {
  kind: "worker";
  name: string;
  /** "chăm cây" | "chăn nuôi" */
  job: string;
  /** Đang làm gì NGAY LÚC NÀY, viết bằng lời thường. */
  doing: string;
  /** 0..1 */
  energy: number;
  carry: number;
  carried: number;
  carryMax: number;
  /** Ngày trả lương kế tiếp. */
  payDay: number;
  wage: number;
}

/**
 * Bảng của một người làm.
 *
 * "Đang làm gì" quan trọng hơn mọi con số khác ở đây: người chơi trả lương ba
 * ngày một lần cho một người tự đi lại trên bản đồ, và câu hỏi duy nhất họ hỏi
 * khi nhìn thấy người đó là "hắn có đang làm gì không, hay đứng không?". Không
 * trả lời được câu đó thì tiền lương thành một khoản chi mù.
 */
export function workerCard(e: Entity, content: Content): WorkerCard | null {
  const w = e.worker;
  if (!w) return null;
  const cfg = content.workers;
  const deo = carried(w);
  const doing =
    e.ai.phase === "rest"
      ? "Đang nghỉ lấy sức"
      : e.ai.phase === "work"
        ? "Đang làm việc"
        : e.ai.phase === "walk"
          ? `Đang đi tới ô ${e.ai.tx},${e.ai.ty}`
          : deo >= cfg.carryMax
            ? "Tay đầy — đang về kho"
            : "Đang tìm việc";
  return {
    kind: "worker",
    name: w.name,
    job: w.job === "crops" ? "chăm cây" : "chăn nuôi",
    doing,
    energy: cfg.energyMax > 0 ? Math.max(0, Math.min(1, w.energy / cfg.energyMax)) : 1,
    carry: cfg.carryMax > 0 ? Math.max(0, Math.min(1, deo / cfg.carryMax)) : 0,
    carried: deo,
    carryMax: cfg.carryMax,
    payDay: w.paidDay + cfg.wageEveryDays,
    wage: cfg.wage,
  };
}

/** Người làm gần ô (x,y) trong tầm — để nút tương tác mở đúng bảng của họ. */
export function workerNear(s: GameState, x: number, y: number, maxTiles = 1.4): Entity | null {
  const cx = x * TILE + TILE / 2;
  const cy = y * TILE + TILE / 2;
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const e of s.entities) {
    if (e.map !== s.mapId || e.kind !== "worker" || !e.worker) continue;
    const d = Math.hypot(e.x - cx, e.y - cy) / TILE;
    if (d <= maxTiles && d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** Người làm đang đứng ở ô nào — dùng để biết đã tới nơi chưa. */
export function atTile(e: Entity, tx: number, ty: number, slack = 1.4): boolean {
  const dx = e.x - (tx * TILE + TILE / 2);
  const dy = e.y - (ty * TILE + TILE / 2);
  return Math.hypot(dx, dy) / TILE <= slack;
}

/** Ô này có ai (người chơi hoặc người làm khác) đang nhận làm không. */
export function tileTakenBy(s: GameState, tx: number, ty: number, selfId: number): boolean {
  for (const e of s.entities) {
    if (e.id === selfId || !isWorker(e)) continue;
    if (e.ai.tx === tx && e.ai.ty === ty) return true;
  }
  if (s.pending && s.pending.x === tx && s.pending.y === ty) return true;
  const ti = tileIndexAt(s, tx, ty);
  return ti < 0;
}

export { entityAt };

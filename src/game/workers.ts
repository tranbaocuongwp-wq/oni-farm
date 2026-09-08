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
import { dEntity, randInt, toastKey, toastText, touch, dStats } from "./state.ts";
import { addItem, canAdd } from "./inventory.ts";
import { setStore, storeHasRoom } from "./storage.ts";
import { itemName } from "./items.ts";
import { MAX_ENTITIES, removeEntity } from "./entities.ts";
import { TILE, tileIndexAt, idx } from "./world.ts";
import { animalDef, entityAt } from "./entities.ts";
import { readyProduct } from "./animals.ts";
import { pourSpotIn, troughItem, troughMax, troughStock } from "./pen.ts";
import { cropInSeason } from "./season.ts";
import { donDuoc, isTillable } from "./world.ts";
import { CROP_ORDER, jobRank } from "./joborder.ts";
import { weatherDef } from "./weather.ts";

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
  const st = dStats(d);
  st.hired = (st.hired ?? 0) + 1;

  const ten = cfg.names && cfg.names.length ? cfg.names : NAMES;
  const rn = randInt(s.seed, 0, ten.length - 1);
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
      name: ten[rn.v] ?? NAMES[0] ?? "Tư",
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

/**
 * Loại việc người làm nhận. Ba việc ruộng (`harvest`/`cure`/`water`) trước Đợt
 * 22 gộp chung làm `"use"`, và cái gộp ấy trả giá ở hai chỗ: thẻ người làm chỉ
 * nói được câu vô nghĩa "làm việc trên ruộng", còn lớp vẽ thì không biết nên
 * đặt CÁI GÌ vào tay họ. `"use"` vẫn được `doWork` chấp nhận để save cũ chạy
 * tiếp bình thường.
 */
export type TaskKind =
  | "use"
  | "harvest"
  | "cure"
  | "water"
  | "gather"
  | "pour"
  | "dump"
  | "till"
  | "plant"
  | "clear"
  | "break";

export interface Task {
  kind: TaskKind;
  tx: number;
  ty: number;
  /** Con vật cần tới, cho `gather`/`feed`. Xem `AiState.ent`. */
  ent?: number;
}

/* ------------------------------------------------------- VẬT TƯ CÒN HAY HẾT

   Ba câu hỏi mà cả `pickTask`, `doWork` lẫn lời kêu thiếu hàng đều phải hỏi —
   và trước Đợt 22 mỗi nơi tự tính một kiểu (`cropTask` tự quét `seed:`, `doWork`
   tự `findIndex` thuốc, `pickTask` tự `some` cám). Ba bản sao của cùng một câu
   hỏi là ba cơ hội để chúng trôi khỏi nhau — đúng bài học của chính đợt này,
   nên rút ra dùng chung ngay trước khi nó kịp xảy ra.
--------------------------------------------------------------------------- */

/** Kho có HẠT gieo được hôm nay không (đúng mùa). */
export function hatDungMua(s: GameState, content: Content): boolean {
  return s.store.some(
    (v) => v && v.id.startsWith("seed:") && cropInSeason(v.id.slice(5), s.day, content),
  );
}

/** Kho có THUỐC chữa cây bệnh không. */
export function coThuoc(s: GameState): boolean {
  return s.store.some((v) => v && v.id === "item:medicine");
}

/** Kho có món KHU NÀY nhận không (và đúng món đang nằm trong máng). */
export function monChoKhu(
  s: GameState,
  _content: Content,
  pen: { feeds?: readonly string[] },
  spot: { x: number; y: number },
): boolean {
  const dang = troughItem(s, spot.x, spot.y);
  const muon = dang !== null ? [dang] : (pen.feeds ?? []);
  return s.store.some((v) => v && muon.includes(v.id));
}

/**
 * Vật tư đang CHẶN một việc có thật, hoặc null.
 *
 * Đây là câu người làm nói ra khi họ rảnh: *"tôi rảnh VÌ thiếu hàng"* — khác
 * hẳn "kho hơi thiếu". Nên nó chỉ trả về một món khi việc cần món ấy ĐANG CÓ ở
 * ngoài kia: có khu đói mà kho hết cám, có cây bệnh mà kho hết thuốc, có luống
 * trống mà kho hết hạt đúng mùa.
 *
 * Thứ tự hỏi bám đúng thang việc: con vật chết đói được, cây bệnh thì lụi dần,
 * còn luống trống chỉ nằm đó chờ.
 *
 * THUẦN — không Draft, không toast. Nơi gọi quyết định làm gì với câu trả lời.
 */
export function wantOf(s: GameState, content: Content): string | null {
  // 1. CÁM: khu nào có con đang đói mà kho không còn món khu ấy nhận.
  for (const pen of content.tiles.pens ?? []) {
    if (pen.map !== s.mapId) continue;
    const spot = pourSpotIn(s, content, pen);
    if (!spot) continue;
    if (troughStock(s, spot.x, spot.y) >= troughMax(content)) continue;
    const doi = s.entities.some(
      (a) =>
        a.kind === "animal" &&
        a.map === s.mapId &&
        animalDef(content, a.def)?.pen === pen.id &&
        a.animal.fed < (animalDef(content, a.def)?.fedMinutes ?? 0) * 0.5,
    );
    if (!doi) continue;
    if (monChoKhu(s, content, pen, spot)) continue;
    return (pen.feeds ?? [])[0] ?? "item:feedmix";
  }

  // 2. THUỐC: có cây bệnh mà kho hết thuốc.
  if (!coThuoc(s) && s.tiles.some((t) => t.crop?.sick)) return "item:medicine";

  // 3. HẠT: có luống cày trống mà kho hết hạt đúng mùa.
  if (!hatDungMua(s, content)) {
    const coLuong = s.tiles.some((t) => t.tilled && !t.crop && !t.prop && !t.b);
    if (coLuong) return "seed";
  }
  return null;
}

/**
 * Một câu gộp lời kêu của MỌI người làm, hoặc null. Suy tại chỗ, không lưu —
 * thêm một bản gộp vào state là thêm một thứ phải đồng bộ, phải migrate, phải
 * kiểm bất biến, cho một dòng chữ đọc xong là quên.
 */
export function wantSummary(s: GameState, content: Content): string | null {
  const mon = new Set<string>();
  for (const e of s.entities) {
    const w = e.worker?.want;
    if (w?.id) mon.add(w.id);
  }
  if (!mon.size) return null;
  const ten = [...mon].map((id) => (id === "seed" ? "hạt đúng mùa" : itemName(id, content)));
  return `Người làm đang chờ: ${ten.join(" · ")}`;
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
  /* ĐÃ CÓ NGƯỜI NHẬN — dựng MỘT LẦN, rồi lọc ngay TRONG vòng chấm điểm.

     Trước đây chỗ này chỉ so ô, so SAU khi đã chọn xong, và người thứ hai gặp
     trùng thì đứng phí nguyên một lượt (`e.ai.until = 1`) thay vì nhận việc kế
     tiếp. Hai người làm cạnh nhau thành ra chỉ có một người làm việc. Và nó
     không so CON VẬT, nên hai người vẫn cùng đuổi theo một con bò khi nó đi
     khỏi cái ô đã ghi. */
  const oNhan = new Set<number>();
  const conNhan = new Set<number>();
  for (const o of s.entities) {
    if (o.id === e.id || o.kind !== "worker" || !o.worker) continue;
    if (o.ai.tx >= 0) oNhan.add(idx(s.w, o.ai.tx, o.ai.ty));
    if (o.ai.ent !== undefined) conNhan.add(o.ai.ent);
  }
  if (s.pending) oNhan.add(idx(s.w, s.pending.x, s.pending.y));
  const xau = (x: number, y: number): boolean =>
    (!!bad?.length && bad.includes(idx(s.w, x, y))) || oNhan.has(idx(s.w, x, y));

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

  /* CHĂN NUÔI KHÔNG CÒN LÀ MỘT VAI RIÊNG.

     Vai "chăm cây" / "chăn nuôi" vốn đã mỏng hơn vẻ ngoài: nhánh chăn nuôi bị
     khoá sau `job === "livestock"`, còn nhánh cây trồng chạy cho CẢ HAI vai —
     nên người "chăn nuôi" xưa nay vẫn đi làm ruộng. Bỏ cái khoá đi là mọi
     người làm cùng một thang ưu tiên, và người chơi thôi phải đoán xem nên
     thuê ai làm gì.

     Thang: thu sản phẩm → đổ máng → việc trên ruộng → về kho. */
  {
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
      const kind: TaskKind | null = pi >= 0 ? "gather" : null;
      if (!kind) continue;
      if (xau(ax, ay) || conNhan.has(a.id)) continue;
      /* Không đủ chỗ cho MỨC SẢN LƯỢNG CAO NHẤT thì đừng nhận việc thu.
         `giveToWorker` kẹp theo `carryMax` và trả về số THẬT SỰ nhận, nhưng
         `doWork` vẫn reset `prod` / xoá cây bất kể — nên ở mức `carryMax − 1`,
         thu một luống cho 3 quả là 2 quả bốc hơi. Đọc `p.max` từ content nên
         không phải rút hạt ngẫu nhiên chỉ để rồi bỏ. */
      if (kind === "gather" && cho < (def.products[pi]?.max ?? 1)) continue;
      if (dist < bestD) {
        bestD = dist;
        best = { kind, tx: ax, ty: ay, ent: a.id };
      }
    }
    if (best) return best;
  }

  /* ĐỔ MÁNG — việc người làm CHƯA TỪNG làm được, mà lẽ ra phải là việc đầu tiên
     của họ: nó là thứ duy nhất giữ cả đàn sống qua đêm.

     Chọn khu nào có con ĐANG ĐÓI (hoặc sắp đói) và máng đang vơi, gần nhất
     trước. Cám lấy từ KHO — người làm không có túi riêng để đi chợ; hết cám
     trong kho thì không nhận việc, chứ không đứng đó tay không. */
  {
    let best: Task | null = null;
    let bestD = Infinity;
    for (const pen of content.tiles.pens ?? []) {
      if (pen.map !== s.mapId) continue;
      const spot = pourSpotIn(s, content, pen);
      if (!spot) continue;
      if (troughStock(s, spot.x, spot.y) >= troughMax(content)) continue;
      if (xau(spot.x, spot.y)) continue;
      // Kho có món nào khu này nhận không (và đúng món đang nằm trong máng).
      if (!monChoKhu(s, content, pen, spot)) continue;
      // Khu này có con nào cần ăn không — máng vơi mà chuồng trống thì kệ nó.
      const can = s.entities.some(
        (a) =>
          a.kind === "animal" &&
          a.map === s.mapId &&
          animalDef(content, a.def)?.pen === pen.id &&
          a.animal.fed < (animalDef(content, a.def)?.fedMinutes ?? 0) * 0.5,
      );
      if (!can) continue;
      const dist = Math.abs(spot.x - cx) + Math.abs(spot.y - cy);
      if (dist < bestD) {
        bestD = dist;
        best = { kind: "pour", tx: spot.x, ty: spot.y };
      }
    }
    if (best) return best;
  }

  // Việc trên RUỘNG. Dùng chính bộ chấm điểm của `nearestTarget` nhưng đo từ vị
  // trí NGƯỜI LÀM chứ không phải từ người chơi, nên phải tự quét ở đây.
  const job =
    cropTask(s, content, cx, cy, R, xau, cho, content.tiles.pens) ??
    cropTask(s, content, cx, cy, RX, xau, cho, content.tiles.pens);
  if (job) return job;

  // Tay còn hàng thì về kho đổ trước khi đi kiếm thêm.
  const kho = veKho();
  if (kho) return kho;

  /* RẢNH VIỆC THÌ ĐI KIẾM TÀI NGUYÊN — gỗ và đá.

     Ràng buộc là phần quan trọng nhất: CHỈ TRONG RỪNG. Không có nó thì người
     làm sẽ dọn sạch mấy cái cây và tảng đá người chơi cố ý chừa lại quanh sân,
     và không có nút hoàn tác nào cho chuyện đó. Rừng thì mọc lại mỗi đêm, nên
     lấy ở đó là lấy từ thứ tự tái tạo. */
  {
    let best: Task | null = null;
    let bestD = Infinity;
    for (const z of content.tiles.zones ?? []) {
      if (z.kind !== "forest" || z.map !== s.mapId) continue;
      for (let y = z.y; y < z.y + z.h; y++)
        for (let x = z.x; x < z.x + z.w; x++) {
          const t = s.tiles[y * s.w + x];
          if (!t?.prop) continue;
          const def = content.props[t.prop];
          // Có ĐẬP ĐƯỢC và có ĐỒ RƠI RA. Cái giếng, cái biển thì không.
          if (!def?.hits || !def.drops?.length || def.interact) continue;
          if (cho < 2) continue;
          if (xau(x, y)) continue;
          const dist = Math.abs(x - cx) + Math.abs(y - cy);
          if (dist < bestD) {
            bestD = dist;
            best = { kind: "break", tx: x, ty: y };
          }
        }
    }
    if (best) return best;
  }

  return null;
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
 * CÀY VÀ GIEO: nay CÓ, nhưng chỉ TRONG LÔ RUỘNG.
 *
 * Luật cũ cấm hẳn, và lý do khi ấy đúng: cày chỗ nào gieo chỗ nào là quyết định
 * bố cục, người làm tự ý thì người chơi mất quyền quy hoạch. Nhưng luật ấy viết
 * hồi cả bản đồ đều cày được. Từ khi có VÙNG, cuốc chỉ ăn trong `zones` loại
 * `farm`, và mấy cái lô ấy sinh ra đúng để trồng trọt — cày trong lô không cướp
 * quyền của ai, còn để đất lô nằm không mới là bỏ phí người mình đang trả lương.
 *
 * Hạt lấy từ KHO và phải ĐÚNG MÙA (xem `doWork`): người làm không đi chợ, và
 * không gieo ra một luống chắc chắn héo.
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
  pens: readonly { map: string; x: number; y: number; w: number; h: number }[] | undefined,
): Task | null {
  // Kho có hạt ĐÚNG MÙA nào không — không có thì đừng nhận việc gieo.
  const coHat = hatDungMua(s, content);
  const trongChuong = (x: number, y: number): boolean =>
    (pens ?? []).some(
      (p) => p.map === s.mapId && x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h,
    );
  let best: Task | null = null;
  let bestScore = Infinity;
  /* Bậc ưu tiên KHÔNG còn là mấy con số gõ tay ở đây: nó đọc `CROP_ORDER`
     (game/joborder.ts), CÙNG một hằng mà nút TỰ ĐỘNG của người chơi đọc. Trước
     Đợt 22 hai bên có hai bảng riêng và đã trôi khỏi nhau — người làm tưới
     trước gieo, người chơi gieo trước tưới. */
  /* TRỜI ƯỚT thì TƯỚI tụt xuống cuối bảng. Sáng mai mọi ô đã cày ngoài trời tự
     ẩm (xem `newday.ts`), nên xách bình đi tưới hôm nay là đổ nước xuống một
     thứ trời sắp làm hộ — trong khi luống chưa gieo thì vẫn nằm đó. Nút TỰ ĐỘNG
     của người chơi thừa hưởng cùng luật vì cả hai đọc chung `CROP_ORDER`. */
  const troiUot = weatherDef(s, content).wet;
  const xet = (x: number, y: number, kind: TaskKind) => {
    if (xau(x, y)) return;
    const bac = troiUot && kind === "water" ? CROP_ORDER.length : jobRank(kind);
    const score = bac * 1000 + Math.abs(x - cx) + Math.abs(y - cy);
    if (score < bestScore) {
      bestScore = score;
      best = { kind, tx: x, ty: y };
    }
  };
  for (let y = Math.max(0, cy - R); y <= Math.min(s.h - 1, cy + R); y++) {
    for (let x = Math.max(0, cx - R); x <= Math.min(s.w - 1, cx + R); x++) {
      const t = s.tiles[y * s.w + x];
      if (!t) continue;

      if (t.crop) {
        const cd = content.crops[t.crop.id];
        if (cd && t.crop.stage >= cd.growthDays.length) {
          // Thu hoạch mà không đủ chỗ cho `yieldMax` thì để đó, về kho đổ đã.
          if (cho >= cd.yieldMax) xet(x, y, "harvest");
        } else if (t.crop.sick) xet(x, y, "cure");
        else if (t.tilled && !t.wet) xet(x, y, "water");
        continue;
      }

      /* LUỐNG ĐÃ CÀY: gieo VÀ tưới là hai ứng viên RIÊNG, không loại trừ nhau.
         Trước Đợt 22 đây là một chuỗi `else if` mà nhánh tưới đứng trước, nên
         một luống cày khô chưa gieo luôn bị đọc thành "đi tưới" — và người làm
         KHÔNG BAO GIỜ gieo được trên luống khô, trong khi người chơi thì gieo
         được (`canUseAt` không đòi `wet`). Hai luật khác nhau cho cùng một động
         từ, im lặng suốt nhiều đợt. */
      if (t.tilled && !t.prop && !t.b) {
        if (coHat) xet(x, y, "plant");
        if (!t.wet) xet(x, y, "water");
        continue;
      }
      if (t.tilled && !t.wet) {
        xet(x, y, "water");
        continue;
      }

      // CỎ DẠI mọc lan vào lô: dọn đi để trả lại một ô đất cày được.
      if (t.prop) {
        if (cho >= 2 && donDuoc(s, content, x, y)) xet(x, y, "clear");
        continue;
      }

      // Đất lô chưa cày: CÀY. `isTillable` đã kẹp trong vùng ruộng; chặn thêm
      // khu chuồng cho chắc — sàn chuồng không phải chỗ trồng trọt.
      if (!t.b && !t.crop && isTillable(s, content, x, y) && !trongChuong(x, y)) xet(x, y, "till");
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
  /** Vật tư đang chờ người chơi bổ sung, hoặc null. */
  want: string | null;
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
  /* NÓI RA VIỆC ĐANG LÀM, không nói toạ độ.
     "Đang đi tới ô 36,11" là thứ chỉ người viết code đọc được; người chơi cần
     biết anh ta đang đi ĐỔ MÁNG hay đi CHẶT CÂY. Từ khi bỏ vai, đây là chỗ
     duy nhất trả lời câu "người này đang làm gì cho tôi". */
  const ten: Record<string, string> = {
    dump: "về kho đổ hàng",
    pour: "đi đổ máng",
    gather: "đi thu sản phẩm",
    harvest: "đi thu hoạch",
    cure: "đi chữa cây bệnh",
    water: "đi tưới",
    till: "đi cày",
    plant: "đi gieo hạt",
    clear: "đi dọn cỏ trong lô",
    break: "đi kiếm gỗ đá",
    // việc vặt lúc rảnh — xem `idleStep` trong workerai.ts
    patrol: "đi một vòng nông trại",
    chat: "đứng nói chuyện",
    pet: "vuốt ve con vật",
    unload: "bốc xếp cho xe",
    // save cũ: ba việc ruộng từng gộp làm một, không nói rõ hơn được
    use: "làm việc trên ruộng",
  };
  const viec = e.ai.job ? (ten[e.ai.job] ?? "làm việc") : null;
  const doing =
    e.ai.phase === "rest"
      ? "Đang nghỉ lấy sức"
      : e.ai.phase === "chore" && viec
        ? `Rảnh việc — đang ${viec}`
      : viec
        ? (e.ai.phase === "walk" ? `Đang ${viec}` : `Đang ${viec}`)
        : deo >= cfg.carryMax
          ? "Tay đầy — đang về kho"
          : "Đang tìm việc";
  return {
    kind: "worker",
    name: w.name,
    job: viec ? viec.replace(/^đi /, "") : "đang tìm việc",
    doing,
    energy: cfg.energyMax > 0 ? Math.max(0, Math.min(1, w.energy / cfg.energyMax)) : 1,
    carry: cfg.carryMax > 0 ? Math.max(0, Math.min(1, deo / cfg.carryMax)) : 0,
    carried: deo,
    carryMax: cfg.carryMax,
    want: w.want ? (w.want.id === "seed" ? "hạt đúng mùa" : itemName(w.want.id, content)) : null,
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

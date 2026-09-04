/* ============================================================================
   ANIMALS — vòng đời vật nuôi: ăn, lớn, cho sản phẩm, và chết nếu bỏ đói.

   Chia sản phẩm làm hai loại, và đó chính là cách diễn đạt yêu cầu "vừa lấy cái
   này vừa lấy cái kia":

     · `products[]` — thu LẶP LẠI. Tới lứa thì đứng cạnh bấm là lấy được, rồi
       đồng hồ chạy lại từ đầu. Sữa, trứng, lông cừu.
     · `meat` — thu MỘT LẦN. Bán con vật đi. `null` nghĩa là không bán thịt được
       (con chó).

   Con vật có CẢ HAI chính là con "vừa lấy trứng vừa lấy thịt".

   Bỏ đói thì CHẾT — Cường đã chốt. Nhưng chết có báo trước: đói là ốm ngay hôm
   đó (hiện rõ trên con vật), và phải đói liên tiếp `starveDays` ngày mới chết.
============================================================================ */

import type { Content, Entity, GameState } from "./types.ts";
import type { Draft } from "./state.ts";
import { dEntity, dStats, dTile, randInt, setInv, toastKey, toastText, touch } from "./state.ts";
import { addItem, canAdd, countItem, removeItem } from "./inventory.ts";
import { itemName } from "./items.ts";
import { animalDef, removeEntity } from "./entities.ts";
import { TILE, tileIndexAt } from "./world.ts";

/** Con vật đã trưởng thành chưa — chưa lớn thì chưa cho sản phẩm, chưa bán thịt được. */
export function isMature(e: Entity, content: Content): boolean {
  const def = animalDef(content, e.def);
  return !!def && e.animal.age >= def.matureDays;
}

/** Đang đói (hết no). Đói thì không lớn, không ra sản phẩm. */
export function isHungry(e: Entity): boolean {
  return e.animal.fed <= 0;
}

/** Chỉ số sản phẩm ĐANG tới lứa, hoặc -1. */
export function readyProduct(e: Entity, content: Content): number {
  const def = animalDef(content, e.def);
  if (!def || !isMature(e, content) || isHungry(e)) return -1;
  for (let i = 0; i < def.products.length; i++) {
    const p = def.products[i]!;
    if ((e.animal.prod[i] ?? 0) >= p.every * 1440) return i;
  }
  return -1;
}

/** Con vật gần (x,y) trong tầm — UI và action dùng để biết bấm vào con nào. */
export function animalNear(
  s: GameState,
  x: number,
  y: number,
  maxTiles = 1.4,
): Entity | null {
  const cx = x * TILE + TILE / 2;
  const cy = y * TILE + TILE / 2;
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const e of s.entities) {
    if (e.map !== s.mapId) continue;
    // CHỈ vật nuôi. Người làm thuê cũng là thực thể và cũng đứng cạnh ô đang
    // làm — không lọc thì `doWork` tưởng mình đang đứng cạnh con bò rồi thoát
    // ra, và người làm đứng đực ra giữa ruộng cây chín. Nút ngữ cảnh của người
    // chơi cũng sẽ ghi "THU" khi chỉ vào một người làm.
    if (e.kind !== "animal") continue;
    const d = Math.hypot(e.x - cx, e.y - cy) / TILE;
    if (d <= maxTiles && d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ cho ăn */

/**
 * Cho con vật ở gần (x,y) ăn, tiêu một `feed` trong túi.
 *
 * Loài `feed: null` (gà, vịt) tự kiếm ăn quanh sân nên không cho ăn tay được —
 * báo rõ chứ không im lặng nuốt thao tác.
 */
export function feedAnimal(d: Draft, content: Content, x: number, y: number): boolean {
  const e = animalNear(d.s, x, y);
  if (!e) return false;
  const def = animalDef(content, e.def);
  if (!def) return false;
  if (!def.feed) {
    toastText(d, `${def.name} tự kiếm ăn quanh sân, không cần cho ăn.`, "info");
    return false;
  }
  if (e.animal.fed > def.fedMinutes * 0.6) {
    toastText(d, `${def.name} còn no.`, "info");
    return false;
  }
  if (countItem(d.s.inv, def.feed) <= 0) {
    toastText(d, `Không có ${itemName(def.feed, content)} trong túi.`, "bad");
    return false;
  }
  const left = removeItem(d.s.inv, def.feed, 1);
  if (!left) return false;
  setInv(d, left);

  const i = d.s.entities.indexOf(e);
  const m = dEntity(d, i);
  if (!m) return false;
  m.animal.fed = def.fedMinutes;
  m.animal.hungryDays = 0;
  toastText(d, `Đã cho ${def.name} ăn.`, "good");
  return true;
}

/* ------------------------------------------------------------- thu sản phẩm */

/** Thu sản phẩm đang tới lứa (sữa/trứng/lông) của con vật gần (x,y). */
export function gatherFrom(d: Draft, content: Content, x: number, y: number): boolean {
  const e = animalNear(d.s, x, y);
  if (!e) return false;
  const def = animalDef(content, e.def);
  if (!def) return false;

  const pi = readyProduct(e, content);
  if (pi < 0) {
    if (!isMature(e, content)) toastText(d, `${def.name} chưa lớn.`, "info");
    else if (isHungry(e)) toastText(d, `${def.name} đang đói, chưa cho gì được.`, "bad");
    else toastText(d, `${def.name} chưa tới lứa.`, "info");
    return false;
  }
  const p = def.products[pi]!;
  const r = randInt(d.s.seed, p.min, p.max);
  touch(d).seed = r.seed;
  const n = Math.max(1, r.v);
  if (!canAdd(d.s.inv, p.id, n)) {
    toastKey(d, content, "invFull", "bad");
    return false;
  }
  const add = addItem(d.s.inv, p.id, n);
  setInv(d, add.inv);

  const i = d.s.entities.indexOf(e);
  const m = dEntity(d, i);
  if (!m) return false;
  m.animal.prod[pi] = 0;

  const st = dStats(d);
  st.gathered = (st.gathered ?? 0) + add.added;
  toastText(d, `${itemName(p.id, content)} ×${add.added}`, "good");
  return true;
}

/* --------------------------------------------------------------- bán thịt */

/** Bán con vật lấy thịt. Chỉ được khi đã trưởng thành và loài có `meat`. */
export function slaughter(d: Draft, content: Content, x: number, y: number): boolean {
  const e = animalNear(d.s, x, y);
  if (!e) return false;
  const def = animalDef(content, e.def);
  if (!def) return false;
  if (!def.meat) {
    toastText(d, `Không bán ${def.name} lấy thịt được.`, "bad");
    return false;
  }
  if (!isMature(e, content)) {
    toastText(d, `${def.name} chưa lớn — bán bây giờ thì phí.`, "info");
    return false;
  }
  const r = randInt(d.s.seed, def.meat.min, def.meat.max);
  touch(d).seed = r.seed;
  const n = Math.max(1, r.v);
  if (!canAdd(d.s.inv, def.meat.id, n)) {
    toastKey(d, content, "invFull", "bad");
    return false;
  }
  const add = addItem(d.s.inv, def.meat.id, n);
  setInv(d, add.inv);
  removeEntity(d, e.id);
  toastText(d, `${itemName(def.meat.id, content)} ×${add.added}`, "good");
  return true;
}

/* ------------------------------------------------------------ sang ngày mới */

export interface AnimalNightReport {
  starved: number;
  hungry: number;
  born: number;
}

/**
 * Một đêm cho MỌI vật nuôi (mọi bản đồ).
 *
 * Thứ tự có ý nghĩa: tuổi tăng trước, rồi mới tiêu phần no còn lại của ngày, rồi
 * mới xét đói/chết. Nếu xét chết trước thì con vật vừa được cho ăn lúc chiều
 * cũng bị tính là đói cả ngày.
 *
 * Loài `feed: null` tự kiếm ăn: chúng không bao giờ đói CHẾT, chỉ đói tạm khi
 * quanh đó hết cỏ — đó là chủ ý, gà thả rông mà chết đói vì người chơi đi vắng
 * ba ngày thì vô lý.
 */
export function animalNight(
  d: Draft,
  content: Content,
  dayMinutes: number,
): AnimalNightReport {
  const rep: AnimalNightReport = { starved: 0, hungry: 0, born: 0 };
  const chet: number[] = [];

  for (let i = 0; i < d.s.entities.length; i++) {
    const cur = d.s.entities[i]!;
    const def = animalDef(content, cur.def);
    if (!def) continue;
    if (def.job === "pest") continue; // sâu bọ có vòng đời riêng

    const e = dEntity(d, i);
    if (!e) continue;

    e.animal.age += 1;

    // tiêu phần no còn lại của một ngày
    e.animal.fed = Math.max(0, e.animal.fed - dayMinutes);

    if (e.animal.fed <= 0) {
      if (def.feed === null) {
        // tự kiếm ăn: coi như đêm qua kiếm được, no lại một phần
        e.animal.fed = def.fedMinutes * 0.5;
      } else {
        e.animal.hungryDays += 1;
        rep.hungry++;
        if (e.animal.hungryDays >= def.starveDays) {
          chet.push(e.id);
          rep.starved++;
          continue;
        }
      }
    } else {
      e.animal.hungryDays = 0;
    }

    // Đói thì đồng hồ sản phẩm ĐỨNG — bỏ đói không mất con vật ngay, nhưng
    // cũng không được lấy gì. Đó mới là hình phạt thật.
    if (e.animal.fed > 0)
      for (let j = 0; j < e.animal.prod.length; j++)
        e.animal.prod[j] = (e.animal.prod[j] ?? 0) + dayMinutes;
  }

  for (const id of chet) removeEntity(d, id);
  return rep;
}

/* ----------------------------------------------------------------- sâu bọ */

/**
 * Sâu bọ ăn cây chín trong đêm.
 *
 * Chạy lúc sang ngày chứ không phải trong TICK: một con chuột phá ruộng là sự
 * kiện của ĐÊM, và làm ở đây thì TICK không phải gánh thêm gì.
 */
export function pestNight(d: Draft, content: Content): number {
  let hit = 0;
  for (let i = 0; i < d.s.entities.length; i++) {
    const cur = d.s.entities[i]!;
    const def = animalDef(content, cur.def);
    if (!def || def.job !== "pest") continue;
    if (cur.map !== d.s.mapId) continue;

    const tx = Math.floor(cur.x / TILE);
    const ty = Math.floor(cur.y / TILE);
    const ti = tileIndexAt(d.s, tx, ty);
    if (ti < 0) continue;
    const t = d.s.tiles[ti];
    if (!t?.crop) continue;
    const cd = content.crops[t.crop.id];
    if (!cd) continue;

    const m = dTile(d, ti);
    if (!m?.crop) continue;
    // Lùi một giai đoạn thay vì xoá sạch: mất một đêm công chăm, không mất cả vụ.
    if (m.crop.stage > 0) {
      m.crop.stage -= 1;
      m.crop.grow = 0;
    } else {
      m.crop = null;
    }
    hit++;
  }
  return hit;
}

/** Chó tuần tra: con sâu bọ nào lọt vào bán kính thì bị đuổi. */
export function patrolNight(d: Draft, content: Content): number {
  const dogs = d.s.entities.filter((e) => animalDef(content, e.def)?.job === "patrol");
  if (!dogs.length) return 0;
  const duoi: number[] = [];
  for (const e of d.s.entities) {
    const def = animalDef(content, e.def);
    if (!def || def.job !== "pest") continue;
    for (const dog of dogs) {
      if (dog.map !== e.map) continue;
      if (Math.hypot(dog.x - e.x, dog.y - e.y) / TILE <= 8) {
        duoi.push(e.id);
        break;
      }
    }
  }
  for (const id of duoi) removeEntity(d, id);
  return duoi.length;
}

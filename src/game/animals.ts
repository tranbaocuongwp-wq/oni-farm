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

import type { Content, Entity, GameState, PenDef } from "./types.ts";
import type { Draft, MapView } from "./state.ts";
import { dEntity, dStats, dTile, randInt, setInv, toastKey, toastText, touch } from "./state.ts";
import { addItem, canAdd } from "./inventory.ts";
import { itemName } from "./items.ts";
import { animalDef, removeEntity } from "./entities.ts";
import { TILE, tileIndexAt } from "./world.ts";
import { grazeNight } from "./graze.ts";
import { PHUT_MOI_DIEM, eatFromTroughNight, pourSpotIn, troughMax, troughStock } from "./pen.ts";

/**
 * Một NGÀY GAME dài bao nhiêu phút.
 *
 * `dayEndMinutes - dayStartMinutes` — đúng quãng đồng hồ chạy từ lúc thức tới
 * lúc ngã ra ngủ, và cũng đúng quãng mà `newDay` cộng bù cho mọi bản đồ. Trước
 * đây chu kỳ sản phẩm nhân với một hằng số cắm cứng 1440 trong khi một ngày chỉ
 * có 1200 phút, nên `every: 1` ("mỗi ngày") thật ra mất hai ngày và MỌI con số
 * cân bằng trong `actors.json` lệch 20 %.
 */
export function dayMinutes(content: Content): number {
  const bal = content.balance;
  return Math.max(1, bal.dayEndMinutes - bal.dayStartMinutes);
}

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
    if ((e.animal.prod[i] ?? 0) >= p.every * dayMinutes(content)) return i;
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

/* ------------------------------------------------------------- bảng thông tin */

/** Một dòng sản phẩm trên bảng: tên, còn bao lâu nữa, đã tới lứa chưa. */
export interface ProductLine {
  id: string;
  name: string;
  ready: boolean;
  /** Phút game còn lại tới lứa sau. 0 khi đã tới lứa. */
  minutesLeft: number;
  /** Cả một chu kỳ dài bao nhiêu phút game — để vẽ được THANH tiến độ.
   *  Không có nó thì UI chỉ nói được "còn 14 giờ", một câu phải đọc mới hiểu. */
  everyMinutes: number;
}

/** Mọi thứ người chơi cần biết về một con vật, ở dạng DỮ LIỆU thuần. */
export interface AnimalStats {
  /** Phân biệt với `WorkerCard` — cùng một tấm thẻ, hai loại nội dung. */
  kind: "animal";
  def: string;
  name: string;
  mature: boolean;
  /** Còn mấy ngày nữa thì lớn. 0 nếu đã lớn. */
  daysToMature: number;
  ageDays: number;
  /** 0..1 — phần no còn lại. */
  fed: number;
  hungry: boolean;
  hungryDays: number;
  /** Nhịn thêm mấy ngày nữa thì chết. -1 = loài tự kiếm ăn, không chết đói. */
  daysToStarve: number;
  /** Mọi món loài này ăn được. Rỗng = không cho ăn tay được. */
  feed: string[];
  products: ProductLine[];
  /** Thịt bán được, hoặc null. */
  meat: { id: string; min: number; max: number } | null;
}

/**
 * Bảng thống kê của một con vật.
 *
 * Thuần và ở tầng `game/` chứ không dựng thẳng trong HUD, vì hai lý do: nó phải
 * đọc đúng những con số mà `animalNight` dùng để quyết định sống chết (nếu HUD
 * tự diễn giải lại thì sớm muộn hai bên lệch nhau, và bảng sẽ nói dối), và như
 * thế thì test được thẳng trong Node.
 */
export function animalStats(e: Entity, content: Content): AnimalStats | null {
  const def = animalDef(content, e.def);
  if (!def) return null;
  const mature = isMature(e, content);
  const products: ProductLine[] = def.products.map((p, i) => {
    const need = p.every * dayMinutes(content);
    const has = e.animal.prod[i] ?? 0;
    return {
      id: p.id,
      name: itemName(p.id, content),
      // Chưa lớn hoặc đang đói thì KHÔNG tới lứa, dù đồng hồ đã đủ — đúng cùng
      // luật với `readyProduct`, chứ không phải một cách tính thứ hai.
      ready: mature && !isHungry(e) && has >= need,
      minutesLeft: Math.max(0, need - has),
      everyMinutes: need,
    };
  });
  return {
    kind: "animal",
    def: e.def,
    name: def.name,
    mature,
    daysToMature: Math.max(0, def.matureDays - e.animal.age),
    ageDays: e.animal.age,
    fed: def.fedMinutes > 0 ? Math.max(0, Math.min(1, e.animal.fed / def.fedMinutes)) : 1,
    hungry: isHungry(e),
    hungryDays: e.animal.hungryDays,
    daysToStarve: Math.max(0, def.starveDays - e.animal.hungryDays),
    feed: def.feed,
    products,
    meat: def.meat ? { id: def.meat.id, min: def.meat.min, max: def.meat.max } : null,
  };
}

/* --------------------------------------------------------------- dáng & cảm xúc */

/** Dáng đứng, đọc được từ xa. Tên thuần chuỗi vì `game/` không được biết `art/`. */
export type PoseName = "walk" | "eat" | "sleep";

/** Ký hiệu nổi trên đầu. `null` = không có gì đáng báo. */
export type EmoteName = "hungry" | "ready" | "love" | "sleep" | null;

/** Từ giờ này trở đi coi là ĐÊM — con vật nằm ngủ. 20:00. */
const NIGHT_FROM = 20 * 60;

/**
 * Con vật này đang ở dáng nào và có gì để báo.
 *
 * Ở `game/` chứ không ở renderer vì nó đọc ĐÚNG những con số quyết định luật
 * chơi (`isHungry`, `readyProduct`) — nếu renderer tự diễn giải lại thì bong
 * bóng "tới lứa" sẽ có ngày nói dối, mà nói dối đúng ở chỗ người chơi tin nhất.
 */
export function animalMood(
  s: GameState,
  content: Content,
  e: Entity,
): { pose: PoseName; emote: EmoteName } {
  const def = animalDef(content, e.def);
  const dem = s.minutes >= NIGHT_FROM || s.minutes < (content.balance.dayStartMinutes ?? 360);
  const dangDi = e.ai.path.length > 0;

  const pose: PoseName = dangDi ? "walk" : dem ? "sleep" : "eat";

  let emote: EmoteName = null;
  // Gà vịt cũng báo đói: từ khi cỏ là thức ăn thật thì chúng cũng chết đói
  // được, nên giấu tín hiệu đi là giấu đúng thứ người chơi cần biết.
  if (isHungry(e) && def) emote = "hungry";
  else if (readyProduct(e, content) >= 0) emote = "ready";
  // Vừa được cho ăn: `fed` gần đầy. Suy ra từ con số sẵn có thay vì thêm một
  // trường mốc-thời-gian vào save — trường mới thì phải migrate, mà cái này chỉ
  // để vui mắt trong vài phút game.
  else if (def && def.fedMinutes > 0 && e.animal.fed > def.fedMinutes * 0.94) emote = "love";
  else if (pose === "sleep") emote = "sleep";

  return { pose, emote };
}

/* ------------------------------------------------------------------ cho ăn */

/* CHO ĂN TRỰC TIẾP: ĐÃ BỎ (core 1.38).

   Luật Cường đặt: "cho động vật ăn là chỉ cho vào máng, hoặc là rải xuống hồ;
   còn lại các con vật sẽ dựa vào dữ liệu đó chúng nó tự ăn — không được bơm
   thức ăn trực tiếp."

   Nó đúng, và không chỉ vì thẩm mỹ. `feedAnimal` là một đường tắt bơm thẳng
   `fed = fedMinutes` vào một con vật, đi vòng qua toàn bộ hệ thống máng: cái
   máng có bao nhiêu phần, loài này ăn được món nào, con vật có tới được chỗ ăn
   không. Hai đường song song cùng làm một việc thì sớm muộn cũng lệch nhau —
   và đã lệch: đường máng hỏi `def.feed` chứa món ĐANG NẰM TRONG máng, đường
   trực tiếp thì lục cả túi tìm bất cứ món nào. Người chơi cho ăn kiểu này thì
   cái máng thành đồ trang trí.

   Giờ chỉ còn HAI cửa, và cả hai đều đổ vào cùng một chỗ dữ liệu:
     · `pourIntoTrough` — đổ vào máng khu cạn;
     · `feedPond`       — rắc xuống mặt nước hồ cá.
   Con vật đọc từ đó mà tự ăn (`eatFromTrough`, `eatFromTroughNight`). */

/* ------------------------------------------------------------- thu sản phẩm */

/** Thu sản phẩm đang tới lứa (sữa/trứng/lông) của con vật gần (x,y). */
export function gatherFrom(d: Draft, content: Content, x: number, y: number): boolean {
  const e = animalNear(d.s, x, y);
  if (!e) return false;
  return thuMotCon(d, content, e, true);
}

/**
 * Thu sản phẩm của ĐÚNG một con. Tách ra khỏi `gatherFrom` để bảng khu thu cả
 * đàn mà không phải dựng một đường thu thứ hai — hai đường thu là hai chỗ để
 * luật "chưa lớn / đang đói thì chưa tới lứa" lệch nhau.
 *
 * `noi` = có bắn thông báo giải thích khi KHÔNG thu được không. Thu cả đàn thì
 * tắt: ba mươi con chưa tới lứa là ba mươi dòng thông báo.
 */
function thuMotCon(d: Draft, content: Content, e: Entity, noi: boolean): boolean {
  const def = animalDef(content, e.def);
  if (!def) return false;

  const pi = readyProduct(e, content);
  if (pi < 0) {
    if (!noi) return false;
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
  if (noi) toastText(d, `${itemName(p.id, content)} ×${add.added}`, "good");
  return true;
}

/**
 * Thu HẾT sản phẩm tới lứa trong một khu. Trả về số con đã thu.
 *
 * Vì sao cần: một chuồng ba mươi con gà thì "thu trứng" là ba mươi lần đi tới
 * từng con và bấm — một việc vặt không có quyết định nào bên trong, đúng loại
 * việc mà một cú bấm phải làm thay.
 *
 * Gom id TRƯỚC rồi mới thu: `dEntity` thay cả mảng thực thể, nên duyệt thẳng
 * trên mảng cũ là duyệt trên dữ liệu đã lỗi thời ngay sau con đầu tiên.
 */
export function gatherPen(d: Draft, content: Content, penId: string): number {
  const ids = d.s.entities
    .filter(
      (e) =>
        e.kind === "animal" &&
        e.map === d.s.mapId &&
        content.animals[e.def]?.pen === penId &&
        readyProduct(e, content) >= 0,
    )
    .map((e) => e.id);
  let lay = 0;
  for (const id of ids) {
    const e = d.s.entities.find((q) => q.id === id);
    if (!e) continue;
    // Túi đầy thì DỪNG HẲN, không thử tiếp: con sau cũng đầy y như con trước,
    // và mỗi lần thử là một dòng "túi đầy" nữa.
    if (!thuMotCon(d, content, e, false)) {
      if (!canAdd(d.s.inv, content.animals[e.def]?.products[readyProduct(e, content)]?.id ?? "", 1)) break;
      continue;
    }
    lay++;
  }
  if (lay > 0) toastText(d, `Thu sản phẩm của ${lay} con.`, "good");
  else toastText(d, "Chưa con nào tới lứa.", "info");
  return lay;
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
 * Ở ĐÂY KHÔNG CÒN CỘNG TRỪ ĐỒNG HỒ NỮA. `fed` đi xuống và `prod` đi lên theo
 * THỜI GIAN THẬT, do `catchUpEntities` cộng: mỗi khung hình cho bản đồ đang
 * chơi, một lần lúc rời bản đồ cho bản đồ vừa bỏ lại, và một lần lúc sang ngày
 * cho phần còn thiếu của từng bản đồ. Bản cũ cộng ở CẢ HAI chỗ nên thời gian ở
 * bản đồ khác bị tính hai lần — ở lì trong nhà là một cách tăng sản lượng.
 *
 * Việc của hàm này giờ đúng bằng những gì chỉ xảy ra ở RANH GIỚI NGÀY: già thêm
 * một tuổi, và xét đói/chết.
 *
 * Thứ tự có ý nghĩa: tuổi tăng trước, rồi mới xét đói/chết. Con vật đói thì có
 * hai đường sống, theo đúng thứ tự này:
 *
 *   1. MÁNG trong khu của nó (`eatFromTroughNight`) — đường duy nhất của loài
 *      có chuồng, và nó không bao giờ phải rời khu để đi tìm;
 *   2. đi ăn cỏ (`grazeNight`) — chỉ loài `housing: "free"`.
 *
 * Đói mà không có đường nào thì `hungryDays` tăng, và quá `starveDays` thì chết.
 */
export function animalNight(
  d: Draft,
  content: Content,
  views: readonly MapView[],
): AnimalNightReport {
  const rep: AnimalNightReport = { starved: 0, hungry: 0, born: 0 };
  const chet: number[] = [];
  const luoi = new Map<string, MapView>();
  for (const v of views) luoi.set(v.id, v);

  for (let i = 0; i < d.s.entities.length; i++) {
    const cur = d.s.entities[i]!;
    const def = animalDef(content, cur.def);
    if (!def) continue;
    if (def.job === "pest") continue; // sâu bọ có vòng đời riêng

    const e = dEntity(d, i);
    if (!e) continue;

    e.animal.age += 1;

    if (e.animal.fed <= 0) {
      /* BỮA ĐÊM. Người chơi ngủ là cả đêm trôi qua trong một action, không có
         khung hình nào để con vật đi tới máng hay tới bãi cỏ — nên phải làm ở
         đây chứ không chỉ trong TICK.

         Máng trước, cỏ sau: đổ máng là công người chơi bỏ ra, nó phải hơn việc
         con vật tự đi kiếm. Và con có chuồng thì CHỈ có đường máng — nó không
         còn bị bốc qua rào đi tìm cỏ nữa (xem `grazeNight`). */
      const v = luoi.get(cur.map) ?? null;
      const an = v ? eatFromTroughNight(d, content, v, i) || grazeNight(d, content, v, i) : false;
      if (!an) {
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

/**
 * Chó tuần tra BẮT TẠI CHỖ — chạy mỗi bước quyết định, ban ngày lẫn ban đêm.
 *
 * Trước đây chó chỉ đuổi được sâu bọ trong `patrolNight`, tức đúng một lần lúc
 * người chơi đi ngủ. Ban ngày nó đuổi theo con chuột, dí sát tận nơi, đứng đè
 * lên nhau — rồi không có gì xảy ra. Nhìn thì như con chó bị hỏng.
 *
 * Gom id rồi mới xoá: `removeEntity` cắt mảng, mà hàm gọi nó đang duyệt mảng ấy
 * theo CHỈ SỐ. Xoá giữa vòng lặp là cách chắc chắn nhất để nhảy cóc mất một con.
 */
export function patrolCatch(d: Draft, content: Content): number {
  const dogs = d.s.entities.filter(
    (e) => e.map === d.s.mapId && animalDef(content, e.def)?.job === "patrol",
  );
  if (!dogs.length) return 0;
  const bat: number[] = [];
  for (const e of d.s.entities) {
    if (e.map !== d.s.mapId) continue;
    if (animalDef(content, e.def)?.job !== "pest") continue;
    for (const dog of dogs) {
      // 1,5 ô: đủ rộng để "chạm là bắt" không bị hụt vì hai con dừng lệch nhau
      // nửa ô, đủ hẹp để vẫn phải đuổi tới nơi chứ không bắt từ xa.
      if (Math.hypot(dog.x - e.x, dog.y - e.y) / TILE <= 1.5) {
        bat.push(e.id);
        break;
      }
    }
  }
  for (const id of bat) removeEntity(d, id);
  if (bat.length) toastText(d, `Chó đuổi được ${bat.length} con phá hoại.`, "good");
  return bat.length;
}

/** Chó tuần tra: quét đêm, bán kính rộng hơn — thứ mà con chó "canh nhà" làm
 *  được kể cả khi người chơi không nhìn. */
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

/* ---------------------------------------------------------------- BẢNG KHU */

/**
 * Khu mà (x,y) đang ở TRONG hoặc SÁT.
 *
 * "Sát" là điều kiện thật chứ không phải nới lỏng cho dễ bấm: cái ao thì người
 * chơi KHÔNG bao giờ đứng được ở trong, chỉ đứng bờ; còn chuồng thì đứng ngoài
 * rào nhìn vào vẫn là "đang ở chỗ cái chuồng". Nên một ô đệm quanh khu chính là
 * ranh giới đúng, không phải một hằng số tuỳ tiện.
 */
export function penNear(
  state: GameState,
  content: Content,
  x: number,
  y: number,
  dem = 1,
): PenDef | null {
  let best: PenDef | null = null;
  let bestD = Infinity;
  for (const p of content.tiles.pens ?? []) {
    if (p.map !== state.mapId) continue;
    const dx = Math.max(p.x - x, 0, x - (p.x + p.w - 1));
    const dy = Math.max(p.y - y, 0, y - (p.y + p.h - 1));
    const d = Math.max(dx, dy);
    if (d > dem) continue;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** Một dòng trong bảng khu: gộp theo LOÀI, vì người chơi đếm theo loài. */
export interface PenLine {
  def: string;
  name: string;
  n: number;
  doi: number;
  toiLua: number;
  chuaLon: number;
}

/** Một CON trong bảng khu — người chơi bấm vào để mở thẻ của đúng con đó. */
export interface PenAnimal {
  id: number;
  def: string;
  name: string;
  ageDays: number;
  /** 0..1 — độ no. */
  fed: number;
  hungry: boolean;
  mature: boolean;
  toiLua: boolean;
  x: number;
  y: number;
}

export interface PenSummary {
  id: string;
  name: string;
  swim: boolean;
  n: number;
  doi: number;
  toiLua: number;
  loai: PenLine[];
  /** Từng con, xếp việc-gấp-trước: đói → tới lứa → còn lại. */
  con: PenAnimal[];
  /** Máng của khu, hoặc null (ao và khu không khai `feeds` thì không có). */
  mang: { x: number; y: number; n: number; max: number } | null;
  /** Máng còn nuôi được cả đàn bao nhiêu NGÀY, hoặc null (không máng / không con). */
  ngay: number | null;
  feeds: string[];
}

/**
 * Một con ăn hết bao nhiêu ĐIỂM một ngày.
 *
 * Suy thẳng từ luật ăn, không phải một hằng số đoán: một điểm làm no
 * `PHUT_MOI_DIEM` phút, nên một ngày game cần đúng `dayMinutes / PHUT_MOI_DIEM`
 * điểm. Đổi `PHUT_MOI_DIEM` hay độ dài ngày qua OTA thì con số "còn ~N ngày"
 * trên bảng khu tự đúng theo, không phải sửa ở hai nơi.
 */
export function diemMoiNgay(content: Content): number {
  return dayMinutes(content) / PHUT_MOI_DIEM;
}

/**
 * Tóm tắt một khu: bao nhiêu con, mấy con đói, mấy con tới lứa, máng còn mấy phần.
 *
 * Thuần và không chạm DOM — UI chỉ việc in ra. Đây là câu trả lời cho câu hỏi
 * người chơi thật sự hỏi khi đi ngang cái chuồng: "có việc gì phải làm ở đây
 * không?". Trước đây muốn biết phải bấm vào TỪNG con một.
 */
export function penSummary(state: GameState, content: Content, pen: PenDef): PenSummary {
  const gom = new Map<string, PenLine>();
  const con: PenAnimal[] = [];
  let n = 0;
  let doi = 0;
  let toiLua = 0;
  for (const e of state.entities) {
    if (e.kind !== "animal" || e.map !== state.mapId) continue;
    const def = content.animals[e.def];
    if (!def || def.pen !== pen.id) continue;
    let row = gom.get(e.def);
    if (!row) {
      row = { def: e.def, name: def.name, n: 0, doi: 0, toiLua: 0, chuaLon: 0 };
      gom.set(e.def, row);
    }
    row.n++;
    n++;
    if (isHungry(e)) {
      row.doi++;
      doi++;
    }
    if (readyProduct(e, content) >= 0) {
      row.toiLua++;
      toiLua++;
    }
    if (!isMature(e, content)) row.chuaLon++;
    con.push({
      id: e.id,
      def: e.def,
      name: def.name,
      ageDays: e.animal.age,
      fed: def.fedMinutes > 0 ? Math.max(0, Math.min(1, e.animal.fed / def.fedMinutes)) : 1,
      hungry: isHungry(e),
      mature: isMature(e, content),
      toiLua: readyProduct(e, content) >= 0,
      x: Math.floor(e.x / TILE),
      y: Math.floor(e.y / TILE),
    });
  }
  const m = pourSpotIn(state, content, pen);
  const mang = m ? { x: m.x, y: m.y, n: troughStock(state, m.x, m.y), max: troughMax(content) } : null;
  /* Xếp theo VIỆC PHẢI LÀM, không theo thứ tự sinh ra: con đói lên đầu, rồi con
     tới lứa. Bảng dài ba mươi dòng mà dòng đáng bấm nằm ở giữa thì nó không
     khác gì bảng cũ. */
  const hang = (a: PenAnimal) => (a.hungry ? 0 : a.toiLua ? 1 : a.mature ? 2 : 3);
  con.sort((a, b) => hang(a) - hang(b) || a.id - b.id);
  return {
    id: pen.id,
    name: pen.name,
    swim: !!pen.swim,
    n,
    doi,
    toiLua,
    loai: [...gom.values()].sort((a, b) => b.n - a.n),
    con,
    mang,
    ngay: mang && n > 0 ? mang.n / (n * diemMoiNgay(content)) : null,
    feeds: pen.feeds ?? [],
  };
}

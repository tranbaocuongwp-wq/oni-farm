/* ============================================================================
   NEWDAY — chuyển ngày. Thứ tự các bước ở đây là HỢP ĐỒNG, đừng đảo:

     1. day++ , minutes = dayStartMinutes
     2. thu tiền income + tính tổng điện sinh ra (power)
     3. tưới tự động (waterRadius / autoWet) — ĐÁNH DẤU TRƯỚC
     4. cây lớn lên: cộng nốt phần ban ngày còn lại cho các ô `wet`
     5. làm khô: ô không được tưới tự động thì wet = false
        5b. cỏ dại mọc lan, đất cày bỏ không thì hoang trở lại
     6. drone thu hoạch, tiêu điện từ quỹ `power`, duyệt theo chỉ số ô tăng dần
     7. hồi năng lượng
     8. đánh giá progression

   Bước 3 phải trước bước 4, nếu không thì vòi tưới luôn chậm một ngày.

   NHIỀU BẢN ĐỒ: ngủ trong nhà thì ngoài ruộng vẫn phải lớn, vẫn phải được vòi
   tưới tưới, vẫn phải khô đi và mọc cỏ. Nên mọi bước ở đây chạy trên MỌI bản đồ
   (`mapViews`), không chỉ bản đồ đang đứng. Bước 2 gom điện của cả thế giới vào
   MỘT quỹ, rồi bước 6 tiêu chung — lưới điện chỉ có một.

   Ngược lại, TICK (mỗi khung hình) chỉ gọi `growCrops`, và hàm đó chỉ đụng bản
   đồ ĐANG chơi. Bản đồ đã cất chỉ được quét đúng một lần mỗi đêm.
============================================================================ */

import type { Content } from "./types.ts";
import type { Draft, MapView } from "./state.ts";
import {
  activeView,
  applyProgression,
  dStoredMap,
  mapViews,
  nextRandom,
  randInt,
  toastKey,
  touch,
} from "./state.ts";
import { harvestTileIn } from "./actions.ts";
import { idx, playerOverlapsTile, propDef, weedProp } from "./world.ts";
import type { NightWeather } from "./weather.ts";
import { autoWetSet, isOutdoor, nightWeatherOf, rollWeather, stormNight, weatherDef } from "./weather.ts";
import { diseaseNight } from "./disease.ts";
import { animalNight, patrolNight, pestNight } from "./animals.ts";
import { spawnEntity } from "./entities.ts";
import { payWages, restWorkers } from "./workers.ts";
import {
  cropInSeason,
  isLastDayOfSeason,
  seasonGrowMul,
  seasonIndex,
  seasonOfDay,
  tileAllSeason,
} from "./season.ts";

/* ---------------------------------------------------------- tăng trưởng */

/**
 * Cộng `minutes` PHÚT GAME BAN NGÀY vào mọi ô ẩm có cây chưa chín, và đẩy sang
 * giai đoạn sau khi đủ ngưỡng `growthDays[stage] * growthMinutesPerDay`.
 *
 * Đây là trái tim của luật "cây lớn theo THỜI GIAN": TICK gọi nó mỗi khung hình
 * với phần ban ngày vừa trôi qua, còn `newDay` gọi một phát cho phần ban ngày
 * còn lại của hôm nay. Cộng lại đúng bằng nhau, nên đi ngủ sớm không thiệt.
 *
 * Hiệu năng: chỉ đụng vào ô CÓ CÂY và chỉ copy ô thật sự đổi — không ô nào đổi
 * thì draft vẫn sạch và `reduce` trả về đúng state cũ.
 */
export function growCropsIn(v: MapView, content: Content, minutes: number, growMul = 1): void {
  if (!Number.isFinite(minutes) || minutes <= 0) return;
  minutes = minutes * Math.max(0, growMul);
  if (minutes <= 0) return;
  const per = Math.max(1, content.balance.growthMinutesPerDay);
  const n = v.w * v.h;
  for (let i = 0; i < n; i++) {
    const t = v.tiles[i];
    if (!t || !t.crop || !t.wet || t.crop.sick) continue;
    const def = content.crops[t.crop.id];
    if (!def) continue;
    let stage = t.crop.stage;
    if (stage >= def.growthDays.length) continue; // đã chín, đứng yên
    let grow = (Number.isFinite(t.crop.grow) ? t.crop.grow : 0) + minutes;
    while (stage < def.growthDays.length) {
      const need = Math.max(1, (def.growthDays[stage] ?? 1) * per);
      if (grow < need) break;
      grow -= need;
      stage += 1;
    }
    if (stage >= def.growthDays.length) {
      stage = def.growthDays.length;
      grow = 0;
    }
    const m = v.edit(i);
    if (!m || !m.crop) continue;
    m.crop.stage = stage;
    m.crop.grow = grow;
  }
}

/** Tăng trưởng trên bản đồ ĐANG chơi. Đây là thứ TICK gọi mỗi khung hình —
 *  cố ý KHÔNG chạm tới bản đồ đã cất. */
export function growCrops(d: Draft, content: Content, minutes: number): void {
  // Cùng công thức với ban đêm (nightWeatherOf): thời tiết NHÂN với mùa.
  growCropsIn(
    activeView(d),
    content,
    minutes,
    weatherDef(d.s, content).growMul * seasonGrowMul(d.s, content),
  );
}

/* --------------------------------------------- cỏ mọc / đất cày bỏ hoang */

/**
 * Một đêm trôi qua trên mặt đất của MỘT bản đồ:
 *   · ô cỏ TRỐNG kề một ô có `decor: "tuft"` thì có `grassSpreadChance` mọc cỏ dại;
 *   · ô đã cày mà BỎ KHÔNG thì có `tilledDecayChance` trở lại thành cỏ.
 *
 * Ngẫu nhiên rút từ `state.seed` nên tái lập được. Ô người chơi đang đứng đè
 * lên thì không mọc gì — không ai bị nhốt trong bụi cỏ lúc đang ngủ (chỉ có
 * nghĩa trên bản đồ đang chơi; ở bản đồ khác thì người chơi không ở đó).
 */
function nightGround(d: Draft, content: Content, v: MapView, growMul: number): void {
  const bal = content.balance;
  const spreadChance = Number.isFinite(bal.grassSpreadChance) ? bal.grassSpreadChance : 0;
  const decayChance = Number.isFinite(bal.tilledDecayChance) ? bal.tilledDecayChance : 0;
  const weed = weedProp(content);
  const w = v.w;
  const h = v.h;
  const gm = Math.max(0, growMul);

  // ---- vật thể LỚN theo ngày và LAN sang ô kề ----------------------------
  // Chụp danh sách "ai lan" trước khi sửa, để cỏ vừa mọc đêm nay không lan
  // tiếp ngay trong cùng đêm. Duyệt theo chỉ số tăng dần: tất định.
  const spreaders: { x: number; y: number; into: string; chance: number }[] = [];
  const n0 = w * h;
  for (let i = 0; i < n0; i++) {
    const t = v.tiles[i];
    if (!t || !t.prop) continue;
    const pd = propDef(content, t.prop);
    if (!pd) continue;
    const x = i % w;
    const y = (i - x) / w;
    if (pd.spread && pd.spread.chance > 0)
      spreaders.push({ x, y, into: pd.spread.into, chance: Math.min(1, pd.spread.chance * gm) });
    if (pd.grow) {
      const age = (Number.isFinite(t.age) ? (t.age as number) : 0) + gm;
      if (age >= pd.grow.days) {
        const next = propDef(content, pd.grow.to);
        const m = v.edit(i);
        if (m) {
          m.prop = next ? next.id : null;
          m.hp = next ? Math.max(0, Math.floor(next.hits ?? 0)) : 0;
          delete m.age;
        }
      } else {
        const m = v.edit(i);
        if (m) m.age = age;
      }
    }
  }
  for (const sp of spreaders) {
    const into = propDef(content, sp.into);
    if (!into) continue;
    // một ô kề (4 hướng) ngẫu nhiên; ô đó phải là cỏ trống
    const r = nextRandom(d.s.seed);
    touch(d).seed = r.seed;
    if (r.v >= sp.chance) continue;
    const pick = nextRandom(d.s.seed);
    touch(d).seed = pick.seed;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
    const [dx, dy] = dirs[Math.floor(pick.v * 4) % 4]!;
    const nx = sp.x + dx;
    const ny = sp.y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    const j = idx(w, nx, ny);
    const tt = v.tiles[j];
    if (!tt || tt.g !== "grass" || tt.prop !== null || tt.b !== null || tt.crop !== null || tt.tilled) continue;
    if (v.active && playerOverlapsTile(d.s, nx, ny)) continue;
    const m = v.edit(j);
    if (m) {
      m.prop = into.id;
      m.hp = Math.max(0, Math.floor(into.hits ?? 0));
    }
  }

  const hasTuftNeighbour = (x: number, y: number): boolean => {
    for (let ny = y - 1; ny <= y + 1; ny++) {
      for (let nx = x - 1; nx <= x + 1; nx++) {
        if ((nx === x && ny === y) || nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (v.tiles[idx(w, nx, ny)]?.decor === "tuft") return true;
      }
    }
    return false;
  };

  const n = w * h;
  for (let i = 0; i < n; i++) {
    const t = v.tiles[i];
    if (!t) continue;
    const x = i % w;
    const y = (i - x) / w;

    // đất cày bỏ không → cỏ mọc lại
    if (t.tilled && !t.crop && t.b === null) {
      if (decayChance > 0) {
        const r = nextRandom(d.s.seed);
        touch(d).seed = r.seed;
        if (r.v < decayChance) {
          const m = v.edit(i);
          if (m) {
            m.tilled = false;
            m.wet = false;
          }
        }
      }
      continue;
    }

    // cỏ dại lan sang ô cỏ trống bên cạnh
    if (
      weed &&
      spreadChance > 0 &&
      t.g === "grass" &&
      t.prop === null &&
      t.b === null &&
      t.crop === null &&
      !t.tilled &&
      !(v.active && playerOverlapsTile(d.s, x, y)) &&
      hasTuftNeighbour(x, y)
    ) {
      const r = nextRandom(d.s.seed);
      touch(d).seed = r.seed;
      if (r.v < spreadChance) {
        const m = v.edit(i);
        if (m) {
          m.prop = weed.id;
          m.hp = Math.max(0, Math.floor(weed.hits ?? 0));
        }
      }
    }
  }
}

/** Ngủ sau mốc này (phút trong ngày) coi là ngủ muộn → lateSleepPenalty.
 *  1440 = 24:00. dayEndMinutes mặc định 1560 (26:00) nên khoảng 24:00–26:00
 *  là "ngủ muộn", còn quá 26:00 là ngất. */
export const LATE_SLEEP_MINUTES = 1440;

export interface NewDayOptions {
  /** true = ngất vì quá giờ (TICK), false = chủ động đi ngủ. */
  passedOut: boolean;
}

/* ------------------------------------------------- các bước trên MỘT bản đồ */

/** Tiền + điện của một bản đồ. Chỉ ĐỌC, không sửa gì. */
function collectPower(content: Content, v: MapView): { income: number; power: number } {
  let income = 0;
  let power = 0;
  const n = v.w * v.h;
  for (let i = 0; i < n; i++) {
    const t = v.tiles[i];
    if (!t || !t.b) continue;
    const def = content.buildings[t.b];
    if (!def) continue;
    income += def.effects.income ?? 0;
    power += def.power?.produce ?? 0;
  }
  return { income, power };
}

/** Bước 3+4+5+5b cho một bản đồ: tưới tự động → cây lớn → làm khô → đêm xuống. */
interface NightReport {
  sick: number;
  stormCrops: number;
  felled: number;
}

/**
 * Sang mùa: cây TRÁI MÙA mà CHƯA CHÍN thì héo, mất trắng.
 *
 * Hai chỗ cố ý nới tay, vì mục đích của mùa là bắt người chơi TÍNH TRƯỚC chứ
 * không phải để phạt:
 *   · Cây ĐÃ CHÍN thì tha — mất giống và mất công chăm đã đủ đau; cướp nốt vụ
 *     đang chờ gặt chỉ làm người chơi hậm hực chứ không dạy được gì.
 *   · Ô có `allSeason` (sàn nhà kính) miễn nhiễm — nhờ vậy một công trình vốn
 *     chỉ để khỏi phải tưới bỗng thành thứ đáng để dành tiền mua.
 * Và người chơi luôn được báo trước một ngày (xem toast `seasonLast`).
 */
function witherOutOfSeason(d: Draft, content: Content, v: MapView): number {
  let n = 0;
  const total = v.w * v.h;
  for (let i = 0; i < total; i++) {
    const t = v.tiles[i];
    if (!t || !t.crop) continue;
    if (tileAllSeason(t, content)) continue;
    const def = content.crops[t.crop.id];
    if (!def) continue;
    if (t.crop.stage >= def.growthDays.length) continue; // đã chín thì tha
    if (cropInSeason(t.crop.id, d.s.day, content)) continue; // vẫn hợp mùa mới
    const m = v.edit(i);
    if (m) {
      m.crop = null;
      n++;
    }
  }
  return n;
}

/** Bước 3+4+5+5b cho một bản đồ: tưới tự động → cây lớn → bệnh/bão → làm khô → đêm xuống.
 *
 *  `yesterday` là thời tiết của ngày VỪA QUA (đêm nay nối tiếp nó): cây lớn
 *  theo growMul của nó, bão của nó quật; còn `today` là ngày mới vừa rút —
 *  mưa hôm nay làm ướt ruộng sáng nay. */
function nightOnMap(
  d: Draft,
  content: Content,
  v: MapView,
  daylightLeft: number,
  yesterday: NightWeather,
  todayWet: boolean,
  rep: NightReport,
): void {
  const n = v.w * v.h;
  const outdoor = isOutdoor(content, v.id);

  // ---- 3. tưới tự động (đánh dấu trước khi cây lớn) ----------------------
  const autoWet = autoWetSet(v, content);
  for (const i of autoWet) {
    const t = v.tiles[i];
    if (t && !t.wet) {
      const m = v.edit(i);
      if (m) m.wet = true;
    }
  }

  // ---- 4. cây lớn lên: cộng nốt phần BAN NGÀY còn lại của hôm nay --------
  // Trong ngày, TICK đã cộng dần từng phút cho ô ẩm của bản đồ đang chơi. Đi
  // ngủ là bỏ qua quãng còn lại tới lúc trời tối, nên cộng cho đủ ở đây — ngủ
  // sớm không bị thiệt, mà ban ngày vẫn thấy cây nhích lên trông thấy.
  growCropsIn(v, content, daylightLeft, yesterday.growMul);

  // ---- 4b. bệnh lan trong đêm; 4c. bão quật -----------------------------
  rep.sick += diseaseNight(d, content, v, yesterday.diseaseMul);
  if (yesterday.storm && outdoor) {
    const got = stormNight(d, content, v, yesterday.storm);
    rep.stormCrops += got.crops;
    rep.felled += got.felled;
  }

  // ---- 5. làm khô — trừ khi đêm qua trời ướt (mưa qua đêm giữ ẩm) --------
  if (!(yesterday.wet && outdoor)) {
    for (let i = 0; i < n; i++) {
      const t = v.tiles[i];
      if (!t || !t.wet) continue;
      if (autoWet.has(i)) continue;
      const m = v.edit(i);
      if (m) m.wet = false;
    }
  }

  // ---- 5c. sáng nay mưa: mọi ô đã cày ngoài trời ẩm sẵn ------------------
  if (todayWet && outdoor) {
    for (let i = 0; i < n; i++) {
      const t = v.tiles[i];
      if (!t || !t.tilled || t.wet || t.prop !== null) continue;
      const m = v.edit(i);
      if (m) m.wet = true;
    }
  }

  // ---- 5b. cỏ mọc lan, đất cày bỏ không thì hoang trở lại ----------------
  nightGround(d, content, v, yesterday.growMul);
}

/** Bước 6 cho một bản đồ. `budget` là quỹ điện CHUNG của cả thế giới; trả về
 *  phần còn lại sau khi các drone trên bản đồ này ăn xong. */
function dronesOnMap(
  d: Draft,
  content: Content,
  v: MapView,
  budget: number,
  warned: { noPower: boolean; full: boolean },
): number {
  const w = v.w;
  const h = v.h;
  const n = w * h;
  let left = budget;
  for (let i = 0; i < n; i++) {
    const t = v.tiles[i];
    if (!t || !t.b) continue;
    const def = content.buildings[t.b];
    if (!def) continue;
    const r = def.effects.harvestRadius ?? 0;
    if (r <= 0) continue;
    const need = def.power?.consume ?? 0;
    if (need > left) {
      if (!warned.noPower) {
        toastKey(d, content, "droneNoPower", "bad");
        warned.noPower = true;
      }
      continue;
    }
    left -= need;

    const bx = i % w;
    const by = (i - bx) / w;
    for (let y = by - r; y <= by + r; y++) {
      for (let x = bx - r; x <= bx + r; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const j = idx(w, x, y);
        const tt = v.tiles[j];
        if (!tt || !tt.crop) continue;
        const cd = content.crops[tt.crop.id];
        if (!cd || tt.crop.stage < cd.growthDays.length) continue;
        // Drone ở bản đồ khác vẫn đổ đồ vào ĐÚNG một cái túi.
        const res = harvestTileIn(d, content, v, j, false);
        if (res.overflow > 0 && !warned.full) {
          toastKey(d, content, "invFull", "bad");
          warned.full = true;
        }
      }
    }
  }
  return left;
}

/** Trần số sâu bọ cùng lúc — đủ để thấy đau, không đủ để thành dịch. */
const MAX_PESTS = 8;

/**
 * Sinh chuột/sóc về đêm, TỈ LỆ THUẬN với số cây đang chín ngoài ruộng.
 *
 * Ruộng trống thì không có con nào — không ai muốn bị quấy khi chưa trồng gì.
 * Ruộng đầy cây chín mà bỏ đó qua đêm thì trả giá, và đó là lý do để nuôi chó.
 * Rút từ `state.seed` (SỰ KIỆN, một lần mỗi đêm) chứ không phải mỗi khung hình.
 */
function spawnPests(d: Draft, content: Content): void {
  const loai = content.animalOrder.filter((id) => content.animals[id]?.job === "pest");
  if (!loai.length) return;

  const dangCo = d.s.entities.filter((e) => content.animals[e.def]?.job === "pest").length;
  if (dangCo >= MAX_PESTS) return;

  // đếm cây chín trên bản đồ đang chơi
  let chin = 0;
  for (const t of d.s.tiles) {
    if (!t.crop) continue;
    const cd = content.crops[t.crop.id];
    if (cd && t.crop.stage >= cd.growthDays.length) chin++;
  }
  if (chin < 3) return;

  const muon = Math.min(MAX_PESTS - dangCo, Math.floor(chin / 6) + 1);
  for (let k = 0; k < muon; k++) {
    const r1 = nextRandom(d.s.seed);
    touch(d).seed = r1.seed;
    if (r1.v > 0.5) continue; // không phải đêm nào cũng có

    const r2 = randInt(d.s.seed, 0, loai.length - 1);
    touch(d).seed = r2.seed;
    const rx = randInt(d.s.seed, 1, d.s.w - 2);
    touch(d).seed = rx.seed;
    const ry = randInt(d.s.seed, 1, d.s.h - 2);
    touch(d).seed = ry.seed;

    const i = idx(d.s.w, rx.v, ry.v);
    const t = d.s.tiles[i];
    if (!t || t.prop || t.b) continue;
    spawnEntity(d, content, {
      def: loai[r2.v]!,
      map: d.s.mapId,
      x: rx.v * 16 + 8,
      y: ry.v * 16 + 8,
    });
  }
}

export function newDay(d: Draft, content: Content, opts: NewDayOptions): void {
  const bal = content.balance;
  const sleptAt = d.s.minutes;

  // ---- 1. sang ngày mới -------------------------------------------------
  // Thời tiết của ngày VỪA QUA quyết định đêm nay (cây lớn bao nhiêu, bão có
  // quật không); rồi mới rút ngày mới, vì mưa sáng nay làm ướt ruộng sáng nay.
  const yesterday = nightWeatherOf(d.s, content);

  const s0 = touch(d);
  s0.day = s0.day + 1;
  s0.minutes = bal.dayStartMinutes;
  s0.sleeping = false;
  // Ngủ dậy là hết bận — không mang thao tác dở dang sang ngày mới.
  s0.busy = 0;
  s0.pending = null;

  // ---- 1b. thời tiết hôm nay ---------------------------------------------
  rollWeather(d, content);
  const todayWet = weatherDef(d.s, content).wet;

  // Lấy cửa sổ cho MỌI bản đồ đúng một lần, theo thứ tự tất định.
  const views = mapViews(d, content);

  // ---- 2. thu nhập + điện (gộp cả thế giới) -----------------------------
  let income = 0;
  let power = 0;
  for (const v of views) {
    const got = collectPower(content, v);
    income += got.income;
    power += got.power;
  }
  if (income !== 0) touch(d).money = d.s.money + income;

  // ---- 2b. trả lương người làm ------------------------------------------
  // Cùng bước tiền tệ với thu nhập, và PHẢI trước bước 8: nếu trả sau, mốc mở
  // khoá theo `money` sẽ tính bằng số tiền chưa trừ lương.
  payWages(d, content);

  // ---- 3..5b trên từng bản đồ -------------------------------------------
  //
  // Mỗi bản đồ có mốc riêng: bản đồ đang đứng đã được TICK nuôi tới tận lúc đi
  // ngủ, nên chỉ còn thiếu phần từ `sleptAt`; bản đồ đã cất thì đứng hình từ
  // lúc bị cất, nên phải tính từ `awayAt`. Dùng chung một mốc cho cả hai là
  // cách làm cho "ở lì trong nhà" âm thầm phạt cây ngoài ruộng.
  const dawn = bal.daylightEndMinutes;
  const rep: NightReport = { sick: 0, stormCrops: 0, felled: 0 };
  for (const v of views) {
    const from = v.active ? sleptAt : (d.s.maps?.[v.id]?.awayAt ?? sleptAt);
    nightOnMap(d, content, v, Math.max(0, dawn - Math.min(from, dawn)), yesterday, todayWet, rep);
  }
  // ---- 5c. sang mùa ------------------------------------------------------
  // Chạy SAU khi cây lớn xong đêm nay: cây vừa kịp chín trong đêm cuối mùa thì
  // được tha, đúng như lời hứa "không bao giờ mất một vụ đã công cốc".
  if (seasonIndex(d.s.day, content) !== seasonIndex(d.s.day - 1, content)) {
    let withered = 0;
    for (const v of views) withered += witherOutOfSeason(d, content, v);
    const now = seasonOfDay(d.s.day, content);
    if (now) toastKey(d, content, "seasonNew", "info", now.name);
    if (withered > 0) toastKey(d, content, "seasonWither", "bad", `×${withered}`);
  } else if (isLastDayOfSeason(d.s.day, content)) {
    // Báo trước đúng một ngày. Không có lời báo này thì luật "cây trái mùa sẽ
    // héo" chỉ là một cú mất trắng không hiểu vì sao.
    const next = seasonOfDay(d.s.day + 1, content);
    if (next) toastKey(d, content, "seasonLast", "info", next.name);
  }

  // ---- 5d. sâu bọ phá đêm, rồi chó tuần tra đuổi -------------------------
  // Đặt SAU cỏ dại (5b) và TRƯỚC drone (6): chuột ăn cây chín trước khi drone
  // ra gặt, nếu không thì con chuột chẳng bao giờ kịp phá gì.
  const anPha = pestNight(d, content);
  const daDuoi = patrolNight(d, content);
  if (anPha > 0) toastKey(d, content, "pestDamage", "bad", `×${anPha}`);
  if (daDuoi > 0) toastKey(d, content, "pestChased", "good", `×${daDuoi}`);

  // ---- 4d. vật nuôi: già thêm một ngày, tiêu phần no, đói lâu thì chết ----
  const thu = animalNight(d, content, bal.dayEndMinutes - bal.dayStartMinutes);
  if (thu.starved > 0) toastKey(d, content, "animalStarved", "bad", `×${thu.starved}`);
  else if (thu.hungry > 0) toastKey(d, content, "animalHungry", "bad", `×${thu.hungry}`);

  // ---- 5e. sinh sâu bọ mới nếu ruộng có cây chín --------------------------
  spawnPests(d, content);

  if (rep.stormCrops > 0) toastKey(d, content, "stormDamage", "bad", `×${rep.stormCrops}`);
  if (rep.felled > 0) toastKey(d, content, "stormFell", "bad", `×${rep.felled}`);
  if (rep.sick > 0) toastKey(d, content, "cropSick", "bad");

  // Sang ngày mới thì đồng hồ vắng mặt đặt lại về bình minh: chưa ai bước vào
  // bản đồ đó hôm nay, nên cả ngày mai lại là thời gian vắng mặt.
  for (const v of views) {
    if (v.active) continue;
    const m = dStoredMap(d, v.id);
    if (m) m.awayAt = bal.dayStartMinutes;
  }

  // ---- 6. drone (quỹ điện dùng chung, duyệt theo thứ tự bản đồ) ----------
  let budget = power;
  const warned = { noPower: false, full: false };
  for (const v of views) budget = dronesOnMap(d, content, v, budget, warned);

  // ---- 7. năng lượng -----------------------------------------------------
  const ratio = opts.passedOut
    ? bal.passOutEnergy
    : sleptAt >= LATE_SLEEP_MINUTES
      ? bal.lateSleepPenalty
      : bal.sleepRestore;
  const energy = Math.round(bal.energyMax * ratio);
  // Người làm cũng ngủ một đêm — hồi đầy cùng lúc với người chơi.
  restWorkers(d, content);
  touch(d).energy = Math.max(0, Math.min(bal.energyMax, energy));

  // ---- 8. progression ----------------------------------------------------
  applyProgression(d, content);
}

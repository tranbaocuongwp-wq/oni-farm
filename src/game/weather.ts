/* ============================================================================
   WEATHER — thời tiết theo ngày.

   Mỗi ngày đúng MỘT kiểu, rút thăm từ `state.seed` theo `weight` trong
   weather.json, nên cùng seed là cùng chuỗi ngày nắng/mưa. Ngày MAI được rút
   sẵn từ hôm nay (dự báo), sang ngày thì "ngày mai" thành "hôm nay" và rút tiếp.

   Core chỉ biết vài HỆ SỐ (wet/growMul/hot/diseaseMul/storm/streak); ý nghĩa
   "mưa", "bão" là của content. Thêm kiểu mới không phải sửa file này.
============================================================================ */

import type { Content, GameState, WeatherDef } from "./types.ts";
import type { Draft, MapView } from "./state.ts";
import { activeView, nextRandom, toastKey, touch } from "./state.ts";
import { propDef } from "./world.ts";

/** Định nghĩa kiểu thời tiết HÔM NAY. Kiểu lạ → kiểu đầu tiên của content. */
export function weatherDef(state: GameState, content: Content): WeatherDef {
  return content.weathers[state.weather?.today] ?? content.weathers[content.weatherFirst]!;
}

export function forecastDef(state: GameState, content: Content): WeatherDef {
  return content.weathers[state.weather?.tomorrow] ?? content.weathers[content.weatherFirst]!;
}

/**
 * Ảnh chụp thời tiết của NGÀY VỪA QUA — thứ quyết định những gì xảy ra trong
 * ĐÊM NAY (cây lớn bao nhiêu, bão có quật không, bệnh dễ lây tới đâu).
 *
 * Phải truyền tường minh chứ không được đọc lại `state.weather`: lúc `newDay`
 * xử lý đêm thì `rollWeather` ĐÃ lật sang thời tiết ngày mới rồi. Đọc ngầm là
 * đúng cái đã làm bão gần như không bao giờ gây hại — báo bão sáng nay, nhưng
 * tới đêm thì con số đem ra dùng lại là của ngày mai.
 */
export interface NightWeather {
  growMul: number;
  wet: boolean;
  storm: { cropChance: number } | null;
  diseaseMul: number;
}

/** Chụp lại thời tiết hiện tại để dùng cho đêm. Gọi TRƯỚC `rollWeather`. */
export function nightWeatherOf(state: GameState, content: Content): NightWeather {
  const def = weatherDef(state, content);
  return {
    growMul: def.growMul,
    wet: !!def.wet,
    storm: def.storm ?? null,
    diseaseMul: def.diseaseMul ?? 1,
  };
}

/** Bản đồ này ở ngoài trời không (mưa tưới được, bão quật được). */
export function isOutdoor(content: Content, mapId: string): boolean {
  return !(content.tiles.indoorMaps ?? []).includes(mapId);
}

/** Rút thăm một kiểu theo weight. Trả id và seed mới. */
function pickWeather(content: Content, seed: number): { id: string; seed: number } {
  let total = 0;
  for (const id of content.weatherOrder) total += Math.max(0, content.weathers[id]?.weight ?? 0);
  const r = nextRandom(seed);
  if (!(total > 0)) return { id: content.weatherFirst, seed: r.seed };
  let acc = r.v * total;
  for (const id of content.weatherOrder) {
    acc -= Math.max(0, content.weathers[id]?.weight ?? 0);
    if (acc < 0) return { id, seed: r.seed };
  }
  return { id: content.weatherOrder[content.weatherOrder.length - 1] ?? content.weatherFirst, seed: r.seed };
}

/**
 * Sang ngày: hôm nay = dự báo hôm qua; rút dự báo mới cho ngày mai.
 * Mưa dầm: nếu hôm nay có `streak`, ngày mai có `chance` vẫn giữ kiểu này,
 * miễn chưa quá `max` ngày liên tiếp.
 */
export function rollWeather(d: Draft, content: Content): void {
  const cur = d.s.weather;
  const today = content.weathers[cur.tomorrow] ? cur.tomorrow : content.weatherFirst;
  const todayDef = content.weathers[today]!;
  const wetStreak = todayDef.wet ? cur.wetStreak + 1 : 0;

  let seed = d.s.seed;
  let tomorrow: string;
  const streak = todayDef.streak;
  if (streak) {
    // chuỗi ngày CÙNG KIỂU: đếm bằng wetStreak khi kiểu này ướt, không thì
    // coi như ngày đầu — đủ cho mưa dầm, là thứ duy nhất content cần.
    const run = todayDef.wet ? wetStreak : 1;
    const r = nextRandom(seed);
    seed = r.seed;
    if (run < Math.max(1, streak.max) && r.v < streak.chance) tomorrow = today;
    else {
      const p = pickWeather(content, seed);
      tomorrow = p.id;
      seed = p.seed;
    }
  } else {
    const p = pickWeather(content, seed);
    tomorrow = p.id;
    seed = p.seed;
  }

  const s = touch(d);
  s.seed = seed;
  s.weather = { today, tomorrow, wetStreak, driedDay: 0 };

  if (todayDef.storm) toastKey(d, content, "stormMorning", "bad");
  else if (todayDef.wet) toastKey(d, content, "rainMorning", "info");
  else if (todayDef.fogUntil) toastKey(d, content, "fogMorning", "info");
}

/**
 * Nắng gắt làm khô ruộng giữa trưa. Chạy trong TICK với mốc phút trước/sau:
 * đúng một lần mỗi ngày, chỉ trên bản đồ đang chơi (bản đồ cất được `newDay`
 * lo — đêm xuống là khô hết như thường).
 */
export function weatherTick(d: Draft, content: Content, was: number, now: number): void {
  const def = weatherDef(d.s, content);
  if (!def.hot) return;
  const at = content.balance.noonDryMinutes ?? 780;
  if (!(was < at && now >= at)) return;
  if (d.s.weather.driedDay === d.s.day) return;
  if (!isOutdoor(content, d.s.mapId)) {
    touch(d).weather = { ...d.s.weather, driedDay: d.s.day };
    return;
  }
  const v = activeView(d);
  dryView(v, content);
  touch(d).weather = { ...d.s.weather, driedDay: d.s.day };
  toastKey(d, content, "hotNoon", "info");
}

/** Làm khô mọi ô ẩm không được công trình giữ ẩm/tưới tự động. */
export function dryView(v: MapView, content: Content): void {
  const n = v.w * v.h;
  const keep = autoWetSet(v, content);
  for (let i = 0; i < n; i++) {
    const t = v.tiles[i];
    if (!t || !t.wet || keep.has(i)) continue;
    const m = v.edit(i);
    if (m) m.wet = false;
  }
}

/** Tập ô được công trình tưới/giữ ẩm — dùng chung với newday. */
export function autoWetSet(v: MapView, content: Content): Set<number> {
  const w = v.w;
  const h = v.h;
  const n = w * h;
  const out = new Set<number>();
  for (let i = 0; i < n; i++) {
    const t = v.tiles[i];
    if (!t || !t.b) continue;
    const def = content.buildings[t.b];
    if (!def) continue;
    if (def.effects.autoWet) out.add(i);
    const r = def.effects.waterRadius ?? 0;
    if (r > 0) {
      const bx = i % w;
      const by = (i - bx) / w;
      for (let y = by - r; y <= by + r; y++) {
        for (let x = bx - r; x <= bx + r; x++) {
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          const j = y * w + x;
          const tt = v.tiles[j];
          if (!tt) continue;
          if (tt.prop !== null || tt.g === "water") continue;
          out.add(j);
        }
      }
    }
  }
  return out;
}

/**
 * Đêm bão trên một bản đồ ngoài trời: cây trồng có `cropChance` lùi một giai
 * đoạn (mầm thì mất luôn); vật thể có `stormFell` bị quật thành thứ khác.
 * Trả về số cây bị hại và số vật thể bị quật để newday gom một toast.
 */
export function stormNight(
  d: Draft,
  content: Content,
  v: MapView,
  storm: { cropChance: number },
): { crops: number; felled: number } {
  const out = { crops: 0, felled: 0 };
  const cropChance = Math.max(0, Math.min(1, storm.cropChance));
  const n = v.w * v.h;
  for (let i = 0; i < n; i++) {
    const t = v.tiles[i];
    if (!t) continue;
    if (t.crop && cropChance > 0) {
      const r = nextRandom(d.s.seed);
      touch(d).seed = r.seed;
      if (r.v < cropChance) {
        const m = v.edit(i);
        if (m && m.crop) {
          if (m.crop.stage <= 0) m.crop = null;
          else {
            m.crop.stage -= 1;
            m.crop.grow = 0;
          }
          out.crops++;
        }
      }
      continue;
    }
    if (t.prop) {
      const pd = propDef(content, t.prop);
      const fell = pd?.stormFell;
      if (!fell) continue;
      const r = nextRandom(d.s.seed);
      touch(d).seed = r.seed;
      if (r.v < fell.chance) {
        const next = propDef(content, fell.to);
        const m = v.edit(i);
        if (m) {
          m.prop = next ? next.id : null;
          m.hp = next ? Math.max(0, Math.floor(next.hits ?? 0)) : 0;
          delete m.age;
          out.felled++;
        }
      }
    }
  }
  return out;
}

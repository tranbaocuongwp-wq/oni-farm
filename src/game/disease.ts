/* ============================================================================
   DISEASE — bệnh cây.

   Mỗi đêm, cây ĐANG LỚN (chưa chín, khoẻ) có xác suất nhiễm bệnh; kề cây bệnh
   thì xác suất nhân lên, nên bệnh lan theo luống nếu bỏ mặc. Cây bệnh:
     · không lớn (growCropsIn bỏ qua),
     · thu hoạch chỉ được `sickYieldMul` phần sản lượng,
     · chữa bằng thuốc (item:medicine) hoặc nhổ bỏ bằng cuốc.
   Ngẫu nhiên rút từ `state.seed`.
============================================================================ */

import type { Content } from "./types.ts";
import type { Draft, MapView } from "./state.ts";
import { dStats, nextRandom, setInv, toastKey, touch } from "./state.ts";
import { removeItem } from "./inventory.ts";

/** Một đêm bệnh trên một bản đồ. `mul` là hệ số của thời tiết ĐÊM ĐANG XỬ LÝ
 *  (xem NightWeather) — không được đọc lại state, ở đó đã là ngày mới.
 *  Trả về số cây mới nhiễm. */
export function diseaseNight(d: Draft, content: Content, v: MapView, mul: number): number {
  const bal = content.balance;
  const base = Math.max(0, Math.min(1, bal.diseaseChance ?? 0));
  if (base <= 0) return 0;
  const nbMul = Math.max(0, bal.diseaseNeighbourMul ?? 1);
  const w = v.w;
  const h = v.h;
  const n = w * h;

  // Chụp ảnh "ai đang bệnh" TRƯỚC khi lây, để một cây vừa nhiễm đêm nay không
  // lây tiếp cho hàng xóm ngay trong cùng đêm.
  const sickNow = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (v.tiles[i]?.crop?.sick) sickNow[i] = 1;
  const hasSickNb = (x: number, y: number): boolean => {
    if (x > 0 && sickNow[y * w + x - 1]) return true;
    if (x < w - 1 && sickNow[y * w + x + 1]) return true;
    if (y > 0 && sickNow[(y - 1) * w + x]) return true;
    if (y < h - 1 && sickNow[(y + 1) * w + x]) return true;
    return false;
  };

  let infected = 0;
  for (let i = 0; i < n; i++) {
    const t = v.tiles[i];
    if (!t || !t.crop || t.crop.sick) continue;
    const def = content.crops[t.crop.id];
    if (!def || t.crop.stage >= def.growthDays.length) continue; // chín thì thôi
    const x = i % w;
    const y = (i - x) / w;
    const p = Math.min(1, base * mul * (hasSickNb(x, y) ? nbMul : 1));
    const r = nextRandom(d.s.seed);
    touch(d).seed = r.seed;
    if (r.v >= p) continue;
    const m = v.edit(i);
    if (!m || !m.crop) continue;
    m.crop.sick = true;
    infected++;
  }
  return infected;
}

/** Xịt thuốc cho ô `i` trên bản đồ đang chơi. Tốn 1 thuốc + năng lượng. */
export function cureTile(d: Draft, content: Content, v: MapView, i: number, spendEnergy: boolean): boolean {
  const cur = v.tiles[i];
  if (!cur || !cur.crop || !cur.crop.sick) return false;
  const cost = spendEnergy ? (content.balance.energyCost.cure ?? 1) : 0;
  if (spendEnergy && d.s.energy < cost) {
    toastKey(d, content, "noEnergy", "bad");
    return false;
  }
  const left = removeItem(d.s.inv, "item:medicine", 1);
  if (!left) {
    toastKey(d, content, "needMedicine", "bad");
    return false;
  }
  setInv(d, left);
  const m = v.edit(i);
  if (!m || !m.crop) return false;
  delete m.crop.sick;
  if (cost > 0) touch(d).energy = Math.max(0, d.s.energy - cost);
  dStats(d).cured += 1;
  toastKey(d, content, "cured", "good");
  return true;
}

/** Nhổ cây bệnh bằng cuốc: mất cây, ô vẫn đã cày. */
export function pullTile(d: Draft, content: Content, v: MapView, i: number, spendEnergy: boolean): boolean {
  const cur = v.tiles[i];
  if (!cur || !cur.crop || !cur.crop.sick) return false;
  const cost = spendEnergy ? (content.balance.energyCost.pull ?? 2) : 0;
  if (spendEnergy && d.s.energy < cost) {
    toastKey(d, content, "noEnergy", "bad");
    return false;
  }
  const m = v.edit(i);
  if (!m) return false;
  m.crop = null;
  if (cost > 0) touch(d).energy = Math.max(0, d.s.energy - cost);
  toastKey(d, content, "pulled", "info");
  return true;
}

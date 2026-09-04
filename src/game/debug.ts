/* ============================================================================
   DEBUG — các thao tác của bảng gỡ lỗi.

   Vẫn đi qua reducer (action DEBUG) chứ không cho UI thò tay sửa state trực
   tiếp: mọi thay đổi state chỉ có ĐÚNG MỘT cửa, nên save/replay/bất biến không
   bao giờ lệch nhau.

   Ngẫu nhiên rút từ `state.seed`, không Math.random.
============================================================================ */

import type { Content, DebugOp } from "./types.ts";
import type { Draft } from "./state.ts";
import { dTile, mapViews, nextRandom, setInv, toastText, touch } from "./state.ts";
import { addItem, removeItem, selectedItemId } from "./inventory.ts";
import { parseItem } from "./items.ts";
import { harvestTileIn, waterCapacity } from "./actions.ts";
import { newDay } from "./newday.ts";
import {
  idx,
  isTillableTile,
  playerOverlapsTile,
  playerTile,
  saplingProp,
  weedProp,
} from "./world.ts";

/** Bán kính (số ô) cho các lệnh "quanh nhân vật". */
const AROUND = 3;

/** Hạt đang chọn; không cầm hạt thì lấy hạt đầu tiên tìm thấy trong túi. */
function seedToPlant(d: Draft, content: Content): string | null {
  const held = selectedItemId(d.s.inv, d.s.sel);
  const it = held ? parseItem(held) : null;
  if (it && it.kind === "seed" && content.crops[it.ref]) return it.ref;
  for (const s of d.s.inv) {
    if (!s) continue;
    const p = parseItem(s.id);
    if (p && p.kind === "seed" && content.crops[p.ref]) return p.ref;
  }
  return content.cropOrder[0] ?? null;
}

/** Duyệt các ô quanh nhân vật theo thứ tự cố định (trên→dưới, trái→phải). */
function around(d: Draft, radius: number, fn: (i: number, x: number, y: number) => void): void {
  const p = playerTile(d.s);
  for (let y = p.y - radius; y <= p.y + radius; y++) {
    for (let x = p.x - radius; x <= p.x + radius; x++) {
      if (x < 0 || y < 0 || x >= d.s.w || y >= d.s.h) continue;
      fn(idx(d.s.w, x, y), x, y);
    }
  }
}

export function applyDebug(d: Draft, content: Content, op: DebugOp, n?: number): void {
  const bal = content.balance;

  switch (op) {
    case "money": {
      const add = Number.isFinite(n) ? Math.max(0, Math.floor(n as number)) : 1000;
      touch(d).money = d.s.money + add;
      toastText(d, `[debug] +${add}đ`, "good");
      return;
    }

    case "energy": {
      if (d.s.energy === bal.energyMax) return;
      touch(d).energy = bal.energyMax;
      return;
    }

    case "water": {
      const cap = waterCapacity(d.s, content);
      if (d.s.water === cap) return;
      touch(d).water = cap;
      return;
    }

    case "skipDay": {
      newDay(d, content, { passedOut: false });
      toastText(d, "[debug] sang ngày mới", "info");
      return;
    }

    case "weather": {
      const order = content.weatherOrder;
      if (!order.length) return;
      const cur = order.indexOf(d.s.weather.today);
      const next = Number.isFinite(n) ? ((n as number) % order.length + order.length) % order.length : (cur + 1) % order.length;
      const id = order[next]!;
      const s = touch(d);
      s.weather = { ...s.weather, today: id, driedDay: 0 };
      toastText(d, `[debug] thời tiết: ${content.weathers[id]?.name ?? id}`, "info");
      return;
    }

    case "sickAround": {
      around(d, AROUND, (i) => {
        const cur = d.s.tiles[i];
        if (!cur || !cur.crop || cur.crop.sick) return;
        const def = content.crops[cur.crop.id];
        if (!def || cur.crop.stage >= def.growthDays.length) return;
        const m = dTile(d, i);
        if (m && m.crop) m.crop.sick = true;
      });
      return;
    }

    case "growAll": {
      const tiles = d.s.tiles;
      for (let i = 0; i < tiles.length; i++) {
        const t = tiles[i];
        if (!t || !t.crop) continue;
        const def = content.crops[t.crop.id];
        if (!def) continue;
        if (t.crop.stage >= def.growthDays.length && t.crop.grow === 0) continue;
        const m = dTile(d, i);
        if (!m || !m.crop) continue;
        m.crop.stage = def.growthDays.length;
        m.crop.grow = 0;
      }
      return;
    }

    case "plantAround": {
      const cropId = seedToPlant(d, content);
      around(d, AROUND, (i) => {
        const cur = d.s.tiles[i];
        if (!cur) return;
        if (cur.prop !== null || cur.b !== null) return;
        if (!cur.tilled && !isTillableTile(cur, content)) return;
        const m = dTile(d, i);
        if (!m) return;
        m.tilled = true;
        // Debug thì tưới sẵn luôn, không thì rắc xong chẳng cây nào lớn.
        m.wet = true;
        if (!m.crop && cropId) {
          // Có hạt trong túi thì trừ; không có thì cứ gieo (đây là bảng gỡ lỗi).
          const left = removeItem(d.s.inv, `seed:${cropId}`, 1);
          if (left) setInv(d, left);
          m.crop = { id: cropId, stage: 0, grow: 0, regrown: false };
        }
      });
      return;
    }

    case "addGrass":
    case "addTrees": {
      const def = op === "addGrass" ? weedProp(content) : saplingProp(content);
      if (!def) return;
      const chance = op === "addGrass" ? 0.45 : 0.3;
      around(d, AROUND + 1, (i, x, y) => {
        const cur = d.s.tiles[i];
        if (!cur) return;
        if (cur.g !== "grass" || cur.prop !== null || cur.b !== null) return;
        if (cur.crop !== null || cur.tilled) return;
        if (playerOverlapsTile(d.s, x, y)) return; // đừng nhốt nhân vật
        const r = nextRandom(d.s.seed);
        touch(d).seed = r.seed;
        if (r.v >= chance) return;
        const m = dTile(d, i);
        if (!m) return;
        m.prop = def.id;
        m.hp = Math.max(0, Math.floor(def.hits ?? 0));
      });
      return;
    }

    case "unlockAll": {
      const all = new Set(d.s.unlocked);
      for (const id of content.cropOrder) all.add(`seed:${id}`);
      for (const id of content.buildingOrder) all.add(id);
      const stages = new Set(d.s.stagesDone);
      for (const st of content.stages) stages.add(st.id);
      const s = touch(d);
      s.unlocked = [...all];
      s.stagesDone = [...stages];
      toastText(d, "[debug] đã mở hết mốc", "good");
      return;
    }

    case "harvestAll": {
      // Thu MỌI cây đã chín trên MỌI bản đồ vào cùng một túi — kể cả ruộng
      // đang bỏ ở bản đồ khác. Không tốn năng lượng (đây là bảng gỡ lỗi), còn
      // cây mọc lại thì `harvestTileIn` lùi giai đoạn y như thu hoạch tay.
      let picked = 0;
      let lost = 0;
      for (const v of mapViews(d, content)) {
        const n = v.w * v.h;
        for (let i = 0; i < n; i++) {
          const t = v.tiles[i];
          if (!t || !t.crop) continue;
          const def = content.crops[t.crop.id];
          if (!def || t.crop.stage < def.growthDays.length) continue;
          const res = harvestTileIn(d, content, v, i, false);
          if (!res.ok) continue;
          picked += res.amount - res.overflow;
          lost += res.overflow;
        }
      }
      if (picked === 0 && lost === 0) {
        toastText(d, "[debug] không có cây nào chín", "info");
        return;
      }
      toastText(d, `[debug] thu hoạch ${picked} món`, "good");
      // Túi đầy thì phần thừa MẤT — nói thẳng ra thay vì im lặng nuốt mất.
      if (lost > 0) toastText(d, `[debug] túi đầy, mất ${lost} món`, "bad");
      return;
    }

    case "materials": {
      const add = Number.isFinite(n) ? Math.max(1, Math.floor(n as number)) : 50;
      let inv = d.s.inv;
      for (const id of content.materialOrder) {
        inv = addItem(inv, `item:${id}`, add).inv;
      }
      setInv(d, inv);
      toastText(d, `[debug] +${add} mỗi loại vật liệu`, "good");
      return;
    }
  }
}

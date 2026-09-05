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
  TILE,
  blockedAtBox,
  idx,
  inZone,
  isTillableTile,
  playerOverlapsTile,
  playerTile,
  saplingProp,
  weedProp,
} from "./world.ts";
import { removeEntity, spawnEntity } from "./entities.ts";
import { hireWorker } from "./workers.ts";
import { sendVehicle } from "./vehicles.ts";

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

/**
 * Duyệt MỌI ô của bản đồ đang chơi.
 *
 * Có hàm riêng chứ không gọi `around()` với bán kính khổng lồ: bán kính khổng
 * lồ vẫn quét hình vuông quanh nhân vật, nên đứng ở góc bản đồ thì nửa số vòng
 * lặp rơi ra ngoài lưới, và tên gọi thì nói dối về việc nó làm.
 */
function everyTile(d: Draft, fn: (i: number, x: number, y: number) => void): void {
  for (let y = 0; y < d.s.h; y++)
    for (let x = 0; x < d.s.w; x++) fn(idx(d.s.w, x, y), x, y);
}

/** Ô trống gần nhân vật để thả một thực thể xuống, hoặc null. */
function spotNear(d: Draft, content: Content, box: { w: number; h: number }): { x: number; y: number } | null {
  const p = playerTile(d.s);
  for (let r = 1; r <= 6; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = p.x + dx;
        const y = p.y + dy;
        if (x < 1 || y < 1 || x >= d.s.w - 1 || y >= d.s.h - 1) continue;
        const cx = x * TILE + TILE / 2;
        const cy = y * TILE + TILE / 2;
        // Thả vào tường thì bất biến vỡ NGAY ở dispatch kế tiếp — kiểm ở đây
        // rẻ hơn nhiều so với đi tìm xem con vật nào làm sập cả ván.
        if (blockedAtBox(d.s, content, cx, cy, box.w, box.h)) continue;
        return { x: cx, y: cy };
      }
  return null;
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
      around(d, AROUND, (i, x, y) => {
        const cur = d.s.tiles[i];
        if (!cur) return;
        if (cur.prop !== null || cur.b !== null) return;
        // Bảng gỡ lỗi cũng theo LUẬT khu ruộng: cày ra một luống mà chính người
        // chơi không cày lại được là dựng ra một trạng thái không có thật.
        if (!inZone(d.s, content, "farm", x, y)) return;
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
      /* Không còn khoá nào để mở — cửa hàng bán tất từ đầu. Nút này giờ chỉ
         ĐÁNH DẤU mọi mốc là đã qua, để thử nhanh phần cuối lộ trình mà không
         phải cày thật. Giữ tên `unlockAll` cho save/replay cũ khỏi vỡ. */
      const stages = new Set(d.s.stagesDone);
      for (const st of content.stages) stages.add(st.id);
      const goals = new Set(d.s.goalsDone);
      for (const g of content.goals) goals.add(g.id);
      const s = touch(d);
      s.stagesDone = [...stages];
      s.goalsDone = [...goals];
      toastText(d, "[debug] đã đánh dấu xong mọi mốc", "good");
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

    /* ================================================== lệnh TOÀN BẢN ĐỒ */

    case "tillMap": {
      let n2 = 0;
      everyTile(d, (i, x, y) => {
        const cur = d.s.tiles[i];
        if (!cur || cur.tilled) return;
        if (cur.prop !== null || cur.b !== null || cur.crop !== null) return;
        if (!inZone(d.s, content, "farm", x, y)) return;
        if (!isTillableTile(cur, content)) return;
        const m = dTile(d, i);
        if (!m) return;
        m.tilled = true;
        n2++;
      });
      toastText(d, `[debug] cày ${n2} ô`, "good");
      return;
    }

    case "waterMap": {
      let n2 = 0;
      everyTile(d, (i) => {
        const cur = d.s.tiles[i];
        if (!cur || !cur.tilled || cur.wet) return;
        const m = dTile(d, i);
        if (!m) return;
        m.wet = true;
        n2++;
      });
      toastText(d, `[debug] tưới ${n2} ô`, "good");
      return;
    }

    case "plantMap": {
      const cropId = seedToPlant(d, content);
      if (!cropId) return;
      let n2 = 0;
      everyTile(d, (i) => {
        const cur = d.s.tiles[i];
        if (!cur || !cur.tilled || cur.crop || cur.prop !== null) return;
        const m = dTile(d, i);
        if (!m) return;
        m.crop = { id: cropId, stage: 0, grow: 0, regrown: false };
        m.wet = true;
        n2++;
      });
      toastText(d, `[debug] gieo ${content.crops[cropId]?.name ?? cropId} ×${n2}`, "good");
      return;
    }

    case "clearMap": {
      // Chỉ dọn thứ MỌC RA (cỏ dại, cây con). Cây to và đá là địa hình do bản
      // đồ dựng — xoá sạch chúng thì không có nút nào dựng lại được.
      const co = weedProp(content)?.id;
      const cay = saplingProp(content)?.id;
      let n2 = 0;
      everyTile(d, (i) => {
        const cur = d.s.tiles[i];
        if (!cur || cur.prop === null) return;
        if (cur.prop !== co && cur.prop !== cay) return;
        const m = dTile(d, i);
        if (!m) return;
        m.prop = null;
        m.hp = 0;
        n2++;
      });
      toastText(d, `[debug] dọn ${n2} ô cỏ/cây con`, "good");
      return;
    }

    /* ------------------------------------------------------- thực thể */

    case "spawnAnimal":
    case "spawnPest": {
      const list = content.animalOrder.filter((id) =>
        op === "spawnPest"
          ? content.animals[id]?.job === "pest"
          : content.animals[id]?.job !== "pest",
      );
      if (!list.length) return;
      const k = Number.isFinite(n) ? ((n as number) % list.length + list.length) % list.length : 0;
      // Không đưa `n` thì XOAY VÒNG theo số con đang có: bấm liên tục ra mỗi
      // lần một loài khác, chứ không phải mười con bò.
      const id = list[Number.isFinite(n) ? k : d.s.entities.length % list.length]!;
      const def = content.animals[id]!;

      /* VẬT NUÔI đi ĐÚNG đường mua thật: xe chạy từ cổng vào, thả xuống điểm
         giao, rồi con vật tự đi về khu của nó. Bảng gỡ lỗi mà sinh ra con vật
         theo một đường riêng thì nó chỉ kiểm được cái đường riêng đó — đúng
         lúc cần nhất (xem chuyến giao hàng có mượt không) thì nó lại không
         chạy qua chỗ ấy. Sâu bọ thì không: chúng bò ra từ bụi rậm, không ai
         chở chuột tới bằng xe tải. */
      if (op === "spawnAnimal" && sendVehicle(d, content, "truck", { kind: "drop", animal: id }) !== null) {
        toastText(d, `[debug] xe đang chở ${def.name} tới`, "good");
        return;
      }

      const spot = spotNear(d, content, def.box);
      if (!spot) {
        toastText(d, "[debug] không có chỗ trống để thả", "bad");
        return;
      }
      const eid = spawnEntity(d, content, { def: id, map: d.s.mapId, x: spot.x, y: spot.y });
      if (eid === null) {
        toastText(d, "[debug] đã chạm trần số thực thể", "bad");
        return;
      }
      toastText(d, `[debug] thả ${def.name}`, "good");
      return;
    }

    case "spawnWorker": {
      // Miễn phí: cộng đủ tiền rồi gọi đúng đường thuê thật, để người làm sinh
      // ra giống hệt lúc chơi (tên, bộ đồ, ngày trả lương) chứ không phải một
      // biến thể chỉ có ở bảng gỡ lỗi.
      const cfg = content.workers;
      if (d.s.money < cfg.hireFee) touch(d).money = cfg.hireFee;
      const id = hireWorker(d, content, d.s.entities.length % 2 === 0 ? "crops" : "livestock");
      if (id === null) return;
      touch(d).money = d.s.money + cfg.hireFee; // hoàn lại tiền vừa trừ
      return;
    }

    case "callBuyer": {
      if (sendVehicle(d, content, "buyer", { kind: "buy" }) === null)
        toastText(d, "[debug] không gọi được xe (đủ xe rồi, hoặc sai bản đồ)", "bad");
      return;
    }

    case "clearEntities": {
      const ids = d.s.entities.filter((e) => e.map === d.s.mapId).map((e) => e.id);
      for (const id of ids) removeEntity(d, id);
      toastText(d, `[debug] bỏ ${ids.length} thực thể`, "info");
      return;
    }

    /* ---------------------------------------------------------- thời gian */

    case "nextSeason": {
      const per = Math.max(1, content.daysPerSeason | 0);
      const con = per - (((d.s.day - 1) % per) + 1) + 1;
      for (let i = 0; i < con; i++) newDay(d, content, { passedOut: false });
      toastText(d, `[debug] nhảy ${con} ngày sang mùa mới`, "info");
      return;
    }

    case "skipHours": {
      const gio = Number.isFinite(n) ? Math.max(1, Math.floor(n as number)) : 3;
      const s2 = touch(d);
      const het = content.balance.dayEndMinutes;
      // Đừng vượt qua mốc ngất: quá giờ đó thì việc đúng là NGỦ, và `newDay`
      // mới là cửa duy nhất được đổi ngày.
      s2.minutes = Math.min(het - 1, s2.minutes + gio * 60);
      return;
    }
  }
}

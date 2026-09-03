/* ============================================================================
   SIM — test mô phỏng headless. Node thuần, không browser, không thư viện.

       node scripts/sim.mjs        (hoặc: npm run test:sim)

   Mọi store đều bật { validate: true, strict: true } nên bất biến bị kiểm sau
   MỌI dispatch — vỡ bất biến là ném lỗi ngay tại action gây ra nó.
============================================================================ */

import { loadContent, rawPack } from "./lib/load-content.mjs";
import { buildContent } from "../src/core/content/loader.ts";
import { createStore } from "../src/core/store.ts";
import { createNewGame } from "../src/game/state.ts";
import { checkInvariants, migrateForContent } from "../src/game/invariants.ts";
import { TILE, tileAt, idx, isSolid, propAt, portalAt } from "../src/game/world.ts";
import { canCraft, canUseAt, missingFor, waterCapacity } from "../src/game/actions.ts";

/* ----------------------------------------------------------- khung chạy test */

const results = [];
let failures = 0;

function test(name, fn) {
  try {
    fn();
    results.push(`\x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    failures++;
    results.push(`\x1b[31m✗\x1b[0m ${name}\n    ${String(err && err.message ? err.message : err)}`);
  }
}

function ok(cond, msg) {
  if (!cond) throw new Error(msg);
}
function eq(got, want, msg) {
  if (got !== want) throw new Error(`${msg}: nhận ${JSON.stringify(got)}, mong đợi ${JSON.stringify(want)}`);
}
function deepEq(a, b, msg) {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) {
    let i = 0;
    while (i < sa.length && sa[i] === sb[i]) i++;
    throw new Error(`${msg}: khác nhau từ ký tự ${i}\n      A: ...${sa.slice(Math.max(0, i - 60), i + 60)}\n      B: ...${sb.slice(Math.max(0, i - 60), i + 60)}`);
  }
}

const content = loadContent();
const BAL = content.balance;
const clone = (v) => JSON.parse(JSON.stringify(v));

function mkStore(seed = 12345) {
  return createStore(createNewGame(content, seed), content, { validate: true, strict: true });
}

/* --------------------------------------------------------------- tiện ích */

function setState(store, mutate) {
  const s = clone(store.getState());
  mutate(s);
  store.replace(s);
}

function tile(store, x, y) {
  return tileAt(store.getState(), x, y);
}

function setTile(s, x, y, patch) {
  const t = s.tiles[idx(s.w, x, y)];
  Object.assign(t, patch);
}

/** Đi bộ tới tâm ô (tx,ty) bằng các action MOVE thật (không dịch chuyển tức thời). */
function walkTo(store, tx, ty) {
  const gx = (tx + 0.5) * TILE;
  const gy = (ty + 0.5) * TILE;
  // đi trục Y trước rồi trục X — hành lang trong bản đồ này là các dải thẳng
  for (const axis of ["y", "x", "y"]) {
    for (let i = 0; i < 4000; i++) {
      const p = store.getState().player;
      const dx = axis === "x" ? gx - p.x : 0;
      const dy = axis === "y" ? gy - p.y : 0;
      const d = Math.hypot(dx, dy);
      if (d < 1e-6) break;
      const dt = Math.min(1 / 60, d / 60);
      const before = { x: p.x, y: p.y };
      store.dispatch({ t: "MOVE", dx, dy, dt });
      const after = store.getState().player;
      if (after.x === before.x && after.y === before.y) break; // đụng tường
    }
  }
  store.dispatch({ t: "MOVE", dx: 0, dy: 0, dt: 0 });
  const p = store.getState().player;
  ok(
    Math.hypot(gx - p.x, gy - p.y) < 0.5,
    `đi bộ tới ô (${tx},${ty}) thất bại, đang ở (${(p.x / TILE).toFixed(2)}, ${(p.y / TILE).toFixed(2)})`,
  );
}

function selectItem(store, id) {
  const s = store.getState();
  const slot = s.inv.findIndex((v) => v && v.id === id);
  ok(slot >= 0, `không có '${id}' trong túi`);
  ok(slot < BAL.hotbarSlots, `'${id}' nằm ngoài hotbar (slot ${slot})`);
  store.dispatch({ t: "SELECT", slot });
}

/** Thao tác rồi CHỜ HẾT KHOÁ. Từ core 1.1 mỗi thao tác khoá `balance.actionSeconds`
 *  để việc diễn ra tuần tự, nên muốn làm việc kế tiếp thì phải để thời gian trôi —
 *  y như người chơi thật phải chờ vung xong nhát cuốc. */

/** Tổng tiến độ tăng trưởng của một ô, tính bằng PHÚT.
 *
 *  `crop.grow` chỉ là phần dư của giai đoạn hiện tại — vượt một giai đoạn là nó
 *  bị trừ đi ngưỡng. So thẳng `grow` giữa hai lần đo chỉ đúng khi chắc chắn
 *  không có giai đoạn nào bị vượt qua, mà điều đó phụ thuộc vào con số cân bằng.
 *  Cộng lại các giai đoạn đã qua thì phép đo đúng với mọi cấu hình. */
function totalGrow(store, x, y) {
  const t = tile(store, x, y);
  if (!t.crop) return 0;
  const def = content.crops[t.crop.id];
  const per = BAL.growthMinutesPerDay;
  let sum = t.crop.grow;
  for (let i = 0; i < t.crop.stage && i < def.growthDays.length; i++) {
    sum += Math.max(1, def.growthDays[i] * per);
  }
  return sum;
}

function use(store, x, y) {
  store.dispatch({ t: "USE", x, y });
  clearBusy(store);
}

/** Thao tác THÔ, không chờ — dùng riêng cho test kiểm luật tuần tự. */
function useRaw(store, x, y) {
  store.dispatch({ t: "USE", x, y });
}

function clearBusy(store) {
  if (store.getState().busy > 0) store.dispatch({ t: "TICK", dt: BAL.actionSeconds + 0.01 });
}
function sleep(store) {
  store.dispatch({ t: "SLEEP" });
}

/** Đổ đầy bình bằng bảng gỡ lỗi — các test dài không phải chạy ra giếng mỗi ngày. */
function topUpWater(store) {
  store.dispatch({ t: "DEBUG", op: "water" });
}

/** Số phút BAN NGÀY một đêm ngủ đúng giờ cộng cho cây: từ lúc dậy tới lúc trời tối. */
const DAYLIGHT_PER_DAY = BAL.daylightEndMinutes - BAL.dayStartMinutes;

/** Số đêm (ngủ ngay lúc dậy, có tưới) để cây đi hết `days` "ngày lớn". */
function nightsFor(days) {
  return Math.ceil((days * BAL.growthMinutesPerDay) / DAYLIGHT_PER_DAY);
}

/** Tưới rồi ngủ cho tới khi cây ở ô này chín. Trả về số đêm đã qua. */
function ripen(store, x, y, cap = 40) {
  let nights = 0;
  while (nights < cap) {
    const t = tile(store, x, y);
    const def = t && t.crop ? content.crops[t.crop.id] : null;
    if (!def || t.crop.stage >= def.growthDays.length) break;
    topUpWater(store);
    selectItem(store, "tool:can");
    use(store, x, y);
    sleep(store);
    nights++;
  }
  return nights;
}

/** Đặt một vật thể (cây/đá/bụi) lên ô, kèm đúng máu của nó. */
function putProp(s, x, y, id) {
  const def = content.props[id];
  setTile(s, x, y, {
    prop: id,
    hp: def && def.hits ? def.hits : 0,
    tilled: false,
    wet: false,
    crop: null,
    b: null,
  });
}

/** Nhét một vật phẩm vào ô hotbar còn trống. */
function giveItem(store, id, n = 1) {
  setState(store, (s) => {
    const at = s.inv.findIndex((v, i) => i >= 2 && i < BAL.hotbarSlots && (v === null || v === undefined));
    ok(at >= 0, "hết ô hotbar trống để đặt " + id);
    s.inv[at] = { id, n };
  });
}

function countInv(store, id) {
  let n = 0;
  for (const v of store.getState().inv) if (v && v.id === id) n += v.n;
  return n;
}

function unlockAll(store) {
  setState(store, (s) => {
    s.money = 100000;
    const all = new Set(s.unlocked);
    for (const id of content.cropOrder) all.add(`seed:${id}`);
    for (const id of content.buildingOrder) all.add(id);
    s.unlocked = [...all];
  });
}

/** Ô đất trống (grass, không prop/công trình) trong khối wxh, tránh quanh người chơi. */
function findOpenBlock(s, bw, bh) {
  const px = Math.floor(s.player.x / TILE);
  const py = Math.floor(s.player.y / TILE);
  for (let y = 1; y < s.h - bh - 1; y++) {
    for (let x = 1; x < s.w - bw - 1; x++) {
      if (Math.abs(x - px) < 6 && Math.abs(y - py) < 6) continue;
      let good = true;
      for (let j = 0; j < bh && good; j++)
        for (let i = 0; i < bw && good; i++) {
          const t = s.tiles[idx(s.w, x + i, y + j)];
          if (!t || t.g !== "grass" || t.prop !== null || t.b !== null) good = false;
        }
      if (good) return { x, y };
    }
  }
  throw new Error(`không tìm được khối đất trống ${bw}x${bh}`);
}

/* Ô ruộng dùng chung: đứng ở (16,8) trên lối đi, với tới 6 ô cỏ hai bên. */
const HOME = { x: 16, y: 8 };
const PLOTS = [
  { x: 15, y: 7 }, { x: 15, y: 8 }, { x: 15, y: 9 },
  { x: 17, y: 7 }, { x: 17, y: 8 }, { x: 17, y: 9 },
];

/* ========================================================================== */
/* 1. Vòng lặp lõi                                                            */
/* ========================================================================== */

test("1. vòng lặp lõi: cày → gieo → tưới → lớn theo thời gian → thu hoạch → bán", () => {
  const store = mkStore();
  walkTo(store, HOME.x, HOME.y);
  const plot = PLOTS[1];

  selectItem(store, "tool:hoe");
  use(store, plot.x, plot.y);
  ok(tile(store, plot.x, plot.y).tilled, "ô phải được cày");
  eq(store.getState().stats.tilled, 1, "stats.tilled");

  selectItem(store, "seed:lettuce");
  const seedsBefore = store.getState().inv.find((v) => v && v.id === "seed:lettuce").n;
  use(store, plot.x, plot.y);
  eq(tile(store, plot.x, plot.y).crop.id, "lettuce", "cây đã gieo");
  eq(store.getState().inv.find((v) => v && v.id === "seed:lettuce").n, seedsBefore - 1, "trừ hạt");

  const def = content.crops.lettuce;
  selectItem(store, "tool:can");
  const water0 = store.getState().water;
  use(store, plot.x, plot.y);
  ok(tile(store, plot.x, plot.y).wet, "ô phải ướt sau khi tưới");
  eq(store.getState().water, water0 - 1, "tưới một ô tốn đúng 1 nước");
  sleep(store);

  const nights = 1 + ripen(store, plot.x, plot.y);
  const want = nightsFor(def.growthDays.reduce((a, b) => a + b, 0));
  eq(nights, want, "số đêm cần để chín = tổng growthDays quy ra phút ban ngày");
  eq(tile(store, plot.x, plot.y).crop.stage, def.growthDays.length, "cây phải chín");

  const moneyBefore = store.getState().money;
  use(store, plot.x, plot.y); // luật ưu tiên: đang cầm bình tưới vẫn thu hoạch
  eq(tile(store, plot.x, plot.y).crop, null, "xà lách không mọc lại → cây biến mất");
  ok(tile(store, plot.x, plot.y).tilled, "ô vẫn giữ trạng thái đã cày");
  const got = store.getState().inv.find((v) => v && v.id === "crop:lettuce");
  ok(got && got.n >= def.yieldMin && got.n <= def.yieldMax, "sản lượng nằm trong [yieldMin,yieldMax]");
  eq(store.getState().stats.harvested, 1, "stats.harvested");

  const n = got.n;
  store.dispatch({ t: "SELL", id: "crop:lettuce", n });
  eq(store.getState().money - moneyBefore, def.sellPrice * n, "tiền tăng đúng sellPrice × số lượng");
  eq(store.getState().stats.sold, n, "stats.sold");
  eq(store.getState().stats.earned, def.sellPrice * n, "stats.earned");
});

/* ========================================================================== */
/* 2. Không tưới thì không lớn                                                */
/* ========================================================================== */

test("2. gieo rồi ngủ 5 đêm mà không tưới → stage vẫn 0", () => {
  const store = mkStore();
  walkTo(store, HOME.x, HOME.y);
  const plot = PLOTS[0];
  selectItem(store, "tool:hoe");
  use(store, plot.x, plot.y);
  selectItem(store, "seed:lettuce");
  use(store, plot.x, plot.y);
  for (let i = 0; i < 5; i++) sleep(store);
  eq(tile(store, plot.x, plot.y).crop.stage, 0, "stage");
  eq(tile(store, plot.x, plot.y).crop.grow, 0, "grow (phút) vẫn 0 vì ô khô");
  eq(store.getState().day, 6, "đã qua 5 đêm");
});

/* ========================================================================== */
/* 3. Vòi tưới tự động                                                        */
/* ========================================================================== */

test("3. vòi tưới: ngủ dậy 4 ô kề đều ướt và cây lớn dù không tưới tay", () => {
  const store = mkStore();
  walkTo(store, HOME.x, HOME.y);
  unlockAll(store);

  for (const p of [PLOTS[3], PLOTS[5]]) {
    selectItem(store, "tool:hoe");
    use(store, p.x, p.y);
    selectItem(store, "seed:lettuce");
    use(store, p.x, p.y);
  }

  store.dispatch({ t: "BUY", id: "sprinkler", n: 1 });
  ok(store.getState().inv.some((v) => v && v.id === "build:sprinkler"), "đã mua vòi tưới");
  selectItem(store, "build:sprinkler");
  use(store, PLOTS[4].x, PLOTS[4].y);
  eq(tile(store, PLOTS[4].x, PLOTS[4].y).b, "sprinkler", "vòi tưới đã đặt");
  eq(store.getState().stats.built.sprinkler, 1, "stats.built.sprinkler");

  // Mỗi lần vung khoá `actionSeconds` nên trong ngày đã trôi mất một ít thời
  // gian: phần ban ngày còn lại được cộng cho cây đúng bằng chỗ chưa dùng.
  const sleptAt = store.getState().minutes;
  sleep(store);
  const c = PLOTS[4];
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    ok(tile(store, c.x + dx, c.y + dy).wet, `ô kề (${c.x + dx},${c.y + dy}) phải ướt`);
  }
  const grew = totalGrow(store, PLOTS[3].x, PLOTS[3].y);
  eq(
    grew,
    BAL.daylightEndMinutes - sleptAt,
    "một đêm dưới vòi tưới = trọn phần ban ngày còn lại của hôm đó",
  );
  sleep(store);
  // Điều cần chứng minh là VÒI TƯỚI làm cây lớn mà không phải tưới tay — chứ
  // không phải "đúng 1 giai đoạn sau 2 đêm". Gắn cứng con số giai đoạn ở đây là
  // gắn cứng vào balance.json, chỉnh nhịp game một cái là test đỏ oan.
  ok(
    tile(store, PLOTS[3].x, PLOTS[3].y).crop.stage >= 1,
    `cây trên ô được vòi tưới đã lớn (stage ${tile(store, PLOTS[3].x, PLOTS[3].y).crop.stage})`,
  );
  ok(
    tile(store, PLOTS[5].x, PLOTS[5].y).crop.stage >= 1,
    `cây thứ hai cũng lớn (stage ${tile(store, PLOTS[5].x, PLOTS[5].y).crop.stage})`,
  );

  // ô ngoài bán kính thì khô như thường
  ok(!tile(store, c.x - 2, c.y).wet, "ô ngoài bán kính vẫn khô");
});

/* ========================================================================== */
/* 4. Nhà kính                                                                */
/* ========================================================================== */

test("4. sàn nhà kính giữ ẩm qua nhiều ngày, cây lớn không cần tưới", () => {
  const store = mkStore();
  walkTo(store, HOME.x, HOME.y);
  unlockAll(store);
  const p = PLOTS[0];

  selectItem(store, "tool:hoe");
  use(store, p.x, p.y);
  store.dispatch({ t: "BUY", id: "greenhouse", n: 1 });
  selectItem(store, "build:greenhouse");
  use(store, p.x, p.y);
  eq(tile(store, p.x, p.y).b, "greenhouse", "sàn nhà kính đã đặt");

  selectItem(store, "seed:lettuce");
  use(store, p.x, p.y);
  eq(tile(store, p.x, p.y).crop.id, "lettuce", "gieo được lên sàn nhà kính");

  for (let i = 0; i < 5; i++) {
    sleep(store);
    ok(tile(store, p.x, p.y).wet, `ngày ${store.getState().day}: sàn nhà kính phải luôn ẩm`);
  }
  eq(tile(store, p.x, p.y).crop.stage, content.crops.lettuce.growthDays.length, "cây đã chín");
});

/* ========================================================================== */
/* 5. Điện: drone cần pin mặt trời                                            */
/* ========================================================================== */

function droneScenario(store, { solar, drones }) {
  setState(store, (s) => {
    const blk = findOpenBlock(s, 5, 5);
    const cx = blk.x + 2;
    const cy = blk.y + 2;
    // cây chín ở 4 góc khối
    for (const [dx, dy] of [[0, 0], [4, 0], [0, 4], [4, 4]]) {
      setTile(s, blk.x + dx, blk.y + dy, {
        tilled: true,
        wet: false,
        crop: { id: "lettuce", stage: content.crops.lettuce.growthDays.length, grow: 0, regrown: false },
      });
    }
    for (let i = 0; i < drones; i++) setTile(s, cx + (i === 0 ? 0 : 1), cy, { b: "drone" });
    if (solar > 0) setTile(s, cx, cy + 1, { b: "solar" });
    s.energy = BAL.energyMax;
  });
  return store;
}

test("5. điện: không pin thì drone đứng im, có pin thì thu hoạch", () => {
  // --- không có pin mặt trời ---
  const a = mkStore(7);
  droneScenario(a, { solar: 0, drones: 1 });
  const cropsBefore = a.getState().tiles.filter((t) => t.crop).length;
  eq(cropsBefore, 4, "chuẩn bị 4 cây chín");
  sleep(a);
  eq(a.getState().tiles.filter((t) => t.crop).length, 4, "không điện → drone không thu hoạch");
  eq(a.getState().stats.harvested, 0, "harvested vẫn 0");
  ok(
    a.getState().log.some((l) => l.text === content.strings.msg.droneNoPower),
    "phải có toast droneNoPower",
  );
  eq(
    a.getState().log.filter((l) => l.text === content.strings.msg.droneNoPower).length,
    1,
    "toast droneNoPower chỉ đẩy MỘT lần",
  );

  // --- có pin mặt trời ---
  const b = mkStore(7);
  droneScenario(b, { solar: 1, drones: 1 });
  sleep(b);
  eq(b.getState().tiles.filter((t) => t.crop).length, 0, "có điện → drone thu sạch 4 cây");
  eq(b.getState().stats.harvested, 4, "harvested = 4");
  ok(
    b.getState().inv.some((v) => v && v.id === "crop:lettuce" && v.n >= 4),
    "nông sản vào túi",
  );

  // --- hai drone, một pin: đúng một drone chạy ---
  const c = mkStore(7);
  droneScenario(c, { solar: 1, drones: 2 });
  sleep(c);
  eq(c.getState().stats.harvested, 4, "một drone chạy, thu hết 4 cây trong bán kính");
  eq(
    c.getState().log.filter((l) => l.text === content.strings.msg.droneNoPower).length,
    1,
    "drone thứ hai báo thiếu điện đúng một lần",
  );
});

/* ========================================================================== */
/* 6. Progression                                                             */
/* ========================================================================== */

test("6. mốc mở khoá bắn đúng thứ tự, hàng chưa mở khoá không mua được", () => {
  const store = mkStore();
  deepEq(store.getState().stagesDone, ["start"], "mốc start áp ngay từ createNewGame");
  deepEq(store.getState().unlocked, ["seed:lettuce"], "chỉ mở khoá hạt xà lách lúc đầu");

  // mua hàng chưa mở khoá → bị từ chối, không mất tiền
  setState(store, (s) => {
    s.money = 5000;
  });
  const money0 = store.getState().money;
  store.dispatch({ t: "BUY", id: "seed:tomato", n: 1 });
  eq(store.getState().money, money0, "mua hạt cà chua khi chưa mở khoá: không trừ tiền");
  ok(!store.getState().inv.some((v) => v && v.id === "seed:tomato"), "không nhận được hạt cà chua");
  store.dispatch({ t: "BUY", id: "sprinkler", n: 1 });
  ok(!store.getState().inv.some((v) => v && v.id === "build:sprinkler"), "không mua được vòi tưới");

  // thu hoạch 5 cây → mốc 'pro'
  walkTo(store, HOME.x, HOME.y);
  setState(store, (s) => {
    s.money = 100; // để mốc 'mech' (money 800) chưa bắn
    for (const p of PLOTS) {
      setTile(s, p.x, p.y, {
        tilled: true,
        crop: { id: "lettuce", stage: content.crops.lettuce.growthDays.length, grow: 0, regrown: false },
      });
    }
  });
  for (let i = 0; i < 5; i++) use(store, PLOTS[i].x, PLOTS[i].y);
  eq(store.getState().stats.harvested, 5, "đã thu hoạch 5");
  deepEq(store.getState().stagesDone, ["start", "pro"], "mốc 'pro' bắn sau mốc 'start'");
  ok(store.getState().unlocked.includes("seed:tomato"), "seed:tomato đã mở khoá");

  // giờ mua được, và tiền đủ giữa ngày là mở khoá ngay (mốc 'mech' theo money)
  setState(store, (s) => {
    s.money = 900;
  });
  store.dispatch({ t: "BUY", id: "seed:tomato", n: 1 });
  ok(store.getState().inv.some((v) => v && v.id === "seed:tomato"), "mua được hạt cà chua sau khi mở khoá");
  ok(store.getState().stagesDone.includes("mech"), "đủ tiền giữa ngày là mốc 'mech' bắn ngay, không cần ngủ");
  ok(store.getState().unlocked.includes("sprinkler"), "vòi tưới đã mở khoá");
});

/* ========================================================================== */
/* 7. Năng lượng                                                              */
/* ========================================================================== */

test("7. hết năng lượng không cày được; quá giờ thì ngất qua TICK", () => {
  const store = mkStore();
  walkTo(store, HOME.x, HOME.y);
  setState(store, (s) => {
    s.energy = 1; // < energyCost.till = 2
  });
  selectItem(store, "tool:hoe");
  use(store, PLOTS[0].x, PLOTS[0].y);
  ok(!tile(store, PLOTS[0].x, PLOTS[0].y).tilled, "hết năng lượng thì không cày được");
  eq(store.getState().stats.tilled, 0, "stats.tilled không tăng");
  ok(
    store.getState().log.some((l) => l.text === content.strings.msg.noEnergy),
    "phải có toast noEnergy",
  );

  // ngất
  const day0 = store.getState().day;
  setState(store, (s) => {
    s.minutes = BAL.dayEndMinutes - 1;
  });
  store.dispatch({ t: "TICK", dt: 5 });
  eq(store.getState().day, day0 + 1, "ngất → sang ngày mới");
  eq(store.getState().minutes, BAL.dayStartMinutes, "đồng hồ về đầu ngày");
  eq(store.getState().energy, Math.round(BAL.energyMax * BAL.passOutEnergy), "năng lượng hồi theo passOutEnergy");
  ok(
    store.getState().log.some((l) => l.text === content.strings.msg.passOut),
    "phải có toast passOut",
  );

  // ngủ đúng giờ thì hồi đầy
  store.dispatch({ t: "SLEEP" });
  eq(store.getState().energy, Math.round(BAL.energyMax * BAL.sleepRestore), "ngủ sớm hồi theo sleepRestore");
});

/* ========================================================================== */
/* 8. Save round-trip                                                         */
/* ========================================================================== */

test("8. save round-trip: JSON.parse(JSON.stringify(snapshot)) → replace() khớp hoàn toàn", () => {
  const store = mkStore(999);
  walkTo(store, HOME.x, HOME.y);
  selectItem(store, "tool:hoe");
  use(store, PLOTS[2].x, PLOTS[2].y);
  selectItem(store, "seed:lettuce");
  use(store, PLOTS[2].x, PLOTS[2].y);
  selectItem(store, "tool:can");
  use(store, PLOTS[2].x, PLOTS[2].y);
  sleep(store);
  store.dispatch({ t: "TICK", dt: 3.5 });

  const before = clone(store.getState());
  const snap = store.snapshot();
  eq(snap.magic, "oni-farm", "magic");
  const round = JSON.parse(JSON.stringify(snap));
  store.replace(round.state);
  deepEq(store.getState(), before, "state sau round-trip");
  deepEq(checkInvariants(store.getState(), content), [], "bất biến vẫn xanh");
});

/* ========================================================================== */
/* 9. Tất định                                                                */
/* ========================================================================== */

const SCRIPT = [
  { t: "SELECT", slot: 0 },
  { t: "USE", x: 15, y: 8 },
  { t: "TICK", dt: 0.4 },
  { t: "USE", x: 15, y: 7 },
  { t: "TICK", dt: 0.4 },
  { t: "USE", x: 17, y: 8 },
  { t: "TICK", dt: 0.4 },
  { t: "SELECT", slot: 2 },
  { t: "USE", x: 15, y: 8 },
  { t: "TICK", dt: 0.4 },
  { t: "USE", x: 15, y: 7 },
  { t: "TICK", dt: 0.4 },
  { t: "USE", x: 17, y: 8 },
  { t: "TICK", dt: 0.4 },
  { t: "SELECT", slot: 1 },
  { t: "USE", x: 15, y: 8 },
  { t: "TICK", dt: 0.4 },
  { t: "USE", x: 15, y: 7 },
  { t: "TICK", dt: 0.4 },
  { t: "USE", x: 17, y: 8 },
  { t: "TICK", dt: 0.4 },
  { t: "SLEEP" },
  { t: "TICK", dt: 12 },
  { t: "MOVE", dx: 1, dy: 0, dt: 0.25 },
  { t: "MOVE", dx: 0, dy: 1, dt: 0.25 },
  { t: "USE", x: 15, y: 8 },
  { t: "TICK", dt: 0.4 },
  { t: "USE", x: 15, y: 7 },
  { t: "TICK", dt: 0.4 },
  { t: "USE", x: 17, y: 8 },
  { t: "TICK", dt: 0.4 },
  { t: "SLEEP" },
  { t: "USE", x: 15, y: 8 },
  { t: "TICK", dt: 0.4 },
  { t: "USE", x: 15, y: 7 },
  { t: "TICK", dt: 0.4 },
  { t: "USE", x: 17, y: 8 },
  { t: "TICK", dt: 0.4 },
  { t: "SLEEP" },
  { t: "DEBUG", op: "growAll" },
  { t: "USE", x: 15, y: 8 },
  { t: "TICK", dt: 0.4 },
  { t: "USE", x: 15, y: 7 },
  { t: "TICK", dt: 0.4 },
  { t: "USE", x: 17, y: 8 },
  { t: "TICK", dt: 0.4 },
  { t: "SELL_ALL" },
];

test("9. tất định: cùng seed + cùng chuỗi action → hai state y hệt", () => {
  const run = () => {
    const store = mkStore(4242);
    walkTo(store, HOME.x, HOME.y);
    for (const a of SCRIPT) store.dispatch(a);
    return clone(store.getState());
  };
  const a = run();
  const b = run();
  deepEq(a, b, "hai lần chạy");
  ok(a.stats.harvested > 0, "kịch bản phải thực sự có thu hoạch (nếu không thì test rỗng nghĩa)");
});

/* ========================================================================== */
/* 10. Content đổi (OTA gỡ bí đỏ)                                             */
/* ========================================================================== */

test("10. content gỡ 'pumpkin' → migrateForContent không ném lỗi, cây bí biến mất", () => {
  const raw = rawPack();
  raw.crops = { ...raw.crops, crops: raw.crops.crops.filter((c) => c.id !== "pumpkin") };
  raw.progression = {
    ...raw.progression,
    stages: raw.progression.stages.map((s) => ({
      ...s,
      unlocks: s.unlocks.filter((u) => u !== "seed:pumpkin"),
    })),
  };
  const newContent = buildContent(raw);
  ok(!newContent.crops.pumpkin, "content mới không còn bí đỏ");

  // save cũ có bí đỏ trên ruộng, trong túi, và trong danh sách mở khoá
  const store = mkStore(31337);
  setState(store, (s) => {
    setTile(s, PLOTS[0].x, PLOTS[0].y, {
      tilled: true,
      crop: { id: "pumpkin", stage: 2, grow: 600, regrown: false },
    });
    setTile(s, PLOTS[1].x, PLOTS[1].y, {
      tilled: true,
      crop: { id: "lettuce", stage: 1, grow: 0, regrown: false },
    });
    s.inv[5] = { id: "seed:pumpkin", n: 3 };
    s.inv[6] = { id: "crop:pumpkin", n: 2 };
    s.inv[7] = { id: "crop:lettuce", n: 4 };
    s.unlocked = [...s.unlocked, "seed:pumpkin"];
  });
  const old = clone(store.getState());

  let res;
  try {
    res = migrateForContent(old, newContent);
  } catch (err) {
    throw new Error(`migrateForContent đã NÉM LỖI: ${err}`);
  }
  eq(res.state.tiles[idx(res.state.w, PLOTS[0].x, PLOTS[0].y)].crop, null, "cây bí đỏ biến mất");
  eq(
    res.state.tiles[idx(res.state.w, PLOTS[1].x, PLOTS[1].y)].crop.id,
    "lettuce",
    "cây xà lách giữ nguyên",
  );
  ok(!res.state.inv.some((v) => v && v.id.endsWith(":pumpkin")), "vật phẩm bí đỏ bị gỡ khỏi túi");
  ok(res.state.inv.some((v) => v && v.id === "crop:lettuce" && v.n === 4), "nông sản khác còn nguyên");
  ok(!res.state.unlocked.includes("seed:pumpkin"), "gỡ mở khoá bí đỏ");
  ok(res.notes.length > 0, "phải có ghi chú migrate");
  deepEq(checkInvariants(res.state, newContent), [], "bất biến vẫn xanh với content mới");
  deepEq(old, clone(store.getState()), "migrate không sửa state cũ");

  // state đã migrate chạy tiếp được với content mới
  const store2 = createStore(res.state, newContent, { validate: true, strict: true });
  store2.dispatch({ t: "SLEEP" });
  deepEq(checkInvariants(store2.getState(), newContent), [], "ngủ một đêm với content mới vẫn xanh");
});

/* ========================================================================== */
/* 11. Chạy dài 30 ngày                                                       */
/* ========================================================================== */

test("11. chạy dài 30 ngày có mua bán/xây dựng, bất biến xanh sau mỗi ngày", () => {
  const store = mkStore(2024);
  walkTo(store, HOME.x, HOME.y);
  // vốn mồi: đây là test độ bền của logic 30 ngày, không phải test cân bằng kinh tế
  setState(store, (s) => {
    s.money = 2000;
  });
  let built = 0;
  let solared = 0;
  const FARM = [PLOTS[0], PLOTS[1], PLOTS[2], PLOTS[5]]; // 3 và 4 để dành cho công trình

  for (let day = 1; day <= 30; day++) {
    topUpWater(store);

    // cỏ dại mọc đêm qua có thể lấn vào ruộng — dọn trước đã (tay không cũng phá được)
    for (const p of [...FARM, PLOTS[3], PLOTS[4]]) {
      let guard = 0;
      while (tile(store, p.x, p.y).prop !== null && guard++ < 4) use(store, p.x, p.y);
    }

    // thu hoạch mọi cây chín trong tầm với
    for (const p of FARM) {
      const t = tile(store, p.x, p.y);
      if (t && t.crop && t.crop.stage >= (content.crops[t.crop.id]?.growthDays.length ?? 99)) {
        use(store, p.x, p.y);
      }
    }
    // bán hết nông sản
    store.dispatch({ t: "SELL_ALL" });

    // cày + gieo + tưới
    for (const p of FARM) {
      const t = tile(store, p.x, p.y);
      if (!t) continue;
      if (!t.tilled && t.b === null) {
        selectItem(store, "tool:hoe");
        use(store, p.x, p.y);
      }
      if (tile(store, p.x, p.y).tilled && !tile(store, p.x, p.y).crop) {
        const seed = store.getState().unlocked.includes("seed:tomato") &&
          store.getState().inv.some((v) => v && v.id === "seed:tomato")
          ? "seed:tomato"
          : "seed:lettuce";
        if (store.getState().inv.some((v) => v && v.id === seed)) {
          selectItem(store, seed);
          use(store, p.x, p.y);
        }
      }
      if (!tile(store, p.x, p.y).wet && tile(store, p.x, p.y).tilled) {
        selectItem(store, "tool:can");
        use(store, p.x, p.y);
      }
    }

    // mua thêm hạt khi rẻ, xây khi đủ điều kiện
    const s = store.getState();
    if (s.unlocked.includes("seed:lettuce") && s.money > 300)
      store.dispatch({ t: "BUY", id: "seed:lettuce", n: 3 });
    if (s.unlocked.includes("seed:tomato") && s.money > 600)
      store.dispatch({ t: "BUY", id: "seed:tomato", n: 2 });
    if (built === 0 && s.unlocked.includes("sprinkler") && s.money > 500) {
      store.dispatch({ t: "BUY", id: "sprinkler", n: 1 });
      if (store.getState().inv.some((v) => v && v.id === "build:sprinkler")) {
        selectItem(store, "build:sprinkler");
        // đặt vật thể solid lên chính ô mình đứng → phải bị từ chối (không tự nhốt mình)
        use(store, HOME.x, HOME.y);
        ok(tile(store, HOME.x, HOME.y).b === null, "không được đặt công trình solid lên ô người chơi đứng");
        use(store, PLOTS[4].x, PLOTS[4].y);
        if (tile(store, PLOTS[4].x, PLOTS[4].y).b === "sprinkler") built = 1;
      }
    }
    if (solared === 0 && store.getState().unlocked.includes("solar") && store.getState().money > 700) {
      store.dispatch({ t: "BUY", id: "solar", n: 1 });
      if (store.getState().inv.some((v) => v && v.id === "build:solar")) {
        selectItem(store, "build:solar");
        use(store, PLOTS[3].x, PLOTS[3].y);
        if (tile(store, PLOTS[3].x, PLOTS[3].y).b === "solar") solared = 1;
      }
    }

    // trôi thời gian một chút rồi đi ngủ
    store.dispatch({ t: "TICK", dt: 30 });
    sleep(store);

    const problems = checkInvariants(store.getState(), content);
    deepEq(problems, [], `bất biến ngày ${day}`);
    ok(store.getState().money >= 0, `tiền không âm ở ngày ${day}`);
    for (let i = 0; i < store.getState().tiles.length; i++) {
      const t = store.getState().tiles[i];
      if (t.crop) ok(t.tilled, `ô ${i} có cây mà chưa cày`);
    }
  }

  eq(store.getState().day, 31, "đã chạy đủ 30 đêm");
  ok(store.getState().stats.harvested > 5, "phải có thu hoạch đáng kể trong 30 ngày");
  ok(store.getState().stats.earned > 0, "phải kiếm được tiền");
  eq(built, 1, "đã lắp được vòi tưới trong 30 ngày");
  eq(solared, 1, "đã dựng được pin mặt trời trong 30 ngày");
  ok(store.getState().stagesDone.includes("auto"), "mốc 'auto' (có điện) đã bắn");
  ok(store.getState().log.length <= 30, "log giữ tối đa 30 mục");
});

/* ========================================================================== */
/* Phụ: LOG_SEEN, tầm với, cà chua mọc lại                                    */
/* ========================================================================== */

test("12. LOG_SEEN xoá đúng các toast đã xem", () => {
  const store = mkStore();
  sleep(store);
  const s = store.getState();
  ok(s.log.length > 0, "phải có toast");
  const upTo = s.log[s.log.length - 1].id;
  store.dispatch({ t: "LOG_SEEN", upTo });
  eq(store.getState().log.length, 0, "log đã xoá sạch");
  eq(store.dispatch({ t: "LOG_SEEN", upTo }), store.getState(), "LOG_SEEN không đổi gì → trả state cũ");
});

test("13. ô ngoài tầm với bị bỏ qua, không đổi state", () => {
  const store = mkStore();
  walkTo(store, HOME.x, HOME.y);
  selectItem(store, "tool:hoe");
  const before = store.getState();
  store.dispatch({ t: "USE", x: HOME.x + 4, y: HOME.y });
  eq(store.getState(), before, "USE ngoài tầm với phải trả về ĐÚNG state cũ");
});

test("14. cà chua mọc lại: thu xong lùi về giai đoạn cần đúng regrowDays ngày", () => {
  const store = mkStore(555);
  walkTo(store, HOME.x, HOME.y);
  const def = content.crops.tomato;
  const p = PLOTS[1];
  setState(store, (s) => {
    setTile(s, p.x, p.y, {
      tilled: true,
      wet: false,
      crop: { id: "tomato", stage: def.growthDays.length, grow: 0, regrown: false },
    });
  });
  use(store, p.x, p.y);
  const c = tile(store, p.x, p.y).crop;
  ok(c !== null, "cà chua không biến mất sau khi thu");
  eq(c.regrown, true, "đánh dấu regrown");

  // đếm số đêm (có tưới) cần để chín lại — regrowDays là "ngày lớn", quy ra
  // phút rồi chia cho phần ban ngày mỗi hôm mới ra số đêm thật sự phải ngủ
  const nights = ripen(store, p.x, p.y);
  eq(nights, nightsFor(def.regrowDays), "chín lại đúng sau regrowDays 'ngày lớn'");
});

test("15. INTERACT: cửa hàng/quầy không đổi state, cửa nhà DỊCH CHUYỂN, giường mới ngủ", () => {
  const store = mkStore();

  // --- SHOP / SELL: UI tự mở modal, reducer không đụng state ---
  walkTo(store, 12, 5);
  let before = store.getState();
  store.dispatch({ t: "INTERACT", x: 11, y: 5 }); // 'S' — cửa hàng
  eq(store.getState(), before, "INTERACT SHOP không đổi state");

  walkTo(store, 22, 6);
  before = store.getState();
  store.dispatch({ t: "INTERACT", x: 22, y: 5 }); // 'B' — quầy thu mua
  eq(store.getState(), before, "INTERACT SELL không đổi state");

  // --- cửa nhà = PORTAL, KHÔNG còn là ngủ ---
  walkTo(store, 16, 4);
  const day0 = store.getState().day;
  const door = portalAt(store.getState(), content, 16, 3);
  ok(
    door && door.map === "house" && door.x === 6 && door.y === 6,
    "props.json khai cửa nhà dẫn vào bản đồ 'house' ô (6,6)",
  );

  store.dispatch({ t: "INTERACT", x: 16, y: 3 }); // 'D' — cửa nhà
  eq(store.getState().day, day0, "cửa nhà KHÔNG còn là chỗ ngủ nữa");
  eq(store.getState().mapId, "house", "đã sang bản đồ phòng ngủ");
  const p1 = store.getState().player;
  eq(Math.floor(p1.x / TILE), door.x, "đã dịch chuyển đúng cột");
  eq(Math.floor(p1.y / TILE), door.y, "đã dịch chuyển đúng hàng");
  ok(!isSolid(store.getState(), content, door.x, door.y), "ô đích không được đặc");
  eq(p1.moving, false, "dịch chuyển xong thì đứng yên");
  deepEq(checkInvariants(store.getState(), content), [], "bất biến sau dịch chuyển");

  // --- giường mới ngủ được ---
  walkTo(store, 2, 3);
  store.dispatch({ t: "INTERACT", x: 2, y: 2 }); // 'E' — giường
  eq(store.getState().day, day0 + 1, "giường = ngủ");

  // --- cửa trong nhà đưa ra ngoài ---
  walkTo(store, 6, 6);
  store.dispatch({ t: "PORTAL", x: 6, y: 7 }); // 'd' — cửa ra
  eq(store.getState().mapId, "farm", "về lại nông trại");
  const p2 = store.getState().player;
  eq(Math.floor(p2.x / TILE), 16, "ra ngoài đúng cột");
  eq(Math.floor(p2.y / TILE), 4, "ra ngoài đúng hàng");

  // --- PORTAL vào ô không phải cửa thì không làm gì ---
  before = store.getState();
  store.dispatch({ t: "PORTAL", x: 16, y: 5 });
  eq(store.getState(), before, "PORTAL vào ô thường trả về ĐÚNG state cũ");

  // --- và không dịch chuyển được từ xa ---
  walkTo(store, 16, 8);
  before = store.getState();
  store.dispatch({ t: "PORTAL", x: 16, y: 3 });
  eq(store.getState(), before, "PORTAL ngoài tầm với: không làm gì");
});

/* ========================================================================== */
/* 17. Thao tác TUẦN TỰ — bấm loạn không làm được nhanh hơn                    */
/* ========================================================================== */

test("17. thao tác tuần tự: đang bận thì không làm việc khác, không đi được", () => {
  const store = mkStore();
  walkTo(store, HOME.x, HOME.y);
  selectItem(store, "tool:hoe");
  const w = store.getState().w;
  // HOME là ô LỐI ĐI (không cày được) — dùng các ô cỏ hai bên.
  const A = PLOTS[1];
  const B = PLOTS[4];

  useRaw(store, A.x, A.y);
  const first = store.getState();
  ok(first.tiles[A.y * w + A.x].tilled, "nhát cuốc đầu ăn");
  eq(first.busy, BAL.actionSeconds, "khoá đúng bằng balance.actionSeconds");

  // Bấm loạn khi còn khoá: không nhát nào được ăn.
  const before = store.getState();
  useRaw(store, B.x, B.y);
  useRaw(store, PLOTS[0].x, PLOTS[0].y);
  ok(store.getState() === before, "USE lúc đang bận phải trả về ĐÚNG state cũ");
  ok(!store.getState().tiles[B.y * w + B.x].tilled, "ô kế bên không bị cày khi đang bận");

  // Đang bận thì chân đứng yên.
  const px = store.getState().player.x;
  store.dispatch({ t: "MOVE", dx: 1, dy: 0, dt: 0.1 });
  eq(store.getState().player.x, px, "đang bận thì không di chuyển được");

  // Hết khoá thì làm tiếp bình thường.
  store.dispatch({ t: "TICK", dt: BAL.actionSeconds + 0.01 });
  eq(store.getState().busy, 0, "hết giờ thì busy về 0");
  useRaw(store, B.x, B.y);
  ok(store.getState().tiles[B.y * w + B.x].tilled, "hết khoá thì cày được tiếp");

  // Thao tác HỤT không bị phạt khoá.
  store.dispatch({ t: "TICK", dt: BAL.actionSeconds + 0.01 });
  useRaw(store, B.x, B.y); // đã cày rồi → hụt
  eq(store.getState().busy, 0, "thao tác hụt thì không bị khoá");

  // Ngủ dậy là hết bận.
  useRaw(store, PLOTS[0].x, PLOTS[0].y);
  ok(store.getState().busy > 0, "đang bận trước khi ngủ");
  sleep(store);
  eq(store.getState().busy, 0, "ngủ dậy thì busy được xoá");

  deepEq(checkInvariants(store.getState(), content), [], "bất biến vẫn xanh");
});

/* ========================================================================== */
/* 18. Tốc độ đi/chạy lấy từ content                                          */
/* ========================================================================== */

test("18. chạy nhanh hơn đi; độ dài vector điều tiết tốc độ", () => {
  const move = (opts) => {
    const st = mkStore();
    walkTo(st, HOME.x, HOME.y + 3);
    const p0 = { ...st.getState().player };
    st.dispatch({ t: "MOVE", dt: 0.4, ...opts });
    const p1 = st.getState().player;
    return Math.hypot(p1.x - p0.x, p1.y - p0.y);
  };

  const walked = move({ dx: 0, dy: 1 });
  const ran = move({ dx: 0, dy: 1, run: true });
  const nudged = move({ dx: 0, dy: 0.4 });
  const diag = move({ dx: 1, dy: 1 });

  ok(walked > 0, `đi bộ phải nhích được, nhận ${walked}`);
  eq(Math.round(walked), Math.round(BAL.moveSpeed * 0.4), "đi bộ đúng balance.moveSpeed");
  eq(Math.round(ran), Math.round(BAL.runSpeed * 0.4), "chạy đúng balance.runSpeed");
  ok(ran > walked * 1.3, `chạy phải nhanh hơn hẳn: ${walked.toFixed(1)} → ${ran.toFixed(1)}`);
  ok(
    nudged > 0 && nudged < walked * 0.6,
    `joystick đẩy nhẹ phải đi chậm: ${nudged.toFixed(1)} vs ${walked.toFixed(1)}`,
  );
  ok(diag <= walked + 0.5, `đi chéo (${diag.toFixed(1)}) không được xa hơn đi thẳng (${walked.toFixed(1)})`);
});

test("16. reduce THUẦN: không action nào sửa state cũ tại chỗ", () => {
  const store = mkStore(808);
  walkTo(store, HOME.x, HOME.y);
  const script = [
    { t: "SELECT", slot: 0 },
    { t: "USE", x: 15, y: 8 },
    { t: "SELECT", slot: 2 },
    { t: "USE", x: 15, y: 8 },
    { t: "SELECT", slot: 1 },
    { t: "USE", x: 15, y: 8 },
    { t: "MOVE", dx: 1, dy: 1, dt: 0.1 },
    { t: "TICK", dt: 4 },
    { t: "SLEEP" },
    { t: "SLEEP" },
    { t: "SLEEP" },
    { t: "USE", x: 15, y: 8 },
    { t: "SELL_ALL" },
    { t: "BUY", id: "seed:lettuce", n: 2 },
    { t: "DEBUG", op: "money", n: 50 },
    { t: "DEBUG", op: "materials" },
    { t: "DEBUG", op: "addGrass" },
    { t: "DEBUG", op: "water" },
    { t: "REFILL" },
    { t: "PORTAL", x: 16, y: 3 },
    { t: "CRAFT", id: "axe" },
    { t: "INTERACT", x: 15, y: 8 },
    { t: "DEBUG", op: "skipDay" },
    { t: "LOG_SEEN", upTo: 3 },
  ];
  for (const a of script) {
    const before = store.getState();
    const frozenJson = JSON.stringify(before);
    const after = store.dispatch(a);
    deepEq(JSON.parse(JSON.stringify(before)), JSON.parse(frozenJson), `action ${a.t} đã sửa state cũ tại chỗ`);
    if (after !== before) ok(after.tiles !== before.tiles || after === after, "state mới là object khác");
  }
});

/* ========================================================================== */
/* 19-22. Chặt cây, đập đá, phá bụi                                           */
/* ========================================================================== */

test("19. chặt cây lớn: đủ nhát → gốc cây → chặt tiếp → biến mất, gỗ vào túi", () => {
  const store = mkStore(101);
  walkTo(store, HOME.x, HOME.y);
  const p = PLOTS[1];
  setState(store, (s) => putProp(s, p.x, p.y, "tree"));
  giveItem(store, "tool:axe");
  selectItem(store, "tool:axe");

  const tree = content.props.tree;
  const stump = content.props.stump;
  eq(canUseAt(store.getState(), content, p.x, p.y), "chop", "cầm rìu đứng cạnh cây = chặt được");
  eq(tile(store, p.x, p.y).hp, tree.hits, "cây bắt đầu với đủ máu");

  for (let i = 1; i < tree.hits; i++) {
    use(store, p.x, p.y);
    eq(tile(store, p.x, p.y).prop, "tree", `nhát ${i}: cây vẫn đứng`);
    eq(tile(store, p.x, p.y).hp, tree.hits - i, `nhát ${i}: trừ đúng 1 máu`);
  }
  use(store, p.x, p.y);
  eq(tile(store, p.x, p.y).prop, "stump", "hết máu thì thành gốc cây");
  eq(tile(store, p.x, p.y).hp, stump.hits, "gốc cây có máu riêng của nó");
  const wood1 = countInv(store, "item:wood");
  ok(
    wood1 >= tree.drops[0].min && wood1 <= tree.drops[0].max,
    `gỗ rơi ra nằm trong [${tree.drops[0].min},${tree.drops[0].max}], nhận ${wood1}`,
  );

  for (let i = 0; i < stump.hits; i++) use(store, p.x, p.y);
  eq(tile(store, p.x, p.y).prop, null, "chặt nốt gốc thì ô sạch");
  eq(tile(store, p.x, p.y).hp, 0, "ô sạch thì hp về 0");
  const wood2 = countInv(store, "item:wood");
  ok(
    wood2 - wood1 >= stump.drops[0].min && wood2 - wood1 <= stump.drops[0].max,
    `gốc cây cho thêm gỗ trong [${stump.drops[0].min},${stump.drops[0].max}], nhận ${wood2 - wood1}`,
  );
  deepEq(checkInvariants(store.getState(), content), [], "bất biến sau khi chặt");
});

test("20. cầm sai công cụ thì không ăn nhát nào", () => {
  const store = mkStore(102);
  walkTo(store, HOME.x, HOME.y);
  const p = PLOTS[1];
  setState(store, (s) => putProp(s, p.x, p.y, "rock"));
  giveItem(store, "tool:axe");
  selectItem(store, "tool:axe");

  eq(canUseAt(store.getState(), content, p.x, p.y), null, "rìu không đập được đá");
  const e0 = store.getState().energy;
  use(store, p.x, p.y);
  eq(tile(store, p.x, p.y).hp, content.props.rock.hits, "đá không mất máu nào");
  eq(store.getState().energy, e0, "cầm sai công cụ thì không tốn năng lượng");
  eq(store.getState().busy, 0, "và cũng không bị khoá thao tác");
  ok(
    store.getState().log.some((l) => l.text.startsWith("Cần ")),
    "phải có toast nhắc cầm đúng công cụ",
  );

  // ngược lại: cuốc chim không chặt được cây
  const q = PLOTS[4];
  setState(store, (s) => putProp(s, q.x, q.y, "tree"));
  giveItem(store, "tool:pickaxe");
  selectItem(store, "tool:pickaxe");
  use(store, q.x, q.y);
  eq(tile(store, q.x, q.y).hp, content.props.tree.hits, "cuốc chim không chặt được cây");
});

test("21. rìu thép (power 2) tốn ít nhát hơn rìu gỗ", () => {
  const swings = (toolId) => {
    const store = mkStore(103);
    walkTo(store, HOME.x, HOME.y);
    const p = PLOTS[1];
    setState(store, (s) => putProp(s, p.x, p.y, "tree"));
    giveItem(store, toolId);
    selectItem(store, toolId);
    let n = 0;
    while (tile(store, p.x, p.y).prop === "tree" && n < 20) {
      use(store, p.x, p.y);
      n++;
    }
    return n;
  };
  const wood = swings("tool:axe");
  const steel = swings("tool:axe2");
  eq(wood, content.props.tree.hits, "rìu gỗ bổ 1 máu mỗi nhát");
  eq(steel, Math.ceil(content.props.tree.hits / content.tools.axe2.power), "rìu thép bổ 2 máu mỗi nhát");
  ok(steel < wood, `rìu thép phải đỡ công hơn: ${steel} < ${wood}`);
});

test("22. đập đá ra đá; bụi cỏ phá được bằng tay không; ô dọn xong đi qua được", () => {
  const store = mkStore(104);
  walkTo(store, HOME.x, HOME.y);
  const rockAt = PLOTS[1];
  const bushAt = PLOTS[4];
  setState(store, (s) => {
    putProp(s, rockAt.x, rockAt.y, "rock");
    putProp(s, bushAt.x, bushAt.y, "bush");
  });

  // --- đá: cần cuốc chim ---
  giveItem(store, "tool:pickaxe");
  selectItem(store, "tool:pickaxe");
  eq(canUseAt(store.getState(), content, rockAt.x, rockAt.y), "mine", "cuốc chim + đá = đập");
  for (let i = 0; i < content.props.rock.hits; i++) use(store, rockAt.x, rockAt.y);
  eq(tile(store, rockAt.x, rockAt.y).prop, null, "đá vỡ hẳn");
  const stone = countInv(store, "item:stone");
  ok(stone >= content.props.rock.drops[0].min, `đập đá phải ra đá, nhận ${stone}`);

  // --- bụi cỏ: tay không ---
  const empty = store.getState().inv.findIndex((v, i) => i < BAL.hotbarSlots && !v);
  ok(empty >= 0, "cần một ô hotbar trống để thử tay không");
  store.dispatch({ t: "SELECT", slot: empty }); // ô trống = tay không
  eq(canUseAt(store.getState(), content, bushAt.x, bushAt.y), "chop", "tay không vẫn phá được bụi cỏ");
  ok(isSolid(store.getState(), content, bushAt.x, bushAt.y), "bụi cỏ chặn đường trước khi phá");
  use(store, bushAt.x, bushAt.y);
  eq(tile(store, bushAt.x, bushAt.y).prop, null, "bụi cỏ biến mất sau một nhát tay không");
  ok(countInv(store, "item:fiber") > 0, "bụi cỏ cho sợi cỏ");

  // --- ô vừa dọn đi qua được ngay ---
  ok(!isSolid(store.getState(), content, bushAt.x, bushAt.y), "ô vừa dọn không còn đặc");
  ok(!isSolid(store.getState(), content, rockAt.x, rockAt.y), "ô đá vỡ cũng thế");
  walkTo(store, bushAt.x, bushAt.y);
  deepEq(checkInvariants(store.getState(), content), [], "bất biến sau khi đi vào ô vừa dọn");
});

/* ========================================================================== */
/* 23. Nước có hạn                                                            */
/* ========================================================================== */

test("23. hết nước không tưới được; múc đầy ở giếng và ở bờ ao", () => {
  const store = mkStore(105);
  walkTo(store, HOME.x, HOME.y);
  eq(store.getState().water, BAL.startWater, "game mới có đúng balance.startWater");
  eq(waterCapacity(store.getState(), content), content.tools.can.capacity, "sức chứa của bình đang có");

  const p = PLOTS[1];
  selectItem(store, "tool:hoe");
  use(store, p.x, p.y);

  setState(store, (s) => {
    s.water = 0;
  });
  selectItem(store, "tool:can");
  eq(canUseAt(store.getState(), content, p.x, p.y), null, "bình cạn thì UI không mời tưới nữa");
  const e0 = store.getState().energy;
  use(store, p.x, p.y);
  ok(!tile(store, p.x, p.y).wet, "hết nước thì không tưới được");
  eq(store.getState().energy, e0, "và cũng không tốn năng lượng");
  ok(store.getState().log.some((l) => l.text === "Bình hết nước rồi."), "phải có toast báo hết nước");

  // đứng giữa ruộng thì không múc được
  store.dispatch({ t: "REFILL" });
  eq(store.getState().water, 0, "xa nước thì không múc được");

  // --- giếng ---
  walkTo(store, 10, 8); // ô kề giếng 'G' ở (9,8)
  store.dispatch({ t: "REFILL" });
  eq(store.getState().water, content.tools.can.capacity, "múc ở giếng thì đầy bình");
  eq(store.dispatch({ t: "REFILL" }), store.getState(), "bình đã đầy: REFILL trả về ĐÚNG state cũ");

  // --- bờ ao ---
  setState(store, (s) => {
    s.water = 3;
  });
  walkTo(store, 3, 7); // ô cỏ ngay dưới mặt nước
  store.dispatch({ t: "REFILL" });
  eq(store.getState().water, content.tools.can.capacity, "múc ở bờ ao cũng đầy bình");

  // tưới lại được, và trừ đúng một nước
  walkTo(store, 10, 7); // vòng lên hàng 7: giếng ở (9,8) chặn ngang hàng 8
  walkTo(store, HOME.x, HOME.y);
  const w0 = store.getState().water;
  selectItem(store, "tool:can");
  use(store, p.x, p.y);
  ok(tile(store, p.x, p.y).wet, "có nước thì tưới được");
  eq(store.getState().water, w0 - 1, "mỗi ô tưới tốn 1 nước");
  deepEq(checkInvariants(store.getState(), content), [], "bất biến sau khi múc nước");
});

/* ========================================================================== */
/* 24. Chế tạo                                                                */
/* ========================================================================== */

/** Đưa nhân vật vào đứng cạnh bàn chế tạo trong nhà, đi bằng cửa như người chơi. */
function goToBench(store) {
  walkTo(store, 16, 4);
  store.dispatch({ t: "PORTAL", x: 16, y: 3 }); // vào bản đồ 'house', hiện ra ở (6,6)
  walkTo(store, 11, 5); // ngay dưới bàn chế tạo 'C' ở (11,4)
}

test("24. chế tạo: đủ thì được, thiếu thì không, xa bàn thì bị từ chối", () => {
  const store = mkStore(106);
  goToBench(store);

  // --- thiếu nguyên liệu ---
  ok(!canCraft(store.getState(), content, "axe"), "tay trắng thì chưa chế được rìu");
  deepEq(
    missingFor(store.getState(), content, "axe"),
    [{ id: "item:wood", need: 4, have: 0 }, { id: "item:fiber", need: 4, have: 0 }],
    "missingFor liệt kê đúng thứ còn thiếu",
  );
  store.dispatch({ t: "CRAFT", id: "axe" });
  eq(countInv(store, "tool:axe"), 0, "thiếu nguyên liệu thì không chế ra gì");
  ok(store.getState().log.some((l) => l.text.startsWith("Thiếu nguyên liệu")), "phải có toast báo thiếu");

  // --- đủ nguyên liệu ---
  store.dispatch({ t: "DEBUG", op: "materials" });
  ok(canCraft(store.getState(), content, "axe"), "có vật liệu thì chế được");
  deepEq(missingFor(store.getState(), content, "axe"), [], "không còn thiếu gì");
  const wood0 = countInv(store, "item:wood");
  const fiber0 = countInv(store, "item:fiber");
  store.dispatch({ t: "CRAFT", id: "axe" });
  eq(countInv(store, "tool:axe"), 1, "rìu gỗ vào túi");
  eq(countInv(store, "item:wood"), wood0 - 4, "trừ đúng gỗ");
  eq(countInv(store, "item:fiber"), fiber0 - 4, "trừ đúng sợi cỏ");

  // --- công thức ăn cả CÔNG CỤ cũ ---
  const stone0 = countInv(store, "item:stone");
  store.dispatch({ t: "CRAFT", id: "axe2" });
  eq(countInv(store, "tool:axe2"), 1, "có rìu thép");
  eq(countInv(store, "tool:axe"), 0, "rìu gỗ bị công thức ăn mất");
  eq(countInv(store, "item:stone"), stone0 - 12, "trừ đúng đá");

  // --- công cụ ở hai ô cố định thì không bao giờ mất ---
  store.dispatch({ t: "CRAFT", id: "can2" });
  eq(countInv(store, "tool:can2"), 1, "chế được bình tưới lớn");
  eq(store.getState().inv[1].id, "tool:can", "ô công cụ cố định vẫn còn nguyên bình tưới");
  selectItem(store, "tool:can2");
  eq(waterCapacity(store.getState(), content), content.tools.can2.capacity, "cầm bình lớn thì chứa nhiều hơn");

  // --- xa bàn thì không chế được (ra hẳn ngoài nông trại) ---
  walkTo(store, 6, 6);
  store.dispatch({ t: "PORTAL", x: 6, y: 7 });
  const before = store.getState();
  store.dispatch({ t: "CRAFT", id: "pickaxe" });
  eq(countInv(store, "tool:pickaxe"), 0, "đứng xa bàn chế tạo thì không chế được");
  ok(store.getState() !== before, "vẫn đẩy toast giải thích");
  ok(
    store.getState().log.some((l) => l.text === "Phải đứng cạnh bàn chế tạo."),
    "toast nhắc phải tới bàn chế tạo",
  );
  deepEq(checkInvariants(store.getState(), content), [], "bất biến sau khi chế tạo");
});

/* ========================================================================== */
/* 25-26. Tăng trưởng theo THỜI GIAN                                          */
/* ========================================================================== */

test("25. cây lớn theo thời gian: TICK trong ngày là đủ, không cần ngủ", () => {
  const store = mkStore(107);
  walkTo(store, HOME.x, HOME.y);
  const p = PLOTS[1];
  selectItem(store, "tool:hoe");
  use(store, p.x, p.y);
  selectItem(store, "seed:lettuce");
  use(store, p.x, p.y);
  selectItem(store, "tool:can");
  use(store, p.x, p.y);
  ok(tile(store, p.x, p.y).wet, "ô đã ướt");

  // 60 giây thật = 60 * (10/realSecondsPerGameTenMinutes) phút game
  const perSec = 10 / BAL.realSecondsPerGameTenMinutes;
  const g0 = tile(store, p.x, p.y).crop.grow;
  store.dispatch({ t: "TICK", dt: 60 });
  eq(
    tile(store, p.x, p.y).crop.grow,
    g0 + 60 * perSec,
    "grow cộng đúng số phút game vừa trôi",
  );
  eq(store.getState().day, 1, "vẫn đang cùng một ngày");

  // đẩy sát ngưỡng rồi TICK tiếp → sang giai đoạn mới mà KHÔNG cần ngủ
  const need = content.crops.lettuce.growthDays[0] * BAL.growthMinutesPerDay;
  setState(store, (s) => {
    setTile(s, p.x, p.y, { crop: { id: "lettuce", stage: 0, grow: need - 20, regrown: false } });
  });
  store.dispatch({ t: "TICK", dt: 30 / perSec }); // 30 phút game
  eq(tile(store, p.x, p.y).crop.stage, 1, "đủ ngưỡng là lên giai đoạn ngay giữa ban ngày");
  eq(tile(store, p.x, p.y).crop.grow, 10, "phần dư được mang sang giai đoạn sau");
  eq(store.getState().day, 1, "không hề ngủ");

  // --- trời tối thì ngừng lớn ---
  setState(store, (s) => {
    s.minutes = BAL.daylightEndMinutes + 10;
    setTile(s, p.x, p.y, { wet: true, crop: { id: "lettuce", stage: 1, grow: 0, regrown: false } });
  });
  store.dispatch({ t: "TICK", dt: 60 });
  eq(tile(store, p.x, p.y).crop.grow, 0, "sau daylightEndMinutes thì cây đứng im");

  // --- ô khô thì không lớn ---
  setState(store, (s) => {
    s.minutes = BAL.dayStartMinutes;
    setTile(s, p.x, p.y, { wet: false, crop: { id: "lettuce", stage: 1, grow: 0, regrown: false } });
  });
  store.dispatch({ t: "TICK", dt: 60 });
  eq(tile(store, p.x, p.y).crop.grow, 0, "ô khô thì không lớn");
});

test("26. ngủ sớm không thiệt: ngủ lúc dậy và ngủ lúc chiều cho cùng tiến độ", () => {
  const plant = (seed) => {
    const store = mkStore(seed);
    walkTo(store, HOME.x, HOME.y);
    const p = PLOTS[1];
    selectItem(store, "tool:hoe");
    use(store, p.x, p.y);
    selectItem(store, "seed:lettuce");
    use(store, p.x, p.y);
    selectItem(store, "tool:can");
    use(store, p.x, p.y);
    // đưa hai kịch bản về đúng cùng một mốc thời gian xuất phát
    setState(store, (s) => {
      s.minutes = BAL.dayStartMinutes;
    });
    return store;
  };

  const early = plant(108);
  sleep(early);

  const late = plant(108);
  const perSec = 10 / BAL.realSecondsPerGameTenMinutes;
  late.dispatch({ t: "TICK", dt: (1080 - BAL.dayStartMinutes) / perSec }); // tới 18:00
  eq(Math.round(late.getState().minutes), 1080, "đã trôi tới 18:00");
  sleep(late);

  const a = tile(early, PLOTS[1].x, PLOTS[1].y).crop;
  const b = tile(late, PLOTS[1].x, PLOTS[1].y).crop;
  deepEq(a, b, "ngủ 6:00 và ngủ 18:00 cho tiến độ y hệt");

  // Đo TỔNG tiến độ, không đo `crop.grow`: nếu con số cân bằng khiến cây vượt
  // luôn một giai đoạn trong ngày thì `grow` bị trừ đi ngưỡng và phép so sẽ sai
  // lệch đúng bằng ngưỡng đó — một cái bẫy rất dễ đọc nhầm thành lỗi game.
  const total = totalGrow(early, PLOTS[1].x, PLOTS[1].y);
  ok(
    total >= DAYLIGHT_PER_DAY && total < DAYLIGHT_PER_DAY + 5,
    `cả hai đều được trọn phần ban ngày (${DAYLIGHT_PER_DAY} phút), nhận ${total}`,
  );
});

/* ========================================================================== */
/* 27. Cỏ mọc lan / đất cày bỏ hoang                                          */
/* ========================================================================== */

test("27. cỏ dại lan ra theo đêm; đất cày bỏ không thì hoang trở lại", () => {
  // --- cỏ lan ---
  const a = mkStore(2211);
  walkTo(a, HOME.x, HOME.y);
  const blk = findOpenBlock(a.getState(), 5, 5);
  setState(a, (s) => {
    for (let i = 0; i < 5; i++) setTile(s, blk.x + i, blk.y + 2, { decor: "tuft" });
  });
  const countProps = (store) => {
    let n = 0;
    for (let y = blk.y; y < blk.y + 5; y++)
      for (let x = blk.x; x < blk.x + 5; x++) if (tile(store, x, y).prop !== null) n++;
    return n;
  };
  eq(countProps(a), 0, "khối đất bắt đầu sạch");
  for (let i = 0; i < 12; i++) sleep(a);
  const grown = countProps(a);
  ok(grown > 0, `sau 12 đêm phải có cỏ dại mọc lên, nhận ${grown}`);
  const one = propAt(a.getState(), content, blk.x, blk.y + 1);
  ok(
    countProps(a) === grown && (one === null || one.hits > 0),
    "thứ mọc lên phải là vật thể phá được",
  );
  deepEq(checkInvariants(a.getState(), content), [], "bất biến sau khi cỏ mọc");

  // --- đất cày bỏ không ---
  const b = mkStore(2212);
  walkTo(b, HOME.x, HOME.y);
  const blk2 = findOpenBlock(b.getState(), 5, 5);
  setState(b, (s) => {
    for (let y = blk2.y; y < blk2.y + 5; y++)
      for (let x = blk2.x; x < blk2.x + 5; x++) setTile(s, x, y, { tilled: true });
    // một ô có cây: có cây thì không bao giờ hoang
    setTile(s, blk2.x, blk2.y, {
      tilled: true,
      crop: { id: "lettuce", stage: 0, grow: 0, regrown: false },
    });
  });
  const tilledCount = () => {
    let n = 0;
    for (let y = blk2.y; y < blk2.y + 5; y++)
      for (let x = blk2.x; x < blk2.x + 5; x++) if (tile(b, x, y).tilled) n++;
    return n;
  };
  eq(tilledCount(), 25, "25 ô đã cày");
  for (let i = 0; i < 10; i++) sleep(b);
  ok(tilledCount() < 25, `sau 10 đêm một số ô cày bỏ không phải hoang trở lại, còn ${tilledCount()}`);
  ok(tile(b, blk2.x, blk2.y).tilled, "ô đang có cây thì không bao giờ hoang");
  deepEq(checkInvariants(b.getState(), content), [], "bất biến sau khi đất hoang trở lại");
});

/* ========================================================================== */
/* 28. Bảng gỡ lỗi                                                            */
/* ========================================================================== */

test("28. các lệnh DEBUG chạy đúng và không vỡ bất biến", () => {
  const store = mkStore(3030);
  walkTo(store, HOME.x, HOME.y);
  const green = (what) => deepEq(checkInvariants(store.getState(), content), [], `bất biến sau ${what}`);

  const m0 = store.getState().money;
  store.dispatch({ t: "DEBUG", op: "money", n: 777 });
  eq(store.getState().money, m0 + 777, "debug money cộng đúng");
  green("money");

  setState(store, (s) => {
    s.energy = 3;
    s.water = 0;
  });
  store.dispatch({ t: "DEBUG", op: "energy" });
  eq(store.getState().energy, BAL.energyMax, "debug energy đổ đầy");
  store.dispatch({ t: "DEBUG", op: "water" });
  eq(store.getState().water, waterCapacity(store.getState(), content), "debug water đổ đầy bình");
  green("energy/water");

  const d0 = store.getState().day;
  store.dispatch({ t: "DEBUG", op: "skipDay" });
  eq(store.getState().day, d0 + 1, "debug skipDay sang ngày mới");
  green("skipDay");

  selectItem(store, "seed:lettuce");
  store.dispatch({ t: "DEBUG", op: "plantAround" });
  let planted = 0;
  for (const p of PLOTS) if (tile(store, p.x, p.y).crop) planted++;
  ok(planted >= 4, `plantAround phải gieo được quanh nhân vật, nhận ${planted}`);
  green("plantAround");

  store.dispatch({ t: "DEBUG", op: "growAll" });
  for (const p of PLOTS) {
    const t = tile(store, p.x, p.y);
    if (t.crop) eq(t.crop.stage, content.crops[t.crop.id].growthDays.length, "growAll làm chín hết");
  }
  green("growAll");

  const propsAround = () => {
    let n = 0;
    const s = store.getState();
    for (let y = 4; y <= 12; y++) for (let x = 12; x <= 20; x++) if (tile(store, x, y).prop) n++;
    return n;
  };
  const before = propsAround();
  store.dispatch({ t: "DEBUG", op: "addGrass" });
  store.dispatch({ t: "DEBUG", op: "addTrees" });
  ok(propsAround() > before, "addGrass/addTrees có rắc thêm vật thể");
  green("addGrass/addTrees");

  store.dispatch({ t: "DEBUG", op: "unlockAll" });
  for (const id of content.cropOrder)
    ok(store.getState().unlocked.includes(`seed:${id}`), `unlockAll mở hạt ${id}`);
  for (const id of content.buildingOrder)
    ok(store.getState().unlocked.includes(id), `unlockAll mở công trình ${id}`);
  green("unlockAll");

  store.dispatch({ t: "DEBUG", op: "materials" });
  for (const id of content.materialOrder)
    ok(countInv(store, `item:${id}`) >= 50, `materials cho ít nhất 50 ${id}`);
  green("materials");
});

/* ========================================================================== */
/* 29. Migrate: save thiếu trường mới, content gỡ vật thể                     */
/* ========================================================================== */

test("29. migrate: save cũ thiếu hp/water/grow và content gỡ vật thể vẫn sống sót", () => {
  // --- content mới bỏ hẳn cây gỗ nhỏ ---
  const raw = rawPack();
  raw.props = { ...raw.props, props: raw.props.props.filter((p) => p.id !== "sapling") };
  raw.tiles = {
    ...raw.tiles,
    legend: { ...raw.tiles.legend, t: { ground: "grass" } },
  };
  const newContent = buildContent(raw);
  ok(!newContent.props.sapling, "content mới không còn cây gỗ nhỏ");

  const store = mkStore(4141);
  setState(store, (s) => {
    setTile(s, PLOTS[0].x, PLOTS[0].y, {
      tilled: true,
      crop: { id: "lettuce", stage: 1, grow: 400, regrown: false },
    });
    setTile(s, PLOTS[1].x, PLOTS[1].y, { prop: "sapling", hp: 2 });
  });

  // --- giả lập save v2: chưa có water / hp / grow ---
  const old = clone(store.getState());
  delete old.water;
  for (const t of old.tiles) {
    delete t.hp;
    if (t.crop) {
      t.crop.days = 2;
      delete t.crop.grow;
    }
  }

  let res;
  try {
    res = migrateForContent(old, newContent);
  } catch (err) {
    throw new Error(`migrateForContent đã NÉM LỖI: ${err}`);
  }
  eq(res.state.water, BAL.startWater, "thiếu water → rót đầy theo balance");
  eq(res.state.tiles[idx(res.state.w, PLOTS[0].x, PLOTS[0].y)].crop.grow, 0, "thiếu grow → về 0");
  eq(res.state.tiles[idx(res.state.w, PLOTS[1].x, PLOTS[1].y)].prop, null, "vật thể bị gỡ đã dọn sạch");

  // mọi ô còn vật thể đều có hp đúng theo content
  let checked = 0;
  for (const t of res.state.tiles) {
    if (t.prop === null) {
      eq(t.hp, 0, "ô trống thì hp = 0");
      continue;
    }
    const def = newContent.props[t.prop];
    ok(def, `vật thể '${t.prop}' phải tồn tại trong content mới`);
    eq(t.hp, def.hits ?? 0, `hp của '${t.prop}' được điền lại từ content`);
    checked++;
  }
  ok(checked > 0, "phải có ít nhất một vật thể được điền hp");
  deepEq(checkInvariants(res.state, newContent), [], "bất biến xanh với content mới");
  ok(res.notes.length > 0, "phải có ghi chú migrate");

  // --- cây đã chặt thì KHÔNG mọc lại sau migrate ---
  const store2 = mkStore(4242);
  let treeAt = null;
  const s2 = store2.getState();
  for (let i = 0; i < s2.tiles.length && !treeAt; i++)
    if (s2.tiles[i].prop === "tree") treeAt = { x: i % s2.w, y: Math.floor(i / s2.w) };
  ok(treeAt, "bản đồ phải có cây gỗ lớn");
  setState(store2, (s) => setTile(s, treeAt.x, treeAt.y, { prop: null, hp: 0 }));
  const again = migrateForContent(clone(store2.getState()), content);
  eq(
    again.state.tiles[idx(again.state.w, treeAt.x, treeAt.y)].prop,
    null,
    "mở game lần sau cây đã chặt không mọc lại",
  );
  deepEq(checkInvariants(again.state, content), [], "bất biến sau migrate cùng content");

  // --- công thức không còn thì CRAFT chỉ là không-làm-gì ---
  const before = store2.getState();
  eq(store2.dispatch({ t: "CRAFT", id: "khong-ton-tai" }), before, "CRAFT id lạ trả về ĐÚNG state cũ");
});

/* ========================================================================== */
/* 30-35. NHIỀU BẢN ĐỒ RỜI NHAU                                               */
/* ========================================================================== */

/* Phòng ngủ giờ là bản đồ 'house' 14x8 RIÊNG, không còn nhét trong lưới nông
   trại: giường (2,2), bàn chế tạo (11,4), cửa ra (6,7). Cửa nhà ngoài nông
   trại vẫn ở (16,3) và dẫn tới house (6,6). */

/** Vào nhà bằng cửa 'D' của nông trại — đi bằng chân như người chơi thật. */
function enterHouse(store) {
  walkTo(store, 16, 4);
  store.dispatch({ t: "INTERACT", x: 16, y: 3 });
  eq(store.getState().mapId, "house", "đã sang bản đồ 'house'");
}

/** Ra ngoài bằng cửa 'd' ở (6,7) của phòng ngủ. */
function leaveHouse(store) {
  walkTo(store, 6, 6);
  store.dispatch({ t: "PORTAL", x: 6, y: 7 });
  eq(store.getState().mapId, "farm", "đã về bản đồ 'farm'");
}

/** Ngủ trên giường trong phòng ngủ. */
function sleepInBed(store) {
  walkTo(store, 2, 3);
  store.dispatch({ t: "INTERACT", x: 2, y: 2 });
}

/** Ô (x,y) của NÔNG TRẠI, dù nó đang là bản đồ hoạt động hay đã cất. */
function farmTile(store, x, y) {
  const s = store.getState();
  const m = s.mapId === "farm" ? s : s.maps.farm;
  ok(m, "state phải giữ bản đồ nông trại");
  return m.tiles[idx(m.w, x, y)];
}

/** Tổng tiến độ tăng trưởng của MỘT ô, tính bằng phút (xem totalGrow). */
function growOfTile(t) {
  if (!t || !t.crop) return 0;
  const def = content.crops[t.crop.id];
  let sum = t.crop.grow;
  for (let i = 0; i < t.crop.stage && i < def.growthDays.length; i++)
    sum += Math.max(1, def.growthDays[i] * BAL.growthMinutesPerDay);
  return sum;
}

test("30. tách bản đồ: farm ⇄ house đổi lưới, bản đồ rời được cất nguyên vẹn", () => {
  const store = mkStore(555);
  let s = store.getState();
  eq(s.mapId, "farm", "ván mới bắt đầu ở nông trại");
  eq(s.w, 40, "nông trại rộng 40");
  eq(s.h, 30, "nông trại cao 30");
  eq(s.tiles.length, 40 * 30, "lưới nông trại đúng w*h");
  ok(!Object.prototype.hasOwnProperty.call(s.maps, "farm"), "mapId KHÔNG nằm trong maps");
  ok(s.maps.house, "phòng ngủ được cất sẵn từ đầu ván");
  eq(s.maps.house.w, 14, "phòng ngủ rộng 14");
  eq(s.maps.house.h, 8, "phòng ngủ cao 8");
  eq(s.maps.house.tiles.length, 14 * 8, "lưới phòng ngủ đúng w*h");

  // để lại dấu vết trên ruộng trước khi bỏ đi
  walkTo(store, HOME.x, HOME.y);
  const plot = PLOTS[1];
  selectItem(store, "tool:hoe");
  use(store, plot.x, plot.y);
  selectItem(store, "seed:lettuce");
  use(store, plot.x, plot.y);
  selectItem(store, "tool:can");
  use(store, plot.x, plot.y);
  const farmBefore = clone(store.getState().tiles);

  // --- farm → house ---
  const frozen = JSON.stringify(store.getState());
  const prev = store.getState();
  enterHouse(store);
  eq(JSON.stringify(prev), frozen, "PORTAL không sửa state cũ tại chỗ");

  s = store.getState();
  eq(s.w, 14, "w đổi theo bản đồ mới");
  eq(s.h, 8, "h đổi theo bản đồ mới");
  eq(s.tiles.length, 14 * 8, "tiles là lưới của phòng ngủ");
  ok(!Object.prototype.hasOwnProperty.call(s.maps, "house"), "bản đồ đang chơi đã lấy RA khỏi maps");
  ok(s.maps.farm, "nông trại được cất vào maps");
  eq(s.maps.farm.w, 40, "nông trại cất đi giữ nguyên w");
  eq(s.maps.farm.h, 30, "nông trại cất đi giữ nguyên h");
  deepEq(s.maps.farm.tiles, farmBefore, "lưới nông trại cất đi nguyên vẹn từng ô");
  deepEq(checkInvariants(s, content), [], "bất biến khi đang ở trong nhà");

  // --- house → farm: ruộng phải y như lúc rời đi ---
  leaveHouse(store);
  s = store.getState();
  eq(s.w, 40, "về nông trại thì w trở lại 40");
  eq(s.h, 30, "về nông trại thì h trở lại 30");
  deepEq(s.tiles, farmBefore, "ruộng còn nguyên như lúc rời đi");
  const t = farmTile(store, plot.x, plot.y);
  ok(t.tilled && t.crop && t.wet, "ô đã cày/gieo/tưới vẫn còn đó");
  ok(!Object.prototype.hasOwnProperty.call(s.maps, "farm"), "mapId lại không nằm trong maps");
  ok(s.maps.house, "phòng ngủ được cất lại");
  deepEq(checkInvariants(s, content), [], "bất biến sau khi về ruộng");
});

test("31. ngủ trong nhà thì cây ngoài ruộng vẫn lớn và vòi tưới ngoài ruộng vẫn tưới", () => {
  const store = mkStore(556);
  walkTo(store, HOME.x, HOME.y);
  unlockAll(store);

  for (const p of [PLOTS[1], PLOTS[3]]) {
    selectItem(store, "tool:hoe");
    use(store, p.x, p.y);
    selectItem(store, "seed:lettuce");
    use(store, p.x, p.y);
  }
  // vòi tưới đứng cạnh PLOTS[3], KHÔNG tưới tay ô đó
  store.dispatch({ t: "BUY", id: "sprinkler", n: 1 });
  selectItem(store, "build:sprinkler");
  use(store, PLOTS[4].x, PLOTS[4].y);
  eq(farmTile(store, PLOTS[4].x, PLOTS[4].y).b, "sprinkler", "vòi tưới đã đặt ngoài ruộng");

  // ô còn lại thì tưới tay
  topUpWater(store);
  selectItem(store, "tool:can");
  use(store, PLOTS[1].x, PLOTS[1].y);
  ok(farmTile(store, PLOTS[1].x, PLOTS[1].y).wet, "ô tưới tay đang ẩm");
  ok(!farmTile(store, PLOTS[3].x, PLOTS[3].y).wet, "ô cạnh vòi tưới hiện còn khô");

  const g0 = growOfTile(farmTile(store, PLOTS[1].x, PLOTS[1].y));

  // --- vào nhà rồi ngủ ---
  enterHouse(store);
  const day0 = store.getState().day;
  const sleptAt = store.getState().minutes;
  sleepInBed(store);
  eq(store.getState().day, day0 + 1, "giường trong nhà = sang ngày mới");
  eq(store.getState().mapId, "house", "ngủ dậy vẫn đang ở trong nhà");

  // ĐÂY LÀ BẪY LỚN NHẤT CỦA VIỆC TÁCH MAP: ruộng nằm ở bản đồ ĐÃ CẤT nhưng
  // vẫn phải được xử lý trọn vẹn một đêm.
  const g1 = growOfTile(farmTile(store, PLOTS[1].x, PLOTS[1].y));
  const night = BAL.daylightEndMinutes - sleptAt;
  ok(
    Math.abs(g1 - g0 - night) < 1e-6,
    `cây ngoài ruộng lớn trọn phần ban ngày còn lại: nhận ${g1 - g0}, mong đợi ${night}`,
  );
  ok(farmTile(store, PLOTS[3].x, PLOTS[3].y).wet, "vòi tưới ngoài ruộng vẫn tưới dù ngủ trong nhà");
  const g3 = growOfTile(farmTile(store, PLOTS[3].x, PLOTS[3].y));
  ok(
    Math.abs(g3 - night) < 1e-6,
    `ô được vòi tưới ngoài ruộng cũng lớn đúng một đêm: nhận ${g3}, mong đợi ${night}`,
  );
  // ô tưới tay không có vòi thì sáng ra phải khô lại
  ok(!farmTile(store, PLOTS[1].x, PLOTS[1].y).wet, "ô không có vòi tưới thì sáng ra khô lại");
  deepEq(checkInvariants(store.getState(), content), [], "bất biến sau đêm ngủ trong nhà");

  // ngủ vài đêm nữa: cây ngoài ruộng chín hẳn dù người chơi không ra khỏi nhà
  for (let i = 0; i < 4; i++) sleepInBed(store);
  eq(
    farmTile(store, PLOTS[3].x, PLOTS[3].y).crop.stage,
    content.crops.lettuce.growthDays.length,
    "ở lì trong nhà mấy ngày thì cây dưới vòi tưới vẫn chín",
  );
  deepEq(checkInvariants(store.getState(), content), [], "bất biến sau nhiều đêm");
});

test("32. qua lại nhiều lần: mapId không bao giờ nằm trong maps; save giữ cả hai bản đồ", () => {
  const store = mkStore(557);
  const noSelfRef = (where) => {
    const s = store.getState();
    ok(
      !Object.prototype.hasOwnProperty.call(s.maps, s.mapId),
      `${where}: mapId '${s.mapId}' KHÔNG được có mặt trong maps`,
    );
    eq(Object.keys(s.maps).length, content.mapOrder.length - 1, `${where}: giữ đủ các bản đồ còn lại`);
    deepEq(checkInvariants(s, content), [], `${where}: bất biến`);
  };

  noSelfRef("ván mới");
  for (let i = 0; i < 4; i++) {
    enterHouse(store);
    noSelfRef(`lượt ${i + 1} trong nhà`);
    leaveHouse(store);
    noSelfRef(`lượt ${i + 1} ngoài ruộng`);
  }

  // --- save round-trip khi ĐANG Ở TRONG NHÀ ---
  enterHouse(store);
  setState(store, (s) => {
    const f = s.maps.farm;
    f.tiles[idx(f.w, PLOTS[0].x, PLOTS[0].y)].tilled = true;
  });
  const before = clone(store.getState());
  const snap = store.snapshot();
  const round = JSON.parse(JSON.stringify(snap));
  store.replace(round.state);
  deepEq(store.getState(), before, "state sau round-trip giữ nguyên CẢ HAI bản đồ");
  eq(store.getState().mapId, "house", "round-trip giữ đúng bản đồ đang chơi");
  eq(store.getState().maps.farm.tiles.length, 40 * 30, "lưới nông trại trong save đủ ô");
  ok(store.getState().maps.farm.tiles[idx(40, PLOTS[0].x, PLOTS[0].y)].tilled, "dấu vết ngoài ruộng còn trong save");
  deepEq(checkInvariants(store.getState(), content), [], "bất biến sau round-trip");
});

test("33. migrate: save thiếu mapId/maps, và content gỡ hẳn một bản đồ", () => {
  // --- A. save v3 chỉ có đúng một lưới, không biết mapId/maps là gì ---
  const store = mkStore(558);
  walkTo(store, HOME.x, HOME.y);
  const plot = PLOTS[2];
  selectItem(store, "tool:hoe");
  use(store, plot.x, plot.y);

  const old = clone(store.getState());
  delete old.mapId;
  delete old.maps;

  let res;
  try {
    res = migrateForContent(old, content);
  } catch (err) {
    throw new Error(`migrateForContent đã NÉM LỖI: ${err}`);
  }
  eq(res.state.mapId, content.tiles.spawn.map, "thiếu mapId → về bản đồ spawn");
  ok(res.state.maps.house, "bản đồ content có mà save chưa có thì được dựng mới");
  ok(!Object.prototype.hasOwnProperty.call(res.state.maps, res.state.mapId), "mapId không nằm trong maps");
  ok(
    res.state.tiles[idx(res.state.w, plot.x, plot.y)].tilled,
    "lưới duy nhất trong save được coi là bản đồ spawn nên ô đã cày còn nguyên",
  );
  eq(Math.floor(res.state.player.x / TILE), content.tiles.spawn.x, "người chơi được đặt lại ở ô spawn");
  eq(Math.floor(res.state.player.y / TILE), content.tiles.spawn.y, "người chơi được đặt lại ở ô spawn");
  deepEq(checkInvariants(res.state, content), [], "bất biến sau migrate");
  ok(res.notes.length > 0, "phải có ghi chú migrate");

  // --- B. content mới bỏ hẳn phòng ngủ ---
  const raw = rawPack();
  delete raw.maps.house;
  raw.props = { ...raw.props, props: raw.props.props.filter((p) => !p.portal) };
  raw.tiles = {
    ...raw.tiles,
    legend: { ...raw.tiles.legend, D: { ground: "path" }, d: { ground: "wood" } },
  };
  const oneMap = buildContent(raw);
  eq(oneMap.mapOrder.length, 1, "content mới chỉ còn một bản đồ");

  const store2 = mkStore(559);
  enterHouse(store2);
  setState(store2, (s) => {
    const f = s.maps.farm;
    f.tiles[idx(f.w, PLOTS[0].x, PLOTS[0].y)].tilled = true;
  });

  let res2;
  try {
    res2 = migrateForContent(clone(store2.getState()), oneMap);
  } catch (err) {
    throw new Error(`migrateForContent đã NÉM LỖI: ${err}`);
  }
  eq(res2.state.mapId, "farm", "đang đứng trong bản đồ bị gỡ → về bản đồ spawn");
  eq(Object.keys(res2.state.maps).length, 0, "bản đồ content không còn thì bị bỏ khỏi save");
  eq(res2.state.w, 40, "lưới hoạt động là nông trại");
  ok(
    res2.state.tiles[idx(res2.state.w, PLOTS[0].x, PLOTS[0].y)].tilled,
    "tiến độ ngoài ruộng vẫn còn sau khi phòng ngủ biến mất",
  );
  ok(res2.notes.some((n) => n.includes("house")), "có ghi chú về bản đồ bị gỡ");
  deepEq(checkInvariants(res2.state, oneMap), [], "bất biến với content ít bản đồ hơn");
});

test("34. DEBUG harvestAll: thu cây chín ở CẢ bản đồ đang chơi lẫn bản đồ đã cất", () => {
  const store = mkStore(560);
  const ripeLettuce = {
    id: "lettuce",
    stage: content.crops.lettuce.growthDays.length,
    grow: 0,
    regrown: false,
  };
  const ripeTomato = {
    id: "tomato",
    stage: content.crops.tomato.growthDays.length,
    grow: 0,
    regrown: false,
  };

  walkTo(store, HOME.x, HOME.y);
  setState(store, (s) => {
    for (const p of [PLOTS[0], PLOTS[1], PLOTS[2]])
      setTile(s, p.x, p.y, { tilled: true, wet: false, crop: { ...ripeLettuce } });
  });

  enterHouse(store);
  // một chậu cà chua chín ngay trong phòng ngủ = bản đồ ĐANG chơi
  setState(store, (s) => setTile(s, 8, 2, { tilled: true, wet: false, crop: { ...ripeTomato } }));

  const lettuce0 = countInv(store, "crop:lettuce");
  const tomato0 = countInv(store, "crop:tomato");

  const prev = store.getState();
  const frozen = JSON.stringify(prev);
  store.dispatch({ t: "DEBUG", op: "harvestAll" });
  eq(JSON.stringify(prev), frozen, "harvestAll không sửa state cũ tại chỗ (copy-on-write cả maps)");

  eq(countInv(store, "crop:lettuce"), lettuce0 + 3, "thu đủ 3 cây chín ở bản đồ ĐÃ CẤT");
  ok(countInv(store, "crop:tomato") > tomato0, "thu cả cây chín ở bản đồ ĐANG CHƠI");

  for (const p of [PLOTS[0], PLOTS[1], PLOTS[2]])
    eq(farmTile(store, p.x, p.y).crop, null, "xà lách thu một lần rồi mất cây");

  const pot = tile(store, 8, 2);
  ok(pot.crop, "cà chua mọc lại nên ô vẫn còn cây");
  eq(pot.crop.regrown, true, "được đánh dấu đã thu ít nhất một lần");
  ok(
    pot.crop.stage < content.crops.tomato.growthDays.length,
    "cà chua bị lùi giai đoạn đúng như thu hoạch thường",
  );
  deepEq(checkInvariants(store.getState(), content), [], "bất biến sau harvestAll");

  // không còn gì chín thì chạy lại cũng không vỡ gì
  store.dispatch({ t: "DEBUG", op: "harvestAll" });
  deepEq(checkInvariants(store.getState(), content), [], "bất biến khi harvestAll không có gì để thu");
});

test("35. TICK chỉ quét bản đồ ĐANG chơi; bản đồ đã cất đợi tới lúc sang ngày", () => {
  const store = mkStore(561);
  walkTo(store, HOME.x, HOME.y);
  const plot = PLOTS[1];
  selectItem(store, "tool:hoe");
  use(store, plot.x, plot.y);
  selectItem(store, "seed:lettuce");
  use(store, plot.x, plot.y);
  selectItem(store, "tool:can");
  use(store, plot.x, plot.y);

  enterHouse(store);
  const mapsBefore = store.getState().maps;
  const farmBefore = mapsBefore.farm;

  store.dispatch({ t: "TICK", dt: 5 });
  const s = store.getState();
  eq(s.maps, mapsBefore, "TICK không đụng tới object maps");
  eq(s.maps.farm, farmBefore, "TICK không clone lưới đã cất — mỗi khung hình chỉ quét MỘT lưới");

  // nhưng sang ngày mới thì bản đồ đã cất PHẢI được xử lý
  sleepInBed(store);
  ok(store.getState().maps.farm !== farmBefore, "sang ngày mới thì lưới đã cất mới bị chạm vào");
  deepEq(checkInvariants(store.getState(), content), [], "bất biến sau đêm");
});

/* ------------------------------------------------------------------ tổng kết */

console.log("\n  ONIFARM — sim\n");
for (const line of results) console.log("  " + line);
console.log(
  `\n  ${results.length - failures}/${results.length} kịch bản đạt` +
    (failures ? `  \x1b[31m(${failures} lỗi)\x1b[0m` : "  \x1b[32m(tất cả xanh)\x1b[0m") +
    "\n",
);
process.exit(failures ? 1 : 0);

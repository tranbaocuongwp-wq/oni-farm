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
import { TILE, tileAt, idx } from "../src/game/world.ts";

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

function use(store, x, y) {
  store.dispatch({ t: "USE", x, y });
}
function sleep(store) {
  store.dispatch({ t: "SLEEP" });
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

test("1. vòng lặp lõi: cày → gieo → tưới → 3 đêm → thu hoạch → bán", () => {
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
  for (let n = 0; n < def.growthDays.length; n++) {
    selectItem(store, "tool:can");
    use(store, plot.x, plot.y);
    ok(tile(store, plot.x, plot.y).wet, "ô phải ướt sau khi tưới");
    sleep(store);
  }
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
  eq(tile(store, plot.x, plot.y).crop.days, 0, "days");
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

  sleep(store);
  const c = PLOTS[4];
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    ok(tile(store, c.x + dx, c.y + dy).wet, `ô kề (${c.x + dx},${c.y + dy}) phải ướt`);
  }
  eq(tile(store, PLOTS[3].x, PLOTS[3].y).crop.stage, 1, "cây trên ô được vòi tưới đã lớn");
  eq(tile(store, PLOTS[5].x, PLOTS[5].y).crop.stage, 1, "cây thứ hai cũng lớn");

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
        crop: { id: "lettuce", stage: content.crops.lettuce.growthDays.length, days: 0, regrown: false },
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
        crop: { id: "lettuce", stage: content.crops.lettuce.growthDays.length, days: 0, regrown: false },
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
  { t: "USE", x: 15, y: 7 },
  { t: "USE", x: 17, y: 8 },
  { t: "SELECT", slot: 2 },
  { t: "USE", x: 15, y: 8 },
  { t: "USE", x: 15, y: 7 },
  { t: "USE", x: 17, y: 8 },
  { t: "SELECT", slot: 1 },
  { t: "USE", x: 15, y: 8 },
  { t: "USE", x: 15, y: 7 },
  { t: "USE", x: 17, y: 8 },
  { t: "SLEEP" },
  { t: "TICK", dt: 12 },
  { t: "MOVE", dx: 1, dy: 0, dt: 0.25 },
  { t: "MOVE", dx: 0, dy: 1, dt: 0.25 },
  { t: "USE", x: 15, y: 8 },
  { t: "USE", x: 15, y: 7 },
  { t: "USE", x: 17, y: 8 },
  { t: "SLEEP" },
  { t: "USE", x: 15, y: 8 },
  { t: "USE", x: 15, y: 7 },
  { t: "USE", x: 17, y: 8 },
  { t: "SLEEP" },
  { t: "USE", x: 15, y: 8 },
  { t: "USE", x: 15, y: 7 },
  { t: "USE", x: 17, y: 8 },
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
      crop: { id: "pumpkin", stage: 2, days: 1, regrown: false },
    });
    setTile(s, PLOTS[1].x, PLOTS[1].y, {
      tilled: true,
      crop: { id: "lettuce", stage: 1, days: 0, regrown: false },
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
      crop: { id: "tomato", stage: def.growthDays.length, days: 0, regrown: false },
    });
  });
  use(store, p.x, p.y);
  const c = tile(store, p.x, p.y).crop;
  ok(c !== null, "cà chua không biến mất sau khi thu");
  eq(c.regrown, true, "đánh dấu regrown");

  // đếm số ngày (có tưới) cần để chín lại
  let days = 0;
  while (tile(store, p.x, p.y).crop.stage < def.growthDays.length && days < 20) {
    selectItem(store, "tool:can");
    use(store, p.x, p.y);
    sleep(store);
    days++;
  }
  eq(days, def.regrowDays, "chín lại đúng sau regrowDays ngày");
});

test("15. INTERACT ở cửa nhà = ngủ; ở cửa hàng/quầy thì state không đổi", () => {
  const store = mkStore();
  const before = store.getState();
  store.dispatch({ t: "INTERACT", x: 11, y: 5 }); // 'S' — cửa hàng
  eq(store.getState(), before, "INTERACT SHOP không đổi state");
  store.dispatch({ t: "INTERACT", x: 22, y: 5 }); // 'B' — quầy thu mua
  eq(store.getState(), before, "INTERACT SELL không đổi state");
  const day0 = store.getState().day;
  store.dispatch({ t: "INTERACT", x: 16, y: 3 }); // 'D' — cửa nhà
  eq(store.getState().day, day0 + 1, "INTERACT cửa nhà = ngủ");
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

/* ------------------------------------------------------------------ tổng kết */

console.log("\n  ONIFARM — sim\n");
for (const line of results) console.log("  " + line);
console.log(
  `\n  ${results.length - failures}/${results.length} kịch bản đạt` +
    (failures ? `  \x1b[31m(${failures} lỗi)\x1b[0m` : "  \x1b[32m(tất cả xanh)\x1b[0m") +
    "\n",
);
process.exit(failures ? 1 : 0);

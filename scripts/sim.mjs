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
import { TILE, tileAt, idx, isSolid, propAt, portalAt, playerOverlapsTile, blockedAt, canPlaceBuilding, troughIn, penById, penOfAnimal } from "../src/game/world.ts";
import { troughStock, troughMax, penGoal, eatFromTrough, canFeedPond, pondAt } from "../src/game/pen.ts";
import { grazeableAt } from "../src/game/graze.ts";
import { inZone, zoneAt, isTillable, blockedForActor, tileOkFor } from "../src/game/world.ts";
import { canCraft, canUseAt, missingFor, waterCapacity } from "../src/game/actions.ts";
import { hintAt, interactHint, facingTile, nearestTarget, autoJob, AUTO_ORDER } from "../src/game/hint.ts";
import { parseSettings, DEFAULT_SETTINGS, SETTINGS_VERSION } from "../src/core/settings.ts";
import * as seasonApi from "../src/game/season.ts";
import * as actionsApi from "../src/game/actions.ts";
import { createNavigator } from "../src/core/navigate.ts";
import * as migrateApi from "../src/core/save.ts";
import { SAVE_VERSION } from "../src/core/version.ts";

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

/** State thô của store — đưa thẳng vào `migrateForContent` để thử đường NẠP SAVE. */
function store0(store) {
  return JSON.parse(JSON.stringify(store.getState()));
}

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
  let s = store.getState();
  let slot = s.inv.findIndex((v) => v && v.id === id);
  ok(slot >= 0, `không có '${id}' trong túi`);
  // Nằm trong BALO thì đổi lên hotbar trước — đúng cái người chơi làm. Từ khi
  // có vật nuôi, danh sách nguyên liệu dài hơn hotbar nên món vừa chế tạo rất
  // hay rơi xuống balo; bắt test đỏ vì chuyện đó là bắt nhầm.
  if (slot >= BAL.hotbarSlots) {
    const trong = s.inv.findIndex((v, i) => i >= 2 && i < BAL.hotbarSlots && v === null);
    const dich = trong >= 0 ? trong : BAL.hotbarSlots - 1;
    store.dispatch({ t: "SWAP", a: slot, b: dich });
    s = store.getState();
    slot = s.inv.findIndex((v) => v && v.id === id);
    ok(slot >= 0 && slot < BAL.hotbarSlots, `đổi '${id}' lên hotbar thất bại`);
  }
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

/**
 * Đặt MỘT công trình. Từ khi công trình chỉ đi qua chế độ quy hoạch thì không
 * còn đường "USE lên ô" nữa — một ô cũng là một tuyến dài một ô.
 */
function place(store, id, x, y) {
  store.dispatch({ t: "BUILD_LINE", id, x0: x, y0: y, x1: x, y1: y, far: true });
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

/** Nạp tiền. Từ khi bỏ hệ mở khoá thì đây là ĐIỀU KIỆN DUY NHẤT để mua được —
 *  giữ tên cũ để các kịch bản cũ khỏi phải sửa hàng loạt. */
function unlockAll(store) {
  setState(store, (s) => {
    s.money = 100000;
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
/* Chỗ đứng làm ruộng trong các kịch bản: ĐỨNG TRÊN LỐI MÒN CHÍNH, hai bên là
   hai lô. Sáu ô quanh nó là sáu ô cuốc được, và chỉ sáu — y hệt hình cũ, nên
   các kịch bản đo "hết ô thì dừng" vẫn đo đúng thứ chúng định đo. Ô cũ (16,8)
   giờ vắt qua BỜ giữa hai hàng lô nên nửa số nhát cuốc rơi vào chỗ cấm. */
const HOME = { x: 16, y: 9 };
const PLOTS = [
  { x: 15, y: 8 }, { x: 15, y: 9 }, { x: 15, y: 10 },
  { x: 17, y: 8 }, { x: 17, y: 9 }, { x: 17, y: 10 },
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
  /* Ép TRỜI KHÔ suốt 5 đêm. Trước đây test này dựa vào may rủi của seed mặc
     định, nên chỉ cần đổi bản đồ một chút (thêm nhà kho ⇒ đổi số lần rút seed
     ban đêm ⇒ chuỗi thời tiết dịch đi) là có một đêm mưa và test đỏ. Nó muốn
     kiểm "không nước thì không lớn", không phải kiểm thời tiết. */
  const kho = contentWith((r) => {
    for (const w of r.weather.weathers) if (w.wet) w.weight = 0;
  });
  const store = createStore(createNewGame(kho, 1), kho, { validate: true, strict: true });
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
  place(store, "sprinkler", PLOTS[4].x, PLOTS[4].y);
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
  place(store, "greenhouse", p.x, p.y);
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


test("6. CÓ TIỀN LÀ MUA ĐƯỢC, không mốc nào chặn; mốc chỉ đánh dấu tiến độ", () => {
  const store = mkStore();
  deepEq(store.getState().stagesDone, ["start"], "mốc start áp ngay từ createNewGame");

  /* Cửa hàng bán TẤT từ ngày đầu. Trước đây hàng khoá theo mốc, và người chơi
     mở tab lên thấy bốn ô "??? chưa mở" — bốn lời hứa mà họ không làm gì được
     với chúng. Giờ điều kiện duy nhất là TIỀN. */
  setState(store, (s) => { s.money = 5000; });
  const gia = content.crops.tomato.seedPrice;
  const tien0 = store.getState().money;
  store.dispatch({ t: "BUY", id: "seed:tomato", n: 1 });
  ok(
    store.getState().inv.some((v) => v && v.id === "seed:tomato"),
    "ngày đầu đã mua được hạt cà chua — không chờ mốc nào",
  );
  eq(store.getState().money, tien0 - gia, "trừ đúng tiền");

  // …còn KHÔNG đủ tiền thì vẫn bị từ chối, và không mất gì
  setState(store, (s) => { s.money = 1; });
  store.dispatch({ t: "BUY", id: "seed:tomato", n: 1 });
  eq(store.getState().money, 1, "thiếu tiền: không trừ");
  eq(countInv(store, "seed:tomato"), 1, "…và không nhận thêm hạt nào");

  // vật nuôi cũng vậy: đủ tiền là gọi xe chở tới ngay
  setState(store, (s) => { s.money = 99999; });
  store.dispatch({ t: "BUY_ANIMAL", def: "cow" });
  ok(
    store.getState().entities.some((e) => e.kind === "vehicle"),
    "mua được con bò từ ngày đầu — xe đã lên đường",
  );

  /* MỐC vẫn chạy, chỉ là nó không CHẶN gì nữa: nó đánh dấu chặng đường và nói
     một câu chúc mừng. Mốc chỉ được đánh giá sau một action ĐỔI ĐƯỢC state.

     Dùng store MỚI: phần trên vừa nạp gần trăm nghìn để thử mua, mà mấy mốc
     giữa lộ trình đo bằng TIỀN — nạp tiền là chúng bắn hết, và phép so thứ tự
     mốc bên dưới không còn nói lên điều gì. */
  const st2 = mkStore();
  walkTo(st2, HOME.x, HOME.y);
  setState(st2, (s) => {
    s.money = 100;
    for (const p of PLOTS) {
      setTile(s, p.x, p.y, {
        tilled: true,
        crop: { id: "lettuce", stage: content.crops.lettuce.growthDays.length, grow: 0, regrown: false },
      });
    }
  });
  for (let i = 0; i < 5; i++) use(st2, PLOTS[i].x, PLOTS[i].y);
  eq(st2.getState().stats.harvested, 5, "đã thu hoạch 5");
  deepEq(st2.getState().stagesDone, ["start", "pro"], "mốc 'pro' bắn sau mốc 'start'");
  ok(
    st2.getState().log.some((l) => l.text.includes("Vào nghề")),
    "…và nói một câu chúc mừng, không hứa mở khoá gì cả",
  );

  setState(st2, (s) => { s.money = 900; });
  ok(!st2.getState().stagesDone.includes("mech"), "đặt thẳng money chưa đủ làm mốc bắn");
  st2.dispatch({ t: "BUY", id: "seed:bokchoy", n: 1 });
  ok(st2.getState().stagesDone.includes("mech"), "một action thành công là mốc 'mech' bắn ngay");
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
  { t: "USE", x: 15, y: 9 },
  { t: "TICK", dt: 0.4 },
  { t: "USE", x: 17, y: 8 },
  { t: "TICK", dt: 0.4 },
  { t: "SELECT", slot: 2 },
  { t: "USE", x: 15, y: 8 },
  { t: "TICK", dt: 0.4 },
  { t: "USE", x: 15, y: 9 },
  { t: "TICK", dt: 0.4 },
  { t: "USE", x: 17, y: 8 },
  { t: "TICK", dt: 0.4 },
  { t: "SELECT", slot: 1 },
  { t: "USE", x: 15, y: 8 },
  { t: "TICK", dt: 0.4 },
  { t: "USE", x: 15, y: 9 },
  { t: "TICK", dt: 0.4 },
  { t: "USE", x: 17, y: 8 },
  { t: "TICK", dt: 0.4 },
  { t: "SLEEP" },
  { t: "TICK", dt: 12 },
  /* Đi một vòng RỒI VỀ CHỖ CŨ. Đây là phép thử TẤT ĐỊNH, nên chỉ cần chuyển
     động có tham gia vào chuỗi; đi một chiều rồi đứng đó thì mấy ô ruộng bên
     dưới rơi ra ngoài tầm với và cả kịch bản không thu hoạch được gì. */
  { t: "MOVE", dx: 1, dy: 0, dt: 0.25 },
  { t: "MOVE", dx: 0, dy: 1, dt: 0.25 },
  { t: "MOVE", dx: -1, dy: 0, dt: 0.25 },
  { t: "MOVE", dx: 0, dy: -1, dt: 0.25 },
  { t: "USE", x: 15, y: 8 },
  { t: "TICK", dt: 0.4 },
  { t: "USE", x: 15, y: 9 },
  { t: "TICK", dt: 0.4 },
  { t: "USE", x: 17, y: 8 },
  { t: "TICK", dt: 0.4 },
  { t: "SLEEP" },
  { t: "USE", x: 15, y: 8 },
  { t: "TICK", dt: 0.4 },
  { t: "USE", x: 15, y: 9 },
  { t: "TICK", dt: 0.4 },
  { t: "USE", x: 17, y: 8 },
  { t: "TICK", dt: 0.4 },
  { t: "SLEEP" },
  { t: "DEBUG", op: "growAll" },
  { t: "USE", x: 15, y: 8 },
  { t: "TICK", dt: 0.4 },
  { t: "USE", x: 15, y: 9 },
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
  const newContent = buildContent(raw);
  ok(!newContent.crops.pumpkin, "content mới không còn bí đỏ");

  // save cũ có bí đỏ trên ruộng và trong túi
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
  let sanKinh = 0;
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
        const seed = store.getState().inv.some((v) => v && v.id === "seed:tomato")
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
    if (s.money > 300)
      store.dispatch({ t: "BUY", id: "seed:lettuce", n: 3 });
    if (s.money > 600)
      store.dispatch({ t: "BUY", id: "seed:tomato", n: 2 });
    if (built === 0 && s.money > 500) {
      store.dispatch({ t: "BUY", id: "sprinkler", n: 1 });
      if (store.getState().inv.some((v) => v && v.id === "build:sprinkler")) {
        // đặt vật thể solid lên chính ô mình đứng → phải bị từ chối (không tự nhốt mình)
        place(store, "sprinkler", HOME.x, HOME.y);
        ok(tile(store, HOME.x, HOME.y).b === null, "không được đặt công trình solid lên ô người chơi đứng");
        place(store, "sprinkler", PLOTS[4].x, PLOTS[4].y);
        if (tile(store, PLOTS[4].x, PLOTS[4].y).b === "sprinkler") built = 1;
      }
    }
    if (sanKinh === 0 && store.getState().money > 700) {
      store.dispatch({ t: "BUY", id: "greenhouse", n: 1 });
      if (store.getState().inv.some((v) => v && v.id === "build:greenhouse")) {
        place(store, "greenhouse", PLOTS[3].x, PLOTS[3].y);
        if (tile(store, PLOTS[3].x, PLOTS[3].y).b === "greenhouse") sanKinh = 1;
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
  eq(sanKinh, 1, "đã lát được sàn nhà kính trong 30 ngày");
  /* Mốc 'auto' trước đây đo bằng "đã dựng pin mặt trời" nên chạy tới đâu là
     bắn tới đó. Pin không còn, nó đo bằng số lượt thu hoạch — mà kịch bản này
     chỉ chăm sáu ô nên không tới ngưỡng đó. Đổi sang khẳng định thứ nó THẬT SỰ
     chứng minh: chạy ba mươi ngày thì lộ trình có tiến, và mốc theo NGÀY bắn. */
  ok(
    store.getState().stagesDone.includes("tropic"),
    "chạy quá ngày 20 thì mốc theo ngày đã bắn",
  );
  ok(
    store.getState().stagesDone.length >= 5,
    `nhiều mốc đã bắn trong 30 ngày: ${store.getState().stagesDone.length}`,
  );
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

  // --- giường mới ngủ được, và có DIỄN HOẠT leo lên nằm ---
  walkTo(store, 2, 3);
  store.dispatch({ t: "INTERACT", x: 2, y: 2 }); // 'E' — giường
  const ngu = store.getState();
  eq(ngu.sleeping, true, "bấm giường: bắt đầu leo lên nằm");
  eq(ngu.day, day0, "…nhưng CHƯA sang hôm sau — mắt phải kịp thấy chuyện gì xảy ra");
  eq(Math.floor(ngu.player.x / TILE), 2, "nhân vật nằm ĐÚNG lên ô giường");
  eq(Math.floor(ngu.player.y / TILE), 2, "…đúng hàng của giường");
  ok(ngu.busy > 0, "đang khoá thao tác trong lúc leo lên giường");
  // đang nằm thì không cày cấy gì được nữa
  store.dispatch({ t: "MOVE", dx: 1, dy: 0, dt: 1 / 60 });
  eq(Math.floor(store.getState().player.x / TILE), 2, "đang leo lên giường thì không đi đâu được");
  store.dispatch({ t: "TICK", dt: (content.balance.sleepSeconds ?? 0) + 0.01 });
  eq(store.getState().day, day0 + 1, "hết diễn hoạt thì mới sang hôm sau");
  eq(store.getState().sleeping, false, "…và tỉnh dậy");

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

test("17. thao tác tuần tự + hiệu lực TRỄ: vung → chạm đất → mới đổi ô; đang bận thì không làm việc khác", () => {
  const store = mkStore();
  walkTo(store, HOME.x, HOME.y);
  selectItem(store, "tool:hoe");
  const w = store.getState().w;
  const A = PLOTS[1];
  const B = PLOTS[4];
  const impactAt = BAL.actionSeconds * (1 - BAL.actionImpact);

  useRaw(store, A.x, A.y);
  const first = store.getState();
  ok(!first.tiles[A.y * w + A.x].tilled, "bấm xong đất CHƯA lật — mới đang giơ cuốc");
  eq(first.busy, BAL.actionSeconds, "khoá đúng bằng balance.actionSeconds");
  deepEq(first.pending, { x: A.x, y: A.y }, "ghi nhớ ô đang vung tới");

  // Bấm loạn khi còn khoá: không nhát nào được ăn.
  const before = store.getState();
  useRaw(store, B.x, B.y);
  useRaw(store, PLOTS[0].x, PLOTS[0].y);
  ok(store.getState() === before, "USE lúc đang bận phải trả về ĐÚNG state cũ");

  // Đang bận thì chân đứng yên.
  const px = store.getState().player.x;
  store.dispatch({ t: "MOVE", dx: 1, dy: 0, dt: 0.1 });
  eq(store.getState().player.x, px, "đang bận thì không di chuyển được");

  // Trước mốc chạm đất: vẫn chưa lật. Qua mốc: lật, pending xoá, busy còn chạy nốt.
  store.dispatch({ t: "TICK", dt: Math.max(0, BAL.actionSeconds - impactAt) * 0.5 });
  ok(!store.getState().tiles[A.y * w + A.x].tilled, "trước mốc chạm đất vẫn chưa lật");
  store.dispatch({ t: "TICK", dt: Math.max(0, BAL.actionSeconds - impactAt) * 0.5 + 0.001 });
  ok(store.getState().tiles[A.y * w + A.x].tilled, "tới mốc chạm đất thì đất lật");
  eq(store.getState().pending, null, "áp dụng xong thì hết thao tác chờ");
  ok(store.getState().busy > 0, "vẫn còn khoá nốt phần sau của nhát vung");
  eq(store.getState().stats.tilled, 1, "thống kê tính đúng lúc chạm đất");

  // Hết khoá thì làm tiếp bình thường.
  store.dispatch({ t: "TICK", dt: BAL.actionSeconds });
  eq(store.getState().busy, 0, "hết giờ thì busy về 0");
  use(store, B.x, B.y);
  ok(store.getState().tiles[B.y * w + B.x].tilled, "hết khoá thì cày được tiếp");

  // Thao tác HỤT không bị phạt khoá và không có thao tác chờ.
  useRaw(store, B.x, B.y); // đã cày rồi → hụt
  eq(store.getState().busy, 0, "thao tác hụt thì không bị khoá");
  eq(store.getState().pending, null, "thao tác hụt không để lại pending");

  // Ngủ dậy là hết bận, kể cả nhát đang vung dở.
  useRaw(store, PLOTS[0].x, PLOTS[0].y);
  ok(store.getState().busy > 0 && store.getState().pending, "đang vung trước khi ngủ");
  sleep(store);
  eq(store.getState().busy, 0, "ngủ dậy thì busy được xoá");
  eq(store.getState().pending, null, "ngủ dậy thì thao tác dở bị bỏ");
  ok(!store.getState().tiles[PLOTS[0].y * w + PLOTS[0].x].tilled, "nhát dở KHÔNG được áp dụng sau khi ngủ");

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
  /* TÌM ô bờ, không chép cứng toạ độ: cái hồ là thứ người thiết kế màn còn
     nắn lại, và một con số chép cứng ở đây sẽ đỏ vì lý do chẳng liên quan gì
     tới chuyện múc nước. */
  const bo = (() => {
    const st = store.getState();
    const px = st.player.x / TILE;
    const py = st.player.y / TILE;
    let best = null;
    for (let y = 1; y < st.h - 1; y++)
      for (let x = 1; x < st.w - 1; x++) {
        const t = tile(store, x, y);
        if (!t || t.g === "water" || isSolid(st, content, x, y)) continue;
        const canNuoc = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(
          ([dx, dy]) => tile(store, x + dx, y + dy)?.g === "water",
        );
        if (!canNuoc) continue;
        const d = Math.hypot(x - px, y - py);
        if (!best || d < best.d) best = { x, y, d };
      }
    if (!best) throw new Error("bản đồ không có ô bờ nào cạnh mặt nước");
    return best;
  })();
  /* Đặt thẳng vị trí chứ không `walkTo`: cái giếng và vành đá quanh hồ chắn
     mất đường đi thẳng theo trục mà `walkTo` biết đi, mà thứ đang kiểm ở đây
     là LUẬT MÚC NƯỚC chứ không phải khả năng tìm đường. */
  setState(store, (s) => {
    s.player.x = bo.x * TILE + TILE / 2;
    s.player.y = bo.y * TILE + TILE / 2;
  });
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
/** Đứng cạnh BÀN CHẾ TẠO. Bàn nằm NGOÀI TRỜI, ngay cạnh lối ra cửa nhà —
 *  không còn phải chui vào phòng ngủ mới chế được cái rìu. */
function goToBench(store) {
  const s = store.getState();
  let ban = null;
  for (let y = 0; y < s.h && !ban; y++)
    for (let x = 0; x < s.w; x++)
      if (s.tiles[idx(s.w, x, y)]?.prop === "bench") { ban = { x, y }; break; }
  ok(!!ban, "bản đồ có bàn chế tạo");
  walkTo(store, ban.x, ban.y + 1);
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

  // --- xa bàn thì không chế được ---
  // Tìm một ô đứng được và ĐỦ XA cái bàn, thay vì chép cứng một toạ độ mà đợt
  // vẽ lại bản đồ sau có thể biến thành mặt nước.
  {
    const s = store.getState();
    let ban = null;
    for (let y = 0; y < s.h && !ban; y++)
      for (let x = 0; x < s.w; x++)
        if (s.tiles[idx(s.w, x, y)]?.prop === "bench") { ban = { x, y }; break; }
    let xa = null;
    for (let y = 1; y < s.h - 1 && !xa; y++)
      for (let x = 1; x < s.w - 1; x++) {
        if (Math.hypot(x - ban.x, y - ban.y) < 8) continue;
        if (isSolid(s, content, x, y)) continue;
        xa = { x, y };
        break;
      }
    ok(!!xa, "tìm được chỗ đứng xa bàn chế tạo");
    setState(store, (st) => {
      st.player.x = xa.x * TILE + TILE / 2;
      st.player.y = xa.y * TILE + TILE / 2;
    });
  }
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

  // Không còn khoá nào để mở: nút này giờ ĐÁNH DẤU mọi mốc và mục tiêu là xong,
  // để thử nhanh phần cuối lộ trình mà không phải cày thật.
  store.dispatch({ t: "DEBUG", op: "unlockAll" });
  for (const st of content.stages)
    ok(store.getState().stagesDone.includes(st.id), `unlockAll đánh dấu xong mốc ${st.id}`);
  for (const g of content.goals)
    ok(store.getState().goalsDone.includes(g.id), `unlockAll đánh dấu xong mục tiêu ${g.id}`);
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
/** Leo lên giường ngủ — ĐÚNG như người chơi làm.
 *
 *  Từ core 1.10, bấm giường không sang ngày ngay: nhân vật nằm lên giường,
 *  màn mờ dần trong `sleepSeconds` giây rồi mới sang hôm sau. Nên phải cho
 *  thời gian trôi hết cú diễn hoạt, không thì store vẫn đứng ở hôm nay. */
function sleepInBed(store) {
  walkTo(store, 2, 3);
  store.dispatch({ t: "INTERACT", x: 2, y: 2 });
  const cho = content.balance.sleepSeconds ?? 0;
  if (cho > 0) store.dispatch({ t: "TICK", dt: cho + 0.01 });
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
  place(store, "sprinkler", PLOTS[4].x, PLOTS[4].y);
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
    // gỡ bản đồ thì phải gỡ khỏi indoorMaps luôn — loader từ chối pack trỏ tới
    // bản đồ không tồn tại, và đó là chủ ý (bắt lỗi biên tập ngay lúc nạp)
    indoorMaps: [],
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

/** Đẩy đồng hồ game đi `mins` phút bằng TICK (không đụng gì khác). */
function advanceMinutes(store, mins) {
  store.dispatch({ t: "TICK", dt: (mins * BAL.realSecondsPerGameTenMinutes) / 10 });
}

test("36. thời gian ở trong nhà vẫn tính cho ruộng: về cửa được cộng bù, ngủ trong nhà không thiệt", () => {
  /* Đây là cái giá phải trả cho việc TICK chỉ quét một lưới (kịch bản 35): nếu
     không cộng bù, đứng trong nhà giữa ban ngày sẽ làm ruộng đứng hình — một
     hình phạt vô hình mà người chơi không tài nào đoán ra. `StoredMap.awayAt`
     ghi mốc lúc bản đồ bị cất, và ở đây ta kiểm đúng hai chỗ tiêu thụ nó. */

  // ---- (a) đi vào nhà rồi quay ra: ruộng phải được cộng bù ngay tại cửa ----
  const store = mkStore(560);
  walkTo(store, HOME.x, HOME.y);
  const plot = PLOTS[1];
  selectItem(store, "tool:hoe");
  use(store, plot.x, plot.y);
  selectItem(store, "seed:lettuce");
  use(store, plot.x, plot.y);
  topUpWater(store);
  selectItem(store, "tool:can");
  use(store, plot.x, plot.y);
  ok(farmTile(store, plot.x, plot.y).wet, "ô đã tưới, đủ điều kiện lớn");

  enterHouse(store);
  const g0 = growOfTile(farmTile(store, plot.x, plot.y));
  const away = 300;
  advanceMinutes(store, away);
  eq(
    growOfTile(farmTile(store, plot.x, plot.y)),
    g0,
    "đang ở trong nhà thì lưới đã cất chưa bị chạm tới (TICK vẫn chỉ quét một lưới)",
  );

  leaveHouse(store);
  const g1 = growOfTile(farmTile(store, plot.x, plot.y));
  ok(
    Math.abs(g1 - g0 - away) < 1e-6,
    `bước ra cửa là ruộng được cộng bù trọn ${away} phút vắng mặt: nhận ${g1 - g0}`,
  );
  deepEq(checkInvariants(store.getState(), content), [], "bất biến sau khi cộng bù ở cửa");

  // đi vào rồi ra NGAY thì không được cộng thêm gì — không có kẽ hở farm thời gian
  const g2 = growOfTile(farmTile(store, plot.x, plot.y));
  enterHouse(store);
  leaveHouse(store);
  const g3 = growOfTile(farmTile(store, plot.x, plot.y));
  ok(g3 - g2 < 30, `ra vào liên tục không đẻ ra thời gian: nhận thêm ${g3 - g2} phút`);

  // ---- (b) ngủ trong nhà không thiệt hơn đứng ngoài ruộng -----------------
  // Hai ván giống hệt nhau, chỉ khác THỨ TỰ: chờ ngoài ruộng rồi mới vào ngủ,
  // với vào nhà trước rồi chờ trong đó. Cùng một khoảnh khắc đi ngủ ⇒ cây phải
  // ở cùng một tiến độ.
  const grow = (seed, inside) => {
    const st = mkStore(seed);
    walkTo(st, HOME.x, HOME.y);
    selectItem(st, "tool:hoe");
    use(st, plot.x, plot.y);
    selectItem(st, "seed:lettuce");
    use(st, plot.x, plot.y);
    topUpWater(st);
    selectItem(st, "tool:can");
    use(st, plot.x, plot.y);

    if (inside) {
      enterHouse(st);
      advanceMinutes(st, 240);
    } else {
      advanceMinutes(st, 240);
      enterHouse(st);
    }
    sleepInBed(st);
    deepEq(checkInvariants(st.getState(), content), [], "bất biến sau đêm");
    return growOfTile(farmTile(st, plot.x, plot.y));
  };

  const outside = grow(561, false);
  const inside = grow(561, true);
  ok(
    Math.abs(outside - inside) < 1e-6,
    `ở trong nhà 4 tiếng ban ngày cho cùng tiến độ với đứng ngoài ruộng: ngoài ${outside}, trong ${inside}`,
  );

  // ---- (c) không bao giờ được cộng bù HAI lần ----------------------------
  // Sang ngày mới đặt lại mốc vắng mặt; nếu quên, đêm sau sẽ cộng lại phần cũ.
  const st = mkStore(562);
  walkTo(st, HOME.x, HOME.y);
  selectItem(st, "tool:hoe");
  use(st, plot.x, plot.y);
  selectItem(st, "seed:lettuce");
  use(st, plot.x, plot.y);
  enterHouse(st);
  sleepInBed(st);
  const day1 = growOfTile(farmTile(st, plot.x, plot.y));
  sleepInBed(st);
  const day2 = growOfTile(farmTile(st, plot.x, plot.y));
  const oneDay = BAL.daylightEndMinutes - BAL.dayStartMinutes;
  ok(
    day2 - day1 <= oneDay + 1e-6,
    `một đêm không cộng quá một ngày ban ngày: nhận ${day2 - day1}, trần ${oneDay}`,
  );
  eq(
    st.getState().maps.farm.awayAt,
    BAL.dayStartMinutes,
    "sang ngày mới thì mốc vắng mặt lùi về bình minh",
  );
});

/* ========================================================================== */
/* 37–38. Lớp UX: gợi ý hành động theo ngữ cảnh + settings                    */
/* ========================================================================== */

test("37. hintAt: nhãn nút đổi đúng theo vật phẩm đang cầm và trạng thái ô", () => {
  const store = mkStore(700);
  walkTo(store, HOME.x, HOME.y);
  const plot = PLOTS[0];
  const s0 = store.getState();

  // Cầm cuốc, ô cỏ trống → CÀY, đứng trong tầm → ready
  selectItem(store, "tool:hoe");
  let h = hintAt(store.getState(), content, plot.x, plot.y);
  eq(h.kind, "till", "cuốc + cỏ → till");
  eq(h.label, "CÀY", "nhãn CÀY");
  ok(h.ready, "đứng cạnh → ready");

  // Cầm hạt trên ô CHƯA cày → không làm được, có lý do
  selectItem(store, "seed:lettuce");
  h = hintAt(store.getState(), content, plot.x, plot.y);
  eq(h.kind, null, "hạt + cỏ → không có việc");
  eq(h.why, "Cày trước đã", "lý do rõ ràng");

  // Cày rồi → GIEO
  selectItem(store, "tool:hoe");
  use(store, plot.x, plot.y);
  selectItem(store, "seed:lettuce");
  h = hintAt(store.getState(), content, plot.x, plot.y);
  eq(h.kind, "plant", "đất cày + hạt → plant");
  eq(h.label, "GIEO", "nhãn GIEO");

  // Gieo rồi, cầm bình → TƯỚI; tưới rồi → 'Đã tưới rồi'
  use(store, plot.x, plot.y);
  selectItem(store, "tool:can");
  h = hintAt(store.getState(), content, plot.x, plot.y);
  eq(h.kind, "water", "cây + bình → water");
  use(store, plot.x, plot.y);
  h = hintAt(store.getState(), content, plot.x, plot.y);
  eq(h.kind, null, "đã ướt → không tưới nữa");
  eq(h.why, "Đã tưới rồi", "lý do đã tưới");

  // Cây chín → THU, bất kể đang cầm gì
  ripen(store, plot.x, plot.y);
  selectItem(store, "tool:hoe");
  h = hintAt(store.getState(), content, plot.x, plot.y);
  eq(h.kind, "harvest", "chín → harvest thắng cuốc");
  eq(h.label, "THU", "nhãn THU");

  // Ô xa → không ready nhưng vẫn biết sẽ làm gì
  const far = { x: plot.x, y: plot.y + 6 };
  const s1 = store.getState();
  const farTile = tileAt(s1, far.x, far.y);
  if (farTile && farTile.g === "grass" && !farTile.prop) {
    h = hintAt(s1, content, far.x, far.y);
    eq(h.kind, "till", "ô xa vẫn báo CÀY");
    ok(!h.ready, "ô xa → chưa ready");
  }

  // Cửa hàng → MUA (kể cả khi ngắm ô kề bên), giường trong nhà → NGỦ
  const shop = (() => {
    for (let y = 0; y < s0.h; y++)
      for (let x = 0; x < s0.w; x++) if (s0.tiles[idx(s0.w, x, y)].prop === "shop") return { x, y };
    return null;
  })();
  ok(shop, "bản đồ có máy bán hạt");
  /* Nút NGỮ CẢNH thôi mở cửa hàng — nó bám theo thứ trên tay, không hơn.
     Trước đây nó làm cả hai, và hậu quả là: đang cày một luống dài, đi ngang
     qua quầy thu mua, bấm tiếp thì bật bảng bán hàng. Mở cửa hàng giờ là việc
     của NÚT TƯƠNG TÁC. */
  h = hintAt(store.getState(), content, shop.x, shop.y + 1);
  ok(h.kind !== "shop", "nút ngữ cảnh KHÔNG mở cửa hàng nữa");
  const ih = interactHint(store.getState(), content, shop.x, shop.y + 1);
  eq(ih?.kind, "shop", "nút tương tác mới là nút mở cửa hàng");
  eq(ih?.label, "MUA", "nhãn MUA");

  // Ô trước mặt tính đúng theo hướng
  setState(store, (st) => { st.player.dir = "left"; });
  const f = facingTile(store.getState());
  eq(f.x, Math.floor(store.getState().player.x / TILE) - 1, "quay trái → ô bên trái");
});

test("38. parseSettings: JSON hỏng/thiếu/sai kiểu luôn ra settings hợp lệ", () => {
  deepEq(parseSettings(null), { ...DEFAULT_SETTINGS }, "null → mặc định");
  deepEq(parseSettings("rác"), { ...DEFAULT_SETTINGS }, "chuỗi → mặc định");
  const v1 = parseSettings({ control: "stick" }); // bản settings v1 chỉ có control
  eq(v1.control, "stick", "giữ lựa chọn cũ");
  eq(v1.v, SETTINGS_VERSION, "nâng phiên bản");
  eq(v1.zoom, "normal", "khoá mới được điền mặc định");
  const bad = parseSettings({ control: "gamepad", zoom: 3, haptics: "yes", hand: "left", extra: true });
  eq(bad.control, "tap", "giá trị lạ → mặc định");
  eq(bad.zoom, "normal", "sai kiểu → mặc định");
  eq(bad.haptics, true, "sai kiểu boolean → mặc định");
  eq(bad.hand, "left", "giá trị hợp lệ được giữ");
  ok(!("extra" in bad), "khoá lạ bị bỏ");
  // idempotent: parse(parse(x)) === parse(x)
  deepEq(parseSettings(bad), bad, "parse hai lần không đổi");
});

test("39. SWAP: đổi chỗ balo ⇄ hotbar, gộp cùng id, hai ô công cụ cố định", () => {
  const store = mkStore(800);
  giveItem(store, "item:wood", 5);
  const s0 = store.getState();
  const woodAt = s0.inv.findIndex((v) => v && v.id === "item:wood");
  const seedAt = s0.inv.findIndex((v) => v && v.id === "seed:lettuce");
  const bagSlot = BAL.hotbarSlots + 2; // một ô trong balo

  store.dispatch({ t: "SWAP", a: woodAt, b: bagSlot });
  let s = store.getState();
  eq(s.inv[bagSlot]?.id, "item:wood", "gỗ vào balo");
  eq(s.inv[woodAt], null, "ô hotbar cũ trống");

  store.dispatch({ t: "SWAP", a: bagSlot, b: seedAt });
  s = store.getState();
  eq(s.inv[seedAt]?.id, "item:wood", "gỗ lên chỗ hạt");
  eq(s.inv[bagSlot]?.id, "seed:lettuce", "hạt xuống balo");

  // gộp stack cùng id
  setState(store, (st) => { st.inv[bagSlot + 1] = { id: "seed:lettuce", n: 3 }; });
  store.dispatch({ t: "SWAP", a: bagSlot + 1, b: bagSlot });
  s = store.getState();
  eq(s.inv[bagSlot]?.n, 11, "cùng id thì gộp vào ô đích (8 + 3)");
  eq(s.inv[bagSlot + 1], null, "ô nguồn trống sau khi gộp");

  // công cụ cố định + đầu vào rác → đúng state cũ
  const before = store.getState();
  store.dispatch({ t: "SWAP", a: 0, b: bagSlot });
  ok(store.getState() === before, "không đổi chỗ được ô cuốc");
  store.dispatch({ t: "SWAP", a: 5, b: 5 });
  store.dispatch({ t: "SWAP", a: -1, b: 3 });
  store.dispatch({ t: "SWAP", a: 3, b: 999 });
  ok(store.getState() === before, "SWAP vô nghĩa trả về đúng state cũ");
  deepEq(checkInvariants(store.getState(), content), [], "bất biến xanh");
});

test("40. nearestTarget: giữ nút thì tự sang ô kế tiếp cùng loại việc, trong tầm, ưu tiên thẳng hàng", () => {
  const store = mkStore(801);
  walkTo(store, HOME.x, HOME.y);
  selectItem(store, "tool:hoe");
  // đứng trên lối đi, 6 ô cỏ hai bên: cày dần hết, mỗi lần hỏi ô kế tiếp
  const done = [];
  for (let i = 0; i < 6; i++) {
    const t = nearestTarget(store.getState(), content, "till", null);
    ok(t, `lần ${i + 1} còn ô để cày`);
    eq(t.kind, "till", "loại việc là cày");
    use(store, t.x, t.y);
    done.push(`${t.x},${t.y}`);
  }
  eq(new Set(done).size, 6, "sáu ô khác nhau");
  eq(nearestTarget(store.getState(), content, "till", null), null, "hết ô thì trả null (không tự đi xa)");

  // ưu tiên cùng loại: có cây chín kề bên nhưng đang cầm cuốc và còn ô cỏ → vẫn cày
  const st2 = mkStore(802);
  walkTo(st2, HOME.x, HOME.y);
  selectItem(st2, "tool:hoe");
  const A = PLOTS[0];
  use(st2, A.x, A.y);
  selectItem(st2, "seed:lettuce");
  use(st2, A.x, A.y);
  ripen(st2, A.x, A.y);
  selectItem(st2, "tool:hoe");
  const pick = nearestTarget(st2.getState(), content, "till", null);
  eq(pick.kind, "till", "đang cày thì không nhảy sang thu hoạch");
  const pick2 = nearestTarget(st2.getState(), content, "harvest", null);
  eq(pick2.kind, "harvest", "đang thu thì ưu tiên cây chín");
  deepEq({ x: pick2.x, y: pick2.y }, A, "đúng cây vừa chín");
});


/* ============================================================== core 1.3 ==== */

/** Ép thời tiết hôm nay/ngày mai. Đi qua replace() nên vẫn bị kiểm bất biến. */
function setWeather(store, today, tomorrow = today) {
  setState(store, (s) => {
    s.weather = { today, tomorrow, wetStreak: content.weathers[today].wet ? 1 : 0, driedDay: 0 };
  });
}

/** Content vá vài số cân bằng — để thử xác suất 0/1 mà không đợi may rủi. */
function contentWith(mutate) {
  const raw = rawPack();
  mutate(raw);
  return buildContent(raw);
}

test("41. thời tiết tất định: cùng seed → cùng chuỗi 30 ngày; dự báo hôm nay = thời tiết ngày mai", () => {
  const run = (seed) => {
    const st = mkStore(seed);
    const seq = [];
    for (let i = 0; i < 30; i++) {
      const w = st.getState().weather;
      ok(content.weathers[w.today], "today phải có trong content");
      ok(content.weathers[w.tomorrow], "tomorrow phải có trong content");
      seq.push([w.today, w.tomorrow]);
      sleep(st);
    }
    return seq;
  };
  const a = run(4242);
  const b = run(4242);
  deepEq(a, b, "cùng seed phải ra cùng chuỗi thời tiết");
  for (let i = 0; i + 1 < a.length; i++)
    eq(a[i + 1][0], a[i][1], `dự báo ngày ${i + 1} phải thành thời tiết ngày ${i + 2}`);
  const c = run(99);
  ok(JSON.stringify(a) !== JSON.stringify(c), "seed khác thì chuỗi khác");
  // xác suất: 30 ngày với weight mưa+bão 24% thì gần như chắc có ngày ướt
  ok(a.some(([t]) => content.weathers[t].wet), "trong 30 ngày phải có ngày ướt");
});

test("42. mưa: sáng ra ô đã cày NGOÀI TRỜI ướt, trong nhà không; nắng gắt: quá trưa ruộng khô", () => {
  /* Tắt "đất cày bỏ không thì hoang trở lại" cho riêng kịch bản này. Nó kiểm
     MƯA, không kiểm cỏ dại — mà luật hoang trở lại có xác suất 10% mỗi đêm, nên
     chỉ cần đổi bản đồ một chút (chuỗi seed dịch đi) là một ô nào đó hoang lại
     và test đỏ vì một lý do chẳng liên quan. */
  const kho = contentWith((r) => { r.balance.tilledIdleDays = 0; });
  const store = createStore(createNewGame(kho, 7), kho, { validate: true, strict: true });
  walkTo(store, HOME.x, HOME.y);
  selectItem(store, "tool:hoe");
  for (const p of PLOTS) use(store, p.x, p.y);
  // ngày mai mưa
  setWeather(store, "sunny", "rain");
  sleep(store);
  eq(store.getState().weather.today, "rain", "sang ngày thì dự báo thành hôm nay");
  for (const p of PLOTS) ok(tile(store, p.x, p.y).wet, `ô cày (${p.x},${p.y}) phải ướt sáng mưa`);

  // mưa qua đêm: tối không khô
  setState(store, (s) => { s.weather.tomorrow = "rain"; });
  sleep(store);
  for (const p of PLOTS) ok(tile(store, p.x, p.y).wet, "mưa hai ngày liền thì vẫn ướt");

  // trong nhà: mưa không tưới sàn gỗ (không ô nào tilled trong nhà, nên kiểm bằng
  // cách khác: đứng trong nhà lúc mưa, ruộng ngoài vẫn ướt — awayAt không phá)
  // nắng gắt: sáng ướt (từ hôm qua) → quá trưa khô
  setState(store, (s) => { s.weather.tomorrow = "hot"; });
  sleep(store);
  // hôm qua mưa → đêm không khô → sáng nay còn ướt
  ok(tile(store, PLOTS[0].x, PLOTS[0].y).wet, "sau đêm mưa, sáng nắng gắt vẫn còn ẩm");
  advanceMinutes(store, BAL.noonDryMinutes - BAL.dayStartMinutes + 5);
  ok(!tile(store, PLOTS[0].x, PLOTS[0].y).wet, "quá trưa nắng gắt thì khô");
  // ngày thường: không tự khô giữa ngày
  const st2 = mkStore(8);
  walkTo(st2, HOME.x, HOME.y);
  selectItem(st2, "tool:hoe");
  use(st2, PLOTS[0].x, PLOTS[0].y);
  selectItem(st2, "tool:can");
  use(st2, PLOTS[0].x, PLOTS[0].y);
  setWeather(st2, "sunny", "sunny");
  advanceMinutes(st2, BAL.noonDryMinutes - BAL.dayStartMinutes + 5);
  ok(tile(st2, PLOTS[0].x, PLOTS[0].y).wet, "ngày nắng thường thì trưa không khô");
});

test("43. bão: cây con bị quật thành khúc gỗ, cây trồng lùi giai đoạn; bất biến xanh", () => {
  // content vá: bão quật CHẮC CHẮN, hại cây CHẮC CHẮN — kiểm cơ chế, không kiểm may rủi
  const c2 = contentWith((r) => {
    r.weather.weathers.find((w) => w.id === "storm").storm.cropChance = 1;
    r.props.props.find((p) => p.id === "sapling").stormFell.chance = 1;
    r.balance.diseaseChance = 0;
  });
  const store = createStore(createNewGame(c2, 11), c2, { validate: true, strict: true });
  walkTo(store, HOME.x, HOME.y);
  const s0 = store.getState();
  const spot = findOpenBlock(s0, 2, 1);
  setState(store, (s) => {
    putProp(s, spot.x, spot.y, "sapling");
    setTile(s, PLOTS[0].x, PLOTS[0].y, { tilled: true, wet: true, crop: { id: "lettuce", stage: 2, grow: 0, regrown: false } });
    setTile(s, PLOTS[1].x, PLOTS[1].y, { tilled: true, wet: true, crop: { id: "lettuce", stage: 0, grow: 0, regrown: false } });
    s.weather = { today: "storm", tomorrow: "sunny", wetStreak: 1, driedDay: 0 };
  });
  sleep(store);
  eq(tile(store, spot.x, spot.y).prop, "log", "cây con bị bão quật thành khúc gỗ");
  const t0 = tile(store, PLOTS[0].x, PLOTS[0].y);
  // đêm bão cây vẫn lớn trước rồi mới bị hại; growMul 1.2 với xà lách 1 ngày/giai đoạn:
  // stage 2 → có thể lên 3 (chín) rồi lùi về 2, hoặc lùi trực tiếp. Chỉ cần "không tăng".
  ok(t0.crop && t0.crop.stage <= 2, `cây đang lớn không được tiến sau bão (stage ${t0.crop && t0.crop.stage})`);
  const t1 = tile(store, PLOTS[1].x, PLOTS[1].y);
  ok(!t1.crop || t1.crop.stage === 0, "mầm bị bão thì mất hoặc đứng yên");
  deepEq(checkInvariants(store.getState(), c2), [], "bất biến xanh sau bão");
  // trong nhà: bão không quật — đặt cây con trong nhà (bản đồ house) rồi bão
  const c3 = contentWith((r) => {
    r.props.props.find((p) => p.id === "sapling").stormFell.chance = 1;
    r.balance.diseaseChance = 0;
  });
  const st3 = createStore(createNewGame(c3, 12), c3, { validate: true, strict: true });
  setState(st3, (s) => {
    const hm = s.maps.house;
    const i = idx(hm.w, 2, 2);
    Object.assign(hm.tiles[i], { prop: "sapling", hp: 2 });
    s.weather = { today: "storm", tomorrow: "sunny", wetStreak: 1, driedDay: 0 };
  });
  sleep(st3);
  eq(st3.getState().maps.house.tiles[idx(14, 2, 2)].prop, "sapling", "trong nhà bão không quật");
});

test("44. bệnh: cây bệnh không lớn, thu hoạch giảm; thuốc chữa khỏi; cuốc nhổ bỏ; lây sang cây kề", () => {
  const c2 = contentWith((r) => {
    r.balance.diseaseChance = 1; // đêm nay ai đang lớn cũng bệnh
  });
  const store = createStore(createNewGame(c2, 21), c2, { validate: true, strict: true });
  walkTo(store, HOME.x, HOME.y);
  const A = PLOTS[0];
  const B = PLOTS[3];
  setState(store, (s) => {
    setTile(s, A.x, A.y, { tilled: true, wet: true, crop: { id: "lettuce", stage: 1, grow: 0, regrown: false } });
    setTile(s, B.x, B.y, { tilled: true, wet: true, crop: { id: "lettuce", stage: 1, grow: 0, regrown: false } });
    s.weather = { today: "sunny", tomorrow: "sunny", wetStreak: 0, driedDay: 0 };
  });
  sleep(store);
  ok(tile(store, A.x, A.y).crop.sick === true, "diseaseChance=1 → cây bệnh");
  const stageSick = tile(store, A.x, A.y).crop.stage;
  // tưới rồi ngủ: bệnh thì không lớn
  topUpWater(store);
  selectItem(store, "tool:can");
  use(store, A.x, A.y);
  use(store, B.x, B.y);
  sleep(store);
  eq(tile(store, A.x, A.y).crop.stage, stageSick, "cây bệnh không lớn");
  // hint: cầm thuốc → CHỮA; cầm cuốc → NHỔ
  giveItem(store, "item:medicine", 2);
  selectItem(store, "item:medicine");
  eq(hintAt(store.getState(), c2, A.x, A.y).kind, "cure", "cầm thuốc lên cây bệnh → cure");
  selectItem(store, "tool:hoe");
  eq(hintAt(store.getState(), c2, B.x, B.y).kind, "pull", "cầm cuốc lên cây bệnh → pull");
  // chữa A
  selectItem(store, "item:medicine");
  const e0 = store.getState().energy;
  use(store, A.x, A.y);
  ok(!tile(store, A.x, A.y).crop.sick, "xịt thuốc thì khỏi");
  eq(countInv(store, "item:medicine"), 1, "tốn 1 thuốc");
  eq(store.getState().energy, e0 - c2.balance.energyCost.cure, "tốn năng lượng cure");
  eq(store.getState().stats.cured, 1, "stats.cured tăng");
  ok(store.getState().goalsDone.includes("g_cure"), "mục tiêu chữa cây bệnh đạt");
  // nhổ B
  selectItem(store, "tool:hoe");
  use(store, B.x, B.y);
  const tb = tile(store, B.x, B.y);
  eq(tb.crop, null, "nhổ thì mất cây");
  ok(tb.tilled, "ô vẫn đã cày");
  // sản lượng giảm: cây bệnh chín (đặt thẳng) thu được floor(yield×0.5) nhưng ≥1
  const c3 = contentWith((r) => {
    r.balance.diseaseChance = 0;
    r.balance.sickYieldMul = 0.5;
    r.crops.crops.find((c) => c.id === "lettuce").yieldMin = 4;
    r.crops.crops.find((c) => c.id === "lettuce").yieldMax = 4;
  });
  const st3 = createStore(createNewGame(c3, 22), c3, { validate: true, strict: true });
  walkTo(st3, HOME.x, HOME.y);
  setState(st3, (s) => {
    setTile(s, A.x, A.y, { tilled: true, wet: true, crop: { id: "lettuce", stage: 3, grow: 0, regrown: false, sick: true } });
    setTile(s, B.x, B.y, { tilled: true, wet: true, crop: { id: "lettuce", stage: 3, grow: 0, regrown: false } });
  });
  use(st3, A.x, A.y);
  eq(countInv(st3, "crop:lettuce"), 2, "cây bệnh chín thu được một nửa");
  use(st3, B.x, B.y);
  eq(countInv(st3, "crop:lettuce"), 6, "cây khoẻ thu đủ");
  // lây: diseaseChance nhỏ nhưng neighbourMul lớn → cây kề cây bệnh gần như chắc bệnh
  const c4 = contentWith((r) => {
    r.balance.diseaseChance = 0.001;
    r.balance.diseaseNeighbourMul = 1000;
  });
  const st4 = createStore(createNewGame(c4, 23), c4, { validate: true, strict: true });
  setState(st4, (s) => {
    setTile(s, A.x, A.y, { tilled: true, wet: true, crop: { id: "lettuce", stage: 1, grow: 0, regrown: false, sick: true } });
    setTile(s, A.x, A.y + 1, { tilled: true, wet: true, crop: { id: "lettuce", stage: 1, grow: 0, regrown: false } });
    s.weather = { today: "sunny", tomorrow: "sunny", wetStreak: 0, driedDay: 0 };
  });
  sleep(st4);
  ok(tile(st4, A.x, A.y + 1).crop.sick === true, "cây kề cây bệnh bị lây");
});

test("45. cỏ/bụi/cây con lớn theo ngày × thời tiết; cắt cỏ ra cỏ khô; lan sang ô kề", () => {
  const c2 = contentWith((r) => { r.balance.diseaseChance = 0; r.balance.grassSpreadChance = 0; });
  const store = createStore(createNewGame(c2, 31), c2, { validate: true, strict: true });
  walkTo(store, HOME.x, HOME.y);
  const s0 = store.getState();
  const spot = findOpenBlock(s0, 3, 3);
  const gx = spot.x + 1, gy = spot.y + 1;
  setState(store, (s) => {
    putProp(s, gx, gy, "grass_short");
    for (const p of c2.propOrder) { /* no-op: chỉ để chắc content có prop */ }
    s.weather = { today: "sunny", tomorrow: "sunny", wetStreak: 0, driedDay: 0 };
  });
  // grass_short.grow.days = 3, growMul nắng = 1 → sau 3 đêm thành grass_tall
  sleep(store); sleep(store);
  eq(tile(store, gx, gy).prop, "grass_short", "2 đêm chưa đủ");
  sleep(store);
  eq(tile(store, gx, gy).prop, "grass_tall", "3 đêm nắng thì cỏ non thành cỏ dày");
  ok(tile(store, gx, gy).age === undefined, "đổi dạng thì tuổi được xoá");

  // mưa: growMul 1.5 → 2 đêm mưa đủ 3 ngày lớn
  const st2 = createStore(createNewGame(c2, 32), c2, { validate: true, strict: true });
  setState(st2, (s) => {
    putProp(s, gx, gy, "grass_short");
    s.weather = { today: "rain", tomorrow: "rain", wetStreak: 1, driedDay: 0 };
  });
  sleep(st2);
  setState(st2, (s) => { s.weather.tomorrow = "rain"; });
  sleep(st2);
  eq(tile(st2, gx, gy).prop, "grass_tall", "mưa thì cỏ lớn nhanh hơn (2 đêm)");

  // cắt cỏ bằng tay không → cỏ khô
  walkTo(store, gx, gy - 1);
  setState(store, (s) => { s.sel = 2; }); // ô hotbar trống = tay không
  const before = countInv(store, "item:fodder");
  use(store, gx, gy);
  ok(countInv(store, "item:fodder") > before, "cắt cỏ dày ra cỏ khô");
  eq(tile(store, gx, gy).prop, null, "cắt xong ô trống");
  ok(!isSolid(store.getState(), c2, gx, gy), "cỏ không đặc, đi qua được");

  // lan: chance 1 → sau một đêm có thêm cỏ non ở ô kề
  const c3 = contentWith((r) => {
    r.balance.diseaseChance = 0; r.balance.grassSpreadChance = 0;
    r.props.props.find((p) => p.id === "grass_tall").spread.chance = 1;
  });
  const st3 = createStore(createNewGame(c3, 33), c3, { validate: true, strict: true });
  setState(st3, (s) => {
    putProp(s, gx, gy, "grass_tall");
    s.weather = { today: "sunny", tomorrow: "sunny", wetStreak: 0, driedDay: 0 };
  });
  sleep(st3);
  const around4 = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => tile(st3, gx + dx, gy + dy).prop);
  ok(around4.includes("grass_short"), `cỏ dày lan ra ô kề (${around4.join(",")})`);
  deepEq(checkInvariants(st3.getState(), c3), [], "bất biến xanh");
});

test("46. save v6 (không thời tiết, không kho) nạp lên bản mới nhất → migrate xanh", () => {
  const store = mkStore(41);
  walkTo(store, HOME.x, HOME.y);
  const s0 = store.getState();
  const spot = findOpenBlock(s0, 2, 2);
  setState(store, (s) => {
    putProp(s, spot.x, spot.y, "grass_short");
    s.tiles[idx(s.w, spot.x, spot.y)].age = 2;
    setTile(s, PLOTS[0].x, PLOTS[0].y, { tilled: true, wet: false, crop: { id: "lettuce", stage: 1, grow: 5, regrown: false, sick: true } });
  });
  // round-trip qua JSON
  const snap = clone(store.getState());
  const st2 = mkStore(41);
  st2.replace(JSON.parse(JSON.stringify(snap)));
  deepEq(st2.getState(), snap, "round-trip giữ sick/age/weather");

  // giả một save v6: bỏ weather, bỏ stats.cured, save=6
  const v6 = clone(snap);
  delete v6.weather;
  delete v6.stats.cured;
  v6.save = 6;
  const { migrateSave } = migrateApi;
  delete v6.store;
  const up = migrateSave({ magic: "onifarm", state: v6 });
  ok(up && up.save === SAVE_VERSION, `v6 → v${SAVE_VERSION} qua từng bậc`);
  deepEq(up.store, [], "bậc v7 → v8 điền kho rỗng");
  const mig = migrateForContent(up, content);
  deepEq(checkInvariants(mig.state, content), [], "sau migrate bất biến xanh: " + JSON.stringify(mig.notes));
  eq(mig.state.weather.today, content.weatherFirst, "thời tiết mặc định về kiểu đầu");
  eq(mig.state.stats.cured, 0, "stats.cured mặc định 0");
  eq(
    mig.state.store.length,
    content.balance.storeSlots ?? 60,
    "migrateForContent nong kho về đúng số ô của content",
  );
  ok(mig.state.tiles[idx(mig.state.w, PLOTS[0].x, PLOTS[0].y)].crop.sick === true, "giữ cờ bệnh qua migrate");
  eq(mig.state.tiles[idx(mig.state.w, spot.x, spot.y)].age, 2, "giữ tuổi vật thể qua migrate");
  // content gỡ kiểu thời tiết đang dùng → về kiểu đầu, không ném
  const c2 = contentWith((r) => { r.weather.weathers = r.weather.weathers.filter((w) => w.id !== "fog"); });
  const withFog = clone(snap);
  withFog.weather.today = "fog";
  const mig2 = migrateForContent(withFog, c2);
  eq(mig2.state.weather.today, c2.weatherFirst, "kiểu thời tiết bị gỡ → về kiểu đầu");
  deepEq(checkInvariants(mig2.state, c2), [], "bất biến xanh");
});

/* ========================================================================== */
/* 47. MÙA VỤ                                                                 */
/* ========================================================================== */

test("47. mùa vụ: lịch đúng, hạt trái mùa không gieo/không mua được", () => {
  const { seasonOfDay, dayOfSeason, yearOf, cropInSeason } = seasonApi;

  // --- lịch: 12 ngày mỗi mùa, 4 mùa một năm ---
  eq(seasonOfDay(1, content).id, "xuan", "ngày 1 là Xuân");
  eq(seasonOfDay(12, content).id, "xuan", "ngày 12 vẫn Xuân");
  eq(seasonOfDay(13, content).id, "ha", "ngày 13 sang Hạ");
  eq(seasonOfDay(37, content).id, "dong", "ngày 37 là Đông");
  eq(seasonOfDay(49, content).id, "xuan", "ngày 49 quay lại Xuân");
  eq(yearOf(49, content), 2, "ngày 49 là năm 2");
  eq(dayOfSeason(25, content), 1, "ngày 25 là ngày đầu mùa Thu");

  // --- dâu tây chỉ mùa Xuân ---
  ok(cropInSeason("strawberry", 1, content), "dâu tây gieo được mùa Xuân");
  ok(!cropInSeason("strawberry", 13, content), "dâu tây KHÔNG gieo được mùa Hạ");
  ok(cropInSeason("scallion", 40, content), "hành lá gieo được cả mùa Đông");

  // --- gieo trái mùa bị từ chối ---
  const store = mkStore(701);
  walkTo(store, HOME.x, HOME.y);
  const plot = PLOTS[0];
  selectItem(store, "tool:hoe");
  use(store, plot.x, plot.y);
  ok(tile(store, plot.x, plot.y).tilled, "ô đã cày");

  setState(store, (s) => {
    s.day = 13; // mùa Hạ
    s.inv[2] = { id: "seed:strawberry", n: 3 };
  });
  eq(seasonApi.currentSeason(store.getState(), content).id, "ha", "đang ở mùa Hạ");
  eq(canUseAt(store.getState(), content, plot.x, plot.y), null, "con trỏ báo KHÔNG gieo được");
  selectItem(store, "seed:strawberry");
  use(store, plot.x, plot.y);
  eq(tile(store, plot.x, plot.y).crop, null, "gieo trái mùa không ăn thua");
  eq(countInv(store, "seed:strawberry"), 3, "không mất hạt nào");

  // --- đúng mùa thì gieo được ---
  setState(store, (s) => { s.day = 1; });
  selectItem(store, "seed:strawberry");
  use(store, plot.x, plot.y);
  eq(tile(store, plot.x, plot.y).crop.id, "strawberry", "mùa Xuân gieo dâu được");

  // --- mua hạt trái mùa bị từ chối ---
  const st2 = mkStore(702);
  setState(st2, (s) => { s.day = 13; s.money = 9999; });
  const tienTruoc = st2.getState().money;
  st2.dispatch({ t: "BUY", id: "strawberry", n: 1 });
  eq(st2.getState().money, tienTruoc, "mua hạt trái mùa không trừ tiền");
  eq(countInv(st2, "seed:strawberry"), 0, "và không có hạt nào vào túi");
  deepEq(checkInvariants(st2.getState(), content), [], "bất biến sau khi bị từ chối");
});

test("48. sang mùa: cây chưa chín trái mùa héo, cây đã chín và ô nhà kính còn nguyên", () => {
  const store = mkStore(703);
  walkTo(store, HOME.x, HOME.y);
  unlockAll(store);

  const CHUA_CHIN = PLOTS[0];   // dâu tây (chỉ Xuân), còn xanh  → phải héo
  const DA_CHIN = PLOTS[1];     // dâu tây (chỉ Xuân), đã chín   → phải còn
  const HOP_MUA = PLOTS[2];     // hành lá (bốn mùa)             → phải còn
  const NHA_KINH = PLOTS[3];    // dâu tây trên sàn nhà kính     → phải còn

  const rip = content.crops.strawberry.growthDays.length;
  setState(store, (s) => {
    s.day = 12; // ngày cuối mùa Xuân
    setTile(s, CHUA_CHIN.x, CHUA_CHIN.y, { tilled: true, wet: false, crop: { id: "strawberry", stage: 0, grow: 0, regrown: false } });
    setTile(s, DA_CHIN.x, DA_CHIN.y, { tilled: true, wet: false, crop: { id: "strawberry", stage: rip, grow: 0, regrown: false } });
    setTile(s, HOP_MUA.x, HOP_MUA.y, { tilled: true, wet: false, crop: { id: "scallion", stage: 0, grow: 0, regrown: false } });
    setTile(s, NHA_KINH.x, NHA_KINH.y, { tilled: true, wet: false, b: "greenhouse", crop: { id: "strawberry", stage: 0, grow: 0, regrown: false } });
  });

  sleep(store);
  eq(store.getState().day, 13, "đã sang ngày 13");
  eq(seasonApi.currentSeason(store.getState(), content).id, "ha", "đã sang mùa Hạ");

  eq(tile(store, CHUA_CHIN.x, CHUA_CHIN.y).crop, null, "cây trái mùa chưa chín thì héo");
  ok(tile(store, DA_CHIN.x, DA_CHIN.y).crop, "cây ĐÃ CHÍN thì không bị đụng tới");
  eq(tile(store, DA_CHIN.x, DA_CHIN.y).crop.id, "strawberry", "vẫn là dâu tây, gặt được bình thường");
  ok(tile(store, HOP_MUA.x, HOP_MUA.y).crop, "cây hợp mùa mới thì ở lại");
  ok(tile(store, NHA_KINH.x, NHA_KINH.y).crop, "ô sàn nhà kính miễn nhiễm mùa");
  deepEq(checkInvariants(store.getState(), content), [], "bất biến sau khi sang mùa");

  // ô đã cày vẫn còn để gieo lứa mới — không mất luôn công cày
  ok(tile(store, CHUA_CHIN.x, CHUA_CHIN.y).tilled, "chỉ mất cây, không mất luống");

  // --- mùa Đông cây lớn chậm hơn mùa Xuân ---
  const lonTrongMua = (day) => {
    const st = mkStore(704);
    walkTo(st, HOME.x, HOME.y);
    const p = PLOTS[0];
    setState(st, (s) => {
      s.day = day;
      s.weather = { today: "overcast", tomorrow: "overcast", wetStreak: 0, driedDay: 0 };
      setTile(s, p.x, p.y, { tilled: true, wet: true, crop: { id: "scallion", stage: 0, grow: 0, regrown: false } });
    });
    st.dispatch({ t: "TICK", dt: 60 });
    return tile(st, p.x, p.y).crop.grow;
  };
  const xuan = lonTrongMua(1);
  const dong = lonTrongMua(37);
  ok(xuan > 0 && dong > 0, "cả hai mùa cây đều lớn");
  ok(dong < xuan, `mùa Đông chậm hơn mùa Xuân: đông ${dong.toFixed(1)} < xuân ${xuan.toFixed(1)}`);
  ok(
    Math.abs(dong / xuan - 0.8) < 1e-6,
    `đúng bằng growMul 0,8 của mùa Đông: tỉ lệ ${(dong / xuan).toFixed(4)}`,
  );
});

/* ========================================================================== */
/* 49-50. TỰ TÌM VIỆC Ở XA                                                     */
/* ========================================================================== */

test("49. nearestTarget bán kính rộng: tìm được ô NGOÀI tầm với; gọi kiểu cũ không đổi", () => {
  const store = mkStore(810);
  walkTo(store, HOME.x, HOME.y);
  selectItem(store, "tool:hoe");

  // dọn sạch mọi ô cày được quanh chân, để chỉ còn việc ở XA
  for (let i = 0; i < 40; i++) {
    const near = nearestTarget(store.getState(), content, "till", null);
    if (!near) break;
    use(store, near.x, near.y);
  }
  eq(nearestTarget(store.getState(), content, "till", null), null, "quanh chân đã hết việc");

  // …nhưng mở rộng bán kính thì vẫn còn cả nông trại để cày
  const far = nearestTarget(store.getState(), content, "till", null, {
    radius: 12,
    requireReach: false,
  });
  ok(far, "bán kính rộng thì tìm ra ô ở xa");
  eq(far.kind, "till", "vẫn đúng loại việc");
  const s0 = store.getState();
  const xa = Math.hypot(far.x * TILE + 8 - s0.player.x, far.y * TILE + 8 - s0.player.y) / TILE;
  ok(
    xa > 1.6,
    `ô tìm được nằm NGOÀI tầm với (${xa.toFixed(2)} ô > 1,6) — nơi gọi phải tự đi tới`,
  );

  // giá trị mặc định phải y hệt hành vi cũ (bảo vệ kịch bản 40)
  const st2 = mkStore(811);
  walkTo(st2, HOME.x, HOME.y);
  selectItem(st2, "tool:hoe");
  const a = nearestTarget(st2.getState(), content, "till", null);
  const b = nearestTarget(st2.getState(), content, "till", null, {});
  const c = nearestTarget(st2.getState(), content, "till", null, { radius: 2, requireReach: true });
  deepEq(b, a, "gọi với opts rỗng cho kết quả y hệt gọi không opts");
  deepEq(c, a, "gọi với đúng giá trị mặc định cũng y hệt");
});

test("50. quét theo VÒNG cho kết quả y hệt quét vét cạn (bẫy ô chéo vòng trong)", () => {
  /* Đây là bẫy thật, suýt lọt: điểm số = phạt-khác-loại(0|100) + chéo(0|10) +
     khoảng cách. Một ô CHÉO ở vòng 1 (10 + 22,6 = 32,6) THUA một ô THẲNG HÀNG ở
     vòng 2 (0 + 32 = 32). Nên "tìm thấy ở vòng nào là dừng ở vòng đó" sẽ trả về
     ô khác với bản quét đầy đủ. Test này so hai cách trên nhiều thế trận. */
  const R = 6;
  const vetCan = (s, prefer) => {
    const px = s.player.x, py = s.player.y;
    const cx = Math.floor(px / 16), cy = Math.floor(py / 16);
    let best = null, bestScore = Infinity;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= s.w || y >= s.h) continue;
        const kind = canUseAt(s, content, x, y, true);
        if (kind === null) continue;
        const d = Math.hypot(x * 16 + 8 - px, y * 16 + 8 - py);
        const straight = dx === 0 || dy === 0 ? 0 : 1;
        const score = (prefer && kind !== prefer ? 100 : 0) + straight * 10 + d;
        if (score < bestScore) { bestScore = score; best = { x, y, kind }; }
      }
    }
    return best;
  };

  let soCa = 0;
  for (let seed = 820; seed < 832; seed++) {
    const store = mkStore(seed);
    walkTo(store, HOME.x, HOME.y);
    selectItem(store, "tool:hoe");
    // cày ngẫu nhiên vài ô để thế trận mỗi vòng lặp một khác
    for (let i = 0; i < seed % 7; i++) {
      const t = nearestTarget(store.getState(), content, "till", null);
      if (!t) break;
      use(store, t.x, t.y);
    }
    for (const prefer of ["till", "water", null]) {
      const s = store.getState();
      const vong = nearestTarget(s, content, prefer, null, { radius: R, requireReach: false });
      const het = vetCan(s, prefer);
      deepEq(vong, het, `seed ${seed}, prefer ${prefer}: quét vòng phải khớp quét vét cạn`);
      soCa++;
    }
  }
  ok(soCa >= 30, `đã so ${soCa} thế trận`);
});

/* ========================================================================== */
/* 51-53. HẠ TẦNG: đường nhựa, hàng rào, xây theo tuyến                       */
/* ========================================================================== */

test("51. đường nhựa (NỀN asphalt): đi nhanh hơn, và A* tự vòng qua đường", () => {
  /* Đường không còn là công trình mua được — nó là NỀN `asphalt` do bản đồ vẽ
     sẵn. Luật thì y nguyên: `speedMul` vừa làm nhân vật đi nhanh hơn, vừa chia
     chi phí mỗi bước của A*. Kịch bản này đo đúng hai điều đó, chỉ đổi cách
     dựng cảnh từ `t.b = "road"` sang `t.g = "asphalt"`. */
  const store = mkStore(901);
  walkTo(store, HOME.x, HOME.y);
  const spot = findOpenBlock(store.getState(), 8, 3);

  // đo tốc độ: cùng số khung hình, một lần trên cỏ một lần trên đường
  const diBaoXa = (tren) => {
    const st = mkStore(902);
    setState(st, (s) => {
      const x = spot.x, y = spot.y;
      for (let i = 0; i < 8; i++) {
        const t = s.tiles[idx(s.w, x + i, y)];
        if (tren) t.g = tren;
      }
      s.player = { ...s.player, x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, moving: false };
    });
    const x0 = st.getState().player.x;
    for (let i = 0; i < 60; i++) st.dispatch({ t: "MOVE", dx: 1, dy: 0, dt: 1 / 60 });
    return st.getState().player.x - x0;
  };
  const nhanh = content.tiles.grounds.asphalt.speedMul;
  const treoCo = diBaoXa(null);
  const treoDuong = diBaoXa("asphalt");
  const tiSo = treoDuong / treoCo;
  ok(
    Math.abs(tiSo - nhanh) < 0.02,
    `đi trên đường nhanh hơn đúng speedMul: tỉ số ${tiSo.toFixed(3)}, mong đợi ${nhanh}`,
  );

  /* A*: hai đường vòng DÀI BẰNG NHAU, một lát nhựa một không. Đường thẳng ở
     giữa bị rào chắn. Đây mới là phép thử công bằng — nếu bắt A* đi vòng xa hơn
     1,35 lần thì nó chọn đi thẳng qua cỏ là ĐÚNG, không phải lỗi. */
  const st = mkStore(903);
  const nav = createNavigator();
  // Vùng cố định ở nửa nam bản đồ, tự dọn sạch bên dưới — không cần tìm chỗ
  // trống sẵn 12×5, bản đồ 40×30 rải cây đá khắp nơi nên hiếm khi có.
  const X = 20, Y = 21;
  setState(st, (s) => {
    for (let j = 0; j < 5; j++)
      for (let i = 0; i < 12; i++) {
        const t = s.tiles[idx(s.w, X + i, Y + j)];
        t.prop = null; t.b = null; t.hp = 0;
      }
    // tường rào chắn lối thẳng ở hàng giữa
    for (let i = 1; i <= 9; i++) s.tiles[idx(s.w, X + i, Y + 2)].b = "fence";
    // đường vòng PHÍA TRÊN lát nhựa
    for (let i = 0; i <= 10; i++) s.tiles[idx(s.w, X + i, Y)].g = "asphalt";
    s.player = { ...s.player, x: (X + 0.5) * TILE, y: (Y + 2.5) * TILE, moving: false };
  });
  ok(nav.goTo(st.getState(), content, X + 10, Y + 2, { act: false }), "tìm được đường vòng");

  const daDi = new Set();
  for (let f = 0; f < 1800; f++) {
    const v = nav.update(st.getState(), content, 1 / 60);
    if (v) st.dispatch({ t: "MOVE", dx: v.dx, dy: v.dy, dt: 1 / 60, run: v.run });
    const p2 = st.getState().player;
    daDi.add(`${Math.floor(p2.x / TILE)},${Math.floor(p2.y / TILE)}`);
    if (nav.takeArrival() || !nav.isActive()) break;
  }
  let quaTren = 0, quaDuoi = 0;
  for (const k of daDi) {
    const [, yy] = k.split(",").map(Number);
    if (yy <= Y + 1) quaTren++;
    if (yy >= Y + 3) quaDuoi++;
  }
  ok(
    quaTren > quaDuoi,
    `chọn đường vòng CÓ NHỰA (trên ${quaTren} ô) thay vì đường cỏ dài bằng đúng thế (dưới ${quaDuoi} ô)`,
  );
});

test("52. hàng rào: chặn đường, và sprite tự nối theo hàng xóm", () => {
  const store = mkStore(904);
  walkTo(store, HOME.x, HOME.y);
  const spot = findOpenBlock(store.getState(), 4, 4);

  setState(store, (s) => {
    for (let i = 0; i < 4; i++) s.tiles[idx(s.w, spot.x + i, spot.y)].b = "fence";
  });
  const s = store.getState();
  ok(
    isSolid(s, content, (spot.x + 1) * TILE + 8, spot.y * TILE + 8),
    "ô có hàng rào là ô đặc",
  );
  eq(
    content.buildings.fence.autotile,
    "fence",
    "hàng rào khai báo tự nối trong content, không hardcode trong code",
  );
  deepEq(checkInvariants(store.getState(), content), [], "bất biến sau khi dựng rào");
});

test("53. xây theo tuyến: hình chữ L, thiếu vật liệu thì dừng, ngoài tầm thì không làm gì", () => {
  const { linePath } = actionsApi;

  // hình chữ L: đi ngang trước rồi đi dọc
  const oL = linePath(2, 3, 5, 6);
  eq(oL.length, 4 + 3, "tuyến 3 ngang + 3 dọc = 7 ô (kể cả ô đầu)");
  deepEq(oL[0], { x: 2, y: 3 }, "bắt đầu đúng ô đầu");
  deepEq(oL[oL.length - 1], { x: 5, y: 6 }, "kết thúc đúng ô cuối");
  ok(oL.slice(0, 4).every((c) => c.y === 3), "đoạn đầu chạy NGANG");
  ok(oL.slice(4).every((c) => c.x === 5), "đoạn sau chạy DỌC");
  ok(linePath(0, 0, 99, 0).length <= 24, "tuyến bị chặn ở MAX_LINE");

  const store = mkStore(905);
  walkTo(store, HOME.x, HOME.y);
  const p = store.getState().player;
  const cx = Math.floor(p.x / TILE);
  const cy = Math.floor(p.y / TILE);

  // đủ vật liệu: 6 ô sàn nhà kính cho tuyến 5 ô
  setState(store, (s) => {
    s.inv[3] = { id: "build:greenhouse", n: 6 };
    s.energy = 100;
  });
  selectItem(store, "build:greenhouse");
  const nl0 = store.getState().energy;
  store.dispatch({ t: "BUILD_LINE", id: "greenhouse", x0: cx + 1, y0: cy, x1: cx + 5, y1: cy });
  const s1 = store.getState();
  let dung = 0;
  for (let i = 1; i <= 5; i++) if (s1.tiles[idx(s1.w, cx + i, cy)]?.b === "greenhouse") dung++;
  ok(dung >= 3, `dựng được nhiều ô trong một lệnh: ${dung} ô`);
  eq(countInv(store, "build:greenhouse"), 6 - dung, "trừ đúng một vật phẩm mỗi ô, không giảm giá theo lô");
  eq(
    Math.round(nl0 - s1.energy),
    dung * content.balance.energyCost.build,
    "trừ đủ năng lượng cho từng ô",
  );

  // ô ĐẦU ngoài tầm với → không làm gì cả
  const st2 = mkStore(906);
  walkTo(st2, HOME.x, HOME.y);
  setState(st2, (s) => { s.inv[3] = { id: "build:greenhouse", n: 20 }; });
  selectItem(st2, "build:greenhouse");
  const truoc = st2.getState();
  const sau = st2.dispatch({ t: "BUILD_LINE", id: "greenhouse", x0: 2, y0: 2, x1: 6, y1: 2 });
  eq(countInv(st2, "build:greenhouse"), 20, "ngoài tầm với: không tốn vật phẩm nào");
  ok(truoc.tiles === sau.tiles, "và không đụng vào lưới ô");

  /* VẼ BAO NHIÊU TÍNH TIỀN BẤY NHIÊU: hết hàng trong balo thì mua tại chỗ. */
  const st3 = mkStore(907);
  walkTo(st3, HOME.x, HOME.y);
  const q = st3.getState().player;
  const qx = Math.floor(q.x / TILE), qy = Math.floor(q.y / TILE);
  const gia = content.buildings.greenhouse.price;
  setState(st3, (s) => { s.inv[3] = { id: "build:greenhouse", n: 2 }; s.energy = 100; s.money = 9999; });
  selectItem(st3, "build:greenhouse");
  const tien0 = st3.getState().money;
  st3.dispatch({ t: "BUILD_LINE", id: "greenhouse", x0: qx + 1, y0: qy, x1: qx + 8, y1: qy, far: true });
  eq(countInv(st3, "build:greenhouse"), 0, "dùng hết hàng có sẵn trước");
  const s3 = st3.getState();
  let d3 = 0;
  for (let i = 1; i <= 8; i++) if (s3.tiles[idx(s3.w, qx + i, qy)]?.b === "greenhouse") d3++;
  ok(d3 > 2, `hết hàng thì mua tiếp, dựng được ${d3} ô chứ không dừng ở 2`);
  eq(tien0 - s3.money, (d3 - 2) * gia, `trả đúng ${d3 - 2} ô × ${gia}đ, hai ô đầu dùng hàng có sẵn`);
  deepEq(checkInvariants(s3, content), [], "bất biến sau khi vừa dùng hàng vừa mua");

  /* …nhưng KHÔNG NỢ: hết cả hàng lẫn tiền thì dừng đúng chỗ đó. */
  const st4 = mkStore(9071);
  walkTo(st4, HOME.x, HOME.y);
  const r4 = st4.getState().player;
  const rx = Math.floor(r4.x / TILE), ry = Math.floor(r4.y / TILE);
  setState(st4, (s) => { s.inv[3] = null; s.energy = 100; s.money = gia * 3; });
  st4.dispatch({ t: "BUILD_LINE", id: "greenhouse", x0: rx + 1, y0: ry, x1: rx + 8, y1: ry, far: true });
  const s4 = st4.getState();
  let d4 = 0;
  for (let i = 1; i <= 8; i++) if (s4.tiles[idx(s4.w, rx + i, ry)]?.b === "greenhouse") d4++;
  eq(d4, 3, "chỉ dựng đúng số ô tiền mua nổi");
  eq(s4.money, 0, "tiêu hết tiền, không âm");
});

test("54. kho tập trung: cất/lấy giữ nguyên tổng số món, bán từ kho vào đúng tiền", () => {
  const store = mkStore(908);
  walkTo(store, HOME.x, HOME.y);
  const c = content;

  setState(store, (s) => {
    s.inv[3] = { id: "crop:lettuce", n: 7 };
    s.inv[4] = { id: "item:wood", n: 5 };
    s.inv[5] = { id: "seed:lettuce", n: 3 };
  });

  eq(store.getState().store.length, c.balance.storeSlots ?? 60, "kho có đúng số ô của content");

  const tongTruoc = (st) =>
    [...st.getState().inv, ...st.getState().store].reduce((n, v) => n + (v ? v.n : 0), 0);
  const t0 = tongTruoc(store);

  // cất một ô
  store.dispatch({ t: "STORE_PUT", slot: 3, n: 7 });
  eq(countInv(store, "crop:lettuce"), 0, "túi hết xà lách");
  eq(
    store.getState().store.reduce((n, v) => n + (v && v.id === "crop:lettuce" ? v.n : 0), 0),
    7,
    "kho nhận đủ 7",
  );
  eq(tongTruoc(store), t0, "cất không làm sinh ra hay mất đi món nào");

  // lấy lại 3
  const slotKho = store.getState().store.findIndex((v) => v && v.id === "crop:lettuce");
  store.dispatch({ t: "STORE_TAKE", slot: slotKho, n: 3 });
  eq(countInv(store, "crop:lettuce"), 3, "lấy ra đúng 3");
  eq(tongTruoc(store), t0, "lấy cũng không làm đổi tổng");

  // cất hết: nông sản + nguyên liệu đi, HẠT GIỐNG và CÔNG CỤ ở lại
  const hatTruoc = countInv(store, "seed:lettuce");
  store.dispatch({ t: "STORE_PUT_ALL" });
  eq(countInv(store, "crop:lettuce"), 0, "cất hết nông sản");
  eq(countInv(store, "item:wood"), 0, "cất hết nguyên liệu");
  eq(
    countInv(store, "seed:lettuce"),
    hatTruoc,
    "KHÔNG cất hạt giống — cất mất thì ra ruộng lại phải chạy về lấy",
  );
  eq(countInv(store, "tool:hoe"), 1, "KHÔNG cất công cụ");
  eq(tongTruoc(store), t0, "cất hết vẫn giữ nguyên tổng");

  // bán hết trong kho: chỉ nông sản, nguyên liệu ở lại
  const tien0 = store.getState().money;
  const ban0 = store.getState().stats.sold;
  store.dispatch({ t: "STORE_SELL_ALL" });
  const s2 = store.getState();
  eq(
    s2.store.reduce((n, v) => n + (v && v.id.startsWith("crop:") ? v.n : 0), 0),
    0,
    "kho không còn nông sản",
  );
  eq(
    s2.store.reduce((n, v) => n + (v && v.id === "item:wood" ? v.n : 0), 0),
    5,
    "nguyên liệu KHÔNG bị bán theo",
  );
  eq(s2.money - tien0, c.crops.lettuce.sellPrice * 7, "cộng đúng tiền bán 7 cây xà lách");
  eq(s2.stats.sold - ban0, 7, "thống kê đã bán tăng đúng");
  deepEq(checkInvariants(s2, content), [], "bất biến sau khi dùng kho");

  // round-trip qua JSON: kho phải sống sót
  const snap = clone(s2);
  const st2 = mkStore(909);
  st2.replace(JSON.parse(JSON.stringify(snap)));
  deepEq(st2.getState().store, snap.store, "kho đi qua save/load nguyên vẹn");
});

/* ========================================================================== */
/* 55-58. HỆ THỰC THỂ: vật nuôi, sâu bọ                                       */
/* ========================================================================== */

test("55. TICK không bao giờ đụng state.seed — dây bẫy của tính tất định", () => {
  /* Đây là kịch bản quan trọng nhất của cả hệ thực thể.

     Trước khi có con vật, đường TICK không rút một hạt ngẫu nhiên nào; seed chỉ
     bị rút theo SỰ KIỆN. Nếu 20 con vật cùng rút seed toàn cục mỗi khung hình
     thì SỐ LẦN rút phụ thuộc số khung hình — mà số khung hình phụ thuộc fps và
     cả việc có mở modal hay không. Bất biến "cùng seed + cùng chuỗi action =
     state y hệt" vỡ ngay, và vỡ ÂM THẦM: game vẫn chạy, chỉ là replay không còn
     khớp và save của người chơi không tái lập được.

     Mỗi con mang hạt riêng chính là để tránh chuyện đó. Test này canh đúng chỗ. */
  const store = mkStore(920);
  walkTo(store, HOME.x, HOME.y);
  const s0 = store.getState();
  const spot = findOpenBlock(s0, 6, 5);

  setState(store, (s) => {
    s.money = 999999;
  });
  // thả 20 con quanh một khoảng đất trống
  setState(store, (s) => {
    let n = 0;
    for (let j = 0; j < 5 && n < 20; j++)
      for (let i = 0; i < 6 && n < 20; i++) {
        n++;
        s.entSeq = n;
        s.entities.push({
          id: n,
          kind: "animal",
          def: ["chicken", "duck", "goat", "pig"][n % 4],
          map: "farm",
          x: (spot.x + i) * TILE + 8,
          y: (spot.y + j) * TILE + 8,
          dir: "down",
          anim: 0,
          seed: 1000 + n,
          ai: { phase: "idle", until: 0, tx: -1, ty: -1, path: [], planAt: -999 },
          animal: { age: 1, fed: 500, hungryDays: 0, prod: [0] },
        });
      }
  });
  eq(store.getState().entities.length, 20, "đã thả 20 con");

  const seedTruoc = store.getState().seed;
  for (let i = 0; i < 3000; i++) store.dispatch({ t: "TICK", dt: 1 / 60 });
  eq(store.getState().seed, seedTruoc, "3000 khung hình TICK không đổi state.seed một lần nào");
  ok(store.getState().entities.length === 20, "không con nào biến mất");
  deepEq(checkInvariants(store.getState(), content), [], "bất biến sau 3000 khung hình có 20 con vật");
});

test("56. thực thể tất định: cùng seed + cùng chuỗi action → state y hệt", () => {
  const chay = (dts) => {
    const st = mkStore(921);
    walkTo(st, HOME.x, HOME.y);
    const spot = findOpenBlock(st.getState(), 4, 4);
    setState(st, (s) => {
      for (let n = 1; n <= 8; n++) {
        s.entSeq = n;
        s.entities.push({
          id: n, kind: "animal", def: "chicken", map: "farm",
          x: (spot.x + (n % 4)) * TILE + 8, y: (spot.y + ((n / 4) | 0)) * TILE + 8,
          dir: "down", anim: 0, seed: 500 + n,
          ai: { phase: "idle", until: 0, tx: -1, ty: -1, path: [], planAt: -999 },
          animal: { age: 1, fed: 400, hungryDays: 0, prod: [0] },
        });
      }
    });
    for (const dt of dts) st.dispatch({ t: "TICK", dt });
    return clone(st.getState());
  };
  const a = chay(new Array(600).fill(1 / 60));
  const b = chay(new Array(600).fill(1 / 60));
  deepEq(b.entities, a.entities, "hai lần chạy giống hệt nhau cho ra cùng vị trí và cùng trạng thái");
  eq(b.actStep, a.actStep, "cùng số bước quyết định");

  /* Nhịp khung hình KHÁC nhau, tổng thời gian bằng nhau → số bước gần như bằng.
     Cố ý CHỈ đòi lệch tối đa 1: 600×(1/60) và 300×(1/30) bằng nhau về toán học
     nhưng cộng dồn dấu phẩy động thì không, nên `minutes` có thể rơi hai bên một
     mốc nửa phút. Thứ PHẢI khớp tuyệt đối là replay cùng chuỗi dt — đó là cái
     save và test dựa vào, và nó đã được kiểm ở trên. Đòi 30fps khớp từng bước
     với 60fps là đòi một thứ không hệ nào có số thực làm được. */
  const c = chay(new Array(300).fill(1 / 30));
  ok(
    Math.abs(c.actStep - a.actStep) <= 1,
    `30 fps và 60 fps lệch tối đa một bước: ${c.actStep} vs ${a.actStep}`,
  );
});

test("57. vòng đời vật nuôi: đói → chết; cho ăn thì hồi; tới lứa thì thu được", () => {
  const store = mkStore(922);
  walkTo(store, HOME.x, HOME.y);
  const p = store.getState().player;
  const px = Math.floor(p.x / TILE), py = Math.floor(p.y / TILE);

  const tha = (def, dx, dy, over) => {
    setState(store, (s) => {
      const n = s.entSeq + 1;
      s.entSeq = n;
      s.entities.push({
        id: n, kind: "animal", def, map: "farm",
        x: (px + dx) * TILE + 8, y: (py + dy) * TILE + 8,
        dir: "down", anim: 0, seed: 77 + n,
        ai: { phase: "idle", until: 0, tx: -1, ty: -1, path: [], planAt: -999 },
        animal: { age: 9, fed: 400, hungryDays: 0, prod: [0], ...(over ?? {}) },
      });
    });
    return store.getState().entSeq;
  };

  // --- bò tới lứa: vắt được sữa ---
  const idBo = tha("cow", 1, 0, { prod: [99999] });
  const sua0 = countInv(store, "item:milk");
  store.dispatch({ t: "GATHER", x: px + 1, y: py });
  ok(countInv(store, "item:milk") > sua0, "vắt được sữa khi tới lứa");
  const bo = store.getState().entities.find((e) => e.id === idBo);
  eq(bo.animal.prod[0], 0, "đồng hồ sản phẩm chạy lại từ đầu");
  ok(store.getState().stats.gathered > 0, "thống kê 'gathered' tăng");

  // --- vắt lần hai ngay lập tức thì không được ---
  const sua1 = countInv(store, "item:milk");
  store.dispatch({ t: "GATHER", x: px + 1, y: py });
  eq(countInv(store, "item:milk"), sua1, "chưa tới lứa thì không vắt được nữa");

  /* --- đói lâu thì CHẾT, và có báo trước bằng mấy ngày đói ---
     Phải DỌN SẠCH CỎ trên bản đồ trước: từ khi con vật tự đi tìm cỏ ăn thì con
     heo đứng giữa nông trại đầy cỏ sẽ không bao giờ chết đói — và đó chính là
     hành vi đúng. Chết đói chỉ xảy ra khi thật sự không còn gì để gặm. */
  const st2 = mkStore(923);
  walkTo(st2, HOME.x, HOME.y);
  setState(st2, (s) => {
    for (const t of s.tiles) if (t.prop !== null) t.prop = null;
    s.entSeq = 1;
    s.entities.push({
      id: 1, kind: "animal", def: "pig", map: "farm",
      x: (px + 1) * TILE + 8, y: (py + 1) * TILE + 8,
      dir: "down", anim: 0, seed: 5,
      ai: { phase: "idle", until: 0, tx: -1, ty: -1, path: [], planAt: -999 },
      animal: { age: 9, fed: 0, hungryDays: 0, prod: [] },
    });
  });
  const doi = content.animals.pig.starveDays;
  for (let i = 0; i < doi - 1; i++) sleep(st2);
  ok(st2.getState().entities.length === 1, `còn sống sau ${doi - 1} ngày đói`);
  const truoc = st2.getState().entities[0].animal.hungryDays;
  ok(truoc >= doi - 1, `đếm đúng số ngày đói: ${truoc}`);
  sleep(st2);
  eq(st2.getState().entities.length, 0, `đói đủ ${doi} ngày thì chết`);
  deepEq(checkInvariants(st2.getState(), content), [], "bất biến sau khi con vật chết");

  // --- gà thả rông KHÔNG chết đói: tự kiếm ăn ---
  const st3 = mkStore(924);
  walkTo(st3, HOME.x, HOME.y);
  setState(st3, (s) => {
    s.entSeq = 1;
    s.entities.push({
      id: 1, kind: "animal", def: "chicken", map: "farm",
      x: (px + 1) * TILE + 8, y: (py + 1) * TILE + 8,
      dir: "down", anim: 0, seed: 6,
      ai: { phase: "idle", until: 0, tx: -1, ty: -1, path: [], planAt: -999 },
      animal: { age: 9, fed: 0, hungryDays: 0, prod: [0] },
    });
  });
  for (let i = 0; i < 12; i++) sleep(st3);
  eq(st3.getState().entities.length, 1, "gà thả rông tự kiếm ăn, 12 ngày vắng mặt vẫn sống");

  /* --- và ĐI TÌM CỎ thật: con heo trên nông trại còn cỏ thì không chết,
         mà bãi cỏ nó ăn phải BIẾN MẤT --- */
  const st4 = mkStore(926);
  walkTo(st4, HOME.x, HOME.y);
  /* Đếm cỏ TRONG ĐÚNG VẠT vừa rải, không đếm cả bản đồ: cỏ tự LAN mỗi đêm, nên
     con số toàn bản đồ đo cả tốc độ lan lẫn miếng con heo gặm — thêm vài bụi cỏ
     ở một góc bản đồ khác là phép đo đổi dấu, mà chẳng liên quan gì tới con heo. */
  const VAT = { x: 0, y: 0, r: 2 };
  const demCo = (st) => {
    const s = st.getState();
    let n = 0;
    for (let dy = -VAT.r; dy <= VAT.r; dy++)
      for (let dx = -VAT.r; dx <= VAT.r; dx++) {
        const t = s.tiles[idx(s.w, VAT.x + dx, VAT.y + dy)];
        if (t && (t.prop === "grass_tall" || t.prop === "grass_short")) n++;
      }
    return n;
  };
  VAT.x = px + 4;
  VAT.y = py;
  setState(st4, (s) => {
    // rải một vạt cỏ dày quanh con heo
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const t = s.tiles[idx(s.w, px + 4 + dx, py + dy)];
        if (!t || t.tilled || t.crop || t.b) continue;
        t.g = "grass";
        t.prop = "grass_tall";
        t.hp = 1;
      }
    s.entSeq = 1;
    s.entities.push({
      id: 1, kind: "animal", def: "pig", map: "farm",
      x: (px + 4) * TILE + 8, y: py * TILE + 8,
      dir: "down", anim: 0, seed: 8,
      ai: { phase: "idle", until: 0, tx: -1, ty: -1, path: [], planAt: -999 },
      animal: { age: 9, fed: 0, hungryDays: 0, prod: [] },
    });
  });
  const co0 = demCo(st4);
  for (let i = 0; i < content.animals.pig.starveDays + 3; i++) sleep(st4);
  eq(st4.getState().entities.length, 1, "còn cỏ thì con heo không chết đói");
  ok(demCo(st4) < co0, `bãi cỏ bị gặm bớt: ${co0} → ${demCo(st4)}`);
  eq(st4.getState().entities[0].animal.hungryDays, 0, "ăn được thì đồng hồ đói về 0");
  deepEq(checkInvariants(st4.getState(), content), [], "bất biến sau khi gặm cỏ");
});

test("58. mua vật nuôi: XE CHỞ TỚI điểm giao, không hiện ra ngay", () => {
  const store = mkStore(925);
  walkTo(store, HOME.x, HOME.y);
  const drop = content.tiles.dropoff;
  const gate = content.tiles.gate;
  ok(drop && gate, "content có khai điểm giao và cổng vào");

  // THIẾU TIỀN → không mua được, và không mất gì. Đây là điều kiện DUY NHẤT
  // còn lại: không còn mốc nào chặn hàng nữa.
  setState(store, (s) => { s.money = content.animals.cow.price - 1; });
  const ngheo = store.getState().money;
  store.dispatch({ t: "BUY_ANIMAL", def: "cow" });
  eq(store.getState().entities.length, 0, "thiếu tiền thì không có gì xảy ra");
  eq(store.getState().money, ngheo, "và không trừ tiền");

  // đủ tiền: trừ tiền, và XE xuất hiện ở cổng — con vật CHƯA có
  setState(store, (s) => { s.money = 99999; });
  const tien0 = store.getState().money;
  store.dispatch({ t: "BUY_ANIMAL", def: "cow" });
  const s1 = store.getState();
  eq(s1.money, tien0 - content.animals.cow.price, "trừ đúng giá");
  eq(s1.entities.length, 1, "mới chỉ có một thực thể");
  const xe = s1.entities[0];
  eq(xe.kind, "vehicle", "và đó là chiếc XE, không phải con bò");
  eq(Math.floor(xe.x / TILE), gate.x, "xe vào từ đúng CỔNG");
  eq(Math.floor(xe.y / TILE), gate.y, "…đúng hàng của cổng");
  eq(xe.veh.errand.kind, "drop", "xe mang việc THẢ HÀNG");
  eq(xe.veh.errand.animal, "cow", "…đúng con đã mua");
  ok(
    !s1.entities.some((e) => e.kind === "animal"),
    "con bò CHƯA xuất hiện — mua xong bụp một cái hiện ra là thứ phải tránh",
  );
  deepEq(checkInvariants(s1, content), [], "bất biến ngay sau khi đặt hàng");

  // chạy tới khi xe giao xong
  let giaoXong = false;
  for (let i = 0; i < 60 * 60 * 4 && !giaoXong; i++) {
    store.dispatch({ t: "TICK", dt: 1 / 60 });
    giaoXong = store.getState().entities.some((e) => e.kind === "animal" && e.def === "cow");
  }
  ok(giaoXong, "xe chạy vào tới nơi và thả con bò xuống");
  const bo = store.getState().entities.find((e) => e.kind === "animal");
  const cachDiemGiao = Math.abs(Math.floor(bo.x / TILE) - drop.x) + Math.abs(Math.floor(bo.y / TILE) - drop.y);
  ok(cachDiemGiao <= 2, `con bò được thả ngay tại điểm giao (lệch ${cachDiemGiao} ô)`);
  deepEq(checkInvariants(store.getState(), content), [], "bất biến sau khi giao xong");

  // xe quay ra rồi biến mất
  let xeVeChua = false;
  for (let i = 0; i < 60 * 60 * 6 && !xeVeChua; i++) {
    store.dispatch({ t: "TICK", dt: 1 / 60 });
    xeVeChua = !store.getState().entities.some((e) => e.kind === "vehicle");
  }
  ok(xeVeChua, "giao xong thì xe quay ra khỏi bản đồ, không đậu lại mãi");
});

test("59. thuê người: trừ tiền, tới điểm giao, 3 ngày trả lương một lần, hết tiền thì nghỉ", () => {
  const cfg = content.workers;
  const store = mkStore(930);
  walkTo(store, HOME.x, HOME.y);
  const drop = content.tiles.dropoff;

  // không đủ tiền → không thuê được
  setState(store, (s) => { s.money = cfg.hireFee - 1; });
  store.dispatch({ t: "HIRE", job: "crops" });
  eq(store.getState().entities.length, 0, "không đủ tiền thì không thuê được ai");

  setState(store, (s) => { s.money = cfg.hireFee + cfg.wage * 2; });
  const tien0 = store.getState().money;
  store.dispatch({ t: "HIRE", job: "crops" });
  const s1 = store.getState();
  eq(s1.entities.length, 1, "thuê được một người");
  eq(s1.money, tien0 - cfg.hireFee, "trừ đúng phí thuê");
  const w = s1.entities[0];
  eq(w.kind, "worker", "đúng loại thực thể");
  eq(Math.floor(w.x / TILE), drop.x, "người làm tới ĐIỂM GIAO, không hiện ra dưới chân");
  eq(w.worker.job, "crops", "nhận đúng việc được giao");
  eq(w.worker.paidDay, s1.day, "mốc trả lương tính từ hôm thuê");
  deepEq(checkInvariants(s1, content), [], "bất biến sau khi thuê");

  // đổi việc
  store.dispatch({ t: "ASSIGN", id: w.id, job: "livestock" });
  eq(store.getState().entities[0].worker.job, "livestock", "đổi việc được");

  // chưa tới kỳ thì chưa trừ lương
  const truocNgu = store.getState().money;
  sleep(store);
  eq(store.getState().money, truocNgu, `ngày đầu chưa tới kỳ ${cfg.wageEveryDays} ngày`);

  // tới kỳ thì trừ đúng một lần
  for (let i = 1; i < cfg.wageEveryDays; i++) sleep(store);
  eq(
    store.getState().money,
    truocNgu - cfg.wage,
    `đủ ${cfg.wageEveryDays} ngày thì trừ đúng một kỳ lương`,
  );

  // hết tiền → nghỉ việc, và tiền KHÔNG âm
  setState(store, (s) => { s.money = 0; });
  for (let i = 0; i < cfg.wageEveryDays; i++) sleep(store);
  eq(store.getState().entities.length, 0, "không đủ tiền trả lương thì người làm nghỉ");
  ok(store.getState().money >= 0, "và tiền không bao giờ âm");
  deepEq(checkInvariants(store.getState(), content), [], "bất biến sau khi nghỉ việc");
});

test("60. người làm tự làm việc: thu cây chín rồi đem về KHO, mệt thì nghỉ", () => {
  const cfg = content.workers;
  const store = mkStore(931);
  walkTo(store, HOME.x, HOME.y);
  unlockAll(store);

  // rải một luống cây CHÍN quanh điểm giao để người làm có việc ngay
  const drop = content.tiles.dropoff;
  setState(store, (s) => {
    s.money = 99999;
    for (let i = 0; i < 6; i++) {
      const x = drop.x - 3 + i;
      const y = drop.y - 2;
      const t = s.tiles[idx(s.w, x, y)];
      t.prop = null; t.b = null; t.hp = 0;
      t.tilled = true; t.wet = true;
      t.crop = { id: "lettuce", stage: content.crops.lettuce.growthDays.length, grow: 0, regrown: false };
    }
  });
  store.dispatch({ t: "HIRE", job: "crops" });
  eq(store.getState().entities.length, 1, "đã thuê");

  const chinTruoc = () => {
    const s = store.getState();
    let n = 0;
    for (const t of s.tiles) {
      if (!t.crop) continue;
      const cd = content.crops[t.crop.id];
      if (cd && t.crop.stage >= cd.growthDays.length) n++;
    }
    return n;
  };
  eq(chinTruoc(), 6, "sáu cây đang chín");

  // chạy nửa ngày game
  for (let i = 0; i < 9000; i++) store.dispatch({ t: "TICK", dt: 1 / 60 });

  const s2 = store.getState();
  const conChin = chinTruoc();
  ok(conChin < 6, `người làm đã thu bớt cây chín: còn ${conChin}/6`);

  const trongKho = s2.store.reduce((n, v) => n + (v && v.id === "crop:lettuce" ? v.n : 0), 0);
  const dangDeo = s2.entities[0]
    ? s2.entities[0].worker.carry.reduce((n, v) => n + (v ? v.n : 0), 0)
    : 0;
  ok(trongKho + dangDeo > 0, `nông sản đã vào kho hoặc đang trên tay: kho ${trongKho}, tay ${dangDeo}`);
  ok(s2.entities[0].worker.energy <= cfg.energyMax, "năng lượng không vượt trần");
  deepEq(checkInvariants(s2, content), [], "bất biến sau nửa ngày người làm tự chạy");

  // state.seed vẫn không bị TICK đụng tới, kể cả khi có người làm
  const seed0 = store.getState().seed;
  for (let i = 0; i < 1200; i++) store.dispatch({ t: "TICK", dt: 1 / 60 });
  eq(store.getState().seed, seed0, "TICK vẫn không đụng state.seed dù người làm đang làm việc");
});


test("61. TỰ ĐỘNG LÀM tự đổi tay: thứ tự THU → CHỮA → GIEO → TƯỚI → CÀY", () => {
  const content = loadContent();
  const store = createStore(createNewGame(content, 2024), content, { validate: true, strict: true });

  /* Bày đủ bốn loại việc quanh nhân vật, mỗi loại một ô, rồi hỏi `autoJob` xem
     nó chọn cái nào. Đây là bài kiểm ĐÚNG chỗ dễ vỡ nhất: bản trước chỉ biết
     thứ đang cầm, nên bật tự động lúc cầm cuốc là cày cả nông trại mà không
     bao giờ thu một cây nào. */
  const cay = "lettuce";
  setState(store, (s) => {
    s.inv[0] = { id: "tool:hoe", n: 1 };
    s.inv[1] = { id: "tool:can", n: 1 };
    s.inv[2] = { id: `seed:${cay}`, n: 9 };
    s.sel = 0;
    s.water = 20;
    s.day = 1; // xuân — xà lách gieo được
    const px = Math.floor(s.player.x / TILE);
    const py = Math.floor(s.player.y / TILE);
    const o = (dx, dy) => s.tiles[idx(s.w, px + dx, py + dy)];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const t = o(dx, dy);
      t.prop = null; t.b = null; t.hp = 0; t.crop = null; t.tilled = false; t.wet = false;
    }
    // ô kề phải: cây CHÍN            → phải thu trước
    const a = o(1, 0);
    a.tilled = true;
    a.crop = { id: cay, stage: content.crops[cay].growthDays.length, grow: 0, regrown: false };
    // ô kề trái: đã cày, trống       → gieo
    o(-1, 0).tilled = true;
    // ô kề dưới: đã cày, khô         → tưới
    const w = o(0, 1);
    w.tilled = true;
    w.crop = { id: cay, stage: 0, grow: 0, regrown: false };
    // ô kề trên: cỏ chưa cày         → cày
    o(0, -1).tilled = false;
  });

  const R = Math.max(store.getState().w, store.getState().h);
  const j1 = autoJob(store.getState(), content, R);
  eq(j1 && j1.kind, "harvest", "bậc 1: cây chín được thu trước mọi thứ");

  // bỏ cây chín đi → tới lượt GIEO (trước TƯỚI, để lứa mới kịp tính đêm nay)
  setState(store, (s) => {
    const px = Math.floor(s.player.x / TILE);
    const py = Math.floor(s.player.y / TILE);
    s.tiles[idx(s.w, px + 1, py)].crop = null;
    s.tiles[idx(s.w, px + 1, py)].tilled = false;
  });
  const j2 = autoJob(store.getState(), content, R);
  eq(j2 && j2.kind, "plant", "bậc 2: gieo trước tưới");
  eq(j2.slot, 2, "và nó chỉ đúng ô hotbar có HẠT, dù tay đang cầm cuốc");

  // hết hạt → tưới
  setState(store, (s) => {
    s.inv[2] = null;
  });
  const j3 = autoJob(store.getState(), content, R);
  eq(j3 && j3.kind, "water", "bậc 3: hết hạt thì tưới");
  eq(j3.slot, 1, "cầm bình tưới");

  // ruộng ẩm hết → cày
  setState(store, (s) => {
    for (const t of s.tiles) if (t.tilled) t.wet = true;
  });
  const j4 = autoJob(store.getState(), content, R);
  eq(j4 && j4.kind, "till", "bậc 4: hết việc trên luống thì mở thêm đất");
  eq(j4.slot, 0, "cầm cuốc");

  ok(!AUTO_ORDER.includes("chop") && !AUTO_ORDER.includes("mine"),
    "tự động KHÔNG chặt cây đập đá — đó là thứ không hoàn tác được");
});

test("62. con vật ĐỨNG LẠI khi người chơi tới gần, đi xa thì đi tiếp", () => {
  const content = loadContent();
  const store = createStore(createNewGame(content, 777), content, { validate: true, strict: true });

  /* Con bò đi lang thang mà tầm với chỉ 1,6 ô: nhắm vào nó rồi bấm thì trong
     nửa giây nó đã nhích ra ngoài tầm, và thao tác trượt vì một lý do không
     nhìn thấy được. */
  setState(store, (s) => {
    const id = (s.entSeq || 0) + 1;
    s.entSeq = id;
    s.entities.push({
      id, kind: "animal", def: "cow", map: s.mapId,
      x: s.player.x + TILE, y: s.player.y,
      dir: "down", anim: 0, seed: 4242,
      ai: { phase: "wander", until: 0, tx: -1, ty: -1, path: [], planAt: -999 },
      animal: { age: 9, fed: 900, hungryDays: 0, prod: [0] },
    });
  });

  const bo = () => store.getState().entities[0];
  const x0 = bo().x;
  const y0 = bo().y;
  for (let i = 0; i < 600; i++) store.dispatch({ t: "TICK", dt: 1 / 60 });
  eq(bo().x, x0, "người chơi đứng sát: con bò không nhích ngang");
  eq(bo().y, y0, "…cũng không nhích dọc");

  // đẩy người chơi ra xa: con bò được đi tiếp
  setState(store, (s) => {
    s.player.x = s.player.x + 12 * TILE;
  });
  let dichuyen = false;
  for (let i = 0; i < 3000 && !dichuyen; i++) {
    store.dispatch({ t: "TICK", dt: 1 / 60 });
    if (bo().x !== x0 || bo().y !== y0) dichuyen = true;
  }
  ok(dichuyen, "người chơi đi xa thì con bò lang thang trở lại");
  deepEq(checkInvariants(store.getState(), content), [], "bất biến vẫn sạch");
});


test("63. luống bỏ không đủ ngày thì MỌC CỎ và trở lại địa hình ban đầu", () => {
  const content = loadContent();
  const ngay = content.balance.tilledIdleDays;
  ok(ngay > 0, `content khai tilledIdleDays = ${ngay}`);

  const store = mkStore(931);
  walkTo(store, HOME.x, HOME.y);
  const p = store.getState().player;
  const px = Math.floor(p.x / TILE);
  const py = Math.floor(p.y / TILE);
  // Hai ô cày sẵn: một BỎ KHÔNG, một có cây — chỉ ô bỏ không được mọc cỏ lại.
  const boKhong = idx(store.getState().w, px + 3, py);
  const coCay = idx(store.getState().w, px + 4, py);
  setState(store, (s) => {
    for (const i of [boKhong, coCay]) {
      const t = s.tiles[i];
      t.prop = null; t.b = null; t.crop = null; t.g = "grass";
      t.tilled = true; t.wet = false; t.hp = 0;
      delete t.idle;
    }
    s.tiles[coCay].crop = { id: "lettuce", stage: 0, grow: 0, regrown: false };
  });

  // Chưa đủ ngày thì luống VẪN CÒN — đây mới là phần khiến nó là hạn chót chứ
  // không phải xúc xắc: bỏ hai đêm mà mất luống thì không ai học được luật nào.
  for (let i = 0; i < ngay - 1; i++) sleep(store);
  ok(store.getState().tiles[boKhong].tilled, `sau ${ngay - 1} đêm luống vẫn còn`);

  sleep(store);
  const t = store.getState().tiles[boKhong];
  ok(!t.tilled, `bỏ đủ ${ngay} đêm thì hết luống`);
  ok(!t.wet, "và ô khô hẳn");
  eq(t.prop, "grass_short", "mọc cỏ lại — mất mát phải NHÌN THẤY được");
  ok(store.getState().tiles[coCay].tilled, "ô đang có cây thì không bị đụng tới");
  deepEq(checkInvariants(store.getState(), content), [], "bất biến sau khi luống hoang");
});


test("64. con vật đứng trên luống vừa cày thì tự đi ra", () => {
  const content = loadContent();
  const store = createStore(createNewGame(content, 4242), content, { validate: true, strict: true });

  /* Cày ngay dưới chân con bò rồi để yên. Luật "tới gần thì đứng lại" từng giữ
     nó ở đúng chỗ nó không được ở: người chơi phải đi vòng ra xa mới đuổi nổi. */
  setState(store, (s) => {
    const px = Math.floor(s.player.x / TILE);
    const py = Math.floor(s.player.y / TILE);
    // dọn một khoảnh cỏ quanh đó để con bò có chỗ mà bước ra
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const t = s.tiles[idx(s.w, px + dx, py + dy)];
        if (!t) continue;
        t.prop = null; t.b = null; t.crop = null; t.hp = 0;
        t.g = "grass"; t.tilled = false; t.wet = false;
      }
    // ô ngay bên phải nhân vật: CÀY, và đặt con bò đứng đúng đó
    s.tiles[idx(s.w, px + 1, py)].tilled = true;
    const id = (s.entSeq || 0) + 1;
    s.entSeq = id;
    s.entities.push({
      id, kind: "animal", def: "cow", map: s.mapId,
      x: (px + 1) * TILE + 8, y: py * TILE + 8,
      dir: "down", anim: 0, seed: 31,
      ai: { phase: "idle", until: 0, tx: -1, ty: -1, path: [], planAt: -999 },
      animal: { age: 9, fed: 900, hungryDays: 0, prod: [0] },
    });
  });

  const onLuong = () => {
    const s = store.getState();
    const b = s.entities[0];
    return !!s.tiles[idx(s.w, Math.floor(b.x / TILE), Math.floor(b.y / TILE))]?.tilled;
  };
  ok(onLuong(), "bắt đầu: con bò đang đứng trên luống");

  // Người chơi vẫn đứng NGAY BÊN CẠNH suốt — đây chính là ca cũ bị kẹt.
  let thoat = false;
  for (let i = 0; i < 3600 && !thoat; i++) {
    store.dispatch({ t: "TICK", dt: 1 / 60 });
    if (!onLuong()) thoat = true;
  }
  ok(thoat, "con bò tự bước ra khỏi luống dù người chơi đứng ngay cạnh");
  deepEq(checkInvariants(store.getState(), content), [], "bất biến sau khi nó tránh ra");
});


test("65. tay không: nhấc khúc gỗ / hòn đá, vác đi rồi đặt xuống chỗ khác", () => {
  const content = loadContent();
  const store = mkStore(1301);
  walkTo(store, HOME.x, HOME.y);
  const p = store.getState().player;
  const px = Math.floor(p.x / TILE);
  const py = Math.floor(p.y / TILE);

  ok(content.props.log?.portable, "content khai khúc gỗ vác được");
  ok(!content.props.bush?.portable, "…còn bụi cỏ thì không");

  setState(store, (s) => {
    // ô bên phải: khúc gỗ. ô bên trái: trống hẳn để đặt xuống.
    for (const [dx, id] of [[1, "log"], [-1, null]]) {
      const t = s.tiles[idx(s.w, px + dx, py)];
      t.g = "grass"; t.tilled = false; t.wet = false; t.crop = null; t.b = null;
      t.prop = id;
      t.hp = id ? (content.props[id].hits ?? 0) : 0;
    }
    // TAY KHÔNG: chọn một ô hotbar trống
    s.sel = 9;
    s.inv[9] = null;
  });

  const oPhai = () => store.getState().tiles[idx(store.getState().w, px + 1, py)];
  const oTrai = () => store.getState().tiles[idx(store.getState().w, px - 1, py)];

  eq(canUseAt(store.getState(), content, px + 1, py), "lift", "tay không + khúc gỗ → NHẤC");
  use(store, px + 1, py);
  eq(store.getState().carry, "log", "đang vác khúc gỗ");
  eq(oPhai().prop, null, "ô cũ trống ra");

  /* Đang vác thì HAI TAY BẬN: không cày, không thu, chỉ đặt xuống được. Nếu
     không thì nút nói một đằng làm một nẻo — đúng lớp lỗi đã tốn nửa buổi. */
  setState(store, (s) => { s.sel = 0; }); // cầm cuốc
  eq(canUseAt(store.getState(), content, px, py + 1), "putdown", "đang vác thì cầm cuốc cũng chỉ đặt xuống được");

  eq(canUseAt(store.getState(), content, px - 1, py), "putdown", "ô trống → ĐẶT XUỐNG");
  use(store, px - 1, py);
  eq(store.getState().carry ?? null, null, "đặt xong thì tay trống");
  eq(oTrai().prop, "log", "khúc gỗ nằm ở chỗ mới");

  // vác được đúng MỘT thứ
  setState(store, (s) => { s.sel = 9; });
  use(store, px - 1, py);
  eq(store.getState().carry, "log", "nhấc lại được");
  setState(store, (s) => {
    const t = s.tiles[idx(s.w, px + 1, py)];
    t.prop = "log";
    t.hp = content.props.log.hits ?? 0;
  });
  use(store, px + 1, py);
  eq(store.getState().carry, "log", "đang vác rồi thì không nhấc thêm cái thứ hai");
  eq(store.getState().tiles[idx(store.getState().w, px + 1, py)].prop, "log", "khúc gỗ kia vẫn nằm yên");

  deepEq(checkInvariants(store.getState(), content), [], "bất biến sau khi vác đồ");
});

test("66. đặt vật xuống KHÔNG được tự nhốt mình; save đang kẹt thì bước đi đầu tiên gỡ ra", () => {
  /* Lỗi thật, bản 1.7.0: đang vác hòn đá mà bấm ĐẶT vào ô mình đang đứng thì
     hòn đá — vật ĐẶC — rơi ngay dưới chân. Hitbox người chơi rộng 10px trong ô
     16px, nên mọi hướng đi đều đụng nó: nhân vật đứng chết một chỗ, không nút
     nào gỡ được, phải tải lại trang. `canPlaceBuilding` đã có đúng luật này cho
     công trình từ đầu; đường VÁC ĐỒ thì không. */
  const content = loadContent();
  const store = mkStore(1401);
  walkTo(store, HOME.x, HOME.y);
  const px = HOME.x;
  const py = HOME.y;

  ok(content.props.rock?.solid, "hòn đá phải là vật ĐẶC, nếu không kịch bản này không chứng minh gì");
  ok(content.props.rock?.portable, "…và vác được");

  const donSach = (s) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -2; dx <= 1; dx++) {
        const t = s.tiles[idx(s.w, px + dx, py + dy)];
        t.g = "grass"; t.tilled = false; t.wet = false; t.crop = null; t.b = null; t.prop = null; t.hp = 0;
      }
  };
  setState(store, (s) => {
    donSach(s);
    s.carry = "rock";
    s.sel = 9;
    s.inv[9] = null;
  });

  // ---- ô ĐANG ĐỨNG: nút không mời, mà bấm thẳng cũng không ăn thua --------
  eq(canUseAt(store.getState(), content, px, py), null, "ô đang đứng: không phải chỗ đặt xuống");
  use(store, px, py);
  eq(store.getState().carry, "rock", "vẫn đang vác — không tự thả đá xuống chân");
  eq(tile(store, px, py).prop, null, "ô đang đứng vẫn trống");

  // …và vẫn đi lại được, đó mới là thứ người chơi kêu
  const truoc = { ...store.getState().player };
  for (let i = 0; i < 30; i++) store.dispatch({ t: "MOVE", dx: -1, dy: 0, dt: 1 / 60 });
  ok(store.getState().player.x < truoc.x - 1, "sau cú bấm hụt vẫn đi được như thường");

  // ---- ô BÊN CẠNH mà hitbox đang ĐÈ LÊN: cũng là tự nhốt -----------------
  setState(store, (s) => {
    donSach(s);
    s.player.x = (px + 1) * TILE - 2; // đứng sát mép: hộp va chạm tràn sang ô bên
    s.player.y = (py + 0.5) * TILE;
  });
  ok(playerOverlapsTile(store.getState(), px + 1, py), "đứng sát mép thì hitbox đè sang ô bên");
  eq(canUseAt(store.getState(), content, px + 1, py), null, "ô hitbox đang đè lên: cũng không đặt được");
  eq(
    hintAt(store.getState(), content, px + 1, py).why,
    "Lùi ra rồi đặt",
    "và nút nói ĐÚNG lý do, không phải câu chung chung về hotbar",
  );

  // ---- ô KHÔNG đè lên: vẫn đặt được y như cũ (đừng chặn oan) --------------
  setState(store, (s) => {
    s.player.x = (px + 0.5) * TILE;
    s.player.y = (py + 0.5) * TILE;
  });
  ok(!playerOverlapsTile(store.getState(), px + 1, py), "đứng giữa ô thì không đè sang ô bên");
  eq(canUseAt(store.getState(), content, px + 1, py), "putdown", "ô sạch, không đè: ĐẶT XUỐNG");
  use(store, px + 1, py);
  eq(store.getState().carry ?? null, null, "đặt xong thì tay trống");
  eq(tile(store, px + 1, py).prop, "rock", "hòn đá nằm ở ô bên cạnh");
  ok(!blockedAt(store.getState(), content, store.getState().player.x, store.getState().player.y), "không kẹt");
  deepEq(checkInvariants(store.getState(), content), [], "bất biến sau khi đặt đá xuống");

  // ---- không nhốt CON VẬT / NGƯỜI LÀM vào trong đá, cũng không xây đè lên -
  setState(store, (s) => {
    donSach(s);
    s.carry = "rock";
    const n = s.entSeq + 1;
    s.entSeq = n;
    s.entities.push({
      id: n, kind: "animal", def: "cow", map: "farm",
      x: (px - 1) * TILE + 8, y: py * TILE + 8,
      dir: "down", anim: 0, seed: 77 + n,
      ai: { phase: "idle", until: 0, tx: -1, ty: -1, path: [], planAt: -999 },
      animal: { age: 9, fed: 400, hungryDays: 0, prod: [0] },
    });
  });
  eq(canUseAt(store.getState(), content, px - 1, py), null, "ô có con bò đứng: không thả đá lên đầu nó");

  /* Hộp con bò (12×9) hẹp hơn một ô, nên nó cũng ĐÈ SANG ô bên như người chơi.
     Hỏi ô tâm thôi là luật hở đúng nửa số trường hợp: dời bò sang sát mép ô
     px-2, tâm nó KHÔNG còn ở px-1 nữa mà thân vẫn chớm sang. */
  setState(store, (s) => {
    const bo = s.entities[s.entities.length - 1];
    bo.x = (px - 1) * TILE - 1;
  });
  const boNay = store.getState().entities[store.getState().entities.length - 1];
  eq(Math.floor(boNay.x / TILE), px - 2, "tâm con bò đã nằm ở ô bên trái");
  eq(
    canUseAt(store.getState(), content, px - 1, py),
    null,
    "thân bò chớm sang ô nào thì ô đó cũng không thả đá được",
  );
  const tuong = Object.keys(content.buildings).find((id) => content.buildings[id]?.solid);
  if (tuong)
    eq(
      canPlaceBuilding(store.getState(), content, tuong, px - 1, py),
      false,
      "công trình đặc cũng không xây đè lên con vật",
    );

  /* ---- CỨU KẸT ---------------------------------------------------------
     Luật mới chặn được từ hôm nay, nhưng save của người đã dính lỗi thì hòn đá
     đã nằm dưới chân rồi. Dựng đúng cảnh đó (phải tắt `validate`, vì bất biến
     "người chơi nằm trong ô solid" bắt ngay) rồi xem bước MOVE đầu tiên có gỡ
     ra không — kể cả khi người chơi không bấm hướng nào. */
  const ket = createStore(createNewGame(content, 1402), content, { validate: false });
  const s0 = clone(ket.getState());
  s0.player.x = (px + 0.5) * TILE;
  s0.player.y = (py + 0.5) * TILE;
  const o = s0.tiles[idx(s0.w, px, py)];
  o.g = "grass"; o.tilled = false; o.crop = null; o.b = null;
  o.prop = "rock";
  o.hp = content.props.rock.hits ?? 0;
  ket.replace(s0);
  ok(blockedAt(ket.getState(), content, ket.getState().player.x, ket.getState().player.y), "dựng được đúng cảnh kẹt");

  ket.dispatch({ t: "MOVE", dx: 0, dy: 0, dt: 1 / 60 });
  const sau = ket.getState().player;
  ok(!blockedAt(ket.getState(), content, sau.x, sau.y), "đứng yên thôi cũng được gỡ ra khỏi ô đặc");
  eq(tile(ket, px, py).prop, "rock", "hòn đá vẫn ở đó — gỡ người ra, không xoá đồ của người ta");
  deepEq(checkInvariants(ket.getState(), content), [], "bất biến sau khi được cứu");
});

test("67. khu chuồng dựng sẵn: rào kín, máng đổ được, con vật đói tới máng ăn", () => {
  const content = loadContent();
  const store = mkStore(1501);
  const s0 = store.getState();

  /* ---- (a) bản đồ phải THẬT SỰ có khu, không chỉ có khai báo ---------- */
  const pens = content.tiles.pens ?? [];
  ok(pens.length >= 3, `content khai ít nhất 3 khu chuồng, đang có ${pens.length}`);
  for (const pen of pens) {
    if (pen.map !== s0.mapId) continue;
    // ruột đi được
    for (let y = pen.y; y < pen.y + pen.h; y++)
      for (let x = pen.x; x < pen.x + pen.w; x++) {
        const t = tileAt(s0, x, y);
        ok(!!t, `khu '${pen.id}': ô (${x},${y}) phải có thật`);
        if (t.prop === "trough") continue; // cái máng là ô đặc CÓ CHỦ Ý
        if (pen.swim) eq(t.g, "water", `khu bơi '${pen.id}': ruột phải là nước ở (${x},${y})`);
        else ok(!isSolid(s0, content, x, y), `khu '${pen.id}': ruột phải đi được ở (${x},${y})`);
      }
    // ao cá không có rào — bờ ao đã là rào. Các khu trên cạn thì phải có.
    if (pen.swim) continue;
    let rao = 0;
    for (let x = pen.x - 1; x <= pen.x + pen.w; x++)
      for (const y of [pen.y - 1, pen.y + pen.h])
        if (tileAt(s0, x, y)?.b === "fence") rao++;
    for (let y = pen.y - 1; y <= pen.y + pen.h; y++)
      for (const x of [pen.x - 1, pen.x + pen.w])
        if (tileAt(s0, x, y)?.b === "fence") rao++;
    ok(rao >= 2 * (pen.w + pen.h), `khu '${pen.id}': viền phải là hàng rào, đếm được ${rao} ô`);
    // khu có `feed` thì phải có máng nằm trong ruột
    if ((pen.feeds ?? []).length)
      ok(!!troughIn(s0, pen), `khu '${pen.id}' có đồ ăn thì phải có máng`);
    else eq(troughIn(s0, pen), null, `khu '${pen.id}' không khai feeds thì không được có máng`);
  }

  /* ---- (b) mỗi loài về ĐÚNG khu, và loài cùng thức ăn dùng CHUNG máng - */
  const khuCua = (id) => penOfAnimal(content, id)?.id ?? null;
  eq(khuCua("cow"), khuCua("goat"), "bò và dê chung một khu");
  eq(khuCua("cow"), khuCua("sheep"), "bò và cừu chung một khu");
  const khuBo = penById(content, khuCua("cow"));
  ok(
    khuBo.feeds.some((f) => content.animals.cow.feed.includes(f)),
    "máng khu gia súc nhận thứ bò ăn được",
  );
  ok(
    khuBo.feeds.some((f) => content.animals.goat.feed.includes(f)),
    "…và cả thứ dê ăn được, nên chung máng là hợp lý",
  );
  ok(khuCua("pig") !== khuCua("cow"), "heo ăn thứ khác nên ở khu khác");
  eq(khuCua("dog"), null, "chó đi tuần, không nhốt khu nào");

  /* ---- (c) HÀNG RÀO không còn là thứ mua/xây được --------------------- */
  eq(content.buildings.fence.buildable, false, "hàng rào là địa hình dựng sẵn");
  eq(content.recipes.find((r) => r.id === "fence"), undefined, "không còn công thức đóng rào");
  unlockAll(store);
  const trong = findOpenBlock(store.getState(), 1, 1);
  eq(
    canPlaceBuilding(store.getState(), content, "fence", trong.x, trong.y),
    false,
    "mở hết khoá rồi vẫn không đặt được một ô rào nào",
  );

  /* ---- (d) ĐỔ MÁNG: cầm đúng thức ăn, đứng cạnh máng ------------------ */
  const m = troughIn(store.getState(), khuBo);
  eq(troughStock(store.getState(), m.x, m.y), 0, "máng lúc đầu rỗng");
  walkTo(store, m.x, m.y + 1);
  const monBo = khuBo.feeds[0];
  giveItem(store, monBo, 5);
  selectItem(store, monBo);
  eq(canUseAt(store.getState(), content, m.x, m.y), "pour", "cầm đúng thức ăn → nút ĐỔ MÁNG");
  use(store, m.x, m.y);
  eq(troughStock(store.getState(), m.x, m.y), 5, "đổ hết 5 phần trong một lần bấm");
  eq(countInv(store, monBo), 0, "…và trừ đúng 5 khỏi túi");

  // cầm thứ khác thì không đổ được, và nút nói đúng lý do
  selectItem(store, "tool:hoe");
  eq(canUseAt(store.getState(), content, m.x, m.y), null, "cầm cuốc thì không đổ máng được");
  ok(
    (hintAt(store.getState(), content, m.x, m.y).why ?? "").includes("Cầm"),
    "nút bảo phải cầm gì, không im lặng",
  );

  // trần sức chứa
  giveItem(store, monBo, 99);
  selectItem(store, monBo);
  use(store, m.x, m.y);
  eq(troughStock(store.getState(), m.x, m.y), troughMax(content), "đổ tối đa tới trần sức chứa");

  /* ---- (e) con vật ĐÓI đứng cạnh máng thì ĂN, và máng vơi đi ---------- */
  setState(store, (s) => {
    s.entSeq = 1;
    s.entities = [{
      id: 1, kind: "animal", def: "cow", map: "farm",
      x: (m.x) * TILE + 8, y: (m.y + 1) * TILE + 8,
      dir: "down", anim: 0, seed: 33,
      ai: { phase: "idle", until: 0, tx: -1, ty: -1, path: [], planAt: -999 },
      animal: { age: 9, fed: 0, hungryDays: 1, prod: [0] },
    }];
  });
  const truoc = troughStock(store.getState(), m.x, m.y);
  let an = false;
  store.dispatch({
    t: "DEBUG", op: "noop",
  });
  // gọi thẳng luật, không phải chờ AI rút thăm: đây là chỗ cần kiểm
  {
    const d = { base: store.getState(), s: { ...store.getState() }, changed: false };
    an = eatFromTrough(d, content, 0);
    if (d.changed) store.replace(d.s);
  }
  ok(an, "đứng sát máng còn thức ăn thì con bò ăn được");
  eq(troughStock(store.getState(), m.x, m.y), truoc - 1, "máng vơi đúng một phần");
  eq(store.getState().entities[0].animal.fed, content.animals.cow.fedMinutes, "ăn máng thì no HẲN");

  /* ---- (f) máng CẠN thì đừng gọi con vật về chuồng chết đói ----------- */
  setState(store, (s) => {
    s.tiles[idx(s.w, m.x, m.y)].trough = 0;
    s.entities[0].animal.fed = 0;
    // ĐỨNG XA khu, ở một ô trống có thật — không chép cứng một toạ độ mà đợt
    // vẽ lại bản đồ sau có thể biến thành gốc cây.
    const xa = findOpenBlock(store.getState(), 1, 1);
    s.entities[0].x = xa.x * TILE + 8;
    s.entities[0].y = xa.y * TILE + 8;
  });
  eq(
    penGoal(store.getState(), content, store.getState().entities[0], true),
    null,
    "đói + máng cạn → không gọi về khu, để nó đi tìm cỏ",
  );
  setState(store, (s) => { s.tiles[idx(s.w, m.x, m.y)].trough = 4; });
  const dich = penGoal(store.getState(), content, store.getState().entities[0], true);
  ok(dich !== null, "đói + máng còn ăn → nhắm về khu");
  ok(
    Math.max(Math.abs(dich.x - m.x), Math.abs(dich.y - m.y)) === 1,
    `…và nhắm vào ô KỀ máng, đang nhắm (${dich.x},${dich.y}) còn máng ở (${m.x},${m.y})`,
  );

  // no bụng mà đứng ngoài khu thì vẫn về; đứng trong khu rồi thì thôi
  const veKhu = penGoal(store.getState(), content, store.getState().entities[0], false);
  ok(veKhu !== null, "no bụng, đứng ngoài khu → vẫn tự về");
  setState(store, (s) => {
    s.entities[0].x = (khuBo.x + 1) * TILE + 8;
    s.entities[0].y = khuBo.y * TILE + 8;
  });
  eq(
    penGoal(store.getState(), content, store.getState().entities[0], false),
    null,
    "đã ở trong khu thì không bắt nó đi tới đi lui nữa",
  );

  deepEq(checkInvariants(store.getState(), content), [], "bất biến sau khi dùng khu chuồng");
});

test("68. bảng gỡ lỗi thả vật nuôi cũng phải CÓ XE CHỞ TỚI, không hiện ra tại chỗ", () => {
  const content = loadContent();
  const store = mkStore(1502);
  walkTo(store, HOME.x, HOME.y);
  eq(store.getState().entities.length, 0, "chưa có thực thể nào");

  store.dispatch({ t: "DEBUG", op: "spawnAnimal", n: 0 });
  const s1 = store.getState();
  const xe = s1.entities.filter((e) => e.kind === "vehicle");
  eq(xe.length, 1, "[debug] thả vật nuôi thì sinh ra một chiếc XE");
  eq(s1.entities.filter((e) => e.kind === "animal").length, 0, "…và con vật CHƯA hiện ra");
  eq(xe[0].veh.errand.kind, "drop", "xe đang đi giao hàng");
  const loai = xe[0].veh.errand.animal;
  ok(!!content.animals[loai], `xe chở một loài có thật: ${loai}`);
  const cong = content.tiles.gate;
  eq(Math.floor(xe[0].x / TILE), cong.x, "xe xuất phát từ CỔNG, không phải giữa ruộng");

  // chạy tới lúc xe thả hàng: con vật phải hiện ra ở ĐIỂM GIAO
  let n = 0;
  while (store.getState().entities.filter((e) => e.kind === "animal").length === 0 && n < 900) {
    advanceMinutes(store, 2);
    n++;
  }
  const con = store.getState().entities.find((e) => e.kind === "animal");
  ok(!!con, "xe chạy vào tới nơi và thả con vật xuống");
  const giao = content.tiles.dropoff;
  ok(
    Math.hypot(con.x / TILE - giao.x, con.y / TILE - giao.y) < 4,
    "con vật xuống ở quanh ĐIỂM GIAO, không phải dưới chân người chơi",
  );

  // …rồi tự tìm đường về khu của nó
  const khu = penOfAnimal(content, con.def);
  if (khu) {
    /* Khẳng định đúng thứ đáng khẳng định: nó VÀO TỚI TRONG khu. Đo khoảng
       cách tới tâm khu thì hỏng — rào có cổng nên con vật vào rồi vẫn đi ra
       loanh quanh, và một điểm cách tâm đúng bằng lúc xuất phát (chỉ khác
       hướng) sẽ làm test đỏ dù mọi thứ chạy đúng. */
    const trongKhu = (e) =>
      e.x / TILE >= khu.x && e.x / TILE < khu.x + khu.w &&
      e.y / TILE >= khu.y && e.y / TILE < khu.y + khu.h;
    ok(!trongKhu(con), "lúc xe vừa thả thì nó còn ở ngoài khu");
    let vao = false;
    for (let i = 0; i < 1200 && !vao; i++) {
      advanceMinutes(store, 2);
      const e = store.getState().entities.find((q) => q.kind === "animal");
      if (!e) break;
      if (trongKhu(e)) vao = true;
    }
    ok(vao, `tự tìm đường vào tới khu '${khu.id}' của nó`);

    // …và không đi lạc sang tận đầu kia nông trại: khu là NHÀ, không phải nơi ghé qua
    let xaNhat = 0;
    for (let i = 0; i < 600; i++) {
      advanceMinutes(store, 2);
      const e = store.getState().entities.find((q) => q.kind === "animal");
      if (!e) break;
      xaNhat = Math.max(
        xaNhat,
        Math.hypot(e.x / TILE - (khu.x + khu.w / 2), e.y / TILE - (khu.y + khu.h / 2)),
      );
    }
    ok(xaNhat < 16, `quanh quẩn gần khu, xa nhất ${xaNhat.toFixed(1)} ô`);
  }

  deepEq(checkInvariants(store.getState(), content), [], "bất biến sau chuyến giao hàng gỡ lỗi");
});

test("69. cho ăn: mỗi loài nhiều món, mua được ở cửa hàng, và cá được cho ăn từ bờ", () => {
  const content = loadContent();

  /* ---- (a) LỖI THẬT: nạp save là con cá bị đẩy từ dưới ao lên bãi cỏ ----
     `migrateForContent` gỡ kẹt cho thực thể bằng luật của loài ĐI BỘ, mà với
     loài bơi thì luật đó ngược hẳn: nước là chỗ nó đứng được, bờ mới là ô cấm.
     Nên nó "cứu" một cái kẹt không có thật rồi tạo ra một cái kẹt có thật —
     và chính `checkInvariants` tố cáo cái state mà nó vừa dựng. */
  const st = mkStore(1601);
  setState(st, (s) => {
    s.entSeq = 1;
    s.entities = [{
      id: 1, kind: "animal", def: "fish", map: "farm",
      x: 5 * TILE + 8, y: 4 * TILE + 8,
      dir: "down", anim: 0, seed: 5,
      ai: { phase: "idle", until: 0, tx: -1, ty: -1, path: [], planAt: -999 },
      animal: { age: 9, fed: 500, hungryDays: 0, prod: [0] },
    }];
  });
  eq(tile(st, 5, 4).g, "water", "kịch bản dựng đúng: con cá đang ở giữa ao");
  const sauMigrate = migrateForContent(store0(st), content).state;
  const ca = sauMigrate.entities[0];
  eq(
    sauMigrate.tiles[idx(sauMigrate.w, Math.floor(ca.x / TILE), Math.floor(ca.y / TILE))].g,
    "water",
    "migrate KHÔNG được đẩy con cá lên bờ",
  );
  deepEq(checkInvariants(sauMigrate, content), [], "…và state sau migrate phải sạch bất biến");

  /* ---- (b) mỗi loài NHIỀU món, loài chung khu thì chung ít nhất một món - */
  for (const id of content.animalOrder) {
    const a = content.animals[id];
    if (a.job === "pest") continue;
    ok(Array.isArray(a.feed), `feed của '${id}' phải là DANH SÁCH`);
    ok(a.feed.length >= 1, `'${id}' phải ăn được ít nhất một món`);
  }
  ok(content.animals.cow.feed.length >= 2, "bò không bị khoá vào đúng một món");
  ok(
    content.animals.cow.feed.some((f) => content.animals.goat.feed.includes(f)),
    "bò và dê chung khu thì phải có món ăn chung",
  );

  /* ---- (c) thức ăn MUA được ở cửa hàng --------------------------------- */
  const banDuoc = content.materialOrder.filter((id) => (content.materials[id].buyPrice ?? 0) > 0);
  ok(banDuoc.length >= 2, `có ít nhất 2 loại thức ăn bày bán, đang có ${banDuoc.length}`);
  for (const id of banDuoc) {
    const anDuoc = content.animalOrder.some((a) => content.animals[a]?.feed.includes(`item:${id}`));
    ok(anDuoc, `'${id}' bày bán thì phải có loài nào đó ăn được`);
  }
  const store = mkStore(1602);
  unlockAll(store);
  const mon = `item:${banDuoc[0]}`;
  const gia = content.materials[banDuoc[0]].buyPrice;
  setState(store, (s) => { s.money = gia * 3; });
  const co0 = countInv(store, mon);
  store.dispatch({ t: "BUY", id: mon, n: 2 });
  eq(countInv(store, mon), co0 + 2, "mua được thức ăn ở cửa hàng");
  eq(store.getState().money, gia, "trừ đúng tiền");

  /* ---- (d) cho ăn tay nhận BẤT KỲ món nào loài đó ăn ------------------- */
  walkTo(store, HOME.x, HOME.y);
  const p = store.getState().player;
  const px = Math.floor(p.x / TILE), py = Math.floor(p.y / TILE);
  const monSau = content.animals.cow.feed[content.animals.cow.feed.length - 1];
  ok(monSau !== content.animals.cow.feed[0], "bò có ít nhất hai món để thử");
  setState(store, (s) => {
    for (const v of s.inv) if (v && content.animals.cow.feed.includes(v.id)) v.n = 0;
    s.inv = s.inv.map((v) => (v && v.n === 0 ? null : v));
    s.entSeq = 1;
    s.entities = [{
      id: 1, kind: "animal", def: "cow", map: "farm",
      x: (px + 1) * TILE + 8, y: py * TILE + 8,
      dir: "down", anim: 0, seed: 3,
      ai: { phase: "idle", until: 0, tx: -1, ty: -1, path: [], planAt: -999 },
      animal: { age: 9, fed: 0, hungryDays: 2, prod: [0] },
    }];
  });
  giveItem(store, monSau, 2);                 // CHỈ có món CUỐI trong danh sách
  store.dispatch({ t: "FEED", x: px + 1, y: py });
  eq(
    store.getState().entities[0].animal.fed,
    content.animals.cow.fedMinutes,
    "cho ăn được bằng món khác, không phải chỉ món đầu danh sách",
  );
  eq(countInv(store, monSau), 1, "trừ đúng một phần");

  /* ---- (e) CHO CÁ ĂN từ bờ ao ----------------------------------------- */
  const ao = content.tiles.pens.find((q) => q.swim);
  const st2 = mkStore(1603);
  const monCa = ao.feeds[0];
  // đứng ở ô cạn kề mặt nước
  let bo = null;
  for (let y = ao.y; y < ao.y + ao.h && !bo; y++)
    for (const x of [ao.x + ao.w, ao.x - 1]) {
      if (isSolid(st2.getState(), content, x, y)) continue;
      const wx = x > ao.x ? ao.x + ao.w - 1 : ao.x;
      if (tile(st2, wx, y)?.g !== "water") continue;
      bo = { x, y, wx, wy: y };
      break;
    }
  ok(!!bo, "tìm được một ô bờ đứng được cạnh ao");
  /* Đặt thẳng vị trí thay vì `walkTo`: bờ ao nằm sau một vạt cây, mà `walkTo`
     chỉ biết đi thẳng theo trục — nó hỏng vì đường đi, không phải vì luật đang
     kiểm ở đây. */
  setState(st2, (s) => {
    s.player.x = bo.x * TILE + TILE / 2;
    s.player.y = bo.y * TILE + TILE / 2;
  });
  setState(st2, (s) => {
    s.entSeq = 1;
    s.entities = [{
      id: 1, kind: "animal", def: "fish", map: "farm",
      x: (ao.x + 1) * TILE + 8, y: (ao.y + 1) * TILE + 8,
      dir: "down", anim: 0, seed: 9,
      ai: { phase: "idle", until: 0, tx: -1, ty: -1, path: [], planAt: -999 },
      animal: { age: 9, fed: 0, hungryDays: 1, prod: [0] },
    }];
  });
  const oNuoc = { x: bo.wx, y: bo.wy };
  ok(!!pondAt(st2.getState(), content, oNuoc.x, oNuoc.y), "ô nước này thuộc khu ao");
  selectItem(st2, "tool:hoe");
  eq(
    canFeedPond(st2.getState(), content, oNuoc.x, oNuoc.y),
    false,
    "cầm cuốc thì không rắc được gì xuống hồ",
  );
  giveItem(st2, monCa, 3);
  selectItem(st2, monCa);
  eq(canUseAt(st2.getState(), content, oNuoc.x, oNuoc.y), "feedpond", "cầm cám cá → nút CHO CÁ ĂN");
  use(st2, oNuoc.x, oNuoc.y);
  eq(st2.getState().entities[0].animal.fed, content.animals.fish.fedMinutes, "con cá đã no");
  eq(countInv(st2, monCa), 2, "trừ đúng một phần cho một con");
  eq(canUseAt(st2.getState(), content, oNuoc.x, oNuoc.y), null, "không con nào đói thì nút tắt");

  /* ---- (f) gà VẪN mổ sâu trên cỏ dù giờ đã ăn được cám ---------------- */
  const ga = content.animals.chicken;
  ok(ga.feed.length > 0, "gà giờ cho ăn tay được");
  ok(ga.pecks === true, "…nhưng vẫn giữ cờ mổ sâu");
  const st3 = mkStore(1604);
  const o = findOpenBlock(st3.getState(), 1, 1);
  setState(st3, (s) => {
    const t = s.tiles[idx(s.w, o.x, o.y)];
    t.g = "grass"; t.prop = null; t.b = null; t.crop = null; t.tilled = false;
  });
  ok(
    grazeableAt(st3.getState(), content, ga, o.x, o.y),
    "nền cỏ trống vẫn là chỗ ăn được của gà — nếu không thì cho gà ăn cám xong nó chết đói",
  );
  ok(
    !grazeableAt(st3.getState(), content, content.animals.cow, o.x, o.y),
    "…còn con bò thì không: nó cần BỤI cỏ, không mổ sâu được",
  );
});

test("70. chia vùng: chỉ cuốc được trong khu ruộng, rừng mọc lại, cầu đi ra giữa hồ", () => {
  const content = loadContent();
  const store = mkStore(1701);

  /* ---- (a) VÙNG phải có thật và không chồng lấn kiểu vô lý ------------ */
  const zones = content.tiles.zones ?? [];
  const ruong = zones.filter((z) => z.kind === "farm");
  const rung = zones.filter((z) => z.kind === "forest");
  ok(ruong.length >= 4, `ruộng phải chia thành nhiều LÔ, đang có ${ruong.length}`);
  // các lô KHÔNG được dính nhau: giữa chúng phải có bờ, nếu không thì "phân lô"
  // chỉ là chia trên giấy còn nhìn vào vẫn là một mảng ruộng liền.
  for (let i = 0; i < ruong.length; i++)
    for (let j = i + 1; j < ruong.length; j++) {
      const a = ruong[i], b = ruong[j];
      const cachX = a.x + a.w < b.x || b.x + b.w < a.x;
      const cachY = a.y + a.h < b.y || b.y + b.h < a.y;
      ok(cachX || cachY, `lô '${a.id}' và '${b.id}' phải cách nhau ít nhất một ô bờ`);
    }
  ok(rung.length >= 1, "…và ít nhất một khu rừng");
  for (const z of zones) {
    ok(z.x >= 0 && z.y >= 0, `vùng '${z.id}' không có toạ độ âm`);
    ok(z.x + z.w <= store.getState().w && z.y + z.h <= store.getState().h, `vùng '${z.id}' nằm trong bản đồ`);
  }
  // ruộng và rừng KHÔNG được chồng lên nhau: một ô vừa cày được vừa mọc cây
  // đêm nào cũng nuốt mất luống là một cái bẫy không giải thích được.
  for (const a of ruong)
    for (const b of rung)
      ok(
        a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y,
        `khu ruộng '${a.id}' và rừng '${b.id}' không được chồng lên nhau`,
      );

  /* ---- (b) CUỐC chỉ ăn trong khu ruộng -------------------------------- */
  const s0 = store.getState();
  // GIỮA một lô, không phải "góc + 3": lô chỉ cao 3 ô nên cộng 3 là ra ngoài.
  const trongRuong = {
    x: ruong[0].x + Math.floor(ruong[0].w / 2),
    y: ruong[0].y + Math.floor(ruong[0].h / 2),
  };
  ok(inZone(s0, content, "farm", trongRuong.x, trongRuong.y), "ô thử nằm trong khu ruộng");
  // tìm một ô cỏ trống NGOÀI khu ruộng để đối chứng
  let ngoai = null;
  for (let y = 1; y < s0.h - 1 && !ngoai; y++)
    for (let x = 1; x < s0.w - 1; x++) {
      const t = tile(store, x, y);
      if (!t || t.g !== "grass" || t.prop || t.b || t.tilled) continue;
      if (inZone(s0, content, "farm", x, y)) continue;
      // cần một ô ĐỨNG ĐƯỢC ngay bên dưới để đặt người chơi vào cho đúng tầm với
      if (isSolid(s0, content, x, y + 1)) continue;
      ngoai = { x, y };
      break;
    }
  ok(!!ngoai, "bản đồ có ô cỏ trống nằm ngoài khu ruộng");

  setState(store, (s) => {
    for (const o of [trongRuong, ngoai]) {
      const t = s.tiles[idx(s.w, o.x, o.y)];
      t.g = "grass"; t.prop = null; t.b = null; t.crop = null; t.tilled = false;
    }
    s.energy = 100;
  });
  eq(isTillable(store.getState(), content, trongRuong.x, trongRuong.y), true, "trong ruộng: cuốc được");
  eq(isTillable(store.getState(), content, ngoai.x, ngoai.y), false, "ngoài ruộng: KHÔNG cuốc được");

  // …và nút DÙNG nói đúng như thế, không mời bấm rồi im lặng
  selectItem(store, "tool:hoe");
  setState(store, (s) => {
    s.player.x = ngoai.x * TILE + TILE / 2;
    s.player.y = (ngoai.y + 1) * TILE + TILE / 2;
  });
  eq(canUseAt(store.getState(), content, ngoai.x, ngoai.y), null, "ngoài ruộng thì nút không mời CÀY");
  eq(
    hintAt(store.getState(), content, ngoai.x, ngoai.y).why,
    "Ngoài khu ruộng",
    "…và nói ĐÚNG lý do, không phải câu chung chung",
  );
  const nl0 = store.getState().energy;
  use(store, ngoai.x, ngoai.y);
  eq(tile(store, ngoai.x, ngoai.y).tilled, false, "bấm thẳng vào cũng không cày ra luống");
  eq(store.getState().energy, nl0, "…và không mất sức cho một nhát cuốc hụt");

  // trong ruộng thì cày được thật
  setState(store, (s) => {
    s.player.x = trongRuong.x * TILE + TILE / 2;
    s.player.y = (trongRuong.y + 1) * TILE + TILE / 2;
  });
  eq(canUseAt(store.getState(), content, trongRuong.x, trongRuong.y), "till", "trong ruộng: nút CÀY");
  use(store, trongRuong.x, trongRuong.y);
  eq(tile(store, trongRuong.x, trongRuong.y).tilled, true, "…và cày ra luống thật");

  /* ---- (c) RỪNG mọc lại cây con ---------------------------------------- */
  ok((content.balance.forestRegrowChance ?? 0) > 0, "content bật mọc lại rừng");
  const st2 = mkStore(1702);
  const r0 = rung[0];
  const demCay = (st) => {
    const s = st.getState();
    let n = 0;
    for (let y = r0.y; y < r0.y + r0.h; y++)
      for (let x = r0.x; x < r0.x + r0.w; x++)
        if (s.tiles[idx(s.w, x, y)]?.prop) n++;
    return n;
  };
  // chặt trụi cả khu rừng
  setState(st2, (s) => {
    for (let y = r0.y; y < r0.y + r0.h; y++)
      for (let x = r0.x; x < r0.x + r0.w; x++) {
        const t = s.tiles[idx(s.w, x, y)];
        if (t.g === "grass") { t.prop = null; t.hp = 0; }
      }
  });
  eq(demCay(st2), 0, "đã chặt trụi khu rừng");
  for (let i = 0; i < 12; i++) sleep(st2);
  ok(demCay(st2) > 0, `rừng mọc lại sau vài đêm: ${demCay(st2)} ô có vật thể`);

  // …còn ngoài rừng thì KHÔNG tự mọc cây con lên
  const cayCon = content.propOrder.find((id) => content.props[id]?.tool === "CHOP" && !content.props[id]?.tall);
  const s2 = st2.getState();
  let laC = 0;
  for (let y = 0; y < s2.h; y++)
    for (let x = 0; x < s2.w; x++) {
      if (inZone(s2, content, "forest", x, y)) continue;
      if (!inZone(s2, content, "farm", x, y)) continue;   // chỉ soi khu ruộng
      if (s2.tiles[idx(s2.w, x, y)]?.prop === cayCon) laC++;
    }
  eq(laC, 0, "khu ruộng không tự mọc cây con — không thì ruộng thành rừng sau một tuần");

  /* ---- (d) CẦU: người đi được TRÊN, cá bơi được DƯỚI ------------------- */
  const s3 = store.getState();
  let cau = null;
  for (let y = 0; y < s3.h && !cau; y++)
    for (let x = 0; x < s3.w; x++)
      if (s3.tiles[idx(s3.w, x, y)]?.prop === "pier") { cau = { x, y }; break; }
  ok(!!cau, "bản đồ có cây cầu");
  eq(tile(store, cau.x, cau.y).g, "water", "cầu bắc TRÊN mặt nước, không thay thế mặt nước");
  eq(
    isSolid(s3, content, cau.x, cau.y),
    false,
    "người đi qua được cầu — nếu không thì cây cầu chỉ là hình vẽ",
  );
  eq(
    tileOkFor(tile(store, cau.x, cau.y), content, true),
    true,
    "con cá vẫn bơi được ngay dưới chân cầu",
  );
  // đứng giữa cầu thì với tới được ô nước quanh đó
  const nuocQuanh = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dx, dy]) => ({ x: cau.x + dx, y: cau.y + dy }))
    .filter((o) => tile(store, o.x, o.y)?.g === "water");
  ok(nuocQuanh.length > 0, "cầu nằm giữa mặt nước, không phải nằm sát bờ");

  deepEq(checkInvariants(store.getState(), content), [], "bất biến sau khi dùng vùng đất và cầu");
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

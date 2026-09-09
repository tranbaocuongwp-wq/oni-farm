/* ============================================================================
   BENCH — đo chi phí MÔ PHỎNG trên một nông trại nặng. Node thuần.

       node scripts/bench.mjs        (hoặc: npm run bench)

   Vì sao có file này: Đợt 9 đo hiệu năng bằng tay rồi số liệu trôi mất theo
   phiên làm việc, nên Đợt 15 mở lại đúng câu hỏi ấy mà không có gì để so. Bảng
   dưới đây chạy lại được bất cứ lúc nào, trên cùng một cảnh dựng theo cùng một
   hạt — nên hai lần đo cách nhau nửa năm vẫn nói chuyện được với nhau.

   Nó đo LOGIC, không đo lớp vẽ. Lớp vẽ cần canvas thật, và một canvas trong
   Node chỉ đo được phần CPU của mình chứ không đo được phần trình duyệt thật
   sự tốn — nên đo ở đây sẽ ra một con số trông có vẻ chính xác mà không đúng
   với cái gì cả. Lớp vẽ đo trong trình duyệt, bằng `__PF.step` ở bản dev.

   Cảnh: cày + gieo + tưới TOÀN BỘ đất trồng, 24 vật nuôi đủ loài, 3 người làm.
   Đó là nông trại đông hơn hẳn lối chơi bình thường — nếu ở đây còn rộng thì
   lúc chơi càng rộng.
============================================================================ */

import { loadContent } from "./lib/load-content.mjs";
import { createStore } from "../src/core/store.ts";
import { createNewGame, draft } from "../src/game/state.ts";
import { catchUpEntities, moveActors, runActorSteps } from "../src/game/entities.ts";
import { growCrops } from "../src/game/newday.ts";
import { autoJob, pressPlan, infoHint, hintOf, facingTile } from "../src/game/hint.ts";
import { findPath, PATH_STATS } from "../src/game/pathfind.ts";
import { checkInvariants } from "../src/game/invariants.ts";
import { idx } from "../src/game/world.ts";

const content = loadContent();

/** Nông trại nặng, dựng tất định từ một hạt cố định. */
function nongTraiNang(seed = 4242) {
  /* `validate: false` là CỐ Ý: `checkInvariants` quét 1.776 ô sau mỗi dispatch,
     và nó không chạy ở bản phát hành. Bật lên thì bảng này đo phép kiểm chứ
     không đo trò chơi. Chi phí của chính phép kiểm được đo riêng bên dưới. */
  const store = createStore(createNewGame(content, seed), content, { validate: false, strict: false });
  const dbg = (op, n) => store.dispatch({ t: "DEBUG", op, ...(n === undefined ? {} : { n }) });
  dbg("money", 999999);
  dbg("tillMap");
  dbg("plantMap");
  dbg("waterMap");
  for (let i = 0; i < 24; i++) {
    dbg("spawnAnimal", i);
    // xe chở tới mất một lúc mới thả xuống — chạy cho nó tới nơi
    for (let k = 0; k < 400; k++) store.dispatch({ t: "TICK", dt: 1 / 60 });
  }
  for (let i = 0; i < 3; i++) dbg("spawnWorker");
  return store;
}

/** Đo `fn` nhiều lượt, trả trung vị và p99 theo mili giây. */
function do_(nhan, fn, lan = 2000) {
  for (let i = 0; i < 200; i++) fn(); // làm nóng JIT
  const v = new Float64Array(lan);
  for (let i = 0; i < lan; i++) {
    const a = process.hrtime.bigint();
    fn();
    v[i] = Number(process.hrtime.bigint() - a) / 1e6;
  }
  const q = Array.from(v).sort((a, b) => a - b);
  const f = (p) => q[Math.min(q.length - 1, Math.floor(q.length * p))];
  return { nhan, med: f(0.5), p99: f(0.99), max: q[q.length - 1] };
}

const hang = [];
const store = nongTraiNang();
const S = store.getState();
const oCay = S.tiles.filter((t) => t.crop).length;

/* ---- một khung hình của phần LOGIC ---- */
hang.push(do_("TICK trọn vẹn (một khung hình)", () => store.dispatch({ t: "TICK", dt: 1 / 60 })));
hang.push(do_("MOVE (đi một bước)", () => store.dispatch({ t: "MOVE", dx: 1, dy: 0, dt: 1 / 60 })));

/* ---- từng phần của TICK, trên draft rời nên state không trôi ---- */
const s0 = store.getState();
hang.push(do_("  · catchUpEntities", () => catchUpEntities(draft(s0), content, s0.mapId, 0.5)));
hang.push(do_("  · growCrops", () => growCrops(draft(s0), content, 0.5)));
hang.push(do_("  · moveActors", () => moveActors(draft(s0), content, 1 / 60)));
hang.push(do_("  · runActorSteps", () => runActorSteps(draft(s0), content)));

/* ---- những thứ chạy theo NHỊP CHẬM hơn, nhưng nặng khi chạy ---- */
hang.push(do_("autoJob (chọn việc gần nhất)", () => autoJob(s0, content), 400));
const dich = new Set([idx(s0.w, s0.w - 3, s0.h - 3)]);
hang.push(do_("findPath (một đầu bản đồ sang đầu kia)", () => findPath(s0, content, 2, 2, dich, { maxNodes: 2000 }), 200));
hang.push(do_("checkInvariants (chỉ chạy ở bản dev)", () => checkInvariants(s0, content), 400));

/* ---- NHÃN HAI CÁI NÚT: chạy 60 lần mỗi giây, ngay trong vòng vẽ ----

   `main.ts` gọi `pressPlan` + `infoHint` mỗi khung hình chỉ để in chữ lên hai
   cái nút và đặt mũi tên đỏ. Cả hai duyệt `s.entities` nhiều lượt, và khi
   quanh chân không có việc gì thì `nearestTarget` quét cả một vùng bán kính 6
   ô. Đó là thứ đắt nhất trong phần logic mà KHÔNG nằm trong `TICK`, nên trước
   Đợt 28 không dòng nào của bảng này nhìn thấy nó.

   Ba ca, vì chi phí của chúng khác hẳn nhau:
     · ô trước mặt CÓ việc — thoát sớm, rẻ;
     · ô ngắm TRỐNG — đi hết bước 5, tức `nearestTarget` quét cả vùng bán kính
       `CTX_RADIUS` quanh chân. Đây là ca ĐẮT NHẤT và là lý do có mấy dòng này;
     · không có ô ngắm — thoát ngay từ đầu. */
const OPTS_NUT = { context: true, canGo: true };
const oTruocMat = facingTile(s0);
/* Ô TRỐNG gần chân: không cây, không vật, không công trình — để `pressPlan`
   buộc phải đi tới bước quét quanh chân thay vì trả lời ngay. */
const oTrong = (() => {
  const px = Math.floor(s0.player.x / 16);
  const py = Math.floor(s0.player.y / 16);
  for (let r = 1; r < 12; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = px + dx;
        const y = py + dy;
        const t = s0.tiles[y * s0.w + x];
        if (t && !t.prop && !t.crop && !t.b) return { x, y };
      }
  return oTruocMat;
})();
hang.push(
  do_("nhãn nút: pressPlan (ô trước mặt)", () => hintOf(pressPlan(s0, content, oTruocMat, OPTS_NUT)), 2000),
);
hang.push(do_("nhãn nút: infoHint (ô trước mặt)", () => infoHint(s0, content, oTruocMat), 2000));
hang.push(
  do_("nhãn nút: pressPlan (ô ngắm TRỐNG)", () => hintOf(pressPlan(s0, content, oTrong, OPTS_NUT)), 2000),
);
hang.push(do_("nhãn nút: infoHint (ô ngắm TRỐNG)", () => infoHint(s0, content, oTrong), 2000));
hang.push(
  do_("nhãn nút: pressPlan (KHÔNG có ô ngắm)", () => hintOf(pressPlan(s0, content, null, OPTS_NUT)), 2000),
);
hang.push(do_("nhãn nút: infoHint (KHÔNG có ô ngắm)", () => infoHint(s0, content, null), 2000));

/* ------------------------------------------------------------------ in ra */
const NGAN_SACH = 1000 / 60;
console.log("\n  ONIFARM — bench (mô phỏng, không tính lớp vẽ)\n");
console.log(`  Cảnh: ${s0.tiles.length} ô · ${oCay} cây · ${s0.entities.length} thực thể · hạt 4242`);
console.log(`  Ngân sách một khung hình ở 60fps: ${NGAN_SACH.toFixed(2)} ms\n`);
const rong = Math.max(...hang.map((h) => h.nhan.length));
console.log(`  ${"".padEnd(rong)}   trung vị      p99      cao nhất   % ngân sách`);
for (const h of hang) {
  const pct = ((h.med / NGAN_SACH) * 100).toFixed(1);
  console.log(
    `  ${h.nhan.padEnd(rong)}  ${h.med.toFixed(4).padStart(8)}  ${h.p99.toFixed(4).padStart(8)}  ${h.max
      .toFixed(4)
      .padStart(8)}  ${pct.padStart(8)}%`,
  );
}
const khung = hang[0];
console.log(
  `\n  Một khung hình của phần logic tốn ${((khung.med / NGAN_SACH) * 100).toFixed(1)}% ngân sách 60fps.` +
    `\n  A* đã gọi ${PATH_STATS.calls} lần trong cả phiên đo.\n`,
);

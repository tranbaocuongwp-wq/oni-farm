/* ============================================================================
   TEST OTA — kiểm cái CỔNG, không kiểm cái mạng.

   Chạy:  npm run test:ota

   Phần đáng sợ nhất của OTA không phải là tải file về, mà là: chuyện gì xảy ra
   khi pack tải về bị hỏng, bị sửa tay sai, hay được viết cho một core khác?
   Đó là những gì file này kiểm. Nó chạy trong Node thuần, không cần trình duyệt,
   vì mọi thứ quan trọng đều nằm trong hàm thuần.
============================================================================ */

import { validatePack, buildContent } from "../src/core/content/loader.ts";
import { satisfies, isNewer } from "../src/core/content/semver.ts";
import { CORE_VERSION } from "../src/core/version.ts";
import { rawPack } from "./lib/load-content.mjs";

let failed = 0;
const ok = (name) => console.log(`  ✓ ${name}`);
const bad = (name, detail) => {
  console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ""}`);
  failed++;
};
const check = (name, cond, detail) => (cond ? ok(name) : bad(name, detail));

/** bản sao sâu để mỗi kịch bản không làm bẩn kịch bản sau */
const clone = (o) => JSON.parse(JSON.stringify(o));

console.log("\n── Cổng semver ──");
check("core hiện tại thoả pack đóng kèm", satisfies(CORE_VERSION, rawPack().manifest.requiresCore));
check("^1.0.0 nhận 1.4.9", satisfies("1.4.9", "^1.0.0"));
check("^1.0.0 TỪ CHỐI 2.0.0", !satisfies("2.0.0", "^1.0.0"));
check("^1.2.0 TỪ CHỐI 1.1.0 (cũ hơn mốc)", !satisfies("1.1.0", "^1.2.0"));
check("~1.2.0 nhận 1.2.7", satisfies("1.2.7", "~1.2.0"));
check("~1.2.0 TỪ CHỐI 1.3.0", !satisfies("1.3.0", "~1.2.0"));
check("^0.3.0 TỪ CHỐI 0.4.0 (quy ước 0.x)", !satisfies("0.4.0", "^0.3.0"));
check("dải sai cú pháp bị TỪ CHỐI", !satisfies("1.0.0", "rác"));
check("phiên bản sai cú pháp bị TỪ CHỐI", !satisfies("một.hai.ba", "^1.0.0"));
check("isNewer 1.1.0 > 1.0.9", isNewer("1.1.0", "1.0.9"));
check("isNewer không nhận bản bằng nhau", !isNewer("1.0.0", "1.0.0"));

console.log("\n── Pack đóng kèm ──");
{
  const problems = validatePack(rawPack());
  check("pack đóng kèm hợp lệ", problems.length === 0, problems.join("\n      "));
  const c = buildContent(rawPack());
  check("buildContent ra Content dùng được", c.cropOrder.length > 0 && c.map.rows.length === c.map.h);
  check("Content bị đóng băng (không sửa được lúc chạy)", Object.isFrozen(c));
}

console.log("\n── Pack hỏng phải bị TỪ CHỐI ──");
const reject = (name, mutate) => {
  const p = clone(rawPack());
  mutate(p);
  const problems = validatePack(p);
  check(name, problems.length > 0, "đáng lẽ phải báo lỗi nhưng lại chấp nhận");
};

reject("thiếu trường bắt buộc của cây", (p) => delete p.crops.crops[0].sellPrice);
reject("giá cây là chuỗi thay vì số", (p) => (p.crops.crops[0].sellPrice = "nhiều"));
reject("growthDays rỗng", (p) => (p.crops.crops[0].growthDays = []));
reject("growthDays có số 0", (p) => (p.crops.crops[0].growthDays = [1, 0, 2]));
reject("trùng id cây", (p) => (p.crops.crops[1].id = p.crops.crops[0].id));
reject("màu không phải hex", (p) => (p.crops.crops[0].art.leaf = "xanh lá"));
reject("kind công trình lạ", (p) => (p.buildings.buildings[0].kind = "bay lơ lửng"));
reject("hiệu ứng core KHÔNG hỗ trợ", (p) => (p.buildings.buildings[0].effects.dichChuyenTucThoi = 3));
reject("bản đồ có hàng lệch chiều rộng", (p) => (p.map.rows[5] = p.map.rows[5].slice(0, -1)));
reject("bản đồ dùng ký tự không có trong legend", (p) => (p.map.rows[5] = "Z".repeat(p.map.w)));
reject("progression mở khoá cây không tồn tại", (p) => p.progression.stages[1].unlocks.push("seed:khongCo"));
reject("progression require khoá thống kê lạ", (p) => (p.progression.goals[0].require = { soLanNhayLen: 3 }));
reject("startSeeds trỏ vào cây không tồn tại", (p) => (p.balance.startSeeds = { "seed:khongCo": 3 }));
reject("hotbarSlots lớn hơn inventorySlots", (p) => (p.balance.hotbarSlots = 999));
reject("dayEndMinutes <= dayStartMinutes", (p) => (p.balance.dayEndMinutes = 100));
reject("contentVersion không phải semver", (p) => (p.manifest.contentVersion = "mới nhất"));
reject("requiresCore không phải dải semver", (p) => (p.manifest.requiresCore = "core xịn"));
reject("có thiết bị tiêu điện nhưng không có nguồn điện", (p) => {
  for (const b of p.buildings.buildings) b.power.produce = 0;
});

console.log("\n── Sửa content HỢP LỆ thì phải được chấp nhận ──");
const accept = (name, mutate) => {
  const p = clone(rawPack());
  mutate(p);
  const problems = validatePack(p);
  check(name, problems.length === 0, problems.join("\n      "));
};

accept("chỉnh cân bằng giá", (p) => {
  p.crops.crops[0].sellPrice = 99;
  p.buildings.buildings[0].price = 1;
});
accept("thêm một cây hoàn toàn mới", (p) => {
  p.crops.crops.push({
    ...clone(p.crops.crops[0]),
    id: "duaHau",
    name: "Dưa hấu",
    seedName: "Hạt dưa hấu",
    seedPrice: 90,
    sellPrice: 300,
    growthDays: [2, 2, 3],
  });
});
accept("gỡ bỏ một cây (kèm mọi tham chiếu tới nó)", (p) => {
  p.crops.crops = p.crops.crops.filter((c) => c.id !== "pumpkin");
  for (const st of p.progression.stages)
    st.unlocks = st.unlocks.filter((u) => u !== "seed:pumpkin");
});
accept("đổi bản đồ sang một map khác cùng legend", (p) => {
  p.map = { w: 5, h: 3, rows: ["TTTTT", "T:::T", "TTTTT"] };
  p.tiles.spawn = { x: 2, y: 1 };
});

console.log("\n── Ghép pack: thiếu file thì dùng bản đóng kèm ──");
{
  // ota.ts bắt đầu từ pack đóng kèm rồi mới ghi đè từng file có trong manifest.
  // Kiểm rằng pack chỉ chứa crops vẫn ra một Content đầy đủ.
  const partial = { ...clone(rawPack()), crops: clone(rawPack().crops) };
  partial.crops.crops[0].sellPrice = 1234;
  const problems = validatePack(partial);
  check("pack chỉ đổi một file vẫn hợp lệ", problems.length === 0, problems.join("\n      "));
  const c = buildContent(partial);
  check("giá mới có hiệu lực", c.crops[c.cropOrder[0]].sellPrice === 1234);
  check("các file khác giữ nguyên", c.buildingOrder.length === rawPack().buildings.buildings.length);
}

console.log(
  failed === 0
    ? "\n✓ TẤT CẢ TEST OTA ĐỀU XANH\n"
    : `\n✗ ${failed} test OTA THẤT BẠI\n`,
);
process.exit(failed === 0 ? 0 : 1);

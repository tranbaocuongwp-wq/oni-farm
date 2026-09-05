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
  check(
    "buildContent ra Content dùng được",
    c.cropOrder.length > 0 &&
      c.mapOrder.length >= 2 &&
      c.mapOrder.every((n) => c.maps[n].rows.length === c.maps[n].h),
    `mapOrder=${JSON.stringify(c.mapOrder)}`,
  );
  check(
    "không bản đồ nào chứa ô thừa: tổng ô = tổng w×h",
    c.mapOrder.reduce((n, k) => n + c.maps[k].w * c.maps[k].h, 0) ===
      c.mapOrder.reduce((n, k) => n + c.maps[k].rows.join("").length, 0),
  );
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
reject("bản đồ có hàng lệch chiều rộng", (p) => (p.maps.farm.rows[5] = p.maps.farm.rows[5].slice(0, -1)));
reject("bản đồ dùng ký tự không có trong legend", (p) => (p.maps.farm.rows[5] = "Z".repeat(p.maps.farm.w)));
reject("cửa dẫn tới bản đồ KHÔNG TỒN TẠI", (p) => {
  p.props.props.find((x) => x.id === "door").portal = { map: "khongCo", x: 1, y: 1 };
});
reject("ô bắt đầu nằm ngoài bản đồ", (p) => {
  p.tiles.spawn = { map: "farm", x: 999, y: 999 };
});
reject("ô bắt đầu trỏ vào bản đồ không tồn tại", (p) => {
  p.tiles.spawn = { map: "khongCo", x: 1, y: 1 };
});
reject("progression require khoá thống kê lạ", (p) => (p.progression.goals[0].require = { soLanNhayLen: 3 }));
reject("startSeeds trỏ vào cây không tồn tại", (p) => (p.balance.startSeeds = { "seed:khongCo": 3 }));
reject("hotbarSlots lớn hơn inventorySlots", (p) => (p.balance.hotbarSlots = 999));
reject("dayEndMinutes <= dayStartMinutes", (p) => (p.balance.dayEndMinutes = 100));
reject("contentVersion không phải semver", (p) => (p.manifest.contentVersion = "mới nhất"));
reject("requiresCore không phải dải semver", (p) => (p.manifest.requiresCore = "core xịn"));
reject("cây trỏ vào mùa không tồn tại", (p) => {
  p.crops.crops[0].seasons = ["mua_mua_ngau"];
});
reject("một mùa không cây nào gieo được", (p) => {
  // Mùa trống là mấy chục phút người chơi không làm gì được — gần như chắc chắn
  // là sót lúc biên tập, không phải chủ ý.
  for (const c of p.crops.crops) c.seasons = c.seasons.filter((x) => x !== "dong");
});
reject("daysPerSeason bằng 0", (p) => (p.seasons.daysPerSeason = 0));
reject("cửa dịch chuyển trỏ ra ngoài bản đồ", (p) => {
  // Bẫy kinh điển khi đẩy OTA đổi map mà quên chỉnh cửa: người chơi bước vào
  // cửa rồi rơi ra hư vô. Phải chặn từ lúc kiểm pack.
  p.maps.house = { w: 5, h: 3, rows: ["WWWWW", "W___W", "WWWWW"] };
});
reject("vật thể rơi ra thứ không tồn tại", (p) => {
  const tree = p.props.props.find((x) => x.id === "tree");
  tree.drops = [{ id: "item:mythril", min: 1, max: 2 }];
});
reject("vật thể phá xong biến thành thứ không tồn tại", (p) => {
  p.props.props.find((x) => x.id === "tree").becomes = "khongCo";
});
reject("công thức chế tạo cần nguyên liệu không tồn tại", (p) => {
  p.recipes.recipes[0].in.push({ id: "item:mythril", n: 1 });
});
reject("legend dùng vật thể chưa định nghĩa", (p) => {
  p.tiles.legend["T"] = { ground: "grass", prop: "khongCoLoaiNay" };
});
reject("weather: tổng weight = 0 thì không rút thăm được", (p) => {
  for (const w of p.weather.weathers) w.weight = 0;
});
reject("weather: firstDay không tồn tại", (p) => (p.weather.firstDay = "tuyet"));
reject("weather: wind ngoài [0,1]", (p) => (p.weather.weathers[0].wind = 3));
reject("props: grow.to trỏ vào vật thể không có", (p) => {
  p.props.props.find((x) => x.id === "sapling").grow = { to: "khongCo", days: 2 };
});
reject("props: spread.into trỏ vào vật thể không có", (p) => {
  p.props.props.find((x) => x.id === "grass_short").spread = { chance: 0.1, into: "khongCo" };
});
reject("props: stormFell.chance > 1", (p) => {
  p.props.props.find((x) => x.id === "sapling").stormFell = { to: "log", chance: 7 };
});
reject("tiles.indoorMaps trỏ vào bản đồ không có", (p) => (p.tiles.indoorMaps = ["hamMo"]));
reject("balance.diseaseChance > 1", (p) => (p.balance.diseaseChance = 2));

/* KHU CHUỒNG — mỗi luật ở đây tương ứng một cách làm hỏng ván chơi mà nhìn
   content thì không thấy: chuồng nằm ngoài bản đồ, con vật thuộc một khu không
   tồn tại, máng không đổ được gì vào, hay một gốc cây quên dọn giữa chuồng. */
reject("khu chuồng tràn ra ngoài bản đồ", (p) => (p.tiles.pens[0].x = 9000));
reject("khu chuồng trỏ vào bản đồ không có", (p) => (p.tiles.pens[0].map = "hamMo"));
reject("loài thuộc một khu không tồn tại", (p) => (p.actors.animals[0].pen = "khuMaQuai"));
reject("khu khai feeds nhưng trong ruột không có máng", (p) => {
  const pen = p.tiles.pens.find((q) => (q.feeds ?? []).length && !q.swim);
  for (let y = pen.y; y < pen.y + pen.h; y++) {
    const r = p.maps.farm.rows[y].split("");
    // 'm' = máng đứng trên nền bê tông ('M' là biến thể trên cỏ). Gỡ máng đi
    // nhưng GIỮ nền, không thì ruột chuồng thành ô cỏ và test đo nhầm thứ khác.
    for (let x = pen.x; x < pen.x + pen.w; x++) {
      if (r[x] === "m") r[x] = "#";
      else if (r[x] === "M") r[x] = ".";
    }
    p.maps.farm.rows[y] = r.join("");
  }
});
reject("có máng nhưng khu không khai feeds", (p) => {
  delete p.tiles.pens.find((q) => (q.feeds ?? []).length && !q.swim).feeds;
});
reject("ô đặc lọt vào ruột khu chuồng", (p) => {
  const pen = p.tiles.pens.find((q) => !q.swim);
  const r = p.maps.farm.rows[pen.y].split("");
  r[pen.x] = "T"; // một cây gỗ lớn mọc giữa chuồng
  p.maps.farm.rows[pen.y] = r.join("");
});
reject("khu dưới nước lại có ô cạn trong ruột", (p) => {
  const pen = p.tiles.pens.find((q) => q.swim);
  const r = p.maps.farm.rows[pen.y].split("");
  r[pen.x] = ".";
  p.maps.farm.rows[pen.y] = r.join("");
});
reject("legend dựng một công trình không có thật", (p) => (p.tiles.legend.F.build = "raoMaQuai"));

/* THỨC ĂN — mỗi luật một cách làm hỏng ván chơi mà nhìn content thì không thấy. */
reject("loài ăn một thứ không tồn tại", (p) => (p.actors.animals[0].feed = ["item:khongCoThat"]));
reject("khu đổ được một thứ không tồn tại", (p) => (p.tiles.pens[0].feeds = ["item:khongCoThat"]));
reject("vùng đất tràn ra ngoài bản đồ", (p) => (p.tiles.zones[0].x = 9000));
reject("vùng đất trỏ vào bản đồ không có", (p) => (p.tiles.zones[0].map = "hamMo"));
reject("kind vùng lạ", (p) => (p.tiles.zones[0].kind = "bai_bien"));
reject("khu ruộng không có ô nào cuốc được", (p) => {
  const z = p.tiles.zones.find((q) => q.kind === "farm");
  for (let y = z.y; y < z.y + z.h; y++) {
    const r = p.maps.farm.rows[y].split("");
    for (let x = z.x; x < z.x + z.w; x++) if (r[x] !== ":") r[x] = "T";
    p.maps.farm.rows[y] = r.join("");
  }
});
reject("legend bắc cầu bằng một vật thể không có thật", (p) => (p.tiles.legend.P.prop = "cauMaQuai"));
reject("balance.forestRegrowChance > 1", (p) => (p.balance.forestRegrowChance = 3));
reject("tên công thức tự chép số lượng vào (\"Đường nhựa ×4\" → in ra ×4 ×4)", (p) => {
  const r = p.recipes.recipes.find((q) => q.out.n > 1);
  r.name = `${r.name} ×${r.out.n}`;
});
/* Biển ĐỨNG Ở MÉP ô (`place: "edge"`) nên KHÔNG được nằm trong lưới: lưới chỉ
   có đúng một chỗ cho vật thể ở mỗi ô, đưa nó vào đó là lấy mất ô của người
   chơi đúng cái thứ vừa hứa là không lấy — và legend còn phải nói ô đó nền gì,
   nên mỗi tấm sẽ tự đắp một mảng nền dưới chân mình. */
reject("vật đứng ở MÉP ô lại bị đưa vào legend", (p) => {
  p.tiles.legend["N"] = { ground: "grass", prop: "sign" };
});
reject('place lạ (không phải "tile"/"edge")', (p) => {
  p.props.props.find((x) => x.id === "sign").place = "lo lửng";
});
reject("vừa không chiếm ô vừa chặn ô", (p) => {
  p.props.props.find((x) => x.id === "sign").solid = true;
});
reject("hai tấm biển chồng lên cùng một ô", (p) => {
  p.tiles.signs[1] = { ...p.tiles.signs[0], text: "Trùng chỗ" };
});
reject("chữ trên biển dài quá tấm ván", (p) => {
  p.tiles.signs[0].text = "Lô A1 khu đông bắc gần bờ ao";
});
reject("biển trỏ vào bản đồ không có", (p) => (p.tiles.signs[0].map = "hamMo"));
reject("biển cắm ra giữa lòng đường nhựa", (p) => {
  const sg = p.tiles.signs[0];
  const r = p.maps[sg.map].rows[sg.y].split("");
  r[sg.x] = "=";
  p.maps[sg.map].rows[sg.y] = r.join("");
});
reject("side của biển không phải e/w", (p) => (p.tiles.signs[0].side = "bac"));
/* Biển phải đứng TRONG khu nó gọi tên. Đẩy nó ra con ngõ bên cạnh là đúng cái
   lỗi người chơi bắt được: tấm biển đè lên lối đi, lô nào cũng đọc thấy mà
   chẳng lô nào nhận. Chuyển cả cái cọc theo để lỗi DUY NHẤT còn lại là "sai
   chỗ" — nếu không thì test này xanh nhờ luật "chữ không có cọc". */
reject("biển của một lô bị đẩy ra con ngõ ngoài lô", (p) => {
  const z = p.tiles.zones.find((q) => q.kind === "farm");
  p.tiles.signs.find((q) => q.text === z.name).x = z.x - 1; // ngõ dọc sát mép tây
});

reject("khu dưới nước lại đặt máng", (p) => {
  const pen = p.tiles.pens.find((q) => q.swim);
  const r = p.maps.farm.rows[pen.y].split("");
  r[pen.x] = "M";
  p.maps.farm.rows[pen.y] = r.join("");
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
const addCrop = (p) => {
  p.crops.crops.push({
    ...clone(p.crops.crops[0]),
    id: "duaGang",
    name: "Dưa gang",
    seedName: "Hạt dưa gang",
    seedPrice: 90,
    sellPrice: 300,
    growthDays: [2, 2, 3],
  });
};
accept("thêm một cây hoàn toàn mới", (p) => {
  addCrop(p);
});
accept("gỡ bỏ một cây (kèm mọi tham chiếu tới nó)", (p) => {
  p.crops.crops = p.crops.crops.filter((c) => c.id !== "pumpkin");
});
accept("đổi bản đồ sang một map khác cùng legend", (p) => {
  p.maps.farm = { w: 5, h: 3, rows: ["TTTTT", "T:::T", "TTTTT"] };
  p.tiles.spawn = { map: "farm", x: 2, y: 1 };
  // Bản đồ nhỏ lại thì CỬA DỊCH CHUYỂN phải được chỉnh theo — đích cũ nằm ngoài
  // bản đồ mới. Đây chính là việc mà một bản OTA đổi map thật sự phải làm.
  for (const pr of p.props.props)
    if (pr.portal) pr.portal = { map: pr.portal.map === "farm" ? "farm" : "house", x: 2, y: 1 };
  p.maps.house = { w: 5, h: 3, rows: ["WWWWW", "W___W", "WWWWW"] };
  // …và KHU CHUỒNG cũng vậy: ruột khu cũ nằm ngoài cái bản đồ 5×3 này. Đổi map
  // mà quên `pens` thì con vật có một cái chuồng ở ngoài rìa thế giới — nên bỏ
  // luôn cả khu lẫn ô `pen` của từng loài, đúng việc một bản OTA thật phải làm.
  delete p.tiles.pens;
  for (const a of p.actors.animals) delete a.pen;
  // …và VÙNG ĐẤT: khu ruộng cũ nằm ngoài cái bản đồ 5×3 này. Bỏ hẳn `zones`
  // nghĩa là "không giới hạn" — cuốc lại ăn khắp nơi, đúng hành vi pack cũ.
  delete p.tiles.zones;
  // …và BIỂN CẮM: chúng trỏ vào ô của bản đồ cũ. Bỏ hết, đúng như một bản OTA
  // đổi bản đồ phải làm.
  delete p.tiles.signs;
});
accept("pack CŨ không khai signs — bản đồ không có tấm biển nào", (p) => {
  /* Biển không nằm trong lưới, nên gỡ nó đi là xoá đúng một mảng dữ liệu —
     không phải sửa lại một ký tự nào của bản đồ. */
  delete p.tiles.signs;
});
accept("thêm một kiểu thời tiết mới", (p) => {
  p.weather.weathers.push({ id: "tuyet", name: "Tuyết", weight: 3, wet: false, growMul: 0.3, wind: 0.2 });
});
accept("pack cũ không có các số cân bằng core 1.3 (loader điền mặc định)", (p) => {
  delete p.balance.diseaseChance;
  delete p.balance.diseaseNeighbourMul;
  delete p.balance.sickYieldMul;
  delete p.balance.noonDryMinutes;
  delete p.balance.energyCost.cure;
  delete p.balance.energyCost.pull;
  delete p.tiles.indoorMaps;
});
accept("pack CŨ khai feed là một chuỗi (trước khi mỗi loài có nhiều món)", (p) => {
  for (const a of p.actors.animals) a.feed = a.feed.length ? a.feed[0] : null;
  // …và khu thì chưa có `feeds`, nên cũng không được có máng nào
  for (const pen of p.tiles.pens) delete pen.feeds;
  for (let y = 0; y < p.maps.farm.rows.length; y++)
    p.maps.farm.rows[y] = p.maps.farm.rows[y].replaceAll("m", "#").replaceAll("M", ".");
});
accept("tắt hẳn mọc lại rừng (forestRegrowChance = 0)", (p) => (p.balance.forestRegrowChance = 0));
accept("pack CŨ không khai zones — cuốc lại ăn khắp nơi như trước", (p) => {
  delete p.tiles.zones;
});
accept("THÊM hẳn một bản đồ mới", (p) => {
  p.maps.hangDong = { w: 6, h: 4, rows: ["oooooo", "o::::o", "o::::o", "oooooo"] };
});
accept("đổi nhịp mùa qua OTA: mùa dài hơn, đổi trọng số thời tiết", (p) => {
  p.seasons.daysPerSeason = 20;
  p.seasons.seasons.find((x) => x.id === "dong").weather.fog = 40;
});
accept("thêm hẳn mùa thứ năm và cho cây gieo trong đó", (p) => {
  p.seasons.seasons.push({ id: "tet", name: "Tết", growMul: 1.2, weather: { sunny: 60, fog: 20 } });
  p.crops.crops[0].seasons = [...p.crops.crops[0].seasons, "tet"];
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

/* ============================================================================
   BUILD CONTENT — biên dịch + kiểm tra + đóng gói content pack.

   Chạy:  npm run content:build

   Ba việc:
     1. maps/farm.ascii  →  maps/farm.json   (nguồn dễ sửa tay → thứ game đọc)
     2. Kiểm toàn bộ pack bằng đúng schema mà core dùng lúc chạy — sai là fail
        ngay ở đây, không để lọt tới người chơi.
     3. Xuất pack kèm checksum ra public/content/<version>/ để host tĩnh phục vụ
        OTA. Không đẩy OTA thì thư mục này chỉ đơn giản là không ai gọi tới.
============================================================================ */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildContent, compileAsciiMap, validatePack } from "../src/core/content/loader.ts";
import { CORE_VERSION } from "../src/core/version.ts";
import { satisfies } from "../src/core/content/semver.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src", "content");
const OUT = join(ROOT, "public", "content");

const read = (p) => readFileSync(join(SRC, p), "utf8");
const readJson = (p) => JSON.parse(read(p));
const sha256 = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

let failed = false;
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  failed = true;
};

/* ---- 1. ascii → json ---------------------------------------------------- */
// Mỗi tên trong manifest.files dạng maps/<tên>.json có một nguồn ASCII cùng tên.
const manifest0 = readJson("manifest.json");
const mapNames = manifest0.files
  .map((f) => /^maps\/(.+)\.json$/.exec(f)?.[1])
  .filter(Boolean);
const maps = {};
let totalTiles = 0;
for (const name of mapNames) {
  const m = compileAsciiMap(read(`maps/${name}.ascii`));
  maps[name] = m;
  totalTiles += m.w * m.h;
  writeFileSync(join(SRC, `maps/${name}.json`), JSON.stringify(m, null, 2) + "\n");
  console.log(`✓ maps/${name}.json  ${m.w}×${m.h} = ${m.w * m.h} ô`);
}
console.log(`✓ tổng ${mapNames.length} bản đồ · ${totalTiles} ô`);

/* ---- 2. kiểm tra -------------------------------------------------------- */
const raw = {
  manifest: readJson("manifest.json"),
  tiles: readJson("tiles.json"),
  props: readJson("props.json"),
  crops: readJson("crops.json"),
  buildings: readJson("buildings.json"),
  items: readJson("items.json"),
  recipes: readJson("recipes.json"),
  balance: readJson("balance.json"),
  progression: readJson("progression.json"),
  strings: readJson("strings.vi.json"),
  weather: readJson("weather.json"),
  seasons: readJson("seasons.json"),
  actors: readJson("actors.json"),
  maps,
};

const problems = validatePack(raw);
if (problems.length) {
  for (const p of problems) fail(p);
} else {
  console.log("✓ schema + tham chiếu chéo hợp lệ");
}

if (!satisfies(CORE_VERSION, raw.manifest.requiresCore)) {
  fail(
    `manifest.requiresCore='${raw.manifest.requiresCore}' không khớp CORE_VERSION='${CORE_VERSION}'`,
  );
}

if (failed) {
  console.error("\nContent pack KHÔNG hợp lệ — dừng lại.");
  process.exit(1);
}

const content = buildContent(raw);
console.log(
  `✓ ${content.cropOrder.length} cây · ${content.buildingOrder.length} công trình · ` +
    `${content.propOrder.length} địa hình · ${content.materialOrder.length} vật liệu · ` +
    `${content.recipes.length} công thức · ${content.toolOrder.length} công cụ`,
);
console.log(`✓ ${content.stages.length} mốc mở khoá · ${content.goals.length} mục tiêu`);

/* ---- 3. đóng gói cho OTA ------------------------------------------------ */
const version = raw.manifest.contentVersion;
const dir = join(OUT, version);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(dir, "maps"), { recursive: true });

const files = {};
for (const rel of raw.manifest.files) {
  const mm = /^maps\/(.+)\.json$/.exec(rel);
  const body = mm ? JSON.stringify(maps[mm[1]], null, 2) + "\n" : read(rel);
  writeFileSync(join(dir, rel), body);
  files[rel] = sha256(body);
}

// manifest đã xuất bản mang thêm checksum để client phát hiện file hỏng/đứt tải
const published = {
  contentVersion: version,
  requiresCore: raw.manifest.requiresCore,
  name: raw.manifest.name,
  builtAt: new Date().toISOString(),
  base: `/content/${version}/`,
  files,
};
writeFileSync(join(dir, "manifest.json"), JSON.stringify(published, null, 2) + "\n");
// con trỏ "mới nhất" — đây là URL mà client hỏi thăm
writeFileSync(
  join(OUT, "latest.json"),
  JSON.stringify({ contentVersion: version, manifest: `/content/${version}/manifest.json` }, null, 2) + "\n",
);

console.log(`✓ pack OTA → public/content/${version}/ (${Object.keys(files).length} file)`);
console.log(`✓ con trỏ  → public/content/latest.json`);

/* ============================================================================
   PUBLISH CONTENT — xuất bản MỘT MÌNH content pack, không đụng tới bundle web.

   Chạy:  node scripts/publish-content.mjs <thư-mục-đích>

   Đây chính là điểm của việc tách core/content: đẩy nội dung mới cho người chơi
   mà KHÔNG phát hành lại app. Script này ghi pack + con trỏ latest.json vào một
   thư mục đã deploy sẵn, giữ nguyên mọi file khác.

   Quy trình thường dùng:
     1. sửa src/content/, TĂNG contentVersion trong manifest.json
     2. node scripts/publish-content.mjs dist
     3. npx wrangler pages deploy dist --project-name oni-farm

   Bước 3 chỉ tải lên các file content mới; bundle web cũ giữ nguyên. Người chơi
   mở game sẽ thấy bản nội dung mới ở lần khởi động kế tiếp.
============================================================================ */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validatePack, compileAsciiMap } from "../src/core/content/loader.ts";
import { satisfies } from "../src/core/content/semver.ts";
import { CORE_VERSION } from "../src/core/version.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src", "content");

const target = process.argv[2];
if (!target) {
  console.error("Cách dùng: node scripts/publish-content.mjs <thư-mục-đích>");
  process.exit(1);
}
const OUT = join(resolve(target), "content");

const read = (p) => readFileSync(join(SRC, p), "utf8");
const readJson = (p) => JSON.parse(read(p));
const sha256 = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

const manifest = readJson("manifest.json");
const mapNames = manifest.files.map((f) => /^maps\/(.+)\.json$/.exec(f)?.[1]).filter(Boolean);
const maps = Object.fromEntries(mapNames.map((n) => [n, compileAsciiMap(read(`maps/${n}.ascii`))]));

const raw = {
  manifest,
  tiles: readJson("tiles.json"),
  props: readJson("props.json"),
  crops: readJson("crops.json"),
  buildings: readJson("buildings.json"),
  items: readJson("items.json"),
  recipes: readJson("recipes.json"),
  balance: readJson("balance.json"),
  progression: readJson("progression.json"),
  strings: readJson("strings.vi.json"),
  maps,
};

const problems = validatePack(raw);
if (problems.length) {
  console.error("✗ Content pack KHÔNG hợp lệ — không xuất bản:");
  for (const p of problems) console.error(`   - ${p}`);
  process.exit(1);
}
if (!satisfies(CORE_VERSION, manifest.requiresCore)) {
  console.error(
    `✗ requiresCore='${manifest.requiresCore}' không khớp CORE_VERSION='${CORE_VERSION}'`,
  );
  process.exit(1);
}

const version = manifest.contentVersion;
const dir = join(OUT, version);
mkdirSync(join(dir, "maps"), { recursive: true });

const files = {};
for (const rel of manifest.files) {
  const mm = /^maps\/(.+)\.json$/.exec(rel);
  const body = mm ? JSON.stringify(maps[mm[1]], null, 2) + "\n" : read(rel);
  writeFileSync(join(dir, rel), body);
  files[rel] = sha256(body);
}

writeFileSync(
  join(dir, "manifest.json"),
  JSON.stringify(
    {
      contentVersion: version,
      requiresCore: manifest.requiresCore,
      name: manifest.name,
      builtAt: new Date().toISOString(),
      base: `/content/${version}/`,
      files,
    },
    null,
    2,
  ) + "\n",
);

writeFileSync(
  join(OUT, "latest.json"),
  JSON.stringify(
    { contentVersion: version, manifest: `/content/${version}/manifest.json` },
    null,
    2,
  ) + "\n",
);

console.log(`✓ xuất bản nội dung ${version} → ${OUT}/${version}/`);
console.log(`✓ con trỏ latest.json → ${version}`);
console.log(`\nDeploy:  npx wrangler pages deploy ${target} --project-name oni-farm`);

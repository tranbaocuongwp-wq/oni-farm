/* Nạp content pack đóng kèm từ đĩa, cho các script chạy trong Node.
   Web dùng src/core/content/bundled.ts; cả hai đều đi qua buildContent() nên
   test và game thật luôn thấy đúng một `Content` như nhau. */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildContent, compileAsciiMap } from "../../src/core/content/loader.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = join(ROOT, "src", "content");

const read = (p) => readFileSync(join(SRC, p), "utf8");
const readJson = (p) => JSON.parse(read(p));

/** Các file JSON thô — dùng khi cần sửa gì đó trước khi build (test OTA). */
export function rawPack() {
  return {
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
    maps: Object.fromEntries(
      (readJson("manifest.json").files
        .map((f) => /^maps\/(.+)\.json$/.exec(f)?.[1])
        .filter(Boolean)).map((n) => [n, compileAsciiMap(read(`maps/${n}.ascii`))]),
    ),
  };
}

/** Content đã chuẩn hoá, sẵn sàng đưa vào createStore(). */
export function loadContent() {
  return buildContent(rawPack());
}

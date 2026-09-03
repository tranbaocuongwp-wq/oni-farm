/* ============================================================================
   CONTENT ĐÓNG KÈM — bản nội dung nằm sẵn trong bundle.

   Đây là BẢO CHỨNG OFFLINE: game luôn chạy được bằng đúng bộ này, kể cả máy
   chưa từng nối mạng. OTA chỉ là lớp phủ bên trên, không bao giờ là điều kiện
   để game khởi động.
============================================================================ */

import manifest from "../../content/manifest.json";
import tiles from "../../content/tiles.json";
import props from "../../content/props.json";
import crops from "../../content/crops.json";
import buildings from "../../content/buildings.json";
import items from "../../content/items.json";
import recipes from "../../content/recipes.json";
import balance from "../../content/balance.json";
import progression from "../../content/progression.json";
import strings from "../../content/strings.vi.json";
import farmMap from "../../content/maps/farm.json";
import houseMap from "../../content/maps/house.json";

import type { Content } from "../../game/types.ts";
import { buildContent, type RawPack } from "./loader.ts";

export function bundledRawPack(): RawPack {
  return {
    manifest, tiles, props, crops, buildings, items, recipes, balance, progression, strings,
    maps: { farm: farmMap, house: houseMap },
  };
}

/** Ném lỗi nếu content đóng kèm hỏng — đó là lỗi lập trình, phải nổ to lúc dev
 *  chứ không được im lặng cho ra bản phát hành. `npm run content:build` bắt
 *  được hầu hết trường hợp này trước cả khi build. */
export function bundledContent(): Content {
  return buildContent(bundledRawPack());
}

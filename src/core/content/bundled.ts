/* ============================================================================
   CONTENT ĐÓNG KÈM — bản nội dung nằm sẵn trong bundle.

   Đây là BẢO CHỨNG OFFLINE: game luôn chạy được bằng đúng bộ này, kể cả máy
   chưa từng nối mạng. OTA chỉ là lớp phủ bên trên, không bao giờ là điều kiện
   để game khởi động.
============================================================================ */

import manifest from "../../content/manifest.json";
import tiles from "../../content/tiles.json";
import crops from "../../content/crops.json";
import buildings from "../../content/buildings.json";
import items from "../../content/items.json";
import balance from "../../content/balance.json";
import progression from "../../content/progression.json";
import strings from "../../content/strings.vi.json";
import map from "../../content/maps/farm.json";

import type { Content } from "../../game/types.ts";
import { buildContent, type RawPack } from "./loader.ts";

export function bundledRawPack(): RawPack {
  return { manifest, tiles, crops, buildings, items, balance, progression, strings, map };
}

/** Ném lỗi nếu content đóng kèm hỏng — đó là lỗi lập trình, phải nổ to lúc dev
 *  chứ không được im lặng cho ra bản phát hành. `npm run content:build` bắt
 *  được hầu hết trường hợp này trước cả khi build. */
export function bundledContent(): Content {
  return buildContent(bundledRawPack());
}

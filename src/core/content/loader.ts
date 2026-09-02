/* ============================================================================
   LOADER — biến content pack thô (JSON) thành đối tượng `Content` đã chuẩn hoá.

   Thuần tuý: không fetch, không đọc file, không chạm DOM. Nhờ vậy dùng chung
   được cho cả ba đường vào:
     · bundled.ts  — pack đóng kèm trong bundle (bảo chứng offline)
     · ota.ts      — pack tải về từ xa
     · scripts/*   — test chạy trong Node đọc từ đĩa

   Ngoài schema từng file, ở đây còn kiểm THAM CHIẾU CHÉO: progression mở khoá
   một cây không tồn tại, startSeeds trỏ vào hạt không có... đều bị chặn.
   Đây là lỗi hay gặp nhất khi sửa content bằng tay.
============================================================================ */

import type {
  Balance,
  BuildingDef,
  Content,
  CropDef,
  Goal,
  MapData,
  ProgressionStage,
  Strings,
  TilesDef,
  ToolDef,
} from "../../game/types.ts";
import {
  validateBalance,
  validateBuildings,
  validateCrops,
  validateItems,
  validateManifest,
  validateMap,
  validateProgression,
  validateStrings,
  validateTiles,
} from "./schema.ts";

/** Các file JSON thô của một content pack, chưa qua kiểm tra. */
export interface RawPack {
  manifest: unknown;
  tiles: unknown;
  crops: unknown;
  buildings: unknown;
  items: unknown;
  balance: unknown;
  progression: unknown;
  strings: unknown;
  map: unknown;
}

export class ContentError extends Error {
  problems: string[];
  constructor(problems: string[]) {
    super(`Content pack không hợp lệ (${problems.length} lỗi):\n  - ${problems.join("\n  - ")}`);
    this.name = "ContentError";
    this.problems = problems;
  }
}

/** Kiểm tra toàn bộ pack. Trả về danh sách lỗi rỗng nghĩa là hợp lệ. */
export function validatePack(raw: RawPack): string[] {
  const errors: string[] = [
    ...validateManifest(raw.manifest),
    ...validateTiles(raw.tiles),
    ...validateCrops(raw.crops),
    ...validateBuildings(raw.buildings),
    ...validateItems(raw.items),
    ...validateBalance(raw.balance),
    ...validateProgression(raw.progression),
    ...validateStrings(raw.strings),
  ];

  // map cần legend nên phải kiểm sau tiles
  const legendChars = new Set<string>();
  const tiles = raw.tiles as { legend?: Record<string, unknown> } | null;
  if (tiles && typeof tiles === "object" && tiles.legend)
    for (const ch of Object.keys(tiles.legend)) legendChars.add(ch);
  errors.push(...validateMap(raw.map, legendChars));

  if (errors.length) return errors;

  // ---- tham chiếu chéo (chỉ chạy khi từng file đã hợp lệ) ----
  const crops = (raw.crops as { crops: CropDef[] }).crops;
  const buildings = (raw.buildings as { buildings: BuildingDef[] }).buildings;
  const balance = raw.balance as Balance;
  const prog = raw.progression as { stages: ProgressionStage[]; goals: Goal[] };

  const cropIds = new Set(crops.map((c) => c.id));
  const buildingIds = new Set(buildings.map((b) => b.id));
  const known = new Set<string>([
    ...[...cropIds].map((id) => `seed:${id}`),
    ...buildingIds,
  ]);

  for (const key of Object.keys(balance.startSeeds ?? {})) {
    if (!key.startsWith("seed:")) errors.push(`balance.startSeeds.${key}: khoá phải dạng 'seed:<id cây>'`);
    else if (!cropIds.has(key.slice(5)))
      errors.push(`balance.startSeeds.${key}: không có cây '${key.slice(5)}' trong crops.json`);
  }

  for (const s of prog.stages)
    for (const u of s.unlocks)
      if (!known.has(u))
        errors.push(
          `progression stage '${s.id}' mở khoá '${u}' — không khớp cây (seed:<id>) hay công trình nào`,
        );

  // require chỉ được dùng khoá mà progression.ts biết đọc
  const statKeys = new Set([
    "money", "day", "tilled", "planted", "watered", "harvested", "sold", "earned",
  ]);
  const checkReq = (where: string, req: Record<string, number>) => {
    for (const k of Object.keys(req)) {
      if (statKeys.has(k)) continue;
      if (k.startsWith("built.")) {
        if (!buildingIds.has(k.slice(6)))
          errors.push(`${where}: require '${k}' trỏ vào công trình không tồn tại`);
        continue;
      }
      errors.push(`${where}: require '${k}' không phải khoá thống kê core hiểu được`);
    }
  };
  for (const s of prog.stages) checkReq(`progression stage '${s.id}'`, s.require);
  for (const g of prog.goals) checkReq(`progression goal '${g.id}'`, g.require);

  // điện: nếu có thiết bị tiêu thụ điện thì phải có thiết bị sinh điện, không thì
  // người chơi mua về mà không bao giờ dùng được
  const produces = buildings.some((b) => b.power.produce > 0);
  const consumes = buildings.filter((b) => b.power.consume > 0);
  if (consumes.length && !produces)
    errors.push(
      `buildings: ${consumes.map((b) => b.id).join(", ")} cần điện nhưng không công trình nào sinh điện`,
    );

  return errors;
}

/** Kiểm tra rồi chuẩn hoá thành `Content`. Ném ContentError nếu pack hỏng. */
export function buildContent(raw: RawPack): Content {
  const problems = validatePack(raw);
  if (problems.length) throw new ContentError(problems);

  const manifest = raw.manifest as { contentVersion: string; requiresCore: string };
  const cropList = (raw.crops as { crops: CropDef[] }).crops;
  const buildingList = (raw.buildings as { buildings: BuildingDef[] }).buildings;
  const toolList = (raw.items as { tools: ToolDef[] }).tools;
  const prog = raw.progression as { stages: ProgressionStage[]; goals: Goal[] };

  const byId = <T extends { id: string }>(list: T[]): Record<string, T> =>
    Object.fromEntries(list.map((x) => [x.id, x]));

  return Object.freeze({
    contentVersion: manifest.contentVersion,
    requiresCore: manifest.requiresCore,
    crops: byId(cropList),
    cropOrder: cropList.map((c) => c.id),
    buildings: byId(buildingList),
    buildingOrder: buildingList.map((b) => b.id),
    tools: byId(toolList),
    toolOrder: toolList.map((t) => t.id),
    balance: raw.balance as Balance,
    tiles: raw.tiles as TilesDef,
    map: raw.map as MapData,
    stages: prog.stages,
    goals: prog.goals,
    strings: raw.strings as Strings,
  }) as Content;
}

/* ---------------------------------------------------------------------------
   Biên dịch bản đồ ASCII (nguồn tiện sửa tay) sang MapData.
   Dùng bởi scripts/build-content.mjs và bởi test.
--------------------------------------------------------------------------- */
export function compileAsciiMap(ascii: string): MapData {
  const rows = ascii.replace(/\r/g, "").split("\n").filter((r) => r.length > 0);
  if (rows.length === 0) throw new Error("bản đồ ASCII rỗng");
  const w = rows[0]!.length;
  const bad = rows.findIndex((r) => r.length !== w);
  if (bad >= 0)
    throw new Error(
      `bản đồ ASCII: hàng ${bad} dài ${rows[bad]!.length} ký tự, phải là ${w} như hàng đầu`,
    );
  return { w, h: rows.length, rows };
}

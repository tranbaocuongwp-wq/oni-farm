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
  MaterialDef,
  ProgressionStage,
  PropDef,
  AnimalDef,
  RecipeDef,
  VehicleDef,
  WorkerContent,
  SeasonDef,
  Strings,
  TilesDef,
  ToolDef,
  WeatherDef,
} from "../../game/types.ts";
import {
  validateBalance,
  validateBuildings,
  validateCrops,
  validateItems,
  validateManifest,
  validateMap,
  validateProgression,
  validateActors,
  validateProps,
  validateRecipes,
  validateSeasons,
  validateStrings,
  validateTiles,
  validateWeather,
} from "./schema.ts";

/** Các file JSON thô của một content pack, chưa qua kiểm tra. */
export interface RawPack {
  manifest: unknown;
  tiles: unknown;
  props: unknown;
  crops: unknown;
  buildings: unknown;
  items: unknown;
  recipes: unknown;
  balance: unknown;
  progression: unknown;
  strings: unknown;
  /** Thời tiết (core 1.3). Pack cũ không có → ota.ts ghép từ bản đóng kèm. */
  weather: unknown;
  /** Bốn mùa (core 1.4). Thiếu = content không có mùa, cây gieo quanh năm. */
  seasons?: unknown;
  /** Vật nuôi + sâu bọ (core 1.6). Thiếu = chưa có loài nào. */
  actors?: unknown;
  /** Mỗi bản đồ một lưới riêng, tra theo tên: { farm: {...}, house: {...} }. */
  maps: Record<string, unknown>;
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
    ...validateProps(raw.props),
    ...validateCrops(raw.crops),
    ...validateRecipes(raw.recipes),
    ...validateBuildings(raw.buildings),
    ...validateItems(raw.items),
    ...validateBalance(raw.balance),
    ...validateProgression(raw.progression),
    ...validateStrings(raw.strings),
    ...validateWeather(raw.weather),
    ...(raw.seasons === undefined ? [] : validateSeasons(raw.seasons)),
    ...(raw.actors === undefined ? [] : validateActors(raw.actors)),
  ];

  // map cần legend nên phải kiểm sau tiles
  const legendChars = new Set<string>();
  const tilesRaw = raw.tiles as { legend?: Record<string, unknown> } | null;
  if (tilesRaw && typeof tilesRaw === "object" && tilesRaw.legend)
    for (const ch of Object.keys(tilesRaw.legend)) legendChars.add(ch);
  if (!raw.maps || typeof raw.maps !== "object") errors.push("maps: phải là object tên → bản đồ");
  else
    for (const [name, m] of Object.entries(raw.maps))
      errors.push(...validateMap(m, legendChars).map((e) => `maps.${name} → ${e}`));

  if (errors.length) return errors;

  // ---- tham chiếu chéo (chỉ chạy khi từng file đã hợp lệ) ----
  const crops = (raw.crops as { crops: CropDef[] }).crops;
  const buildings = (raw.buildings as { buildings: BuildingDef[] }).buildings;
  const balance = raw.balance as Balance;
  const prog = raw.progression as { stages: ProgressionStage[]; goals: Goal[] };
  const props = (raw.props as { props: PropDef[] }).props;
  const items = raw.items as { tools: ToolDef[]; materials?: MaterialDef[] };
  const recipes = (raw.recipes as { recipes: RecipeDef[] }).recipes;
  const tilesDef = raw.tiles as TilesDef;

  const cropIds = new Set(crops.map((c) => c.id));
  const buildingIds = new Set(buildings.map((b) => b.id));
  const actorsRaw = (raw.actors ?? null) as { animals?: AnimalDef[]; pests?: AnimalDef[] } | null;
  const animalIds = new Set(
    [...(actorsRaw?.animals ?? []), ...(actorsRaw?.pests ?? [])].map((a) => a.id),
  );
  const known = new Set<string>([
    ...[...cropIds].map((id) => `seed:${id}`),
    ...buildingIds,
    // Vật nuôi mở khoá bằng tiền tố `animal:` — CỐ Ý không phải một trong 5 tiền
    // tố vật phẩm: con vật sống không bao giờ vào túi đồ, nên nó không cần và
    // không được có mặt trong hệ vật phẩm.
    ...[...animalIds].map((id) => `animal:${id}`),
  ]);

  for (const key of Object.keys(balance.startSeeds ?? {})) {
    if (!key.startsWith("seed:")) errors.push(`balance.startSeeds.${key}: khoá phải dạng 'seed:<id cây>'`);
    else if (!cropIds.has(key.slice(5)))
      errors.push(`balance.startSeeds.${key}: không có cây '${key.slice(5)}' trong crops.json`);
  }

  const unlockedAt = new Map<string, string>();
  for (const s of prog.stages)
    for (const u of s.unlocks) {
      if (!known.has(u))
        errors.push(
          `progression stage '${s.id}' mở khoá '${u}' — không khớp cây (seed:<id>) hay công trình nào`,
        );
      const prev = unlockedAt.get(u);
      if (prev !== undefined)
        errors.push(
          `progression: '${u}' được mở khoá ở cả hai mốc '${prev}' và '${s.id}' — chỉ được một`,
        );
      else unlockedAt.set(u, s.id);
    }

  // Cây không nằm trong mốc nào thì vĩnh viễn không mua được ở cửa hàng: nó tồn
  // tại trong content, tốn công vẽ, nhưng người chơi không bao giờ chạm tới.
  // Đây là lỗi im lặng đúng kiểu dễ lọt khi bộ cây trồng phình to, nên chặn hẳn.
  for (const id of cropIds)
    if (!unlockedAt.has(`seed:${id}`))
      errors.push(
        `crops.json: cây '${id}' không được mốc nào trong progression.json mở khoá — sẽ không bao giờ mua được`,
      );

  // require chỉ được dùng khoá mà progression.ts biết đọc
  const statKeys = new Set([
    "money", "day", "tilled", "planted", "watered", "harvested", "sold", "earned", "cured", "gathered",
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

  // ---- tham chiếu chéo cho địa hình / chế tạo ----
  const propIds = new Set(props.map((x) => x.id));
  const toolIds = new Set(items.tools.map((t) => t.id));
  const matIds = new Set((items.materials ?? []).map((m) => m.id));
  const buildingIdSet = buildingIds;

  /** Vật phẩm này có thật không (tool: / seed: / crop: / build: / item:). */
  const knownItem = (id: string): boolean => {
    const i = id.indexOf(":");
    if (i < 0) return false;
    const kind = id.slice(0, i);
    const ref = id.slice(i + 1);
    if (kind === "tool") return toolIds.has(ref);
    if (kind === "item") return matIds.has(ref);
    if (kind === "seed" || kind === "crop") return cropIds.has(ref);
    if (kind === "build") return buildingIdSet.has(ref);
    return false;
  };

  const maps = raw.maps as Record<string, MapData>;
  for (const pr of props) {
    if (pr.becomes && !propIds.has(pr.becomes))
      errors.push(`props '${pr.id}': becomes '${pr.becomes}' không tồn tại`);
    if (pr.grow && !propIds.has(pr.grow.to))
      errors.push(`props '${pr.id}': grow.to '${pr.grow.to}' không tồn tại`);
    if (pr.spread && !propIds.has(pr.spread.into))
      errors.push(`props '${pr.id}': spread.into '${pr.spread.into}' không tồn tại`);
    if (pr.stormFell && !propIds.has(pr.stormFell.to))
      errors.push(`props '${pr.id}': stormFell.to '${pr.stormFell.to}' không tồn tại`);
    for (const d of pr.drops ?? [])
      if (!knownItem(d.id)) errors.push(`props '${pr.id}': rơi ra '${d.id}' — không có vật phẩm này`);
    if (pr.portal) {
      // Bẫy kinh điển khi đẩy OTA đổi bản đồ mà quên chỉnh cửa: người chơi bước
      // vào cửa rồi rơi ra hư vô. Chặn ngay từ lúc kiểm pack.
      const { map, x, y } = pr.portal;
      const target = maps?.[map];
      if (!target) errors.push(`props '${pr.id}': cửa dẫn tới bản đồ '${map}' không tồn tại`);
      else if (!target.rows[y] || x < 0 || x >= target.w)
        errors.push(`props '${pr.id}': cửa dẫn ra ngoài bản đồ '${map}' (${x},${y})`);
    }
  }

  for (const id of tilesDef.indoorMaps ?? [])
    if (!maps?.[id]) errors.push(`tiles.indoorMaps: bản đồ '${id}' không tồn tại`);

  // ---- vật nuôi: mọi vật phẩm nhắc tới phải có thật ------------------------
  if (raw.actors !== undefined) {
    const ar = raw.actors as { animals?: AnimalDef[]; pests?: AnimalDef[] } | null;
    for (const a of [...(ar?.animals ?? []), ...(ar?.pests ?? [])]) {
      const check = (id: string | null | undefined, where: string) => {
        if (!id) return;
        if (!knownItem(id)) errors.push(`actors '${a.id}': ${where} trỏ vào '${id}' không tồn tại`);
      };
      check(a.feed, "feed");
      for (const p of a.products ?? []) check(p.id, `products '${p.id}'`);
      check(a.meat?.id, "meat");
      // Con vật KHÔNG sản phẩm mà cũng KHÔNG bán thịt được và cũng không có việc
      // gì làm thì nuôi để làm gì — gần như chắc chắn là sót lúc biên tập.
      if (!a.job && (a.products ?? []).length === 0 && !a.meat)
        errors.push(`actors '${a.id}': không có sản phẩm, không bán thịt được, cũng không có job`);
    }
  }

  // ---- mùa: tên mùa phải có thật, và không mùa nào được trống trơn ---------
  if (raw.seasons !== undefined) {
    const sr = raw.seasons as { seasons?: { id: string }[] } | null;
    const seasonIds = new Set((sr?.seasons ?? []).map((s) => s.id));
    const used = new Set<string>();
    for (const cr of crops) {
      for (const sid of cr.seasons ?? []) {
        if (!seasonIds.has(sid))
          errors.push(`crops '${cr.id}': mùa '${sid}' không có trong seasons.json`);
        used.add(sid);
      }
    }
    // Một mùa không cây nào gieo được là một khoảng chết dài mấy chục phút mà
    // người chơi không làm gì được — gần như chắc chắn là sót, không phải chủ ý.
    for (const sid of seasonIds)
      if (!used.has(sid)) errors.push(`seasons '${sid}': không có cây nào gieo được trong mùa này`);
  }

  const spawn = tilesDef.spawn;
  const spawnMap = maps?.[spawn.map];
  if (!spawnMap) errors.push(`tiles.spawn: bản đồ '${spawn.map}' không tồn tại`);
  else if (!spawnMap.rows[spawn.y] || spawn.x < 0 || spawn.x >= spawnMap.w)
    errors.push(`tiles.spawn: (${spawn.x},${spawn.y}) nằm ngoài bản đồ '${spawn.map}'`);

  // Mọi prop dùng trong legend phải có định nghĩa, không thì ô đó thành vô hình.
  for (const [ch, e] of Object.entries(tilesDef.legend)) {
    if (e.prop && !propIds.has(e.prop))
      errors.push(`tiles.legend '${ch}': prop '${e.prop}' không có trong props.json`);
    if (e.build && !buildingIdSet.has(e.build))
      errors.push(`tiles.legend '${ch}': build '${e.build}' không có trong buildings.json`);
  }

  /* ---- KHU CHUỒNG dựng sẵn --------------------------------------------
     Một khu sai là thứ không thấy được lúc nhìn bản đồ mà lại hỏng hẳn lối
     chơi: con vật không bao giờ về được chuồng của nó, hoặc cái máng đứng
     ngoài rào. Kiểm ở đây để pack sai không bao giờ tới tay người chơi. */
  const penIds = new Set<string>();
  for (const pen of tilesDef.pens ?? []) {
    penIds.add(pen.id);
    const pm = maps?.[pen.map];
    if (!pm) {
      errors.push(`tiles.pens '${pen.id}': bản đồ '${pen.map}' không tồn tại`);
      continue;
    }
    if (pen.x < 0 || pen.y < 0 || pen.x + pen.w > pm.w || pen.y + pen.h > pm.h) {
      errors.push(`tiles.pens '${pen.id}': ruột khu tràn ra ngoài bản đồ '${pen.map}'`);
      continue;
    }
    if (pen.feed && !knownItem(pen.feed))
      errors.push(`tiles.pens '${pen.id}': feed '${pen.feed}' không có vật phẩm này`);

    /* Ruột khu phải ĐI ĐƯỢC và phải chứa MÁNG nếu khu có `feed`. Ô đặc lọt vào
       ruột (một gốc cây quên dọn) thì tính diện tích nói dối; khu có `feed` mà
       không có máng thì đổ thức ăn vào đâu. */
    let troughs = 0;
    let sai = 0;
    for (let y = pen.y; y < pen.y + pen.h; y++)
      for (let x = pen.x; x < pen.x + pen.w; x++) {
        const e = tilesDef.legend[pm.rows[y]?.[x] ?? "."];
        const nuoc = e?.ground === "water";
        if (e?.prop === "trough") troughs++;
        else if (pen.swim ? !nuoc : nuoc || e?.build || (e?.prop && props.find((q) => q.id === e.prop)?.solid))
          sai++;
      }
    const solid = sai;
    if (pen.feed && troughs === 0)
      errors.push(`tiles.pens '${pen.id}': khu ăn '${pen.feed}' nhưng trong ruột không có máng nào`);
    if (!pen.feed && troughs > 0)
      errors.push(`tiles.pens '${pen.id}': có máng nhưng khu không khai 'feed' — máng đó đổ gì cũng không vào`);
    if (solid > 0)
      errors.push(
        pen.swim
          ? `tiles.pens '${pen.id}': ${solid} ô CẠN nằm trong ruột khu dưới nước — loài bơi không lên bờ được`
          : `tiles.pens '${pen.id}': ${solid} ô đặc nằm trong ruột khu — dọn hoặc thu nhỏ khu lại`,
      );
  }
  if (raw.actors !== undefined) {
    const ar2 = raw.actors as { animals?: AnimalDef[] } | null;
    for (const a of ar2?.animals ?? [])
      if (a.pen && !penIds.has(a.pen))
        errors.push(`actors '${a.id}': pen '${a.pen}' không có trong tiles.json:pens`);
  }

  for (const rc of recipes) {
    if (!knownItem(rc.out.id)) errors.push(`recipes '${rc.id}': làm ra '${rc.out.id}' không tồn tại`);
    for (const v of rc.in)
      if (!knownItem(v.id)) errors.push(`recipes '${rc.id}': cần '${v.id}' không tồn tại`);
  }

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

/** Giá trị mặc định cho các trường cân bằng được thêm sau. Nhờ chúng, một content
 *  pack cũ đã cache (tải về trước khi core nâng cấp) vẫn chạy được thay vì bị từ
 *  chối — người chơi không mất gì, chỉ là chưa có số liệu mới. */
/** Pack cũ đã cache chưa có mục `workers` — điền mặc định để nó vẫn nạp được. */
const WORKER_DEFAULTS = {
  hireFee: 900,
  wage: 220,
  wageEveryDays: 3,
  carryMax: 24,
  energyMax: 100,
  energyPerTask: 4,
  restBelow: 15,
  restMinutes: 90,
  speed: 62,
  box: { w: 10, h: 10 },
  skins: [{ shirt: "#4a7fb5", shirtDark: "#2f5a86", pants: "#3b4a5c", cap: "#d8622f", hair: "#3a2a1c" }],
};

const BALANCE_DEFAULTS = {
  moveSpeed: 78,
  runSpeed: 132,
  actionSeconds: 0.34,
  actionImpact: 0.5,
  // core 1.3 — thời tiết & bệnh
  diseaseChance: 0.02,
  diseaseNeighbourMul: 3,
  sickYieldMul: 0.5,
  noonDryMinutes: 780,
  // core 1.7 — luống bỏ không mấy đêm thì mọc cỏ lại
  tilledIdleDays: 3,
  // core 1.8 — máng ăn trong khu chuồng dựng sẵn
  troughMax: 12,
} as const;

/** Kiểm tra rồi chuẩn hoá thành `Content`. Ném ContentError nếu pack hỏng. */
export function buildContent(raw: RawPack): Content {
  const problems = validatePack(raw);
  if (problems.length) throw new ContentError(problems);

  const manifest = raw.manifest as { contentVersion: string; requiresCore: string };
  const cropList = (raw.crops as { crops: CropDef[] }).crops;
  const buildingList = (raw.buildings as { buildings: BuildingDef[] }).buildings;
  const itemsRaw = raw.items as { tools: ToolDef[]; materials?: MaterialDef[] };
  const toolList = itemsRaw.tools;
  const matList = itemsRaw.materials ?? [];
  const propList = (raw.props as { props: PropDef[] }).props;
  const recipeList = (raw.recipes as { recipes: RecipeDef[] }).recipes;
  const prog = raw.progression as { stages: ProgressionStage[]; goals: Goal[] };
  const weatherRaw = raw.weather as { weathers: WeatherDef[]; firstDay: string };
  const seasonRaw = (raw.seasons ?? null) as { daysPerSeason: number; seasons: SeasonDef[] } | null;
  const seasonList = seasonRaw?.seasons ?? [];
  // Vật nuôi và sâu bọ dùng CHUNG một bảng: cùng cấu trúc, cùng bộ máy di
  // chuyển, chỉ khác `job`. Tách hai bảng chỉ tổ phải tra hai chỗ.
  const actorPack = (raw.actors ?? null) as { animals?: AnimalDef[]; pests?: AnimalDef[] } | null;
  const animalList = [...(actorPack?.animals ?? []), ...(actorPack?.pests ?? [])];
  const vehicleList = (actorPack as { vehicles?: VehicleDef[] } | null)?.vehicles ?? [];

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
    props: byId(propList),
    propOrder: propList.map((p) => p.id),
    materials: byId(matList),
    materialOrder: matList.map((m) => m.id),
    recipes: recipeList,
    balance: { ...BALANCE_DEFAULTS, ...(raw.balance as Balance) } as Balance,
    tiles: raw.tiles as TilesDef,
    maps: raw.maps as Record<string, MapData>,
    mapOrder: Object.keys(raw.maps as Record<string, MapData>),
    stages: prog.stages,
    goals: prog.goals,
    strings: raw.strings as Strings,
    animals: byId(animalList),
    animalOrder: animalList.map((a) => a.id),
    workers: (actorPack as { workers?: WorkerContent } | null)?.workers ?? WORKER_DEFAULTS,
    vehicles: byId(vehicleList),
    vehicleOrder: vehicleList.map((v) => v.id),
    seasons: byId(seasonList),
    seasonOrder: seasonList.map((s) => s.id),
    daysPerSeason: Math.max(1, Math.floor(seasonRaw?.daysPerSeason ?? 1)),
    weathers: byId(weatherRaw.weathers),
    weatherOrder: weatherRaw.weathers.map((w) => w.id),
    weatherFirst: weatherRaw.firstDay,
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

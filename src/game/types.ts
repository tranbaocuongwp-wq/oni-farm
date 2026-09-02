/* ============================================================================
   HỢP ĐỒNG KIỂU — file quan trọng nhất của dự án.
   Cả hai làn (core/render và game/logic) đều nói chuyện qua đúng các kiểu ở đây.

   Hai quy tắc bất di bất dịch:

   1. `Content` là DỮ LIỆU THUẦN nạp từ content pack (làn nhanh, OTA được).
      Không bao giờ chứa hàm. Không bao giờ được import trực tiếp bởi src/game/ —
      nó luôn được TRUYỀN VÀO như tham số. Nhờ vậy test bơm được content giả và
      OTA tráo được content lúc chạy.

   2. `GameState` là JSON thuần, serialize được, tất định.
      Không Map, không Set, không class, không hàm, không tham chiếu DOM.
      Save game = đúng object này. Test = replay một chuỗi Action lên nó.
============================================================================ */

/* ---------------------------------------------------------------------------
   PHẦN A — CONTENT (làn nhanh: đẩy OTA, không build lại)
--------------------------------------------------------------------------- */

export interface CropArt {
  stem: string;
  leaf: string;
  leafDark: string;
  fruit: string;
  fruitDark: string;
  /** chiều cao thân lúc chín, tính bằng pixel trong ô 16x16 */
  height: number;
  leaves: number;
  spread: number;
  fruitCount: number;
  fruitSize: number;
}

export interface CropDef {
  id: string;
  name: string;
  seedName: string;
  seedPrice: number;
  sellPrice: number;
  /** Số ngày cho MỖI lần chuyển giai đoạn.
   *  Số giai đoạn hiển thị = growthDays.length + 1.
   *  Cây chín khi stage === growthDays.length. */
  growthDays: number[];
  /** Số ngày mọc lại sau khi thu hoạch; null = thu một lần rồi mất cây. */
  regrowDays: number | null;
  yieldMin: number;
  yieldMax: number;
  art: CropArt;
}

export interface BuildingEffects {
  /** Tưới mọi ô trong bán kính này mỗi sáng (khoảng cách Chebyshev; 0/undefined = không). */
  waterRadius?: number;
  /** Ô đặt công trình này luôn ẩm (sàn nhà kính). */
  autoWet?: boolean;
  /** Cộng tiền mỗi sáng. */
  income?: number;
  /** Tự thu hoạch cây chín trong bán kính này mỗi sáng. */
  harvestRadius?: number;
}

export interface BuildingDef {
  id: string;
  name: string;
  desc: string;
  price: number;
  /** 'floor' thay nền ô và đi lên được; 'object' là vật thể đứng trên ô. */
  kind: "floor" | "object";
  solid: boolean;
  effects: BuildingEffects;
  power: { produce: number; consume: number };
  art: { body: string; dark: string; accent: string };
}

export interface ToolDef {
  id: string;
  name: string;
  action: "TILL" | "WATER";
  energy: number;
}

export interface Balance {
  startMoney: number;
  startSeeds: Record<string, number>;
  energyMax: number;
  energyCost: {
    till: number;
    water: number;
    plant: number;
    harvest: number;
    build: number;
  };
  /** 360 = 6:00 sáng */
  dayStartMinutes: number;
  /** 1560 = 2:00 sáng hôm sau (26:00) */
  dayEndMinutes: number;
  realSecondsPerGameTenMinutes: number;
  /** tỉ lệ năng lượng hồi khi ngủ đúng giờ (1.0 = đầy) */
  sleepRestore: number;
  /** tỉ lệ hồi khi ngủ muộn */
  lateSleepPenalty: number;
  /** tỉ lệ hồi khi ngất */
  passOutEnergy: number;
  inventorySlots: number;
  hotbarSlots: number;
}

export type GroundKind = "grass" | "path" | "water";
export type InteractKind = "SLEEP" | "SHOP" | "SELL";

export interface TileLegendEntry {
  ground: GroundKind;
  prop?: string;
  decor?: string;
  solid?: boolean;
  interact?: InteractKind;
}

export interface TilesDef {
  legend: Record<string, TileLegendEntry>;
  spawn: { x: number; y: number };
}

/** Bản đồ đã biên dịch. `rows` là mảng chuỗi ký tự legend, mỗi chuỗi dài `w`. */
export interface MapData {
  w: number;
  h: number;
  rows: string[];
}

/** Điều kiện đọc từ GameState.stats + money/day. Khoá lồng dùng dấu chấm: "built.solar". */
export type Requirement = Record<string, number>;

export interface ProgressionStage {
  id: string;
  name: string;
  require: Requirement;
  unlocks: string[];
  toast?: string;
}

export interface Goal {
  id: string;
  text: string;
  require: Requirement;
}

export interface Strings {
  lang: string;
  ui: Record<string, string>;
  msg: Record<string, string>;
}

/** Content pack đã nạp + chuẩn hoá. Bất biến — không ai được sửa lúc chạy. */
export interface Content {
  contentVersion: string;
  requiresCore: string;
  crops: Record<string, CropDef>;
  /** thứ tự ổn định để hiển thị cửa hàng */
  cropOrder: string[];
  buildings: Record<string, BuildingDef>;
  buildingOrder: string[];
  tools: Record<string, ToolDef>;
  toolOrder: string[];
  balance: Balance;
  tiles: TilesDef;
  map: MapData;
  stages: ProgressionStage[];
  goals: Goal[];
  strings: Strings;
}

/* ---------------------------------------------------------------------------
   PHẦN B — VẬT PHẨM
   Id vật phẩm luôn có tiền tố, để một mảng slot duy nhất chứa được mọi thứ:
     tool:hoe · seed:lettuce · crop:tomato · build:sprinkler
--------------------------------------------------------------------------- */

export type ItemKind = "tool" | "seed" | "crop" | "build";

export interface ItemRef {
  kind: ItemKind;
  /** phần sau dấu hai chấm: 'hoe', 'lettuce', 'sprinkler' */
  ref: string;
}

/** null = ô trống trong túi đồ */
export type InvSlot = { id: string; n: number } | null;

/* ---------------------------------------------------------------------------
   PHẦN C — GAME STATE (JSON thuần, chính là nội dung file save)
--------------------------------------------------------------------------- */

export interface CropInstance {
  /** id cây trong content.crops */
  id: string;
  /** 0..growthDays.length; chín khi stage === growthDays.length */
  stage: number;
  /** số ngày đã tích trong giai đoạn hiện tại */
  days: number;
  /** đã từng thu hoạch ít nhất một lần (cây mọc lại) */
  regrown: boolean;
}

export interface Tile {
  /** nền gốc từ bản đồ */
  g: GroundKind;
  /** vật thể tĩnh từ bản đồ: tree/rock/bush/house/door/shop/counter — null nếu trống */
  prop: string | null;
  decor: string | null;
  tilled: boolean;
  wet: boolean;
  crop: CropInstance | null;
  /** id công trình người chơi đã đặt, null nếu chưa có */
  b: string | null;
}

export type Dir = "down" | "up" | "left" | "right";

export interface PlayerState {
  /** toạ độ PIXEL trong thế giới (float), không phải toạ độ ô */
  x: number;
  y: number;
  dir: Dir;
  moving: boolean;
  /** đồng hồ animation, giây */
  anim: number;
}

export interface Stats {
  tilled: number;
  planted: number;
  watered: number;
  harvested: number;
  sold: number;
  earned: number;
  /** số công trình đã xây theo id: built.solar, built.sprinkler... */
  built: Record<string, number>;
}

/** Thông điệp cho UI. Reducer đẩy vào đây; UI đọc rồi xoá. */
export interface LogEntry {
  id: number;
  text: string;
  kind: "info" | "good" | "bad";
}

export interface GameState {
  /** phiên bản ĐỊNH DẠNG SAVE — tăng khi đổi cấu trúc, cần migration ở core */
  save: number;
  coreVersion: string;
  contentVersion: string;
  /** seed PRNG — giữ trong state để mọi thứ ngẫu nhiên đều tái lập được */
  seed: number;

  day: number;
  /** phút trong ngày; balance.dayStartMinutes .. dayEndMinutes */
  minutes: number;
  money: number;
  energy: number;

  player: PlayerState;

  w: number;
  h: number;
  /** mảng phẳng dài w*h, chỉ số = y*w + x */
  tiles: Tile[];

  inv: InvSlot[];
  /** chỉ số slot đang chọn trong hotbar */
  sel: number;

  /** id đã mở khoá: 'seed:tomato', 'sprinkler'... — chặn hàng trong cửa hàng */
  unlocked: string[];
  stagesDone: string[];
  goalsDone: string[];
  stats: Stats;

  log: LogEntry[];
  /** bộ đếm tăng dần để sinh LogEntry.id */
  logSeq: number;

  /** true trong lúc chuyển ngày — UI vẽ màn hình mờ dần */
  sleeping: boolean;
}

/* ---------------------------------------------------------------------------
   PHẦN D — ACTION
   MỌI thay đổi state phải đi qua đây. UI/render KHÔNG được sửa state trực tiếp.
--------------------------------------------------------------------------- */

export type Action =
  /** di chuyển: dx,dy là vector đơn vị đã chuẩn hoá; dt tính bằng giây */
  | { t: "MOVE"; dx: number; dy: number; dt: number }
  /** trôi thời gian: đồng hồ, animation, ngất khi quá giờ */
  | { t: "TICK"; dt: number }
  /** dùng vật phẩm đang chọn lên ô (x,y).
   *  Luật ưu tiên: ô có cây CHÍN thì luôn thu hoạch trước, bất kể đang cầm gì. */
  | { t: "USE"; x: number; y: number }
  /** tương tác vật thể: cửa nhà = ngủ, máy bán hạt = shop, quầy = bán */
  | { t: "INTERACT"; x: number; y: number }
  | { t: "SELECT"; slot: number }
  | { t: "BUY"; id: string; n: number }
  | { t: "SELL"; id: string; n: number }
  | { t: "SELL_ALL" }
  | { t: "SLEEP" }
  /** UI đã hiển thị xong các toast có id <= tới */
  | { t: "LOG_SEEN"; upTo: number };

/* ---------------------------------------------------------------------------
   PHẦN E — SAVE
--------------------------------------------------------------------------- */

export interface SaveData {
  /** để nhận diện file khi người chơi nhập nhầm file khác */
  magic: "oni-farm";
  savedAt: number;
  state: GameState;
}

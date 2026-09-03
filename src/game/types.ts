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

export type ToolAction = "TILL" | "WATER" | "CHOP" | "MINE";

export interface ToolDef {
  id: string;
  name: string;
  action: ToolAction;
  /** Số nhát ăn được mỗi lần vung (rìu thép bổ 2). Mặc định 1. */
  power?: number;
  /** Sức chứa bình tưới, chỉ có nghĩa với action WATER. */
  capacity?: number;
}

/** Vật liệu thô: gỗ, đá, sợi. Mang tiền tố `item:` trong túi đồ. */
export interface MaterialDef {
  id: string;
  name: string;
  sellPrice: number;
}

export interface RecipeInput {
  id: string;
  n: number;
}

export interface RecipeDef {
  id: string;
  name: string;
  desc?: string;
  out: RecipeInput;
  /** Nguyên liệu — có thể là vật liệu, CÔNG CỤ (nâng cấp ăn cả cái cũ), hay gì tuỳ. */
  in: RecipeInput[];
}

/**
 * Vật thể đứng trên ô: cây, đá, giếng, giường, cửa…
 *
 * Gom hết tính chất về một chỗ (trước đây rải trong legend + code) nên thêm một
 * loại địa hình mới chỉ là thêm một object trong props.json.
 */
export interface PropDef {
  id: string;
  name: string;
  solid: boolean;
  /** Cao 2 ô (cây lớn) — renderer vẽ tràn lên ô phía trên. */
  tall?: boolean;
  /** Số nhát chịu được. Không có = không khai thác được. */
  hits?: number;
  /** Công cụ cần dùng. Không có = tay không cũng phá được (bụi cỏ). */
  tool?: ToolAction;
  /** Phá xong để lại vật thể gì (cây lớn để lại gốc). */
  becomes?: string;
  drops?: { id: string; min: number; max: number }[];
  interact?: InteractKind;
  /** Cửa dịch chuyển: toạ độ Ô người chơi sẽ hiện ra. */
  portal?: { x: number; y: number };
  art?: { body: string; dark: string; accent: string };
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
    chop: number;
    mine: number;
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

  /** Tốc độ đi bộ, world px mỗi giây (1 ô = 16 px). */
  moveSpeed: number;
  /** Tốc độ chạy — giữ Shift, hoặc đẩy joystick hết cỡ. */
  runSpeed: number;
  /** Thời gian KHOÁ sau mỗi thao tác. Đây là thứ bắt việc diễn ra TUẦN TỰ:
   *  đang vung cuốc thì chưa gieo hạt được, và bấm loạn cũng không nhanh hơn. */
  actionSeconds: number;

  /** Bao nhiêu PHÚT GAME được tưới ẩm thì cây qua trọn một "ngày lớn".
   *  Đây là thứ biến `crop.growthDays` thành tăng trưởng liên tục theo thời gian
   *  thay vì nhảy cóc mỗi lần ngủ. */
  growthMinutesPerDay: number;
  /** Sau giờ này thì trời tối, cây ngừng lớn. */
  daylightEndMinutes: number;
  /** Xác suất mỗi đêm một ô cỏ trống mọc thêm cỏ dại từ ô cỏ dại kề bên. */
  grassSpreadChance: number;
  /** Xác suất mỗi đêm một ô đã cày mà bỏ không sẽ trở lại thành cỏ. */
  tilledDecayChance: number;
  /** Lượng nước có sẵn trong bình lúc bắt đầu. */
  startWater: number;
}

export type GroundKind = "grass" | "path" | "water" | "wood" | "void";
export type InteractKind = "SLEEP" | "SHOP" | "SELL" | "REFILL" | "CRAFT" | "PORTAL";

export interface TileLegendEntry {
  ground: GroundKind;
  prop?: string;
  decor?: string;
}

/** Tính chất của NỀN (nước đi không qua và múc được nước, void là mép bản đồ). */
export interface GroundDef {
  solid?: boolean;
  interact?: InteractKind;
}

export interface TilesDef {
  grounds: Record<string, GroundDef>;
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
  props: Record<string, PropDef>;
  propOrder: string[];
  materials: Record<string, MaterialDef>;
  materialOrder: string[];
  recipes: RecipeDef[];
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

export type ItemKind = "tool" | "seed" | "crop" | "build" | "item";

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
  /** Số PHÚT GAME đã tích trong giai đoạn hiện tại (chỉ tích khi ô ẩm và trời
   *  còn sáng). Đủ `growthDays[stage] * growthMinutesPerDay` thì sang giai đoạn
   *  sau — nhờ vậy cây lớn dần trông thấy trong ngày, không nhảy cóc lúc ngủ. */
  grow: number;
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
  /** Số nhát còn chịu được của `prop`. 0 = vật thể không khai thác được. */
  hp: number;
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

  /** Số giây còn lại của thao tác đang làm. > 0 nghĩa là đang bận: không thao
   *  tác tiếp và không di chuyển được. Đây là cơ chế bắt buộc làm việc tuần tự. */
  busy: number;

  /** Nước còn trong bình tưới. Hết thì phải ra giếng hoặc bờ ao múc. */
  water: number;
}

/* ---------------------------------------------------------------------------
   PHẦN D — ACTION
   MỌI thay đổi state phải đi qua đây. UI/render KHÔNG được sửa state trực tiếp.
--------------------------------------------------------------------------- */

export type Action =
  /** Di chuyển. dx,dy là vector hướng; ĐỘ DÀI có ý nghĩa (0..1) để joystick
   *  đẩy nhẹ thì đi chậm. run = chạy (Shift, hoặc joystick đẩy hết cỡ). */
  | { t: "MOVE"; dx: number; dy: number; dt: number; run?: boolean }
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
  /** Chế tạo theo công thức (phải đứng cạnh bàn chế tạo). */
  | { t: "CRAFT"; id: string }
  /** Múc đầy bình tưới ở giếng hoặc bờ nước. */
  | { t: "REFILL" }
  /** Dùng cửa dịch chuyển ở ô (x,y) — reducer tự tra đích trong props.json,
   *  nên không ai dịch chuyển bừa tới toạ độ tuỳ ý được. */
  | { t: "PORTAL"; x: number; y: number }
  /** Chỉ dùng từ bảng gỡ lỗi. Giữ trong reducer để mọi thay đổi state vẫn đi
   *  qua đúng một cửa, thay vì cho UI thò tay vào sửa thẳng. */
  | { t: "DEBUG"; op: DebugOp; n?: number }
  /** UI đã hiển thị xong các toast có id <= tới */
  | { t: "LOG_SEEN"; upTo: number };

export type DebugOp =
  | "money"
  | "energy"
  | "water"
  | "skipDay"
  | "growAll"
  | "plantAround"
  | "addGrass"
  | "addTrees"
  | "unlockAll"
  | "materials";

/* ---------------------------------------------------------------------------
   PHẦN E — SAVE
--------------------------------------------------------------------------- */

export interface SaveData {
  /** để nhận diện file khi người chơi nhập nhầm file khác */
  magic: "oni-farm";
  savedAt: number;
  state: GameState;
}

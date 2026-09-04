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

/**
 * DÁNG cây — quyết định `src/art/atlas.ts` vẽ theo kiểu nào.
 *
 * Thêm dáng mới là việc của core (phải sửa atlas), nhưng CHỌN dáng cho một cây
 * là việc của content — nên trường này nằm trong crops.json và đẩy OTA được.
 * Thiếu trường = "leafy", đúng cách vẽ cũ, nên content pack cũ không đổi hình.
 */
export type CropForm =
  /** thân đứng có lá hai bên, quả treo quanh thân (xà lách, cà chua) */
  | "leafy"
  /** củ vùi dưới đất, chín thì nhô vai củ lên (cà rốt, khoai) */
  | "root"
  /** dây bò sát đất, quả to nằm trên mặt đất (dưa hấu, bí) */
  | "vine"
  /** thân cao một cọng, bắp/quả bám dọc thân (ngô, mía) */
  | "stalk"
  /** bụi tròn thấp, quả nhỏ rải khắp tán (dâu tây, đậu) */
  | "bush"
  /** nhiều cọng mảnh, bông trĩu đầu ngọn (lúa, lúa mì) */
  | "grain"
  /** một bông to trên đỉnh thân (hướng dương, cúc) */
  | "flower";

export interface CropArt {
  /** Dáng cây; thiếu thì coi như "leafy". */
  form?: CropForm;
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
  /**
   * Các mùa gieo được. Rỗng = quanh năm.
   *
   * Đây là thứ làm cho một danh sách 61 loại cây có nghĩa: không có mùa thì
   * người chơi chỉ việc chọn cây lãi nhất rồi bỏ qua 58 loại còn lại; có mùa
   * thì mỗi mùa là một bộ bài riêng và phải tính trước.
   */
  seasons: string[];
  art: CropArt;
}

/** Một mùa. `weather` ghi đè trọng số trong weather.json cho riêng mùa này —
 *  đó là chỗ mùa được CẢM THẤY chứ không chỉ đọc trên HUD. */
export interface SeasonDef {
  id: string;
  name: string;
  /** hệ số lớn của cây trong mùa này (đông chậm hơn) */
  growMul: number;
  /** trọng số thời tiết riêng của mùa; thiếu kiểu nào thì kiểu đó dùng weight gốc */
  weather: Record<string, number>;
  /** lớp màu phủ toàn màn — chỗ mùa được NHÌN THẤY chứ không chỉ đọc trên HUD.
   *  `desat` rút bớt bão hoà màu (0..1): phủ thêm màu lên pixel art chỉ làm nó
   *  đục, còn rút màu đi thì cả khung hình bạc đi đúng kiểu mùa lạnh. */
  tint?: { color: string; alpha: number; desat?: number };
}

export interface BuildingEffects {
  /** Tưới mọi ô trong bán kính này mỗi sáng (khoảng cách Chebyshev; 0/undefined = không). */
  waterRadius?: number;
  /** Ô đặt công trình này luôn ẩm (sàn nhà kính). */
  autoWet?: boolean;
  /** Ô này miễn nhiễm mùa: gieo được quanh năm và cây không héo lúc sang mùa. */
  allSeason?: boolean;
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
  /** Cửa dịch chuyển: BẢN ĐỒ và toạ độ Ô người chơi sẽ hiện ra. */
  portal?: { map: string; x: number; y: number };
  /**
   * Vật thể LỚN theo ngày: sau `days` ngày (nhân với `growMul` của thời tiết)
   * thì biến thành `to`. Cây con → cây lớn, cỏ non → cỏ dày, bụi nhỏ → bụi lớn.
   * Tiến độ nằm ở `Tile.age`.
   */
  grow?: { to: string; days: number };
  /** Mỗi đêm có `chance` (× growMul) mọc thêm một `into` lên ô cỏ trống kề bên. */
  spread?: { chance: number; into: string };
  /** Đêm bão có `chance` bị quật thành `to` (cây con → khúc gỗ). */
  stormFell?: { to: string; chance: number };
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
    /** xịt thuốc cho cây bệnh (core 1.3) */
    cure?: number;
    /** nhổ cây bệnh (core 1.3) */
    pull?: number;
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
  /** Tỉ lệ 0..1 của `actionSeconds` trôi qua thì thao tác MỚI CÓ HIỆU LỰC
   *  (khoảnh khắc cuốc chạm đất). Trước đó là diễn hoạt vung tay — nhìn thấy
   *  giơ cuốc lên rồi mới thấy đất lật, chứ không phải đất đổi ngay lúc bấm. */
  actionImpact: number;

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

  /* ---- thời tiết & bệnh (core 1.3; thiếu thì loader điền mặc định) ---- */
  /** Xác suất mỗi đêm một cây đang lớn nhiễm bệnh (trước khi nhân với thời tiết). */
  diseaseChance?: number;
  /** Nhân xác suất khi có cây bệnh kề bên. */
  diseaseNeighbourMul?: number;
  /** Cây bệnh thu hoạch được bao nhiêu phần sản lượng (0..1). */
  sickYieldMul?: number;
  /** Ngày nắng gắt: qua mốc phút này thì ô ẩm không tự tưới bị khô. */
  noonDryMinutes?: number;
}

export type GroundKind = "grass" | "path" | "water" | "wood";
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
  /** Bản đồ và ô bắt đầu ván mới. */
  spawn: { map: string; x: number; y: number };
  /** Bản đồ TRONG NHÀ: mưa không tưới, bão không quật. Thiếu = mọi bản đồ ngoài trời. */
  indoorMaps?: string[];
}

/**
 * Một KIỂU thời tiết. Mỗi ngày đúng một kiểu, chọn theo `weight` từ seed.
 * Mọi con số là HỆ SỐ nhân lên luật sẵn có, nên thêm kiểu mới không cần sửa core.
 */
export interface WeatherDef {
  id: string;
  name: string;
  /** trọng số rút thăm; 0 = không bao giờ tự xuất hiện (chỉ do streak/debug) */
  weight: number;
  /** trời ướt: sáng ra mọi ô đã cày ngoài trời đều ẩm, và không khô đi trong đêm */
  wet: boolean;
  /** nhân tốc độ lớn của cây trồng, cỏ, bụi, cây con (1 = bình thường) */
  growMul: number;
  /** 0..1 — gió, chỉ dùng để vẽ cây lay */
  wind: number;
  /** nắng gắt: quá `noonDryMinutes` thì ô ẩm khô, cây chưa tưới trông héo */
  hot?: boolean;
  /** nhân xác suất nhiễm bệnh */
  diseaseMul?: number;
  /** mưa dầm: hôm sau có `chance` vẫn mưa, tối đa `max` ngày liên tiếp */
  streak?: { max: number; chance: number };
  /** bão: mỗi cây có `cropChance` bị hại; vật thể có `stormFell` bị quật với chance riêng */
  storm?: { cropChance: number };
  /** sương sớm: phủ mờ tới phút này */
  fogUntil?: number;
}

/** Thời tiết trong state: hôm nay, dự báo ngày mai, và chuỗi ngày ướt liên tiếp. */
export interface WeatherState {
  today: string;
  tomorrow: string;
  /** số ngày ướt liên tiếp tính cả hôm nay */
  wetStreak: number;
  /** ngày đã làm "khô trưa" rồi (để TICK không làm lại mỗi khung) */
  driedDay: number;
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
  /**
   * Nhiều bản đồ RỜI NHAU, mỗi cái một lưới riêng.
   *
   * Trước đây phòng ngủ bị nhét vào một góc của lưới nông trại, độn thêm 288 ô
   * "hư vô" chỉ để ngăn cách — số ô đó vẫn phải nạp, vẫn phải quét mỗi lần sang
   * ngày, vẫn hiện trên bản đồ nhỏ. Tách ra thì mỗi lúc chỉ có ĐÚNG một bản đồ
   * ở trạng thái hoạt động, và không ô nào tồn tại mà không tới được.
   */
  maps: Record<string, MapData>;
  mapOrder: string[];
  stages: ProgressionStage[];
  goals: Goal[];
  strings: Strings;
  seasons: Record<string, SeasonDef>;
  /** thứ tự các mùa trong năm — chính là vòng quay */
  seasonOrder: string[];
  /** số ngày mỗi mùa */
  daysPerSeason: number;
  weathers: Record<string, WeatherDef>;
  weatherOrder: string[];
  /** kiểu thời tiết ngày đầu tiên */
  weatherFirst: string;
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
  /** Đang bệnh: không lớn, thu hoạch giảm. Vắng = khoẻ (save không phình). */
  sick?: true;
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
  /** Số "ngày lớn" vật thể đã tích (prop có `grow`). Vắng = 0. */
  age?: number;
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
  /** số cây bệnh đã chữa (core 1.3) */
  cured: number;
}

/** Thông điệp cho UI. Reducer đẩy vào đây; UI đọc rồi xoá. */
export interface LogEntry {
  id: number;
  text: string;
  kind: "info" | "good" | "bad";
}

/** Một bản đồ đang được cất giữ (không phải bản đồ đang chơi). */
export interface StoredMap {
  w: number;
  h: number;
  tiles: Tile[];
  /**
   * Phút game lúc bản đồ này bị CẤT đi (lúc người chơi bước ra khỏi nó).
   *
   * TICK chỉ nuôi cây trên bản đồ ĐANG chơi — quét cả thế giới mỗi khung hình
   * là thứ ta cố tình tránh. Nhưng bỏ hẳn thì đứng trong nhà giữa ban ngày sẽ
   * làm ruộng ngoài kia đứng hình, mà người chơi không thể nào đoán ra. Con số
   * này là lời giải: nó cho phép cộng BÙ đúng bằng khoảng thời gian vắng mặt,
   * một lần duy nhất lúc quay lại (hoặc lúc sang ngày mới), thay vì cộng dần.
   */
  awayAt: number;
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

  /** Bản đồ ĐANG chơi. */
  mapId: string;

  w: number;
  h: number;
  /** Ô của bản đồ ĐANG chơi — mảng phẳng dài w*h, chỉ số = y*w + x */
  tiles: Tile[];

  /**
   * Các bản đồ KHÁC, đã cất đi.
   *
   * Bản đồ đang chơi cố ý nằm ở `tiles/w/h` chứ không nằm trong đây: nhờ vậy
   * mọi thứ đọc `state.tiles` (render, va chạm, tìm đường) không phải biết gì
   * về chuyện có nhiều bản đồ, và chỉ có một lưới duy nhất được duyệt mỗi
   * khung hình. Bất biến: `mapId` KHÔNG BAO GIỜ có mặt trong `maps`.
   */
  maps: Record<string, StoredMap>;

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
  /** Ô mà thao tác đang vung tới, CHƯA có hiệu lực. TICK áp dụng nó khi `busy`
   *  trôi qua mốc `actionImpact`, rồi xoá. null = không có thao tác chờ.
   *  Bất biến: pending ≠ null ⇒ busy > 0. */
  pending: { x: number; y: number } | null;

  /** Nước còn trong bình tưới. Hết thì phải ra giếng hoặc bờ ao múc. */
  water: number;

  /** Thời tiết hôm nay + dự báo (core 1.3). */
  weather: WeatherState;
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
  /** Đổi chỗ hai ô túi đồ (kéo từ balo ra hotbar và ngược lại). Cùng id thì
   *  gộp stack vào ô đích. */
  | { t: "SWAP"; a: number; b: number }
  | { t: "BUY"; id: string; n: number }
  | { t: "SELL"; id: string; n: number }
  | { t: "SELL_ALL" }
  | { t: "SLEEP" }
  /** Chế tạo theo công thức (phải đứng cạnh bàn chế tạo). */
  | { t: "CRAFT"; id: string }
  /** Múc đầy bình tưới ở giếng hoặc bờ nước. */
  | { t: "REFILL" }
  /** Dùng cửa dịch chuyển ở ô (x,y) của bản đồ hiện tại — reducer tự tra đích
   *  (kể cả bản đồ đích) trong props.json, nên không ai nhảy bừa sang bản đồ
   *  hay toạ độ tuỳ ý được. */
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
  | "materials"
  | "harvestAll"
  /** đổi thời tiết hôm nay sang kiểu kế tiếp trong content (n = chỉ số cụ thể) */
  | "weather"
  /** làm mọi cây đang lớn quanh nhân vật nhiễm bệnh */
  | "sickAround";

/* ---------------------------------------------------------------------------
   PHẦN E — SAVE
--------------------------------------------------------------------------- */

export interface SaveData {
  /** để nhận diện file khi người chơi nhập nhầm file khác */
  magic: "oni-farm";
  savedAt: number;
  state: GameState;
}

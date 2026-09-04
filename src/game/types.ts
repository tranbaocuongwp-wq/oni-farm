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
  /** BẮP tròn ôm sát đất (xà lách, cải thìa, su hào) */
  | "head"
  /** búi lá MẢNH dựng đứng, ăn lá không ăn quả (hành, hẹ, sả, húng) */
  | "herb"
  /** củ tròn nổi trên mặt đất, ngọn mảnh (hành tây, tỏi) */
  | "bulb"
  /** quả TO nằm trên đất, dây lá bò quanh (dưa hấu, bí đỏ) */
  | "melon"
  /** thân đứng có lá hai bên, quả treo quanh thân (cà chua) */
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

/* ---------------------------------------------------------------------------
   THỰC THỂ — vật nuôi, sâu bọ, (sau này) người làm thuê và xe.

   Tất cả đều là actor TỰ DI CHUYỂN, khác hẳn mọi thứ trước đó vốn gắn chặt vào
   một ô lưới. Định nghĩa loài nằm ở content nên thêm loài mới là thêm JSON.
--------------------------------------------------------------------------- */

/** Dáng vẽ — chia theo BÓNG DÁNG chứ không theo loài, để 4 dáng phủ được 8+ loài. */
export type AnimalForm = "quadruped" | "bird" | "fish" | "critter";

/** Ở đâu: trong hàng rào, thả rông, hay dưới nước. */
export type Housing = "pen" | "free" | "water";

export interface AnimalArt {
  form: AnimalForm;
  body: string;
  bodyDark: string;
  belly: string;
  /** mỏ / sừng / mào / mũi */
  accent: string;
  /** rộng × cao của thân, px trong ô 16×16 */
  w: number;
  h: number;
  /** 0..1 — độ xù lông (cừu = 1) */
  fluff?: number;
  /** 0..1 — mật độ đốm (bò sữa) */
  patch?: number;
  /** 0..3 — sừng */
  horn?: number;
}

/** Sản phẩm thu LẶP LẠI (sữa, trứng, lông). */
export interface AnimalProduct {
  /** id vật phẩm, dạng `item:` */
  id: string;
  /** cứ bao nhiêu NGÀY thì tới lứa */
  every: number;
  min: number;
  max: number;
}

export interface AnimalDef {
  id: string;
  name: string;
  price: number;
  housing: Housing;
  /** vật phẩm dùng làm thức ăn; null = tự đi kiếm cỏ quanh sân */
  feed: string | null;
  /** một lần ăn no được bao nhiêu PHÚT GAME */
  fedMinutes: number;
  /** bao nhiêu ngày thì trưởng thành (mới cho sản phẩm, mới bán thịt được) */
  matureDays: number;
  /** đói liên tiếp quá ngần này NGÀY thì chết */
  starveDays: number;
  /** thu lặp lại */
  products: AnimalProduct[];
  /** thu MỘT LẦN khi bán thịt; null = không bán thịt được (chó) */
  meat: { id: string; min: number; max: number } | null;
  /** "patrol" = đi tuần bắt sâu bọ; "pest" = phá hoại mùa màng */
  job?: "patrol" | "pest";
  /** world px mỗi giây */
  speed: number;
  box: { w: number; h: number };
  art: AnimalArt;
}

/** Một loại xe. Xe giao hàng và xe thu mua dùng chung bộ máy, khác `role`. */
export interface VehicleDef {
  id: string;
  name: string;
  price: number;
  /** chở được bao nhiêu món */
  capacity: number;
  speed: number;
  box: { w: number; h: number };
  /** xe thu mua trả cao hơn quầy bao nhiêu phần (0,15 = +15%) */
  buyBonus?: number;
  art: { body: string; dark: string; glass: string; accent: string };
}

/** Bảng màu một bộ đồ — người làm thuê dùng lại nguyên bộ khung của nhân vật
 *  chính, chỉ đổi màu. Cùng 28 khung vung công cụ, không vẽ thêm gì. */
export interface CharSkin {
  shirt: string;
  shirtDark: string;
  pants: string;
  cap: string;
  hair: string;
}

/** Cấu hình chung cho người làm thuê. Toàn số nên chỉnh nhịp qua OTA được. */
export interface WorkerContent {
  /** trả một lần khi thuê */
  hireFee: number;
  /** lương mỗi kỳ */
  wage: number;
  /** bao nhiêu NGÀY trả lương một lần */
  wageEveryDays: number;
  /** đeo được bao nhiêu món trước khi phải về kho */
  carryMax: number;
  energyMax: number;
  /** tiêu bao nhiêu năng lượng cho mỗi việc làm xong */
  energyPerTask: number;
  /** dưới ngưỡng này thì đi nghỉ */
  restBelow: number;
  /** nghỉ bao nhiêu phút game */
  restMinutes: number;
  speed: number;
  box: { w: number; h: number };
  skins: CharSkin[];
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
  /** Nhân tốc độ đi khi đứng trên công trình này (đường nhựa > 1). Cùng ý nghĩa
   *  với `GroundDef.speedMul`; ô có cả hai thì lấy cái LỚN HƠN. */
  speedMul?: number;
  /** Cộng tiền mỗi sáng. */
  income?: number;
  /** Tự thu hoạch cây chín trong bán kính này mỗi sáng. */
  harvestRadius?: number;
}

/** Kiểu tự nối hình theo hàng xóm cùng loại. */
export type AutotileKind = "fence";

export interface BuildingDef {
  id: string;
  name: string;
  desc: string;
  price: number;
  /** 'floor' thay nền ô và đi lên được; 'object' là vật thể đứng trên ô. */
  kind: "floor" | "object";
  solid: boolean;
  /** Tự nối hình theo hàng xóm cùng loại (hàng rào). Vắng = một sprite cố định. */
  autotile?: AutotileKind;
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
  /** Số ô của KHO TẬP TRUNG. Thiếu = 60. */
  storeSlots?: number;
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
  /**
   * Bỏ không bao nhiêu ĐÊM thì luống đã cày mọc cỏ trở lại.
   *
   * Đếm ngược chứ không phải xác suất mỗi đêm: xác suất thì người chơi không
   * bao giờ học được luật — có luống mất sau một đêm, có luống trụ mười đêm, và
   * cả hai đều trông như ngẫu nhiên vô cớ. Đếm ngược thì "bỏ ba ngày là mất
   * luống" là một câu nói được, nhớ được, và tính trước được.
   */
  tilledIdleDays: number;
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

export type GroundKind = "grass" | "path" | "water" | "wood" | "asphalt";
export type InteractKind = "SLEEP" | "SHOP" | "SELL" | "REFILL" | "CRAFT" | "PORTAL" | "STORE";

export interface TileLegendEntry {
  ground: GroundKind;
  prop?: string;
  decor?: string;
}

/** Tính chất của NỀN (nước đi không qua và múc được nước, void là mép bản đồ). */
export interface GroundDef {
  solid?: boolean;
  interact?: InteractKind;
  /**
   * Nhân tốc độ đi khi đứng trên nền này (đường nhựa > 1).
   *
   * Cũng là thứ làm A* TỰ ĐỘNG vòng qua đường mà không cần một luật "ưu tiên
   * đường" riêng: chi phí mỗi bước được CHIA cho con số này, nên đi đường rẻ
   * hơn đi cỏ. Thêm luật riêng sẽ đá nhau với heuristic và làm hỏng tính tối ưu.
   */
  speedMul?: number;
}

export interface TilesDef {
  grounds: Record<string, GroundDef>;
  legend: Record<string, TileLegendEntry>;
  /** Bản đồ và ô bắt đầu ván mới. */
  spawn: { map: string; x: number; y: number };
  /** CỔNG: ô ở mép bản đồ mà xe từ ngoài đi vào. Thiếu thì không có xe nào. */
  gate?: { map: string; x: number; y: number };
  /**
   * BÃI ĐẬU trước kho — chỗ xe thu mua dừng lại.
   *
   * Danh sách ô CỐ ĐỊNH, khai trong content chứ không tính lúc chạy: người chơi
   * nhìn mặt đường là biết xe sẽ đậu đâu, và xe tới sau khi bãi đầy thì đứng
   * chờ ngoài đường thay vì chen vào.
   */
  parking?: { map: string; spots: { x: number; y: number }[] };
  /**
   * ĐIỂM GIAO HÀNG — chỗ vật nuôi và (sau này) xe được thả xuống.
   *
   * CỐ ĐỊNH và nằm cạnh quầy bán, đúng như Cường yêu cầu: người chơi luôn biết
   * ra đâu mà đón, và không phải đi tìm con bò vừa mua ở một góc bản đồ nào đó.
   * Thiếu thì rơi về ô spawn.
   */
  dropoff?: { map: string; x: number; y: number };
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
  animals: Record<string, AnimalDef>;
  animalOrder: string[];
  workers: WorkerContent;
  vehicles: Record<string, VehicleDef>;
  vehicleOrder: string[];
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
  /** Số đêm liên tiếp ô ĐÃ CÀY này bị bỏ không (không cây, không công trình).
   *  Đủ `balance.tilledIdleDays` thì cỏ mọc lại và luống mất. Vắng = 0. */
  idle?: number;
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
  /** số sản phẩm vật nuôi đã thu — sữa, trứng, lông (core 1.6) */
  gathered: number;
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

export type EntityKind = "animal" | "pest" | "worker" | "vehicle";

/** Máy trạng thái của một actor. Nằm TRONG save: tải lại mà con vật quên mình
 *  đang đi đâu là một lỗi thấy được. */
export interface AiState {
  /** giai đoạn hành vi: idle | wander | seekFood | eat | flee | patrol */
  phase: string;
  /** phút game còn lại của giai đoạn này */
  until: number;
  /** ô đích; -1 = chưa có */
  tx: number;
  ty: number;
  /** đường đi còn lại, MẢNG CHỈ SỐ Ô (JSON thuần, gọn) */
  path: number[];
  /** phút game của lần tính đường gần nhất — để nguội replan */
  planAt: number;
}

export interface AnimalState {
  /** ngày tuổi */
  age: number;
  /** còn NO bao nhiêu phút game; 0 = đói */
  fed: number;
  /** đói liên tiếp bao nhiêu ngày */
  hungryDays: number;
  /** đồng hồ tới lứa cho từng `products[i]`, tính bằng PHÚT GAME */
  prod: number[];
}

/** Việc được giao cho một người làm. */
export type WorkerJob = "crops" | "livestock";

export interface WorkerState {
  name: string;
  /** chỉ số bộ đồ trong `content.workers.skins` */
  skin: number;
  job: WorkerJob;
  energy: number;
  /** ngày cuối cùng đã trả lương */
  paidDay: number;
  /** hàng đang đeo; đầy thì phải về kho đổ */
  carry: InvSlot[];
}

/** Việc của một chiếc xe. */
export type VehicleRole = "delivery" | "buyer";

export interface VehicleState {
  role: VehicleRole;
  /** hàng đang chở */
  cargo: InvSlot[];
  /**
   * Việc phải làm khi tới nơi:
   *   · `drop` — thả con vật này xuống (xe giao hàng)
   *   · `buy`  — mua sạch nông sản trong kho (xe thu mua)
   */
  errand: { kind: "drop"; animal: string } | { kind: "buy" } | null;
  /** phút game còn phải đứng chờ */
  wait: number;
  /** đã làm xong việc chưa — xong thì quay ra khỏi bản đồ */
  done: boolean;
}

export interface Entity {
  id: number;
  kind: EntityKind;
  /** id trong `content.animals` */
  def: string;
  /** bản đồ nó đang đứng */
  map: string;
  /** TÂM hộp va chạm, world px — cùng quy ước với người chơi */
  x: number;
  y: number;
  dir: Dir;
  anim: number;
  /**
   * PRNG RIÊNG của con này.
   *
   * Đường TICK tuyệt đối KHÔNG được đụng `state.seed`: số lần rút sẽ phụ thuộc
   * số khung hình, và bất biến "cùng seed + cùng chuỗi action = state y hệt" vỡ
   * ngay. Mỗi con mang hạt riêng, advance cục bộ; thêm hay bớt một con không
   * làm lệch chuỗi số của con khác.
   */
  seed: number;
  ai: AiState;
  animal: AnimalState;
  /** chỉ có ở `kind === "worker"` */
  worker?: WorkerState;
  /** chỉ có ở `kind === "vehicle"` */
  veh?: VehicleState;
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

  /**
   * MỌI THỰC THỂ tự di chuyển — vật nuôi, sâu bọ, và sau này người làm thuê, xe.
   *
   * Một mảng PHẲNG TOÀN CỤC, mỗi phần tử mang trường `map`. Không nhét vào
   * `StoredMap.entities`, và lý do là bất biến `mapId ∉ maps`: bản đồ ĐANG chơi
   * cố ý không nằm trong `maps`, nên entity của nó sẽ phải có một nhà riêng, và
   * đoạn PORTAL — chỗ tinh vi nhất của reduce.ts — phải tráo thêm một mảng nữa
   * đúng thứ tự "cất rồi lấy". Mảng toàn cục xoá bỏ chỗ đó bằng không dòng code;
   * cái giá là TICK phải lọc `e.map === s.mapId`, tức vài chục phép so mỗi khung
   * hình, rẻ hơn một lần `blockedAt`.
   */
  entities: Entity[];
  /** Bộ đếm cấp id cho thực thể — không bao giờ dùng lại số cũ. */
  entSeq: number;
  /**
   * Số BƯỚC ACTOR đã chạy xong.
   *
   * Actor DI CHUYỂN mỗi khung hình (mượt, không rút số ngẫu nhiên nào) nhưng
   * chỉ QUYẾT ĐỊNH mỗi `ACTOR_STEP_MINUTES` phút game. Số bước là hàm của
   * `minutes`, mà `minutes` là hàm của tổng `dt` đã dispatch — nên replay cùng
   * chuỗi action cho cùng số bước, bất kể máy chạy 30 hay 120 khung hình/giây.
   * Dùng CHỈ SỐ NGUYÊN chứ không phải bộ tích luỹ float: không trôi qua save.
   */
  actStep: number;
  /** Con trỏ xoay vòng cho ngân sách tìm đường — mỗi bước chỉ vài actor được
   *  tính đường mới, đến lượt ai thì con trỏ này quyết. */
  planCursor: number;

  /**
   * KHO TẬP TRUNG — kho chung của cả nông trại, tách khỏi túi đồ.
   *
   * MỘT kho duy nhất dù nhà kho chiếm bao nhiêu ô, cùng tinh thần với "lưới
   * điện chỉ có một" ở bước 2 của newday: người chơi nghĩ về *cái kho*, không
   * nghĩ về từng ô tường của nó. Đây cũng là chỗ người làm thuê sẽ đổ hàng về.
   */
  store: InvSlot[];
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
  /** Xây cả một tuyến công trình từ (x0,y0) tới (x1,y1) theo hình chữ L. */
  /* `far`: bỏ kiểm TẦM VỚI. Chỉ CHẾ ĐỘ XÂY DỰNG dùng — ở đó thời gian đứng
     yên và người chơi đang QUY HOẠCH cả khu, nên bắt họ lê từng bước tới sát
     mỗi ô rào là biến một việc mười giây thành một việc mười phút. Vật liệu và
     năng lượng vẫn trừ như thường, nên nó không phải là gian lận. */
  | { t: "BUILD_LINE"; id: string; x0: number; y0: number; x1: number; y1: number; far?: boolean }
  /** Cất từ túi vào kho (slot của TÚI). */
  | { t: "STORE_PUT"; slot: number; n: number }
  /** Lấy từ kho ra túi (slot của KHO). */
  | { t: "STORE_TAKE"; slot: number; n: number }
  /** Cất TẤT CẢ nông sản và nguyên liệu trong túi vào kho. */
  | { t: "STORE_PUT_ALL" }
  /** Bán sạch nông sản đang nằm trong kho. */
  | { t: "STORE_SELL_ALL" }
  /** Mua và thả một con vật xuống (x,y) của bản đồ đang chơi. */
  | { t: "BUY_ANIMAL"; def: string }
  /** Cho con vật gần ô (x,y) ăn. */
  | { t: "FEED"; x: number; y: number }
  /** Thu sữa/trứng/lông của con vật gần ô (x,y). */
  | { t: "GATHER"; x: number; y: number }
  /** Bán con vật gần ô (x,y) lấy thịt. */
  | { t: "SLAUGHTER"; x: number; y: number }
  /** Thuê một người làm; họ tới ĐIỂM GIAO như mọi thứ khác. */
  | { t: "HIRE"; job: WorkerJob }
  /** Cho nghỉ việc. */
  | { t: "FIRE"; id: number }
  /** Đổi việc được giao. */
  | { t: "ASSIGN"; id: number; job: WorkerJob }
  /** Mua một chiếc xe — cũng được giao tới bằng xe giao hàng. */
  | { t: "BUY_VEHICLE"; def: string }
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
  | "sickAround"
  /* ---- lệnh TOÀN BẢN ĐỒ ------------------------------------------------
     Các lệnh "quanh nhân vật" ở trên tốt cho việc soi một ô, nhưng để thử cân
     bằng thì phải dựng được cả một nông trại trong một cú bấm: cày sạch, gieo
     sạch, tưới sạch rồi ngủ vài đêm xem tiền ra bao nhiêu. Làm tay thì mất
     mười phút mỗi lần chỉnh một con số. */
  /** cày mọi ô cày được trên bản đồ đang chơi */
  | "tillMap"
  /** gieo hạt đang cầm ra MỌI ô đã cày */
  | "plantMap"
  /** tưới mọi ô đã cày */
  | "waterMap"
  /** dọn sạch cỏ dại và cây con trên cả bản đồ */
  | "clearMap"
  /** thả một con vật cạnh nhân vật (n = chỉ số loài, thiếu thì xoay vòng) */
  | "spawnAnimal"
  /** thả một con sâu bọ để thử chó tuần tra */
  | "spawnPest"
  /** thuê ngay một người làm, miễn phí */
  | "spawnWorker"
  /** gọi xe thu mua tới ngay */
  | "callBuyer"
  /** bỏ mọi thực thể trên bản đồ đang chơi */
  | "clearEntities"
  /** nhảy thẳng sang mùa kế tiếp */
  | "nextSeason"
  /** +3 giờ trong ngày */
  | "skipHours";

/* ---------------------------------------------------------------------------
   PHẦN E — SAVE
--------------------------------------------------------------------------- */

export interface SaveData {
  /** để nhận diện file khi người chơi nhập nhầm file khác */
  magic: "oni-farm";
  savedAt: number;
  state: GameState;
}

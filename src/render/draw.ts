/* ============================================================================
   RENDERER — chỉ ĐỌC state, không bao giờ sửa.

   Mọi thứ ở đây vẽ bằng WORLD PX. Việc đổi sang pixel màn hình do đúng một phép
   biến đổi ở đầu mỗi khung hình đảm nhiệm:

       setTransform(scale·dpr, 0, 0, scale·dpr, offX·dpr, offY·dpr)

   Nhờ vậy phần còn lại của file không cần biết màn hình to nhỏ ra sao — sprite
   nào cũng vẽ ở toạ độ world trừ đi camera, y như hồi độ phân giải còn cố định.

   Những điểm đáng chú ý:

   1. **Nét pixel.** imageSmoothingEnabled = false, hệ số phóng là số nguyên khi
      có thể (camera.ts lo), và cả offset letterbox lẫn camera đều được làm tròn
      về pixel nguyên — nửa pixel lệch là đủ làm cả màn hình mờ.

   2. **Sắp theo chiều sâu.** Mọi thứ đứng trên mặt đất gom lại rồi sắp theo mép
      dưới, nên nhân vật đi sau gốc cây thì bị che, đi trước thì che cây.

   3. **Ngày/đêm đục lỗ.** Phủ màu tối lên một lớp riêng rồi ĐỤC bằng
      destination-out ở chỗ có đèn, nên ánh sáng thật sự khoét vào bóng tối chứ
      không phải chấm sáng dán đè. Lớp này vẽ ở nửa độ phân giải màn hình.

   4. **Cắt theo khung nhìn.** Khi thế giới nhỏ hơn khung nhìn (hoặc màn quá dài
      nên bị letterbox), phần thừa là viền nền — clip đảm bảo không có sprite nào
      thò ra ngoài khung.

   5. **Hiệu ứng KHÔNG nằm trong state.** Hạt bụi khi cày, giọt nước khi tưới,
      lấp lánh trên cây chín, dấu đích đang đi tới — tất cả là trang trí nhất
      thời của lớp vẽ, không đi vào save, không ảnh hưởng luật chơi. Renderer
      nhận lệnh `burst()` từ main rồi tự nuôi danh sách hạt của mình.

   6. **Bờ nước và mép luống là AUTOTILE ở lớp vẽ.** Ô nước giáp đất được phủ
      bọt, ô đã cày giáp ô chưa cày được viền — chỉ cần nhìn hàng xóm lúc vẽ,
      state không phải lưu thêm gì.
============================================================================ */

import type { Content, Entity, GameState, GroundKind, Tile } from "../game/types.ts";
import {
  ART,
  TILE_PX,
  CROP_PX,
  CROP_H,
  PLAYER_ACT_FRAME,
  PLAYER_RAISE_FRAME,
  PF_CARRY,
  PF_TIRED,
  PF_SIT,
  PF_WAVE,
  PF_CHAT,
  PF_CROUCH,
  PF_POUR,
  PF_WIPE,
  PF_POINT,
  houseVariantKey,
  blockVariantKey,
  tileMaskKey,
  variantFor,
  type Atlas,
  type HeldKind,
  type PlayerDir,
  type Side,
} from "../art/atlas.ts";
import { selectedItemId } from "../game/inventory.ts";
import { parseItem } from "../game/items.ts";
import { animalMood } from "../game/animals.ts";
import type { Camera } from "./camera.ts";
import type { EmoteKind, RoadMark } from "../art/atlas.ts";
import { hash2 } from "../core/rng.ts";
import { WORK_MINUTES } from "../game/workerai.ts";
import { TILE } from "../game/world.ts";

/** Màu viền letterbox — tối hơn nền thế giới để thấy rõ đó là ngoài khung. */
const LETTERBOX = "#0b0907";
const WORLD_BG = "#1a1410";

/** Lớp ngày/đêm vẽ ở nửa độ phân giải: gradient mềm nên không lộ, mà rẻ một nửa. */
const NIGHT_QUALITY = 0.5;

export interface Cursor {
  x: number;
  y: number;
  ok: boolean;
}

/** Loại hiệu ứng hạt. Mỗi loại một màu và một kiểu chuyển động. */
export type BurstKind = "dust" | "water" | "leaf" | "spark" | "stone" | "coin" | "blow" | "splash";

/** Thời tiết đã rút gọn cho renderer — main tính từ content + state. */
export interface WeatherFx {
  /** 0..1 — cây lay mạnh tới đâu */
  wind: number;
  /** đang mưa (vệt mưa rơi) */
  rain: boolean;
  /** bão: tối trời + chớp */
  storm: boolean;
  /** âm u: tint xám nhẹ */
  overcast: boolean;
  /** nắng gắt: cây chưa tưới trông héo */
  hot: boolean;
  /** 0..1 độ dày sương (main tính theo giờ) */
  fog: number;
  /** chỉ số MÙA (0..3 theo thứ tự content) — cây cỏ đổi màu tán theo nó */
  season: number;
  /** bản đồ đang chơi ở ngoài trời không — trong nhà không vẽ mưa/sương */
  outdoor: boolean;
  /** lớp màu của MÙA, phủ cả trong nhà (mùa thì ở đâu cũng là mùa đó) */
  seasonTint: { color: string; alpha: number; desat?: number } | null;
}

export interface DrawOptions {
  /** Ô ĐÍCH đang đi tới (bấm-để-đi) — vẽ dấu vòng vàng. */
  navTarget: { x: number; y: number } | null;
  /**
   * MỤC TIÊU của nút chính — ô mà cú bấm sẽ tác động vào. Vẽ mũi tên đỏ.
   *
   * Từ Đợt 27 nó KHÔNG còn điều kiện "khác ô đang ngắm": con trỏ và mũi tên
   * nói hai câu khác nhau ("tôi sẽ đi đây" / "nút sẽ làm ở đây"), nên trùng ô
   * vẫn phải hiện cả hai. Trước đó cả hai dùng chung hình con trỏ và phân biệt
   * bằng độ mờ, tức là bắt người chơi đọc alpha để hiểu luật chơi.
   */
  aimArrow: { x: number; y: number } | null;
  /**
   * Nút chính có LÀM ĐƯỢC gì ở ô ấy không.
   *
   * `false` = đang nhắm vào đó nhưng chưa làm được (chưa cày, hết nước, sai
   * công cụ) → mũi tên mờ đi. Cường nói mũi tên chỉ vào thứ "sắp nhắm tới HOẶC
   * ĐANG NHẮM TỚI", nên nó không được biến mất chỉ vì việc chưa làm được: mất
   * mũi tên đúng lúc ấy là mất luôn câu trả lời cho "vì sao bấm không ăn".
   */
  aimArrowOk: boolean;
  /** 0..1: độ mờ đen khi chuyển ngày (main điều khiển), 0 = không phủ. */
  fade: number;
  /** Tắt nhấp nháy/lấp lánh/hạt cho ai say chuyển động. */
  reduceMotion: boolean;
  /** Thời tiết hôm nay (core 1.3). */
  weather: WeatherFx;
  /** Các ô của tuyến đang ngắm khi xây theo tuyến — vẽ xem trước. */
  lineCells: { x: number; y: number; ok: boolean }[] | null;
}

/**
 * Số lệnh vẽ của MỘT khung hình — thước đo duy nhất của lớp vẽ không phụ thuộc
 * lịch trình trình duyệt.
 *
 * `docs/KIEN-TRUC.md` đã muốn con số này từ lâu ("lớp vẽ không đo được trong
 * Node… hoặc **đếm lệnh vẽ**") nhưng chưa ai viết, nên mỗi lần cần đo lại phải
 * vá tạm `CanvasRenderingContext2D.prototype` trong console — và con số ấy chết
 * theo phiên làm việc. Đợt 15 và Đợt 23 đều dựa vào nó để chứng minh mình đã
 * làm gì; giờ nó thành một phần của game, ở bản DEV.
 */
export interface DrawStats {
  drawImage: number;
  fillRect: number;
  /** số phần tử đã sắp trong lớp vật thể — thứ phình theo số ô nhìn thấy */
  items: number;
  /** số thực thể bị bỏ qua vì nằm ngoài khung nhìn */
  culled: number;
  /**
   * 1 nếu khung này phải DỰNG LẠI cache lớp nền, 0 nếu dùng lại được.
   *
   * Con số quan trọng nhất của Đợt 28. Cache nền là thứ đắt nhất trong cả lớp
   * vẽ (~900-1.400 `drawImage` vào một canvas phụ), và trước đợt này nó dựng
   * lại MỖI KHUNG trên nông trại đã gieo mà không ai biết — vì bộ đếm chỉ bọc
   * canvas chính, nên đúng ngần ấy lệnh vẽ nằm ngoài mọi phép đo.
   */
  nenVe: number;
  /** tổng số LÁT đã cắt để uốn cây theo gió — mỗi lát là một `drawImage`. */
  lat: number;
  /** thời gian `draw()` tính bằng ms, chỉ DEV. 0 ở bản chơi thật. */
  ms: number;
}

export interface Renderer {
  /** đồng bộ backing store của canvas với viewport hiện tại của camera */
  applyViewport(): void;
  /** Số lệnh vẽ của khung hình vừa rồi. Chỉ có ý nghĩa ở bản DEV. */
  stats(): DrawStats;
  draw(s: GameState, content: Content, cursor: Cursor | null, timeSec: number, opts: DrawOptions): void;
  /** Bắn một cụm hạt tại tâm ô (tx,ty). Trang trí thuần tuý, không vào state. */
  burst(kind: BurstKind, tx: number, ty: number): void;
  /**
   * TỪ CHỐI: nhân vật lắc đầu và hiện dấu mệt trên đầu.
   *
   * Có mặt vì hết năng lượng hiện chỉ báo bằng một dòng chữ trôi qua ở góc và
   * một tiếng "bụp". Người chơi đang nhìn nhân vật, bấm nút, và KHÔNG THẤY GÌ
   * XẢY RA — thứ đó đọc ra là "game đứng", không phải "tôi hết sức". Cái lắc
   * đầu xảy ra ngay chỗ mắt đang nhìn, nên không cần đọc chữ nào.
   */
  refuse(): void;
}

/* -------------------------------------------------------------------------- */

/** Màu trời theo giờ. Trả về [màu, độ đậm]. */
function nightTint(minutes: number): [string, number] {
  // 6:00 sáng rõ → 17:00 bắt đầu ngả vàng → 20:00 xanh tối → 22:00+ tối hẳn
  if (minutes < 1020) return ["#000022", 0];
  if (minutes < 1140) {
    const t = (minutes - 1020) / 120;
    return ["#4a2410", 0.3 * t];
  }
  if (minutes < 1320) {
    const t = (minutes - 1140) / 180;
    return ["#0a1030", 0.3 + 0.34 * t];
  }
  return ["#0a1030", 0.64];
}

/** Đèn lưu bằng toạ độ WORLD; đổi sang pixel màn hình lúc dựng lớp đêm. */
interface Light {
  wx: number;
  wy: number;
  r: number;
  strength: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  ttl: number;
  size: number;
  color: string;
  gravity: number;
}

const BURST: Record<BurstKind, { colors: string[]; n: number; speed: number; up: number; gravity: number; ttl: number; size: number }> = {
  dust: { colors: ["#a67a4a", "#c9a06a", "#7a4f2f"], n: 7, speed: 26, up: 30, gravity: 90, ttl: 0.45, size: 1 },
  water: { colors: ["#7fb6ec", "#a8d4ff", "#3b82e0"], n: 8, speed: 22, up: 34, gravity: 110, ttl: 0.5, size: 1 },
  leaf: { colors: ["#7cc25a", "#4da04a", "#ffd84a"], n: 8, speed: 30, up: 40, gravity: 60, ttl: 0.6, size: 1 },
  spark: { colors: ["#ffd84a", "#ffffff", "#f59e0b"], n: 10, speed: 34, up: 30, gravity: 20, ttl: 0.5, size: 1 },
  stone: { colors: ["#a2a8b1", "#6b7078", "#ffffff"], n: 7, speed: 30, up: 36, gravity: 120, ttl: 0.45, size: 1 },
  coin: { colors: ["#ffd84a", "#c9931a", "#fff4b0"], n: 6, speed: 18, up: 44, gravity: 70, ttl: 0.7, size: 2 },
  /** lá bị GIÓ cuốn khỏi tán cây: ít hạt, nhẹ, sống lâu — gió (windX) mới là thứ đẩy nó đi */
  blow: { colors: ["#7cc25a", "#4da04a", "#c9a227"], n: 2, speed: 8, up: 12, gravity: 14, ttl: 1.6, size: 1 },
  /** giọt bắn dưới chân người đi trong mưa */
  splash: { colors: ["#a8d4ff", "#dff1ff"], n: 3, speed: 12, up: 16, gravity: 120, ttl: 0.28, size: 1 },
};

/**
 * Cạnh nào của ô cầu (x,y) cần LAN CAN: ô kề là NƯỚC (hoặc ngoài bản đồ) và
 * không phải cùng loại cầu. Đầu cầu tiếp đất → mở.
 */
function bridgeRail(s: GameState, x: number, y: number, prop: string) {
  const ke = (dx: number, dy: number): boolean => {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) return true;
    const t = s.tiles[ny * s.w + nx]!;
    return t.g === "water" && t.prop !== prop;
  };
  return { up: ke(0, -1), down: ke(0, 1), left: ke(-1, 0), right: ke(1, 0) };
}

/** Mức đầy 0..3 của một chỗ chứa thức ăn, suy từ số phần còn lại. */
function mucAn(content: Content, n: number): number {
  if (!(n > 0)) return 0;
  const tran = Math.max(1, Math.floor(content.balance.troughMax ?? 12));
  if (n >= tran * 0.75) return 3;
  if (n >= tran * 0.34) return 2;
  return 1;
}

/**
 * Khung vẽ cho NGƯỜI LÀM đang làm việc: giơ (6) rồi chạm (5).
 *
 * Người chơi có `s.busy` là một số thực chạy theo `dt` nên pha vung của họ
 * mượt. Người làm thì chỉ có `ai.until`, mà đồng hồ ấy trừ đúng
 * `ACTOR_STEP_MINUTES` mỗi bước quyết định — với `WORK_MINUTES = 1.5` thì nó có
 * ĐÚNG BA NẤC. Bậc thang chứ không mượt, và đó là lựa chọn: làm mượt đòi thêm
 * một đồng hồ số thực vào `AiState`, tức thêm một trường vào SAVE, cho một việc
 * hoàn toàn trang trí. Ở cỡ 16px thì ba nấc đọc ra "giơ, giơ, bổ" là đủ.
 *
 * THUẦN để sim kiểm được — phần còn lại của `drawActors` không test headless.
 */
export function workFrame(until: number, workMinutes: number, impact: number): number {
  const tong = Math.max(0.0001, workMinutes);
  const pha = 1 - Math.max(0, Math.min(tong, until)) / tong;
  return pha < impact ? PLAYER_RAISE_FRAME : PLAYER_ACT_FRAME;
}

/**
 * Người làm đang cầm gì trong tay, suy từ VIỆC ĐƯỢC GIAO (`ai.job`).
 *
 * Khác người chơi ở gốc: người chơi cầm gì là do ô hotbar đang chọn, còn người
 * làm không có hotbar — họ lấy đồ từ kho lúc cần. Nên cái quyết định là việc.
 *
 * Ba việc BƯNG BÊ (`pour`, `dump`, `unload`) cố ý trả `hand`: thứ cần thấy ở
 * chúng không phải công cụ trong tay mà là MÓN TRÊN ĐẦU — xem chỗ vẽ `carry`.
 */
export function heldForJob(job: string | undefined, propTool: string | null): HeldKind {
  switch (job) {
    case "till":
      return "TILL";
    case "water":
      return "WATER";
    case "plant":
      return "seed";
    case "break":
    case "clear":
      return propTool === "MINE" ? "MINE" : propTool === "CHOP" ? "CHOP" : "hand";
    default:
      return "hand";
  }
}

/* ------------------------------------------------ CHỮ KÝ LỚP NỀN CỦA MỘT Ô

   ⚠️ ĐẶT NGAY CẠNH `veNenVao` VÀ PHẢI ĐI CÙNG NÓ. Thêm một trường vào `Tile`
   mà `veNenVao` có đọc, rồi quên thêm vào đây, thì cache nền ĐỨNG HÌNH — ô ấy
   đổi mà màn hình không đổi — và **không kịch bản nào đỏ**, chỉ người chơi
   thấy. Kịch bản 170 quét chính mã nguồn `veNenVao` để bắt trường hợp ấy.

   Năm trường, gói vào một số nguyên nhỏ để so bằng một phép so. `crop` cố ý
   KHÔNG có mặt: cây lớn lên không đổi lớp nền một pixel nào, và chính việc
   `crop.grow` nhích lên mỗi khung là thứ đã giết cache suốt năm đợt. */
/* `Record<GroundKind, …>` chứ không phải `Record<string, …>`: thêm một loại nền
   vào `GroundKind` mà quên cho nó một mã ở đây thì `tsc` ĐỎ NGAY. Bảng tra lỏng
   sẽ lặng lẽ trả `undefined` cho loại mới, hai loại mới cùng ra một mã, và cache
   đứng hình — đúng cái hỏng mà cả đợt này đang chữa. */
const MA_NEN: Record<GroundKind, number> = {
  grass: 1,
  path: 2,
  wood: 3,
  asphalt: 4,
  concrete: 5,
  water: 6,
};
/** id công trình → số nhỏ, điền lười theo thứ tự gặp. */
const maB = new Map<string, number>();
export function chuKyNen(t: Tile): number {
  let b = 0;
  if (t.b) {
    b = maB.get(t.b) ?? 0;
    if (b === 0) {
      b = maB.size + 1;
      maB.set(t.b, b);
    }
  }
  return (
    MA_NEN[t.g] |
    (t.tilled ? 1 << 3 : 0) |
    (t.wet ? 1 << 4 : 0) |
    (t.decor === "tuft" ? 1 << 5 : 0) |
    (b << 6)
  );
}

/**
 * LỀ CẮT quanh khung nhìn, ĐƠN VỊ THẾ GIỚI.
 *
 * Thực thể vẽ ra cao hơn tâm nó nhiều: thân xe 32px, đồ đội trên đầu ở
 * `py − 11`, bong bóng ở `py − 20` — tức mép hình xa tâm nhất là 20 + 16 = 36.
 * Cắt sát mép khung nhìn là cắt cụt nửa cái xe đang đi vào, ngay trước mắt
 * người chơi. 40 cho dôi ra một chút.
 */
export const LE_CAT = 40;

/**
 * Thực thể ở `(x, y)` có nằm HẲN ngoài khung nhìn (cộng lề) không?
 *
 * Tách ra khỏi `drawActors` để kiểm được bằng số thật: bên trong ấy nó bị khoá
 * sau một cái atlas và một canvas, và một phép cắt sai một dấu lớn-hơn thì
 * không có cách nào thấy ngoài việc nhìn thấy thứ biến mất.
 */
export function ngoaiKhung(
  x: number,
  y: number,
  rx: number,
  ry: number,
  viewW: number,
  viewH: number,
): boolean {
  return x < rx - LE_CAT || y < ry - LE_CAT || x > rx + viewW + LE_CAT || y > ry + viewH + LE_CAT;
}

/* ------------------------------------------------ SỐ LÁT CẮT ĐỂ UỐN MỘT CÂY

   Cây và bụi lay theo gió bằng cách cắt sprite thành nhiều lát ngang rồi dịch
   mỗi lát theo BÌNH PHƯƠNG độ cao — gốc đứng yên, ngọn đi xa nhất, thân cong
   thành một cung (Đợt 25). Càng nhiều lát thì cung càng mượt, và càng tốn
   `drawImage`.

   Trước đợt này số lát là một hằng số — 4 cho cây cao, 2 cho bụi — và cái ngưỡng
   "coi như đứng yên" là `Math.abs(dich) < 0.05` ĐƠN VỊ THẾ GIỚI. Cả hai đều nói
   một câu vô nghĩa, vì mắt người không nhìn bằng đơn vị thế giới: cùng con số
   0,05 ấy là 0,2 pixel thiết bị ở mức phóng này và 3 pixel ở mức phóng kia.

   Hậu quả đo được: không kiểu thời tiết nào có `wind = 0` (thấp nhất 0,1), nên
   nhánh "đứng yên" gần như không bao giờ trúng và mọi cây cao đều cắt 4 lát —
   ~79 cây trong khung nhìn điện thoại là 316 lệnh vẽ thay vì 79, để lắc cây
   chưa nổi một pixel.

   Nay đếm bằng PIXEL THIẾT BỊ, và đếm theo BIÊN ĐỘ ĐỈNH (`2.6 × wind × sway`,
   một hằng số suốt cả ngày) chứ KHÔNG theo `dich` tức thời. Đếm theo `dich`
   thì số lát nhảy 60 lần mỗi giây và đường viền cây rung lăn tăn — đổi một lỗi
   lấy một lỗi khác. `dich` vẫn dùng nguyên để đặt vị trí từng lát. */

/** Sai lệch tối đa cho phép giữa đường gấp khúc của các lát và cung thật, PX THIẾT BỊ. */
const LAT_SAI_DEV = 3.5;
/** Dưới ngần này thì cả cái cây không nhúc nhích nổi một pixel — vẽ liền một mảnh. */
const LAT_IM_DEV = 1.0;

/**
 * Bao nhiêu lát cho một cây có biên độ đỉnh `bienDoDev` (PX THIẾT BỊ)?
 * `0` nghĩa là không cắt và cũng không dịch — cây đứng yên.
 *
 * Lát `i` được vẽ ở độ cao giữa lát, tức hệ số `(1 − (i+0,5)/n)²`. Lát trên
 * cùng do đó lệch khỏi ngọn thật một khoảng `1 − (1 − 0,5/n)²` lần biên độ —
 * đó chính là sai lệch mà công thức dưới đây kẹp lại.
 */
export function soLat(tall: boolean, bienDoDev: number): number {
  if (bienDoDev < LAT_IM_DEV) return 0;
  const toiDa = tall ? 4 : 2;
  /* Sàn là 2, không phải 1: một lát nghĩa là cả cây TRƯỢT ngang một khối, đúng
     cái mà Đợt 25 vừa bỏ đi ("cây bị xô chứ không bị uốn"). Tiết kiệm một lệnh
     vẽ không đáng để lấy lại cái nhìn ấy. */
  for (let n = 2; n < toiDa; n++) {
    const lech = 1 - (1 - 0.5 / n) ** 2;
    if (bienDoDev * lech <= LAT_SAI_DEV) return n;
  }
  return toiDa;
}

/* ----------------------------------------------------------- VẠCH KẺ MẶT ĐƯỜNG

   Một ô nhựa không tự biết nó phải kẻ vạch gì: điều đó phụ thuộc HÌNH con
   đường quanh nó. Trước Đợt 29 vạch được nướng cứng vào chính ô nhựa — một nét
   DỌC ở cột giữa, rải theo hàm băm toạ độ. Cách ấy chỉ đúng chừng nào mọi con
   đường đều chạy dọc, mà bản đồ cũ đúng là chỉ có một con đường như thế. Mở con
   đường NGANG đầu tiên là lộ ra ngay: vạch nằm vuông góc với chiều xe chạy.

   Nay suy từ hàng xóm. Đo hai đoạn đường liền mạch qua ô này — ngang và dọc:

     · đoạn NGẮN hơn là BỀ RỘNG con đường, đoạn DÀI hơn là chiều xe chạy;
     · hai đoạn BẰNG nhau thì đây là NGÃ TƯ, và ngã tư không kẻ vạch nào cả —
       đúng như ngoài đời;
     · rộng đúng một ô thì không có ranh giới nào để kẻ, nên kẻ một nét đứt vào
       giữa lòng đường.

   Nhận `laDuong` làm tham số chứ không đọc thẳng `GameState`: bên trong lớp vẽ
   nó nằm sau một cái atlas và một cái canvas, mà một phép suy sai thì chỉ nhìn
   thấy được bằng mắt. Tách ra thế này thì kịch bản 177 dựng lưới bằng chữ và
   kiểm từng ô. */

/** Đo tới đâu thì thôi. Đường dài suốt bản đồ, mà ta chỉ cần biết "dài hơn bề
 *  rộng" chứ không cần biết dài bao nhiêu. */
const RA_TOI_DA = 8;

function doDoan(
  laDuong: (x: number, y: number) => boolean,
  x: number,
  y: number,
  doc: boolean,
): [number, number] {
  let truoc = 0;
  while (truoc < RA_TOI_DA && laDuong(doc ? x : x - truoc - 1, doc ? y - truoc - 1 : y)) truoc++;
  let sau = 0;
  while (sau < RA_TOI_DA && laDuong(doc ? x : x + sau + 1, doc ? y + sau + 1 : y)) sau++;
  return [truoc + 1 + sau, truoc];
}

const KHONG_KE: readonly RoadMark[] = [];

/** Vạch kẻ cho ô đường (x,y) — có thể hai nét, rỗng nếu ô này không kẻ gì. */
export function vachKeDuong(
  laDuong: (x: number, y: number) => boolean,
  x: number,
  y: number,
): { marks: readonly RoadMark[]; doc: boolean } {
  const [dNgang] = doDoan(laDuong, x, y, false);
  const [dDoc, viDoc] = doDoan(laDuong, x, y, true);
  if (dNgang === dDoc) return { marks: KHONG_KE, doc: false }; // ngã tư
  const doc = dDoc > dNgang; // đường chạy DỌC khi đoạn dọc dài hơn
  const [rong, viTri] = doc ? doDoan(laDuong, x, y, false) : [dDoc, viDoc];
  if (rong <= 1) return { marks: ["single"], doc };
  /* Mỗi ô sở hữu cái ranh Ở PHÍA GẦN của nó (mép trên với đường ngang). Ô đầu
     tiên không có ranh nào phía gần nên nó kẻ MÉP NGOÀI; ô cuối cùng kẻ thêm
     mép ngoài phía XA, vì không còn ô nào bên kia để kẻ hộ nó.
     Tim đường nằm chính giữa bề rộng — với đường bốn làn là ranh phía gần của
     ô thứ ba, đúng chỗ ngăn hai chiều xe chạy. */
  const gan: RoadMark = viTri === 0 ? "edge" : viTri * 2 === rong ? "center" : "dash";
  return { marks: viTri === rong - 1 ? [gan, "edgeFar"] : [gan], doc };
}

export function createRenderer(
  canvas: HTMLCanvasElement,
  atlas: Atlas,
  camera: Camera,
): Renderer {
  /* ---------------------------------------------------------- ĐẾM LỆNH VẼ

     Bọc `drawImage`/`fillRect` để đếm. Chỉ ở bản DEV: bản chơi thật không trả
     một xu nào cho phép đo.

     Vì sao đếm chứ không bấm giờ: thời gian một khung phụ thuộc lịch trình của
     trình duyệt, máy đang chạy gì, và cả nhiệt độ máy — hai lần đo cách nhau
     một phút đã lệch. Số LỆNH VẼ thì không: nó là một tính chất của mã.

     BỌC MỌI NGỮ CẢNH, không riêng canvas chính. Từ Đợt 24 tới Đợt 27 bộ đếm
     chỉ bọc `g`, nên ba canvas phụ — cache nền, lớp đêm, mảng nước/mưa — hoàn
     toàn vô hình. Mà cache nền chính là chỗ đắt nhất: nó báo 149 lệnh vẽ trong
     khi thật ra là ~1.500. Một bộ đếm mù đúng chỗ tốn nhất còn tệ hơn không có
     bộ đếm, vì nó làm người ta tin là đã đo rồi. */
  const dem: DrawStats = {
    drawImage: 0, fillRect: 0, items: 0, culled: 0, nenVe: 0, lat: 0, ms: 0,
  };
  const boc = <T extends CanvasRenderingContext2D>(c: T): T => {
    if (!import.meta.env?.DEV) return c;
    const oDraw = c.drawImage.bind(c);
    const oFill = c.fillRect.bind(c);
    (c as CanvasRenderingContext2D).drawImage = ((...a: unknown[]) => {
      dem.drawImage++;
      return (oDraw as (...x: unknown[]) => void)(...a);
    }) as CanvasRenderingContext2D["drawImage"];
    (c as CanvasRenderingContext2D).fillRect = ((...a: unknown[]) => {
      dem.fillRect++;
      return (oFill as (...x: unknown[]) => void)(...a);
    }) as CanvasRenderingContext2D["fillRect"];
    return c;
  };

  const g = boc(canvas.getContext("2d", { alpha: false })!);
  const night = document.createElement("canvas");
  const ng = boc(night.getContext("2d")!);

  const particles: Particle[] = [];
  let lastTime = 0;
  /** Lực gió ngang (px/s²) tác động lên MỌI hạt — lá bay xiêu theo gió, bụi cũng thế. */
  let windX = 0;
  /** nhịp cuối đã thả lá / bắn giọt — để mỗi nhịp chỉ một lần */
  let laBeat = -1;
  let giotBeat = -1;
  /* Pha vung ĐÃ THẤY của từng người làm, để bắn hạt đúng một lần mỗi nhát.
     Giữ ở đây chứ không ở main: khoảnh khắc "chạm đất" chỉ suy được từ
     `ai.until`, và để main tự suy thì hai tầng cùng giữ một bản sao của cùng
     phép tính. Không vào save — nó là chuyện của lớp vẽ. Dọn theo danh sách
     thực thể mỗi khung nên không rò rỉ khi người làm nghỉ việc. */
  const phaLam = new Map<number, number>();

  /** Ghim một toạ độ world về đúng lưới pixel THIẾT BỊ (mịn hơn world px đúng
   *  bằng scale×dpr lần). Dùng cho những thứ DI CHUYỂN mượt: nhân vật, hạt. */
  function snapDev(v: number): number {
    const k = camera.viewport.scale * camera.viewport.dpr;
    return k > 0 ? Math.round(v * k) / k : v;
  }

  /* -------------------------------------------------------- DÁN MỘT SPRITE

     Sprite nay rộng `ART` lần so với đơn vị thế giới (xem `ART` trong
     art/atlas.ts), nên phải nói rõ CỠ ĐÍCH thay vì để canvas suy từ cỡ ảnh.

     Đây là chỗ duy nhất biết chuyện đó. Nhờ vậy toàn bộ phép tính vị trí ở lớp
     vẽ — `x * TILE - rx`, `py - 11`, `px + 4` — vẫn viết ở ĐƠN VỊ THẾ GIỚI và
     không phải sửa một dòng nào. Cách còn lại (đổi hệ toạ độ của cả lớp vẽ sang
     pixel ảnh) đụng hơn trăm biểu thức, mà mỗi biểu thức là một cơ hội lệch nửa
     ô một cách âm thầm. */
  /**
   * Dán một sprite ở TOẠ ĐỘ THẾ GIỚI, cỡ đích suy ra từ cỡ ảnh chia cho `ART`.
   *
   * Từ Đợt 24 thì `g.drawImage(img, x, y)` ba tham số là một LỖI trong file này:
   * nó vẽ theo cỡ PIXEL ẢNH, tức gấp `ART` lần cỡ thật. Nó đã lọt hai lần —
   * một lần làm mọi thực thể lệch nửa ô, một lần làm con trỏ ô to gấp đôi
   * (Cường bắt được: "con trỏ chuột to quá vậy, bằng 1 ô đất thôi"). Kịch bản
   * 164 nay quét chính file này để chặn dạng gọi ấy.
   *
   * Ngoại lệ hợp lệ duy nhất là vẽ vào canvas phụ đã ở độ phân giải ảnh
   * (`gg` của cache nền, `cg` của mảng mưa) — chúng dùng tên biến khác.
   */
  function put(img: CanvasImageSource, dx: number, dy: number) {
    const w = (img as HTMLCanvasElement).width / ART;
    const h = (img as HTMLCanvasElement).height / ART;
    g.drawImage(img, dx, dy, w, h);
  }

  /** Canvas phủ kín khung chứa; khung nhìn được căn giữa bên trong bằng offset. */
  function applyViewport() {
    const vp = camera.viewport;
    if (!(vp.cssW > 0) || !(vp.cssH > 0)) return;
    const bw = Math.max(1, Math.round(vp.cssW * vp.dpr));
    const bh = Math.max(1, Math.round(vp.cssH * vp.dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    canvas.style.width = `${vp.cssW}px`;
    canvas.style.height = `${vp.cssH}px`;

    const nw = Math.max(1, Math.round(vp.viewW * vp.scale * NIGHT_QUALITY));
    const nh = Math.max(1, Math.round(vp.viewH * vp.scale * NIGHT_QUALITY));
    if (night.width !== nw || night.height !== nh) {
      night.width = nw;
      night.height = nh;
    }
    g.imageSmoothingEnabled = false;
  }

  /** Cache gradient đèn theo (bán kính đã nhân k, cường độ). Đổi mức phóng thì
   *  `lr` đổi và cache tự có khoá mới; khoá cũ ít, không cần dọn. */
  const GRAD_CACHE = new Map<string, CanvasGradient>();
  function denGradient(lr: number, strength: number): CanvasGradient {
    const key = `${lr.toFixed(2)}|${strength}`;
    let gr = GRAD_CACHE.get(key);
    if (!gr) {
      gr = ng.createRadialGradient(0, 0, 0, 0, 0, lr);
      gr.addColorStop(0, `rgba(0,0,0,${strength})`);
      gr.addColorStop(0.55, `rgba(0,0,0,${strength * 0.45})`);
      gr.addColorStop(1, "rgba(0,0,0,0)");
      GRAD_CACHE.set(key, gr);
    }
    return gr;
  }

  /* ---- động tác TỪ CHỐI ---- */
  /** Giây của đồng hồ vẽ lúc bắt đầu lắc đầu; -1 = không lắc. */
  let refuseAt = -1;
  /** `timeSec` của khung vừa vẽ — `refuse()` được gọi từ ngoài vòng vẽ. */
  let lastTimeSec = 0;
  const REFUSE_SEC = 0.5;

  /* ---- hạt hiệu ứng ---- */
  function burst(kind: BurstKind, tx: number, ty: number) {
    burstAt(kind, tx * TILE + TILE / 2, ty * TILE + TILE / 2);
  }

  /** Như `burst` nhưng tại một điểm world px — cho hạt bám theo thứ đang đi. */
  function burstAt(kind: BurstKind, cx: number, cy: number) {
    const def = BURST[kind];
    for (let i = 0; i < def.n; i++) {
      // tất định theo chỉ số hạt là đủ — đây là trang trí, không cần seed của state
      const ang = (i / def.n) * Math.PI * 2 + ((i * 7) % 5) * 0.13;
      const sp = def.speed * (0.6 + ((i * 3) % 4) * 0.13);
      particles.push({
        x: cx + Math.cos(ang) * 2,
        y: cy + Math.sin(ang) * 1.5,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp * 0.5 - def.up,
        life: 0,
        ttl: def.ttl * (0.8 + ((i * 5) % 3) * 0.15),
        size: def.size,
        color: def.colors[i % def.colors.length]!,
        gravity: def.gravity,
      });
    }
    // trần: không để bấm liên tục làm phình danh sách
    if (particles.length > 240) particles.splice(0, particles.length - 240);
  }

  function stepParticles(dt: number) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]!;
      p.life += dt;
      if (p.life >= p.ttl) {
        particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.vx += windX * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  function drawParticles() {
    const { rx, ry } = camera;
    for (const p of particles) {
      const k = 1 - p.life / p.ttl;
      g.globalAlpha = k < 0.3 ? k / 0.3 : 1;
      g.fillStyle = p.color;
      g.fillRect(snapDev(p.x - rx), snapDev(p.y - ry), p.size, p.size);
    }
    g.globalAlpha = 1;
  }

  /* ---- lớp nền: cỏ / lối đi / nước / đất cày / sàn nhà kính ---- */
  const at = (s: GameState, x: number, y: number): Tile | undefined =>
    x < 0 || y < 0 || x >= s.w || y >= s.h ? undefined : s.tiles[y * s.w + x];

  /** Bản đồ này là TRONG NHÀ? (đa số ô biên là sàn gỗ) — quyết định viền ngoài
   *  biên là rừng hay tường tối. Cache theo tham chiếu mảng ô. */
  let indoorXong = false;
  let indoorFlag = false;
  function isIndoor(s: GameState): boolean {
    /* Câu trả lời chỉ phụ thuộc LOẠI NỀN của các ô biên, mà loại nền thì cây
       lớn không đụng tới — nên khoá KHÔNG phải là tham chiếu mảng ô (thứ đổi
       mỗi khung), mà là một cờ do `quetO` gỡ khi thật sự có ô đổi `t.g`. */
    if (indoorXong) return indoorFlag;
    indoorXong = true;
    let wood = 0;
    let n = 0;
    for (let x = 0; x < s.w; x++) {
      for (const y of [0, s.h - 1]) {
        const t = s.tiles[y * s.w + x];
        if (!t) continue;
        n++;
        if (t.g === "wood") wood++;
      }
    }
    indoorFlag = n > 0 && wood * 2 > n;
    return indoorFlag;
  }

  /** Phủ ô "ngoài biên" cho phần khung nhìn nằm ngoài bản đồ. Camera giữ nhân
   *  vật ở tâm nên sát mép sẽ lộ vùng này — vẽ rừng/tường thay vì để đen. */
  function drawVoid(s: GameState) {
    const { rx, ry } = camera;
    const vp = camera.viewport;
    const x0 = Math.floor(rx / TILE);
    const y0 = Math.floor(ry / TILE);
    const x1 = Math.ceil((rx + vp.viewW) / TILE);
    const y1 = Math.ceil((ry + vp.viewH) / TILE);
    if (x0 >= 0 && y0 >= 0 && x1 < s.w && y1 < s.h) return; // cả khung nằm trong bản đồ
    const set = isIndoor(s) ? atlas.voidIn : atlas.voidOut;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (x >= 0 && y >= 0 && x < s.w && y < s.h) continue;
        put(set[variantFor(x + 97, y + 53, set.length)]!, x * TILE - rx, y * TILE - ry);
      }
    }
  }

  /* ---------------------------------------------------- LỚP NỀN ĐƯỢC CACHE

     Nền là phần TỐN NHẤT của một khung hình: mỗi ô nhìn thấy tốn ít nhất một
     `drawImage`, và ô đất cày thì tốn tới sáu (nền · viền bốn cạnh · lớp đất).
     Đo trên cảnh đêm-bão 285 ô: 581 lệnh `drawImage` mỗi khung, quá nửa là nền.

     Nhưng nền gần như KHÔNG ĐỔI giữa các khung: nó chỉ đổi khi một ô đổi, khi
     camera trôi sang ô mới, hoặc khi trời bắt đầu/tạnh mưa. Nên vẽ nó một lần
     vào canvas phụ rồi dán lại mỗi khung.

     KHOÁ VÔ HIỆU HOÁ — và đây là chỗ Đợt 23 sai suốt năm đợt.

     Khoá cũ là `nenTiles === s.tiles`: "mảng copy-on-write, một ô đổi là cả
     mảng đổi, rẻ nhất có thể và không có cách nào nó bỏ sót". Vế thứ hai đúng.
     Vế thứ nhất mới là vấn đề: nó cũng KHÔNG BAO GIỜ TRÚNG.

     `growCrops` chạy mỗi TICK (reduce.ts) và gọi `edit()` cho MỌI ô ẩm có cây
     đang lớn — vì `grow` cộng thêm mỗi khung, không phải chỉ khi đổi giai đoạn.
     Một lần `edit` là `dTiles` nhân bản cả mảng 3.504 ô. Nên trên nông trại đã
     gieo, `s.tiles` đổi tham chiếu MỖI KHUNG HÌNH, và cache nền dựng lại mỗi
     khung: đo được `nenVe = 600/600`, 1.544 lệnh vẽ và 22 ms mỗi khung — vượt
     hẳn ngân sách 16,7 ms của 60fps.

     Mà cây lớn lên KHÔNG đổi lớp nền một pixel nào: `veNenVao` đọc đúng năm
     trường `g · b · tilled · wet · decor`, không đọc `crop` lấy một lần. Cái
     khoá chỉ đang hỏi sai câu.

     Khoá mới hỏi đúng câu: CHỮ KÝ của năm trường ấy. So tham chiếu trước (rẻ),
     chỉ ô nào đổi object mới tính chữ ký — đúng lối `veODaDoi` mà bản đồ nhỏ
     đã dùng từ Đợt 15 để chữa CHÍNH lỗi này (ui/minimap.ts). Lớp vẽ chính khi
     ấy không được sửa cùng.

     Hai thứ KHÔNG vào cache vì chúng động mỗi khung: mặt nước và bọt sóng. Danh
     sách ô nước được ghi lại lúc dựng cache nên khung sau không phải quét lại
     cả vùng để tìm chúng. */
  const nen = document.createElement("canvas");
  const ng2 = boc(nen.getContext("2d")!);
  let nenTiles: Tile[] | null = null;
  let nenX0 = 0;
  let nenY0 = 0;
  let nenCols = 0;
  let nenRows = 0;
  let nenMua = false;
  /** Chỉ số ô NƯỚC trong vùng đã cache — vẽ trực tiếp mỗi khung. */
  let nenNuoc: number[] = [];

  /* MỘT lượt quét ô mỗi khung, BA khách hàng: cache lớp nền, bảng loại nước và
     `isIndoor`. Cả ba trước đây khoá theo `s.tiles ===` và cả ba cùng hỏng.

     Hai khách hàng sau không đọc một cờ theo-khung mà được `quetO` GỠ KHOÁ
     thẳng: chúng chỉ được gọi ở vài nhánh của `draw()`, nên "cờ chỉ đúng trong
     khung này" là một ràng buộc thứ tự chờ ngày ai đó đạp phải.

     So THAM CHIẾU trước rồi mới tính chữ ký: mảng là mới mỗi khung nhưng phần
     lớn phần tử vẫn là object cũ — chỉ ~360 ô có cây là mới. Nên một lượt quét
     là ~3.500 phép so tham chiếu (vài micro-giây) thay cho ~900 lệnh vẽ (vài
     mili-giây). Rẻ hơn hai tới ba bậc. */
  let oRef: (Tile | undefined)[] = [];
  let oSig = new Int32Array(0);
  let oMapId = "";
  /** Hộp bao các ô vừa đổi CHỮ KÝ NỀN trong khung này, hoặc null nếu không ô nào. */
  let doiHop: { x0: number; y0: number; x1: number; y1: number } | null = null;
  /** Bản đồ vừa đổi (hoặc lần quét đầu) — mọi thứ phải dựng lại. */
  let banDoMoi = true;

  function quetO(s: GameState): void {
    const n = s.w * s.h;
    banDoMoi = s.mapId !== oMapId || oSig.length !== n;
    doiHop = null;
    if (banDoMoi) {
      indoorXong = false;
      loaiXong = false;
      oMapId = s.mapId;
      oSig = new Int32Array(n);
      oRef = new Array<Tile | undefined>(n);
      for (let i = 0; i < n; i++) {
        const t = s.tiles[i];
        oRef[i] = t;
        oSig[i] = t ? chuKyNen(t) : -1;
      }
      return;
    }
    /* Đường tắt: mảng y nguyên nghĩa là KHÔNG một ô nào đổi. Hiếm khi trúng
       trên nông trại đang lớn, nhưng ban đêm và trong nhà thì trúng luôn. */
    if (s.tiles === oRef) return;
    for (let i = 0; i < n; i++) {
      const t = s.tiles[i];
      if (t === oRef[i]) continue;
      /* KHÔNG ghi `oRef[i] = t` ở đây: từ khung thứ hai trở đi `oRef` CHÍNH LÀ
         mảng ô của khung trước, và ghi vào đó là sửa một state đã đóng băng.
         Chỉ trỏ lại cả mảng sau vòng lặp là đủ. */
      const ky = t ? chuKyNen(t) : -1;
      if (ky === oSig[i]) continue; // object mới, hình vẽ y hệt — phần lớn là ca này
      /* Ba bit thấp là LOẠI NỀN. Đổi loại nền thì bảng loại nước và `isIndoor`
         phải dựng lại; đổi cày/tưới/bụi cỏ/công trình thì không. */
      if ((ky & 7) !== (oSig[i]! & 7)) {
        indoorXong = false;
        loaiXong = false;
      }
      oSig[i] = ky;
      const x = i % s.w;
      const y = (i / s.w) | 0;
      if (!doiHop) doiHop = { x0: x, y0: y, x1: x, y1: y };
      else {
        if (x < doiHop.x0) doiHop.x0 = x;
        if (x > doiHop.x1) doiHop.x1 = x;
        if (y < doiHop.y0) doiHop.y0 = y;
        if (y > doiHop.y1) doiHop.y1 = y;
      }
    }
    /* `oRef` phải trỏ vào mảng MỚI, nếu không đường tắt ở trên không bao giờ
       trúng lại. Gán sau vòng lặp vì trong vòng ta còn cần phần tử cũ. */
    oRef = s.tiles as (Tile | undefined)[];
  }

  /* ------------------------------------------------------- LOẠI CỦA MỘT Ô NƯỚC

     Cường: "suối chảy nước chảy thác nước, sóng biển nữa — mấy cái này rất quan
     trọng". Ba loại nước, và lớp vẽ SUY RA loại từ chính hình dạng vùng nước
     thay vì bắt content khai báo:

       · BIỂN  — vùng nước nối liền với CỔNG BIỂN (`tiles.seaGate`), tức chỗ
                 thuyền buôn đi vào. Đây là câu trả lời do content nói ra chứ
                 không phải một mẹo đoán hình: chỗ nào thuyền vào được từ ngoài
                 khơi thì chỗ đó LÀ ngoài khơi. Thử đoán bằng "nước chạm mép
                 dưới bản đồ" thì hỏng ngay ở bản đồ này — nó có một viền cây
                 bao quanh, nên mặt biển không chạm mép nào cả và cả vịnh bị
                 nhận nhầm thành một con suối chảy ngang.
       · SUỐI  — vùng nước HẸP theo một trục và DÀI theo trục kia. Con sông cắt
                 ngang nông trại rộng 38 ô mà chỉ cao 3 ô, nên nó chảy ngang.
       · HỒ    — còn lại. Hồ cá 10×5 không đủ dài để thành dòng chảy.

     Vì sao suy ra chứ không khai báo: thêm loại nền mới vào `tiles.json` thì
     `t.g === "water"` rải khắp luật chơi (đi lại, câu cá, thuyền, múc nước, bất
     biến) đều phải học thêm tên mới — mười mấy chỗ, mỗi chỗ một cơ hội quên.
     Còn suy ra thì bản đồ cũ không sửa một ký tự, save không thêm một byte, và
     người vẽ bản đồ chỉ cần vẽ nước ở đúng hình dạng của nó. */
  const NUOC_HO = 0;
  const NUOC_NGANG = 1;
  const NUOC_DOC = 2;
  const NUOC_BIEN = 3;
  /** Vùng nước hẹp hơn ngần này ô theo một trục thì mới có thể là DÒNG CHẢY. */
  const DONG_HEP = 4;
  /** …và phải dài gấp ngần này lần bề ngang, nếu không nó vẫn là cái hồ.
   *  Tỉ lệ chứ không phải số ô cố định: con suối hai ô ngang chảy bảy ô là một
   *  dòng chảy thật, mà bảy ô thì chưa tới ngưỡng nào tính bằng ô cả. */
  const DONG_TI_LE = 3;

  let loaiXong = false;
  let loaiContent: Content | null = null;
  let loaiNuoc: Uint8Array = new Uint8Array(0);

  /* ------------------------------------------------- MẶT NƯỚC LÀ MỘT MẢNG LẶP

     Vẽ nước bằng sprite 16×16 thì mọi ô nước giống hệt nhau, và cả con sông ra
     một tấm lưới ô vuông lặp lại — nhìn thấy ngay, nhất là khi nó ĐANG CHẢY.
     Tệ hơn: dòng chảy chỉ nhích được từng nấc bằng số khung của sprite.

     Nên dùng lại đúng mẹo của lớp mưa (Đợt 23): một tấm 64×64 tô bằng
     `fillRect`, gốc tấm trôi liên tục theo thời gian. Vệt nước dài hơn cả ô nên
     nó chảy XUYÊN QUA ranh giới ô, và tấm neo theo TOẠ ĐỘ THẾ GIỚI (trừ đi
     `camera.rx/ry`) nên mặt nước đứng yên khi camera trôi — nếu neo theo màn
     hình thì cả dòng sông trượt theo bước chân người chơi. */
  const NUOC_O = 64;
  /** Bước lưới HD tính bằng đơn vị thế giới — cùng nghĩa với `Q` bên atlas. */
  const Q_DOT = 1 / ART;
  /* Bốn tông nước, lấy đúng bảng màu của atlas để mặt sông không lệch màu với
     mặt hồ ngay chỗ chúng gặp nhau. */
  const NUOC_NEN = "#2d6fcf";
  const NUOC_SANG = "#3b82e0";
  const NUOC_TOI = "#2a5fb0";
  const NUOC_BOT = "#a8d4ff";
  const mangNuoc = new Map<string, CanvasPattern | null>();

  function tamNuoc(loai: "ho" | "ngang" | "doc" | "bien" | "thac"): CanvasPattern | null {
    const co = mangNuoc.get(loai);
    if (co !== undefined) return co;
    const c = document.createElement("canvas");
    c.width = NUOC_O * ART;
    c.height = NUOC_O * ART;
    const cg = c.getContext("2d");
    if (!cg) {
      mangNuoc.set(loai, null);
      return null;
    }
    cg.imageSmoothingEnabled = false;
    const dot = (x: number, y: number, mau: string) => {
      cg.fillStyle = mau;
      cg.fillRect(
        ((Math.floor(x * ART) % (NUOC_O * ART)) + NUOC_O * ART) % (NUOC_O * ART),
        ((Math.floor(y * ART) % (NUOC_O * ART)) + NUOC_O * ART) % (NUOC_O * ART),
        1,
        1,
      );
    };
    cg.fillStyle = NUOC_NEN;
    cg.fillRect(0, 0, c.width, c.height);

    if (loai === "ho") {
      /* HỒ TĨNH: gợn lăn tăn rải trên cả tấm 64×64. Bản trước vẽ hồ bằng một
         sprite 16×16 lặp lại — ở HD thì cái lưới ô vuông ấy hiện ra rõ mồn một,
         và mặt hồ đọc ra là gạch men chứ không phải nước. Rải trên tấm lớn thì
         không còn chu kỳ nào đủ ngắn để mắt bắt được. */
      for (let i = 0; i < 150; i++) {
        const x = (hash2(i, 21, 37) % (NUOC_O * ART)) / ART;
        const y = (hash2(i, 22, 53) % (NUOC_O * ART)) / ART;
        const t = hash2(i, 23, 11) % 5;
        const dai = 1 + (hash2(i, 24, 3) % 3);
        const mau = t === 0 ? NUOC_BOT : t < 3 ? NUOC_SANG : NUOC_TOI;
        for (let d = 0; d < dai; d += Q_DOT) dot(x + d, y, mau);
      }
      // vài mảng tối rộng làm đáy sâu, cho mặt hồ có chỗ nông chỗ sâu
      for (let i = 0; i < 26; i++) {
        const x = (hash2(i, 31, 17) % (NUOC_O * ART)) / ART;
        const y = (hash2(i, 32, 29) % (NUOC_O * ART)) / ART;
        const r = 1 + (hash2(i, 33, 7) % 3) * 0.5;
        for (let dy = -r; dy <= r; dy += Q_DOT)
          for (let dx = -r; dx <= r; dx += Q_DOT)
            if (dx * dx + dy * dy <= r * r) dot(x + dx, y + dy, NUOC_TOI);
      }
    } else if (loai === "bien") {
      /* SÓNG LỪNG: bốn ngọn trong một tấm, mỗi ngọn là một đường sin dài 64 ô
         nên không thấy chỗ nối. Chân sóng tối, thân sáng, đỉnh có bọt trắng
         ĐỨT QUÃNG — bọt liền mạch thì thành một sợi chỉ trắng kẻ ngang biển. */
      for (let k = 0; k < 4; k++) {
        const y0 = k * (NUOC_O / 4);
        for (let x = 0; x < NUOC_O; x += Q_DOT) {
          const cong =
            Math.sin((x / NUOC_O) * Math.PI * 2 + k * 1.7) * 2.2 +
            Math.sin((x / NUOC_O) * Math.PI * 6 + k) * 0.8;
          const y = y0 + cong;
          for (let d = 0.5; d <= 2; d += Q_DOT) dot(x, y + d, NUOC_TOI);
          dot(x, y, NUOC_SANG);
          dot(x, y + Q_DOT, NUOC_SANG);
          if ((Math.floor(x * ART) + k * 5) % 9 < 5) dot(x, y - Q_DOT, NUOC_BOT);
        }
      }
    } else if (loai === "thac") {
      /* MÀN NƯỚC ĐỔ: vệt dọc DÀY và SÁNG, dày hơn hẳn dòng chảy — nước rơi thì
         trắng xoá chứ không còn trong. Vệt chạy suốt chiều cao tấm nên khi trôi
         xuống nó liền một mạch, không thấy đầu cũng không thấy đuôi. */
      for (let x = 0; x < NUOC_O; x += Q_DOT) {
        const t = hash2(Math.floor(x * ART), 5, 23) % 5;
        const mau = t < 2 ? NUOC_BOT : t < 4 ? "#d8ecff" : NUOC_SANG;
        for (let y = 0; y < NUOC_O; y += Q_DOT) dot(x, y, mau);
      }
      // bọt vằn ngang, trôi cùng màn nước nên đọc ra được TỐC ĐỘ rơi
      for (let i = 0; i < 26; i++) {
        const y = (hash2(i, 9, 41) % (NUOC_O * ART)) / ART;
        const x0 = (hash2(i, 11, 13) % (NUOC_O * ART)) / ART;
        const dai = 2 + (hash2(i, 12, 7) % 5);
        for (let d = 0; d < dai; d += Q_DOT) {
          dot(x0 + d, y, "#ffffff");
          dot(x0 + d, y + Q_DOT, NUOC_SANG);
        }
      }
    } else {
      /* DÒNG CHẢY: vệt dài mảnh theo hướng chảy, làn nào tốc nấy. Vệt phải DÀI
         hơn một ô — chấm ngắn trôi ngang đọc ra là rác trôi, vệt dài mới đọc ra
         là cả khối nước đang trượt. */
      const doc = loai === "doc";
      for (let i = 0; i < 46; i++) {
        const lan = (hash2(i, 1, 31) % (NUOC_O * ART)) / ART;
        const batDau = (hash2(i, 2, 57) % (NUOC_O * ART)) / ART;
        const dai = 5 + (hash2(i, 3, 13) % 22);
        const t = hash2(i, 4, 7) % 3;
        const mau = t === 0 ? NUOC_BOT : t === 1 ? NUOC_SANG : NUOC_TOI;
        for (let d = 0; d < dai; d += Q_DOT) {
          // hai đầu vệt mảnh lại: vệt cụt hai đầu trông như bị cắt ngang
          const mep = d < 1 || d > dai - 1;
          const doc0 = batDau + d;
          if (doc) {
            dot(lan, doc0, mau);
            if (!mep) dot(lan + Q_DOT, doc0, mau);
          } else {
            dot(doc0, lan, mau);
            if (!mep) dot(doc0, lan + Q_DOT, mau);
          }
        }
      }
    }
    const pat = g.createPattern(c, "repeat");
    mangNuoc.set(loai, pat);
    return pat;
  }

  /** Bảng loại nước cho CẢ bản đồ, dựng lại khi mảng ô đổi (copy-on-write). */
  function bangLoaiNuoc(s: GameState, content: Content): Uint8Array {
    /* Cùng một cái khoá sai như cache nền, cùng một cái giá: `loaiTiles ===
       s.tiles` không bao giờ trúng trên nông trại đã gieo, nên MỖI KHUNG bảng
       này cấp phát ~17,5 KB, chạy BFS qua ~560 ô nước rồi quét cả bản đồ ba
       lượt — cho một bảng mà hôm nay không có gì đổi được nó.

       Nó chỉ phụ thuộc hai thứ: ô nào là nước (`t.g`), và cổng biển khai trong
       content (OTA đổi content lúc đang chạy, nên `content` phải nằm trong
       khoá). Cả hai đều không đổi khi cây lớn.

       Vì sao không khoá thẳng theo `mapId` cho gọn: hôm nay không chỗ nào
       trong `src/game/` gán `t.g`, nhưng đó là một LỜI HỨA, và lời hứa thì
       không có dây bẫy. Cờ do `quetO` gỡ là một PHÉP ĐO — mai thêm tính năng
       đào ao thì bảng tự dựng lại, không ai phải nhớ sửa chỗ này. */
    if (loaiXong && loaiContent === content && loaiNuoc.length === s.w * s.h)
      return loaiNuoc;
    loaiXong = true;
    loaiContent = content;
    const n = s.w * s.h;
    const out = new Uint8Array(n);
    const laNuoc = (i: number) => s.tiles[i]?.g === "water";

    /* BIỂN: loang từ CỔNG BIỂN ra. Mọi ô nước nối liền với chỗ thuyền buôn đi
       vào đều là biển. Hàng đợi là một mảng chỉ số, không đệ quy — vịnh có thể
       rộng vài trăm ô và đệ quy sẽ tràn ngăn xếp. */
    const cong = content.tiles.seaGate;
    if (cong && cong.map === s.mapId) {
      const goc = cong.y * s.w + cong.x;
      if (cong.x >= 0 && cong.x < s.w && cong.y >= 0 && cong.y < s.h && laNuoc(goc)) {
        const hang: number[] = [goc];
        out[goc] = NUOC_BIEN;
        for (let h = 0; h < hang.length; h++) {
          const i = hang[h]!;
          const x = i % s.w;
          const y = (i - x) / s.w;
          const ke = [
            x > 0 ? i - 1 : -1,
            x < s.w - 1 ? i + 1 : -1,
            y > 0 ? i - s.w : -1,
            y < s.h - 1 ? i + s.w : -1,
          ];
          for (const j of ke) {
            if (j < 0 || out[j] === NUOC_BIEN || !laNuoc(j)) continue;
            out[j] = NUOC_BIEN;
            hang.push(j);
          }
        }
      }
    }

    // độ dài dải nước liên tục qua mỗi ô, theo hàng và theo cột
    const ngang = new Uint16Array(n);
    const doc = new Uint16Array(n);
    for (let y = 0; y < s.h; y++) {
      let x = 0;
      while (x < s.w) {
        if (!laNuoc(y * s.w + x)) { x++; continue; }
        let e = x;
        while (e < s.w && laNuoc(y * s.w + e)) e++;
        for (let k = x; k < e; k++) ngang[y * s.w + k] = e - x;
        x = e;
      }
    }
    for (let x = 0; x < s.w; x++) {
      let y = 0;
      while (y < s.h) {
        if (!laNuoc(y * s.w + x)) { y++; continue; }
        let e = y;
        while (e < s.h && laNuoc(e * s.w + x)) e++;
        for (let k = y; k < e; k++) doc[k * s.w + x] = e - y;
        y = e;
      }
    }

    for (let i = 0; i < n; i++) {
      if (!laNuoc(i) || out[i] === NUOC_BIEN) continue;
      const h = ngang[i]!;
      const v = doc[i]!;
      if (v <= DONG_HEP && h >= v * DONG_TI_LE) out[i] = NUOC_NGANG;
      else if (h <= DONG_HEP && v >= h * DONG_TI_LE) out[i] = NUOC_DOC;
      else out[i] = NUOC_HO;
    }

    loaiNuoc = out;
    return out;
  }
  /** Chừa mấy ô quanh khung nhìn để camera trôi một quãng mà chưa phải dựng lại. */
  const NEN_LE = 3;

  function veNen(
    s: GameState,
    content: Content,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    mua: boolean,
  ) {
    nenX0 = Math.max(0, x0 - NEN_LE);
    nenY0 = Math.max(0, y0 - NEN_LE);
    const x1b = Math.min(s.w - 1, x1 + NEN_LE);
    const y1b = Math.min(s.h - 1, y1 + NEN_LE);
    nenCols = x1b - nenX0 + 1;
    nenRows = y1b - nenY0 + 1;
    nenTiles = s.tiles;
    nenMua = mua;
    nenNuoc = [];
    /* Canvas cache ở ĐỘ PHÂN GIẢI ẢNH (`TILE_PX`), không phải đơn vị thế giới:
       nó chứa sprite thật, và `put()` lo việc dán nó lại đúng cỡ. */
    const w = nenCols * TILE_PX;
    const h = nenRows * TILE_PX;
    if (nen.width !== w || nen.height !== h) {
      nen.width = w;
      nen.height = h;
      ng2.imageSmoothingEnabled = false;
    } else ng2.clearRect(0, 0, w, h);
    veNenVao(ng2, s, content, nenX0, nenY0, x1b, y1b, nenX0 * TILE_PX, nenY0 * TILE_PX, mua, nenNuoc);
  }

  /** Phần TĨNH của nền, vẽ vào một ngữ cảnh bất kỳ với gốc toạ độ cho trước. */
  function veNenVao(
    gg: CanvasRenderingContext2D,
    s: GameState,
    content: Content,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    ox: number,
    oy: number,
    mua: boolean,
    nuoc: number[] | null,
  ) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = s.tiles[y * s.w + x];
        if (!t) continue;
        const px = x * TILE_PX - ox;
        const py = y * TILE_PX - oy;

        // Mặt nước ĐỘNG mỗi khung — ghi lại chỗ rồi vẽ sau, ngoài cache.
        if (t.g === "water") {
          if (nuoc) nuoc.push(y * s.w + x);
          continue;
        }
        const base =
          t.g === "path"
            ? atlas.path
            : t.g === "wood"
              ? atlas.wood
              : t.g === "asphalt"
                ? atlas.asphalt
                : t.g === "concrete"
                  ? atlas.concrete
                  : atlas.grass;
        gg.drawImage(base[variantFor(x, y, base.length)]!, px, py);
        if (t.g === "asphalt") {
          const v = vachKeDuong((qx, qy) => at(s, qx, qy)?.g === "asphalt", x, y);
          for (const m of v.marks) gg.drawImage(atlas.roadMark[m][v.doc ? 1 : 0], px, py);
        }
        /* VŨNG NƯỚC trên lối đi khi trời mưa: một phần năm số ô, chọn theo băm
           toạ độ nên vũng nào ở đâu là ở đó suốt cơn mưa — không nhảy múa. */
        if (mua && t.g === "path" && hash2(x, y, 7) % 5 === 0)
          gg.drawImage(atlas.puddle[hash2(x, y, 9) % 2]!, px, py);

        /* GỜ ĐẤT ở mép giáp nước. */
        if (t.g !== "wood" && t.g !== "asphalt" && t.g !== "concrete") {
          if (at(s, x, y - 1)?.g === "water") gg.drawImage(atlas.bankRim.n, px, py);
          if (at(s, x, y + 1)?.g === "water") gg.drawImage(atlas.bankRim.s, px, py);
          if (at(s, x - 1, y)?.g === "water") gg.drawImage(atlas.bankRim.w, px, py);
          if (at(s, x + 1, y)?.g === "water") gg.drawImage(atlas.bankRim.e, px, py);
        }

        if (t.b) {
          const def = content.buildings[t.b];
          if (def?.kind === "floor") {
            const img = atlas.buildings[t.b];
            if (img) gg.drawImage(img, px, py);
          }
        }

        if (t.tilled) {
          const set = t.wet ? atlas.soilWet : atlas.soil;
          gg.drawImage(set[variantFor(x, y, set.length)]!, px, py);
          // viền lô đất ở cạnh giáp ô CHƯA cày
          if (!at(s, x, y - 1)?.tilled) gg.drawImage(atlas.soilEdge.n, px, py);
          if (!at(s, x, y + 1)?.tilled) gg.drawImage(atlas.soilEdge.s, px, py);
          if (!at(s, x - 1, y)?.tilled) gg.drawImage(atlas.soilEdge.w, px, py);
          if (!at(s, x + 1, y)?.tilled) gg.drawImage(atlas.soilEdge.e, px, py);
        }

        if (t.decor === "tuft") gg.drawImage(atlas.tuft, px, py);
      }
    }
  }

  function drawGround(
    s: GameState,
    content: Content,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    waterFrame: number,
    timeSec: number,
    mua: boolean,
  ) {
    const { rx, ry } = camera;
    const shoreFrame = Math.floor(waterFrame / 2) % 2;

    /* Cache còn dùng được không. Bốn điều kiện, và điều kiện đầu là chỗ Đợt 28
       sửa: KHÔNG hỏi "mảng ô có còn y nguyên không" (không bao giờ) mà hỏi "có
       ô nào trong VÙNG ĐÃ CACHE đổi hình vẽ không".

       Nhờ hộp bao, cày một ô ở góc bản đồ khác không bắt dựng lại vùng đang
       hiện — mà đó chính là thứ người làm thuê làm suốt ngày. */
    const cheoVung =
      doiHop !== null &&
      doiHop.x0 <= nenX0 + nenCols - 1 &&
      doiHop.x1 >= nenX0 &&
      doiHop.y0 <= nenY0 + nenRows - 1 &&
      doiHop.y1 >= nenY0;
    const hopLe =
      nenTiles !== null &&
      !banDoMoi &&
      !cheoVung &&
      nenMua === mua &&
      x0 >= nenX0 &&
      y0 >= nenY0 &&
      x1 <= nenX0 + nenCols - 1 &&
      y1 <= nenY0 + nenRows - 1;
    if (!hopLe) {
      dem.nenVe = 1;
      veNen(s, content, x0, y0, x1, y1, mua);
    }
    put(nen, nenX0 * TILE - rx, nenY0 * TILE - ry);

    // MẶT NƯỚC và BỌT SÓNG: động mỗi khung nên nằm ngoài cache.
    const loai = bangLoaiNuoc(s, content);
    /* Gốc tấm trôi theo thời gian VÀ trừ đi vị trí camera: trừ camera thì mặt
       nước neo vào thế giới, không trừ thì cả dòng sông trượt theo bước chân
       người chơi. Dòng chảy đi chậm hơn sóng — sóng lừng thì cuộn, dòng chảy
       thì trượt đều. */
    /* …và NEO VỀ LƯỚI PIXEL THIẾT BỊ. Không có `snapDev` thì gốc tấm là một
       toạ độ phân số trôi liên tục theo `timeSec`, nên mỗi khung hình cả mặt
       nước bị lấy mẫu lệch đi một phần pixel: đúng cái nhoè mà không một dòng
       `image-rendering` nào chữa được, vì nó xảy ra TRƯỚC lúc phóng to. Mọi
       chỗ khác trong lớp vẽ đã neo bằng `snapDev` từ Đợt 24; chỗ này bị bỏ
       quên vì nó đi qua `setTransform` của pattern chứ không qua `put`. */
    const troi = (v: number) => snapDev(((v % NUOC_O) + NUOC_O) % NUOC_O);
    const dat = (p: CanvasPattern | null, dx: number, dy: number) => {
      if (!p) return false;
      p.setTransform(new DOMMatrix().translateSelf(dx, dy).scaleSelf(Q_DOT, Q_DOT));
      return true;
    };
    const pHo = tamNuoc("ho");
    const pNgang = tamNuoc("ngang");
    const pDoc = tamNuoc("doc");
    const pBien = tamNuoc("bien");
    const pThac = tamNuoc("thac");
    // hồ tĩnh cũng trôi, nhưng RẤT chậm — mặt hồ đứng chết mới là thứ sai
    dat(pHo, troi(-rx + timeSec * 1.2), troi(-ry + timeSec * 0.7));
    dat(pNgang, troi(-rx + timeSec * 9), troi(-ry));
    dat(pDoc, troi(-rx), troi(-ry + timeSec * 9));
    dat(pBien, troi(-rx), troi(-ry - timeSec * 5));
    // thác đổ NHANH hơn hẳn mọi dòng chảy — đó là cả cái ý của một cái thác
    dat(pThac, troi(-rx), troi(-ry + timeSec * 64));
    for (const i of nenNuoc) {
      const x = i % s.w;
      const y = (i - x) / s.w;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const px = x * TILE - rx;
      const py = y * TILE - ry;
      const k = loai[i];
      const thac = s.tiles[i]?.prop === "waterfall";
      const pat = thac
        ? pThac
        : k === NUOC_BIEN
          ? pBien
          : k === NUOC_NGANG
            ? pNgang
            : k === NUOC_DOC
              ? pDoc
              : pHo;
      if (pat) {
        g.fillStyle = pat;
        g.fillRect(px, py, TILE, TILE);
      }
      /* CHÂN THÁC: ô ngay dưới một cái thác được đắp thêm một vòng bọt trắng
         xoáy. Không có nó thì màn nước dừng đột ngột ở ranh giới ô, và cái thác
         đọc ra là một tấm rèm trắng chứ không phải nước đang rơi xuống nước. */
      if (!thac && y > 0 && s.tiles[i - s.w]?.prop === "waterfall") {
        const pha = Math.floor(timeSec * 6);
        g.fillStyle = "#e8f4ff";
        for (let bx = 0; bx < TILE; bx += 2) {
          const h = 1 + ((hash2(x * 7 + bx, pha, 19) % 3) as number);
          g.fillRect(px + bx, py, 1.5, h * 0.6);
        }
        g.fillStyle = "#a8d4ff";
        for (let bx = 1; bx < TILE; bx += 3)
          g.fillRect(px + bx, py + 1.5 + (hash2(x + bx, pha, 5) % 2) * 0.5, 1, 0.5);
      }
      // Bốn cạnh đọc thẳng, không dựng mảng bộ đôi cho MỖI ô nước MỖI khung.
      SIDES_TMP[0]![1] = at(s, x, y - 1);
      SIDES_TMP[1]![1] = at(s, x, y + 1);
      SIDES_TMP[2]![1] = at(s, x - 1, y);
      SIDES_TMP[3]![1] = at(s, x + 1, y);
      const sides = SIDES_TMP;
      // BÓNG bờ trước, BỌT sau: bọt nằm ngay mép nước nên phải ở trên cùng,
      // còn cái bóng thì chìm xuống dưới nó.
      for (const [sd, nb] of sides)
        if (nb && nb.g !== "water") put(atlas.bank[sd], px, py);
      for (const [sd, nb] of sides)
        if (nb && nb.g !== "water") put(atlas.shore[sd][shoreFrame]!, px, py);
    }
  }

  /* ------------------------------------------------------------- CỬA MỞ RA

     Cường: "toà nhà thì cũng phải có hiệu ứng sprite: đóng cửa mở cửa… để diễn
     hoạt động tương tác".

     Độ mở của mỗi cánh cửa là trạng thái của LỚP VẼ, không phải của luật chơi:
     nó không đổi kết quả một cú bấm nào, không ai cần nó trong bản lưu, và nó
     phải mượt theo thời gian thực chứ không theo nhịp phút game. Giữ nó ở đây
     là giữ đúng chỗ — cùng lẽ với `phaLam` (pha vung của người làm).

     Khoá là chỉ số ô. Bảng tự dọn: ô nào đã đóng hẳn thì xoá khỏi bảng, nên nó
     không lớn quá số cửa đang mở. */
  const cuaMo = new Map<number, number>();
  /** Người tới gần hơn ngần này ô thì cửa mở. */
  const CUA_GAN = 1.6;
  let dtVe = 0;

  /** Độ mở hiện tại của cửa ở ô `i`, đã nới theo thời gian. 0 đóng, 1 mở hẳn. */
  function doMoCua(s: GameState, i: number, wcx: number, wcy: number): number {
    let gan = Math.hypot(s.player.x - wcx, s.player.y - wcy) <= CUA_GAN * TILE;
    if (!gan)
      for (const e of s.entities) {
        if (e.map !== s.mapId || (!e.worker && e.kind !== "vehicle")) continue;
        if (Math.hypot(e.x - wcx, e.y - wcy) <= CUA_GAN * TILE) {
          gan = true;
          break;
        }
      }
    const dich = gan ? 1 : 0;
    const cu = cuaMo.get(i) ?? 0;
    // 0,22 giây cho một lần mở hẳn — nhanh hơn thì giật, chậm hơn thì lề mề
    const buoc = Math.min(1, dtVe / 0.22);
    const moi = cu + (dich - cu) * (buoc > 0 ? buoc : 1);
    if (moi <= 0.002 && dich === 0) cuaMo.delete(i);
    else cuaMo.set(i, moi);
    return moi;
  }

  /** Bộ đệm bốn cạnh dùng lại cho mọi ô nước — không cấp phát mỗi ô mỗi khung. */
  const SIDES_TMP: [Side, Tile | undefined][] = [
    ["n", undefined],
    ["s", undefined],
    ["w", undefined],
    ["e", undefined],
  ];
  /** Cỡ chữ biển đã gán vào `g.font` lần trước. */
  let fontCo = -1;

  /* ---- lớp vật thể, sắp theo chiều sâu ---- */
  interface Item {
    /** mép dưới (world px) — khoá sắp xếp */
    base: number;
    run: () => void;
  }

  function isHouse(t: Tile | undefined): boolean {
    return !!t && (t.prop === "house" || t.prop === "door");
  }

  /** Ô kề có CÙNG công trình không — dùng cho hàng rào tự nối. */
  function sameBuild(s: GameState, x: number, y: number, id: string): boolean {
    if (x < 0 || y < 0 || x >= s.w || y >= s.h) return false;
    return s.tiles[y * s.w + x]?.b === id;
  }

  function collectEntities(
    s: GameState,
    content: Content,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    items: Item[],
    lights: Light[],
    timeSec: number,
    reduceMotion: boolean,
    wx: WeatherFx,
  ) {
    const { rx, ry } = camera;
    const sparkFrame = Math.floor(timeSec * 6) % 3;
    /* Trời đã tối chưa — dùng chung một mốc với lớp phủ đêm (`nightTint`), nên
       khói bếp và đom đóm hiện đúng lúc màn hình bắt đầu sẫm lại. */
    /* Tên `troiToi`, không phải `dem`: `dem` ở phạm vi ngoài là BỘ ĐẾM thống
       kê, và cái tên trùng ấy đã che nó đi trong suốt hàm này. */
    const troiToi = nightTint(s.minutes)[1] > 0.12;
    // Gió: ngọn cây lệch theo sin, mỗi ô lệch pha theo toạ độ nên cả ruộng
    // gợn sóng thay vì lắc đồng loạt. Tắt khi reduceMotion.
    const wind = reduceMotion ? 0 : wx.wind;
    /* Một ĐƠN VỊ THẾ GIỚI bằng bao nhiêu PIXEL THIẾT BỊ — cùng con số mà
       `snapDev` dùng. Số lát cắt để uốn cây đếm bằng đơn vị này, vì mắt người
       nhìn bằng pixel màn hình chứ không nhìn bằng đơn vị thế giới. */
    const kDev = camera.viewport.scale * camera.viewport.dpr;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = s.tiles[y * s.w + x];
        if (!t) continue;
        const px = x * TILE - rx;
        const py = y * TILE - ry;
        const base = y * TILE + TILE;
        const wcx = x * TILE + TILE / 2;
        const wcy = y * TILE;

        /* MẶT NƯỚC có mẻ thức ăn vừa rắc xuống: lớp phủ lên ô nước, xếp theo
           mép trên ô nên con cá bơi qua vẫn vẽ đè lên nó. */
        if (t.g === "water" && (t.trough ?? 0) > 0 && t.troughId) {
          const anh = atlas.pondFeed(t.troughId, mucAn(content, t.trough ?? 0));
          items.push({ base: y * TILE, run: () => put(anh, px, py) });
        }

        if (t.prop && t.prop !== "house" && t.prop !== "door") {
          const def = content.props[t.prop];
          /* CÁI MÁNG đổi hình theo mức đầy và theo MÓN đang nằm trong đó —
             không dùng hình tĩnh trong `atlas.props`. Máng cạn và máng đầy phải
             nhìn ra khác nhau từ bên kia sân, nếu không thì người chơi không có
             cách nào biết vì sao đàn bò đang đói. */
          /* CÔNG TRÌNH NHIỀU Ô (`prop.block`): chọn hình theo hai ô kề TRÁI–PHẢI
             cùng loại, nên ba ô chợ kề nhau ra một dãy nhà chứ không phải ba
             cái hộp giống hệt đứng cạnh nhau. Cùng khuôn với hàng rào tự nối,
             chỉ khác là nó chỉ nhìn ngang — xem `makeBlockTile`. */
          const khoi = content.props[t.prop]?.block ? atlas.blocks[t.prop] : undefined;
          /* CẦU có LAN CAN ở cạnh giáp nước (Đợt 21). Đọc bản đồ chứ không đọc
             "cùng prop": đầu cầu tiếp đất phải MỞ, nếu không người đi xuyên
             qua lan can khi lên cầu. */
          const lanCan = def?.bridge ? bridgeRail(s, x, y, t.prop) : null;
          /* CÂY CỎ ĐỔI MÀU THEO MÙA (`prop.seasonal`): xanh non mùa xuân, vàng
             cam mùa thu, bạc đi mùa đông. Khác lớp phủ màu mùa toàn màn ở chỗ
             nó là trạng thái của TỪNG VẬT — cái cây đổi lá, mặt đường thì không. */
          const theoMua = def?.seasonal ? atlas.propMua(t.prop, wx.season) : null;
          let img = theoMua
            ? theoMua
            : khoi
            ? khoi.get(
                blockVariantKey(
                  s.tiles[y * s.w + x - 1]?.prop === t.prop && x > 0,
                  s.tiles[y * s.w + x + 1]?.prop === t.prop && x < s.w - 1,
                ),
              )
            : lanCan
              ? (atlas.propMask[t.prop]?.get(tileMaskKey(lanCan)) ?? atlas.props[t.prop])
              : t.prop === "trough"
                ? atlas.trough(t.troughId ?? null, mucAn(content, t.trough ?? 0))
                : atlas.props[t.prop];
          /* Lan can cạnh DƯỚI vẽ SAU người đứng trên ô: base `y*TILE + TILE + 5`
             — actor trên ô này có base ≤ y*16+20,99 (bị đè), actor ở ô dưới có
             base ≥ y*16+21 (thắng). Đây là lần đầu `items` được dùng cho một
             lớp phủ đè lên actor. */
          if (lanCan?.down) {
            const over = atlas.propOver[t.prop];
            if (over) items.push({ base: y * TILE + TILE + 5, run: () => put(over, px, py) });
          }
          if (img && def && (def.frames ?? 0) >= 2 && def.anim === "door") {
            // cửa cuốn kho, cửa ra bản đồ trong nhà: thay hẳn hình theo độ mở
            const u = doMoCua(s, y * s.w + x, wcx, wcy);
            const k = Math.round(u * ((def.frames ?? 1) - 1));
            img = atlas.propKieu(t.prop, k) ?? img;
          }
          if (img) {
            const oy = def?.tall ? py - TILE : py;
            /* CÂY, BỤI, CỎ lay theo gió (`prop.sway` × `weather.wind`), cùng
               công thức với cây trồng bên dưới: cắt hai lát, lát trên dịch
               ngang theo sin lệch pha theo toạ độ ô. Trước Đợt 21 chỉ cây
               trồng lay còn cả rừng đứng chết — bão mà rừng im là bão giả. */
            const lay = def?.sway ?? 0;
            /* Biên độ tính bằng ĐƠN VỊ THẾ GIỚI và KHÔNG làm tròn: từ Đợt 24
               một pixel HD chỉ là nửa đơn vị, nên làm tròn về số nguyên là vứt
               mất nửa dải chuyển động và cây lay theo từng nấc giật. */
            const dich = lay > 0 && wind > 0 ? Math.sin(timeSec * 2.4 + x * 0.7 + y * 0.5) * 2.6 * wind * lay : 0;
            /* Vật thể ĐI QUA ĐƯỢC thì xếp lớp theo MÉP TRÊN của ô, không phải
               mép dưới.
               Vì sao: người chơi ĐỨNG ĐƯỢC lên chính cái ô đó — cầu gỗ, bụi cỏ,
               tấm biển, cái giường. Lấy mép dưới thì nhân vật (xếp theo `y` của
               mình, tức giữa ô) luôn nhỏ hơn và bị chính cái cầu mình đang đứng
               vẽ đè lên: ra hình "đi chui xuống dưới địa hình".
               Lấy mép trên thì cùng ô là vật nằm DƯỚI chân, còn ô ngay phía
               dưới vẫn có mép trên lớn hơn nhân vật nên vẫn vẽ đè lên như cũ —
               giữ nguyên cảm giác lội qua vạt cỏ cao. Vật ĐẶC không cần luật
               này: không ai đứng lên được nó. */
            const lopVat = def && def.solid === false ? y * TILE : base;
            /* Biên độ ĐỈNH quy ra pixel thiết bị: `2.6 × wind × sway` là đơn vị
               thế giới, mà một đơn vị thế giới bằng `scale × dpr` pixel thiết
               bị (xem `snapDev`). Hằng số suốt cả ngày, nên số lát không nhảy
               theo khung hình. */
            const nLat = soLat(!!def?.tall, 2.6 * wind * lay * kDev);
            if (nLat === 0 || Math.abs(dich) * kDev < LAT_IM_DEV)
              items.push({ base: lopVat, run: () => put(img, px, oy) });
            else {
              /* CÂY UỐN, không phải cây TRƯỢT.

                 Cường: "mấy cây lớn nữa hành động với gió… lay". Bản trước cắt
                 sprite làm HAI lát rồi đẩy lát trên sang ngang — cả cái tán dịch
                 nguyên khối, tức là cái cây bị xô chứ không bị uốn. Ở một bụi cỏ
                 cao 8 pixel thì không ai phân biệt được; ở một cây cao 32 pixel
                 thì nhìn ra ngay.

                 Nay cây CAO cắt làm bốn lát, mỗi lát dịch theo BÌNH PHƯƠNG độ
                 cao — gốc đứng yên, ngọn đi xa nhất, và đường thân cong thành
                 một cung. Đúng cách một thân cây chịu gió. Cây thấp (cỏ, bụi)
                 giữ hai lát: thêm lát chỉ tốn lệnh vẽ mà không ai thấy khác.

                 `img.width/height` là PIXEL ẢNH; cỡ trong thế giới nhỏ hơn đúng
                 `ART` lần. Nguồn cắt theo ảnh, đích đặt theo thế giới. */
              const wPx = img.width;
              const hPx = img.height;
              const wW = wPx / ART;
              const hW = hPx / ART;
              items.push({
                base: lopVat,
                run: () => {
                  dem.lat += nLat;
                  for (let i = 0; i < nLat; i++) {
                    // lát 0 là NGỌN (trên cùng), lát cuối là GỐC
                    const y0 = (i / nLat) * hW;
                    const y1b = ((i + 1) / nLat) * hW;
                    const cao = 1 - (i + 0.5) / nLat; // 1 ở ngọn, 0 ở gốc
                    const d = dich * cao * cao;
                    g.drawImage(
                      img,
                      0,
                      Math.round(y0 * ART),
                      wPx,
                      Math.round((y1b - y0) * ART),
                      px + d,
                      oy + y0,
                      wW,
                      y1b - y0,
                    );
                  }
                },
              });
            }
            const full = def?.hits ?? 0;
            if (full > 1 && t.hp > 0 && t.hp < full) {
              const hp = t.hp;
              items.push({ base: lopVat + 0.5, run: () => drawHits(px, oy, hp, full) });
            }
          }
          if (def?.interact === "SHOP") lights.push({ wx: wcx, wy: wcy + 6, r: 26, strength: 0.7 });
          else if (def?.interact === "SELL") lights.push({ wx: wcx, wy: wcy + 4, r: 24, strength: 0.6 });
          else if (def?.interact === "CRAFT") lights.push({ wx: wcx, wy: wcy + 6, r: 20, strength: 0.5 });
          else if (def?.interact === "PORTAL") lights.push({ wx: wcx, wy: wcy + 8, r: 30, strength: 0.8 });
          else if (def?.interact === "REFILL") lights.push({ wx: wcx, wy: wcy + 8, r: 18, strength: 0.4 });
        }

        switch (t.prop) {
          case "house":
          case "door": {
            const key = houseVariantKey(
              {
                up: isHouse(s.tiles[(y - 1) * s.w + x]),
                down: isHouse(s.tiles[(y + 1) * s.w + x]),
                left: x > 0 && isHouse(s.tiles[y * s.w + x - 1]),
                right: x < s.w - 1 && isHouse(s.tiles[y * s.w + x + 1]),
              },
              t.prop === "door",
            );
            const img = atlas.house.get(key);
            if (img) items.push({ base, run: () => put(img, px, py) });
            if (t.prop === "door") {
              /* CÁNH CỬA là một LỚP PHỦ vẽ đè lên ô nhà, không phải một bộ ô
                 nhà thứ hai: ô nhà đã có 32 biến thể tự nối, nhân thêm mười
                 kiểu mở là 320 hình dựng lúc mở game cho một thứ chỉ hiện ra
                 khi người chơi đứng sát cửa. Ở độ mở 0 lớp phủ rỗng, nên cửa
                 đóng không thêm một lệnh vẽ nào. */
              const dnum = content.props["door"]?.frames ?? 0;
              if (dnum >= 2) {
                const u = doMoCua(s, y * s.w + x, wcx, wcy);
                if (u > 0.02) {
                  const ov = atlas.propKieu("door", Math.round(u * (dnum - 1)));
                  if (ov) items.push({ base: base + 0.25, run: () => put(ov, px, py) });
                }
              }
            }
            /* KHÓI ống khói: chỉ ở NÓC (ô trên không phải nhà) và chỉ khi trong
               nhà có người — tức lúc trời đã tối hoặc trời lạnh. Một cái nhà im
               lìm suốt ngày đọc ra là nhà bỏ hoang; một sợi khói là thứ rẻ nhất
               nói "có người sống ở đây". Trang trí thuần: vị trí suy từ đồng hồ
               vẽ và toạ độ ô, không có một byte nào vào save. */
            const ongKhoi =
              t.prop === "house" &&
              // hàng NÓC: ô trên không phải nhà
              !isHouse(s.tiles[(y - 1) * s.w + x]) &&
              // và là ô ĐẦU của dãy mái — MỘT nhà một ống khói, không phải tám
              !(x > 0 && isHouse(s.tiles[y * s.w + x - 1]));
            if (ongKhoi && !reduceMotion && (troiToi || wx.season === 3)) {
              const gio = wx.wind;
              /* Cột khói CỐ Ý THẤP (14px): ngôi nhà nằm sát mép trên bản đồ, mà
                 camera không trôi lên quá mép được — khói bốc cao hơn thế là bốc
                 thẳng ra sau thanh HUD, tức là vẽ cho không ai xem. */
              for (let k = 0; k < 5; k++) {
                const pha = (timeSec * 0.5 + k * 0.2) % 1;
                const cao = pha * 14;
                const anh = atlas.smoke[Math.min(3, Math.floor(pha * 4))]!;
                // lệch sang phải một ô rưỡi: ống khói nằm trên mái, không ở mép
                const sx = px + 18 + Math.round(Math.sin(pha * 4 + x) * 2 + cao * gio * 0.4);
                const sy = py - 2 - Math.round(cao);
                const mo = (1 - pha) * 1.6;
                items.push({
                  base: base + 2,
                  run: () => {
                    g.globalAlpha = Math.min(1, mo);
                    put(anh, sx, sy);
                    g.globalAlpha = 1;
                  },
                });
              }
            }
            if (t.prop === "door") lights.push({ wx: wcx, wy: wcy + 8, r: 40, strength: 0.9 });
            else if (isHouse(s.tiles[(y - 1) * s.w + x]))
              lights.push({ wx: wcx, wy: wcy + 7, r: 22, strength: 0.5 });
            break;
          }
        }

        if (t.b) {
          const def = content.buildings[t.b];
          // Công trình TỰ NỐI (hàng rào): chọn sprite theo hàng xóm CÙNG id.
          // Phải nằm ở lớp thực thể có `base` chứ không phải lớp nền — hàng rào
          // đứng cao hơn mặt đất và phải che được nhân vật đi phía sau nó.
          const auto = def?.autotile ? atlas.autotiles[t.b] : undefined;
          const img = auto
            ? auto.get(
                tileMaskKey({
                  up: sameBuild(s, x, y - 1, t.b),
                  down: sameBuild(s, x, y + 1, t.b),
                  left: sameBuild(s, x - 1, y, t.b),
                  right: sameBuild(s, x + 1, y, t.b),
                }),
              )
            : atlas.buildings[t.b];
          if (def && img && def.kind === "object") {
            items.push({ base, run: () => put(img, px, py) });
          }
        }

        if (t.crop) {
          const frames = atlas.crops[t.crop.id];
          const def = content.crops[t.crop.id];
          const img = frames?.[Math.min(t.crop.stage, frames.length - 1)];
          const ripe = !!def && t.crop.stage >= def.growthDays.length;
          const sick = t.crop.sick === true;
          // héo: nắng gắt, chưa tưới, chưa chín — cây rũ xuống 1px và ngả vàng
          const wilt = wx.hot && wx.outdoor && !t.wet && !ripe && t.crop.stage > 0;
          if (img) {
            const cy = py + TILE - CROP_H + (wilt ? 1 : 0);
            // lệch ngọn theo gió: cắt ảnh thành hai lát, lát trên dịch ngang
            const sway = wind > 0 && t.crop.stage > 0
              ? Math.round(Math.sin(timeSec * 2.2 + x * 0.9 + y * 0.4) * 1.5 * wind)
              : 0;
            items.push({
              base,
              run: () => {
                if (sway === 0) put(img, px, cy);
                else {
                  /* Cắt hai lát: NGUỒN đo bằng pixel ẢNH (`*_PX`), ĐÍCH đo bằng
                     đơn vị THẾ GIỚI — hai hệ khác nhau nên phải viết rõ cả hai. */
                  const split = CROP_H - 8;
                  const splitPx = split * ART;
                  g.drawImage(img, 0, 0, TILE_PX, splitPx, px + sway, cy, TILE, split);
                  g.drawImage(
                    img, 0, splitPx, TILE_PX, CROP_PX - splitPx,
                    px, cy + split, TILE, CROP_H - split,
                  );
                }
                if (wilt) put(atlas.wiltOverlay, px, cy);
                if (sick) put(atlas.sickOverlay, px, cy);
              },
            });
          }
          // Cây CHÍN: dấu tới lứa cố định ở góc trên phải — thấy ngay từ xa,
          // không phụ thuộc chuyển động. Lấp lánh chỉ là gia vị thêm.
          if (ripe) {
            const bx = px + 10;
            const by = py - 6;
            items.push({ base: base + 1, run: () => put(atlas.ripeBadge, bx, by) });
            if (!reduceMotion) {
              const phase = (x * 7 + y * 13) % 3;
              const f = (sparkFrame + phase) % 3;
              const beat = Math.floor(timeSec * 2 + phase) % 3 === 0;
              if (beat) {
                const sx = px + ((x * 5) % 6) + 1;
                const sy = py - 2 + ((y * 3) % 5);
                items.push({ base: base + 1, run: () => put(atlas.sparkle[f]!, sx, sy) });
              }
            }
          }
        }
      }
    }
  }

  /** Vạch nhát còn lại trên đầu vật thể đang bị chặt/đập dở. */
  function drawHits(px: number, py: number, hp: number, full: number) {
    const w = full * 2 - 1;
    const x0 = px + Math.round((TILE - w) / 2);
    const y0 = py - 3;
    g.fillStyle = "rgba(0,0,0,0.6)";
    g.fillRect(x0 - 1, y0 - 1, w + 2, 3);
    for (let i = 0; i < full; i++) {
      g.fillStyle = i < hp ? "#ffd84a" : "#5a4632";
      g.fillRect(x0 + i * 2, y0, 1, 1);
    }
  }

  /** Vật phẩm đang cầm → loại sprite trong tay. */
  function heldKind(s: GameState, content: Content): { kind: HeldKind; steel: boolean } {
    const id = selectedItemId(s.inv, s.sel);
    const it = id ? parseItem(id) : null;
    if (!it) return { kind: "hand", steel: false };
    if (it.kind === "tool") {
      const t = content.tools[it.ref];
      const a = t?.action;
      const kind: HeldKind = a === "TILL" || a === "WATER" || a === "CHOP" || a === "MINE" ? a : "hand";
      return { kind, steel: it.ref.endsWith("2") };
    }
    if (it.kind === "seed") return { kind: "seed", steel: false };
    if (it.kind === "build") return { kind: "build", steel: false };
    return { kind: "hand", steel: false };
  }


  /**
   * Vật nuôi và sâu bọ. Đẩy vào cùng danh sách `items` với người chơi và dùng
   * ĐÚNG công thức `base` (`round(y) + 5`), nên con bò đi trước mặt thì che
   * nhân vật, đi sau lưng thì bị che — không cần luật riêng nào.
   */
  /**
   * KHUNG HÌNH của một người làm thuê.
   *
   * Cường: "mấy người làm ít động tác quá, tăng thêm cho tôi đi". Trước đây chỗ
   * này chỉ biết ba trạng thái: đang vung công cụ, đang đi, đứng yên. Nghĩa là
   * bê đồ, nghỉ mệt, nói chuyện, trú mưa và đứng chờ việc đều ra CÙNG một khung
   * đứng — nhìn ra nông trại thấy ba người đứng như tượng.
   *
   * Thứ tự nhường ở đây là thứ tự người chơi CẦN BIẾT: đang làm > mệt lả > trú
   * mưa > bê đồ > việc xã giao > đi > đứng. Một người vừa mệt vừa đang bê thì
   * cái đáng báo là MỆT, vì đó là thứ người chơi phải xử lý.
   */
  function khungNguoiLam(
    e: Entity,
    content: Content,
    lamViec: boolean,
    moving: boolean,
    timeSec: number,
  ): number {
    const w = e.worker;
    if (!w) return 0;
    if (lamViec) {
      /* Việc TƯỚI và việc GIEO không phải là vung cuốc: một bên nghiêng bình,
         một bên ngồi xổm xuống đất. Dùng chung khung vung cho cả ba thì cái
         diễn hoạt nói sai việc đang làm. */
      const pha = workFrame(e.ai.until, WORK_MINUTES, content.balance.actionImpact ?? 0.5);
      if (e.ai.job === "water" || e.ai.job === "pour") return PF_POUR;
      if (e.ai.job === "plant") return pha === PLAYER_ACT_FRAME ? PF_CROUCH : PF_POUR;
      return pha;
    }
    if (w.energy <= content.workers.restBelow) return e.ai.phase === "rest" ? PF_SIT : PF_TIRED;
    if (e.ai.phase === "shelter") return PF_WIPE;
    const dangBe = w.carry.some((v: { n: number } | null) => !!v && v.n > 0);
    if (e.ai.job === "chat") return PF_CHAT;
    if (e.ai.job === "pet") return PF_CROUCH;
    if (e.ai.job === "unload") return PF_CARRY;
    if (dangBe) return PF_CARRY;
    if (moving) return 1 + (Math.floor(e.anim * 8) % 4);
    /* ĐỨNG CHỜ: bốc một cử chỉ nhỏ theo (id · nhịp bốn giây). Cùng cách với
       việc vặt của vật nuôi — tất định, không tốn một byte save, và ba người
       đứng cạnh nhau không cùng làm một động tác. */
    const nhip = Math.floor(timeSec / 4);
    const r = hash2(e.id, nhip, 0x71c3) % 10;
    if (r === 0) return PF_WAVE;
    if (r === 1) return PF_POINT;
    if (r === 2) return PF_WIPE;
    return 0;
  }

  function drawActors(s: GameState, content: Content, items: Item[], timeSec: number) {
    const conSong = new Set<number>();
    const vpNow = camera.viewport;
    for (const e of s.entities) {
      if (e.map !== s.mapId) continue;
      if (!e.worker && e.kind !== "vehicle" && !content.animals[e.def]) continue;
      const moving = e.ai.path.length > 0;
      const frame = moving ? 1 + (Math.floor(e.anim * 5) % 2) : 0;
      /* Dáng và ký hiệu do `game/animals.ts` quyết định, không phải ở đây: nó
         đọc đúng những con số quyết định luật chơi, nên bong bóng "tới lứa"
         không bao giờ nói khác với thứ xảy ra khi bấm. */
      const mood = e.kind === "animal" ? animalMood(s, content, e) : null;
      /* NGƯỜI LÀM ĐANG LÀM VIỆC: dùng đúng hai khung giơ/chạm mà bộ sinh hình
         đã dựng sẵn cho mọi bộ đồ từ lâu nhưng chưa ai gọi tới. Trước Đợt 22 họ
         chỉ có khung đứng và khung đi, nên nhìn từ ngoài không cách nào biết
         một người đang cày hay đang đứng chơi. */
      const lamViec = !!e.worker && e.ai.phase === "work" && e.ai.until > 0;
      /* HẠT khi nhát chạm đất. Người làm không đi qua `stats` như người chơi
         (họ ghi thẳng vào ô đất), nên bus hiệu ứng bên main mù hoàn toàn với
         mọi việc họ làm. Bắt ngay tại đây: thấy khung đổi từ GIƠ sang CHẠM là
         bắn. Cố ý KHÔNG có tiếng — ba người mỗi người một nhát mỗi 1,5 phút
         game sẽ biến nông trại thành xưởng rèn, mà tiếng "cuốc" vốn là phản hồi
         cho cú bấm của NGƯỜI CHƠI; phát nó từ chỗ khác là phá đúng nghĩa ấy. */
      if (e.worker) {
        conSong.add(e.id);
        const khung = lamViec
          ? workFrame(e.ai.until, WORK_MINUTES, content.balance.actionImpact ?? 0.5)
          : 0;
        if (khung === PLAYER_ACT_FRAME && phaLam.get(e.id) !== PLAYER_ACT_FRAME && e.ai.tx >= 0) {
          const loai: BurstKind | null =
            e.ai.job === "till"
              ? "dust"
              : e.ai.job === "water"
                ? "water"
                : e.ai.job === "harvest" || e.ai.job === "clear"
                  ? "leaf"
                  : e.ai.job === "break"
                    ? "stone"
                    : null;
          if (loai) burst(loai, e.ai.tx, e.ai.ty);
        }
        phaLam.set(e.id, khung);
      }
      /* CẮT theo khung nhìn — và phải cắt Ở ĐÂY, sau khối `if (e.worker)` chứ
         không phải ngay đầu vòng lặp. Khối ấy cập nhật `conSong` và `phaLam`:
         cắt trước nó thì người làm ngoài khung bị xoá khỏi `phaLam`, và lúc
         bước vào khung, khung động tác đầu tiên trông như một nhát vừa chạm
         đất — họ bắn một cụm hạt MA ở chỗ chẳng ai làm gì. */
      if (ngoaiKhung(e.x, e.y, camera.rx, camera.ry, vpNow.viewW, vpNow.viewH)) {
        dem.culled++;
        continue;
      }
      const img = e.worker
        ? atlas.worker(e.worker.skin, e.dir, khungNguoiLam(e, content, lamViec, moving, timeSec))
        : e.kind === "vehicle"
          ? atlas.vehicle(e.def, e.dir, moving ? Math.floor(e.anim * 8) % 2 : 0)
          : atlas.animal(e.def, e.dir, frame, mood?.pose ?? "walk");
      if (!img) continue;
      /* Neo theo KÍCH THƯỚC hình, không theo TILE: xe nay 32×32. Tâm thân ở
         `e.y − 5`, bóng ở `e.y + 2` — đúng chỗ của bản 16×16 cũ, nên xe to lên
         mà không nhảy vị trí. Thuyền nhấp nhô ±1px theo đồng hồ vẽ (trang trí). */
      const nhap = e.kind === "vehicle" && content.vehicles[e.def]?.sea ? Math.round(Math.sin(timeSec * 2 + e.id)) : 0;
      /* `img.width/height` là PIXEL ẢNH, còn `px/py` là ĐƠN VỊ THẾ GIỚI: từ Đợt
         24 hai thứ ấy lệch nhau đúng `ART` lần. Quy về thế giới NGAY ở đây, một
         lần, rồi mọi phép neo bên dưới chỉ nói bằng một thứ đơn vị. */
      const imgW = img.width / ART;
      const imgH = img.height / ART;
      const px = snapDev(e.x - camera.rx) - imgW / 2;
      const py = snapDev(e.y - camera.ry) - imgH / 2 - 5 + nhap;
      // Người làm mệt cũng báo bằng lớp phủ giống con vật đói — một ký hiệu
      // cho một ý "cái này đang cần bạn để mắt tới".
      const doi = e.worker
        ? e.worker.energy <= content.workers.restBelow
        : e.kind === "vehicle"
          ? false
          : e.animal.fed <= 0;
      /* Một cái đầu 16px chỉ đọc được MỘT bong bóng. Thứ tự nhường: mệt lả và
         trú bão là chuyện của người chơi phải xử; rồi tới lời kêu thiếu hàng;
         rồi mới tới xã giao. */
      const emo: EmoteKind | null = e.worker
        ? e.worker.energy <= content.workers.restBelow
          ? "tired"
          : e.ai.phase === "shelter"
            ? "wet"
            : e.worker.want
              ? "want"
              : e.ai.job === "chat"
                ? "chat"
                : e.ai.job === "pet"
                  ? "love"
                  : e.ai.job === "unload"
                    ? "ready"
                    : null
        : (mood?.emote ?? null);
      /* Bong bóng nhấp nhô nhẹ và KHÔNG theo `e.anim`: `anim` chỉ chạy khi con
         vật đi, nên con đang nằm ngủ sẽ có cái bóng chết cứng. Dùng đồng hồ
         thật, lệch pha theo `e.id` để cả đàn không nhún cùng một nhịp. */
      const eBob = emo ? Math.round(Math.sin(timeSec * 2.2 + e.id) * 0.9) : 0;
      /* CÔNG CỤ trong tay người làm — cùng cách đặt với người chơi, chỉ khác
         nguồn: việc được giao quyết định, không phải ô hotbar. */
      let cong: { img: HTMLCanvasElement; x: number; y: number } | null = null;
      if (lamViec) {
        const t = e.ai.tx >= 0 ? s.tiles[e.ai.ty * s.w + e.ai.tx] : null;
        const pt = t?.prop ? (content.props[t.prop]?.tool ?? null) : null;
        const kind = heldForJob(e.ai.job, pt);
        if (kind !== "hand") {
          const hinh = atlas.held(kind, false);
          const gio =
            workFrame(e.ai.until, WORK_MINUTES, content.balance.actionImpact ?? 0.5) ===
            PLAYER_RAISE_FRAME;
          let tx = px + 4;
          let ty = py - 6;
          if (!gio) {
            if (e.dir === "left") { tx = px - 5; ty = py + 6; }
            else if (e.dir === "right") { tx = px + 13; ty = py + 6; }
            else if (e.dir === "up") { tx = px + 4; ty = py - 4; }
            else { tx = px + 4; ty = py + 12; }
          } else if (e.dir === "left") tx = px + 8;
          else if (e.dir === "right") tx = px;
          cong = { img: hinh, x: tx, y: ty };
        }
      }
      /* ĐỒ ĐANG VÁC, đội trên đầu — "hành động bưng bê" và "mang vác vật về
         kho" mà Cường xin, phục vụ bằng đúng một cơ chế. Lấy món ĐEO NHIỀU
         NHẤT: một người ôm mười quả cà chua và một quả trứng thì thứ đáng vẽ là
         quả cà chua. */
      let deo: HTMLCanvasElement | null = null;
      if (e.worker) {
        let nhieu = 0;
        let monId: string | null = null;
        for (const v of e.worker.carry) if (v && v.n > nhieu) { nhieu = v.n; monId = v.id; }
        if (monId) deo = atlas.icon(monId);
      }
      const nhun = deo && moving ? (Math.floor(e.anim * 8) % 2 === 0 ? 0 : 1) : 0;
      // Đang đội đồ thì bong bóng phải nhường chỗ, không thì hai thứ chồng nhau.
      const emoY = py - 9 + eBob - (deo ? 11 : 0);
      items.push({
        base: Math.round(e.y) + 5,
        run: () => {
          if (cong && e.dir !== "down") put(cong.img, cong.x, cong.y);
          put(img, px, py);
          if (cong && e.dir === "down") put(cong.img, cong.x, cong.y);
          if (deo) put(deo, px + imgW / 2 - 8, py - 11 + nhun);
          // Đói thì báo NGAY trên con vật, dùng lại đúng lớp phủ của cây bệnh —
          // người chơi đã học nghĩa của nó rồi, không phải học thêm ký hiệu mới.
          if (doi) put(atlas.sickOverlay, px + imgW / 2 - TILE / 2, py + imgH - TILE);
          if (emo) put(atlas.emote(emo), px + imgW / 2 - 4, emoY);
        },
      });
    }
    // Dọn khoá của người đã nghỉ việc — `MAX_ENTITIES` = 64 nên vòng này rẻ.
    if (phaLam.size > conSong.size)
      for (const id of [...phaLam.keys()]) if (!conSong.has(id)) phaLam.delete(id);
  }

  function drawPlayer(s: GameState, content: Content, items: Item[], timeSec: number) {
    const p = s.player;
    const dir = p.dir as PlayerDir;
    const frames = atlas.player[dir];
    const total = Math.max(0.0001, content.balance.actionSeconds ?? 0);
    const impact = Math.max(0, Math.min(1, content.balance.actionImpact ?? 0.5));
    // Pha vung: 0..1 theo thời gian đã trôi của nhát. Trước mốc chạm đất là
    // GIƠ (công cụ trên đầu), sau mốc là CHẠM (vung xuống) — đúng thứ tự mắt
    // cần thấy: giơ → bổ → đất lật (reducer áp dụng đúng lúc chuyển pha).
    const phase = s.busy > 0 ? 1 - s.busy / total : -1;
    const raising = phase >= 0 && phase < impact;
    const f =
      s.busy > 0 ? (raising ? PLAYER_RAISE_FRAME : PLAYER_ACT_FRAME) : p.moving ? 1 + (Math.floor(p.anim * 8) % 4) : 0;
    const img = frames[f] ?? frames[0]!;
    // Ghim theo lưới pixel THIẾT BỊ. Làm tròn về world px như trước thì nhân
    // vật giật ±1 world px trên nền đã trôi mượt — đổi một kiểu giật lấy kiểu
    // khác. Ở đây sai số còn dưới một pixel thiết bị, mắt không thấy.
    const px = snapDev(p.x - camera.rx) - TILE / 2;
    const py = snapDev(p.y - camera.ry) - 11;

    // Công cụ trong tay — chỉ khi đang vung. Giơ: trên đầu, hơi lệch về phía
    // sau; chạm: trước mặt theo hướng, thấp xuống. Nhấc dần theo pha cho có đà.
    let tool: { img: HTMLCanvasElement; x: number; y: number } | null = null;
    if (s.busy > 0) {
      const { kind, steel } = heldKind(s, content);
      if (kind !== "hand") {
        const t = atlas.held(kind, steel);
        const lift = raising ? Math.round((phase / Math.max(0.0001, impact)) * 3) : 0;
        let tx = px + 4;
        let ty = py - 6 - lift;
        if (!raising) {
          // chạm đất: đặt về phía ô đang làm
          if (dir === "left") { tx = px - 5; ty = py + 6; }
          else if (dir === "right") { tx = px + 13; ty = py + 6; }
          else if (dir === "up") { tx = px + 4; ty = py - 4; }
          else { tx = px + 4; ty = py + 12; }
        } else if (dir === "left") tx = px + 8;
        else if (dir === "right") tx = px;
        tool = { img: t, x: tx, y: ty };
      }
    }
    const toolRef = tool;
    /* VẬT ĐANG VÁC, đội trên đầu. Không có nó thì "đang vác một khúc gỗ" là
       một trạng thái vô hình: người chơi bấm nút thấy ghi ĐẶT XUỐNG mà không
       hiểu mình đang cầm cái gì. Nhún nhẹ theo bước đi để nó trông có sức nặng. */
    const vac = s.carry ? (atlas.props[s.carry] ?? null) : null;
    const nhun = vac && p.moving ? (Math.floor(p.anim * 8) % 2 === 0 ? 0 : 1) : 0;
    /* ĐANG NGỦ: vẽ nhân vật NẰM NGANG trên giường bằng cách xoay 90°. Không
       phải một bộ sprite nằm riêng, nhưng trong tranh nhìn từ trên xuống thì
       một hình đứng xoay ngang đọc ra ngay là "đang nằm" — và nó rẻ hơn hẳn
       việc vẽ thêm bốn khung hình chỉ dùng đúng một giây mỗi ngày. */
    const nam = s.sleeping;
    /* LẮC ĐẦU: dịch ngang theo sin trong nửa giây, cộng dấu mệt trên đầu. Lắc
       ngang chứ không nhấp nháy — nhấp nháy đọc ra là "hỏng", lắc đầu đọc ra là
       "không, tôi không làm được cái đó". */
    const lac = refuseAt >= 0 && timeSec - refuseAt < REFUSE_SEC;
    const lech = lac ? Math.round(Math.sin((timeSec - refuseAt) * 44) * 1.6) : 0;
    items.push({
      base: Math.round(p.y) + 5,
      run: () => {
        if (lac) put(atlas.emote("tired"), px + 4, py - 10);
        if (nam) {
          g.save();
          g.translate(px + TILE / 2, py + 11);
          g.rotate(Math.PI / 2);
          put(img, -TILE / 2, -11);
          g.restore();
          return;
        }
        // công cụ vẽ SAU (đè lên) người khi ở trước mặt/dưới, TRƯỚC khi giơ lên phía sau
        if (toolRef && raising && dir !== "down") put(toolRef.img, toolRef.x, toolRef.y);
        put(img, px + lech, py);
        if (toolRef && !(raising && dir !== "down")) put(toolRef.img, toolRef.x, toolRef.y);
        if (vac) put(vac, px + lech, py - 11 + nhun);
      },
    });
  }

  /**
   * Vệt mưa trong toạ độ THẾ GIỚI (trước g.restore) để cuốn theo camera. Vị trí
   * từng vệt hash theo (chỉ số, nhịp) — không state, không Math.random, và cùng
   * khung hình thì cùng hình.
   */
  /* ---------------------------------------------------------------- MƯA

     Trước Đợt 23 mỗi hạt mưa là một lệnh vẽ: 110 lệnh mỗi khung khi bão, tức
     hơn một phần ba tổng số lệnh của cả khung hình — cho một thứ trang trí.
     Và vì vị trí hạt băm lại theo từng "nhịp" 1/10 giây, cả màn mưa NHẢY CÓC
     mười lần mỗi giây thay vì rơi liền mạch.

     Giờ mưa là một MẢNG LẶP: một ô 64×64 có sẵn mấy hạt, dựng một lần, rồi tô
     kín màn bằng ĐÚNG MỘT lệnh `fillRect` với gốc mảng trôi theo thời gian.
     Rẻ hơn hai bậc, và rơi mượt thật vì gốc trôi liên tục. */
  const MUA_O = 64;
  let mangMua: CanvasPattern | null = null;
  function tamMua(): CanvasPattern | null {
    if (mangMua) return mangMua;
    /* Tấm mưa dựng ở ĐỘ PHÂN GIẢI ẢNH rồi thu lại `ART` lần lúc tô (xem
       `setTransform` bên dưới) — nếu dựng ở đơn vị thế giới thì hạt mưa 32px
       nằm nguyên cỡ và cả màn thành những vệt to gấp đôi. */
    const c = document.createElement("canvas");
    c.width = MUA_O * ART;
    c.height = MUA_O * ART;
    const cg = c.getContext("2d");
    if (!cg) return null;
    cg.imageSmoothingEnabled = false;
    /* Rải hạt bằng hàm băm thuần của chỉ số — cùng một tấm ở mọi máy, mọi lần
       chạy. Thưa vừa đủ: mật độ thật do việc lặp tấm quyết định. */
    for (let i = 0; i < 9; i++) {
      const x = (hash2(i, 3, 11) % MUA_O) * ART;
      const y = (hash2(i, 7, 29) % MUA_O) * ART;
      cg.drawImage(atlas.rainDrop[i % 3]!, x, y);
    }
    mangMua = g.createPattern(c, "repeat");
    return mangMua;
  }

  function drawRain(timeSec: number, storm: boolean, wind: number) {
    const p = tamMua();
    if (!p) return;
    const vp = camera.viewport;
    /* Hai lớp cho BÃO: cùng một tấm, lệch pha và lệch tốc, nên nhìn ra mưa dày
       mà vẫn chỉ tốn hai lệnh vẽ. */
    const lop = storm ? 2 : 1;
    for (let k = 0; k < lop; k++) {
      const toc = 140 + k * 90;
      /* Neo về lưới PIXEL THIẾT BỊ, cùng lý do như mặt nước: gốc tấm trôi ở
         toạ độ phân số thì mỗi khung cả màn mưa bị lấy mẫu lệch một phần
         pixel, và vệt mưa nhoè ra thay vì sắc nét. */
      const dy = snapDev((timeSec * toc) % MUA_O);
      const dx = snapDev((-timeSec * toc * wind * 0.4 + k * 23) % MUA_O);
      p.setTransform(new DOMMatrix().translateSelf(dx, dy).scaleSelf(1 / ART, 1 / ART));
      g.globalAlpha = k === 0 ? 1 : 0.7;
      g.fillStyle = p;
      g.fillRect(0, 0, vp.viewW, vp.viewH);
    }
    g.globalAlpha = 1;
  }

  /** Lớp phủ toàn màn: sương, tint âm u, tối bão + chớp. Sau lớp đêm. */
  /** Lớp phủ màu mùa — một div ngay sau canvas, không nhận chạm. */
  const tintEl = document.createElement("div");
  tintEl.className = "season-tint";
  tintEl.setAttribute("aria-hidden", "true");
  canvas.insertAdjacentElement("afterend", tintEl);
  let mauMuaKey = "";
  function datMauMua(st: WeatherFx["seasonTint"]): void {
    const de = st?.desat ?? 0;
    const alpha = st?.alpha ?? 0;
    const color = st?.color ?? "";
    const key = `${de}|${alpha}|${color}`;
    if (key === mauMuaKey) return;
    mauMuaKey = key;
    canvas.style.filter = de > 0.001 ? `saturate(${(1 - de).toFixed(3)})` : "";
    if (alpha > 0.001 && color) {
      tintEl.style.background = color;
      tintEl.style.opacity = String(alpha);
      tintEl.hidden = false;
    } else tintEl.hidden = true;
  }

  function drawWeatherScreen(timeSec: number, wx: WeatherFx, reduceMotion: boolean) {
    // Màu của MÙA vẽ trước và KHÔNG phụ thuộc trong nhà hay ngoài trời: mưa thì
    // chỉ rơi ngoài sân, còn mùa đông thì trong nhà cũng là mùa đông.
    /* MÀU MÙA không vẽ lên canvas nữa — hai việc, hai chỗ:

         · RÚT BÃO HOÀ: `filter: saturate()` trên chính phần tử canvas. Trước
           đây là một `fillRect` với `globalCompositeOperation = "saturation"`
           phủ TOÀN canvas ở độ phân giải thiết bị (1,5 triệu pixel trên một
           máy 412×915 @2x), 24 trong mỗi 48 ngày. Blend không tách kênh là thứ
           chậm nhất Canvas2D có, thường rơi về đường phần mềm trên Android.
           Đo trên máy này: mùa đông 14,0 ms/khung so với mùa xuân 6,9 — riêng
           lớp này ăn 7 ms. Bộ lọc CSS thì trình ghép GPU lo, gần như miễn phí.
         · PHỦ MÀU: một `<div>` nằm trên canvas, ngoài tầm bộ lọc — nên lớp màu
           mùa thu không bị rút mất sắc vàng cùng với cảnh (đúng cái lý do
           thứ tự "rút trước, phủ sau" ngày xưa phải giữ).

       Chỉ đụng DOM khi giá trị ĐỔI — mỗi lần sang mùa, không phải mỗi khung. */
    datMauMua(wx.seasonTint);
    if (!wx.outdoor) return;
    let color = "";
    let alpha = 0;
    if (wx.storm) {
      color = "#101828";
      alpha = 0.22;
    } else if (wx.overcast || wx.rain) {
      color = "#3a4658";
      alpha = 0.12;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (alpha > 0) {
      g.fillStyle = color;
      g.globalAlpha = alpha;
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.globalAlpha = 1;
    }
    if (wx.fog > 0.001) {
      g.fillStyle = "#e6ecf4";
      g.globalAlpha = Math.min(0.5, 0.5 * wx.fog);
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.globalAlpha = 1;
    }
    if (wx.storm && !reduceMotion) {
      // chớp: cứ ~7 giây loé một cái 2 khung, hash theo giây để tất định
      const sec = Math.floor(timeSec);
      const flash = (sec * 2654435761) % 7 === 0 && timeSec - sec < 0.12;
      if (flash) {
        g.fillStyle = "#ffffff";
        g.globalAlpha = 0.35;
        g.fillRect(0, 0, canvas.width, canvas.height);
        g.globalAlpha = 1;
      }
    }
  }

  /* ---- BIỂN CẮM ---------------------------------------------------------
     Biển KHÔNG nằm trong lưới ô. Nó đứng ở MÉP ô (`place: "edge"` trong
     props.json) và không chiếm ô nào: ô mang biển vẫn cày được, gieo được, đi
     qua được. Nên nó cũng không đi qua `t.prop` như mọi vật thể khác mà được
     gom riêng từ `content.tiles.signs` — vẫn xếp vào cùng danh sách `items` để
     ăn chung phép sắp lớp theo chiều sâu.

     Đổi lại, biển giờ có thể đứng ngay trên một luống đang trồng. Đó là lý do
     có `signFade`: tới gần thì cả tấm ván lẫn chữ mờ đi, nhường lại chỗ. */

  /** Trong ngần này ô thì biển mờ hết cỡ; ra tới `BIEN_RO` thì đục hẳn lại. */
  const BIEN_MO = 1.2;
  const BIEN_RO = 2.6;
  /** Mờ nhất còn bao nhiêu — không về 0, vì biến mất hẳn thì tưởng là lỗi vẽ. */
  const BIEN_DAY = 0.3;

  /**
   * Độ đục của một tấm biển theo khoảng cách tới người chơi.
   *
   * NGƯỢC CHIỀU với nhãn chữ, và cùng một lý do: chữ hiện ra khi lại gần vì ở
   * xa thì đọc tên lô nào cũng vô ích; còn tấm ván thì MỜ ĐI khi lại gần, vì
   * lúc đứng ngay đó mình đã biết đang ở lô nào rồi, mà nó lại che đúng chỗ
   * mình đang cày.
   */
  function signFade(s: GameState, bx: number, by: number): number {
    const d = Math.hypot(bx + 0.5 - s.player.x / TILE, by + 0.5 - s.player.y / TILE);
    if (d >= BIEN_RO) return 1;
    if (d <= BIEN_MO) return BIEN_DAY;
    return BIEN_DAY + (1 - BIEN_DAY) * ((d - BIEN_MO) / (BIEN_RO - BIEN_MO));
  }

  function collectSigns(
    s: GameState,
    content: Content,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    items: Item[],
  ) {
    const bien = content.tiles.signs;
    const img = atlas.props["sign"];
    if (!bien || !bien.length || !img) return;
    for (const b of bien) {
      // Biển MẶT TIỀN không có cột — nó là chữ gắn lên công trình, không phải
      // tấm ván cắm xuống đất. Chỉ `drawSignLabels` vẽ nó.
      if (b.style === "facade") continue;
      if (b.map !== s.mapId || b.x < x0 || b.x > x1 || b.y < y0 || b.y > y1) continue;
      const px = b.x * TILE - camera.rx;
      const py = b.y * TILE - camera.ry;
      /* Sprite vẽ sẵn nép vào mép TRÁI của ô; tấm nào gọi tên khu bên phải thì
         lật ngang để nó nép sang mép PHẢI — tức là nép về phía cái khu nó đang
         chỉ, ngay cạnh dòng chữ. Lật bằng phép vẽ chứ không thêm sprite thứ hai. */
      const e = (b.side ?? "e") === "e";
      const mo = signFade(s, b.x, b.y);
      /* Xếp lớp theo MÉP TRÊN của ô, đúng như mọi vật ĐI QUA ĐƯỢC: người chơi
         đứng được lên chính ô đó, lấy mép dưới thì nhân vật bị tấm biển vẽ đè
         lên và trông như đang chui xuống dưới địa hình. */
      items.push({
        base: b.y * TILE,
        run: () => {
          g.globalAlpha = mo;
          if (e) {
            g.save();
            g.translate(px + TILE, py);
            g.scale(-1, 1);
            put(img, 0, 0);
            g.restore();
          } else {
            put(img, px, py);
          }
          g.globalAlpha = 1;
        },
      });
    }
  }

  /**
   * Chữ trên các tấm BIỂN CẮM.
   *
   * Vẽ ở không gian THIẾT BỊ, không phải world px — cố ý. Tên khu là chữ Việt
   * có dấu; dựng một bộ phông pixel đủ dấu chỉ để in "Lô A1" là công việc của
   * cả một ngày mà kết quả vẫn khó đọc trên màn điện thoại. Ở lớp thiết bị thì
   * chữ nét theo đúng độ phân giải máy, và cỡ chữ neo theo `scale` nên phóng
   * to thu nhỏ bản đồ thì biển to nhỏ theo.
   *
   * Hai luật giữ cho nó KHÔNG bừa bộn — hai mươi hai tấm biển in chữ cùng lúc
   * là hai mươi hai vệt chữ nằm đè lên mặt đường và lên nhau:
   *
   *   · CHỈ hiện tấm nào ở GẦN. Người chơi cần biết mình đang đứng ở lô nào,
   *     chứ không cần đọc tên cái lô ở góc bản đồ. Mờ dần ở rìa để nó hiện ra
   *     và tắt đi chứ không bật/tắt phựt.
   *   · Nằm GỌN TRONG Ô của chính cái biển theo chiều dọc: đường chân chữ đặt
   *     ở đáy tấm ván, nên cả mảng chữ nằm trong 16px của ô đó. Trước đây nó
   *     vẽ tràn lên ô phía TRÊN — mà phía trên hàng lô đầu chính là đường trục.
   *
   * Vẽ SAU `drawNight`: cái biển vẫn phải đọc được lúc trời tối, đó là lúc
   * người chơi cần nó nhất.
   */
  function drawSignLabels(
    s: GameState,
    content: Content,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    scale: number,
    tx: number,
    ty: number,
  ) {
    const bien = content.tiles.signs;
    if (!bien || !bien.length) return;
    /** Trong ngần này ô thì hiện rõ; ra tới `XA` thì tắt hẳn. */
    const GAN = 5.5;
    const XA = 8.5;
    const px = s.player.x / TILE;
    const py = s.player.y / TILE;
    const co = 5 * scale; // 5 world px — vừa dưới nửa chiều cao tấm ván
    g.setTransform(1, 0, 0, 1, 0, 0);
    // Gán `font` là một phép phân tích chuỗi ở phía trình duyệt — chỉ làm khi cỡ đổi.
    if (co !== fontCo) {
      fontCo = co;
      g.font = `${co}px ui-sans-serif, system-ui, sans-serif`;
      g.textBaseline = "alphabetic";
    }
    for (const b of bien) {
      if (b.map !== s.mapId || b.x < x0 || b.x > x1 || b.y < y0 || b.y > y1) continue;
      const d = Math.hypot(b.x + 0.5 - px, b.y + 0.5 - py);
      if (d > XA) continue;
      const mo = (d <= GAN ? 1 : 1 - (d - GAN) / (XA - GAN)) * signFade(s, b.x, b.y);

      if (b.style === "facade") {
        /* BIỂN HIỆU trên mặt tiền: chữ căn GIỮA bề ngang công trình, đặt ở
           khoảng trên của ô — chỗ mà `makeBlockTile` để trống làm dải bạt, và
           chỗ mà mái nhà/mái kho vừa hết.

           Không có nền đục như biển cắm: nền ở đây là chính mặt tiền công
           trình, vốn đã tối và đặc. Thêm một hộp đen nữa thì thành cái nhãn
           dán đè lên, không ra biển hiệu. Thay vào đó là một viền chữ mảnh,
           đủ để đọc trên cả mái sáng lẫn tường tối. */
        const rong = b.w ?? 1;
        const cx = (b.x * TILE + (rong * TILE) / 2 - camera.rx) * scale + tx;
        const cy2 = (b.y * TILE + 6 - camera.ry) * scale + ty;
        g.globalAlpha = mo;
        g.textAlign = "center";
        g.lineWidth = Math.max(2, co * 0.42);
        g.strokeStyle = "rgba(18,13,8,0.92)";
        g.lineJoin = "round";
        g.strokeText(b.text, Math.round(cx), Math.round(cy2));
        g.fillStyle = "#ffe9a8";
        g.fillText(b.text, Math.round(cx), Math.round(cy2));
        g.textAlign = "left";
        g.globalAlpha = 1;
        continue;
      }
      /* Chữ NEO VÀO GÓC mà tấm biển nép vào, và trải về phía KHU nó gọi tên —
         không trải đều hai bên. Trải đều thì một nửa dòng chữ nằm trên lối đi
         phía bên kia, đúng cái làm nó trông như dán bừa lên mặt đường. */
      const e = (b.side ?? "e") === "e";
      const x0px = (b.x * TILE + (e ? TILE - 1 : 1) - camera.rx) * scale + tx;
      // Chân chữ ở đáy tấm ván (world y = 7 trong ô) → cả mảng chữ nằm TRONG ô.
      const cy = (b.y * TILE + 7 - camera.ry) * scale + ty;
      const w = g.measureText(b.text).width + co * 0.7;
      g.globalAlpha = mo;
      /* Nền đục sau chữ: biển đứng trên cỏ, trên lối mòn và trên đất cày —
         chữ trắng trơn thì có nền nó chìm nghỉm. */
      g.fillStyle = "rgba(24,18,10,0.78)";
      g.fillRect(
        Math.round(e ? x0px : x0px - w),
        Math.round(cy - co * 1.05),
        Math.round(w),
        Math.round(co * 1.35),
      );
      g.fillStyle = "#f3e2be";
      g.textAlign = e ? "left" : "right";
      g.fillText(b.text, Math.round(e ? x0px + co * 0.35 : x0px - co * 0.35), Math.round(cy));
      g.globalAlpha = 1;
    }
    g.textAlign = "left";
  }

  function drawNight(s: GameState, lights: Light[]) {
    const [color, alpha] = nightTint(s.minutes);
    if (alpha <= 0.001) return;
    const vp = camera.viewport;
    const k = vp.scale * NIGHT_QUALITY;

    ng.setTransform(1, 0, 0, 1, 0, 0);
    ng.globalCompositeOperation = "source-over";
    ng.clearRect(0, 0, night.width, night.height);
    ng.fillStyle = color;
    ng.globalAlpha = alpha;
    ng.fillRect(0, 0, night.width, night.height);
    ng.globalAlpha = 1;

    ng.globalCompositeOperation = "destination-out";
    for (const l of lights) {
      // camera THỰC, không phải camera đã snap: lớp đêm được blit có làm mượt
      // nên phải khớp với vị trí thế giới thật, không phải vị trí đã làm tròn.
      const lx = (l.wx - camera.x) * k;
      const ly = (l.wy - camera.y) * k;
      const lr = l.r * k;
      if (lx < -lr || lx > night.width + lr || ly < -lr || ly > night.height + lr) continue;
      /* Gradient dựng MỘT LẦN cho mỗi (bán kính, cường độ) rồi vẽ qua
         `translate` — trước đây `createRadialGradient` + ba `addColorStop` cho
         MỖI đèn MỖI khung sau 17 giờ (5–15 đèn/khung). */
      const grad = denGradient(lr, l.strength);
      ng.translate(lx, ly);
      ng.fillStyle = grad;
      ng.fillRect(-lr, -lr, lr * 2, lr * 2);
      ng.translate(-lx, -ly);
    }
    ng.globalCompositeOperation = "source-over";

    const s2 = vp.scale * vp.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(
      night,
      Math.round(vp.offX * vp.dpr),
      Math.round(vp.offY * vp.dpr),
      vp.viewW * s2,
      vp.viewH * s2,
    );
    g.imageSmoothingEnabled = false;
  }

  function draw(s: GameState, content: Content, cursor: Cursor | null, timeSec: number, opts: DrawOptions) {
    dem.drawImage = 0;
    dem.fillRect = 0;
    dem.items = 0;
    dem.culled = 0;
    dem.nenVe = 0;
    dem.lat = 0;
    /* Bấm giờ CHỈ ở bản DEV. `performance.now()` hai lần mỗi khung là rẻ, nhưng
       nó vẫn là một phép đo mà bản chơi thật không cần trả tiền. */
    const gio0 = import.meta.env?.DEV ? performance.now() : 0;
    const vp = camera.viewport;
    if (!(vp.cssW > 0) || !(vp.cssH > 0)) return;

    /* MỘT lượt quét ô cho cả khung hình. Ba chỗ đọc kết quả của nó — cache lớp
       nền, bảng loại nước, `isIndoor` — nên nó chạy TRƯỚC cả ba, đúng một lần,
       và đây là chỗ duy nhất gọi nó. */
    quetO(s);

    const dt = lastTime > 0 ? Math.min(0.1, Math.max(0, timeSec - lastTime)) : 0;
    dtVe = dt;
    lastTime = timeSec;
    lastTimeSec = timeSec;
    if (opts.reduceMotion) particles.length = 0;
    else stepParticles(dt);

    const scale = vp.scale * vp.dpr;

    /* ---- CHỐNG GIẬT: đắp phần LẺ của camera vào phép tịnh tiến ----------
       Camera trôi ở toạ độ thực nhưng `rx/ry` snap về world px NGUYÊN — đó là
       thứ giữ cho các hàng pixel không lăn tăn. Cái giá của nó: mỗi khung hình
       thế giới chỉ dịch được một số NGUYÊN world px. Đi bộ 78 px/s ở 60 khung
       hình là 1,3 px mỗi khung, làm tròn thành nhịp 1,2,1,1,2 — ở scale 5 tức
       là 5 rồi 10 CSS px xen kẽ, tốc độ biểu kiến nhảy gấp đôi rồi lại về, 60
       lần mỗi giây. Đó chính là cảm giác "giật giật".

       Phần lẻ (`camera.x - camera.rx`, luôn trong [-0,5; 0,5]) được cộng vào
       phép tịnh tiến CUỐI và làm tròn theo pixel THIẾT BỊ. Độ mịn của chuyển
       động tăng từ 1 world px lên 1 device px — ở scale 5, dpr 2 là mịn gấp 10
       lần. Mọi ô vẫn được vẽ ở offset world NGUYÊN so với nhau, và cả lớp chỉ
       dời đi một số nguyên pixel thiết bị, nên không có pixel nào bị to nhỏ
       không đều: độ nét giữ nguyên. */
    const fx = camera.x - camera.rx;
    const fy = camera.y - camera.ry;
    const tx = Math.round(vp.offX * vp.dpr - fx * scale);
    const ty = Math.round(vp.offY * vp.dpr - fy * scale);

    g.setTransform(1, 0, 0, 1, 0, 0);
    /* Chỉ tô viền đen KHI THẬT SỰ CÓ viền. `pickScale` chọn hệ số sao cho khung
       nhìn phủ kín canvas, nên trên mọi khổ máy `offX = offY = 0` (kịch bản 75
       khẳng định điều đó) — và khi ấy `WORLD_BG` ngay bên dưới tô đè lên đúng
       ngần ấy pixel. Một `fillRect` phủ kín canvas mỗi khung để rồi bị xoá
       ngay, cho một dải viền không tồn tại. */
    if (vp.offX > 0 || vp.offY > 0) {
      g.fillStyle = LETTERBOX;
      g.fillRect(0, 0, canvas.width, canvas.height);
    }

    g.save();
    // Cắt trong không gian THIẾT BỊ, không phải không gian đã tịnh tiến: khung
    // nhìn phải đứng yên đúng chỗ letterbox trong khi thế giới trượt bên trong.
    g.beginPath();
    g.rect(
      Math.round(vp.offX * vp.dpr),
      Math.round(vp.offY * vp.dpr),
      Math.round(vp.viewW * scale),
      Math.round(vp.viewH * scale),
    );
    g.clip();
    g.setTransform(scale, 0, 0, scale, tx, ty);

    g.fillStyle = WORLD_BG;
    g.fillRect(0, 0, vp.viewW, vp.viewH);

    drawVoid(s);
    const { x0, y0, x1, y1 } = camera.visibleTiles(s.w, s.h);
    // Gió mạnh thì mặt nước gợn nhanh hơn — cùng một dải khung, nhịp khác.
    const gio = opts.reduceMotion ? 0 : opts.weather.wind;
    const waterFrame = Math.max(0, Math.floor(timeSec * (4 + 4 * gio)));
    windX = opts.weather.outdoor ? gio * 40 : 0;
    drawGround(s, content, x0, y0, x1, y1, waterFrame, timeSec, opts.weather.outdoor && opts.weather.rain);

    /* LÁ BAY: gió từ 0,5 trở lên, mỗi 0,6 giây thả hai chiếc lá từ MỘT tán cây
       trong khung hình (chọn bằng băm nhịp, nên cùng cảnh cùng lúc là cùng cây).
       Hạt bị `windX` cuốn đi — đây là chỗ duy nhất gió "sờ" được. */
    if (gio >= 0.5 && opts.weather.outdoor) {
      const beat = Math.floor(timeSec / 0.6);
      if (beat !== laBeat) {
        laBeat = beat;
        let dem = 0;
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++) {
            const t = s.tiles[y * s.w + x];
            if (t?.prop && content.props[t.prop]?.tall) dem++;
          }
        if (dem > 0) {
          let k = hash2(beat, 3, 11) % dem;
          for (let y = y0; y <= y1; y++)
            for (let x = x0; x <= x1; x++) {
              const t = s.tiles[y * s.w + x];
              if (!(t?.prop && content.props[t.prop]?.tall)) continue;
              if (k-- === 0) burstAt("blow", x * TILE + TILE / 2, y * TILE - 6);
            }
        }
      }
    }
    /* GIỌT BẮN dưới chân người đi trong mưa — bốn lần một giây, chỉ khi đang đi. */
    if (opts.weather.outdoor && opts.weather.rain && !opts.reduceMotion && s.player.moving) {
      const beat = Math.floor(timeSec / 0.25);
      if (beat !== giotBeat) {
        giotBeat = beat;
        burstAt("splash", s.player.x, s.player.y + 6);
      }
    }

    // Ô đang nhắm — vẽ DƯỚI lớp vật thể để không che mất cây.
    if (cursor) {
      const pulse = opts.reduceMotion ? 0.9 : 0.72 + 0.28 * Math.sin(timeSec * 5);
      g.globalAlpha = pulse;
      put(
        cursor.ok ? atlas.cursorOk : atlas.cursorNo,
        cursor.x * TILE - camera.rx,
        cursor.y * TILE - camera.ry,
      );
      g.globalAlpha = 1;
    }
    // Dấu đích đang đi tới: vòng vàng co lại. Khác con trỏ để người chơi phân
    // biệt "sẽ tới đó" và "sẽ làm ở đó".
    if (opts.navTarget) {
      const f = opts.reduceMotion ? 0 : Math.floor(timeSec * 6) % 3;
      put(
        atlas.navMark[f]!,
        opts.navTarget.x * TILE - camera.rx,
        opts.navTarget.y * TILE - camera.ry,
      );
    }

    // Xem trước tuyến sắp xây: ô nào đặt được thì khung xanh, không thì khung đỏ.
    // Người chơi thấy TRƯỚC nó sẽ chạy đâu và tốn bao nhiêu, không phải xây rồi
    // mới biết mình vẽ nhầm.
    if (opts.lineCells) {
      g.globalAlpha = 0.85;
      for (const c of opts.lineCells)
        put(
          c.ok ? atlas.cursorOk : atlas.cursorNo,
          c.x * TILE - camera.rx,
          c.y * TILE - camera.ry,
        );
      g.globalAlpha = 1;
    }

    const items: Item[] = [];
    const lights: Light[] = [];
    collectEntities(s, content, x0, y0, x1, y1, items, lights, timeSec, opts.reduceMotion, opts.weather);
    collectSigns(s, content, x0, y0, x1, y1, items);
    drawActors(s, content, items, timeSec);
    drawPlayer(s, content, items, timeSec);
    lights.push({ wx: s.player.x, wy: s.player.y, r: 46, strength: 0.85 });

    dem.items = items.length;
    items.sort((a, b) => a.base - b.base);
    for (const it of items) it.run();

    /* ---- MŨI TÊN ĐỎ: mục tiêu của nút chính -------------------------------
       Vẽ TRÊN lớp vật thể, khác hẳn con trỏ (vẽ dưới). Con trỏ là một ô sáng
       nên nằm dưới cây là đúng; mũi tên thì CHỈ VÀO một vật, mà nằm dưới thì
       đúng những mục tiêu đáng chỉ nhất — cây cao, mái nhà, con bò — lại che
       mất nó. Vẫn nằm trong `g.save()` của lớp thế giới nên toạ độ không đổi. */
    if (opts.aimArrow) {
      const f = opts.reduceMotion ? 0 : Math.floor(timeSec * 5) % 3;
      if (!opts.aimArrowOk) g.globalAlpha = 0.55;
      put(
        atlas.aimArrow[f]!,
        opts.aimArrow.x * TILE - camera.rx,
        /* -6 chứ không phải -11 (cả chiều cao mũi tên): mũi tên phải nằm TRÊN
           chính ô mục tiêu, mũi chạm khoảng giữa ô. Treo hẳn nó lên phía trên
           mép ô thì nó rơi vào ô KỀ — mà ô kề rất hay là chỗ nhân vật đang
           đứng, nên trông như mũi tên cắm vào đầu người chơi. */
        opts.aimArrow.y * TILE - camera.ry - 6,
      );
      g.globalAlpha = 1;
    }

    /* ---- CÔN TRÙNG: bướm ban ngày, đom đóm ban đêm --------------------
       Sinh vật trang trí thuần: KHÔNG có thực thể nào trong save, không một
       lần tìm đường nào. Vị trí là hàm thuần của (chỉ số con, đồng hồ vẽ), nên
       chúng bay giống nhau ở mọi máy và biến mất sạch khi tắt chuyển động.

       Vì sao đáng làm: nông trại ban ngày im phăng phắc trừ lúc có con vật đi
       ngang, còn ban đêm thì tối om và trống. Mấy chấm sáng bay lượn là thứ rẻ
       nhất biến một bức tranh tĩnh thành một nơi ĐANG SỐNG. */
    if (!opts.reduceMotion && opts.weather.outdoor && !opts.weather.rain) {
      const banDem = nightTint(s.minutes)[1] > 0.12;
      const n = banDem ? 14 : 10;
      const vw = camera.viewport.viewW;
      const vh = camera.viewport.viewH;
      for (let i = 0; i < n; i++) {
        /* Neo vào TOẠ ĐỘ THẾ GIỚI chứ không vào màn hình: con bướm đậu ở một
           góc ruộng thì đi xa rồi quay lại nó vẫn ở đó, chứ không dán cứng vào
           khung nhìn mà trôi theo camera. */
        const ox = (hash2(i, 11, 3) % 4096) - 2048;
        const oy = (hash2(i, 23, 7) % 4096) - 2048;
        const toc = 0.35 + (hash2(i, 31, 5) % 100) / 260;
        const wx0 = ox + Math.sin(timeSec * toc + i) * 34;
        const wy0 = oy + Math.cos(timeSec * toc * 0.8 + i * 2) * 26;
        // gói về quanh camera để chúng luôn có mặt đâu đó trong khung
        const px2 = Math.round(((wx0 - camera.rx) % (vw + 64) + vw + 64) % (vw + 64)) - 32;
        const py2 = Math.round(((wy0 - camera.ry) % (vh + 64) + vh + 64) % (vh + 64)) - 32;
        if (banDem) {
          const nhay = Math.floor(timeSec * 3 + i * 1.7) % 4;
          if (nhay === 3) continue; // tắt một nhịp — đom đóm chớp chứ không sáng đều
          put(atlas.firefly[nhay]!, px2, py2);
        } else {
          const mau = i % atlas.buom.length;
          const f = Math.floor(timeSec * 9 + i) % 2;
          put(atlas.buom[mau]![f]!, px2, py2);
        }
      }
    }

    drawParticles();
    if (opts.weather.outdoor && opts.weather.rain && !opts.reduceMotion) drawRain(timeSec, opts.weather.storm, gio);

    g.restore();

    drawNight(s, lights);
    drawSignLabels(s, content, x0, y0, x1, y1, scale, tx, ty);
    drawWeatherScreen(timeSec, opts.weather, opts.reduceMotion);

    /* Mờ DẦN theo `busy` còn lại thay vì đứng ở một mức cố định: nhìn thấy màn
       tối dần mới ra "thiếp đi", còn một bức màn xám bật lên rồi tắt thì chỉ
       là một khung hình lạ chen vào giữa. */
    const nguSec = Math.max(0.0001, content.balance.sleepSeconds ?? 0);
    const fade = s.sleeping
      ? Math.max(opts.fade, Math.min(1, 1 - s.busy / nguSec))
      : opts.fade;
    if (fade > 0.001) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = `rgba(0,0,0,${Math.min(1, fade)})`;
      g.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (gio0) dem.ms = performance.now() - gio0;
  }

  applyViewport();
  return {
    applyViewport,
    stats: () => ({ ...dem }),
    draw,
    burst,
    refuse: () => {
      refuseAt = lastTimeSec;
    },
  };
}

/* ============================================================================
   CAMERA — cầu nối duy nhất giữa WORLD-SPACE và SCREEN-SPACE.

   Luật của cả dự án: mọi thứ trong game (vị trí, tầm với, va chạm, camera) tính
   bằng **world px** (1 ô = TILE world px). Không một dòng logic nào được nghĩ
   bằng pixel màn hình. File này là chỗ DUY NHẤT biết màn hình to bao nhiêu.

       world px ──▶ camera (rx, ry) ──▶ × scale ──▶ + letterbox ──▶ CSS px
                                                              ──▶ × dpr ──▶ device px

   Bốn việc nó làm:

   1. **Chọn khung nhìn theo SỐ Ô, không theo pixel.** Màn to hay nhỏ thì vẫn
      thấy xấp xỉ ngần ấy ô — đó là điều kiện để game công bằng giữa điện thoại
      và desktop.
   2. **Chọn hệ số phóng nguyên** khi có thể, vì pixel art phóng theo hệ số lẻ
      sẽ có ô pixel to nhỏ không đều.
   3. **Snap camera về world px nguyên.** Đây là thứ chống rung (shimmer): camera
      trôi ở toạ độ thực nhưng luôn VẼ ở toạ độ nguyên, nên các hàng pixel không
      nhảy qua nhảy lại giữa hai cột màn hình.
   4. **Bám nhân vật (mặc định: luôn ở chính giữa) và kẹp vào biên bản đồ.**
      Bản đồ có kích thước CỐ ĐỊNH (40×30 ô); chỉ khung nhìn mới co giãn theo
      màn hình. Sát mép bản đồ thì camera dừng lại nên nhân vật rời khỏi tâm —
      đó là chủ ý, thà vậy còn hơn lộ vùng trống ngoài bản đồ.
============================================================================ */

/* ---------------------------------------------------------------------------
   Vì sao 9–14 ô theo cạnh ngắn:

   · Dưới 9 ô: trên điện thoại thì nhân vật to chà bá nhưng không thấy gì quanh
     mình — không biết cây nào đã chín, không thấy vòi tưới với tới đâu.
   · Trên 14 ô: mỗi ô còn quá ít pixel màn hình, chi tiết pixel art (quả trên
     cây, đất ẩm hay khô) nhoè thành một đám màu. Trên desktop lớn thì tệ hơn:
     thấy gần hết nông trại nên chẳng còn gì để khám phá.

   Trong thực tế thuật toán dưới đây cho ra khoảng 9,3–12,5 ô ở mọi khổ máy phổ
   biến — chênh nhau chưa tới 1,4 lần, đủ công bằng.

   MAX_TILES_LONG là trần cho TRỤC DÀI (điện thoại ngang 20:9, màn ultrawide).
   Trần này KHÔNG được thi hành bằng viền đen: cắt khung nhìn rồi bù hai dải
   đen là cách duy nhất người dùng nhìn ra ngay mà không đoán nổi tại sao —
   trên cửa sổ 1920×684 nó ăn mất 192px mỗi bên. Thi hành bằng cách PHÓNG TO
   cho vừa khung: thà thấy ít ô hơn một chút còn hơn mất hẳn một phần màn hình.
--------------------------------------------------------------------------- */
export const MIN_TILES_SHORT = 9;
export const MAX_TILES_SHORT = 14;
export const MAX_TILES_LONG = 32;

export interface CameraConfig {
  tile: number;
  minTilesShort: number;
  maxTilesShort: number;
  maxTilesLong: number;
  /** nửa chiều rộng/cao vùng chết, tính bằng Ô */
  deadZoneTilesX: number;
  deadZoneTilesY: number;
  /** tốc độ bám: càng lớn càng bám sát, 0 = không làm mượt */
  followLambda: number;
  maxDpr: number;
  /**
   * Ở mép bản đồ thì làm gì:
   *   · "clamp"  — dừng camera lại, nhân vật rời khỏi tâm (không lộ vùng ngoài).
   *   · "center" — nhân vật LUÔN ở tâm; renderer vẽ viền rừng cho phần ngoài biên.
   *
   * Mặc định "center". Lý do: trên điện thoại dọc, khung nhìn cao ~20 ô mà bản
   * đồ chỉ 30 hàng, nên ở nửa trên (khu nhà — nơi chơi nhiều nhất) camera kẹp và
   * nhân vật bị đẩy lên tận dưới HUD, đúng chỗ toast và chip mục tiêu che.
   * Với lối chơi chạm-để-đi, tâm màn hình phải là nhân vật, mọi lúc.
   */
  edgeMode: "clamp" | "center";
}

export const DEFAULT_CAMERA_CONFIG: CameraConfig = {
  tile: 16,
  minTilesShort: MIN_TILES_SHORT,
  maxTilesShort: MAX_TILES_SHORT,
  maxTilesLong: MAX_TILES_LONG,
  // Không vùng chết: nhân vật LUÔN nằm giữa khung nhìn. Đây là lựa chọn có chủ
  // ý — với lối chơi bấm-để-đi, tâm màn hình chính là thứ người chơi ngắm vào,
  // nên nhân vật lệch tâm sẽ làm việc ước lượng khoảng cách bị sai.
  deadZoneTilesX: 0,
  deadZoneTilesY: 0,
  // 0 = bám tức thì. Vì camera vẫn snap về pixel nguyên nên thế giới trôi đều
  // từng pixel một, không giật.
  followLambda: 0,
  maxDpr: 2,
  edgeMode: "center",
};

export interface Viewport {
  /** kích thước khung chứa, CSS px */
  cssW: number;
  cssH: number;
  dpr: number;
  /** CSS px trên mỗi world px */
  scale: number;
  /** hệ số phóng có phải số nguyên không (ảnh hưởng độ nét) */
  integerScale: boolean;
  /** phần thế giới nhìn thấy, world px */
  viewW: number;
  viewH: number;
  /** viền letterbox, CSS px (khung nhìn được căn giữa trong khung chứa) */
  offX: number;
  offY: number;
  orientation: "portrait" | "landscape";
  tilesX: number;
  tilesY: number;
}

/** Mức phóng do người chơi chọn (Cài đặt → Khung nhìn). Mỗi mức là một DẢI SỐ
 *  Ô trên cạnh ngắn — vẫn giữ nguyên luật "khung nhìn định nghĩa bằng số ô",
 *  chỉ dịch dải đi: `near` cho màn nhỏ/mắt kém, `far` cho tablet và desktop. */
export type ZoomLevel = "near" | "normal" | "far";

export const ZOOM_TILES: Record<ZoomLevel, { min: number; max: number }> = {
  near: { min: 7, max: 11 },
  normal: { min: MIN_TILES_SHORT, max: MAX_TILES_SHORT },
  far: { min: 12, max: 18 },
};

export interface Camera {
  /** vị trí thực (float) — dùng cho tính toán mượt */
  readonly x: number;
  readonly y: number;
  /** vị trí ĐÃ SNAP về world px nguyên — LUÔN dùng cái này để vẽ */
  readonly rx: number;
  readonly ry: number;
  readonly viewport: Viewport;

  /** đổi kích thước khung chứa → tính lại scale/viewport. true nếu có thay đổi. */
  setSize(cssW: number, cssH: number, dpr: number): boolean;
  /** đổi mức phóng → tính lại viewport với kích thước hiện có. true nếu có thay đổi. */
  setZoom(level: ZoomLevel): boolean;
  setWorld(worldW: number, worldH: number): void;
  /** bám mục tiêu: vùng chết → làm mượt → kẹp biên → snap */
  follow(targetX: number, targetY: number, dt: number): void;
  /** nhảy thẳng tới mục tiêu, không làm mượt (vào game, nạp save, ngủ dậy) */
  jumpTo(targetX: number, targetY: number): void;

  /** world px → CSS px trong khung chứa */
  worldToScreen(wx: number, wy: number): { x: number; y: number };
  /** CSS px trong khung chứa → world px; null nếu nằm ngoài khung nhìn */
  screenToWorld(sx: number, sy: number): { x: number; y: number } | null;
  /** phạm vi ô cần vẽ, đã cộng vành đai cho vật thể cao tràn vào */
  visibleTiles(worldTilesX: number, worldTilesY: number): {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

/* -------------------------------------------------------------------------- */

/**
 * Chọn hệ số phóng. Ưu tiên SỐ NGUYÊN lớn nhất mà vẫn nằm trong dải số ô cho phép.
 *
 * Số ô thấy được trên cạnh ngắn = short / (scale × tile) — tức là scale càng lớn
 * thì càng thấy ÍT ô. Vậy hai ràng buộc đổi thành một dải cho scale:
 *
 *     scale ≥ short / (maxTiles × tile)   ← để không thấy quá nhiều ô
 *     scale ≤ short / (minTiles × tile)   ← để không thấy quá ít ô
 *
 * Lấy số nguyên LỚN NHẤT trong dải = nhiều chi tiết nhất mà vẫn đủ tầm nhìn.
 * Màn quá nhỏ để chứa nổi một bội nguyên nào thì mới chịu dùng hệ số lẻ.
 */
function pickScale(
  shortSide: number,
  longSide: number,
  cfg: CameraConfig,
): { scale: number; integer: boolean } {
  const unit = cfg.tile;
  const lo = Math.ceil(shortSide / (cfg.maxTilesShort * unit));
  const hi = Math.floor(shortSide / (cfg.minTilesShort * unit));
  /* Trần trục dài là RÀNG BUỘC CỨNG, không phải mong muốn: dưới ngưỡng này thì
     khung nhìn phủ kín khung chứa, trên ngưỡng thì phải bù bằng viền đen. Nên
     nó nâng SÀN của scale lên, và nâng trước khi chọn. */
  const loDai = Math.ceil(longSide / (cfg.maxTilesLong * unit));
  const san = Math.max(lo, loDai);
  if (hi >= san && san >= 1) return { scale: hi, integer: true };

  /* Hai ràng buộc đá nhau: khung quá dài so với cạnh ngắn, không bội nguyên
     nào vừa cả hai. Bỏ trần "ít nhất ngần này ô" chứ KHÔNG bỏ trần trục dài —
     mất vài ô ở cạnh ngắn thì người chơi không nhận ra, còn hai dải đen thì
     nhận ra ngay. Vẫn lấy số nguyên: pixel art phóng theo hệ số lẻ có ô pixel
     to nhỏ không đều. */
  if (san >= 1) return { scale: san, integer: true };

  // Cửa sổ tí hon: không bội nguyên nào ≥ 1 vừa. Ngắm giữa dải rồi bù độ nét
  // bằng cách snap camera về world px nguyên.
  const target = (cfg.minTilesShort + cfg.maxTilesShort) / 2;
  return { scale: shortSide / (target * unit), integer: false };
}

export function createCamera(config: Partial<CameraConfig> = {}): Camera {
  const cfg: CameraConfig = { ...DEFAULT_CAMERA_CONFIG, ...config };

  let worldW = 0;
  let worldH = 0;
  /** setZoom đổi dải số ô nhưng kích thước không đổi — phải ép setSize tính lại. */
  let zoomDirty = false;
  let x = 0;
  let y = 0;
  let rx = 0;
  let ry = 0;

  const vp: Viewport = {
    cssW: 0,
    cssH: 0,
    dpr: 1,
    scale: 1,
    integerScale: true,
    viewW: 0,
    viewH: 0,
    offX: 0,
    offY: 0,
    orientation: "landscape",
    tilesX: 0,
    tilesY: 0,
  };

  /** Kẹp một trục vào biên thế giới. Thế giới nhỏ hơn khung nhìn thì CĂN GIỮA
   *  (trả về giá trị âm) — thà để viền nền còn hơn kéo lố ra ngoài bản đồ. */
  function clampAxis(pos: number, view: number, world: number): number {
    if (world <= view) return (world - view) / 2;
    if (cfg.edgeMode === "center") {
      // Cho phép lộ tối đa NỬA khung nhìn ngoài biên — đúng bằng mức cần để
      // nhân vật đứng sát mép vẫn ở tâm. Không hơn, để bấm bản đồ nhỏ không
      // kéo camera ra hư vô.
      return Math.max(-view / 2, Math.min(world - view / 2, pos));
    }
    return Math.max(0, Math.min(world - view, pos));
  }

  function snap() {
    // Snap về WORLD px nguyên. Đây là điểm mấu chốt chống rung: nếu vẽ ở toạ độ
    // thực, mỗi khung hình các hàng pixel sẽ rơi vào ô màn hình khác nhau và
    // toàn cảnh trông như đang lăn tăn.
    rx = Math.round(x);
    ry = Math.round(y);
  }

  function reclamp() {
    x = clampAxis(x, vp.viewW, worldW);
    y = clampAxis(y, vp.viewH, worldH);
    snap();
  }

  return {
    get x() {
      return x;
    },
    get y() {
      return y;
    },
    get rx() {
      return rx;
    },
    get ry() {
      return ry;
    },
    get viewport() {
      return vp;
    },

    setSize(cssW, cssH, dpr) {
      // Khung chứa có thể đang 0×0 (tab ẩn, phần tử chưa layout). Giữ nguyên
      // thông số cũ thay vì tính ra scale=1 rồi kẹt ở đó — nếu không, chuột sẽ
      // bấm lệch ô cho tới lần resize kế tiếp.
      if (!(cssW > 0) || !(cssH > 0)) return false;
      const d = Math.max(1, Math.min(cfg.maxDpr, dpr || 1));
      if (cssW === vp.cssW && cssH === vp.cssH && d === vp.dpr && !zoomDirty) return false;
      zoomDirty = false;

      const short = Math.min(cssW, cssH);
      const long = Math.max(cssW, cssH);
      const { scale, integer } = pickScale(short, long, cfg);

      /* Khung nhìn = ĐÚNG khung chứa chia cho scale. Không cắt gì cả: trần
         trục dài đã được `pickScale` lo bằng cách nâng scale, nên tới đây
         `viewW`/`viewH` chắc chắn đã nằm trong trần. Cắt thêm ở đây là quay
         lại đúng cái viền đen vừa bỏ. */
      const viewW = cssW / scale;
      const viewH = cssH / scale;

      vp.cssW = cssW;
      vp.cssH = cssH;
      vp.dpr = d;
      vp.scale = scale;
      vp.integerScale = integer;
      vp.viewW = viewW;
      vp.viewH = viewH;
      vp.offX = (cssW - viewW * scale) / 2;
      vp.offY = (cssH - viewH * scale) / 2;
      vp.orientation = cssH >= cssW ? "portrait" : "landscape";
      vp.tilesX = viewW / cfg.tile;
      vp.tilesY = viewH / cfg.tile;

      reclamp();
      return true;
    },

    setZoom(level) {
      const z = ZOOM_TILES[level];
      if (cfg.minTilesShort === z.min && cfg.maxTilesShort === z.max) return false;
      cfg.minTilesShort = z.min;
      cfg.maxTilesShort = z.max;
      zoomDirty = true;
      if (!(vp.cssW > 0) || !(vp.cssH > 0)) return false;
      const changed = this.setSize(vp.cssW, vp.cssH, vp.dpr);
      // Sau khi đổi scale, nhân vật phải về lại tâm ngay — không để camera
      // "trôi" từ vị trí cũ sang.
      return changed;
    },

    setWorld(w, h) {
      worldW = w;
      worldH = h;
      reclamp();
    },

    follow(targetX, targetY, dt) {
      const dzx = cfg.deadZoneTilesX * cfg.tile;
      const dzy = cfg.deadZoneTilesY * cfg.tile;

      // Vùng chết: nhân vật đi loanh quanh gần tâm thì camera đứng yên. Không có
      // nó thì mỗi bước chân đều kéo camera, nhìn rất say.
      const cx = x + vp.viewW / 2;
      const cy = y + vp.viewH / 2;
      let tx = x;
      let ty = y;
      const dx = targetX - cx;
      const dy = targetY - cy;
      if (dx > dzx) tx += dx - dzx;
      else if (dx < -dzx) tx += dx + dzx;
      if (dy > dzy) ty += dy - dzy;
      else if (dy < -dzy) ty += dy + dzy;

      tx = clampAxis(tx, vp.viewW, worldW);
      ty = clampAxis(ty, vp.viewH, worldH);

      // Làm mượt theo hàm mũ — không phụ thuộc tốc độ khung hình, nên máy 30fps
      // và máy 120fps cho cảm giác bám giống nhau.
      const k = cfg.followLambda > 0 ? 1 - Math.exp(-cfg.followLambda * dt) : 1;
      x += (tx - x) * k;
      y += (ty - y) * k;

      // Đuôi của hàm mũ dài vô tận; dưới nửa pixel thì cứ cho bằng luôn để
      // camera thật sự đứng yên thay vì bò mãi.
      if (Math.abs(tx - x) < 0.5) x = tx;
      if (Math.abs(ty - y) < 0.5) y = ty;

      reclamp();
    },

    jumpTo(targetX, targetY) {
      x = clampAxis(targetX - vp.viewW / 2, vp.viewW, worldW);
      y = clampAxis(targetY - vp.viewH / 2, vp.viewH, worldH);
      snap();
    },

    /* Hai hàm chiếu dùng camera THỰC (x, y) chứ không dùng bản đã snap: renderer
       đắp phần lẻ vào phép tịnh tiến cuối, nên thứ người chơi NHÌN THẤY nằm ở
       vị trí camera thực. Chiếu bằng bản đã snap sẽ lệch tới nửa world px so
       với hình đang hiện — chỗ bấm không đúng chỗ nhìn. */
    worldToScreen(wx, wy) {
      return {
        x: vp.offX + (wx - x) * vp.scale,
        y: vp.offY + (wy - y) * vp.scale,
      };
    },

    screenToWorld(sx, sy) {
      const lx = (sx - vp.offX) / vp.scale;
      const ly = (sy - vp.offY) / vp.scale;
      // Ngoài khung nhìn (đang ở vùng letterbox) thì coi như không bấm trúng gì.
      if (lx < 0 || ly < 0 || lx >= vp.viewW || ly >= vp.viewH) return null;
      return { x: lx + x, y: ly + y };
    },

    visibleTiles(worldTilesX, worldTilesY) {
      const t = cfg.tile;
      return {
        // vành đai: cây cao 2 ô nên phải quét thêm một hàng phía trên
        x0: Math.max(0, Math.floor(rx / t) - 1),
        y0: Math.max(0, Math.floor(ry / t) - 2),
        x1: Math.min(worldTilesX - 1, Math.ceil((rx + vp.viewW) / t)),
        y1: Math.min(worldTilesY - 1, Math.ceil((ry + vp.viewH) / t) + 1),
      };
    },
  };
}

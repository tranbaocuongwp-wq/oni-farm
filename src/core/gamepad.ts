/* ============================================================================
   GAMEPAD — tay cầm chơi game, coi như một ĐƯỜNG VÀO nữa của `input.ts`.

   Vì sao tách file: bàn phím và cảm ứng là hệ SỰ KIỆN — trình duyệt gọi mình
   khi có gì xảy ra. Tay cầm thì ngược lại, nó là hệ HỎI VÒNG: không có sự kiện
   nào cả, mỗi khung hình phải tự đi đọc trạng thái và tự so với khung trước để
   biết nút nào vừa được bấm. Trộn hai mô hình đó vào một file thì mọi hàm ở đó
   phải mang theo câu hỏi "cái này chạy vì sự kiện hay vì vòng lặp".

   Ba thứ quyết định cách viết ở đây:

   · CHỈ BẮT SƯỜN LÊN. `getGamepads()` trả về "nút đang giữ", nhưng game cần
     "nút VỪA bấm". Không so với khung trước thì giữ nút A một giây là game
     nhận sáu mươi lệnh dùng công cụ.
   · KHÔNG GIỮ THAM CHIẾU đối tượng Gamepad. Chrome trả về ẢNH CHỤP mới mỗi lần
     gọi; giữ lại cái cũ thì `buttons` đóng băng vĩnh viễn ở khoảng khắc đó —
     một cái bẫy kinh điển và im lặng.
   · VÙNG CHẾT hình tròn, không phải theo từng trục. Cắt theo trục thì đẩy chéo
     nhẹ sẽ ra đúng một hướng thẳng, và nhân vật đi giật theo tám hướng.

   Sơ đồ nút theo chuẩn "standard mapping" (Xbox, PlayStation, và gần như mọi
   tay cầm USB/Bluetooth đời mới đều báo cáo theo chuẩn này):

       A(0) dùng · B(1) tương tác · X(2) tự động làm · Y(3) balo
       LB(4)/RB(5) đổi ô hotbar · LT(6) chạy · RT(7) dùng
       Back(8) bản đồ · Start(9) menu · L3(10) xây dựng · R3(11) sơ đồ nút
       D-pad(12–15) đi
============================================================================ */

/** Ngưỡng dưới mức này coi như không đẩy. Cần đủ lớn: tay cầm cũ luôn trôi
 *  một chút quanh tâm, và trôi 0,1 là nhân vật tự đi mãi về một phía.
 *
 *  Chỉnh được từ Cài đặt, vì đây là con số hỏng theo PHẦN CỨNG chứ không theo
 *  sở thích: một cần gạt mòn quá ngưỡng này thì nhân vật tự đi mãi và người
 *  chơi không có cách nào chữa. */
export const DEAD_MUC = { hep: 0.16, normal: 0.28, rong: 0.42 } as const;
let DEAD: number = DEAD_MUC.normal;

/** Đặt vùng chết. Gọi từ `applySettings`. */
export function setPadDead(muc: keyof typeof DEAD_MUC): void {
  DEAD = DEAD_MUC[muc] ?? DEAD_MUC.normal;
}

/**
 * ĐẢO TRỤC Y của hai cần gạt.
 *
 * Chỉ đảo trục ngắm/điều hướng, KHÔNG đảo trục đi: "đẩy lên để đi lên" là quy
 * ước của game nhìn từ trên xuống, không ai đảo cái đó. Thứ người ta quen đảo
 * là trục NGẮM — thói quen mang từ game bắn súng sang, và với ai đã quen thì
 * gạt ngược mỗi lần là một lần vấp.
 */
let invY = false;
export function setPadInvertY(on: boolean): void {
  invY = on;
}

/**
 * GÁN LẠI NÚT: bảng đổi chỉ số nút vật lý → chỉ số nút mà game hiểu.
 *
 * Vì sao cần dù đã có standard mapping: standard mapping nói đúng nút nào nằm
 * ở đâu trên mặt tay cầm, chứ không nói người chơi MUỐN nút nào làm việc gì.
 * Người quen Nintendo cầm tay cầm Xbox sẽ muốn đảo A với B, vì trên máy Switch
 * nút "xác nhận" nằm ở vị trí mà Xbox gọi là B.
 *
 * Bảng rỗng = mặc định. Chỉ đổi được các nút MẶT (0–3) và VAI (4–7): đổi Start
 * hay L3 thì người chơi tự khoá mình ra khỏi menu, mà không có menu thì không
 * có đường nào đặt lại.
 */
const DOI_DUOC = new Set([0, 1, 2, 3, 4, 5, 6, 7]);
let doiNut: Record<number, number> = {};
export function setPadRemap(map: Record<number, number>): void {
  doiNut = {};
  for (const [tu, den] of Object.entries(map)) {
    const a = Number(tu);
    if (DOI_DUOC.has(a) && DOI_DUOC.has(den) && a !== den) doiNut[a] = den;
  }
}
export function getPadRemap(): Readonly<Record<number, number>> {
  return doiNut;
}

/** Nút được coi là "đang bấm" từ mức này. Cò analog (LT/RT) cũng dùng ngưỡng
 *  này nên chúng hành xử y hệt nút thường. */
const PRESS = 0.5;

/** Ngưỡng BẬT và NHẢ của một nấc gạt. Khác nhau (trễ ngưỡng) để cần gạt để hờ
 *  quanh ngưỡng không làm ô chọn nhảy qua nhảy lại mỗi khung hình. */
const ON = 0.6;
const OFF = 0.35;

/** Giữ nguyên hướng bao lâu thì mới bắt đầu lặp, và sau đó lặp mỗi bao lâu.
 *  Bấm một cái phải đi đúng MỘT ô — đó là lý do quãng chờ đầu phải dài. */
const HOLD_MS = 420;
const REPEAT_MS = 150;

/** Tên nút, đánh theo chỉ số của standard mapping. */
export const PAD = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  BACK: 8,
  START: 9,
  L3: 10,
  R3: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
} as const;

export interface PadState {
  /** Có tay cầm nào đang cắm không. */
  connected: boolean;
  /** Hướng đi mong muốn, độ dài <= 1 (đã gộp cần gạt trái và D-pad). */
  axis: { x: number; y: number };
  /** Đẩy gần hết cỡ, hoặc đang giữ cò trái. */
  running: boolean;
  /** Các nút VỪA được bấm ở khung này (sườn lên). */
  pressed: Set<number>;
  /** Các nút đang giữ. */
  held: Set<number>;
  /** Hướng vừa GẠT trên cần trái / D-pad, dùng để chuyển tiêu điểm trong menu.
   *  Gạt và giữ thì lặp lại chậm, y như giữ phím mũi tên. */
  navDir: { x: number; y: number } | null;
  /**
   * Hướng vừa GẠT trên CẦN PHẢI. Cùng nhịp lặp với `navDir`.
   *
   * Cần trái đi, cần phải chọn đồ — đúng thói quen của người chơi Don't Starve
   * Together, và nó giải phóng D-pad khỏi việc phải kiêm hai vai. Hai ngón cái
   * làm hai việc khác nhau cùng lúc: vừa chạy vừa đổi công cụ mà không phải
   * dừng lại.
   */
  aimDir: { x: number; y: number } | null;
}

/** Hãng tay cầm — quyết định TÊN nút hiện cho người chơi, không đổi chỉ số. */
export type PadBrand = "xbox" | "playstation" | "nintendo" | "generic";

export interface PadInfo {
  connected: boolean;
  /** Chuỗi tự khai của tay cầm, ví dụ "Xbox Wireless Controller (STANDARD GAMEPAD)". */
  id: string;
  brand: PadBrand;
  /**
   * Trình duyệt có nhận ra đây là "standard gamepad" không.
   *
   * Đây là câu hỏi QUAN TRỌNG NHẤT của cả file. `mapping === "standard"` nghĩa
   * là trình duyệt đã tự sắp lại: nút 0 chắc chắn là nút mặt dưới, 9 chắc chắn
   * là Start. Chuỗi rỗng nghĩa là KHÔNG BIẾT — chỉ số nút là thứ tự thô của
   * phần cứng, và mỗi hãng một kiểu. Gán bừa Y = balo lên một tay cầm như thế
   * thì người chơi bấm "nút phía trên" lại ra mở balo, hoặc chẳng ra gì.
   */
  standard: boolean;
  /** Số nút và số trục THẬT sự có. Không quảng cáo nút mà tay cầm không có. */
  buttons: number;
  axes: number;
}

export interface Gamepad2 {
  /** Tay cầm nào đang cắm, và nó có gì. */
  info(): PadInfo;
  /** Đọc trạng thái của khung hình này. Gọi ĐÚNG MỘT LẦN mỗi khung. */
  poll(nowMs: number): PadState;
  /** Rung, nếu tay cầm hỗ trợ. Im lặng bỏ qua nếu không. */
  rumble(ms: number, strong?: number): void;
}

const EMPTY: PadState = {
  connected: false,
  axis: { x: 0, y: 0 },
  running: false,
  pressed: new Set(),
  held: new Set(),
  navDir: null,
  aimDir: null,
};

/** Đoán hãng từ chuỗi `id`. Chỉ để hiện ĐÚNG TÊN nút — Switch gọi nút mặt dưới
 *  là B còn Xbox gọi là A, mà cả hai đều là chỉ số 0. Đoán sai thì chữ sai, chứ
 *  hành vi không đổi, nên đây là chỗ được phép đoán. */
function brandOf(id: string): PadBrand {
  const s = id.toLowerCase();
  if (/xbox|xinput|microsoft/.test(s)) return "xbox";
  if (/dualsense|dualshock|playstation|sony|054c|wireless controller/.test(s)) return "playstation";
  if (/switch|joy-?con|nintendo|pro controller|057e/.test(s)) return "nintendo";
  return "generic";
}

/** Tên nút theo hãng, đánh theo CHỈ SỐ standard mapping. */
const NAMES: Record<PadBrand, Record<number, string>> = {
  xbox: { 0: "A", 1: "B", 2: "X", 3: "Y", 4: "LB", 5: "RB", 6: "LT", 7: "RT", 8: "View", 9: "Menu", 10: "LS", 11: "RS" },
  // Nút mặt dưới của PlayStation là ✕, bên phải là ○ — vẫn là chỉ số 0 và 1.
  playstation: { 0: "✕", 1: "○", 2: "□", 3: "△", 4: "L1", 5: "R1", 6: "L2", 7: "R2", 8: "Create", 9: "Options", 10: "L3", 11: "R3" },
  // Nintendo ĐẢO tên so với Xbox ở cùng vị trí: nút dưới là B, nút phải là A.
  nintendo: { 0: "B", 1: "A", 2: "Y", 3: "X", 4: "L", 5: "R", 6: "ZL", 7: "ZR", 8: "-", 9: "+", 10: "LS", 11: "RS" },
  generic: { 0: "Nút 1", 1: "Nút 2", 2: "Nút 3", 3: "Nút 4", 4: "L1", 5: "R1", 6: "L2", 7: "R2", 8: "Select", 9: "Start", 10: "L3", 11: "R3" },
};

/** Tên hiển thị của một nút trên tay cầm đang dùng. */
export function padButtonName(info: PadInfo, index: number): string {
  return NAMES[info.brand][index] ?? `Nút ${index + 1}`;
}

const NO_PAD: PadInfo = { connected: false, id: "", brand: "generic", standard: false, buttons: 0, axes: 0 };

export function createGamepad(): Gamepad2 {
  let prev = new Set<number>();
  /** Lần gạt hướng gần nhất, và hướng đó — cho từng cần gạt. */
  let navAt = 0;
  let navLast = { x: 0, y: 0 };
  let aimAt = 0;
  let aimLast = { x: 0, y: 0 };
  let padIndex: number | null = null;

  /** Tay cầm ĐANG dùng. Ưu tiên cái vừa có tín hiệu, để cắm hai cái không loạn. */
  /* Một tay cầm THẬT phải có nút. Sau khi rút dây, vài trình duyệt còn để lại
     cái vỏ rỗng `{connected:true, buttons:[]}` trong danh sách; nhận cái vỏ đó
     là game tưởng vẫn đang cắm tay cầm, mà `body[data-input="pad-std"]` thì
     giấu joystick ảo và tắt `pointer-events` của cụm nút — người chơi mất luôn
     đường nhập cuối cùng và chỉ còn cách tải lại trang. Hỏi ở MỘT chỗ, dùng
     cho cả ba nhánh dưới. */
  const thuc = (p: Gamepad | null | undefined): p is Gamepad =>
    !!p && p.connected && p.buttons.length > 0;

  const readPad = (): Gamepad | null => {
    const pads = navigator.getGamepads?.() ?? [];
    // Giữ nguyên cái đang dùng nếu nó còn đó — đổi qua đổi lại giữa hai tay cầm
    // mỗi khung hình thì `prev` vô nghĩa và nút nào cũng thành bấm liên tục.
    if (padIndex !== null) {
      const cur = pads[padIndex];
      if (thuc(cur)) return cur;
      padIndex = null;
    }
    for (const p of pads) {
      if (!thuc(p)) continue;
      const dung =
        p.buttons.some((b) => b.pressed || b.value > PRESS) ||
        p.axes.some((v) => Math.abs(v) > DEAD);
      if (dung) {
        padIndex = p.index;
        return p;
      }
    }
    /* Không cái nào có tín hiệu: vẫn nhận cái đầu tiên để `connected` đúng —
       nhưng phải là một tay cầm THẬT, có nút và có trục. Sau khi rút dây, một
       số trình duyệt còn để lại cái vỏ rỗng trong danh sách; nhận cái vỏ đó là
       game tưởng vẫn đang cắm tay cầm, mà `body[data-input="pad"]` thì giấu
       joystick ảo và tắt `pointer-events` của cụm nút — người chơi mất luôn
       đường nhập cuối cùng và chỉ còn cách tải lại trang. */
    for (const p of pads) if (thuc(p)) return p;
    return null;
  };

  return {
    info() {
      const pad = readPad();
      if (!pad) return NO_PAD;
      const id = pad.id ?? "";
      return {
        connected: true,
        id,
        brand: brandOf(id),
        standard: pad.mapping === "standard",
        buttons: pad.buttons.length,
        axes: pad.axes.length,
      };
    },

    poll(nowMs) {
      const pad = readPad();
      if (!pad) {
        prev = new Set();
        return EMPTY;
      }

      /* CHỈ đọc những nút tay cầm THẬT SỰ có. Một tay cầm mười nút thì chỉ số
         10 và 11 không tồn tại, và `buttons[10]` là `undefined` — vòng lặp này
         tự nhiên không thêm chúng vào, nên không có chuyện "L3 mở chế độ xây"
         trên một tay cầm không có L3. */
      /* Dựng `held` theo chỉ số GAME, không phải chỉ số phần cứng: đổi ở đây
         thì mọi thứ phía sau — sườn lên, `useHeld`, `running`, sơ đồ nút —
         đều tự đúng, không chỗ nào phải nhớ thêm một luật. */
      const held = new Set<number>();
      for (let i = 0; i < pad.buttons.length; i++) {
        const b = pad.buttons[i];
        if (b && (b.pressed || b.value > PRESS)) held.add(doiNut[i] ?? i);
      }

      const pressed = new Set<number>();
      for (const i of held) if (!prev.has(i)) pressed.add(i);
      prev = held;

      // Cần gạt trái, cộng D-pad (D-pad coi như đẩy hết cỡ theo trục đó).
      let ax = pad.axes[0] ?? 0;
      let ay = pad.axes[1] ?? 0;
      if (held.has(PAD.LEFT)) ax = -1;
      if (held.has(PAD.RIGHT)) ax = 1;
      if (held.has(PAD.UP)) ay = -1;
      if (held.has(PAD.DOWN)) ay = 1;

      /* Vùng chết HÌNH TRÒN: cắt theo từng trục thì đẩy chéo nhẹ (0,2 / 0,9) ra
         thành đúng một hướng thẳng, và nhân vật đi giật theo tám hướng. */
      /* TRẢI LẠI phần trên vùng chết ra đủ 0..1, y hệt joystick ảo đang làm.
         Không trải thì ngay lúc vượt ngưỡng tốc độ nhảy cóc từ 0 lên 28% —
         nhân vật giật một cái rồi mới đi, và cả dải 0–28% đầu cần gạt thành
         vô dụng. Tốc độ vốn đã vô cấp theo độ dài vector (`throttle` trong
         `player.ts`), nên đây là mảnh còn thiếu để cần gạt tay cầm cho cảm
         giác đúng như cần gạt ảo. */
      let len = Math.hypot(ax, ay);
      if (len < DEAD) {
        ax = 0;
        ay = 0;
        len = 0;
      } else if (len > 1) {
        ax /= len;
        ay /= len;
        len = 1;
      }
      /* Giữ bản THÔ cho việc GẠT MỘT NẤC ở dưới.
         Hai câu hỏi khác nhau nên đo bằng hai thước khác nhau:
           · "đi nhanh bao nhiêu" — cần độ đẩy đã TRẢI LẠI, để cả dải cần gạt
             đều dùng được;
           · "người chơi có vừa GẠT một cái không" — ngưỡng 0,6/0,35 vốn hiệu
             chỉnh trên giá trị thô, trải lại là tự dời ngưỡng đi (0,6 thô hoá
             ra 0,44) và người chơi phải đẩy sâu hơn hẳn mới lật được một mục
             menu.
         Trộn hai thứ vào một con số là hỏng một trong hai. */
      const thoX = ax;
      const thoY = ay;
      /* TRẢI LẠI phần trên vùng chết ra đủ 0..1, y hệt joystick ảo đang làm.
         Không trải thì ngay lúc vượt ngưỡng tốc độ nhảy cóc từ 0 lên 28% —
         nhân vật giật một cái rồi mới đi, và cả dải 0–28% đầu cần gạt thành
         vô dụng. Tốc độ vốn đã vô cấp theo độ dài vector (`throttle` trong
         `player.ts`), nên đây là mảnh còn thiếu để cần gạt tay cầm cho cảm
         giác đúng như cần gạt ảo. */
      if (len > 0) {
        const k = Math.min(1, (len - DEAD) / (1 - DEAD)) / len;
        ax *= k;
        ay *= k;
        len = Math.min(1, len * k);
      }

      /* Gạt hướng trong MENU: bấm một cái ăn một bước, giữ thì lặp lại chậm.
         Không có nhịp lặp này thì một cú gạt nhảy qua cả menu trong ba khung
         hình, mà cũng không giữ để đi nhanh xuống cuối danh sách được. */
      /**
       * Gạt-MỘT-NẤC dùng chung cho cả hai cần và cho D-pad.
       *
       * Hai chi tiết, cả hai đều là thứ sai thì lộ ra ngay:
       *
       * · CHỜ LÂU RỒI MỚI LẶP. Bấm D-pad một cái phải đi đúng MỘT ô. Không có
       *   quãng chờ đầu thì giữ nút 250ms — nhanh hơn một cú bấm bình thường —
       *   đã nhảy hai ô, và người chơi không bao giờ đứng được đúng ô mình
       *   muốn. Chờ `HOLD_MS` rồi mới lặp theo `REPEAT_MS`, đúng như phím mũi
       *   tên của bàn phím.
       * · TRỄ NGƯỠNG (hysteresis). Cần gạt để hờ quanh 0,6 thì mỗi khung hình
       *   nó vượt rồi lại tụt, và ô chọn nhảy qua nhảy lại — đúng cái "rung"
       *   đó. Bật ở 0,6 nhưng chỉ nhả khi tụt dưới 0,35.
       */
      const nac = (
        vx: number,
        vy: number,
        last: { x: number; y: number },
        at: number,
      ): { dir: { x: number; y: number } | null; last: { x: number; y: number }; at: number } => {
        const nguong = (v: number, cu: number) => (Math.abs(v) > (cu !== 0 ? OFF : ON) ? Math.sign(v) : 0);
        const dx = nguong(vx, last.x);
        const dy = nguong(vy, last.y);
        if (dx === 0 && dy === 0) return { dir: null, last: { x: 0, y: 0 }, at: 0 };
        const doi = dx !== last.x || dy !== last.y;
        if (doi) return { dir: { x: dx, y: dy }, last: { x: dx, y: dy }, at: nowMs };
        // Giữ nguyên hướng: lần lặp ĐẦU phải chờ lâu, các lần sau nhanh dần.
        const cho = at < 0 ? REPEAT_MS : HOLD_MS;
        if (nowMs - Math.abs(at) < cho) return { dir: null, last, at };
        // `at` âm = đã qua lần lặp đầu, từ giờ dùng nhịp nhanh.
        return { dir: { x: dx, y: dy }, last, at: -nowMs };
      };

      const nv = nac(thoX, invY ? -thoY : thoY, navLast, navAt);
      const navDir = nv.dir;
      navLast = nv.last;
      navAt = nv.at;

      /* CẦN PHẢI: trục 2 và 3 ở standard mapping. Không standard thì không đọc
         — trục 2 của một tay cầm lạ có thể là cò, và cò nghỉ ở -1 nên hotbar
         sẽ tự chạy mãi mà không ai chạm vào gì. */
      const std = pad.mapping === "standard";
      const rx = std ? (pad.axes[2] ?? 0) : 0;
      const ry = std ? (pad.axes[3] ?? 0) : 0;
      const av = nac(rx, invY ? -ry : ry, aimLast, aimAt);
      const aimDir = av.dir;
      aimLast = av.last;
      aimAt = av.at;

      return {
        connected: true,
        axis: { x: ax, y: ay },
        // Cò LT chỉ đáng tin khi standard mapping; ngoài ra chỉ dựa vào cần gạt.
        /* CHẠY = giữ cò trái, và CHỈ thế.
           Trước đây "đẩy cần gạt hết cỡ" cũng là chạy — hai cách điều khiển
           cho cùng một tính năng, đúng thứ người chơi bắt lỗi: cầm tay cầm mà
           đi nhanh chậm thất thường vì ngón cái vô tình đẩy quá ngưỡng, và cái
           cò thì hoá ra thừa. Cần gạt ảo trên màn hình vẫn giữ luật đẩy-hết-cỡ
           (nó không có cò để mà giữ) — luật ấy nằm ở `input.ts`, không ở đây. */
        running: pad.mapping === "standard" && held.has(PAD.LT),
        pressed,
        held,
        navDir,
        aimDir,
      };
    },

    rumble(ms, strong = 0.6) {
      const pad = readPad();
      // `vibrationActuator` chưa vào chuẩn nên phải hỏi kiểu động; Firefox và
      // Safari không có nó, và đó không phải lỗi gì cả.
      const act = (pad as unknown as { vibrationActuator?: { playEffect(t: string, o: object): Promise<unknown> } } | null)
        ?.vibrationActuator;
      if (!act) return;
      void act
        .playEffect("dual-rumble", {
          duration: ms,
          strongMagnitude: strong,
          weakMagnitude: strong * 0.6,
        })
        .catch(() => {
          /* tay cầm từ chối rung — không phải chuyện đáng báo */
        });
    },
  };
}

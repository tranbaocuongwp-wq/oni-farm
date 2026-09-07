/* ============================================================================
   PATHFIND — A* thuần, dùng chung cho NGƯỜI CHƠI và cho mọi thực thể.

   Vì sao nó nằm ở `game/` chứ không ở `core/`:

   Bấm-để-đi của người chơi là một CÁCH NHẬP LIỆU, nên `core/navigate.ts` giữ
   trạng thái trong closure và không cần lưu vào save — đúng chỗ của nó. Nhưng
   con bò và người làm thuê thì tìm đường BÊN TRONG reducer, mà reducer ở
   `game/` không được phép import xuống `core/` (chiều phụ thuộc là core → game,
   một chiều, có chủ đích). Nên phần THUẦN phải nằm ở đây, và `core/navigate.ts`
   import lên dùng lại.

   Hai khác biệt so với bản cũ trong navigate.ts:

   · Hộp va chạm là THAM SỐ. Xe tải rộng hơn người, con gà hẹp hơn; dùng chung
     một hộp cố định thì xe sẽ tìm ra đường mà nó không lọt.
   · Hàng đợi ưu tiên là HEAP nhị phân thay vì quét tuyến tính. Với một actor và
     ~1800 ô thì quét tuyến tính còn nhanh hơn dựng heap — nhưng 20 actor thì
     không: quét tuyến tính là O(N²) trên số nút mở, và đó là thứ giết fps trên
     điện thoại trước tiên.
============================================================================ */

import type { Content, GameState } from "./types.ts";
import {
  PLAYER_H,
  PLAYER_W,
  TILE,
  blockedAtBox,
  blockedForActor,
  idx,
  isSolid,
  speedMulAt,
  tileAt,
  tileOkFor, maxSpeedMul } from "./world.ts";

/** Hộp va chạm của một thực thể, tính bằng world px. */
export interface Box {
  w: number;
  h: number;
}

export const PLAYER_BOX: Box = { w: PLAYER_W, h: PLAYER_H };

/** Trần số nút mở. Người chơi được rộng tay; actor thì bị siết (xem entities.ts). */
export const MAX_NODES_DEFAULT = 4000;

export interface PathOptions {
  maxNodes?: number;
  box?: Box;
  /** Thực thể BƠI: nước là chỗ đi được, cạn là chỗ chặn. */
  swims?: boolean;
  /**
   * Tránh RUỘNG: không lập đường qua ô đã cày.
   *
   * Chỉ áp cho VẬT NUÔI. Con bò đứng giữa luống xà lách là thứ ai cũng thấy
   * ngay và thấy là khó chịu. Cố ý chỉ chặn lúc LẬP ĐƯỜNG chứ không chặn lúc va
   * chạm: nếu người chơi cày ngay dưới chân con bò thì nó vẫn phải đi ra được,
   * chứ không bị nhốt trong chính cái luống vừa cày.
   *
   * KHÔNG áp cho sâu bọ — chúng phải tới được cây thì mới phá được, đó là việc
   * của chúng. Cũng không áp cho người làm: họ phải băng qua ruộng mà làm.
   */
  avoidFarm?: boolean;
  /** Dây xích: chỉ tìm trong bán kính này (ô) quanh tâm, để một actor kẹt không
   *  quét cả bản đồ. */
  leash?: { x: number; y: number; r: number };
  /**
   * Bộ lọc RIÊNG của bên gọi, xét ngay trong vòng lặp A*.
   *
   * Có vì XE TẢI chỉ đi được trên đường. Trước đây `drivePath` gọi A* thường
   * rồi mới soát lại đường trả về, thấy ô nào không phải mặt đường thì bỏ cả
   * đường — mà A* thường luôn trả về đường NGẮN NHẤT, tức là đường cắt thẳng
   * qua bãi cỏ. Nên hễ đích không nằm đúng một đường thẳng dọc con đường thì
   * chuyến nào cũng bị bỏ, chiếc xe đứng chờ rồi làm việc của nó ngay giữa
   * đường. Lọc phải nằm TRONG vòng lặp thì A* mới tìm được đường vòng theo mặt
   * đường; soát lại sau khi tìm xong thì không bao giờ ra được đường đó.
   */
  pass?: (x: number, y: number) => boolean;
}

/** Ô này đi qua được không (ở mức Ô, chưa xét hộp va chạm). */
export function walkableTile(
  state: GameState,
  content: Content,
  x: number,
  y: number,
  swims = false,
): boolean {
  if (x < 0 || y < 0 || x >= state.w || y >= state.h) return false;
  if (swims) return tileOkFor(tileAt(state, x, y), content, true);
  return !isSolid(state, content, x, y);
}

/** Hệ số tốc độ của Ô — chi phí bước của A* được CHIA cho nó. */
export function stepSpeed(state: GameState, content: Content, x: number, y: number): number {
  return speedMulAt(state, content, x * TILE + TILE / 2, y * TILE + TILE / 2);
}

/**
 * Đường ngắm thẳng từ (ax,ay) tới (bx,by) có va vào gì không.
 * Kiểm bằng cả HỘP va chạm chứ không phải một điểm — nếu không, đường sẽ "lách"
 * qua khe hẹp mà thân thực thể không lọt.
 */
export function lineOfSightBox(
  state: GameState,
  content: Content,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  box: Box = PLAYER_BOX,
): boolean {
  const dist = Math.hypot(bx - ax, by - ay);
  const steps = Math.ceil(dist / 4);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (blockedAtBox(state, content, ax + (bx - ax) * t, ay + (by - ay) * t, box.w, box.h))
      return false;
  }
  return true;
}

/* ------------------------------------------------------------------ heap ---
   Heap nhị phân tối thiểu, nằm trên MẢNG ĐỊNH KIỂU dùng lại qua các lần gọi.

   Cố ý viết tay thay vì dùng thư viện: `src/game/` không có phụ thuộc ngoài
   nào, và đây là 40 dòng.

   Tie-break theo CHỈ SỐ Ô để kết quả tất định — hai nút cùng `f` phải luôn ra
   cùng một thứ tự, nếu không hai lần replay cùng chuỗi action sẽ cho hai đường
   khác nhau. Đó là luật xương sống của cả trò chơi này, nên nó không được đổi
   một ly khi đổi cách chứa.

   VÌ SAO đổi từ `Node[]` sang hai mảng song song: bench đo được A* là thứ đắt
   nhất trong cả phần mô phỏng — 1,34 ms một lần gọi, tức 8% ngân sách một khung
   hình 60fps, trong khi cả TICK còn lại chỉ 0,03 ms. Hai phần ba chi phí ấy là
   `Map` khoá số nguyên (băm một số rồi tra bảng) và một object `{i,f}` mới cho
   mỗi nút đẩy vào heap — vài nghìn object mỗi lần tìm đường. Mảng định kiểu bỏ
   được cả hai, và vì chúng dùng lại qua các lần gọi nên không cấp phát gì sau
   lần đầu.
--------------------------------------------------------------------------- */

/* ---- bộ nhớ nháp dùng chung, cấp phát một lần rồi lớn dần theo bản đồ ----

   AN TOÀN: `findPath` KHÔNG được gọi lồng nhau — một lần gọi bên trong một lần
   gọi khác sẽ giẫm lên nháp của nhau. Hôm nay không chỗ nào làm vậy (`opts.pass`
   chỉ hỏi địa hình), và `dangTim` bên dưới canh đúng điều đó. */
let nhapO = 0;
/** g của từng ô. Chỉ có nghĩa khi `dau[i] === ky`. */
let gArr = new Float64Array(0);
/** Ô liền trước trên đường đi. −1 = chưa có. */
let truocArr = new Int32Array(0);
/** Dấu phiên: thay vì xoá hai mảng trên mỗi lần gọi (1.776 ô × mỗi lần), chỉ
 *  tăng số phiên lên một. */
let dauArr = new Int32Array(0);
let ky = 0;

/** f của từng nút trong heap. */
let heapF = new Float64Array(1024);
/** chỉ số ô của từng nút trong heap. */
let heapI = new Int32Array(1024);
let heapN = 0;

/** Đang có một lần tìm đường chạy dở hay không — canh việc gọi lồng nhau. */
let dangTim = false;

/* ---- ghi nhớ TÍNH CHẤT Ô trong MỘT lần tìm đường -------------------------

   Ba phép hỏi địa hình — `walkableTile`, `blockedForActor`, `stepSpeed` — là
   chỗ thật sự tốn thời gian của A*, chứ không phải hàng đợi. Mỗi ô bị hỏi lại
   một lần cho MỖI hướng dẫn tới nó (tới tám lần), cộng thêm hai lần nữa mỗi
   khi có ai đi chéo qua góc của nó. Mà câu trả lời thì không đổi trong suốt
   một lần tìm đường: cả ba chỉ phụ thuộc (state, content, ô, box, swims), và
   không có gì trong số đó nhúc nhích giữa chừng.

   Nên hỏi một lần, ghi lại, dùng cho mọi lần sau. Dùng chung `ky` với `dauArr`
   nên không phải xoá gì. */
/** bit 0 = đã tính, bit 1 = đi được ở mức ô, bit 2 = hộp va chạm lọt. */
let oCoArr = new Uint8Array(0);
let oDauArr = new Int32Array(0);
let oTocDoArr = new Float64Array(0);
let oTocDoDauArr = new Int32Array(0);

function chuanBiNhap(o: number): void {
  if (o > nhapO) {
    nhapO = o;
    gArr = new Float64Array(o);
    truocArr = new Int32Array(o);
    dauArr = new Int32Array(o);
    oCoArr = new Uint8Array(o);
    oDauArr = new Int32Array(o);
    oTocDoArr = new Float64Array(o);
    oTocDoDauArr = new Int32Array(o);
    ky = 0;
  }
  ky++;
  /* `ky` tràn số nguyên 32 bit thì mọi ô lại trông như "đã thăm ở phiên này".
     Sau hơn hai tỉ lần tìm đường mới xảy ra, nhưng xử lý nó tốn đúng ba dòng. */
  if (ky === 0x7fffffff) {
    dauArr.fill(0);
    oDauArr.fill(0);
    oTocDoDauArr.fill(0);
    ky = 1;
  }
}

function heapLon(o: number): void {
  if (o <= heapF.length) return;
  let n = heapF.length;
  while (n < o) n *= 2;
  const f = new Float64Array(n);
  const i = new Int32Array(n);
  f.set(heapF);
  i.set(heapI);
  heapF = f;
  heapI = i;
}

/** a đứng trước b không. Đúng cùng luật với bản cũ: f trước, rồi tới chỉ số ô. */
function truocHon(fa: number, ia: number, fb: number, ib: number): boolean {
  return fa !== fb ? fa < fb : ia < ib;
}

function heapPush(f: number, i: number): void {
  heapLon(heapN + 1);
  let c = heapN++;
  heapF[c] = f;
  heapI[c] = i;
  while (c > 0) {
    const p = (c - 1) >> 1;
    if (!truocHon(heapF[c]!, heapI[c]!, heapF[p]!, heapI[p]!)) break;
    const tf = heapF[c]!;
    const ti = heapI[c]!;
    heapF[c] = heapF[p]!;
    heapI[c] = heapI[p]!;
    heapF[p] = tf;
    heapI[p] = ti;
    c = p;
  }
}

/** Lấy nút nhỏ nhất ra. Trả chỉ số ô, hoặc −1 khi heap rỗng. */
function heapPop(): number {
  if (heapN === 0) return -1;
  const top = heapI[0]!;
  heapN--;
  if (heapN > 0) {
    heapF[0] = heapF[heapN]!;
    heapI[0] = heapI[heapN]!;
    let p = 0;
    for (;;) {
      const l = p * 2 + 1;
      const r = l + 1;
      let m = p;
      if (l < heapN && truocHon(heapF[l]!, heapI[l]!, heapF[m]!, heapI[m]!)) m = l;
      if (r < heapN && truocHon(heapF[r]!, heapI[r]!, heapF[m]!, heapI[m]!)) m = r;
      if (m === p) break;
      const tf = heapF[p]!;
      const ti = heapI[p]!;
      heapF[p] = heapF[m]!;
      heapI[p] = heapI[m]!;
      heapF[m] = tf;
      heapI[m] = ti;
      p = m;
    }
  }
  return top;
}

/* --------------------------------------------------------------------------- */

/**
 * A* 8 hướng, cấm cắt góc. Trả về MẢNG CHỈ SỐ Ô (không kể ô xuất phát), hoặc
 * null nếu không có đường.
 *
 * Trả chỉ số ô chứ không trả object: đường đi của thực thể phải nằm trong save,
 * mà `GameState` là JSON thuần — một mảng số gọn hơn hẳn một mảng object, và
 * không có gì để lệch.
 */
/** Bộ đếm số lần gọi A* — CHỈ để test đo ngân sách; game không đọc. */
export const PATH_STATS = { calls: 0 };

export function findPath(
  state: GameState,
  content: Content,
  sx: number,
  sy: number,
  goals: ReadonlySet<number>,
  opts: PathOptions = {},
): number[] | null {
  PATH_STATS.calls++;
  const w = state.w;
  const box = opts.box ?? PLAYER_BOX;
  const swims = opts.swims === true;
  const avoidFarm = opts.avoidFarm === true;
  const maxNodes = opts.maxNodes ?? MAX_NODES_DEFAULT;
  const leash = opts.leash;
  const pass = opts.pass;
  const start = idx(w, sx, sy);
  if (goals.has(start)) return [];

  /* Heuristic phải chia cho hệ số tốc độ LỚN NHẤT của content. Có ô rẻ hơn 1
     (đường nhựa) mà vẫn ước lượng theo giá 1 là ước lượng THỪA, và A* mất tính
     tối ưu — nó vẫn trả về một đường hợp lệ, chỉ không phải đường ngắn nhất.
     Hỏng âm thầm, không crash, rất khó thấy. */
  // `maxSpeedMul` có cache theo content — trước đây đoạn này viết lại y hệt
  // nó và duyệt mọi nền + mọi công trình ở MỖI lần tìm đường.
  const invMax = 1 / maxSpeedMul(content);

  /* Gọi lồng nhau sẽ giẫm lên nháp dùng chung. Không chỗ nào làm vậy, nhưng
     nếu một ngày `opts.pass` gọi lại A* thì thà hỏng to và thấy ngay còn hơn
     trả về một đường sai âm thầm. */
  if (dangTim) throw new Error("findPath gọi lồng nhau — nháp dùng chung sẽ hỏng");
  dangTim = true;
  try {
    chuanBiNhap(state.w * state.h);
    heapN = 0;

    /* Toạ độ ĐÍCH lấy ra một lần. `heur` chạy cho mỗi nút được đẩy vào heap —
       vài nghìn lần mỗi lần tìm đường — nên duyệt thẳng `Set` ở trong đó là
       dựng vài nghìn iterator cho cùng một dữ liệu không đổi. */
    const nG = goals.size;
    const gx = new Int32Array(nG);
    const gy = new Int32Array(nG);
    {
      let k = 0;
      for (const g of goals) {
        gx[k] = g % w;
        gy[k] = (g / w) | 0;
        k++;
      }
    }

    /* Ba phép hỏi địa hình, mỗi ô đúng một lần cho cả lần tìm đường. Ô ngoài
       bản đồ trả về "không đi được" mà không đụng mảng — chỉ số của nó không
       nằm trong lưới. */
    const tinhO = (x: number, y: number, i: number): number => {
      if (oDauArr[i] === ky) return oCoArr[i]!;
      let co = 1;
      if (walkableTile(state, content, x, y, swims)) {
        co |= 2;
        if (!blockedForActor(state, content, x * TILE + TILE / 2, y * TILE + TILE / 2, box.w, box.h, swims))
          co |= 4;
      }
      oCoArr[i] = co;
      oDauArr[i] = ky;
      return co;
    };
    /** Đi được ở mức Ô. Ngoài biên là không. */
    const oDiDuoc = (x: number, y: number): boolean => {
      if (x < 0 || y < 0 || x >= w || y >= state.h) return false;
      return (tinhO(x, y, idx(w, x, y)) & 2) !== 0;
    };
    const oTocDo = (x: number, y: number, i: number): number => {
      if (oTocDoDauArr[i] === ky) return oTocDoArr[i]!;
      const v = stepSpeed(state, content, x, y);
      oTocDoArr[i] = v;
      oTocDoDauArr[i] = ky;
      return v;
    };

    const heur = (i: number): number => {
      const x = i % w;
      const y = (i / w) | 0;
      let best = Infinity;
      for (let k = 0; k < nG; k++) {
        const dx = Math.abs(x - gx[k]!);
        const dy = Math.abs(y - gy[k]!);
        const d = Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
        if (d < best) best = d;
      }
      return best * invMax;
    };

    gArr[start] = 0;
    truocArr[start] = -1;
    dauArr[start] = ky;
    heapPush(heur(start), start);

    let expanded = 0;
    while (heapN > 0 && expanded < maxNodes) {
      const cur = heapPop();
      expanded++;

      if (goals.has(cur)) {
        const path: number[] = [];
        let node = cur;
        while (node !== -1 && node !== start) {
          path.push(node);
          node = truocArr[node]!;
        }
        path.reverse();
        return path;
      }

      const cx = cur % w;
      const cy = (cur / w) | 0;
      const g0 = gArr[cur]!;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (leash && (Math.abs(nx - leash.x) > leash.r || Math.abs(ny - leash.y) > leash.r))
            continue;
          if (nx < 0 || ny < 0 || nx >= w || ny >= state.h) continue;
          const ni = idx(w, nx, ny);
          const co = tinhO(nx, ny, ni);
          if ((co & 2) === 0) continue;
          if (pass && !pass(nx, ny)) continue;
          if (avoidFarm && tileAt(state, nx, ny)?.tilled) continue;
          // Hộp va chạm rộng hơn một điểm: ô đi được ở mức Ô vẫn có thể không lọt.
          if ((co & 4) === 0) continue;
          // Cấm cắt góc: đi chéo thì hai ô kề cũng phải trống, nếu không thân
          // thực thể sẽ kẹt cứng ở góc tường.
          if (dx !== 0 && dy !== 0) {
            if (!oDiDuoc(cx + dx, cy)) continue;
            if (!oDiDuoc(cx, cy + dy)) continue;
            if (pass && (!pass(cx + dx, cy) || !pass(cx, cy + dy))) continue;
          }
          const step = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1;
          const g1 = g0 + step / oTocDo(nx, ny, ni);
          if (dauArr[ni] === ky && g1 >= gArr[ni]!) continue;
          gArr[ni] = g1;
          truocArr[ni] = cur;
          dauArr[ni] = ky;
          heapPush(g1 + heur(ni), ni);
        }
      }
    }
    return null;
  } finally {
    dangTim = false;
  }
}

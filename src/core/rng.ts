/** PRNG mulberry32 — nhỏ, nhanh, TẤT ĐỊNH.
 *  Dùng cho pixel art sinh bằng code: cùng seed luôn ra cùng một hình,
 *  nên cỏ/đá/cây trông "ngẫu nhiên" nhưng không nhảy múa giữa các lần chạy. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Băm toạ độ ô thành seed ổn định — để mỗi ô cỏ có hoa văn riêng
 *  mà không cần lưu gì trong state. */
export function hash2(x: number, y: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

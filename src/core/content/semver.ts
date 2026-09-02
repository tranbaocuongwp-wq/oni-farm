/* ============================================================================
   SEMVER tối giản — chỉ đủ cho CỔNG TƯƠNG THÍCH của OTA.

   Đây là chốt chặn quan trọng nhất của cơ chế cập nhật: content pack khai
   `requiresCore`, core chỉ nhận pack khi phiên bản của mình thoả dải đó.
   Nhờ vậy một content pack mới (dùng hiệu ứng mà core cũ chưa biết) sẽ bị
   TỪ CHỐI thay vì làm hỏng game của người đang dùng bản cũ.

   Hỗ trợ đúng ba dạng, cố ý không hơn: "1.2.3", "^1.2.3", "~1.2.3".
============================================================================ */

export interface Ver {
  major: number;
  minor: number;
  patch: number;
}

export function parse(v: string): Ver | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  if (!m) return null;
  return { major: +m[1]!, minor: +m[2]!, patch: +m[3]! };
}

export function compare(a: Ver, b: Ver): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

/** version có thoả dải range không. Range sai cú pháp → false (từ chối an toàn). */
export function satisfies(version: string, range: string): boolean {
  const v = parse(version);
  if (!v) return false;

  const op = range[0] === "^" || range[0] === "~" ? range[0] : "";
  const base = parse(op ? range.slice(1) : range);
  if (!base) return false;

  if (op === "") return compare(v, base) === 0;
  if (compare(v, base) < 0) return false;

  // ^ : cùng major (với 0.x thì cùng minor, theo đúng quy ước semver)
  if (op === "^") {
    if (base.major > 0) return v.major === base.major;
    if (base.minor > 0) return v.major === 0 && v.minor === base.minor;
    return v.major === 0 && v.minor === 0 && v.patch === base.patch;
  }
  // ~ : cùng major.minor
  return v.major === base.major && v.minor === base.minor;
}

/** a mới hơn b? Dùng để quyết định có nên tải pack về hay không. */
export function isNewer(a: string, b: string): boolean {
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return false;
  return compare(x, y) > 0;
}

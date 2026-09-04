/* ============================================================================
   SEASON — bốn mùa, suy ra từ SỐ NGÀY.

   Mùa KHÔNG nằm trong state. `day` đã đủ để tính ra mùa, nên thêm một trường
   nữa chỉ tạo cơ hội cho hai nguồn sự thật lệch nhau — và bắt cả một bậc
   migration cho mọi save cũ mà không đổi lấy điều gì. Đổi `daysPerSeason` qua
   OTA thì lịch cũng dịch theo, đó là hành vi đúng: content nói mùa dài bao
   nhiêu, chứ không phải file save.

   Luật của mùa:
     · Cây ngoài mùa thì GIEO KHÔNG ĐƯỢC.
     · Tới lúc SANG MÙA, cây chưa chín mà trái mùa thì HÉO.
     · Cây ĐÃ CHÍN thì không sao — không bao giờ mất một vụ đã công cốc. Đây là
       chỗ cố ý nới tay: mất giống và mất công chăm là đủ đau để phải tính
       trước, còn cướp mất vụ đang chờ gặt chỉ làm người chơi hậm hực.
     · Ô có `allSeason` (sàn nhà kính) miễn nhiễm tất cả — nhờ vậy công trình
       đã có sẵn từ trước bỗng có lý do tồn tại thật sự.
============================================================================ */

import type { Content, GameState, SeasonDef, Tile } from "./types.ts";

/** Chỉ số mùa trong năm cho ngày thứ `day` (day bắt đầu từ 1). */
export function seasonIndex(day: number, content: Content): number {
  const n = content.seasonOrder.length;
  if (n <= 0) return 0;
  const per = Math.max(1, Math.floor(content.daysPerSeason));
  const d = Math.max(0, Math.floor(day) - 1);
  return Math.floor(d / per) % n;
}

/** Định nghĩa mùa của ngày thứ `day`. Content không có mùa nào → null. */
export function seasonOfDay(day: number, content: Content): SeasonDef | null {
  const id = content.seasonOrder[seasonIndex(day, content)];
  return id ? (content.seasons[id] ?? null) : null;
}

/** Mùa HIỆN TẠI. */
export function currentSeason(state: GameState, content: Content): SeasonDef | null {
  return seasonOfDay(state.day, content);
}

/** Ngày thứ mấy TRONG MÙA (1..daysPerSeason). */
export function dayOfSeason(day: number, content: Content): number {
  const per = Math.max(1, Math.floor(content.daysPerSeason));
  return ((Math.max(1, Math.floor(day)) - 1) % per) + 1;
}

/** Năm thứ mấy (bắt đầu từ 1). */
export function yearOf(day: number, content: Content): number {
  const per = Math.max(1, Math.floor(content.daysPerSeason));
  const n = Math.max(1, content.seasonOrder.length);
  return Math.floor((Math.max(1, Math.floor(day)) - 1) / (per * n)) + 1;
}

/** Hôm nay có phải ngày CUỐI mùa không — để báo trước cho người chơi kịp thu. */
export function isLastDayOfSeason(day: number, content: Content): boolean {
  return dayOfSeason(day, content) >= Math.max(1, Math.floor(content.daysPerSeason));
}

/** Ô này miễn nhiễm mùa chưa (sàn nhà kính). */
export function tileAllSeason(t: Tile | undefined, content: Content): boolean {
  if (!t || !t.b) return false;
  return content.buildings[t.b]?.effects.allSeason === true;
}

/**
 * Cây `cropId` gieo được trong mùa của ngày `day` không.
 * Cây không khai báo mùa nào = quanh năm (giữ tương thích với pack cũ).
 */
export function cropInSeason(cropId: string, day: number, content: Content): boolean {
  const def = content.crops[cropId];
  if (!def) return false;
  const list = def.seasons;
  if (!list || list.length === 0) return true;
  const s = seasonOfDay(day, content);
  return s ? list.includes(s.id) : true;
}

/** Hệ số lớn của mùa hiện tại (1 nếu content không có mùa). */
export function seasonGrowMul(state: GameState, content: Content): number {
  const s = currentSeason(state, content);
  return s ? s.growMul : 1;
}

/** Tên mùa để hiện lên HUD; chuỗi rỗng nếu content không có mùa. */
export function seasonName(state: GameState, content: Content): string {
  return currentSeason(state, content)?.name ?? "";
}

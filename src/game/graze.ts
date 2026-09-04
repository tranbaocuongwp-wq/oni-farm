/* ============================================================================
   GRAZE — con vật đói thì TỰ ĐI TÌM CỎ.

   Trước đây bỏ đói là một cái đồng hồ đếm ngược, không hơn: con bò đứng giữa
   một bãi cỏ dày và chết đói sau bốn ngày. Loài `feed: null` thì ngược lại —
   mỗi đêm tự no lại một nửa từ hư không, kể cả khi cả nông trại đã lát nhựa.
   Cả hai đều là con số thay cho hành vi, và người chơi nhìn thấy ngay là sai.

   Ở đây cỏ trên bản đồ là THỨC ĂN THẬT:

   · Con vật đói nhắm tới bụi cỏ gần nhất và đi tới đó. Tới nơi thì ăn, và bụi
     cỏ BIẾN MẤT — nên một đàn đông sẽ gặm trụi khu quanh chuồng, và người chơi
     phải để chừa cỏ hoặc phải cắt cỏ tích rơm. Đó mới là một quyết định.
   · Hết cỏ thì đói tiếp, và quá `starveDays` thì chết — luật cũ giữ nguyên.
     Chết đói vẫn có thật, chỉ là giờ nó có nguyên nhân nhìn thấy được.

   Ai ăn được gì là do CONTENT nói, không phải `switch (id)`:

   · Loài có `feed` (bò/dê/cừu ăn rơm, heo/cá/chó ăn cỏ khô) tìm bụi cỏ nào RỤNG
     RA đúng thứ đó. Thêm một loại "cỏ ba lá" rụng rơm là bò tự biết ăn.
   · Loài `feed: null` (gà, vịt) mổ sâu trên nền cỏ THƯỜNG — không cần bụi nào
     cả. Vì thế chúng gần như không bao giờ chết đói, đúng như gà thả rông; chỉ
     chết khi quanh đó không còn một mảnh cỏ nào.
============================================================================ */

import type { AnimalDef, Content, Entity, GameState } from "./types.ts";
import type { Draft } from "./state.ts";
import { dEntity, dTile } from "./state.ts";
import { TILE, idx, tileAt, tileIndexAt } from "./world.ts";

/** Ăn một bữa no được bao nhiêu phần của `fedMinutes`. Cố ý KHÔNG đầy: cho ăn
 *  bằng tay vẫn phải hơn hẳn việc tự gặm, nếu không thì máng cỏ vô nghĩa. */
const GRAZE_FILL = 0.7;

/** Bụi cỏ nào rụng ra MỘT TRONG các món loài này ăn. Duyệt content chứ không
 *  liệt kê id bằng tay, nên thêm "cỏ ba lá" rụng rơm là bò tự biết ăn. */
function propsDropping(content: Content, feeds: readonly string[]): Set<string> {
  const out = new Set<string>();
  if (!feeds.length) return out;
  const want = new Set(feeds);
  for (const id of content.propOrder) {
    const p = content.props[id];
    if (!p?.drops) continue;
    for (const dr of p.drops) if (want.has(dr.id)) out.add(id);
  }
  return out;
}

/** Ô (x,y) có ăn được với loài này không. */
export function grazeableAt(
  s: GameState,
  content: Content,
  def: AnimalDef,
  x: number,
  y: number,
): boolean {
  const t = tileAt(s, x, y);
  if (!t) return false;
  // Ruộng đã cày hay đang có cây thì KHÔNG phải bãi chăn — con bò gặm luống rau
  // là thứ người chơi sẽ nhớ rất lâu, theo nghĩa xấu.
  if (t.tilled || t.crop) return false;
  /* Hai đường ăn tự nhiên, KHÔNG loại trừ nhau:
       · bụi cỏ nào rụng ra thứ nó ăn được  → gặm bụi đó (bụi biến mất)
       · `pecks` (gà, vịt)                  → mổ sâu trên nền cỏ trống
     Trước đây gộp làm một qua `feed: null`, nên cho gà ăn cám được là lập tức
     mất luôn khả năng tự kiếm ăn của nó. */
  if (t.prop !== null) return propsDropping(content, def.feed).has(t.prop);
  if (def.pecks) return t.g === "grass" && t.b === null;
  return false;
}

/**
 * Ô ăn được GẦN NHẤT quanh con vật, hoặc null.
 *
 * Quét theo vòng từ trong ra và dừng ngay ở vòng đầu tìm thấy: con vật đói thì
 * đi tới bụi gần nhất, không đi tìm bụi ngon nhất. Trần `radius` để một con kẹt
 * trong chuồng không quét cả bản đồ mỗi bước.
 */
export function nearestGraze(
  s: GameState,
  content: Content,
  def: AnimalDef,
  e: Entity,
  radius: number,
): { x: number; y: number } | null {
  const cx = Math.floor(e.x / TILE);
  const cy = Math.floor(e.y / TILE);
  if (grazeableAt(s, content, def, cx, cy)) return { x: cx, y: cy };
  for (let r = 1; r <= radius; r++) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= s.w || y >= s.h) continue;
        if (grazeableAt(s, content, def, x, y)) return { x, y };
      }
  }
  return null;
}

/**
 * Cho con vật ở chỉ số `i` ăn ô nó đang đứng. Trả true nếu ăn được.
 *
 * Bụi cỏ bị ăn thì MẤT. Nền cỏ thường (gà vịt mổ sâu) thì không — sâu thì mọc
 * lại, còn bãi cỏ thì phải chờ mọc, và chính chỗ khác nhau đó là lý do nuôi bò
 * khó hơn nuôi gà.
 */
export function grazeHere(d: Draft, content: Content, i: number): boolean {
  const cur = d.s.entities[i];
  if (!cur) return false;
  const def = content.animals[cur.def];
  if (!def) return false;
  const x = Math.floor(cur.x / TILE);
  const y = Math.floor(cur.y / TILE);
  if (!grazeableAt(d.s, content, def, x, y)) return false;

  /* Ăn BỤI thì bụi mất; mổ sâu trên nền cỏ trống thì không mất gì — sâu mọc
     lại, còn bãi cỏ thì phải chờ mọc, và chính chỗ khác nhau đó là lý do nuôi
     bò khó hơn nuôi gà. Điều kiện là "ô có bụi không", chứ không phải "loài
     này có ăn được đồ cho ăn không": từ khi gà cũng ăn cám thì hai câu đó
     không còn trùng nhau nữa. */
  const t = tileAt(d.s, x, y);
  if (t && t.prop !== null) {
    const ti = tileIndexAt(d.s, x, y);
    if (ti < 0) return false;
    const m = dTile(d, ti);
    if (!m) return false;
    m.prop = null;
    m.hp = 0;
  }

  const e = dEntity(d, i);
  if (!e) return false;
  e.animal.fed = Math.max(e.animal.fed, def.fedMinutes * GRAZE_FILL);
  e.animal.hungryDays = 0;
  return true;
}

/**
 * Một lần đi ăn ĐÊM, chạy lúc sang ngày.
 *
 * Cần có vì người chơi ngủ là cả đêm trôi qua trong một action — không có khung
 * hình nào để con vật đi tới bụi cỏ. Không có bước này thì cứ ngủ vài đêm là cả
 * đàn chết đói dù nông trại đầy cỏ, tức là ngủ trở thành thứ trừng phạt.
 *
 * Bán kính rộng hơn ban ngày: cả một đêm thì con vật đi được xa hơn nhiều so
 * với vài phút game.
 */
export function grazeNight(d: Draft, content: Content, i: number, radius = 14): boolean {
  const cur = d.s.entities[i];
  if (!cur) return false;
  const def = content.animals[cur.def];
  if (!def) return false;
  const spot = nearestGraze(d.s, content, def, cur, radius);
  if (!spot) return false;

  // Dời con vật tới đúng bãi nó vừa ăn: sáng ra người chơi thấy nó đứng ở chỗ
  // bãi cỏ vừa biến mất, và câu chuyện tự khớp.
  const e = dEntity(d, i);
  if (!e) return false;
  e.x = spot.x * TILE + TILE / 2;
  e.y = spot.y * TILE + TILE / 2;
  e.ai.path = [];
  return grazeHere(d, content, i);
}

/** Chỉ số ô của một điểm ăn được, dùng làm đích cho A*. */
export function grazeGoal(s: GameState, spot: { x: number; y: number }): number {
  return idx(s.w, spot.x, spot.y);
}

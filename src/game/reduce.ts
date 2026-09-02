/* ============================================================================
   REDUCE — cửa duy nhất để đổi state.

   Hợp đồng với store (src/core/store.ts):
     · THUẦN — không sửa `state` hay bất cứ thứ gì với tới được từ nó.
     · Không đổi gì thì trả về ĐÚNG object `state` cũ (store dựa vào đó để bỏ
       qua render).
     · Không Date.now(), không Math.random() — mọi thứ ngẫu nhiên lấy từ
       `state.seed` qua mulberry32 và ghi seed mới vào state trả về.
============================================================================ */

import type { Action, Content, GameState } from "./types.ts";
import { applyProgression, commit, dPlayer, draft, toastKey, touch } from "./state.ts";
import { dirFromVector, movePlayer } from "./player.ts";
import { useAt } from "./actions.ts";
import { newDay } from "./newday.ts";
import { buy, sell, sellAll } from "./economy.ts";
import { inReach, interactAt, tileCenterX, tileCenterY } from "./world.ts";

export function reduce(state: GameState, action: Action, content: Content): GameState {
  const d = draft(state);

  switch (action.t) {
    case "MOVE": {
      // Đang vung cuốc thì chân đứng yên — đó là cái làm cho thao tác có sức
      // nặng thay vì vừa chạy vừa cày cả ruộng trong một giây.
      if (state.busy > 0) {
        movePlayer(d, content, 0, 0, action.dt);
        return commit(d);
      }
      movePlayer(d, content, action.dx, action.dy, action.dt, action.run === true);
      return commit(d);
    }

    case "TICK": {
      const dt = Number.isFinite(action.dt) ? Math.max(0, action.dt) : 0;
      if (dt <= 0) return state;
      const bal = content.balance;
      const perSec = 10 / Math.max(0.0001, bal.realSecondsPerGameTenMinutes);

      const s = touch(d);
      if (s.busy > 0) s.busy = Math.max(0, s.busy - dt);
      if (!s.player.moving) {
        // anim là đồng hồ tự do: MOVE chạy nó khi đang đi, TICK chạy nốt khi đứng yên
        s.player = { ...s.player, anim: s.player.anim + dt };
      }
      s.minutes = s.minutes + dt * perSec;

      if (s.minutes >= bal.dayEndMinutes) {
        newDay(d, content, { passedOut: true });
        toastKey(d, content, "passOut", "bad");
      }
      return commit(d);
    }

    case "USE": {
      // TUẦN TỰ: chưa xong việc đang làm thì không nhận việc mới. Bấm loạn cũng
      // không làm được nhanh hơn.
      if (state.busy > 0) return state;

      const ux = action.x | 0;
      const uy = action.y | 0;

      // Xoay mặt về phía đang làm. Không có dòng này thì nhân vật cày ô dưới
      // chân mà vẫn quay ngang — tư thế vung tay chỉ sai hướng là lộ ngay.
      //
      // CHỈ xoay khi ô nằm trong tầm với: USE ra ngoài tầm phải là KHÔNG-LÀM-GÌ
      // tuyệt đối (trả về đúng state cũ), nếu không thì bấm bừa ra xa vẫn xoay
      // được người và cái bất biến đó vỡ.
      if (inReach(state, ux, uy)) {
        const face = dirFromVector(
          tileCenterX(ux) - state.player.x,
          tileCenterY(uy) - state.player.y,
          state.player.dir,
        );
        if (face !== state.player.dir) dPlayer(d).dir = face;
      }

      const st0 = state.stats;
      useAt(d, content, ux, uy);

      // Chỉ khoá khi THẬT SỰ làm được gì đó. Không dùng `d.changed` được: một
      // thao tác HỤT vẫn đẩy toast báo lỗi, mà toast cũng là thay đổi state —
      // dùng nó thì bấm nhầm vào tảng đá cũng bị phạt đứng hình.
      const st1 = d.s.stats;
      const didWork =
        st1.tilled !== st0.tilled ||
        st1.planted !== st0.planted ||
        st1.watered !== st0.watered ||
        st1.harvested !== st0.harvested ||
        st1.built !== st0.built;

      if (didWork) touch(d).busy = Math.max(0, content.balance.actionSeconds ?? 0);
      if (d.changed) applyProgression(d, content);
      return commit(d);
    }

    case "INTERACT": {
      const kind = interactAt(state, content, action.x | 0, action.y | 0);
      if (kind !== "SLEEP") return state; // SHOP/SELL do UI mở modal, state không đổi
      newDay(d, content, { passedOut: false });
      toastKey(d, content, "sleep", "good");
      return commit(d);
    }

    case "SELECT": {
      const slots = Math.max(1, content.balance.hotbarSlots | 0);
      const slot = action.slot | 0;
      if (slot < 0 || slot >= slots) return state;
      if (slot === state.sel) return state;
      touch(d).sel = slot;
      return commit(d);
    }

    case "BUY": {
      buy(d, content, action.id, action.n);
      if (d.changed) applyProgression(d, content);
      return commit(d);
    }

    case "SELL": {
      sell(d, content, action.id, action.n);
      if (d.changed) applyProgression(d, content);
      return commit(d);
    }

    case "SELL_ALL": {
      sellAll(d, content);
      if (d.changed) applyProgression(d, content);
      return commit(d);
    }

    case "SLEEP": {
      newDay(d, content, { passedOut: false });
      toastKey(d, content, "sleep", "good");
      return commit(d);
    }

    case "LOG_SEEN": {
      const upTo = action.upTo | 0;
      if (state.log.length === 0) return state;
      const left = state.log.filter((e) => e.id > upTo);
      if (left.length === state.log.length) return state;
      touch(d).log = left;
      return commit(d);
    }
  }

  return state;
}

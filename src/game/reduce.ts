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
import { applyProgression, commit, draft, toastKey, touch } from "./state.ts";
import { movePlayer } from "./player.ts";
import { useAt } from "./actions.ts";
import { newDay } from "./newday.ts";
import { buy, sell, sellAll } from "./economy.ts";
import { interactAt } from "./world.ts";

export function reduce(state: GameState, action: Action, content: Content): GameState {
  const d = draft(state);

  switch (action.t) {
    case "MOVE": {
      movePlayer(d, content, action.dx, action.dy, action.dt);
      return commit(d);
    }

    case "TICK": {
      const dt = Number.isFinite(action.dt) ? Math.max(0, action.dt) : 0;
      if (dt <= 0) return state;
      const bal = content.balance;
      const perSec = 10 / Math.max(0.0001, bal.realSecondsPerGameTenMinutes);

      const s = touch(d);
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
      useAt(d, content, action.x | 0, action.y | 0);
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


/* File TAM do omni-farm/tools/golden/dump.mjs sinh ra. Xoa sau khi chay. */
import { createStore as real } from "../src/core/store.ts";

const clone = (v) => JSON.parse(JSON.stringify(v));
globalThis.__GOLDEN = globalThis.__GOLDEN ?? [];

/* Mot so kich ban dung CONTENT KHAC (thu OTA: them cay, bo cay, doi ban do).
   Ban Godot nap content goc nen khong so duoc voi chung. Danh dau lai de bo
   qua cho dung, thay vi bao lech gia. Content dau tien sim.mjs dung chinh la
   pack goc. */
let __refContent = null;

export function createStore(initial, content, opts) {
  if (__refContent === null) __refContent = content;
  const rec = {
    bundledContent: content === __refContent,
    scenario: globalThis.__SCEN ?? "?",
    seed: initial.seed >>> 0,
    // State BAN DAU cung phai ghi: no tach duoc "createNewGame dung chua"
    // khoi "action port dung chua" — hai loi rat khac nhau.
    initial: clone(initial),
    start: null,
    patches: [],
    actions: [],
    pulses: [],
    final: null,
  };
  globalThis.__GOLDEN.push(rec);

  /* MACH DAP sau moi action — de ben Godot chi ra chinh xac action DAU TIEN
     lam lech, thay vi chi biet "state cuoi khac nhau".

     Khong bam ca state: 331k action x 1776 o la qua dat. Lay mot nhum truong
     re ma nhay: seed doi moi lan rut hat, entSeq moi lan sinh thuc the, con
     tong tile bat moi thay doi tren luoi. */
  const pulse = (st) => {
    /* Luoi khong bam thanh MOT so ma thanh SAU — moi nhom truong mot so.

       Truoc day chi co mot con "tiles.hash", va bao cao lech chi noi duoc
       "luoi khac nhau" — con khac o CAI GI thi phai doan. Tach ra thi bao cao
       tu chi thang: lech o tang cay, hay o do am, hay o tuoi vat the.

       | 0 tren TUNG so hang: age la so THUC ben nay (cong don theo growMul),
       ma ben Godot no bi cat ve int truoc khi nhan. Khong cat nhu nhau thi hai
       ham bam ra hai so khac du luoi y het. */
    let hNen = 0, hDat = 0, hCay = 0, hVat = 0, hTuoi = 0, hKhac = 0;
    for (const t of st.tiles) {
      hNen = (hNen * 31 + (t.g ? t.g.charCodeAt(0) + t.g.length * 3 : 0)) | 0;
      hDat = (hDat * 31 + (t.tilled ? 1 : 0) + (t.wet ? 2 : 0)) | 0;
      hCay = (hCay * 31 + (t.crop ? 4 + t.crop.stage * 3 + (t.crop.sick ? 1 : 0) : 0)) | 0;
      hVat = (hVat * 31 + (t.prop ? t.prop.length * 5 : 0) + (t.b ? t.b.length * 7 : 0)) | 0;
      hTuoi = (hTuoi * 31 + ((t.hp ?? 0) | 0) + (((t.age ?? 0) | 0) * 13)
               + (((t.idle ?? 0) | 0) * 17)) | 0;
      hKhac = (hKhac * 31 + (t.decor ? 11 : 0) + ((t.trough ?? 0) | 0)) | 0;
    }
    /* VI TRI NGUOI CHOI phai nam trong mach dap.
       nightGround hoi playerOverlapsTile de khong moc bui cay len dau ai — tuc
       la vi tri nguoi choi quyet dinh SO LAN RUT HAT trong dem. Bo no ra khoi
       mach dap thi mot lech vi tri nho xiu se lo ra o mot cho hoan toan khac,
       hang tram action sau, duoi dang "rut thieu 2 lan". */
    return [st.seed, st.day, Math.round(st.minutes * 1000), st.money, st.energy,
            st.water, st.entities.length, st.entSeq, st.actStep, st.logSeq,
            hNen, hDat, hCay, hVat, hTuoi, hKhac,
            Math.round(st.player.x * 1000), Math.round(st.player.y * 1000)];
  };

  /* Dau van tay DAY DU hon mach dap — chi de PHAT HIEN kich ban sua thang
     state giua chung, khong ghi vao fixture. */
  const stamp = (st) => {
    /* Bam luoi CHAT hon pulse: them nen dat, hp, decor, age, idle, troughId.
       Kich ban 70 dat t.g = "grass" va doi vi tri nguoi choi — hai thu ma
       ban dau tien khong bat duoc, nen khong ghi patch, nen ban Godot van
       dung o cho cu va bao lech gia. */
    let h = 0;
    for (const t of st.tiles) {
      h = (h * 33 + (t.g ? t.g.charCodeAt(0) + t.g.length : 0)
           + (t.tilled ? 1 : 0) + (t.wet ? 2 : 0)
           + (t.crop ? 4 + t.crop.stage * 3 + (t.crop.sick ? 1 : 0) + (t.crop.regrown ? 2 : 0) : 0)
           + (t.prop ? t.prop.length * 5 : 0) + (t.b ? t.b.length * 7 : 0)
           + (t.hp ?? 0) + (t.age ?? 0) + (t.idle ?? 0) + (t.trough ?? 0)
           + (t.decor ? 11 : 0) + (t.troughId ? t.troughId.length : 0)) | 0;
    }
    return JSON.stringify([
      pulse(st), h,
      Math.round(st.player.x * 100), Math.round(st.player.y * 100),
      st.player.dir, st.player.moving,
      st.sel, st.busy, st.pending, st.sleeping, st.mapId, st.carry ?? null,
      st.stagesDone.length, st.goalsDone.length, st.stats, st.log.length,
      st.weather, st.planCursor,
      st.inv.map((v) => (v ? v.id + "x" + v.n : 0)),
      st.store.map((v) => (v ? v.id + "x" + v.n : 0)),
      Object.keys(st.maps ?? {}).sort(),
      st.entities.map((e) => [e.id, Math.round(e.x), Math.round(e.y), e.seed, e.map,
        e.animal.fed, e.animal.age, e.animal.hungryDays, e.ai.phase, e.ai.path.length,
        e.worker ? e.worker.energy : 0]),
    ]);
  };

  const s = real(initial, content, opts);
  let lastStamp = null;
  const realDispatch = s.dispatch.bind(s);
  s.dispatch = (a) => {
    /* State ngay TRUOC dispatch dau tien.
       Nhieu kich ban sua thang state sau khi tao store (dat tien = 5000, dat
       nang luong = 1, tha con vat...) truoc khi bat dau dispatch. Dung lai tu
       createNewGame(seed) la bo qua nhung sua ay, va bo doi chieu bao lech
       gia ngay tu action dau. */
    const cur = s.getState();
    if (rec.start === null) rec.start = clone(cur);
    else if (stamp(cur) !== lastStamp) {
      /* KICH BAN VUA SUA THANG STATE giua chung (dat day = 37, tien = 999999,
         tha con vat...). Khong the tai tao tu chuoi action, nen ghi lai state
         tai dung diem do. Hiem, nen fixture khong phinh dang ke.

         Khong co buoc nay thi bo doi chieu bao lech GIA hang loat: ban Godot
         van o ngay 1 trong khi fixture da o ngay 37, va moi so sau do deu vo
         nghia. */
      rec.patches.push({ at: rec.actions.length, state: clone(cur) });
    }
    rec.actions.push(a);
    const r = realDispatch(a);
    rec.final = s.getState();
    rec.pulses.push(pulse(rec.final));
    lastStamp = stamp(rec.final);
    return r;
  };
  rec.final = s.getState();
  return s;
}
export * from "../src/core/store.ts";

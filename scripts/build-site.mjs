/* ============================================================================
   BUILD-SITE — sinh TOÀN BỘ trang tĩnh: vỏ trang, các trang giới thiệu, và
   thư viện tra cứu.

   Hai lý do, và lý do thứ hai mới là lý do thật:

   1. THƯ VIỆN quá lớn để viết tay. 61 cây, 10 loài, 7 công cụ, 6 công trình —
      viết tay nghĩa là 84 khối HTML phải tự sửa mỗi lần chỉnh một con số cân
      bằng, và chỉ cần quên một chỗ là trang tài liệu nói sai giá. Ở đây trang
      đọc ĐÚNG file mà game đọc: chỉnh giá cà rốt trong crops.json thì trang cà
      rốt đổi theo ngay lần build sau.

   2. VỎ TRANG chỉ được phép có MỘT bản. Trước đây bảy trang giới thiệu tự chép
      lấy `<head>`, nav và chân trang của mình, còn khuôn `page()` ở đây chỉ
      phục vụ bốn trang thư viện — tức mười một bản sao của cùng một cái vỏ.
      Chúng đã trôi khỏi nhau đúng như phải thế: bốn trang không khai một dòng
      `rel="icon"` nào (tab trình duyệt hiện icon mặc định suốt nhiều tháng),
      và trang Tính năng khoe "63 kịch bản kiểm thử" trong khi con số thật đã
      là hơn gấp đôi — ngay trên trang tự nhận "số trên trang không bao giờ
      lệch với số trong game".

      Giờ vỏ nằm ở đúng một chỗ: `page()`. Phần CHỮ của mỗi trang là một mẩu
      HTML rời trong `src/site/noi-dung/`, và builder lồng nó vào vỏ. Sửa chữ
      thì mở file HTML (không phải chuỗi trong JS); sửa vỏ thì sửa một chỗ và
      cả site đổi theo.

   3. MỌI CON SỐ trên site đều sinh từ nguồn, không gõ tay. Số cây, số loài, số
      kịch bản kiểm thử, độ dài một ngày, giá, năng lượng — xem `SO_LIEU` bên
      dưới. Một con số gõ tay là một con số sẽ sai, chỉ là chưa biết lúc nào.

   Hình thì `src/site/sprites.ts` lo: HTML chỉ đặt sẵn `<canvas data-sprite>`,
   trình duyệt gọi đúng hàm vẽ của game. Nên tắt JS vẫn đọc được TOÀN BỘ số
   liệu — chỉ mất phần minh hoạ.

   Chạy: npm run site:build   (đã gắn vào `npm run build`)
============================================================================ */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadContent } from "./lib/load-content.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(ROOT, "src");
const content = loadContent();

/* ------------------------------------------------------------------ tiện ích */

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Nhãn tiền: người Việt đọc "1.240" chứ không phải "1240". */
const tien = (n) => Number(n ?? 0).toLocaleString("vi-VN");

/** "1 ngày" / "3 ngày" — số ít số nhiều tiếng Việt giống nhau, nhưng viết hàm
 *  để chỗ gọi đọc như câu tiếng Việt chứ không phải phép nối chuỗi. */
const ngay = (n) => `${n} ngày`;

/**
 * Ô chờ sprite. `src/site/sprites.ts` sẽ vẽ vào lúc trang chạy.
 *
 * Khoá được KIỂM ngay tại đây. Một khoá sai không báo lỗi gì cả — nó chỉ vẽ ra
 * một ô trống, và một ô trống giữa hàng chục ô có hình thì không ai nhận ra là
 * thiếu. Kiểm lúc sinh thì sai một khoá là build đỏ, kèm tên khoá.
 */
function cx(key, size = 48, alt = "") {
  kiemKhoaSprite(key);
  return `<canvas class="sp" data-sprite="${esc(key)}" data-size="${size}" role="img" aria-label="${esc(alt)}"></canvas>`;
}

/** Ném lỗi nếu `key` không trỏ tới thứ có thật. Luật khớp `spriteFor`. */
function kiemKhoaSprite(key) {
  const hong = (vi) => {
    throw new Error(`data-sprite="${key}" không vẽ được: ${vi}`);
  };
  if (key === "player") return;
  if (key.startsWith("ui:") || key.startsWith("worker:")) return; // do atlas tự lo
  const sau = (n) => key.slice(n);
  if (key.startsWith("animal:")) return content.animals[sau(7)] ? undefined : hong("không có loài này");
  if (key.startsWith("vehicle:")) return content.vehicles[sau(8)] ? undefined : hong("không có xe này");
  if (key.startsWith("build:")) return content.buildings[sau(6)] ? undefined : hong("không có công trình này");
  if (key.startsWith("prop:")) return content.props[sau(5)] ? undefined : hong("không có vật thể này");
  if (key.startsWith("tool:")) return content.tools[sau(5)] ? undefined : hong("không có công cụ này");
  if (key.startsWith("seed:")) return content.crops[sau(5)] ? undefined : hong("không có cây này");
  if (key.startsWith("crop:")) {
    const rest = sau(5);
    const cut = rest.lastIndexOf(":");
    const id = cut < 0 ? rest : rest.slice(0, cut);
    const def = content.crops[id];
    if (!def) return hong("không có cây này");
    if (cut < 0) return;
    const i = Number(rest.slice(cut + 1));
    if (!Number.isInteger(i) || i < 0 || i > def.growthDays.length)
      return hong(`giai đoạn ${rest.slice(cut + 1)} nằm ngoài 0..${def.growthDays.length}`);
    return;
  }
  if (key.startsWith("item:")) {
    const r = sau(5);
    if (content.materials[r]) return;
    return hong("không có vật liệu này");
  }
  return hong("không khớp tiền tố nào mà sprites.ts hiểu");
}

/* ---------------------------------------------------------------- số liệu ---

   MỌI con số xuất hiện trên site lấy từ đây, và mọi giá trị ở đây đọc từ
   nguồn thật — content, hoặc chính mã nguồn. Không con số nào được gõ tay vào
   một mẩu HTML.

   Vì sao gắt thế: trang Tính năng từng khoe "63 kịch bản kiểm thử" và con số
   đó đứng yên suốt bảy đợt trong khi bộ test lớn hơn gấp đôi. Không ai nói
   dối cả — chỉ là một con số gõ tay thì không có gì buộc nó phải đúng, còn
   một con số đếm được thì không có cách nào sai.

   Cách dùng trong file nội dung: viết `{{soCay}}`, builder thay lúc build.
   Gõ một khoá không có thật thì build ĐỎ ngay, chứ không lặng lẽ để lại
   `{{soKichBan}}` giữa trang. */

/** Đếm kịch bản trong bộ sim — đọc chính file test, không gõ số. */
function demKichBan() {
  const src = readFileSync(resolve(ROOT, "scripts/sim.mjs"), "utf8");
  return (src.match(/^test\(/gm) ?? []).length + (src.match(/^testAsync\(/gm) ?? []).length;
}

const bal = content.balance;
const gioPhut = (m) => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, "0")}`;

const SO_LIEU = {
  soCay: content.cropOrder.length,
  soLoai: content.animalOrder.filter((id) => content.animals[id]?.job !== "pest").length,
  soLoaiKeSau: content.animalOrder.length,
  soCongThuc: Object.keys(content.recipes ?? {}).length,
  soCongTrinh: Object.keys(content.buildings ?? {}).length,
  soMua: content.seasonOrder?.length ?? Object.keys(content.seasons ?? {}).length,
  soThoiTiet: Object.keys(content.weathers ?? {}).length,
  soNac: (content.stages ?? []).length,
  soMucTieu: (content.goals ?? []).length,
  soKichBan: demKichBan(),
  gioDay: gioPhut(bal.dayStartMinutes),
  gioToi: gioPhut(bal.daylightEndMinutes),
  gioNgat: gioPhut(bal.dayEndMinutes % 1440),
  phutMoiNgayThat: Math.round(((bal.dayEndMinutes - bal.dayStartMinutes) / 10) * bal.realSecondsPerGameTenMinutes / 60),
  tienDau: tien(bal.startMoney),
  nangLuong: bal.energyMax,
  oBalo: bal.inventorySlots,
  oHotbar: bal.hotbarSlots,
  ngayMoiMua: content.daysPerSeason,
  thueNguoi: tien(content.workers?.hireFee ?? 0),
  luongNguoi: tien(content.workers?.wage ?? 0),
  ngayTraLuong: content.workers?.wageEveryDays ?? 0,
  get bangCayMau() {
    return bangCayMau();
  },
  get bangCongTrinh() {
    return bangCongTrinh();
  },
  get bangKhaiThac() {
    return bangKhaiThac();
  },
  get theCheTao() {
    return theCheTao();
  },
};

/* ---- hai bảng của trang Tính năng, sinh từ content ------------------------

   Trước đây chúng là HTML gõ tay, và cả hai đều đã sai theo kiểu khó thấy:
   bảng công trình ghi vòi tưới "tự tưới 4 ô kề bên", trong khi `waterRadius: 1`
   tưới cả khối 3×3 — tức TÁM ô quanh nó, gấp đôi. Con số giá thì tình cờ vẫn
   đúng, nhưng "tình cờ vẫn đúng" không phải một tính chất đáng dựa vào. */

/** Ba cây LÀM VÍ DỤ, chọn bằng dữ liệu chứ không bằng trí nhớ. */
function bangCayMau() {
  const list = content.cropOrder.map((id) => content.crops[id]).filter(Boolean);
  const nhanhNhat = list.reduce((a, b) => (tongNgay(b) < tongNgay(a) ? b : a));
  const mocLai = list.filter((c) => c.regrowDays > 0).sort((a, b) => tongNgay(a) - tongNgay(b))[0];
  const datNhat = list.reduce((a, b) => (b.sellPrice > a.sellPrice ? b : a));
  const ghiChu = {
    [nhanhNhat.id]: "Nhanh nhất — cây khởi động, vòng quay ngắn",
    [mocLai?.id]: `Thu xong mọc lại sau ${ngay(mocLai?.regrowDays ?? 0)} — gieo một lần, hái mãi`,
    [datNhat.id]: "Bán đắt nhất — đầu tư dài, lãi lớn",
  };
  const chon = [...new Map([nhanhNhat, mocLai, datNhat].filter(Boolean).map((c) => [c.id, c])).values()];
  return (
    `<div class="table-wrap"><table>
          <tr><th>Cây</th><th>Thời gian</th><th>Hạt</th><th>Bán</th><th>Ghi chú</th></tr>` +
    chon
      .map(
        (c) =>
          `<tr><td><b>${esc(c.name)}</b></td><td>${ngay(tongNgay(c))}</td><td>${tien(c.seedPrice)}đ</td><td>${tien(c.sellPrice)}đ</td><td>${esc(ghiChu[c.id] ?? "")}</td></tr>`,
      )
      .join("\n          ") +
    `\n        </table></div>`
  );
}

/** Mọi công trình mua được, kèm tác dụng ĐỌC TỪ `effects`. */
function bangCongTrinh() {
  const rows = content.buildingOrder
    .map((id) => content.buildings[id])
    .filter((b) => b && b.price > 0)
    .map((b) => {
      const e = b.effects ?? {};
      const y = [];
      if (e.waterRadius > 0) {
        const canh = e.waterRadius * 2 + 1;
        y.push(`Mỗi sáng tự tưới cả khối ${canh}×${canh} quanh nó — ${canh * canh - 1} ô kề`);
      }
      if (e.autoWet) y.push("Ô luôn giữ ẩm, không phải tưới");
      if (e.allSeason) y.push("Trồng được quanh năm, không lo trái mùa");
      if (e.speedMul) y.push(`Đi nhanh hơn ${Math.round((e.speedMul - 1) * 100)}%`);
      return `<tr><td><b>${esc(b.name)}</b></td><td>${tien(b.price)}đ${b.kind === "floor" ? "/ô" : ""}</td><td>${y.join(" · ") || "—"}</td></tr>`;
    });
  return (
    `<div class="table-wrap"><table>
          <tr><th>Công trình</th><th>Giá</th><th>Tác dụng</th></tr>` +
    rows.join("\n          ") +
    `\n        </table></div>`
  );
}

/** Địa hình khai thác được — số nhát và sản lượng đọc từ `props`. */
function bangKhaiThac() {
  const TEN_CONG_CU = { CHOP: "Rìu", MINE: "Cuốc chim", TILL: "Cuốc" };
  const rows = (content.propOrder ?? Object.keys(content.props))
    .map((id) => content.props[id])
    .filter((p) => p && ((p.drops ?? []).length > 0 || p.interact === "REFILL"))
    .map((p) => {
      const can =
        p.interact === "REFILL"
          ? "Đứng cạnh rồi bấm"
          : `${TEN_CONG_CU[p.tool] ?? "Tay không"}${p.hits > 1 ? ` · ${p.hits} nhát` : ""}`;
      const ra = p.interact === "REFILL"
        ? "Đầy bình tưới"
        : (p.drops ?? [])
            .map((d) => `${d.min === d.max ? d.min : `${d.min}–${d.max}`} ${esc(itemName(d.id)).toLowerCase()}`)
            .join(", ") + (p.becomes ? `, để lại ${esc(content.props[p.becomes]?.name ?? p.becomes).toLowerCase()}` : "");
      return `<tr><td><b>${esc(p.name)}</b></td><td>${can}</td><td>${ra}</td></tr>`;
    });
  return (
    `<div class="table-wrap"><table>
          <tr><th>Thứ</th><th>Cần gì</th><th>Ra gì</th></tr>` +
    rows.join("\n          ") +
    `\n        </table></div>`
  );
}

/** Công thức chế ra CÔNG CỤ — nguyên liệu đọc từ `recipes`. */
function theCheTao() {
  return Object.values(content.recipes)
    .filter((r) => r && r.out?.id?.startsWith("tool:"))
    .map((r) => {
      const t = content.tools[r.out.id.slice(5)];
      const them = t?.capacity ? ` — chứa ${t.capacity} nước` : "";
      return `<div class="card"><h3>${esc(r.name)}</h3><p>${r.in
        .map((x) => `${x.n} ${esc(itemName(x.id)).toLowerCase()}`)
        .join(" + ")}${them}</p></div>`;
    })
    .join("\n          ");
}

/** Thay `{{khoa}}` trong một mẩu nội dung. Khoá lạ → build ĐỎ. */
function thaySoLieu(html, ten) {
  return html.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in SO_LIEU)) {
      throw new Error(`src/site/noi-dung/${ten}.html dùng {{${k}}} — không có khoá đó trong SO_LIEU`);
    }
    return String(SO_LIEU[k]);
  });
}

/** Đọc phần THÂN của một trang. Chữ nằm trong HTML, không nằm trong chuỗi JS. */
function noiDung(ten) {
  const raw = readFileSync(resolve(SRC, "site/noi-dung", `${ten}.html`), "utf8");
  return thaySoLieu(raw, ten);
}

/* ------------------------------------------------------------------- khung */

/* ---------------------------------------------------------------------------
   TRANG TÀI LIỆU KIỂU WIKI.

   Cường: "loại bỏ các trang tĩnh khác, chỉ để lại [game] và docs; trình bày
   trang tài liệu này giống như wiki — lối chơi, các vật, chi tiết vật. Tác giả
   / story: TRẦN CƯỜNG".

   Bốn trang giới thiệu cũ (Tính năng · Hướng dẫn · Cách game vận hành · Cài về
   máy) là trang QUẢNG CÁO: chúng nói về game cho người chưa chơi. Một cái wiki
   thì nói về THỨ TRONG GAME cho người đang chơi — mỗi cây, mỗi con, mỗi món đồ
   một trang tra được. Hai thể loại ấy không trộn vào nhau được, nên bốn trang
   kia đi hẳn.

   Nav xếp theo NHÓM như thanh bên của một wiki thật, không phải một hàng ngang:
   người tra cứu nhảy giữa các mục cùng loại, chứ không đọc tuần tự từ trái sang
   phải như trang giới thiệu.
--------------------------------------------------------------------------- */

const NAV_NHOM = [
  ["Bắt đầu", [
    ["/", "Trang chính"],
    ["/loi-choi/", "Lối chơi"],
  ]],
  ["Tra cứu", [
    ["/cay-trong/", "Cây trồng"],
    ["/vat-nuoi/", "Vật nuôi"],
    ["/vat-pham/", "Vật phẩm"],
    ["/hanh-dong/", "Hành động"],
  ]],
  ["Về dự án", [
    ["/tac-gia/", "Tác giả"],
    ["/privacy/", "Quyền riêng tư"],
  ]],
];

/** Danh sách phẳng — dùng cho phép soát "mục nào trong nav cũng có trang thật". */
const NAV = NAV_NHOM.flatMap(([, ds]) => ds);

/**
 * Vỏ trang — MỘT chỗ duy nhất quyết định nav, thẻ meta, chân trang.
 *
 * Các trang viết tay cũng dùng đúng khuôn này (xem `writeStaticNav` bên dưới
 * đồng bộ lại nav cho chúng), nên năm trang không bao giờ lệch nhau một mục.
 */
/**
 * Vỏ trang WIKI — MỘT chỗ duy nhất quyết định thanh bên, thẻ meta, chân trang.
 *
 * `hop` là hộp thông tin bên phải (infobox) — thứ làm một trang wiki ra wiki:
 * đọc cái hộp là biết ngay các con số, không phải đọc hết bài. `muc` là mục lục
 * dựng từ chính các tiêu đề của bài.
 */
function page({ title, desc, url, h1, tag, body, sprites = true, hop = "", muc = [], dan = "" }) {
  const nav = NAV_NHOM.map(
    ([ten, ds]) =>
      `<div class="wgrp"><b>${ten}</b>\n          ${ds
        .map(
          ([href, text]) =>
            `<a href="${href}"${href === url ? ' aria-current="page"' : ""}>${text}</a>`,
        )
        .join("\n          ")}</div>`,
  ).join("\n        ");
  const mucLuc = muc.length
    ? `      <nav class="wtoc" aria-label="Mục lục">
        <b>Mục lục</b>
        <ol>${muc.map(([id, ten]) => `<li><a href="#${id}">${esc(ten)}</a></li>`).join("")}</ol>
      </nav>\n`
    : "";
  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#14100c" />
    <meta name="description" content="${esc(desc)}" />
    <meta name="author" content="Trần Cường" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:type" content="article" />
    <title>${esc(title)}</title>
    <link rel="stylesheet" href="/site/site.css" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="/favicon-32.png" sizes="32x32" />
    <link rel="apple-touch-icon" href="/icon-180.png" />
${sprites ? '    <script type="module" src="/site/sprites.ts"></script>\n' : ""}  </head>
  <body class="wiki">
    <header class="wtop">
      <a class="wlogo" href="/"><img src="/favicon.svg" alt="" width="24" height="24" /><span>ONI<b>FARM</b> WIKI</span></a>
      <a class="wplay" href="/farm/">Chơi ngay</a>
    </header>
    <div class="wgrid">
      <aside class="wside">
        ${nav}
      </aside>
      <main class="wmain">
        <h1 class="wh1">${h1}</h1>
        <p class="wfrom">Từ OniFarm Wiki${tag ? ` · ${tag}` : ""}</p>
        <hr class="wrule" />
${hop}${dan}${mucLuc}${body}
        <div class="wcredit">
          <b>Tác giả · story:</b> TRẦN CƯỜNG ·
          <a href="/tac-gia/">trang tác giả</a>
        </div>
      </main>
    </div>
    <footer class="wfoot">
      <div class="wrap">
        OniFarm · game offline, save nằm trên máy bạn ·
        <a href="/">Trang chính</a> ·
        <a href="/privacy/">Quyền riêng tư</a> ·
        Tác giả: TRẦN CƯỜNG
      </div>
    </footer>
    <div class="sticky-play"><a class="cta" href="/farm/">Chơi ngay</a></div>
  </body>
</html>
`;
}

function write(rel, html) {
  const out = resolve(SRC, rel, "index.html");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  return out;
}

/* ------------------------------------------------------------- cây trồng */

const seasonName = (id) => content.seasons[id]?.name ?? id;

/** Tổng số ngày từ lúc gieo tới lúc chín. */
const tongNgay = (c) => c.growthDays.reduce((a, b) => a + b, 0);

/**
 * Lãi mỗi vụ, tính theo mức thu THẤP NHẤT.
 *
 * Cố ý lấy `yieldMin` chứ không lấy trung bình: con số trên trang phải là con
 * số người chơi CHẮC CHẮN nhận được. Hứa mức trung bình rồi người ta thu được
 * ít hơn là mất lòng tin, mà lòng tin thì không lấy lại bằng một dòng ghi chú.
 */
const lai = (c) => c.sellPrice * c.yieldMin - c.seedPrice;

function cropCard(c) {
  const stages = c.growthDays.map((_, i) => cx(`crop:${c.id}:${i}`, 28, ""));
  stages.push(cx(`crop:${c.id}`, 34, `${c.name} chín`));
  const mua = c.seasons.map((s) => `<span class="chip">${esc(seasonName(s))}</span>`).join("");
  const l = lai(c);
  return `        <article class="ent" id="cay-${esc(c.id)}">
          <div class="ent-art">${cx(`crop:${c.id}`, 64, c.name)}</div>
          <div class="ent-main">
            <h3>${esc(c.name)}</h3>
            <p class="ent-sub">Hạt giống: ${esc(c.seedName)} · ${tien(c.seedPrice)}đ một gói</p>
            <div class="chips">${mua}${c.regrowDays ? '<span class="chip alt">Thu nhiều lần</span>' : ""}</div>
            <dl class="facts">
              <div><dt>Trồng bao lâu</dt><dd>${ngay(tongNgay(c))}</dd></div>
              <div><dt>Mỗi lần thu</dt><dd>${c.yieldMin === c.yieldMax ? c.yieldMin : `${c.yieldMin}–${c.yieldMax}`} quả</dd></div>
              <div><dt>Bán được</dt><dd>${tien(c.sellPrice)}đ một quả</dd></div>
              <div><dt>Lãi chắc chắn</dt><dd class="${l >= 0 ? "up" : "down"}">${l >= 0 ? "+" : ""}${tien(l)}đ</dd></div>
              ${c.regrowDays ? `<div><dt>Thu lại sau</dt><dd>${ngay(c.regrowDays)}</dd></div>` : ""}
            </dl>
            <div class="grow">
              <span class="grow-lbl">Cây lớn dần:</span>
              ${stages.join("")}
            </div>
          </div>
        </article>`;
}

/**
 * Lãi MỖI NGÀY ở nhịp ổn định — con số trả lời đúng câu người chơi hỏi.
 *
 * "Lãi 520đ" tự nó không nói gì: 520đ sau năm ngày khác hẳn 520đ sau mười hai
 * ngày, mà trên cùng một mảnh đất thì thứ khan hiếm là NGÀY chứ không phải ô
 * đất. Nên chia cho số ngày.
 *
 * Hai công thức, vì hai loại cây khác nhau thật sự:
 *   · cây thu MỘT lần → (tiền bán − tiền hạt) / tổng số ngày lớn;
 *   · cây thu NHIỀU lần → tiền bán / nhịp thu lại, KHÔNG trừ tiền hạt.
 *
 * Chỗ thứ hai là chỗ dễ sai và tôi đã sai một lần: trừ tiền hạt ở mỗi lứa thì
 * cây thu nhiều lần bị tính thiệt, trong khi cả điểm mạnh của nó là gieo một
 * lần rồi hái mãi. Vụ ĐẦU vẫn tốn hạt và vẫn mất trọn `tongNgay` ngày — ghi rõ
 * dưới bảng, chứ không giấu vào một con số trung bình.
 */
function laiMoiNgay(c) {
  if (c.regrowDays > 0) return (c.sellPrice * c.yieldMin) / c.regrowDays;
  const n = tongNgay(c);
  return n > 0 ? lai(c) / n : 0;
}

/** Một hàng trong bảng so sánh. */
function cropRow(c) {
  const l = lai(c);
  const ld = laiMoiNgay(c);
  return `<tr>
    <th scope="row"><a href="#cay-${esc(c.id)}">${esc(c.name)}</a></th>
    <td>${c.seasons.map((x) => esc(seasonName(x))).join(", ")}</td>
    <td class="num">${ngay(tongNgay(c))}</td>
    <td class="num">${tien(c.seedPrice)}đ</td>
    <td class="num">${tien(c.sellPrice)}đ</td>
    <td class="num ${l >= 0 ? "up" : "down"}">${l >= 0 ? "+" : ""}${tien(l)}đ</td>
    <td class="num ${ld >= 0 ? "up" : "down"}"><b>${ld >= 0 ? "+" : ""}${tien(Math.round(ld))}đ</b></td>
  </tr>`;
}

function cropsPage() {
  const list = content.cropOrder.map((id) => content.crops[id]).filter(Boolean);

  /* MỘT thẻ cho MỘT cây.
     Bản cũ nhóm theo mùa rồi vẽ trọn cái thẻ trong TỪNG mùa cây đó hợp — hành
     là bốn mùa nên hành hiện bốn lần. Ra 120 thẻ cho 61 cây, trang nặng 174 KB,
     và tệ hơn cả: bốn thẻ cùng mang `id="cay-scallion"`, tức HTML sai và mọi
     liên kết `#cay-scallion` trở thành mơ hồ. Giờ mùa chỉ còn là một BẢNG MỤC
     trỏ tới thẻ duy nhất của cây đó. */
  const theoMua = content.seasonOrder.map((s) => ({
    id: s,
    name: seasonName(s),
    cay: list.filter((c) => c.seasons.includes(s)),
  }));

  const muc = theoMua
    .map((m) => `<a class="jump" href="#mua-${m.id}">${esc(m.name)} <b>${m.cay.length}</b></a>`)
    .join("") + `<a class="jump" href="#bang-lai">Lãi nhất</a>`;

  const mucMua = theoMua
    .map(
      (m) => `        <div class="mua-muc" id="mua-${m.id}">
          <h3>${esc(m.name)} <b>${m.cay.length}</b></h3>
          <div class="chips">
            ${m.cay.map((c) => `<a class="chip" href="#cay-${esc(c.id)}">${esc(c.name)}</a>`).join("")}
          </div>
        </div>`,
    )
    .join("\n");

  /* Bảng so sánh, sắp theo LÃI MỖI NGÀY. Cây thu nhiều lần lên đầu là đúng —
     đó chính là điều làm chúng đáng trồng, và nhìn bảng là thấy ngay. */
  const bang = list
    .slice()
    .sort((a, b) => laiMoiNgay(b) - laiMoiNgay(a) || a.name.localeCompare(b.name, "vi"))
    .map(cropRow)
    .join("\n");

  return page({
    title: "Cây trồng — OniFarm Wiki",
    desc: `Chi tiết ${list.length} loại cây trong OniFarm: trồng mấy ngày, thu được bao nhiêu, bán được bao nhiêu, lãi mỗi ngày, hợp mùa nào.`,
    url: "/cay-trong/",
    h1: "Cây trồng",
    tag: `Toàn bộ ${list.length} loại cây, kèm số ngày lớn, sản lượng và lãi mỗi ngày. Số lấy thẳng từ game nên không bao giờ lệch.`,
    wide: true,
    body: `    <section class="jump-bar"><div class="wrap"><div class="jumps">${muc}</div></div></section>

    <section>
      <div class="wrap">
        <h2>Mùa nào trồng được gì</h2>
        <p class="lead">Gieo trái mùa thì <b>không gieo được</b> — và cửa hàng cũng không bày bán hạt trái mùa, nên không có cách nào lỡ mua nhầm. Sàn <b>nhà kính</b> là ngoại lệ duy nhất: trên đó trồng gì cũng được, quanh năm.</p>
${mucMua}
        <p class="note">Sang mùa mà cây <b>chưa chín</b> và trái mùa thì héo. Cây <b>đã chín</b> thì không bao giờ mất — vụ đang chờ gặt luôn an toàn.</p>
      </div>
    </section>

    <section class="alt" id="bang-lai">
      <div class="wrap">
        <h2>Cây nào lãi nhất</h2>
        <p class="lead">Sắp theo <b>lãi mỗi ngày</b>, không phải lãi một vụ — trên cùng một mảnh đất thì thứ khan hiếm là ngày chứ không phải ô đất.</p>
        <div class="table-wrap">
          <table class="so-sanh">
            <thead><tr>
              <th scope="col">Cây</th><th scope="col">Mùa</th><th scope="col">Ngày</th>
              <th scope="col">Hạt</th><th scope="col">Bán</th><th scope="col">Lãi một vụ</th><th scope="col">Lãi mỗi ngày</th>
            </tr></thead>
            <tbody>
${bang}
            </tbody>
          </table>
        </div>
        <p class="note">Lãi tính theo sản lượng <b>thấp nhất</b> — con số chắc chắn thu được, không phải con số may mắn.
        Cây <b>thu nhiều lần</b> tính ở nhịp ổn định: gieo một lần rồi hái mãi, nên không trừ tiền hạt.
        Vụ <b>đầu</b> của chúng vẫn tốn tiền hạt và vẫn phải chờ trọn số ngày ở cột “Ngày”.</p>
      </div>
    </section>

    <section>
      <div class="wrap">
        <h2>Từng loại một</h2>
        <div class="ents">
${list.map(cropCard).join("\n")}
        </div>
      </div>
    </section>`,
  });
}

/* ------------------------------------------------------------- vật nuôi */

const HOUSING = {
  pen: "Nuôi trong chuồng có rào",
  free: "Thả rông quanh sân",
  water: "Sống dưới ao",
};

/** Khu chuồng dựng sẵn theo id, hoặc null. */
const penOf = (a) => (content.tiles.pens ?? []).find((q) => q.id === a.pen) ?? null;

const JOB = {
  patrol: "Đi tuần, đuổi chuột và sóc",
  pest: "Phá hoại — không nuôi được",
};

function animalCard(a) {
  const sp = a.products
    .map(
      (p) =>
        `<li>${esc(itemName(p.id))} — ${p.min === p.max ? p.min : `${p.min}–${p.max}`} mỗi ${ngay(p.every)}</li>`,
    )
    .join("");
  const thit = a.meat
    ? `<li>${esc(itemName(a.meat.id))} — ${a.meat.min === a.meat.max ? a.meat.min : `${a.meat.min}–${a.meat.max}`}, lấy một lần khi bán con vật</li>`
    : "";
  return `        <article class="ent" id="vat-${esc(a.id)}">
          <div class="ent-art">${cx(`animal:${a.id}`, 64, a.name)}</div>
          <div class="ent-main">
            <h3>${esc(a.name)}</h3>
            <p class="ent-sub">${a.price ? `${tien(a.price)}đ một con` : "Không mua được"}</p>
            <div class="chips">
              <span class="chip">${esc(penOf(a)?.name ?? HOUSING[a.housing] ?? a.housing)}</span>
              ${a.job ? `<span class="chip alt">${esc(JOB[a.job] ?? a.job)}</span>` : ""}
            </div>
            <dl class="facts">
              <div><dt>Lớn sau</dt><dd>${ngay(a.matureDays)}</dd></div>
              <div><dt>Ăn gì</dt><dd>${a.feed.length ? a.feed.map((f) => esc(itemName(f))).join(", ") : "Tự kiếm ăn"}${a.pecks ? " · mổ sâu trên cỏ" : ""}</dd></div>
              <div><dt>Về đâu</dt><dd>${penOf(a) ? `${esc(penOf(a).name)}${penOf(a).feed ? ", có máng" : ""}` : "Không có chuồng — đi khắp nông trại"}</dd></div>
              <div><dt>Bỏ đói</dt><dd>${a.pecks ? "Gần như không chết đói — còn cỏ là còn ăn" : `Chết sau ${ngay(a.starveDays)} nhịn liên tiếp`}</dd></div>
            </dl>
            ${sp || thit ? `<ul class="prods">${sp}${thit}</ul>` : ""}
          </div>
        </article>`;
}

function itemName(id) {
  const [pre, rest] = [id.slice(0, id.indexOf(":")), id.slice(id.indexOf(":") + 1)];
  if (pre === "item") return content.materials[rest]?.name ?? rest;
  if (pre === "crop") return content.crops[rest]?.name ?? rest;
  if (pre === "seed") return content.crops[rest]?.seedName ?? rest;
  if (pre === "tool") return content.tools[rest]?.name ?? rest;
  if (pre === "build") return content.buildings[rest]?.name ?? rest;
  return id;
}

function animalsPage() {
  const all = content.animalOrder.map((id) => content.animals[id]).filter(Boolean);
  const nuoi = all.filter((a) => a.job !== "pest");
  const pha = all.filter((a) => a.job === "pest");
  const xe = content.vehicleOrder.map((id) => content.vehicles[id]).filter(Boolean);

  return page({
    title: "Vật nuôi — OniFarm Wiki",
    desc: "Chi tiết từng con vật trong OniFarm: nuôi bao lâu thì lớn, ăn gì, cho sữa/trứng/lông mấy ngày một lần, bán thịt được bao nhiêu.",
    url: "/vat-nuoi/",
    h1: "Vật nuôi",
    tag: "Con nào ăn gì, mấy ngày cho một lứa, và chuyện gì xảy ra nếu bạn quên cho ăn.",
    wide: true,
    body: `    <section>
      <div class="wrap">
        <h2>Nuôi được</h2>
        <p class="lead">Mua ở cửa hàng rồi có <b>xe thật</b> chạy từ cổng vào, đậu ở kho và thả hàng xuống; con vật tự đi về khu của nó. Loài <b>dưới nước</b> thì xe đậu ở <b>bờ ao</b> và thả thẳng xuống nước — không có chuyện con cá xuất hiện giữa sân rồi tự bơi qua đất.</p>
        <p>Đứng cạnh con vật là nút hành động đổi thành <span class="btn-pill">THU</span>; còn cho ăn thì <b>đổ vào máng</b> chứ không đút tận miệng — xem mục dưới.</p>
        <div class="ents">
${nuoi.map(animalCard).join("\n")}
        </div>
      </div>
    </section>
    <section>
      <div class="wrap">
        <h2>Nông trại chia lô</h2>
        <p class="lead">Bản đồ quy hoạch sẵn thành từng vùng, mỗi vùng một việc — bạn không phải phân lô gì cả. Ruộng là một lưới BÀN CỜ: lô nào cũng bằng nhau, giữa hai lô là một ô bờ lát lối mòn, và mỗi lô có một tấm biển cắm ghi tên.</p>
        <div class="ents">
${(content.tiles.zones ?? [])
  .map((z) => `        <article class="ent sm">
          <div class="ent-main">
            <h3>${esc(z.name)}</h3>
            <p class="ent-sub">${z.w}×${z.h} ô</p>
            <p>${
              z.kind === "farm"
                ? "Chỗ DUY NHẤT cuốc được. Ra ngoài vùng này cuốc không ăn, nên bạn không thể lỡ tay băm nát địa hình thành luống — mà luống bỏ hoang thì phải mấy đêm mới mọc cỏ lại."
                : `Chỗ đốn gỗ. Mỗi đêm ô cỏ trống trong rừng có ${Math.round((content.balance.forestRegrowChance ?? 0) * 100)}% mọc lên cây con, cây con lớn dần thành cây gỗ — nên chặt trụi một vạt thì vài đêm sau nó về.`
            }</p>
          </div>
        </article>`)
  .join("\n")}
        <article class="ent sm">
          <div class="ent-main">
            <h3>Hồ nước</h3>
            <p class="ent-sub">có cầu gỗ ra giữa hồ</p>
            <p>Hồ trũng hẳn xuống so với đồng cỏ, vành đá quanh bờ. Cầu gỗ bắc TRÊN mặt nước — bạn đi ra tới giữa hồ, còn cá vẫn bơi ngay dưới chân. Đứng bờ hoặc đứng cầu, cầm cám cá rồi bấm CHO CÁ ĂN.</p>
          </div>
        </article>
        </div>
      </div>
    </section>
    <section>
      <div class="wrap">
        <h2>Khu chuồng</h2>
        <p class="lead">Nông trại chia lô sẵn: rào đã đóng, máng đã đặt, cổng để mở. Bạn không phải xây gì cả — mua con vật là nó tự đi về khu của mình. Loài nào ăn cùng một thứ thì ở chung khu và chung một cái máng.</p>
        <div class="ents">
${(content.tiles.pens ?? [])
  .map((pen) => {
    const o = content.animalOrder
      .map((id) => content.animals[id])
      .filter((a) => a && a.pen === pen.id);
    return `        <article class="ent sm">
          <div class="ent-main">
            <h3>${esc(pen.name)}</h3>
            <p class="ent-sub">${pen.w}×${pen.h} ô${pen.swim ? " · dưới nước, không cần rào" : " · có rào, cổng mở ra đường"}</p>
            <p>${o.length ? `Nuôi: ${o.map((a) => esc(a.name)).join(", ")}.` : "Chưa loài nào ở đây."} ${
              (pen.feeds ?? []).length === 0
                ? "Khu này không có máng."
                : pen.swim
                  ? `Không đặt được máng giữa hồ: đứng bờ ao, cầm ${(pen.feeds ?? []).map((f) => esc(itemName(f))).join(" hoặc ")} rồi bấm CHO CÁ ĂN — cả đàn đang đói ăn cùng lúc.`
                  : `Máng trong khu nhận ${(pen.feeds ?? []).map((f) => esc(itemName(f))).join(", ")} — đứng cạnh máng, cầm một trong số đó rồi bấm ĐỔ MÁNG. Máng chứa ${content.balance.troughMax ?? 12} phần; con vật đói tự tới ăn, mỗi bữa một phần.`
            }</p>
          </div>
        </article>`;
  })
  .join("\n")}
        </div>
      </div>
    </section>
    <section>
      <div class="wrap">
        <h2>Thức ăn</h2>
        <p class="lead">Mỗi loài ăn được vài món chứ không phải đúng một món — hết thứ này thì còn thứ kia. Cắt cỏ dày lấy rơm, bó sợi cỏ thành cỏ khô, hoặc mua thẳng ở tab <b>Thức ăn</b> trong cửa hàng: mua thì đắt hơn tự cắt, đó là chỗ đánh đổi.</p>
        <div class="ents">
${content.materialOrder
  .map((id) => content.materials[id])
  .filter((m) => (m.buyPrice ?? 0) > 0)
  .map((m) => {
    const an = content.animalOrder
      .map((id) => content.animals[id])
      .filter((a) => a && a.job !== "pest" && a.feed.includes(`item:${m.id}`));
    return `        <article class="ent sm">
          <div class="ent-art">${cx(`item:${m.id}`, 40, m.name)}</div>
          <div class="ent-main">
            <h3>${esc(m.name)}</h3>
            <p class="ent-sub">Mua ${tien(m.buyPrice)}đ · bán ${tien(m.sellPrice)}đ</p>
            <p>${an.length ? `Cho: ${an.map((a) => esc(a.name)).join(", ")}.` : "Chưa loài nào ăn."}</p>
          </div>
        </article>`;
  })
  .join("\n")}
        </div>
      </div>
    </section>
    <section>
      <div class="wrap">
        <h2>Kẻ phá hoại</h2>
        <p class="lead">Chúng sinh ra <b>về đêm</b>, và càng nhiều cây chín bỏ ngoài ruộng thì càng nhiều con — ruộng trống thì không có con nào. Đó là lý do nên thu hoạch trước khi đi ngủ.</p>
        <p>Con <b>chó</b> là câu trả lời: ban ngày nó <b>đi tuần</b> qua từng lô ruộng và từng chuồng, gặp là bắt. Tối thì nó <b>về nhà nằm</b> — nên chó không canh hộ bạn qua đêm, nó dọn sạch vào sáng hôm sau.</p>
        <div class="ents">
${pha.map(animalCard).join("\n")}
        </div>
      </div>
    </section>
    <section>
      <div class="wrap">
        <h2>Xe cộ</h2>
        <p class="lead">Xe chạy trên đường nhựa và lối mòn. Xe giao hàng chở con vật và xe mới bạn vừa mua vào tận nơi; xe thu mua thì tự ghé bãi đậu lấy nông sản trong kho và trả tiền.</p>
        <div class="ents">
${xe
  .map(
    (v) => `        <article class="ent">
          <div class="ent-art">${cx(`vehicle:${v.id}`, 64, v.name)}</div>
          <div class="ent-main">
            <h3>${esc(v.name)}</h3>
            <p class="ent-sub">${v.price ? `${tien(v.price)}đ` : "Không mua — xe của bên ngoài tự ghé"}</p>
            <dl class="facts">
              <div><dt>Chở được</dt><dd>${v.capacity} món</dd></div>
              ${v.buyBonus ? `<div><dt>Trả cao hơn</dt><dd>+${Math.round(v.buyBonus * 100)}%</dd></div>` : ""}
            </dl>
          </div>
        </article>`,
  )
  .join("\n")}
        </div>
      </div>
    </section>`,
  });
}

/* ------------------------------------------------------------- hành động */

/** Mọi việc nhân vật làm được, viết bằng lời của người chơi chứ không phải của
 *  người lập trình. `nut` là đúng chữ in trên nút hành động trong game. */
const HANH_DONG = [
  {
    nut: "CÀY",
    ten: "Cày đất",
    can: "tool:hoe",
    y: "Biến một ô cỏ thành luống đất gieo được. Chỉ ăn TRONG KHU RUỘNG — nông trại chia lô sẵn, ra ngoài vùng đó thì cuốc không ăn.",
    meo: "Nhờ thế bạn không thể vô tình băm cả bản đồ thành luống: rừng vẫn là rừng, sân vẫn là sân. Đất đã cày mà bỏ không vài ngày sẽ tự mọc cỏ lại.",
  },
  {
    nut: "GIEO",
    ten: "Gieo hạt",
    can: null,
    y: "Cầm một gói hạt trên hotbar rồi bấm vào ô đất đã cày. Mỗi gói gieo được một ô.",
    meo: "Gieo trái mùa thì KHÔNG gieo được — cửa hàng cũng không bày bán hạt trái mùa, nên không có cách nào lỡ mua nhầm. Sàn nhà kính là ngoại lệ duy nhất: trên đó trồng gì cũng được, quanh năm.",
  },
  {
    nut: "TƯỚI",
    ten: "Tưới nước",
    can: "tool:can",
    y: "Đất ẩm thì đêm đó cây mới lớn. Quên tưới là cây đứng yên một ngày, không có ngoại lệ.",
    meo: "Trời mưa thì cả ruộng ngoài trời tự ẩm — hôm đó khỏi tưới, để dành sức làm việc khác.",
  },
  {
    nut: "MÚC",
    ten: "Múc đầy bình",
    can: "tool:can",
    y: "Đứng cạnh ao hoặc giếng rồi bấm. Bình hết nước thì tưới không ăn thua.",
    meo: "Bình tưới lớn chứa nhiều hơn gấp đôi, đỡ phải chạy đi chạy lại.",
  },
  {
    nut: "THU",
    ten: "Thu hoạch",
    can: null,
    y: "Cây chín có ánh lấp lánh. Bấm là nông sản vào túi. Vài loại cây thu xong mọc lại, không phải gieo mới.",
    meo: "Cây bị bệnh vẫn thu được nhưng ít hơn hẳn — thấy đốm là chữa ngay.",
  },
  {
    nut: "CHỮA",
    ten: "Chữa cây bệnh",
    can: "item:medicine",
    y: "Cây có đốm nâu là đang bệnh: nó không lớn thêm và thu được ít. Một lọ thuốc chữa một cây.",
    meo: "Bệnh hay xuất hiện sau mấy ngày ẩm liên tiếp. Trời mưa dài thì sáng ra đi soi ruộng một vòng.",
  },
  {
    nut: "NHỔ",
    ten: "Nhổ cỏ dại",
    can: null,
    y: "Cỏ dại mọc chen vào luống bỏ không. Nhổ đi để lấy lại ô đất.",
    meo: "Cỏ cao cắt ra rơm và cỏ khô — thứ để cho bò, dê, cừu ăn. Đừng dọn sạch cỏ quá sớm.",
  },
  {
    nut: "DỌN CỎ",
    ten: "Dọn cỏ dại trong lô",
    can: null,
    y: "Cỏ dại và bụi nhỏ mọc lan vào lô ruộng qua đêm, và một ô có cỏ là một ô không cày được. Nhổ tay không, không cần công cụ gì.",
    meo: "Đây là việc DUY NHẤT trong nhóm phá vật thể mà người làm thuê và nút Tự động làm được phép tự ý làm — vì nó chỉ đụng thứ tự mọc lên và chỉ trong lô ruộng. Cây và đá ở ngoài vẫn phải bấm tay, nên không có cách nào chúng dọn mất cảnh quan bạn cố ý chừa.",
  },
  {
    nut: "CHẶT",
    ten: "Chặt cây lấy gỗ",
    can: "tool:axe",
    y: "Cây to cần chặt vài nhát mới đổ. Gỗ dùng để chế công cụ và xây công trình.",
    meo: "Rìu thép chặt một nhát bằng rìu gỗ hai nhát, và tốn cùng ngần ấy sức.",
  },
  {
    nut: "ĐẬP",
    ten: "Đập đá lấy khoáng",
    can: "tool:pickaxe",
    y: "Đá cho đá xây, quặng cho kim loại. Đây là nguồn nguyên liệu chính cho mọi thứ hiện đại.",
    meo: "Đá đập hết sẽ mọc lại sau vài ngày, không lo cạn.",
  },
  {
    nut: "XÂY",
    ten: "Chế độ xây dựng",
    can: null,
    y: "Công trình — vòi tưới và sàn nhà kính — dựng ở đây. Bấm XÂY là thời gian dừng lại; ấn ở đầu đoạn, rê tới cuối, nhả tay là cả đoạn hiện ra. Hàng rào thì không: các khu chuồng đã rào sẵn từ đầu.",
    meo: "Vẽ bao nhiêu ô thì trả tiền bấy nhiêu, không phải mua trước rồi đoán xem cần mấy ô.",
  },
  {
    nut: "MUA",
    ten: "Mua ở cửa hàng",
    can: null,
    y: "Hạt giống, công cụ, công trình, con vật và xe. Mỗi tab một loại, có hình minh hoạ để khỏi đoán.",
    meo: "Con vật và xe không vào túi — một chiếc xe sẽ chở tới điểm giao cạnh quầy bán.",
  },
  {
    nut: "BÁN",
    ten: "Bán ở quầy thu mua",
    can: null,
    y: "Bán từng phần bằng nút cộng trừ, hoặc bán tất cả một lần. Quầy đọc được cả kho chứ không chỉ túi.",
    meo: "Nông sản để lâu không hỏng — có thể gom một vụ rồi bán một lượt.",
  },
  {
    nut: "KHO",
    ten: "Gửi hàng vào kho",
    can: null,
    y: "Kho chứa được nhiều hơn túi rất nhiều. Có nút cất tất cả nông sản chỉ bằng một bấm.",
    meo: "Người làm thuê tự đem hàng về kho, và xe thu mua cũng lấy từ kho. Kho là trung tâm của nông trại.",
  },
  {
    nut: "CHẾ",
    ten: "Chế tạo",
    can: null,
    y: "Ghép nguyên liệu thành công cụ tốt hơn và vật liệu cao cấp. Thiếu thứ gì thì hiện đỏ ngay.",
    meo: "Nâng cấp bình tưới và rìu sớm — chúng tiết kiệm sức mỗi ngày, càng dùng lâu càng lời.",
  },
  {
    nut: "ĐỔ MÁNG",
    ten: "Đổ thức ăn vào máng",
    can: null,
    y: "Cầm thức ăn, đứng cạnh cái MÁNG của khu rồi bấm. Không có kiểu đút tận miệng từng con — thức ăn vào chuồng bằng đúng một cửa là cái máng.",
    meo: "Máng là một bể chung: món nào đổ cũng được và trộn lẫn, món đắt thì no lâu hơn. Nhờ vậy đi vắng vài ngày đàn vẫn có cái ăn. Bò, dê và cừu cùng ăn rơm nên dùng chung một máng.",
  },
  {
    nut: "RẮC HỒ",
    ten: "Rắc thức ăn xuống ao",
    can: null,
    y: "Cá không có máng — đứng ở bờ, cầm thức ăn của chúng rồi bấm là rắc xuống mặt nước.",
    meo: "Gà và vịt thì không cần cả hai: chúng mổ sâu trên cỏ, nên khu của chúng cố ý không có máng.",
  },
  {
    nut: "NHẤC",
    ten: "Nhấc một vật lên vác",
    can: null,
    y: "Tay không, đứng cạnh khúc gỗ hay hòn đá rồi bấm là vác lên. Đang vác thì nút đổi thành ĐẶT để hạ xuống một ô trống.",
    meo: "Vác là cách dọn một vật ra khỏi chỗ nó đang chắn đường, mà không phải đập vỡ nó. Không đặt xuống được ô nào sẽ tự nhốt mình — game chặn trước, không cho đặt.",
  },
  {
    nut: "VÀO",
    ten: "Vào nhà",
    can: null,
    y: "Chạm cửa nhà để vào trong. Trong nhà có giường để ngủ.",
    meo: "Thời gian vẫn trôi khi bạn ở trong nhà — cây vẫn lớn, con vật vẫn đói.",
  },
  {
    nut: "NGỦ",
    ten: "Ngủ qua đêm",
    can: null,
    y: "Đây là lúc mọi thứ xảy ra: cây lớn thêm một bậc, tiền lãi vào, thời tiết đổi, con vật già thêm một ngày.",
    meo: "Quá 2 giờ sáng mà chưa ngủ là ngất giữa đồng, sáng dậy mất sức. Về sớm.",
  },
];

function actionsPage() {
  const cards = HANH_DONG.map(
    (h) => `        <article class="act">
          <div class="act-head">
            <span class="btn-pill big">${esc(h.nut)}</span>
            ${h.can ? cx(h.can, 32, itemName(h.can)) : ""}
          </div>
          <h3>${esc(h.ten)}</h3>
          ${h.can ? `<p class="ent-sub">Cần cầm: ${esc(itemName(h.can))}</p>` : ""}
          <p>${esc(h.y)}</p>
          <p class="meo"><b>Mẹo.</b> ${esc(h.meo)}</p>
        </article>`,
  ).join("\n");

  const cong = content.toolOrder
    .map((id) => content.tools[id])
    .filter(Boolean)
    .map(
      (t) => `        <article class="ent sm">
          <div class="ent-art">${cx(`tool:${t.id}`, 40, t.name)}</div>
          <div class="ent-main">
            <h3>${esc(t.name)}</h3>
            <p class="ent-sub">${t.capacity ? `Chứa ${t.capacity} lần tưới` : t.power ? `Mạnh ${t.power}` : "Dụng cụ cơ bản"}</p>
          </div>
        </article>`,
    )
    .join("\n");

  const ct = content.buildingOrder
    .map((id) => content.buildings[id])
    // Hàng rào là địa hình dựng sẵn của khu chuồng, không phải hàng xây được —
    // liệt kê nó ở bảng "xây được những gì" là hứa một thứ không có.
    .filter((b) => b && b.buildable !== false)
    .map(
      (b) => `        <article class="ent sm">
          <div class="ent-art">${cx(`build:${b.id}`, 40, b.name)}</div>
          <div class="ent-main">
            <h3>${esc(b.name)}</h3>
            <p class="ent-sub">${tien(b.price ?? 0)}đ</p>
            ${b.desc ? `<p>${esc(b.desc)}</p>` : ""}
          </div>
        </article>`,
    )
    .join("\n");

  return page({
    title: "Hành động — OniFarm Wiki",
    desc: "Tất cả việc nhân vật trong OniFarm làm được: cày, gieo, tưới, thu, chặt, đập, xây, mua bán, chế tạo, chăn nuôi — kèm mẹo cho từng việc.",
    url: "/hanh-dong/",
    h1: "Hành động",
    tag: "Nút to góc dưới màn hình đổi chữ theo việc bạn sắp làm. Đây là toàn bộ danh sách chữ đó.",
    wide: true,
    body: `    <section>
      <div class="wrap">
        <h2>Nút hành động nói gì</h2>
        <p class="lead">Bạn không phải nhớ phím nào cả. Ngắm vào một ô, nút sẽ tự ghi việc làm được ở đó — và nếu chưa làm được, nó nói luôn vì sao.</p>
        <div class="acts">
${cards}
        </div>
      </div>
    </section>
    <section>
      <div class="wrap">
        <h2>Công cụ</h2>
        <div class="ents cols">
${cong}
        </div>
      </div>
    </section>
    <section>
      <div class="wrap">
        <h2>Công trình xây được</h2>
        <div class="ents cols">
${ct}
        </div>
      </div>
    </section>`,
  });
}


/* ------------------------------------------------------------- luật chơi ---

   Bản DÀNH CHO NGƯỜI CHƠI của `docs/LOI-CHOI.md`. Tài liệu trong `docs/` viết
   cho người sửa mã: nó nói vì sao luật được quyết như thế. Trang này chỉ trả
   lời "chơi thì phải biết gì", và mọi con số đọc thẳng từ content — nên không
   có cách nào nó nói sai giờ ngủ hay sai xác suất bệnh.
*/

function bangLuat(hang) {
  return (
    `<div class="table-wrap"><table class="luat"><tbody>` +
    hang.map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`).join("") +
    `</tbody></table></div>`
  );
}

/* ------------------------------------------------------------ TRANG CHÍNH */

/**
 * Trang chính của wiki. Không phải trang quảng cáo: nó là CỬA TRA CỨU — bao
 * nhiêu cây, bao nhiêu loài, bao nhiêu món, và đường vào từng danh mục.
 */
function trangChinhPage() {
  const nCay = content.cropOrder.length;
  const nVat = content.animalOrder.filter((id) => content.animals[id]?.job !== "pest").length;
  const nMon = content.materialOrder.length;
  const nCong = content.toolOrder.length;
  const mauCay = content.cropOrder.slice(0, 10).map((id) => cx(`crop:${id}`, 32, ""));
  const mauVat = content.animalOrder.slice(0, 6).map((id) => cx(`animal:${id}`, 32, ""));

  const the = (href, ten, dem, mo, anh) => `          <a class="wcard" href="${href}">
            <div class="wcard-art">${anh}</div>
            <b>${esc(ten)}</b>
            <span class="wcard-n">${dem}</span>
            <p>${esc(mo)}</p>
          </a>`;

  const dan = `        <section class="wbox">
      <p class="lead">
        Đây là sổ tra cứu của <b>OniFarm</b> — một game nông trại pixel chơi thẳng trên trình duyệt,
        không cần cài, không cần mạng sau lần mở đầu. Mọi con số trên các trang dưới đây
        <b>sinh thẳng từ dữ liệu game</b>, nên chúng không bao giờ lệch với thứ bạn gặp lúc chơi.
      </p>
      <p class="lead">Tác giả · story: <b>TRẦN CƯỜNG</b>.</p>
    </section>
`;

  const body = `
    <h2 id="danh-muc">Danh mục</h2>
    <div class="wcards">
${the("/loi-choi/", "Lối chơi", "luật", "Một ngày dài bao lâu, năng lượng tiêu thế nào, mùa và thời tiết đổi ra sao.", "")}
${the("/cay-trong/", "Cây trồng", `${nCay} loại`, "Mỗi cây: gieo mùa nào, mấy ngày chín, giá hạt, giá bán, lãi mỗi ngày.", mauCay.join(""))}
${the("/vat-nuoi/", "Vật nuôi", `${nVat} loài`, "Ăn gì, mấy ngày một lứa, cho sữa/trứng/lông hay lấy thịt.", mauVat.join(""))}
${the("/vat-pham/", "Vật phẩm", `${nMon + nCong} món`, "Nguyên liệu, món chế biến và công cụ — mỗi món một trang chi tiết.", "")}
${the("/hanh-dong/", "Hành động", "mọi nút", "Từng việc nhân vật làm được trên một ô đất, cần cầm gì và tốn bao nhiêu sức.", "")}
${the("/tac-gia/", "Tác giả", "story", "Ai làm ra nông trại này, và nó bắt đầu từ đâu.", "")}
    </div>

    <h2 id="bat-dau">Bắt đầu từ đâu</h2>
    <ol class="wsteps">
      <li><b>Cày một ô đất.</b> Cầm cuốc, đứng cạnh ô trong lô ruộng, bấm nút chính.</li>
      <li><b>Gieo rồi tưới.</b> Hạt mua ở Chợ; nước múc ở giếng hoặc bờ hồ.</li>
      <li><b>Ngủ một đêm.</b> Cây chỉ lớn khi sang ngày mới, và chỉ lớn nếu ô còn ẩm.</li>
      <li><b>Thu rồi bán.</b> Bán ở Quầy thu mua, hoặc để xe tới chở đi.</li>
      <li><b>Thuê người làm.</b> Từ đó nông trại chạy cả lúc bạn đứng nhìn.</li>
    </ol>

    <h2 id="so-lieu">Vài con số</h2>
    ${bangLuat([
      ["Cây trồng", `${nCay} loại`],
      ["Vật nuôi", `${nVat} loài`],
      ["Nguyên liệu và món chế biến", `${nMon} món`],
      ["Công cụ", `${nCong} món`],
      ["Công thức chế tạo", `${SO_LIEU.soCongThuc}`],
      ["Một ngày trong game", `${SO_LIEU.phutMoiNgayThat} phút ngoài đời`],
      ["Kịch bản kiểm thử", `${SO_LIEU.soKichBan}`],
    ])}
`;

  return page({
    title: "OniFarm Wiki — sổ tra cứu cây trồng, vật nuôi, vật phẩm",
    desc: `Sổ tra cứu OniFarm: ${nCay} loại cây, ${nVat} loài vật, ${nMon + nCong} vật phẩm, luật chơi và mọi hành động. Số liệu sinh thẳng từ dữ liệu game. Tác giả: Trần Cường.`,
    url: "/",
    h1: "Trang chính",
    tag: "sổ tra cứu của OniFarm",
    muc: [["danh-muc", "Danh mục"], ["bat-dau", "Bắt đầu từ đâu"], ["so-lieu", "Vài con số"]],
    dan,
    body,
  });
}

/* -------------------------------------------------------------- VẬT PHẨM */

/** Mọi thứ CẦM ĐƯỢC, gom một chỗ: nguyên liệu · món chế biến · công cụ · nông sản. */
function moiVatPham() {
  const ra = [];
  for (const id of content.materialOrder) {
    const m = content.materials[id];
    if (!m) continue;
    const ct = Object.values(content.recipes ?? {}).find((r) => r.out?.id === `item:${id}`);
    ra.push({
      key: `item:${id}`, slug: `vp-${id}`, ten: m.name,
      loai: ct ? "Món chế biến" : "Nguyên liệu",
      ban: m.sellPrice ?? 0, mua: m.buyPrice ?? 0,
      banDuoc: m.sell !== false, congThuc: ct ?? null,
      nangLuong: m.energy ?? 0,
    });
  }
  for (const id of content.toolOrder) {
    const t = content.tools[id];
    if (!t) continue;
    const ct = Object.values(content.recipes ?? {}).find((r) => r.out?.id === `tool:${id}`);
    ra.push({
      key: `tool:${id}`, slug: `vp-tool-${id}`, ten: t.name,
      loai: "Công cụ", ban: 0, mua: t.buyPrice ?? 0, banDuoc: false,
      congThuc: ct ?? null, nangLuong: 0, viec: t.action ?? "", suc: t.capacity ?? 0,
    });
  }
  return ra;
}

const tenNguyenLieu = (id) => itemName(id);

function vatPhamPage() {
  const ds = moiVatPham();
  const nhom = [
    ["Nguyên liệu", ds.filter((v) => v.loai === "Nguyên liệu")],
    ["Món chế biến", ds.filter((v) => v.loai === "Món chế biến")],
    ["Công cụ", ds.filter((v) => v.loai === "Công cụ")],
  ];

  const bang = (list) => `        <table class="wtab">
          <thead><tr><th>Món</th><th>Bán</th><th>Mua</th><th>Chế tạo từ</th><th></th></tr></thead>
          <tbody>
${list
  .map(
    (v) => `            <tr id="${v.slug}">
              <th scope="row">${cx(v.key, 26, v.ten)} ${esc(v.ten)}</th>
              <td>${v.banDuoc && v.ban ? `${tien(v.ban)}đ` : "—"}</td>
              <td>${v.mua ? `${tien(v.mua)}đ` : "—"}</td>
              <td>${v.congThuc ? v.congThuc.in.map((i) => `${esc(tenNguyenLieu(i.id))} ×${i.n}`).join(" + ") : "—"}</td>
              <td><a href="/vat-pham/${v.slug}/">chi tiết</a></td>
            </tr>`,
  )
  .join("\n")}
          </tbody>
        </table>`;

  const body = nhom
    .map(
      ([ten, list], i) => `
    <h2 id="n${i}">${esc(ten)} <span class="wdem">${list.length} món</span></h2>
${bang(list)}`,
    )
    .join("\n");

  return page({
    title: "Vật phẩm — OniFarm Wiki",
    desc: `Toàn bộ ${ds.length} vật phẩm trong OniFarm: nguyên liệu, món chế biến và công cụ — giá bán, giá mua, công thức chế tạo.`,
    url: "/vat-pham/",
    h1: "Vật phẩm",
    tag: `${ds.length} món`,
    muc: nhom.map(([ten], i) => [`n${i}`, ten]),
    body,
  });
}

/** Một trang CHI TIẾT cho mỗi món — đây là thứ làm sổ tra cứu ra wiki. */
function vatPhamChiTiet(v) {
  const dung = Object.values(content.recipes ?? {}).filter((r) =>
    (r.in ?? []).some((i) => i.id === v.key),
  );
  const hop = `        <aside class="winfo">
          <div class="winfo-art">${cx(v.key, 64, v.ten)}</div>
          <b class="winfo-ten">${esc(v.ten)}</b>
          <dl>
            <dt>Loại</dt><dd>${esc(v.loai)}</dd>
            ${v.banDuoc && v.ban ? `<dt>Giá bán</dt><dd>${`${tien(v.ban)}đ`}</dd>` : ""}
            ${v.mua ? `<dt>Giá mua</dt><dd>${`${tien(v.mua)}đ`}</dd>` : ""}
            ${!v.banDuoc && v.loai !== "Công cụ" ? `<dt>Bán</dt><dd>không bán được</dd>` : ""}
            ${v.nangLuong ? `<dt>Ăn được</dt><dd>hồi ${v.nangLuong} năng lượng</dd>` : ""}
            ${v.viec ? `<dt>Dùng để</dt><dd>${esc(v.viec)}</dd>` : ""}
            ${v.suc ? `<dt>Dung tích</dt><dd>${v.suc} lần tưới</dd>` : ""}
          </dl>
        </aside>`;

  const body = `
    <h2 id="lay">Lấy ở đâu</h2>
    <ul class="wlist">
      ${v.congThuc ? `<li><b>Chế tạo</b> từ ${v.congThuc.in.map((i) => `${esc(tenNguyenLieu(i.id))} ×${i.n}`).join(" + ")}.</li>` : ""}
      ${v.mua ? `<li><b>Mua</b> ở Chợ với giá ${`${tien(v.mua)}đ`}.</li>` : ""}
      ${!v.congThuc && !v.mua ? "<li>Nhặt được ngoài nông trại, hoặc do vật nuôi cho.</li>" : ""}
    </ul>

    <h2 id="dung">Dùng làm gì</h2>
    <ul class="wlist">
      ${v.banDuoc && v.ban ? `<li><b>Bán</b> ở Quầy thu mua, ${`${tien(v.ban)}đ`} một đơn vị.</li>` : ""}
      ${v.nangLuong ? `<li><b>Ăn</b> để hồi ${v.nangLuong} năng lượng.</li>` : ""}
      ${dung.length
        ? dung
            .map(
              (r) =>
                `<li><b>Chế tạo</b> ${esc(r.name)} (cần ${(r.in ?? []).map((i) => `${esc(tenNguyenLieu(i.id))} ×${i.n}`).join(" + ")}).</li>`,
            )
            .join("\n      ")
        : ""}
      ${!v.banDuoc && !v.nangLuong && !dung.length ? "<li>Giữ trong kho để dùng khi cần.</li>" : ""}
    </ul>

    <p class="wback"><a href="/vat-pham/">← Về danh sách vật phẩm</a></p>
`;

  return page({
    title: `${v.ten} — OniFarm Wiki`,
    desc: `${v.ten} trong OniFarm: ${v.loai.toLowerCase()}${v.ban ? `, bán ${v.ban}đ` : ""}${v.congThuc ? ", chế tạo được" : ""}.`,
    url: "/vat-pham/",
    h1: esc(v.ten),
    tag: v.loai.toLowerCase(),
    hop,
    muc: [["lay", "Lấy ở đâu"], ["dung", "Dùng làm gì"]],
    body,
  });
}

/* --------------------------------------------------------------- TÁC GIẢ */

function tacGiaPage() {
  const dan = `        <section class="wbox">
      <p class="lead">
        OniFarm do <b>TRẦN CƯỜNG</b> nghĩ ra và dựng nên — từ ý tưởng, luật chơi, bố cục nông trại,
        cho tới từng vòng phản hồi "chỗ này nhìn kì, sửa đi".
      </p>
    </section>
`;

  const body = `
    <h2 id="story">Story</h2>
    <p>
      Bắt đầu từ một câu hỏi giản dị: <i>một cái nông trại chạy được, mở bằng trình duyệt, không cần cài,
      không cần mạng — thì nó phải như thế nào?</i>
    </p>
    <p>
      Trả lời câu ấy hoá ra không phải chuyện vẽ cho đẹp. Nó là chuyện một cái nút phải nói đúng thứ nó
      sẽ làm; một con bò đói phải nhìn ra là đang đói; một dòng sông phải chảy về đâu đó. Mỗi lần nông
      trại "nhìn kì", đào xuống dưới thì gần như lần nào cũng gặp một chỗ sai trong cách dựng, chứ không
      phải một nét vẽ xấu.
    </p>
    <p>
      Nông trại này lớn lên theo từng đợt như thế: nhìn, chỉ ra chỗ sai, đào tới gốc, sửa, rồi nhìn lại.
    </p>

    <h2 id="nguyen-tac">Ba nguyên tắc</h2>
    <ul class="wlist">
      <li><b>Số trên trang không bao giờ lệch với số trong game.</b> Mọi bảng ở wiki này sinh thẳng từ
        dữ liệu game, nên không có chỗ nào để một con số cũ nằm lại.</li>
      <li><b>Chơi được rồi mới đẹp.</b> Luật chơi chạy được kiểm bằng ${SO_LIEU.soKichBan} kịch bản mô
        phỏng, không cần trình duyệt.</li>
      <li><b>Save nằm trên máy bạn.</b> Không tài khoản, không máy chủ, không quảng cáo.</li>
    </ul>

    <h2 id="lien-he">Chơi thử</h2>
    <p><a class="cta" href="/farm/">Mở nông trại</a></p>
`;
  return page({
    title: "Tác giả — OniFarm Wiki",
    desc: "OniFarm do Trần Cường nghĩ ra và dựng nên: ý tưởng, luật chơi, bố cục nông trại và story.",
    url: "/tac-gia/",
    h1: "Tác giả",
    tag: "Trần Cường",
    muc: [["story", "Story"], ["nguyen-tac", "Ba nguyên tắc"], ["lien-he", "Chơi thử"]],
    dan,
    body,
  });
}

function luatChoiPage() {
  const b = content.balance;
  const nl = b.energyCost ?? {};
  const tenViec = {
    till: "Cày", water: "Tưới", plant: "Gieo", harvest: "Thu hoạch",
    build: "Xây", chop: "Chặt cây", mine: "Đập đá", cure: "Chữa bệnh", pull: "Nhổ bỏ",
  };
  const mua = content.seasonOrder.map((id) => content.seasons[id]?.name ?? id);
  const thoiTiet = Object.values(content.weathers ?? {}).map((w) => w.name).filter(Boolean);

  const body = `
    <section>
      <div class="wrap">
        <h2>Một ngày</h2>
        <p class="lead">Đồng hồ chạy liên tục theo thời gian thật. Một ngày trong game dài khoảng <b>${SO_LIEU.phutMoiNgayThat} phút</b> ngoài đời.</p>
        ${bangLuat([
          ["Thức dậy", `${SO_LIEU.gioDay}`],
          ["Trời tối", `${SO_LIEU.gioToi} — sau giờ này cây ngừng lớn`],
          ["Gục tại chỗ", `${SO_LIEU.gioNgat} — chưa lên giường thì ngất, mất một phần năng lượng`],
          ["Nhịp đồng hồ", `${b.realSecondsPerGameTenMinutes} giây thật = 10 phút trong game`],
          ["Năng lượng", `tối đa ${b.energyMax}; ngủ hồi lại đầy, ngủ muộn thì hồi ít hơn`],
          ["Túi đồ", `${b.inventorySlots} ô, trong đó ${b.hotbarSlots} ô ngoài thanh nhanh`],
          ["Tiền khởi đầu", `${SO_LIEU.tienDau}đ`],
        ])}
        <p class="note">Ngủ <b>trên giường</b> mới sang ngày — cửa nhà chỉ để đi vào. Ngủ trong nhà thì ngoài ruộng vẫn lớn, vẫn khô, vẫn mọc cỏ.</p>
      </div>
    </section>

    <section class="alt">
      <div class="wrap">
        <h2>Vòng lõi</h2>
        <p class="lead">CÀY → GIEO → TƯỚI → chờ cây lớn → THU → BÁN.</p>
        <div class="grid">
          <div class="card"><h3>Cây lớn theo thời gian</h3>
            <p>Ô còn <b>ẩm</b> và trời còn sáng thì cây lớn dần trông thấy trong ngày, không nhảy cóc lúc ngủ. Đi ngủ sớm vẫn được cộng nốt phần ban ngày còn lại — không bị phạt.</p></div>
          <div class="card"><h3>Mỗi nhát tốn năng lượng</h3>
            <p>${Object.entries(nl).map(([k, v]) => `${tenViec[k] ?? k} ${v}`).join(" · ")}. Thao tác khoá tay ${b.actionSeconds}s và chỉ ăn ở giữa nhịp — bấm loạn không nhanh hơn.</p></div>
          <div class="card"><h3>Bỏ bê thì hoang</h3>
            <p>Đất đã cày mà bỏ không <b>${b.tilledIdleDays} đêm</b> thì mọc cỏ và trở lại như cũ. Cỏ dại lan sang ô cỏ trống kề bên, ${Math.round((b.grassSpreadChance ?? 0) * 100)}% mỗi đêm.</p></div>
          <div class="card"><h3>Bệnh lan theo luống</h3>
            <p>Mỗi đêm cây đang lớn có ${Math.round((b.diseaseChance ?? 0) * 100)}% nhiễm bệnh, và <b>gấp ${b.diseaseNeighbourMul} lần</b> nếu nằm cạnh cây bệnh. Cây bệnh không lớn và chỉ thu được ${Math.round((b.sickYieldMul ?? 0) * 100)}% sản lượng.</p></div>
        </div>
      </div>
    </section>

    <section>
      <div class="wrap">
        <h2>Bốn mùa</h2>
        <p class="lead">Mỗi mùa <b>${SO_LIEU.ngayMoiMua} ngày</b>: ${mua.join(" → ")} → rồi quay lại. ${thoiTiet.length ? `Thời tiết rút mỗi ngày một kiểu trong ${thoiTiet.length}: ${thoiTiet.join(", ")}.` : ""}</p>
        ${bangLuat([
          ["Trái mùa", "gieo không được"],
          ["Sang mùa", "cây <b>chưa chín</b> mà trái mùa thì héo"],
          ["Cây đã chín", "không bao giờ mất — vụ đang chờ gặt luôn an toàn"],
          ["Nhà kính", "sàn nhà kính miễn nhiễm mùa, trồng gì cũng được quanh năm"],
        ])}
      </div>
    </section>

    <section class="alt">
      <div class="wrap">
        <h2>Chăn nuôi</h2>
        <p class="lead">${SO_LIEU.soLoai} loài, mỗi loài có khu riêng dựng sẵn — không phải tự đóng rào.</p>
        <div class="grid">
          <div class="card"><h3>Máng là cửa duy nhất</h3>
            <p>Không cho ăn trực tiếp. Đổ vào <b>máng</b> (trên cạn) hoặc <b>rắc xuống hồ</b> (dưới nước). Máng là một bể điểm chung, trần ${b.troughMax} phần: món nào cũng đổ được, món đắt thì no lâu hơn.</p></div>
          <div class="card"><h3>Khu quyết định ăn gì</h3>
            <p>Bò, dê, cừu cùng ăn rơm nên dùng <b>chung một máng</b>. Gà vịt mổ sâu trên cỏ nên khu của chúng cố ý không có máng.</p></div>
          <div class="card"><h3>Cỏ là thức ăn thật</h3>
            <p>Con vật đói tự tìm bụi cỏ gần nhất và <b>ăn mất bụi cỏ đó</b>. Đàn đông sẽ gặm trụi quanh chuồng — phải chừa cỏ hoặc cắt cỏ tích rơm.</p></div>
          <div class="card"><h3>Đói quá thì chết</h3>
            <p>Hết cỏ, hết máng thì đói tiếp, và quá số ngày chịu đói của loài đó thì chết. Thẻ từng con cho biết còn no bao lâu.</p></div>
        </div>
        <p class="note"><a href="/vat-nuoi/">Xem chi tiết từng loài →</a></p>
      </div>
    </section>

    <section>
      <div class="wrap">
        <h2>Người làm thuê</h2>
        ${bangLuat([
          ["Thuê", `${SO_LIEU.thueNguoi}đ một người`],
          ["Lương", `${SO_LIEU.luongNguoi}đ mỗi ${SO_LIEU.ngayTraLuong} ngày`],
          ["Giao việc", "chăm cây <i>hoặc</i> chăn nuôi — trong phạm vi đó họ tự chọn việc"],
          ["Thứ tự ưu tiên", "cố định, không ngẫu nhiên — nên đoán được họ sẽ làm gì"],
          ["Rảnh việc", "đi kiếm gỗ đá trong rừng, không đụng cây cảnh bạn trồng"],
          ["Đầy tay", `mang về kho (${content.workers?.carryMax ?? 0} món)`],
        ])}
      </div>
    </section>

    <section class="alt">
      <div class="wrap">
        <h2>Mua bán</h2>
        <div class="grid">
          <div class="card"><h3>Chợ và Quầy đứng hai đầu</h3>
            <p>Chợ để mua, Quầy thu mua để bán. Không ô nào bấm trúng cả hai.</p></div>
          <div class="card"><h3>Không có gì bị khoá</h3>
            <p>Cửa hàng bán mọi thứ ngay từ đầu — có tiền là mua được. ${SO_LIEU.soNac} nấc tiến trình chỉ đánh dấu chặng đường và phát thưởng, không mở khoá hàng hoá.</p></div>
          <div class="card"><h3>Mua con vật thì có xe chở tới</h3>
            <p>Xe chạy từ cổng vào theo đường nhựa, đậu ở kho rồi thả hàng. Mua cá thì xe đậu ở bờ ao. Không có đường thì xe không tới được.</p></div>
          <div class="card"><h3>Xe thu mua ghé kho</h3>
            <p>Gom sạch nông sản trong kho và trả cao hơn quầy một chút — bán buôn thì lời hơn bán lẻ.</p></div>
        </div>
      </div>
    </section>

    <section>
      <div class="wrap">
        <h2>Ba cách làm việc</h2>
        <p class="lead">Khác nhau ở đúng một điểm: có tự đổi món đang cầm hay không.</p>
        ${bangLuat([
          ["Nút DÙNG", "làm đúng ô đang ngắm. Không đổi món."],
          ["CHUYẾN", "món đang cầm quyết định việc và khu; tự đi khắp khu mà làm, làm gọn từng lô. <b>Không bao giờ</b> đổi món."],
          ["AUTO", "tự đổi món theo bậc ưu tiên THU → CHỮA → GIEO → TƯỚI → CÀY, quanh chỗ đứng."],
        ])}
        <p class="note">AUTO tự tắt khi bạn cầm lái, khi quanh đó hết việc, hoặc khi 4 giây liền không có tiến triển.</p>
      </div>
    </section>

    <section class="alt">
      <div class="wrap">
        <h2>Còn nữa</h2>
        <div class="grid">
          <div class="card"><h3>${SO_LIEU.soCongThuc} công thức chế biến</h3>
            <p>Một nguyên liệu → một món bán lãi hơn: phô mai, cuộn len, cà phê rang, mứt dâu, chả cá…</p></div>
          <div class="card"><h3>Ăn để hồi sức</h3>
            <p>Mọi cây và trứng/sữa đều ăn được — đầu ra thứ hai cho nông sản, và là cách gỡ khi hết năng lượng giữa đồng.</p></div>
          <div class="card"><h3>Chế độ xây dựng</h3>
            <p>Dừng đồng hồ lại, kéo thả để quy hoạch. Vẽ bao nhiêu tính tiền bấy nhiêu, xem trước rồi mới trả.</p></div>
          <div class="card"><h3>Save nằm trên máy bạn</h3>
            <p>Không tài khoản, không máy chủ. Xuất ra file để mang sang máy khác.</p></div>
        </div>
      </div>
    </section>
  `;

  return page({
    title: "Lối chơi — OniFarm Wiki",
    desc: `Toàn bộ luật chơi OniFarm: một ngày dài bao lâu, cây lớn thế nào, ${SO_LIEU.soMua} mùa, bệnh cây, cho vật nuôi ăn, thuê người làm, mua bán. Số liệu lấy thẳng từ bản đang chơi.`,
    url: "/loi-choi/",
    h1: "Lối chơi",
    tag: "Mọi thứ cần biết để chơi. Số liệu lấy thẳng từ bản đang chơi, không gõ tay.",
    body,
  });
}

/* --------------------------------------------------------------------- chạy */

/* Hai trang viết TAY còn lại: vỏ ở đây, CHỮ trong `src/site/noi-dung/*.html`.
   Bốn trang giới thiệu cũ (Tính năng · Hướng dẫn · Cách game vận hành · Cài về
   máy) đã gỡ theo yêu cầu của Cường — chúng nói VỀ game cho người chưa chơi,
   còn wiki thì nói về THỨ TRONG game cho người đang chơi. */
const outs = [
  write("", trangChinhPage()),
  write("loi-choi", luatChoiPage()),
  write("cay-trong", cropsPage()),
  write("vat-nuoi", animalsPage()),
  write("vat-pham", vatPhamPage()),
  write("hanh-dong", actionsPage()),
  write("tac-gia", tacGiaPage()),
  write(
    "privacy",
    page({
      url: "/privacy/",
      h1: "Quyền riêng tư",
      tag: "ngắn thôi",
      title: "Quyền riêng tư — OniFarm Wiki",
      desc: "OniFarm không thu thập gì cả: không tài khoản, không máy chủ, không quảng cáo. Toàn bộ tiến trình nằm trên máy bạn.",
      body: noiDung("privacy"),
    }),
  ),
  /* MỖI MÓN MỘT TRANG — đây là thứ tách một cái wiki khỏi một trang danh sách:
     tra tới đâu cũng có chỗ để dừng lại đọc kỹ. */
  ...moiVatPham().map((v) => write(`vat-pham/${v.slug}`, vatPhamChiTiet(v))),
];

/* ---- soát: trang HÀNH ĐỘNG phải khớp với mã, không phải với trí nhớ -------

   Trang này từng dạy một nút "CHO ĂN — đứng cạnh con vật và bấm" suốt ba đợt
   SAU KHI cho ăn trực tiếp đã bị gỡ khỏi game (Đợt 12 đưa thức ăn về đúng một
   cửa là cái máng). Không ai nói dối: danh sách hành động là chữ viết tay,
   còn `UseKind` là mã — hai thứ không có gì buộc phải khớp nhau.

   Giờ có: đọc `UseKind` thẳng từ `src/game/actions.ts` và đòi mọi việc LÀM
   TRÊN MỘT Ô đều có mặt trên trang. Thêm một hành động vào game mà quên viết
   cho nó một mục thì build đỏ.

   `putdown` cố ý không đòi riêng: nó là mặt kia của `lift` (đang vác thì nút
   đổi thành ĐẶT) và mục NHẤC đã kể cả hai. */
const VIEC_TREN_O = (() => {
  const src = readFileSync(resolve(ROOT, "src/game/actions.ts"), "utf8");
  const khoi = src.slice(src.indexOf("export type UseKind ="));
  const het = khoi.indexOf("null;");
  return [...khoi.slice(0, het).matchAll(/"(\w+)"/g)].map((m) => m[1]);
})();

/** Việc trong mã → nút trên trang. Sửa mã mà quên trang thì build đỏ ở dưới. */
const NUT_CUA_VIEC = {
  till: "CÀY", plant: "GIEO", water: "TƯỚI", harvest: "THU", cure: "CHỮA",
  pull: "NHỔ", chop: "CHẶT", mine: "ĐẬP", build: "XÂY",
  pour: "ĐỔ MÁNG", feedpond: "RẮC HỒ", lift: "NHẤC", putdown: "NHẤC",
  clear: "DỌN CỎ",
};

{
  const coTrenTrang = new Set(HANH_DONG.map((h) => h.nut));
  const thieu = VIEC_TREN_O.filter((v) => !coTrenTrang.has(NUT_CUA_VIEC[v]));
  if (thieu.length) {
    throw new Error(
      `src/game/actions.ts có việc ${thieu.join(", ")} mà trang Hành động không kể tới — ` +
        "thêm mục cho nó trong HANH_DONG, hoặc ánh xạ nó trong NUT_CUA_VIEC",
    );
  }
}

/* Mọi mục trong NAV phải có trang thật — thêm mục mà quên sinh trang thì đây
   là chỗ bắt được, chứ không phải người dùng bấm vào rồi gặp 404. */
for (const [href] of NAV) {
  const d = href.replace(/^\/|\/$/g, "");
  if (!outs.some((o) => o.endsWith(`${d}/index.html`) || (d === "" && o.endsWith("src/index.html")))) {
    throw new Error(`NAV có mục ${href} nhưng không trang nào được sinh ra cho nó`);
  }
}

console.log(
  `✓ site → ${outs.length} trang · ${content.cropOrder.length} cây · ${content.animalOrder.length} loài · ${HANH_DONG.length} hành động · ${SO_LIEU.soKichBan} kịch bản`,
);

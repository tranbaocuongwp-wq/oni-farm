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

const cx = (key, size = 48, alt = "") =>
  `<canvas class="sp" data-sprite="${esc(key)}" data-size="${size}" role="img" aria-label="${esc(alt)}"></canvas>`;

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
};

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

const NAV = [
  ["/tinh-nang/", "Tính năng"],
  ["/luat-choi/", "Luật chơi"],
  ["/thu-vien/", "Thư viện"],
  ["/huong-dan/", "Hướng dẫn"],
  ["/cach-hoat-dong/", "Cách game vận hành"],
  ["/tai-ve/", "Cài về máy"],
];

/**
 * Vỏ trang — MỘT chỗ duy nhất quyết định nav, thẻ meta, chân trang.
 *
 * Các trang viết tay cũng dùng đúng khuôn này (xem `writeStaticNav` bên dưới
 * đồng bộ lại nav cho chúng), nên năm trang không bao giờ lệch nhau một mục.
 */
function page({ title, desc, url, h1, tag, body, sprites = true, wide = false }) {
  const nav = NAV.map(
    ([href, text]) =>
      `<a href="${href}"${href === url ? ' aria-current="page"' : ""}>${text}</a>`,
  ).join("\n        ");
  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#14100c" />
    <meta name="description" content="${esc(desc)}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:type" content="website" />
    <title>${esc(title)}</title>
    <link rel="stylesheet" href="/site/site.css" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="/favicon-32.png" sizes="32x32" />
    <link rel="apple-touch-icon" href="/icon-180.png" />
${sprites ? '    <script type="module" src="/site/sprites.ts"></script>\n' : ""}  </head>
  <body${wide ? ' class="wide"' : ""}>
    <nav>
      <div class="wrap">
        <a class="brand" href="/"><img src="/favicon.svg" alt="" width="22" height="22" />ONI<span>FARM</span></a>
        ${nav}
        <a class="play" href="/farm/">Chơi ngay</a>
      </div>
    </nav>
    <header class="hero">
      <div class="wrap">
        <h1>${h1}</h1>
        <p class="tag">${tag}</p>
      </div>
    </header>
${body}
    <footer>
      <div class="wrap">
        OniFarm · game offline, save nằm trên máy bạn ·
        <a href="/thu-vien/">Thư viện</a> ·
        <a href="/privacy/">Quyền riêng tư</a>
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

function cropsPage() {
  const list = content.cropOrder.map((id) => content.crops[id]).filter(Boolean);
  const theoMua = content.seasonOrder.map((s) => ({
    id: s,
    name: seasonName(s),
    cay: list.filter((c) => c.seasons.includes(s)),
  }));

  const muc = theoMua
    .map((m) => `<a class="jump" href="#mua-${m.id}">${esc(m.name)} <b>${m.cay.length}</b></a>`)
    .join("");

  const sections = theoMua
    .map(
      (m) => `    <section id="mua-${m.id}">
      <div class="wrap">
        <h2>Trồng được vào mùa ${esc(m.name)}</h2>
        <p class="lead">${m.cay.length} loại. Gieo trái mùa thì cây vẫn mọc nhưng chậm hơn hẳn — cửa hàng có ghi rõ mùa của từng gói hạt.</p>
        <div class="ents">
${m.cay.map(cropCard).join("\n")}
        </div>
      </div>
    </section>`,
    )
    .join("\n");

  return page({
    title: "Thư viện cây trồng — OniFarm",
    desc: `Chi tiết ${list.length} loại cây trong OniFarm: trồng mấy ngày, thu được bao nhiêu, bán được bao nhiêu, hợp mùa nào.`,
    url: "/thu-vien/",
    h1: "CÂY TRỒNG",
    tag: `Toàn bộ ${list.length} loại cây, kèm số ngày lớn, sản lượng và tiền lãi. Số lấy thẳng từ game nên không bao giờ lệch.`,
    wide: true,
    body: `    <section class="jump-bar"><div class="wrap"><div class="jumps">${muc}</div></div></section>
${sections}`,
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
    title: "Thư viện vật nuôi — OniFarm",
    desc: "Chi tiết từng con vật trong OniFarm: nuôi bao lâu thì lớn, ăn gì, cho sữa/trứng/lông mấy ngày một lần, bán thịt được bao nhiêu.",
    url: "/thu-vien/",
    h1: "VẬT NUÔI",
    tag: "Con nào ăn gì, mấy ngày cho một lứa, và chuyện gì xảy ra nếu bạn quên cho ăn.",
    wide: true,
    body: `    <section>
      <div class="wrap">
        <h2>Nuôi được</h2>
        <p class="lead">Mua ở cửa hàng, xe sẽ chở tới điểm giao gần quầy bán rồi con vật tự đi vào chuồng. Đứng cạnh con vật là nút hành động đổi thành <span class="btn-pill">CHO ĂN</span> hoặc <span class="btn-pill">THU</span>.</p>
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
        <p class="lead">Ban đêm chúng mò tới ruộng có cây chín và ăn mất một phần. Nuôi một con chó là xong chuyện: chó đi tuần cả ngày lẫn đêm, thấy là đuổi.</p>
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
    meo: "Gieo đúng mùa thì cây lớn nhanh nhất. Gieo trái mùa vẫn mọc, chỉ chậm hơn nhiều.",
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
    nut: "CHO ĂN",
    ten: "Cho vật nuôi ăn",
    can: null,
    y: "Đứng cạnh con vật và bấm. Đói thì nó không lớn, không cho sữa trứng, và nhịn lâu quá thì chết.",
    meo: "Gà và vịt tự kiếm ăn quanh sân, không cần cho ăn tay.",
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
    title: "Nhân vật làm được những gì — OniFarm",
    desc: "Tất cả việc nhân vật trong OniFarm làm được: cày, gieo, tưới, thu, chặt, đập, xây, mua bán, chế tạo, chăn nuôi — kèm mẹo cho từng việc.",
    url: "/thu-vien/",
    h1: "HÀNH ĐỘNG",
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

/* ----------------------------------------------------------------- trang hub */

function hubPage() {
  const nCay = content.cropOrder.length;
  const nVat = content.animalOrder.filter((id) => content.animals[id]?.job !== "pest").length;
  const mau = content.cropOrder.slice(0, 8).map((id) => cx(`crop:${id}`, 34, ""));
  const mauVat = content.animalOrder.slice(0, 6).map((id) => cx(`animal:${id}`, 34, ""));

  return page({
    title: "Thư viện OniFarm — cây trồng, vật nuôi, hành động",
    desc: `Tra cứu ${nCay} loại cây, ${nVat} loài vật và toàn bộ việc nhân vật làm được trong OniFarm.`,
    url: "/thu-vien/",
    h1: "THƯ VIỆN",
    tag: "Mọi thứ trong game, tra được trong vài giây. Số liệu lấy thẳng từ bản đang chơi.",
    body: `    <section>
      <div class="wrap">
        <div class="hub">
          <a class="hub-card" href="/thu-vien/cay-trong/">
            <div class="hub-art">${mau.join("")}</div>
            <h3>Cây trồng <b>${nCay}</b></h3>
            <p>Trồng mấy ngày, thu bao nhiêu, bán được bao nhiêu, hợp mùa nào.</p>
          </a>
          <a class="hub-card" href="/thu-vien/vat-nuoi/">
            <div class="hub-art">${mauVat.join("")}</div>
            <h3>Vật nuôi <b>${nVat}</b></h3>
            <p>Ăn gì, mấy ngày một lứa sữa/trứng/lông, bỏ đói thì sao.</p>
          </a>
          <a class="hub-card" href="/thu-vien/hanh-dong/">
            <div class="hub-art"><span class="btn-pill big">CÀY</span><span class="btn-pill big">THU</span><span class="btn-pill big">NGỦ</span></div>
            <h3>Hành động</h3>
            <p>Từng việc nhân vật làm được, cần cầm gì, và mẹo cho mỗi việc.</p>
          </a>
          <a class="hub-card" href="/cach-hoat-dong/">
            <div class="hub-art">${cx("ui:moon", 30, "Ngày đêm")}${cx("ui:water", 30, "Mưa")}${cx("ui:sun", 30, "Thời tiết")}</div>
            <h3>Cách game vận hành</h3>
            <p>Vì sao cây lớn khi bạn ngủ, thời tiết ảnh hưởng gì, tiền từ đâu ra.</p>
          </a>
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
    `<div class="bang-cuon"><table class="luat"><tbody>` +
    hang.map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`).join("") +
    `</tbody></table></div>`
  );
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
        <p class="note"><a href="/thu-vien/vat-nuoi/">Xem chi tiết từng loài →</a></p>
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
    title: "Luật chơi — OniFarm",
    desc: `Toàn bộ luật chơi OniFarm: một ngày dài bao lâu, cây lớn thế nào, ${SO_LIEU.soMua} mùa, bệnh cây, cho vật nuôi ăn, thuê người làm, mua bán. Số liệu lấy thẳng từ bản đang chơi.`,
    url: "/luat-choi/",
    h1: "LUẬT CHƠI",
    tag: "Mọi thứ cần biết để chơi. Số liệu lấy thẳng từ bản đang chơi, không gõ tay.",
    body,
  });
}

/* --------------------------------------------------------------------- chạy */

/* Sáu trang giới thiệu: vỏ ở đây, CHỮ trong `src/site/noi-dung/*.html`. */
const GIOI_THIEU = [
  { duong: "", ten: "trang-chu", url: "/", h1: 'ONI<span>FARM</span>',
    title: "OniFarm — Nông trại hiện đại pixel, chơi offline trên mọi thiết bị",
    desc: "OniFarm — game nông trại pixel chơi offline: bốn mùa, 61 loại cây, chăn nuôi, người làm thuê, chế độ xây dựng kéo thả. Chơi bằng cảm ứng, chuột hay tay cầm.",
    tag: "Cày đất, gieo hạt, tưới nước, ngủ một đêm rồi ra thu hoạch. Rồi nuôi bò, thuê người làm, kéo một con đường ra kho — và đứng nhìn nông trại tự chạy.",
    wide: true },
  { duong: "tinh-nang", ten: "tinh-nang", url: "/tinh-nang/", h1: "TÍNH NĂNG",
    title: "Tính năng — OniFarm",
    desc: "Những gì đã có trong bản chơi được của OniFarm: chơi trên điện thoại, bốn mùa, chăn nuôi, người làm thuê, chế độ xây dựng, chơi offline.",
    tag: "Những gì đã có trong bản chơi được hiện tại." },
  { duong: "huong-dan", ten: "huong-dan", url: "/huong-dan/", h1: "HƯỚNG DẪN",
    title: "Hướng dẫn chơi — OniFarm",
    desc: "Hướng dẫn chơi OniFarm từ ngày đầu: cày gieo tưới thu, kiếm tiền, nuôi con vật đầu tiên, thuê người làm.",
    tag: "Từ ngày đầu tới lúc nông trại tự chạy." },
  { duong: "cach-hoat-dong", ten: "cach-hoat-dong", url: "/cach-hoat-dong/", h1: "CÁCH GAME VẬN HÀNH",
    title: "Cách game vận hành — OniFarm",
    desc: "Bên trong OniFarm: một cửa duy nhất cho mọi thay đổi, tính tất định, nội dung tách khỏi mã, cập nhật OTA, kiểm thử headless.",
    tag: "Bên trong thì nó chạy thế nào." },
  { duong: "tai-ve", ten: "tai-ve", url: "/tai-ve/", h1: "CÀI VỀ MÁY",
    title: "Cài về máy — OniFarm",
    desc: "Cài OniFarm về màn hình chính như một app: iPhone, Android, máy tính. Chơi offline hoàn toàn, không cần cửa hàng ứng dụng.",
    tag: "Thêm vào màn hình chính, chơi như một app — không qua cửa hàng nào." },
  { duong: "privacy", ten: "privacy", url: "/privacy/", h1: "QUYỀN RIÊNG TƯ",
    title: "Quyền riêng tư — OniFarm",
    desc: "OniFarm không thu thập gì cả: không tài khoản, không máy chủ, không quảng cáo. Toàn bộ tiến trình nằm trên máy bạn.",
    tag: "Ngắn thôi: chúng tôi không thu thập gì cả." },
];

const outs = [
  ...GIOI_THIEU.map((t) =>
    write(t.duong, page({ ...t, body: noiDung(t.ten) })),
  ),
  write("luat-choi", luatChoiPage()),
  write("thu-vien", hubPage()),
  write("thu-vien/cay-trong", cropsPage()),
  write("thu-vien/vat-nuoi", animalsPage()),
  write("thu-vien/hanh-dong", actionsPage()),
];

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

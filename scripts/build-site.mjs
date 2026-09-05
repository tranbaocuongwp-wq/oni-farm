/* ============================================================================
   BUILD-SITE — sinh các trang THƯ VIỆN từ chính content của game.

   Vì sao sinh chứ không viết tay: thư viện có 61 cây, 10 loài vật, 7 công cụ,
   6 công trình. Viết tay nghĩa là 84 khối HTML phải tự tay sửa mỗi lần chỉnh
   một con số cân bằng — và chỉ cần quên một chỗ là trang tài liệu nói sai giá,
   thứ tệ hơn hẳn so với không có trang tài liệu.

   Ở đây trang đọc ĐÚNG file mà game đọc. Chỉnh giá cà rốt trong crops.json thì
   trang cà rốt đổi theo ngay lần build sau, không phải nhớ gì cả.

   Hình thì `src/site/sprites.ts` lo: HTML chỉ đặt sẵn `<canvas data-sprite>`,
   trình duyệt gọi đúng hàm vẽ của game. Nên tắt JS vẫn đọc được TOÀN BỘ số
   liệu — chỉ mất phần minh hoạ.

   Chạy: npm run site:build   (đã gắn vào `npm run build`)
============================================================================ */

import { mkdirSync, writeFileSync } from "node:fs";
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

/* ------------------------------------------------------------------- khung */

const NAV = [
  ["/tinh-nang/", "Tính năng"],
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
    <link rel="apple-touch-icon" href="/icon-192.png" />
${sprites ? '    <script type="module" src="/site/sprites.ts"></script>\n' : ""}  </head>
  <body${wide ? ' class="wide"' : ""}>
    <nav>
      <div class="wrap">
        <a class="brand" href="/">ONI<span>FARM</span></a>
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

/* --------------------------------------------------------------------- chạy */

const outs = [
  write("thu-vien", hubPage()),
  write("thu-vien/cay-trong", cropsPage()),
  write("thu-vien/vat-nuoi", animalsPage()),
  write("thu-vien/hanh-dong", actionsPage()),
];

console.log(
  `✓ thư viện → ${outs.length} trang · ${content.cropOrder.length} cây · ${content.animalOrder.length} loài · ${HANH_DONG.length} hành động`,
);

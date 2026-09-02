/* Service worker — làm bản web chơi được khi mất mạng.

   Chiến lược:
     · HTML  → mạng trước, hỏng thì lấy cache (để cập nhật trang không bị kẹt bản cũ)
     · còn lại → cache trước (asset Vite có hash trong tên nên không sợ cũ)
     · content pack OTA → LUÔN đi mạng, không cache: đó là thứ cần mới nhất,
       và bản đóng kèm đã bảo chứng offline rồi.

   Không precache danh sách file cứng: tên file Vite có hash, danh sách cứng sẽ
   lệch sau mỗi lần build. Cache dần theo lúc dùng đơn giản và không bao giờ sai. */

const CACHE = "oni-farm-v1";
const SHELL = ["/", "/farm/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // content pack luôn lấy bản mới nhất từ mạng
  if (url.pathname.startsWith("/content/")) return;

  const isHtml = req.mode === "navigate" || req.headers.get("accept")?.includes("text/html");

  if (isHtml) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          void caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r ?? caches.match("/farm/"))),
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});

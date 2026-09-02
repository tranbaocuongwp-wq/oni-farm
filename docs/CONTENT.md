# Thêm & sửa nội dung game

Mọi thứ trong `src/content/` là **dữ liệu thuần** — sửa xong chạy
`npm run content:build` là kiểm tra + biên dịch xong, **không phải sửa code**.

Đây là "làn nhanh" trong kiến trúc: thay đổi ở đây đẩy được qua OTA tới người chơi
mà không cần phát hành lại app.

---

## Thêm một loại cây

Mở `src/content/crops.json`, thêm một object:

```json
{
  "id": "duahau",
  "name": "Dưa hấu",
  "seedName": "Hạt dưa hấu",
  "seedPrice": 90,
  "sellPrice": 300,
  "growthDays": [2, 2, 3],
  "regrowDays": null,
  "yieldMin": 1,
  "yieldMax": 2,
  "art": {
    "stem": "#3f7a2c", "leaf": "#57b342", "leafDark": "#2f6d26",
    "fruit": "#2f8f3f", "fruitDark": "#1f5f2a",
    "height": 6, "leaves": 8, "spread": 7, "fruitCount": 1, "fruitSize": 8
  }
}
```

- `growthDays` = số ngày cho **mỗi lần chuyển giai đoạn**. Số giai đoạn hiển thị =
  `growthDays.length + 1`. Ví dụ trên: 7 ngày, 4 giai đoạn.
- `regrowDays`: `null` = thu một lần rồi mất cây. Số = sau khi thu, cây lùi về giai
  đoạn cần đúng ngần đó ngày để chín lại.
- `art.*` là tham số để `src/art/atlas.ts` **vẽ cây bằng code** — không cần file ảnh.
  `height`/`spread` tính bằng pixel trong khung 16×24.

Rồi cho nó vào lộ trình chơi ở `progression.json`:

```json
{ "id": "scale", "require": { "money": 3000 }, "unlocks": ["seed:pumpkin", "seed:duahau"] }
```

`npm run content:build` → xong. Cây mới xuất hiện trong cửa hàng, có icon, có sprite
4 giai đoạn, bán được, tính vào thống kê.

---

## Thêm một công trình

`src/content/buildings.json`:

```json
{
  "id": "windmill",
  "name": "Cối xay gió",
  "desc": "Sinh 2 điện mỗi ngày, không cần nắng.",
  "price": 1200,
  "kind": "object",
  "solid": true,
  "effects": { "income": 20 },
  "power": { "produce": 2, "consume": 0 },
  "art": { "body": "#e2e8f0", "dark": "#64748b", "accent": "#38bdf8" }
}
```

**Core chỉ hiểu bốn hiệu ứng** (`effects`):

| Hiệu ứng | Nghĩa |
|---|---|
| `waterRadius` | Mỗi sáng tưới mọi ô trong bán kính (Chebyshev) |
| `autoWet` | Ô đặt công trình này luôn ẩm (sàn nhà kính) |
| `income` | Cộng tiền mỗi sáng |
| `harvestRadius` | Tự thu cây chín trong bán kính; tiêu điện theo `power.consume` |

Đặt hiệu ứng ngoài danh sách này → schema **từ chối** pack, kèm câu báo rõ core biết
những gì. Đó là chủ ý: hiệu ứng mới cần code mới, tức là một bản phát hành core,
không phải một content pack.

`kind: "floor"` thay nền ô và đi lên được; `"object"` là vật thể đứng trên ô.

**Hình:** id lạ mà `atlas.ts` chưa biết vẫn chơi được — nó vẽ một hộp mặc định theo
màu trong `art`. Muốn hình riêng thì thêm một `case` trong `makeBuilding()`
(`src/art/atlas.ts`) — đây là thay đổi core.

---

## Sửa bản đồ

`src/content/maps/farm.ascii` — mỗi ký tự là một ô, mọi hàng phải **dài bằng nhau**.
Chú giải nằm trong `tiles.json`:

| Ký tự | Ô |
|---|---|
| `.` | cỏ (cày được) |
| `,` | cỏ có bụi cỏ trang trí |
| `:` | lối đi |
| `~` | nước (đi không qua) |
| `T` `o` `b` | cây · đá · bụi (đi không qua) |
| `H` | tường nhà · `D` cửa nhà (ngủ) |
| `S` | máy bán hạt (mua) · `B` quầy thu mua (bán) |

Nhà **tự ghép hình** theo hàng xóm, nên đổi hình dạng nhà là hình tự khớp theo,
không phải vẽ lại gì. `tiles.spawn` là ô người chơi xuất hiện.

Thêm loại ô mới = thêm một ký tự vào `legend` (miễn là `prop`/`ground` đó đã có
cách vẽ trong `atlas.ts`).

---

## Đổi cân bằng

`balance.json` giữ toàn bộ con số: tiền khởi đầu, hạt khởi đầu, năng lượng tối đa
và chi phí từng thao tác, khung giờ trong ngày, nhịp thời gian thật↔game, tỉ lệ hồi
năng lượng khi ngủ/ngất, số ô túi đồ và hotbar.

Muốn game nhanh hơn: giảm `realSecondsPerGameTenMinutes`.
Muốn dễ thở hơn: giảm `energyCost`, tăng `startMoney`.

## Đổi chữ hiển thị

`strings.vi.json`. Thêm ngôn ngữ = thêm `strings.<lang>.json` và khai vào
`manifest.json`.

---

## Kiểm tra tự động

`npm run content:build` chạy **đúng bộ schema mà game dùng lúc chạy**, cộng kiểm tham
chiếu chéo. Nó bắt được những lỗi hay gặp nhất khi sửa tay:

- mốc mở khoá trỏ vào cây/công trình không tồn tại
- `startSeeds` trỏ vào hạt không có
- `require` dùng khoá thống kê core không hiểu
- bản đồ có hàng lệch chiều rộng, hoặc dùng ký tự ngoài legend
- có thiết bị **cần điện** nhưng không công trình nào **sinh điện**
- màu không phải hex, số âm, `yieldMax < yieldMin`, `hotbarSlots > inventorySlots`…

Sai là fail ngay lúc build, kèm danh sách đầy đủ mọi lỗi (không dừng ở lỗi đầu tiên).

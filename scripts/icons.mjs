// Araç çubuğu ikonlarını (mercek + konuşma balonu) resim programı olmadan çiziyor.
// node scripts/icons.mjs -> src/icons/{16,32,48,128}.png
import { mkdir, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";

const SS = 4; // kenarlar yumuşak olsun diye her pikseli 4x4 örnekliyoruz

function mix(a, b, t) {
  return a.map((v, i) => v + (b[i] - v) * t);
}

// çapraz renk geçişi, sayfadaki logoyla aynı renkler
function ringColor(x, y) {
  const t = Math.min(1, Math.max(0, (x + y) / 2));
  return t < 0.5 ? mix([91, 140, 255], [176, 107, 255], t * 2) : mix([176, 107, 255], [255, 111, 168], (t - 0.5) * 2);
}

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function distToSegment(x, y, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

// 0..1 karede şekiller, [r, g, b, a] ya da null döner
function sample(x, y) {
  // merceğin içindeki beyaz balon
  if (inRoundRect(x, y, 0.27, 0.33, 0.62, 0.56, 0.06)) return [255, 255, 255, 255];
  // balonun kuyruğu
  if (y > 0.55 && y < 0.66 && x > 0.36 && x < 0.46 && x - 0.36 < (0.66 - y) * 0.9) return [255, 255, 255, 255];
  const d = Math.hypot(x - 0.445, y - 0.445);
  if (d > 0.28 && d < 0.37) return [...ringColor(x, y), 255];
  if (distToSegment(x, y, 0.71, 0.71, 0.87, 0.87) < 0.06) return [...ringColor(x, y), 255];
  // koyu yuvarlak arka plan
  if (Math.hypot(x - 0.5, y - 0.5) < 0.5) return [20, 24, 38, 255];
  return null;
}

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
          if (!c) continue;
          r += c[0]; g += c[1]; b += c[2]; a += c[3];
        }
      }
      const n = SS * SS;
      const covered = a / 255;
      const i = (y * size + x) * 4;
      px[i] = covered ? r / covered : 0;
      px[i + 1] = covered ? g / covered : 0;
      px[i + 2] = covered ? b / covered : 0;
      px[i + 3] = a / n;
    }
  }
  return png(size, px);
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filtre yok
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

await mkdir("src/icons", { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await writeFile(`src/icons/${size}.png`, render(size));
}
console.log("icons written");

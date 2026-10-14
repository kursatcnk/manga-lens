import type { Rect } from "../shared/messages";

// Ekran görüntüsünde içinde koyu yazı olan kapalı beyaz alanları buluyor (resmi ters
// çevirip bir daha bakınca siyah balondaki beyaz yazıları da). Konuşma balonlarında ve
// anlatım kutularında iyi çalışıyor, çizimin üstüne yazılmış yazıları bulamıyor.

export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA
}

export interface Detected {
  bubble: Rect;
  text: Rect;
  // orijinal yazının her satırı, üstü bunlara göre kapatılıyor
  lines: Rect[];
  round: boolean;
  bg: string;
  dark: boolean;
  // balonun içi satır satır ölçülmüş hali: y'den başlayıp her piksel satırı için [sol, sağ]
  shape?: { y: number; rows: [number, number][] };
}

export function findBubbles(img: Pixels): Detected[] {
  const light = detectRegions(img, false);
  // beyaz balonla çakışan siyah alan balonun etrafındaki çizimdir, onu atla
  const dark = detectRegions(img, true).filter((d) => !light.some((l) => overlaps(l.bubble, d.bubble)));
  return dropOuter([...light, ...dark]);
}

const WHITE = 220;
const INK = 130;
const MIN_SIDE = 12;
// iki mürekkep parçası bu kadar yakınsa aynı yazı bloğu sayılıyor
const GAP_X = 10;
const GAP_Y = 12;

export function detectRegions(img: Pixels, dark = false): Detected[] {
  const W = img.width;
  const H = img.height;
  const data = img.data;
  const n = W * H;

  // her pikselin parlaklığı (siyah balon için ters çevrilmiş hali)
  const lum = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const l = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
    lum[i] = dark ? 255 - l : l;
  }

  const label = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n);
  const found: Detected[] = [];

  for (let seed = 0; seed < n; seed++) {
    if (lum[seed] < WHITE || label[seed] !== -1) continue;

    // seed'den başlayıp birbirine değen bütün beyaz pikselleri topluyoruz (flood fill)
    let sp = 0;
    let count = 0;
    let edge = false;
    let minX = W, minY = H, maxX = -1, maxY = -1;
    let r = 0, g = 0, b = 0;

    label[seed] = seed;
    stack[sp++] = seed;
    while (sp > 0) {
      const p = stack[--sp];
      const x = p % W;
      const y = (p - x) / W;
      count++;
      r += data[p * 4];
      g += data[p * 4 + 1];
      b += data[p * 4 + 2];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge = true;

      if (x > 0 && label[p - 1] === -1 && lum[p - 1] >= WHITE) { label[p - 1] = seed; stack[sp++] = p - 1; }
      if (x < W - 1 && label[p + 1] === -1 && lum[p + 1] >= WHITE) { label[p + 1] = seed; stack[sp++] = p + 1; }
      if (y > 0 && label[p - W] === -1 && lum[p - W] >= WHITE) { label[p - W] = seed; stack[sp++] = p - W; }
      if (y < H - 1 && label[p + W] === -1 && lum[p + W] >= WHITE) { label[p + W] = seed; stack[sp++] = p + W; }
    }

    // ekranın kenarına değiyorsa ya sayfanın arka planı ya da yarım kalmış balon
    if (edge) continue;
    const box = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    if (box.w < MIN_SIDE || box.h < MIN_SIDE) continue;
    if (box.w * box.h > n * 0.2) continue;
    if (count / (box.w * box.h) < 0.4) continue;

    const res = findText(lum, label, W, seed, box, count);
    if (!res) continue;

    // siyah alan mangada her yerde var (saç, yıldızlı gökyüzü...), o yüzden siyah
    // balonda yazının çok daha net olması lazım: az blok ve dolu harfler
    if (dark && (res.blocks.length > 2 || res.blocks.some((t) => t.pieces < 4 || t.density < 0.08))) continue;

    const bg = hex(r / count, g / count, b / count);
    if (res.blocks.length === 1) {
      // elips kutusunun ~%78'ini doldurur, dikdörtgen kutu neredeyse hepsini
      const t = res.blocks[0];
      found.push({ bubble: box, text: rectOf(t), lines: t.lines, round: res.fill < 0.9, bg, dark, shape: res.shape ?? undefined });
    } else {
      // birbirine değen iki anlatım kutusu tek beyaz alan çıkıyor, yazıya göre ayır
      for (const t of res.blocks) {
        found.push({ bubble: clampTo(pad(rectOf(t), 6), box), text: rectOf(t), lines: t.lines, round: false, bg, dark });
      }
    }
  }

  return dropOuter(found);
}

// Beyaz alanın içinde kalanlara bakıyor. Yazı bir sürü küçük koyu parça olarak
// görünüyor, beyaz panelin içindeki bir çizim ise tek büyük parça.
function findText(lum: Uint8Array, label: Int32Array, W: number, id: number, box: Rect, area: number) {
  const bx = box.x;
  const by = box.y;
  const w = box.w;
  const h = box.h;
  const size = w * h;

  // 0 = beyaz alanın kendisi, 1 = dışarısı, 2 = içeride kalan, 3 = içeride ve bakıldı
  const kind = new Uint8Array(size).fill(2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (label[(by + y) * W + bx + x] === id) kind[y * w + x] = 0;
    }
  }

  // kutunun kenarından ulaşılabilen her şey dışarısı
  const stack = new Int32Array(size);
  let sp = 0;
  const outside = (i: number) => {
    if (kind[i] === 2) { kind[i] = 1; stack[sp++] = i; }
  };
  for (let x = 0; x < w; x++) { outside(x); outside((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { outside(y * w); outside(y * w + w - 1); }
  while (sp > 0) {
    const i = stack[--sp];
    const x = i % w;
    if (x > 0) outside(i - 1);
    if (x < w - 1) outside(i + 1);
    if (i >= w) outside(i - w);
    if (i + w < size) outside(i + w);
  }

  let ink = 0;
  let holes = 0;
  let largest = 0;
  const pieces: (Rect & { ink: number })[] = [];

  const enclosed = (i: number) => {
    if (kind[i] === 2) { kind[i] = 3; stack[sp++] = i; }
  };
  for (let s = 0; s < size; s++) {
    if (kind[s] !== 2) continue;
    let part = 0;
    let partInk = 0;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    enclosed(s);
    while (sp > 0) {
      const i = stack[--sp];
      const x = i % w;
      const y = (i - x) / w;
      part++;
      if (lum[(by + y) * W + bx + x] < INK) {
        partInk++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      if (x > 0) enclosed(i - 1);
      if (x < w - 1) enclosed(i + 1);
      if (i >= w) enclosed(i - w);
      if (i + w < size) enclosed(i + w);
    }
    holes += part;
    ink += partInk;
    if (part > largest) largest = part;
    if (partInk > 0) pieces.push({ x: bx + x0, y: by + y0, w: x1 - x0 + 1, h: y1 - y0 + 1, ink: partInk });
  }

  const inside = area + holes;
  if (ink < 10) return null;
  if (ink / inside < 0.01 || ink / inside > 0.4) return null;
  if (largest > inside * 0.35) return null;

  const blocks = mergePieces(pieces, GAP_X, GAP_Y).filter((b) => b.ink >= 8 && b.w > 3 && b.h > 3);

  const result = [];
  for (const b of blocks) {
    const block = { x: b.x, y: b.y, w: b.w, h: b.h };
    const mine = pieces.filter((p) => contains(block, p));

    // göz: beyazın içinde mürekkebin çoğunu tutan yuvarlak, içi dolu bir leke (göz bebeği).
    // küçük yazıda harfler birleşip kelime kadar parça olabiliyor ama o parça yatay ve
    // seyrek oluyor, sadece "büyük parça" demek yetmedi, şekline de bakıyoruz
    let big = mine[0];
    for (const p of mine) if (p.ink > big.ink) big = p;
    const ratio = big.w / big.h;
    const solid = big.ink / (big.w * big.h);
    const blob = big.ink > b.ink * 0.5 && ratio > 0.6 && ratio < 1.6 && solid > 0.55;
    if (mine.length < 2 || blob) continue;

    // aynı satırdaki harfler bir satır oluyor, satırların üst üste binmesi lazım
    const lines = mergePieces(mine, GAP_X * 2, -1).map(rectOf);
    result.push({ ...block, lines, pieces: mine.length, density: b.ink / (b.w * b.h) });
  }
  if (!result.length) return null;

  // tek yazı bloğu varsa balonun içini ölç, yazı elips varsaymadan gerçek şekle dizilsin
  let shape = null;
  if (result.length === 1) shape = measureInside(kind, w, h, bx, by, result[0]);

  return { blocks: result, fill: inside / size, shape };
}

// Yazının ortasından başlayıp her piksel satırında balonun içi soldan sağa nereye
// kadar gidiyor ona bakıyor. Kuyruk ya da çizgisi açık balon beyaz alanı başka yere
// taşıyabiliyor; genişlik birden daralınca (boğaz) orada duruyoruz.
function measureInside(kind: Uint8Array, w: number, h: number, bx: number, by: number, text: Rect) {
  const cx = Math.round(text.x + text.w / 2 - bx);
  const cy = Math.round(text.y + text.h / 2 - by);
  if (cx < 0 || cx >= w || cy < 0 || cy >= h) return null;

  // 1 = dışarısı, gerisi (beyaz alan ya da içindeki yazı) balonun içi
  const spanAt = (y: number): [number, number] | null => {
    if (kind[y * w + cx] === 1) return null;
    let l = cx;
    let r = cx;
    while (l > 0 && kind[y * w + l - 1] !== 1) l--;
    while (r < w - 1 && kind[y * w + r + 1] !== 1) r++;
    return [l, r];
  };

  const mid = spanAt(cy);
  if (!mid) return null;
  let widest = mid[1] - mid[0];
  const up: [number, number][] = [];
  const down: [number, number][] = [];

  for (let y = cy - 1; y >= 0; y--) {
    const s = spanAt(y);
    if (!s || s[1] - s[0] < widest * 0.35) break;
    widest = Math.max(widest, s[1] - s[0]);
    up.push(s);
  }
  for (let y = cy + 1; y < h; y++) {
    const s = spanAt(y);
    if (!s || s[1] - s[0] < widest * 0.35) break;
    widest = Math.max(widest, s[1] - s[0]);
    down.push(s);
  }

  const rows = [...up.reverse(), mid, ...down].map((s): [number, number] => [bx + s[0], bx + s[1] + 1]);
  return { y: by + cy - up.length, rows };
}

function mergePieces(pieces: (Rect & { ink: number })[], gapX: number, gapY: number) {
  const list = pieces.slice();
  let merged = true;
  // yakın olan iki parçayı birleştir, birleşecek bir şey kalmayana kadar devam
  while (merged) {
    merged = false;
    for (let i = 0; i < list.length && !merged; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const dx = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w);
        const dy = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h);
        if (dx <= gapX && dy <= gapY) {
          const x = Math.min(a.x, b.x);
          const y = Math.min(a.y, b.y);
          list[i] = {
            x: x,
            y: y,
            w: Math.max(a.x + a.w, b.x + b.w) - x,
            h: Math.max(a.y + a.h, b.y + b.h) - y,
            ink: a.ink + b.ink,
          };
          list.splice(j, 1);
          merged = true;
          break;
        }
      }
    }
  }
  return list;
}

// içinde balon olan beyaz panel de testi geçiyor, sadece balonu tut
function dropOuter(found: Detected[]): Detected[] {
  return found.filter((a) => !found.some((b) => b !== a && contains(a.bubble, b.bubble)));
}

function rectOf(r: Rect): Rect {
  return { x: r.x, y: r.y, w: r.w, h: r.h };
}

function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

function overlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function pad(r: Rect, p: number): Rect {
  return { x: r.x - p, y: r.y - p, w: r.w + p * 2, h: r.h + p * 2 };
}

function clampTo(r: Rect, outer: Rect): Rect {
  const x = Math.max(r.x, outer.x);
  const y = Math.max(r.y, outer.y);
  return {
    x: x,
    y: y,
    w: Math.min(r.x + r.w, outer.x + outer.w) - x,
    h: Math.min(r.y + r.h, outer.y + outer.h) - y,
  };
}

function hex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

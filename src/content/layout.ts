import { splits } from "./hyphen";

export type Measure = (text: string, size: number) => number;

// Yazının dizileceği alan. span(y0, y1): o yükseklik aralığında kullanılabilecek
// en dar yatay aralık [sol, sağ]. Elips, dikdörtgen ya da balonun ölçülmüş gerçek şekli.
export interface Shape {
  w: number;
  h: number;
  span(y0: number, y1: number): [number, number];
}

export interface Line {
  text: string;
  center: number; // satırın ortası, alanın solundan piksel
}

export interface Fit {
  size: number;
  lineHeight: number;
  top: number; // ilk satırın üstü, alanın üstünden piksel
  lines: Line[];
}

const LINE = 1.12; // satır yüksekliği çarpanı
const MIN_SIZE = 7;

export function rectShape(w: number, h: number): Shape {
  return { w, h, span: () => [w * 0.04, w * 0.96] };
}

export function ellipseShape(w: number, h: number): Shape {
  const at = (y: number) => {
    const d = (y - h / 2) / (h / 2);
    return (w / 2) * Math.sqrt(Math.max(0, 1 - d * d));
  };
  return {
    w,
    h,
    span(y0, y1) {
      // satırın üst ve alt kenarından dar olanı geçerli, biraz da kenardan pay
      const half = Math.min(at(y0), at(y1)) * 0.9;
      return [w / 2 - half, w / 2 + half];
    },
  };
}

// balonun ölçülmüş şekli: her satır için [sol, sağ], satırlar alanın yüksekliğine eşit dağılmış
export function maskShape(rows: [number, number][], w: number, h: number): Shape {
  return {
    w,
    h,
    span(y0, y1) {
      const a = Math.max(0, Math.floor((y0 / h) * rows.length));
      const b = Math.min(rows.length - 1, Math.ceil((y1 / h) * rows.length) - 1);
      let l = 0;
      let r = w;
      for (let i = a; i <= b; i++) {
        if (rows[i][0] > l) l = rows[i][0];
        if (rows[i][1] < r) r = rows[i][1];
      }
      // çizgiye yapışmasın
      const pad = Math.max(2, (r - l) * 0.06);
      return [l + pad, r - pad];
    },
  };
}

// Yazının balona sığdığı en büyük font boyutunu buluyor.
// Her satır o yükseklikte balonun gerçekten ne kadar geniş olduğuna göre diziliyor.
export function fitText(text: string, shape: Shape, measure: Measure, hyphenate = true): Fit | null {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length || shape.w < 10 || shape.h < 10) return null;

  // çevirmenler tireyi pek sevmiyor: uzun kelimeyi sadece font belirgin büyüyorsa böl,
  // kısa kelimeyi de ancak başka türlü hiç sığmıyorsa
  const plain = search(words, shape, measure, "none");
  const split = hyphenate ? search(words, shape, measure, "long") : null;
  if (plain && split) return split.size >= plain.size * 1.2 ? split : plain;
  return plain ?? split ?? search(words, shape, measure, "any");
}

type Split = "none" | "long" | "any";

function search(words: string[], shape: Shape, measure: Measure, hyphenate: Split): Fit | null {
  const max = Math.min(26, shape.h / 1.6);
  for (let size = Math.floor(max * 2) / 2; size >= MIN_SIZE; size -= 0.5) {
    const lh = size * LINE;
    const most = Math.floor(shape.h / lh);
    for (let n = 1; n <= most; n++) {
      const slots = lineSlots(n, lh, shape);
      if (slots.some((s) => s.width < size * 1.5)) continue;
      const lines = breakLines(words, slots.map((s) => s.width), (s) => measure(s, size), hyphenate);
      // daha az satır olursa farklı ortalanır, hesapladığımız genişlikler tutmaz
      if (lines && lines.length === n) {
        return {
          size,
          lineHeight: lh,
          top: (shape.h - n * lh) / 2,
          lines: lines.map((t, i) => ({ text: t, center: slots[i].center })),
        };
      }
    }
  }
  return null;
}

// n satır dikeyde ortalanınca her satıra kalan genişlik ve satırın ortası
export function lineSlots(n: number, lh: number, shape: Shape) {
  const top = (shape.h - n * lh) / 2;
  const out: { width: number; center: number }[] = [];
  for (let i = 0; i < n; i++) {
    const [l, r] = shape.span(top + i * lh, top + (i + 1) * lh);
    out.push({ width: Math.max(0, r - l), center: (l + r) / 2 });
  }
  return out;
}

function breakLines(words: string[], widths: number[], width: (s: string) => number, hyphenate: Split): string[] | null {
  const queue = words.slice();
  const lines: string[] = [];

  for (const max of widths) {
    if (!queue.length) break;
    let line = "";
    while (queue.length) {
      const next = line ? line + " " + queue[0] : queue[0];
      if (width(next) <= max) {
        line = next;
        queue.shift();
        continue;
      }
      // kelime bütün sığmıyor: satırı epey dolduruyorsa hecesinden böl
      const room = max - (line ? width(line + " ") : 0);
      const long = queue[0].replace(/[^\p{L}]/gu, "").length >= 7;
      if (hyphenate === "any" || (hyphenate === "long" && long)) {
        for (const [head, tail] of splits(queue[0])) {
          if (width(head) <= room && (!line || width(head) > max * 0.3)) {
            line = line ? line + " " + head : head;
            queue[0] = tail;
            break;
          }
        }
      }
      break;
    }
    if (!line) return null; // bölünse bile sığmayan kelime
    lines.push(line);
  }
  return queue.length ? null : lines;
}

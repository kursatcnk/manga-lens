import { splits } from "./hyphen";

export type Measure = (text: string, size: number) => number;

export interface Fit {
  size: number;
  lineHeight: number;
  lines: string[];
}

const LINE = 1.12; // satır yüksekliği çarpanı
const MIN_SIZE = 7;

// Yazının balona sığdığı en büyük font boyutunu buluyor.
// Yuvarlak balonda üst ve alt satırlar kısa, gerçek çevirilerdeki gibi.
export function fitText(text: string, w: number, h: number, round: boolean, measure: Measure, hyphenate = true): Fit | null {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length || w < 10 || h < 10) return null;

  // çevirmenler tireyi pek sevmiyor: uzun kelimeyi sadece font belirgin büyüyorsa böl,
  // kısa kelimeyi de ancak başka türlü hiç sığmıyorsa
  const plain = search(words, w, h, round, measure, "none");
  const split = hyphenate ? search(words, w, h, round, measure, "long") : null;
  if (plain && split) return split.size >= plain.size * 1.2 ? split : plain;
  return plain ?? split ?? search(words, w, h, round, measure, "any");
}

type Split = "none" | "long" | "any";

function search(words: string[], w: number, h: number, round: boolean, measure: Measure, hyphenate: Split): Fit | null {
  const max = Math.min(26, h / 1.6);
  for (let size = Math.floor(max * 2) / 2; size >= MIN_SIZE; size -= 0.5) {
    const lh = size * LINE;
    const most = Math.floor(h / lh);
    for (let n = 1; n <= most; n++) {
      const widths = lineWidths(n, lh, w, h, round);
      if (widths.some((x) => x < size * 1.5)) continue;
      const lines = breakLines(words, widths, (s) => measure(s, size), hyphenate);
      // daha az satır olursa farklı ortalanır, hesapladığımız genişlikler tutmaz
      if (lines && lines.length === n) return { size, lineHeight: lh, lines };
    }
  }
  return null;
}

// n satır dikeyde ortalanınca her satıra kalan genişlik
export function lineWidths(n: number, lh: number, w: number, h: number, round: boolean) {
  const top = (h - n * lh) / 2;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!round) {
      out.push(w * 0.92);
      continue;
    }
    // satırın üst ve alt kenarında elipsin genişliği, darı geçerli
    const at = (y: number) => {
      const d = (y - h / 2) / (h / 2);
      return w * Math.sqrt(Math.max(0, 1 - d * d));
    };
    out.push(Math.min(at(top + i * lh), at(top + (i + 1) * lh)) * 0.9);
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

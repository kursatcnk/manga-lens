import type { Rect } from "../shared/messages";

// Finds closed white areas with dark text inside them. Works well for white speech
// bubbles and caption boxes. Text drawn straight on the art is not found (yet).

export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA
}

export interface Detected {
  bubble: Rect;
  text: Rect;
  // each line of the original text, what actually gets painted over
  lines: Rect[];
  round: boolean;
  bg: string;
}

const WHITE = 220;
const INK = 130;
const MIN_SIDE = 12;
// how far apart two pieces of ink can be and still be the same text block
const GAP_X = 10;
const GAP_Y = 12;

export function detectRegions(img: Pixels): Detected[] {
  const { width: W, height: H, data } = img;
  const n = W * H;

  const lum = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    lum[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
  }

  const label = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n);
  const found: Detected[] = [];

  for (let seed = 0; seed < n; seed++) {
    if (lum[seed] < WHITE || label[seed] !== -1) continue;

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

    // cut off by the screen edge, or page background / gutters
    if (edge) continue;
    const box = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    if (box.w < MIN_SIDE || box.h < MIN_SIDE) continue;
    if (box.w * box.h > n * 0.2) continue;
    if (count / (box.w * box.h) < 0.4) continue;

    const res = findText(lum, label, W, seed, box, count);
    if (!res) continue;

    const bg = hex(r / count, g / count, b / count);
    if (res.blocks.length === 1) {
      // an ellipse fills ~78% of its box, a caption rectangle almost all of it
      const { lines, ...text } = res.blocks[0];
      found.push({ bubble: box, text, lines, round: res.fill < 0.9, bg });
    } else {
      // two captions touching each other end up as one white area, split them by text
      for (const { lines, ...text } of res.blocks) {
        found.push({ bubble: clampTo(pad(text, 6), box), text, lines, round: false, bg });
      }
    }
  }

  return dropOuter(found);
}

// Looks at what the white area encloses. Text shows up as many small dark holes,
// a drawing inside a white panel as one big hole.
function findText(lum: Uint8Array, label: Int32Array, W: number, id: number, box: Rect, area: number) {
  const { x: bx, y: by, w, h } = box;
  const size = w * h;

  // 0 = the white area, 1 = outside it, 2 = enclosed, 3 = enclosed and visited
  const kind = new Uint8Array(size).fill(2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (label[(by + y) * W + bx + x] === id) kind[y * w + x] = 0;
    }
  }

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
  if (!blocks.length) return null;

  return {
    blocks: blocks.map(({ x, y, w, h }) => {
      const block = { x, y, w, h };
      // letters on the same row become one line, rows have to overlap to join
      const lines = mergePieces(pieces.filter((p) => contains(block, p)), GAP_X * 2, -1);
      return { ...block, lines: lines.map(({ x, y, w, h }) => ({ x, y, w, h })) };
    }),
    fill: inside / size,
  };
}

function mergePieces(pieces: (Rect & { ink: number })[], gapX: number, gapY: number) {
  const list = pieces.slice();
  let merged = true;
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
            x,
            y,
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

// A white panel that holds a bubble also passes the test, keep only the bubble.
function dropOuter(found: Detected[]): Detected[] {
  return found.filter((a) => !found.some((b) => b !== a && contains(a.bubble, b.bubble)));
}

function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

function pad(r: Rect, p: number): Rect {
  return { x: r.x - p, y: r.y - p, w: r.w + p * 2, h: r.h + p * 2 };
}

function clampTo(r: Rect, outer: Rect): Rect {
  const x = Math.max(r.x, outer.x);
  const y = Math.max(r.y, outer.y);
  return {
    x,
    y,
    w: Math.min(r.x + r.w, outer.x + outer.w) - x,
    h: Math.min(r.y + r.h, outer.y + outer.h) - y,
  };
}

function hex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

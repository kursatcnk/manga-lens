import { describe, expect, it } from "vitest";
import { detectRegions, findBubbles, type Pixels } from "./heuristic";

function canvas(w: number, h: number, gray: number): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data.set([gray, gray, gray, 255], i * 4);
  }
  return { width: w, height: h, data };
}

function paint(img: Pixels, test: (x: number, y: number) => boolean, value: number) {
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (test(x, y)) img.data.set([value, value, value, 255], (y * img.width + x) * 4);
    }
  }
}

const ellipse = (cx: number, cy: number, rx: number, ry: number) => (x: number, y: number) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

// iki satırda birkaç kısa "kelime"
const words = (x0: number, y0: number) => (x: number, y: number) => {
  const dx = x - x0;
  const dy = y - y0;
  const inLine = (dy >= 0 && dy < 4) || (dy >= 8 && dy < 12);
  const inWord = dx >= 0 && dx < 30 && dx % 8 < 6 && dx % 2 === 0;
  return inLine && inWord;
};

describe("detectRegions", () => {
  it("finds text inside a white bubble on a gray page", () => {
    const img = canvas(400, 240, 120);
    paint(img, ellipse(100, 60, 50, 30), 255);
    paint(img, words(85, 54), 0);

    const found = detectRegions(img);

    expect(found).toHaveLength(1);
    const { text, bubble } = found[0];
    expect(text.x).toBeGreaterThanOrEqual(85);
    expect(text.y).toBeGreaterThanOrEqual(54);
    expect(text.x + text.w).toBeLessThanOrEqual(115);
    expect(text.y + text.h).toBeLessThanOrEqual(66);
    expect(bubble.w).toBeGreaterThan(90);
    // iki satır kelime -> kapatılacak iki satır
    expect(found[0].lines).toHaveLength(2);
  });

  it("ignores an empty bubble", () => {
    const img = canvas(400, 240, 120);
    paint(img, ellipse(100, 60, 50, 30), 255);

    expect(detectRegions(img)).toHaveLength(0);
  });

  it("ignores white that touches the screen edge", () => {
    const img = canvas(200, 120, 120);
    paint(img, (x) => x < 60, 255);
    paint(img, words(10, 50), 0);

    expect(detectRegions(img)).toHaveLength(0);
  });

  it("ignores a drawing that fills a white panel", () => {
    const img = canvas(200, 120, 120);
    paint(img, (x, y) => x > 20 && x < 180 && y > 10 && y < 110, 255);
    paint(img, ellipse(100, 60, 50, 35), 40);

    expect(detectRegions(img)).toHaveLength(0);
  });

  it("splits two captions that touch into two regions", () => {
    const img = canvas(400, 300, 120);
    paint(img, (x, y) => x > 200 && x < 260 && y > 20 && y < 90, 255);
    paint(img, (x, y) => x > 150 && x < 230 && y > 85 && y < 200, 255);
    paint(img, words(212, 40), 0);
    paint(img, words(160, 140), 0);

    const found = detectRegions(img);

    expect(found).toHaveLength(2);
    expect(found.every((f) => !f.round)).toBe(true);
  });

  it("tells round bubbles from captions", () => {
    const img = canvas(400, 240, 120);
    paint(img, ellipse(100, 60, 50, 30), 255);
    paint(img, words(85, 54), 0);
    paint(img, (x, y) => x > 220 && x < 320 && y > 100 && y < 160, 250);
    paint(img, words(250, 124), 0);

    const found = detectRegions(img).sort((a, b) => a.bubble.x - b.bubble.x);

    expect(found.map((f) => f.round)).toEqual([true, false]);
    expect(found[1].bg).toBe("#fafafa");
  });

  it("finds white text on a black bubble", () => {
    const img = canvas(400, 240, 120);
    paint(img, ellipse(100, 60, 50, 30), 15);
    paint(img, words(85, 54), 250);

    const found = findBubbles(img);

    expect(found).toHaveLength(1);
    expect(found[0].dark).toBe(true);
    expect(found[0].bg).toBe("#0f0f0f");
  });

  it("doesn't take stars in a dark sky for text", () => {
    const img = canvas(400, 240, 120);
    paint(img, (x, y) => x > 40 && x < 220 && y > 30 && y < 200, 10);
    // dağınık birkaç nokta
    paint(img, (x, y) => (x % 37 === 0 && y % 29 === 0) || (x % 53 === 1 && y % 41 === 3), 255);

    expect(findBubbles(img)).toHaveLength(0);
  });

  it("finds both kinds on the same page", () => {
    const img = canvas(400, 240, 120);
    paint(img, ellipse(100, 60, 50, 30), 255);
    paint(img, words(85, 54), 0);
    paint(img, ellipse(290, 150, 50, 30), 15);
    paint(img, words(275, 144), 250);

    const found = findBubbles(img).sort((a, b) => a.bubble.x - b.bubble.x);

    expect(found.map((f) => f.dark)).toEqual([false, true]);
  });

  it("doesn't take an eye for a bubble", () => {
    // gözün beyazı, ortada büyük göz bebeği ve küçük bir parlama
    const img = canvas(400, 240, 120);
    paint(img, ellipse(100, 60, 30, 18), 255);
    paint(img, ellipse(100, 62, 11, 12), 20);
    paint(img, ellipse(96, 57, 2, 2), 255);

    expect(findBubbles(img)).toHaveLength(0);
  });

  it("still finds a bubble next to an eye", () => {
    const img = canvas(400, 240, 120);
    paint(img, ellipse(100, 60, 30, 18), 255);
    paint(img, ellipse(100, 62, 11, 12), 20);
    paint(img, ellipse(280, 120, 50, 30), 255);
    paint(img, words(265, 114), 0);

    const found = findBubbles(img);

    expect(found).toHaveLength(1);
    expect(found[0].bubble.x).toBeGreaterThan(200);
  });

  it("keeps the bubble, not the white panel around it", () => {
    const img = canvas(300, 200, 120);
    paint(img, (x, y) => x > 10 && x < 290 && y > 10 && y < 190, 255);
    paint(img, ellipse(150, 100, 52, 32), 0);
    paint(img, ellipse(150, 100, 50, 30), 255);
    paint(img, words(135, 94), 0);

    const found = detectRegions(img);

    expect(found).toHaveLength(1);
    expect(found[0].bubble.w).toBeLessThan(110);
  });
});

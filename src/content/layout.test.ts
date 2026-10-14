import { describe, expect, it } from "vitest";
import { ellipseShape, fitText, lineSlots, maskShape, rectShape, type Shape } from "./layout";

// her karakter 0.6em genişlikte, çizgi roman fontuna yeterince yakın
const measure = (s: string, size: number) => s.length * size * 0.6;

// her satır kendi aralığının içinde mi
function insideShape(text: string, shape: Shape) {
  const fit = fitText(text, shape, measure)!;
  expect(fit).not.toBeNull();
  fit.lines.forEach((line, i) => {
    const y0 = fit.top + i * fit.lineHeight;
    const [l, r] = shape.span(y0, y0 + fit.lineHeight);
    const half = measure(line.text, fit.size) / 2;
    expect(line.center - half).toBeGreaterThanOrEqual(l - 0.01);
    expect(line.center + half).toBeLessThanOrEqual(r + 0.01);
  });
  expect(fit.top).toBeGreaterThanOrEqual(0);
  expect(fit.top + fit.lines.length * fit.lineHeight).toBeLessThanOrEqual(shape.h);
  return fit;
}

describe("fitText", () => {
  const long = "DÜN GECE ŞEHRİN ÜSTÜNDE GARİP BİR IŞIK GÖRDÜM AMA KİMSE BANA İNANMADI.";

  it("never makes a line wider than its slot", () => {
    insideShape(long, rectShape(120, 260));
    insideShape(long, ellipseShape(180, 120));
    insideShape(long, ellipseShape(90, 90));
  });

  it("keeps every word, splitting only at syllables", () => {
    const text = "HOŞGELDİN ARKADAŞIM!";
    const fit = fitText(text, ellipseShape(50, 70), measure)!;
    const joined = fit.lines.map((l) => l.text).join(" ").replace(/- /g, "");
    expect(joined).toBe(text);
  });

  it("doesn't split short words just to get a bigger font", () => {
    const fit = fitText("BEKLE BİR DAKİKA!", ellipseShape(60, 110), measure)!;
    expect(fit.lines.map((l) => l.text).join(" ")).not.toContain("-");
  });

  it("uses a big font for a short line in a big bubble", () => {
    const fit = fitText("EVET!", ellipseShape(200, 100), measure)!;
    expect(fit.lines.map((l) => l.text)).toEqual(["EVET!"]);
    expect(fit.size).toBeGreaterThan(20);
  });

  it("gives up when nothing fits", () => {
    expect(fitText("ÇOK UZUN BİR CÜMLE ".repeat(30), ellipseShape(30, 20), measure)).toBeNull();
  });

  it("makes round bubbles narrower at the top", () => {
    const slots = lineSlots(5, 20, ellipseShape(200, 120));
    expect(slots[0].width).toBeLessThan(slots[2].width);
    expect(slots[4].width).toBeLessThan(slots[2].width);
  });

  it("follows a measured shape that isn't centered", () => {
    // sağa yaslı, aşağı doğru genişleyen bir balon
    const rows: [number, number][] = [];
    for (let i = 0; i < 40; i++) rows.push([60 - i, 160]);
    const shape = maskShape(rows, 160, 120);
    const fit = insideShape("ÇATIDAN GELDİ, HADİ GİDİP BAKALIM!", shape);
    // satır ortaları alanın ortasında değil, balonun kendi ortasında
    expect(fit.lines[0].center).toBeGreaterThan(80);
  });
});

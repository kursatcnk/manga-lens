import { describe, expect, it } from "vitest";
import { fitText, lineWidths } from "./layout";

// every character is 0.6em wide, close enough to a comic font
const measure = (s: string, size: number) => s.length * size * 0.6;

describe("fitText", () => {
  it("never makes a line wider than its slot", () => {
    const text = "DÜN GECE ŞEHRİN ÜSTÜNDE GARİP BİR IŞIK GÖRDÜM AMA KİMSE BANA İNANMADI.";
    for (const [w, h, round] of [[120, 260, false], [180, 120, true], [90, 90, true]] as const) {
      const fit = fitText(text, w, h, round, measure)!;
      expect(fit).not.toBeNull();
      const widths = lineWidths(fit.lines.length, fit.lineHeight, w, h, round);
      fit.lines.forEach((line, i) => expect(measure(line, fit.size)).toBeLessThanOrEqual(widths[i]));
      expect(fit.lines.length * fit.lineHeight).toBeLessThanOrEqual(h);
    }
  });

  it("keeps every word, splitting only at syllables", () => {
    const text = "HOŞGELDİN ARKADAŞIM!";
    const fit = fitText(text, 50, 70, true, measure)!;
    const joined = fit.lines.join(" ").replace(/- /g, "");
    expect(joined).toBe(text);
  });

  it("doesn't split short words just to get a bigger font", () => {
    const fit = fitText("BEKLE BİR DAKİKA!", 60, 110, true, measure)!;
    expect(fit.lines.join(" ")).not.toContain("-");
  });

  it("uses a big font for a short line in a big bubble", () => {
    const fit = fitText("EVET!", 200, 100, true, measure)!;
    expect(fit.lines).toEqual(["EVET!"]);
    expect(fit.size).toBeGreaterThan(20);
  });

  it("gives up when nothing fits", () => {
    expect(fitText("ÇOK UZUN BİR CÜMLE ".repeat(30), 30, 20, true, measure)).toBeNull();
  });

  it("makes round bubbles narrower at the top", () => {
    const widths = lineWidths(5, 20, 200, 120, true);
    expect(widths[0]).toBeLessThan(widths[2]);
    expect(widths[4]).toBeLessThan(widths[2]);
  });
});

import { describe, expect, it } from "vitest";
import { splits, syllables } from "./hyphen";

describe("syllables", () => {
  it.each([
    ["HOŞGELDİN", ["HOŞ", "GEL", "DİN"]],
    ["GÖZLERİNİ", ["GÖZ", "LE", "Rİ", "Nİ"]],
    ["TÜRKÇE", ["TÜRK", "ÇE"]],
    ["SAAT", ["SA", "AT"]],
    ["İSTANBUL", ["İS", "TAN", "BUL"]],
    ["KRAL", ["KRAL"]],
    ["NİŞANLIM.", ["Nİ", "ŞAN", "LIM."]],
  ])("%s", (word, expected) => {
    expect(syllables(word)).toEqual(expected);
  });
});

describe("splits", () => {
  it("offers the longest head first", () => {
    expect(splits("HOŞGELDİN")).toEqual([
      ["HOŞGEL-", "DİN"],
      ["HOŞ-", "GELDİN"],
    ]);
  });

  it("never leaves a single letter alone", () => {
    expect(splits("ADAM")).toEqual([]);
    expect(splits("AÇIK")).toEqual([]);
  });

  it("breaks an existing hyphen first", () => {
    expect(splits("ARKA-PLAN")).toEqual([["ARKA-", "PLAN"]]);
  });
});

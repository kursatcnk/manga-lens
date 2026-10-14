import { describe, expect, it } from "vitest";
import { addTerms, parseTerms, seriesKey } from "./glossary";

describe("seriesKey", () => {
  it("drops chapter and page parts", () => {
    expect(seriesKey("https://www.example.com/manga/some-title/chapter-12/3")).toBe("example.com/manga/some-title");
    expect(seriesKey("https://example.com/manga/some-title/chapter-13")).toBe("example.com/manga/some-title");
  });

  it("falls back to the host when everything has numbers", () => {
    expect(seriesKey("https://reader.example.com/speedreader/?cid=1030")).toBe("reader.example.com/speedreader");
    expect(seriesKey("https://example.com/12345")).toBe("example.com");
  });
});

describe("parseTerms", () => {
  it("reads 'a = b' lines and skips the rest", () => {
    expect(parseTerms("Akira-san = Akira Abi\nnot a term\n = x\nSensei=Hocam")).toEqual([
      ["Akira-san", "Akira Abi"],
      ["Sensei", "Hocam"],
    ]);
  });
});

describe("addTerms", () => {
  it("appends new names and keeps the user's own", () => {
    const text = "Akira = Akira";
    expect(addTerms(text, [["akira", "Aki"], ["Mei", "Mei"]])).toBe("Akira = Akira\nMei = Mei");
  });

  it("works on an empty glossary", () => {
    expect(addTerms("", [["Mei", "Mei"]])).toBe("Mei = Mei");
  });
});

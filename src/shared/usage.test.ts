import { describe, expect, it } from "vitest";
import { costOf, monthKey } from "./usage";

describe("costOf", () => {
  it("prices input and output per million tokens", () => {
    const u = { requests: 1, bubbles: 3, input: 1_000_000, output: 100_000 };
    expect(costOf("claude-haiku-5-5", u)).toBeCloseTo(0.1 + 0.05);
    expect(costOf("claude-opus-5-5", u)).toBeCloseTo(4 + 2);
  });

  it("returns null for a model it doesn't know", () => {
    expect(costOf("some-other-model", { requests: 1, bubbles: 1, input: 10, output: 10 })).toBeNull();
  });
});

describe("monthKey", () => {
  it("pads the month", () => {
    expect(monthKey(new Date(2026, 2, 5))).toBe("2026-03");
  });
});

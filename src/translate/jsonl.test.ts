import { describe, expect, it } from "vitest";
import { JsonLines } from "./jsonl";

function collect(chunks: string[]) {
  const items: unknown[] = [];
  const p = new JsonLines((v) => items.push(v));
  chunks.forEach((c) => p.push(c));
  p.end();
  return items;
}

describe("JsonLines", () => {
  it("emits objects as lines complete", () => {
    const items: unknown[] = [];
    const p = new JsonLines((v) => items.push(v));
    p.push('{"id":1,"text":"Mer');
    expect(items).toHaveLength(0);
    p.push('haba"}\n{"id":2');
    expect(items).toEqual([{ id: 1, text: "Merhaba" }]);
    p.push(',"text":"Evet"}');
    p.end();
    expect(items).toHaveLength(2);
  });

  it("ignores code fences and array brackets", () => {
    const items = collect(['```json\n[\n{"id":1,"text":"a"},\n{"id":2,"text":"b"}\n]\n```']);
    expect(items).toEqual([{ id: 1, text: "a" }, { id: 2, text: "b" }]);
  });

  it("splits objects glued on one line", () => {
    expect(collect(['{"id":1}{"id":2}'])).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("skips broken lines", () => {
    expect(collect(['{"id":1\n{"id":2}\n'])).toEqual([{ id: 2 }]);
  });
});

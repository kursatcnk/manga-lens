import type { PortMessage, TranslateJob } from "../shared/messages";
import { loadSettings } from "../shared/settings";
import { cacheGet, cacheSet, regionHash } from "./cache";
import { JsonLines } from "./jsonl";
import { buildRequest } from "./prompt";
import { streamTranslation, TranslateError } from "./providers";

export async function translate(shot: ImageBitmap, job: TranslateJob, send: (m: PortMessage) => void, signal: AbortSignal) {
  try {
    const settings = await loadSettings();

    const keys = await Promise.all(job.regions.map(async (r) => `${job.source}>${job.target}:${await regionHash(shot, r.text)}`));
    const cached = await cacheGet(keys);

    const todo: TranslateJob["regions"] = [];
    const keyOf = new Map<number, string>();
    job.regions.forEach((r, i) => {
      keyOf.set(r.id, keys[i]);
      const hit = cached[keys[i]];
      if (hit !== undefined) send({ type: "item", id: r.id, text: hit });
      else todo.push(r);
    });

    if (!todo.length) {
      send({ type: "done", missing: [] });
      return;
    }

    const { image, prompt } = await buildRequest(shot, { ...job, regions: todo });
    const left = new Set(todo.map((r) => r.id));

    let raw = "";
    const parser = new JsonLines((item) => {
      const { id, text } = item as { id?: unknown; text?: unknown };
      // ids in the prompt are 1-based positions in todo
      const region = typeof id === "number" ? todo[id - 1] : undefined;
      if (!region || typeof text !== "string" || !left.has(region.id)) return;
      left.delete(region.id);
      send({ type: "item", id: region.id, text });
      if (text) void cacheSet(keyOf.get(region.id)!, text);
    });

    await streamTranslation(settings, image, prompt, (t) => {
      raw += t;
      parser.push(t);
    }, signal);
    parser.end();

    // nothing came back in the expected format, keep the answer around for debugging
    if (left.size === todo.length) console.warn("[manga-lens] no usable lines in answer:", raw.slice(0, 500));
    send({ type: "done", missing: [...left] });
  } catch (err) {
    if (signal.aborted) return;
    console.error("[manga-lens] translate failed", err);
    if (err instanceof TranslateError) send({ type: "error", code: err.code, message: err.message });
    else send({ type: "error", code: "other", message: err instanceof Error ? err.message : String(err) });
  }
}

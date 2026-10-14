import { addTerms, loadGlossary, saveGlossary } from "../shared/glossary";
import type { PortMessage, TranslateJob } from "../shared/messages";
import { loadSettings, type Settings } from "../shared/settings";
import { addUsage } from "../shared/usage";
import { cacheGet, cacheSet, regionHash } from "./cache";
import { JsonLines } from "./jsonl";
import { buildRequest, type Extras } from "./prompt";
import { modelOf, streamTranslation, TranslateError } from "./providers";

// Every bubble gets its own request, all running side by side. Output length is
// what makes it slow, so the page is done about when the slowest bubble is.
const GROUP = 1;
// but not too many at once, rate limits kick in fast on new API keys
const PARALLEL = 6;
// how many earlier lines go along as context
const RECENT = 8;

type Regions = TranslateJob["regions"];

export async function translate(shot: ImageBitmap, job: TranslateJob, send: (m: PortMessage) => void, signal: AbortSignal) {
  const started = performance.now();
  try {
    const settings = await loadSettings();

    const keys = await Promise.all(job.regions.map(async (r) => `${job.source}>${job.target}:${await regionHash(shot, r.text)}`));
    const cached = job.fresh ? {} : await cacheGet(keys);

    const todo: Regions = [];
    const keyOf = new Map<number, string>();
    job.regions.forEach((r, i) => {
      keyOf.set(r.id, keys[i]);
      const hit = cached[keys[i]];
      if (hit !== undefined) send({ type: "item", id: r.id, text: hit, key: keys[i] });
      else todo.push(r);
    });

    if (!todo.length) {
      send({ type: "done", missing: [] });
      return;
    }

    const glossary = await loadGlossary(job.series);
    const extras: Extras = { terms: glossary.terms, recent: glossary.recent, honorifics: settings.honorifics };

    // already in reading order, so neighbours end up in the same group
    const groups: Regions[] = [];
    for (let i = 0; i < todo.length; i += GROUP) groups.push(todo.slice(i, i + GROUP));

    let first = 0;
    const left = new Set(todo.map((r) => r.id));
    const texts = new Map<number, string>();
    const names: [string, string][] = [];

    const onItem = (id: number, text: string) => {
      if (!left.has(id)) return;
      left.delete(id);
      first ||= performance.now();
      texts.set(id, text);
      const key = keyOf.get(id)!;
      send({ type: "item", id, text, key });
      if (text) void cacheSet(key, text);
    };

    // simple pool: PARALLEL workers each take the next group until none are left
    const results: PromiseSettledResult<void>[] = [];
    let next = 0;
    let stop = false;
    const worker = async () => {
      while (next < groups.length && !signal.aborted && !stop) {
        const i = next++;
        try {
          await translateGroup(shot, settings, { ...job, regions: groups[i] }, extras, onItem, (n) => names.push(n), signal);
          results.push({ status: "fulfilled", value: undefined });
        } catch (reason) {
          results.push({ status: "rejected", reason });
          // a bad key fails every request the same way, no point in sending the rest
          if (reason instanceof TranslateError && (reason.code === "auth" || reason.code === "no-key")) stop = true;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, groups.length) }, worker));
    if (signal.aborted) return;

    console.info(
      `[manga-lens] ${todo.length} bubbles in ${groups.length} requests, first after ${Math.round(first - started)}ms, all in ${Math.round(performance.now() - started)}ms`,
    );

    // remember new names and the last lines for the next page of this series
    const lines = todo.map((r) => texts.get(r.id)).filter((t): t is string => !!t);
    if (lines.length || names.length) {
      const fresh = await loadGlossary(job.series);
      await saveGlossary(job.series, {
        terms: addTerms(fresh.terms, names),
        recent: [...fresh.recent, ...lines].slice(-RECENT),
      });
    }

    // one bubble failing shouldn't throw away the others, but if all of them failed
    // (or a bad key stopped everything) say why
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failed.length && (failed.length === results.length || stop)) throw failed[0].reason;
    if (failed.length) console.error("[manga-lens] some requests failed", failed.map((f) => f.reason));
    send({ type: "done", missing: [...left] });
  } catch (err) {
    if (signal.aborted) return;
    console.error("[manga-lens] translate failed", err);
    if (err instanceof TranslateError) send({ type: "error", code: err.code, message: err.message });
    else send({ type: "error", code: "other", message: err instanceof Error ? err.message : String(err) });
  }
}

async function translateGroup(
  shot: ImageBitmap,
  settings: Settings,
  job: TranslateJob,
  extras: Extras,
  onItem: (id: number, text: string) => void,
  onName: (name: [string, string]) => void,
  signal: AbortSignal,
) {
  const { image, prompt } = await buildRequest(shot, job, extras);

  let raw = "";
  let got = 0;
  const parser = new JsonLines((item) => {
    const { id, text, name, as } = item as { id?: unknown; text?: unknown; name?: unknown; as?: unknown };
    if (typeof name === "string" && typeof as === "string") {
      onName([name, as]);
      return;
    }
    // ids in the prompt are 1-based positions in this group
    const region = typeof id === "number" ? job.regions[id - 1] : undefined;
    if (!region || typeof text !== "string") return;
    got++;
    onItem(region.id, text);
  });

  const tokens = await streamTranslation(settings, image, prompt, (t) => {
    raw += t;
    parser.push(t);
  }, signal);
  parser.end();
  void addUsage(modelOf(settings), tokens.input, tokens.output, got);

  // nothing came back in the expected format, keep the answer around for debugging
  if (!got) console.warn("[manga-lens] no usable lines in answer:", raw.slice(0, 500));
}

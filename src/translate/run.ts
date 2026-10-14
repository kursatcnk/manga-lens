import { addTerms, loadGlossary, saveGlossary } from "../shared/glossary";
import type { PortMessage, TranslateJob } from "../shared/messages";
import { loadSettings, type Settings } from "../shared/settings";
import { addUsage } from "../shared/usage";
import { cacheGet, cacheSet, regionHash } from "./cache";
import { JsonLines } from "./jsonl";
import { buildRequest, type Extras } from "./prompt";
import { modelOf, streamTranslation, TranslateError } from "./providers";

// Her balon kendi isteğiyle gidiyor, hepsi aynı anda. Yavaşlatan şey cevabın uzunluğu,
// sayfa da aşağı yukarı en yavaş balon bitince bitiyor.
// Gemini anahtarlarının (özellikle ücretsiz olanın) dakikalık istek sınırı düşük,
// orada iki balon bir istekte gidiyor.
const GROUP = { claude: 1, gemini: 2 };
// aynı anda çok da fazla olmasın, yeni anahtarlarda sınıra hemen takılıyor
const PARALLEL = { claude: 6, gemini: 4 };
// bağlam olarak önceki kaç satır gidiyor
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

    // zaten okuma sırasında, yan yana balonlar aynı gruba düşüyor
    const size = GROUP[settings.provider];
    const groups: Regions[] = [];
    for (let i = 0; i < todo.length; i += size) groups.push(todo.slice(i, i + size));

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

    // basit havuz: her worker sıradaki grubu alıyor, grup kalmayınca bitiyor
    const results: PromiseSettledResult<void>[] = [];
    let next = 0;
    let stop = false;
    const worker = async () => {
      while (next < groups.length && !signal.aborted && !stop) {
        const i = next++;
        const run = () => translateGroup(shot, settings, { ...job, regions: groups[i] }, extras, onItem, (n) => names.push(n), signal);
        try {
          try {
            await run();
          } catch (err) {
            // dakikalık sınıra takıldık: biraz bekle, bir kere daha dene
            if (!(err instanceof TranslateError && err.code === "rate")) throw err;
            await new Promise((r) => setTimeout(r, 2000));
            if (signal.aborted) return;
            await run();
          }
          results.push({ status: "fulfilled", value: undefined });
        } catch (reason) {
          results.push({ status: "rejected", reason });
          // anahtar yanlışsa her istek aynı hatayı verir, kalanları göndermeye gerek yok
          if (reason instanceof TranslateError && (reason.code === "auth" || reason.code === "no-key")) stop = true;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL[settings.provider], groups.length) }, worker));
    if (signal.aborted) return;

    console.info(
      `[manga-lens] ${todo.length} bubbles in ${groups.length} requests, first after ${Math.round(first - started)}ms, all in ${Math.round(performance.now() - started)}ms`,
    );

    // yeni isimleri ve son satırları serinin sonraki sayfası için kaydet
    const lines = todo.map((r) => texts.get(r.id)).filter((t): t is string => !!t);
    if (lines.length || names.length) {
      const fresh = await loadGlossary(job.series);
      await saveGlossary(job.series, {
        terms: addTerms(fresh.terms, names),
        recent: [...fresh.recent, ...lines].slice(-RECENT),
      });
    }

    // bir balon hata verdi diye diğerlerini çöpe atma, ama hepsi hata verdiyse
    // (ya da yanlış anahtar her şeyi durdurduysa) sebebini söyle
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
    // prompt'taki id'ler bu gruptaki 1'den başlayan sıra
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

  // beklenen formatta hiçbir şey gelmedi, hata ayıklamak için cevabı yazdır
  if (!got) console.warn("[manga-lens] no usable lines in answer:", raw.slice(0, 500));
}

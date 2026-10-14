import { analyze } from "../src/detect/analyze";
import type { Glossary, PortMessage, Prefs, Request, TabMessage, TranslateJob } from "../src/shared/messages";

// Test sayfasında eklenti api'lerinin yerine geçiyor. "capture" test resmini ekran
// boyutunda bir canvas'a çiziyor (captureVisibleTab gibi), çeviri de örnek cümlelerle
// cevap veriyor, böylece API anahtarı olmadan yerleşime bakılabiliyor.

type Listener = (msg: TabMessage) => void;

const listeners: Listener[] = [];
let shot: ImageBitmap | null = null;
let prefs: Prefs = { target: "tr", auto: false, logo: "always", hiddenSites: [] };
const glossaries: Record<string, Glossary> = {};
let fixes = 0;

// adres satırından: hold = çeviri hiç gelmesin (mavi hali görmek için)
const params = new URLSearchParams(location.search);
const hold = params.has("hold");

// test sayfasının yanında pages/<sayfa>.json varsa çeviriler oradan geliyor.
// "at" balonun sayfadaki yeri (resmin kendi pikseliyle), en yakın olan seçiliyor
interface Fixture {
  items: { at: [number, number]; text: string }[];
  terms?: string;
}
let fixture: Fixture | null = null;

export async function loadFixture(page: string) {
  fixture = null;
  try {
    const res = await fetch(`pages/${encodeURIComponent(page)}.json`);
    if (res.ok) fixture = await res.json();
  } catch {
    // yoksa örnek cümleler kullanılır
  }
}

function fromFixture(r: TranslateJob["regions"][number]) {
  const img = document.querySelector<HTMLImageElement>("#page");
  if (!fixture || !img) return null;
  const box = img.getBoundingClientRect();
  const k = img.naturalWidth / box.width;
  const x = ((r.text.x + r.text.w / 2) / devicePixelRatio - box.left) * k;
  const y = ((r.text.y + r.text.h / 2) / devicePixelRatio - box.top) * k;
  let best = fixture.items[0];
  let bestD = Infinity;
  for (const it of fixture.items) {
    const d = (it.at[0] - x) ** 2 + (it.at[1] - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = it;
    }
  }
  return best ? best.text : null;
}

const SAMPLES = [
  "Hey!",
  "Ne oluyor burada?",
  "Bunu daha önce hiç görmemiştim...",
  "Hoşgeldin, seni bekliyorduk!",
  "Sakin ol, her şey yoluna girecek. Sadece bana güven.",
  "Dün gece şehrin üstünde garip bir ışık gördüm ama kimse bana inanmadı.",
  "Gerçekten mi?!",
  "Bekle bir dakika!",
];

async function capture() {
  const dpr = devicePixelRatio;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const img = document.querySelector<HTMLImageElement>("#page");
  if (img?.complete && img.naturalWidth) {
    const r = img.getBoundingClientRect();
    ctx.drawImage(img, r.left * dpr, r.top * dpr, r.width * dpr, r.height * dpr);
  }
  shot = await createImageBitmap(canvas);
}

function fakePort() {
  const handlers: ((m: PortMessage) => void)[] = [];
  let open = true;
  return {
    name: "translate",
    onMessage: { addListener: (fn: (m: PortMessage) => void) => handlers.push(fn) },
    onDisconnect: { addListener: () => {} },
    disconnect: () => (open = false),
    postMessage(job: TranslateJob) {
      if (hold) return;
      const emit = (m: PortMessage) => open && handlers.forEach((h) => h(m));
      job.regions.forEach((r, i) => {
        setTimeout(() => {
          let text = fromFixture(r);
          if (!text) text = job.target === "en" ? "Sample translation goes here." : SAMPLES[(r.id + i + (job.fresh ? 3 : 0)) % SAMPLES.length];
          emit({ type: "item", id: r.id, text, key: `fake-${r.id}` });
          if (i === job.regions.length - 1) emit({ type: "done", missing: [] });
        }, 300 + i * 220 + Math.random() * 400);
      });
    },
  };
}

const shim = {
  runtime: {
    getURL: (path: string) => `/${path}`,
    async sendMessage(msg: Request) {
      try {
        switch (msg.type) {
          case "capture":
            await capture();
            return { ok: true, data: null };
          case "detect":
            if (!shot) throw new Error("no capture");
            return { ok: true, data: analyze(shot) };
          case "prefs":
            return { ok: true, data: prefs };
          case "save-prefs":
            prefs = { ...prefs, ...msg.prefs };
            return { ok: true, data: null };
          case "options":
            alert("ayarlar sayfası eklentide açılır");
            return { ok: true, data: null };
          case "glossary":
            return { ok: true, data: glossaries[msg.series] ?? { terms: fixture?.terms ?? "", recent: [] } };
          case "save-glossary":
            glossaries[msg.series] = { terms: msg.terms, recent: [] };
            return { ok: true, data: null };
          case "remember":
            fixes++;
            console.info("[shim] remembered fix", fixes, msg.key, msg.text);
            return { ok: true, data: null };
        }
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },
    connect: fakePort,
    onMessage: {
      addListener(fn: Listener) {
        listeners.push(fn);
      },
    },
  },
};

Object.assign(globalThis, { chrome: shim });

addEventListener("keydown", (e) => {
  if (e.altKey && e.shiftKey && e.code === "KeyT") listeners.forEach((fn) => fn({ type: "toggle" }));
});

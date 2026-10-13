import type { ErrorCode, PortMessage, Prefs, Rect, Reply, Request, ScanResult, TranslateJob } from "../shared/messages";
import { Box } from "./box";
import { loadFont } from "./font";
import { logoSvg } from "./logo";
import { css } from "./styles";

type State = "idle" | "scanning" | "active";

// keep the sweep on screen for a moment even when detection is instant
const MIN_SCAN_MS = 900;
const NAV_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", " "]);

const ERRORS: Record<ErrorCode, string> = {
  "no-key": "Önce ayarlardan API anahtarı gir",
  auth: "API anahtarı geçersiz",
  rate: "Çok fazla istek, biraz bekle",
  refusal: "Model bu sayfayı çevirmedi",
  other: "Çeviri başarısız oldu",
};

export class Lens {
  private state: State = "idle";
  private run = 0;
  private seq = 0;
  private busy = false;
  private boxes: Box[] = [];
  private ports: chrome.runtime.Port[] = [];
  private prefs: Prefs = { target: "tr", auto: false };
  private error = "";
  private frame = 0;
  private timer = 0;
  private autoTimer = 0;

  private readonly host = document.createElement("manga-lens");
  private readonly stage: HTMLElement;
  private readonly layer: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly status: HTMLElement;
  private readonly source: HTMLSelectElement;
  private readonly target: HTMLSelectElement;
  private readonly auto: HTMLButtonElement;
  private readonly original: HTMLButtonElement;
  private readonly settings: HTMLButtonElement;

  constructor() {
    this.host.style.cssText = "all: initial !important; position: fixed !important; inset: 0 !important; z-index: 2147483647 !important; pointer-events: none !important;";
    const root = this.host.attachShadow({ mode: "closed" });
    root.innerHTML = `
      <style>${css}</style>
      <div class="stage">
        <div class="dim"></div>
        <div class="layer"></div>
        <div class="edge glow"><div class="ring"><div class="spin"></div></div></div>
        <div class="edge"><div class="ring"><div class="spin"></div></div></div>
        <div class="sweep"></div>
        <div class="bar" role="toolbar" aria-label="Manga Lens">
          <span class="brand">${logoSvg}<span>Manga Lens</span></span>
          <select class="source" aria-label="Kaynak dil">
            <option value="auto">Otomatik algıla</option>
            <option value="en">İngilizce</option>
            <option value="ja">Japonca</option>
            <option value="ko">Korece</option>
            <option value="zh">Çince</option>
          </select>
          <span class="arrow">→</span>
          <select class="target" aria-label="Hedef dil">
            <option value="tr">Türkçe</option>
            <option value="en">İngilizce</option>
          </select>
          <span class="status" aria-live="polite"></span>
          <button class="auto" aria-pressed="false" title="Sayfa değişince kendiliğinden çevir">Otomatik</button>
          <button class="original" aria-pressed="false">Orijinal</button>
          <button class="settings icon" title="Ayarlar" aria-label="Ayarlar">⚙</button>
          <button class="close icon" title="Kapat (Esc)" aria-label="Kapat">✕</button>
        </div>
        <button class="logo" title="Manga Lens (Alt+Shift+T)">${logoSvg}</button>
      </div>`;

    const $ = <T extends Element>(sel: string) => root.querySelector(sel) as T;
    this.stage = $(".stage");
    this.layer = $(".layer");
    this.bar = $(".bar");
    this.status = $(".status");
    this.source = $(".source");
    this.target = $(".target");
    this.auto = $(".auto");
    this.original = $(".original");
    this.settings = $(".settings");

    $<HTMLButtonElement>(".logo").addEventListener("click", () => this.toggle());
    $<HTMLButtonElement>(".close").addEventListener("click", () => this.close());
    this.settings.addEventListener("click", () => void send({ type: "options" }));
    this.source.addEventListener("change", () => this.retranslate());
    this.target.addEventListener("change", () => {
      this.prefs.target = this.target.value;
      void send({ type: "save-prefs", prefs: { target: this.target.value } });
      this.retranslate();
    });
    this.auto.addEventListener("click", () => {
      this.prefs.auto = !this.prefs.auto;
      this.auto.setAttribute("aria-pressed", String(this.prefs.auto));
      void send({ type: "save-prefs", prefs: { auto: this.prefs.auto } });
      if (this.prefs.auto) void this.rescan();
    });
    this.original.addEventListener("click", () => {
      const on = this.layer.classList.toggle("original");
      this.original.setAttribute("aria-pressed", String(on));
    });

    // auto mode: look again once the reader settles after scrolling or turning a page
    const kick = (ms: number) => {
      if (this.state !== "active" || !this.prefs.auto) return;
      clearTimeout(this.autoTimer);
      this.autoTimer = window.setTimeout(() => void this.rescan(), ms);
    };
    addEventListener("scroll", () => { this.schedule(); kick(600); }, { capture: true, passive: true });
    addEventListener("resize", () => { this.schedule(); kick(600); });
    addEventListener("wheel", () => kick(700), { passive: true });
    addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.state !== "idle") this.close();
      else if (NAV_KEYS.has(e.key)) kick(700);
    });
    addEventListener("click", (e) => {
      if (!e.composedPath().includes(this.host)) kick(800);
    }, true);
    // fullscreen readers only paint what is inside the fullscreen element
    document.addEventListener("fullscreenchange", () => this.mount());

    this.mount();
  }

  toggle() {
    if (this.state === "idle") void this.start();
    else if (this.state === "active") this.close();
  }

  private mount() {
    const parent = document.fullscreenElement ?? document.documentElement;
    if (this.host.parentNode !== parent) parent.append(this.host);
  }

  // the screenshot must not contain our own UI
  private async shoot() {
    const scrolled = { x: scrollX, y: scrollY };
    this.host.style.setProperty("visibility", "hidden", "important");
    try {
      await frames(2);
      await send({ type: "capture" });
    } finally {
      this.host.style.removeProperty("visibility");
    }
    return scrolled;
  }

  private async start() {
    this.state = "scanning";
    const run = ++this.run;
    this.error = "";
    void loadFont();

    try {
      this.prefs = await send<Prefs>({ type: "prefs" });
      this.target.value = this.prefs.target;
      this.auto.setAttribute("aria-pressed", String(this.prefs.auto));

      const scrolled = await this.shoot();
      if (run !== this.run) return;
      this.stage.classList.add("on", "scanning");
      const started = performance.now();

      const result = await send<ScanResult>({ type: "detect" });
      await delay(MIN_SCAN_MS - (performance.now() - started));
      if (run !== this.run) return;

      this.stage.classList.remove("scanning");
      this.state = "active";
      this.bar.classList.add("show");
      this.timer = window.setInterval(() => this.schedule(), 500);

      const added = this.merge(result, scrolled);
      if (!this.boxes.length) this.setStatus("Bu ekranda yazı bulunamadı");
      else this.translate(added);
    } catch (err) {
      if (run === this.run) this.fail(err);
    }
  }

  // quiet scan for auto mode and language changes, no big animation
  private async rescan() {
    if (this.state !== "active" || this.busy) return;
    this.busy = true;
    const run = this.run;
    this.stage.classList.add("busy");
    try {
      const scrolled = await this.shoot();
      const result = await send<ScanResult>({ type: "detect" });
      if (run !== this.run) return;
      const added = this.merge(result, scrolled);
      this.translate(added);
      if (!this.boxes.length) this.setStatus("Bu ekranda yazı bulunamadı");
      else this.progress();
    } catch (err) {
      console.warn("[manga-lens] rescan failed", err);
    } finally {
      this.busy = false;
      this.stage.classList.remove("busy");
    }
  }

  // Adds boxes for new text areas, keeps the ones already there,
  // and drops on-screen boxes whose text is gone (the page changed).
  private merge(result: ScanResult, scrolled: { x: number; y: number }) {
    // screenshot pixels -> CSS pixels, also covers devicePixelRatio and page zoom
    const k = innerWidth / result.width;
    const dx = scrolled.x - scrollX;
    const dy = scrolled.y - scrollY;
    const toCss = (r: Rect) => ({ x: r.x * k + dx, y: r.y * k + dy, w: r.w * k, h: r.h * k });

    const keep = new Set<Box>();
    const fresh: Box[] = [];

    // anchors hit-test the page, so our layer has to be out of the way
    this.host.style.setProperty("visibility", "hidden", "important");
    for (const r of result.regions) {
      const bubble = toCss(r.bubble);
      const same = this.boxes.find((b) => b.rect && overlap(b.rect, bubble) > 0.6);
      if (same) {
        keep.add(same);
        continue;
      }
      const box = new Box(
        { id: ++this.seq, bubble, text: toCss(r.text), round: r.round, bg: r.bg },
        fresh.length,
        { id: this.seq, text: r.text, bubble: r.bubble, limit: charLimit(bubble, r.round) },
      );
      fresh.push(box);
    }
    this.host.style.removeProperty("visibility");

    // only boxes fully in view can be judged, a half visible bubble isn't detected anyway
    const gone = this.boxes.filter((b) => !keep.has(b) && b.rect && inView(b.rect));
    this.remove(gone);
    this.boxes = this.boxes.filter((b) => !gone.includes(b)).concat(fresh);

    this.layer.append(...fresh.map((b) => b.el));
    fresh.forEach((b) => b.place());
    return fresh;
  }

  private translate(list: Box[]) {
    if (!list.length) return;
    const run = this.run;
    const byId = new Map(list.map((b) => [b.id, b]));
    const port = chrome.runtime.connect({ name: "translate" });
    this.ports.push(port);
    const drop = () => (this.ports = this.ports.filter((p) => p !== port));

    port.onMessage.addListener((m: PortMessage) => {
      if (run !== this.run) return;
      if (m.type === "item") {
        byId.get(m.id)?.fill(m.text, this.target.value);
      } else if (m.type === "done") {
        m.missing.forEach((id) => byId.get(id)?.fail());
        port.disconnect();
        drop();
      } else {
        list.forEach((b) => b.done || b.fail());
        this.showError(m.code);
        port.disconnect();
        drop();
      }
      this.progress();
    });
    port.onDisconnect.addListener(() => {
      drop();
      // the service worker went away mid-stream
      if (run !== this.run) return;
      if (list.some((b) => !b.done && !b.failed)) {
        list.forEach((b) => b.done || b.fail());
        this.showError("other");
      }
    });

    const job: TranslateJob = { regions: list.map((b) => b.job), source: this.source.value, target: this.target.value };
    port.postMessage(job);
    this.progress();
  }

  // language changed: start over from a fresh screenshot
  private retranslate() {
    if (this.state !== "active") return;
    this.run++;
    this.error = "";
    this.dropPorts();
    this.remove(this.boxes);
    this.boxes = [];
    this.busy = false;
    void this.rescan();
  }

  private progress() {
    if (this.error) return;
    const failed = this.boxes.filter((b) => b.failed).length;
    const done = this.boxes.filter((b) => b.done).length;
    const total = this.boxes.length - failed;
    this.setStatus(done < total ? `Çevriliyor… ${done}/${total}` : `${done} balon çevrildi`);
  }

  private showError(code: ErrorCode) {
    this.error = ERRORS[code];
    this.setStatus(this.error, true);
    this.settings.classList.toggle("attn", code === "no-key" || code === "auth");
  }

  private setStatus(text: string, err = false) {
    this.status.textContent = text;
    this.status.classList.toggle("err", err);
  }

  private schedule() {
    if (this.state !== "active" || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      for (const box of this.boxes) box.place();
    });
  }

  private fail(err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[manga-lens]", msg);
    this.stage.classList.remove("scanning");
    this.stage.classList.add("on");
    this.state = "active";
    this.bar.classList.add("show");
    this.error = /context invalidated/i.test(msg) ? "Eklenti güncellendi, sayfayı yenile" : "Bu sayfa taranamadı";
    this.setStatus(this.error, true);
  }

  private dropPorts() {
    this.ports.forEach((p) => p.disconnect());
    this.ports = [];
  }

  private remove(list: Box[]) {
    list.forEach((b) => b.el.classList.add("leaving"));
    setTimeout(() => list.forEach((b) => b.el.remove()), 300);
  }

  close() {
    this.run++;
    this.state = "idle";
    this.busy = false;
    clearInterval(this.timer);
    clearTimeout(this.autoTimer);
    this.dropPorts();
    this.stage.classList.remove("on", "scanning", "busy");
    this.bar.classList.remove("show");
    this.layer.classList.remove("original");
    this.original.setAttribute("aria-pressed", "false");
    this.settings.classList.remove("attn");
    this.remove(this.boxes);
    this.boxes = [];
  }
}

// rough number of characters that fit at a still readable size
function charLimit(r: Rect, round: boolean) {
  const area = r.w * r.h * (round ? 0.6 : 0.8);
  return Math.max(6, Math.min(400, Math.round(area / (13 * 7.5 * 1.15))));
}

function overlap(a: Rect, b: Rect) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  return inter / (a.w * a.h + b.w * b.h - inter);
}

function inView(r: Rect) {
  return r.x > 2 && r.y > 2 && r.x + r.w < innerWidth - 2 && r.y + r.h < innerHeight - 2;
}

async function send<T = unknown>(msg: Request): Promise<T> {
  const reply = (await chrome.runtime.sendMessage(msg)) as Reply<T> | undefined;
  if (!reply) throw new Error("no reply from background");
  if (!reply.ok) throw new Error(reply.error);
  return reply.data;
}

// rAF stalls when the tab isn't painting, so don't wait on it forever
function frames(n: number) {
  return new Promise<void>((resolve) => {
    const step = () => (--n <= 0 ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
    setTimeout(resolve, 100);
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

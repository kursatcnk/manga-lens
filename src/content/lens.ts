import { seriesKey } from "../shared/glossary";
import type { ErrorCode, Glossary, PortMessage, Prefs, Rect, Reply, Request, ScanResult, TranslateJob } from "../shared/messages";
import { Box } from "./box";
import { loadFont } from "./font";
import { logoSvg } from "./logo";
import { css } from "./styles";

type State = "idle" | "scanning" | "active";
// flip = sayfa değişmiş olabilir, çekimde arayüzü gizle ve eski kutuları at
// scroll = aynı sayfa kaydı, hepsini tut sadece yenileri ekle
type Mode = "flip" | "scroll";

// tespit anında bitse bile tarama efekti bir süre görünsün
const MIN_SCAN_MS = 600;
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
  private pending: Mode | null = null;
  private freshNext = false;
  private boxes: Box[] = [];
  private ports: chrome.runtime.Port[] = [];
  private prefs: Prefs = { target: "tr", auto: false, logo: "auto", hiddenSites: [] };
  private error = "";
  private frame = 0;
  private timer = 0;
  private autoTimer = 0;
  private scrollTimer = 0;
  private lastScrollScan = 0;
  private logoCheck = 0;
  private hover: Box | null = null;
  private editing: Box | null = null;

  private readonly host = document.createElement("manga-lens");
  // çeviriler ayrı bir katmanda, sayfanın içinde duruyor. Ekrana sabit katmanda
  // her kaydırmadan sonra JS ile yerini düzeltiyorduk, yazılar bir kare geriden
  // gelip titriyordu. Sayfanın içindeyken tarayıcı resimle beraber kaydırıyor.
  private readonly pageHost = document.createElement("manga-lens-page");
  private readonly stage: HTMLElement;
  private readonly layer: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly status: HTMLElement;
  private readonly source: HTMLSelectElement;
  private readonly target: HTMLSelectElement;
  private readonly auto: HTMLButtonElement;
  private readonly original: HTMLButtonElement;
  private readonly settings: HTMLButtonElement;
  private readonly logo: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly terms: HTMLTextAreaElement;
  private readonly chip: HTMLElement;
  private readonly editor: HTMLElement;
  private readonly editText: HTMLTextAreaElement;

  constructor() {
    this.host.style.cssText = "all: initial !important; position: fixed !important; inset: 0 !important; z-index: 2147483647 !important; pointer-events: none !important;";
    const root = this.host.attachShadow({ mode: "closed" });
    root.innerHTML = `
      <style>${css}</style>
      <div class="stage">
        <div class="dim"></div>
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
          <button class="auto" aria-pressed="false" title="Kaydırınca ve sayfa değişince kendiliğinden çevir">Otomatik</button>
          <button class="original" aria-pressed="false">Orijinal</button>
          <button class="dict" title="Bu serinin isim sözlüğü">Sözlük</button>
          <button class="settings icon" title="Ayarlar" aria-label="Ayarlar">⚙</button>
          <button class="close icon" title="Kapat (Esc)" aria-label="Kapat">✕</button>
        </div>
        <div class="panel">
          <div class="panel-head">Sözlük <span class="series"></span></div>
          <textarea class="terms" spellcheck="false" placeholder="Akira-san = Akira Abi&#10;Sensei = Hocam"></textarea>
          <p class="hint">Her satıra bir tane: orijinal = çeviri. Model yeni isimleri kendisi ekler, sen düzeltebilirsin.</p>
          <div class="panel-actions">
            <button class="save-terms">Kaydet</button>
            <button class="save-terms again">Kaydet ve yeniden çevir</button>
          </div>
        </div>
        <div class="chip">
          <button data-act="retry" title="Bu balonu yeniden çevir">↻</button>
          <button data-act="edit" title="Çeviriyi düzelt">✎</button>
          <button data-act="peek" title="Orijinali göster">◐</button>
        </div>
        <div class="editor">
          <textarea class="edit-text" spellcheck="false"></textarea>
          <div class="panel-actions">
            <button class="edit-save">Kaydet</button>
            <button class="edit-cancel">Vazgeç</button>
          </div>
        </div>
        <div class="logo-wrap" hidden>
          <button class="logo" title="Manga Lens (Alt+Shift+T)">${logoSvg}</button>
          <button class="logo-hide" title="Bu sitede gösterme (ayarlardan geri açılır)">×</button>
        </div>
      </div>`;

    this.pageHost.style.cssText = "all: initial !important; position: absolute !important; left: 0 !important; top: 0 !important; width: 0 !important; height: 0 !important; overflow: visible !important; z-index: 2147483646 !important; pointer-events: none !important;";
    const pageRoot = this.pageHost.attachShadow({ mode: "closed" });
    pageRoot.innerHTML = `<style>${css}</style><div class="layer"></div>`;
    this.layer = pageRoot.querySelector(".layer") as HTMLElement;

    const $ = <T extends Element>(sel: string) => root.querySelector(sel) as T;
    this.stage = $(".stage");
    this.bar = $(".bar");
    this.status = $(".status");
    this.source = $(".source");
    this.target = $(".target");
    this.auto = $(".auto");
    this.original = $(".original");
    this.settings = $(".settings");
    this.logo = $(".logo-wrap");
    this.panel = $(".panel");
    this.terms = $(".terms");
    this.chip = $(".chip");
    this.editor = $(".editor");
    this.editText = $(".edit-text");

    $<HTMLButtonElement>(".logo").addEventListener("click", () => this.toggle());
    $<HTMLButtonElement>(".logo-hide").addEventListener("click", () => this.hideOnThisSite());
    $<HTMLButtonElement>(".close").addEventListener("click", () => this.close());
    $<HTMLButtonElement>(".dict").addEventListener("click", () => void this.openGlossary());
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
      if (this.prefs.auto) void this.rescan("flip");
    });
    this.original.addEventListener("click", () => {
      const on = this.layer.classList.toggle("original");
      this.original.setAttribute("aria-pressed", String(on));
    });

    root.querySelectorAll<HTMLButtonElement>(".save-terms").forEach((btn) =>
      btn.addEventListener("click", () => void this.saveGlossary(btn.classList.contains("again"))),
    );
    this.chip.addEventListener("click", (e) => {
      const act = (e.target as HTMLElement).closest("button")?.dataset.act;
      const box = this.hover;
      if (!box || !act) return;
      if (act === "retry") void this.retry(box);
      if (act === "edit") this.openEditor(box);
      if (act === "peek") box.peek();
    });
    $<HTMLButtonElement>(".edit-save").addEventListener("click", () => this.saveEdit());
    $<HTMLButtonElement>(".edit-cancel").addEventListener("click", () => this.closeEditor());

    // otomatik mod. sayfa çevirince (tuş, tık, sayfalı okuyucuda tekerlek) ortalık durulunca
    // baştan tarıyor. kaydırırken de webtoon'lar için arada bir yeni balonlara bakıyor.
    const flipSoon = (ms: number) => {
      if (!this.autoOn()) return;
      clearTimeout(this.autoTimer);
      this.autoTimer = window.setTimeout(() => void this.rescan("flip"), ms);
    };
    addEventListener("scroll", () => {
      this.schedule();
      this.showChip(null);
      if (!this.autoOn()) return;
      // kaydı, demek ki tuş ya da tekerlek sayfa çevirmedi
      clearTimeout(this.autoTimer);
      const now = performance.now();
      if (now - this.lastScrollScan > 1000) {
        this.lastScrollScan = now;
        void this.rescan("scroll");
      }
      clearTimeout(this.scrollTimer);
      this.scrollTimer = window.setTimeout(() => void this.rescan("scroll"), 400);
    }, { capture: true, passive: true });
    addEventListener("resize", () => { this.schedule(); flipSoon(600); });
    addEventListener("wheel", () => flipSoon(700), { passive: true });
    addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.editing) this.closeEditor();
      else if (e.key === "Escape" && this.state !== "idle") this.close();
      else if (NAV_KEYS.has(e.key) && !this.editing) flipSoon(700);
    });
    addEventListener("click", (e) => {
      if (!e.composedPath().includes(this.host)) flipSoon(800);
    }, true);
    addEventListener("mousemove", (e) => this.onMouse(e.clientX, e.clientY), { passive: true });
    document.addEventListener("fullscreenchange", () => this.mount());

    this.mount();

    // logo sadece okuyucuya benzeyen sayfalarda çıksın
    send<Prefs>({ type: "prefs" })
      .then((p) => {
        this.prefs = p;
        this.updateLogo();
      })
      .catch(() => {});
    addEventListener("load", () => this.updateLogo());
    const observer = new MutationObserver(() => {
      if (this.logoCheck) return;
      this.logoCheck = window.setTimeout(() => {
        this.logoCheck = 0;
        if (this.updateLogo()) observer.disconnect();
      }, 1500);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  toggle() {
    if (this.state === "idle") void this.start();
    else if (this.state === "active") this.close();
  }

  private autoOn() {
    return this.state === "active" && this.prefs.auto;
  }

  // tam ekran okuyucular sadece tam ekran olan elemanın içini gösteriyor
  private mount() {
    const parent = document.fullscreenElement ?? document.documentElement;
    if (this.host.parentNode !== parent) parent.append(this.host);
    if (this.pageHost.parentNode !== parent) parent.append(this.pageHost);
    // tam ekranda sayfa kaymıyor, katman ekrana sabit olsun
    this.pageHost.style.setProperty("position", document.fullscreenElement ? "fixed" : "absolute", "important");
    this.schedule();
  }

  // katmanın sol üst köşesi ekranda nerede (sayfa kaydıkça değişiyor)
  private offset() {
    const r = this.pageHost.getBoundingClientRect();
    return { x: r.left, y: r.top };
  }

  // ekran görüntüsünde ve elementFromPoint'te bizim katmanlar görünmemeli
  private hideUi(hide: boolean) {
    for (const h of [this.host, this.pageHost]) {
      if (hide) h.style.setProperty("visibility", "hidden", "important");
      else h.style.removeProperty("visibility");
    }
  }

  // logo kalıcı olarak göründüyse true döner
  private updateLogo() {
    const p = this.prefs;
    let show = p.logo === "always" || (p.logo === "auto" && looksLikeComic());
    if (p.hiddenSites.includes(location.hostname)) show = false;
    this.logo.hidden = !show;
    return show && p.logo === "auto";
  }

  private hideOnThisSite() {
    this.prefs.hiddenSites = [...this.prefs.hiddenSites, location.hostname];
    void send({ type: "save-prefs", prefs: { hiddenSites: this.prefs.hiddenSites } });
    this.updateLogo();
  }

  // ekran görüntüsünde bizim arayüz olmamalı
  private async shoot() {
    const scrolled = { x: scrollX, y: scrollY };
    this.hideUi(true);
    try {
      await frames(2);
      await send({ type: "capture" });
    } finally {
      this.hideUi(false);
    }
    return scrolled;
  }

  private async start() {
    this.state = "scanning";
    const run = ++this.run;
    this.error = "";
    // font gelince o ana kadar dizilen yazıları baştan diz, yoksa ölçüler tutmuyor
    loadFont().then(() => {
      for (const b of this.boxes) b.relayout();
    });

    try {
      this.prefs = await send<Prefs>({ type: "prefs" });
      this.target.value = this.prefs.target;
      this.auto.setAttribute("aria-pressed", String(this.prefs.auto));

      const scrolled = await this.shoot();
      if (run !== this.run) return;
      this.stage.classList.add("on", "scanning");
      const started = performance.now();

      const result = await send<ScanResult>({ type: "detect" });
      if (run !== this.run) return;

      // çeviriye hemen başla, tarama efekti bir süre daha üstte dönsün
      this.state = "active";
      this.bar.classList.add("show");
      this.timer = window.setInterval(() => this.schedule(), 500);
      const added = this.merge(result, scrolled, true);
      if (!this.boxes.length) this.setStatus("Bu ekranda yazı bulunamadı");
      else this.translate(added);

      await delay(MIN_SCAN_MS - (performance.now() - started));
      if (run === this.run) this.stage.classList.remove("scanning");
    } catch (err) {
      if (run === this.run) this.fail(err);
    }
  }

  // otomatik mod ve dil değişince sessiz tarama, büyük animasyon yok
  private async rescan(mode: Mode) {
    if (this.state !== "active") return;
    if (this.busy) {
      // meşgulken sayfa çevirme istendiyse kaydırmaya göre öncelikli
      this.pending = mode === "flip" || this.pending === "flip" ? "flip" : "scroll";
      return;
    }
    this.busy = true;
    const run = this.run;
    this.stage.classList.add("busy");
    try {
      let scrolled = { x: scrollX, y: scrollY };
      if (mode === "flip") scrolled = await this.shoot();
      // kaydırırken arayüzü gizlemiyoruz, her saniye gizleyince yanıp sönüyordu.
      // çevrilmiş balonlar çekimde yine balon olarak görünüyor, eşleşmede sorun olmuyor
      else await send({ type: "capture" });

      const result = await send<ScanResult>({ type: "detect" });
      if (run !== this.run) return;
      const added = this.merge(result, scrolled, mode === "flip");
      this.translate(added);
      if (!this.boxes.length) this.setStatus("Bu ekranda yazı bulunamadı");
      else this.progress();
    } catch (err) {
      console.warn("[manga-lens] rescan failed", err);
    } finally {
      this.busy = false;
      this.stage.classList.remove("busy");
      const next = this.pending;
      this.pending = null;
      // captureVisibleTab saniyede iki çekime izin veriyor, arka arkaya yapma
      if (next && run === this.run) setTimeout(() => void this.rescan(next), 500);
    }
  }

  private toCss(result: ScanResult, scrolled: { x: number; y: number }) {
    // ekran görüntüsü pikseli -> CSS pikseli, devicePixelRatio ve zoom da buna dahil
    const k = innerWidth / result.width;
    const dx = scrolled.x - scrollX;
    const dy = scrolled.y - scrollY;
    return (r: Rect) => ({ x: r.x * k + dx, y: r.y * k + dy, w: r.w * k, h: r.h * k });
  }

  // Yeni yazı alanları için kutu ekliyor, zaten olanları bırakıyor. Sayfa değiştiyse
  // ekranda olup artık bulunamayan kutuları da kaldırıyor.
  private merge(result: ScanResult, scrolled: { x: number; y: number }, dropGone: boolean) {
    const toCss = this.toCss(result, scrolled);
    const keep = new Set<Box>();
    const fresh: Box[] = [];

    // anchor'lar sayfada elementFromPoint yapıyor, bizim katmanlar araya girmesin
    this.hideUi(true);
    for (const r of result.regions) {
      const bubble = toCss(r.bubble);
      const same = this.boxes.find((b) => b.rect && overlap(b.rect, bubble) > 0.6);
      if (same) {
        keep.add(same);
        continue;
      }
      const box = new Box(
        { id: ++this.seq, bubble, text: toCss(r.text), lines: r.lines.map(toCss), round: r.round, bg: r.bg, dark: r.dark },
        fresh.length,
        { id: this.seq, text: r.text, bubble: r.bubble, limit: charLimit(bubble, r.round) },
      );
      fresh.push(box);
    }
    this.hideUi(false);

    if (dropGone) {
      // sadece tamamen ekranda olan kutulara karar verebiliriz, yarısı görünen balon zaten bulunmuyor
      const gone = this.boxes.filter((b) => !keep.has(b) && b.rect && inView(b.rect));
      this.remove(gone);
      this.boxes = this.boxes.filter((b) => !gone.includes(b));
    }
    this.boxes = this.boxes.concat(fresh);

    this.layer.append(...fresh.map((b) => b.el));
    const off = this.offset();
    for (const b of fresh) b.place(off);
    return fresh;
  }

  private translate(list: Box[], fresh = false) {
    if (!list.length) return;
    if (this.freshNext) {
      fresh = true;
      this.freshNext = false;
    }
    const run = this.run;
    const byId = new Map(list.map((b) => [b.id, b]));
    const port = chrome.runtime.connect({ name: "translate" });
    this.ports.push(port);
    const drop = () => (this.ports = this.ports.filter((p) => p !== port));

    port.onMessage.addListener((m: PortMessage) => {
      if (run !== this.run) return;
      if (m.type === "item") {
        const box = byId.get(m.id);
        if (box) {
          box.key = m.key;
          box.fill(m.text, this.target.value);
        }
      } else if (m.type === "done") {
        m.missing.forEach((id) => byId.get(id)?.fail());
        port.disconnect();
        drop();
      } else {
        list.forEach((b) => b.done || b.fail());
        this.showError(m.code, m.message);
        port.disconnect();
        drop();
      }
      this.progress();
    });
    port.onDisconnect.addListener(() => {
      drop();
      // service worker çeviri ortasında kapandı
      if (run !== this.run) return;
      if (list.some((b) => !b.done && !b.failed)) {
        list.forEach((b) => b.done || b.fail());
        this.showError("other", "bağlantı koptu");
      }
    });

    const job: TranslateJob = {
      regions: list.map((b) => b.job),
      source: this.source.value,
      target: this.target.value,
      series: seriesKey(location.href),
      fresh,
    };
    port.postMessage(job);
    this.progress();
  }

  // dil ya da sözlük değişti: yeni bir ekran görüntüsüyle baştan başla
  private retranslate(fresh = false) {
    if (this.state !== "active") return;
    this.run++;
    this.error = "";
    this.freshNext = fresh;
    this.dropPorts();
    this.showChip(null);
    this.closeEditor();
    this.remove(this.boxes);
    this.boxes = [];
    this.busy = false;
    void this.rescan("flip");
  }

  // bir balon yanlış çıktı: yeni çekimde onu bul ve önbelleği atlayıp tekrar sor
  private async retry(box: Box) {
    if (this.busy || !box.rect) return;
    this.busy = true;
    const run = this.run;
    const where = box.rect;
    this.showChip(null);
    box.reset();
    try {
      const scrolled = await this.shoot();
      const result = await send<ScanResult>({ type: "detect" });
      if (run !== this.run) return;
      const toCss = this.toCss(result, scrolled);
      const match = result.regions.find((r) => overlap(toCss(r.bubble), where) > 0.5);
      if (!match) {
        box.fail();
        this.setStatus("Balon yeniden bulunamadı");
        return;
      }
      box.job = { ...box.job, text: match.text, bubble: match.bubble };
      this.translate([box], true);
    } catch (err) {
      box.fail();
      console.warn("[manga-lens] retry failed", err);
    } finally {
      this.busy = false;
    }
  }

  private onMouse(x: number, y: number) {
    if (this.state !== "active" || this.editing || this.panel.classList.contains("show")) return;
    // balonun üstünde biraz pay, fare düğmelere ulaşabilsin
    const box = this.boxes.find((b) => {
      const r = b.rect;
      if (!r || !(b.done || b.failed)) return false;
      return x >= r.x - 4 && x <= r.x + r.w + 4 && y >= r.y - 34 && y <= r.y + r.h + 4;
    });
    if (box !== this.hover) this.showChip(box ?? null);
  }

  private showChip(box: Box | null) {
    this.hover = box;
    this.chip.classList.toggle("show", !!box);
    if (!box?.rect) return;
    const r = box.rect;
    this.chip.style.left = `${Math.max(4, r.x + r.w - 96)}px`;
    this.chip.style.top = `${Math.max(4, r.y - 32)}px`;
  }

  private openEditor(box: Box) {
    if (!box.rect) return;
    this.editing = box;
    this.showChip(null);
    this.editText.value = box.raw;
    const r = box.rect;
    this.editor.style.left = `${Math.min(Math.max(4, r.x), innerWidth - 284)}px`;
    this.editor.style.top = `${Math.min(r.y + r.h + 6, innerHeight - 140)}px`;
    this.editor.classList.add("show");
    this.editText.focus();
  }

  private saveEdit() {
    const box = this.editing;
    const text = this.editText.value.trim();
    this.closeEditor();
    if (!box || !text) return;
    box.fill(text, this.target.value);
    // bu balon bir daha gelince düzeltilmiş hali kullanılsın
    if (box.key) void send({ type: "remember", key: box.key, text });
    this.progress();
  }

  private closeEditor() {
    this.editing = null;
    this.editor.classList.remove("show");
  }

  private async openGlossary() {
    const open = this.panel.classList.toggle("show");
    if (!open) return;
    this.showChip(null);
    const series = seriesKey(location.href);
    this.panel.querySelector(".series")!.textContent = series;
    try {
      const g = await send<Glossary>({ type: "glossary", series });
      this.terms.value = g.terms;
    } catch {
      this.terms.value = "";
    }
  }

  private async saveGlossary(again: boolean) {
    await send({ type: "save-glossary", series: seriesKey(location.href), terms: this.terms.value });
    this.panel.classList.remove("show");
    if (again) this.retranslate(true);
  }

  private progress() {
    if (this.error) return;
    const failed = this.boxes.filter((b) => b.failed).length;
    const done = this.boxes.filter((b) => b.done).length;
    const total = this.boxes.length - failed;
    this.setStatus(done < total ? `Çevriliyor… ${done}/${total}` : `${done} balon çevrildi`);
  }

  private showError(code: ErrorCode, detail = "") {
    console.warn("[manga-lens]", code, detail);
    // sadece genel mesaj neyin bozulduğunu söylemiyor
    this.error = code === "other" && detail ? `${ERRORS[code]}: ${detail}` : ERRORS[code];
    this.setStatus(this.error, true);
    this.status.title = detail;
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
      const off = this.offset();
      for (const box of this.boxes) box.place(off);
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
    this.pending = null;
    clearInterval(this.timer);
    clearTimeout(this.autoTimer);
    clearTimeout(this.scrollTimer);
    this.dropPorts();
    this.showChip(null);
    this.closeEditor();
    this.panel.classList.remove("show");
    this.stage.classList.remove("on", "scanning", "busy");
    this.bar.classList.remove("show");
    this.layer.classList.remove("original");
    this.original.setAttribute("aria-pressed", "false");
    this.settings.classList.remove("attn");
    this.remove(this.boxes);
    this.boxes = [];
  }
}

// sayfada büyük bir resim ya da canvas var mı, okuyucuların çoğunda var
function looksLikeComic() {
  const els = document.querySelectorAll("img, canvas, [style*='background-image']");
  for (let i = 0; i < els.length && i < 500; i++) {
    const r = els[i].getBoundingClientRect();
    if (r.width >= 300 && r.height >= 300) return true;
  }
  return false;
}

// okunur bir boyutta kabaca kaç karakter sığar
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

// sekme çizilmiyorsa rAF takılıyor, sonsuza kadar bekleme
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

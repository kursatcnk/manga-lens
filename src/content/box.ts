import type { Rect, TranslateJob } from "../shared/messages";
import { Anchor } from "./anchor";
import { FONT_STACK, measure } from "./font";
import { ellipseShape, fitText, maskShape, rectShape } from "./layout";

export interface BoxInput {
  id: number;
  bubble: Rect; // ekrandaki CSS pikseli
  text: Rect;
  lines: Rect[];
  round: boolean;
  bg: string;
  dark: boolean;
  // balonun ölçülmüş içi, o da CSS pikseli
  shape?: { y: number; step: number; rows: [number, number][] };
}

// Tek bir yazı alanı: beklerken mavi vurgu, sonra orijinal satırlar balonun kendi
// rengiyle kapatılıyor ve çeviri gerçek balonun üstüne yazılıyor.
export class Box {
  id: number;
  el = document.createElement("div");
  round: boolean;
  hl = document.createElement("div");
  cover = document.createElement("div");
  anchor: Anchor;
  text = "";
  lang = "tr";
  laidW = 0;
  rect: Rect | null = null;
  // gelen çeviri, büyük harfe çevrilmeden önceki hali (düzeltme kutusu için)
  raw = "";
  // arka plandaki önbellek anahtarı, elle düzeltme buna kaydediliyor
  key = "";
  // yazının yerleşeceği alan, balonun içinde oran olarak (0-1)
  area = { x: 0, y: 0, w: 1, h: 1 };
  // ölçülmüş şekil varsa her satırın [sol, sağ]'ı, alanın genişliğine oran olarak
  mask: [number, number][] | null = null;

  // job: çeviriye giden bilgiler, ekran görüntüsü pikseliyle
  constructor(input: BoxInput, index: number, public job: TranslateJob["regions"][number]) {
    this.id = input.id;
    this.anchor = new Anchor(input.bubble);
    this.round = input.round;

    const b = input.bubble;
    const t = input.text;
    const pct = (r: Rect, pad: number) => {
      const x = Math.max(b.x, r.x - pad);
      const y = Math.max(b.y, r.y - pad);
      const w = Math.min(b.x + b.w, r.x + r.w + pad) - x;
      const h = Math.min(b.y + b.h, r.y + r.h + pad) - y;
      return `left:${((x - b.x) / b.w) * 100}%;top:${((y - b.y) / b.h) * 100}%;width:${(w / b.w) * 100}%;height:${(h / b.h) * 100}%`;
    };

    const s = input.shape;
    if (s && s.rows.length > 3) {
      // en iyisi: balonun içini ölçtük, yazı tam o şekle dizilecek
      let x0 = Infinity;
      let x1 = -Infinity;
      for (const [l, r] of s.rows) {
        if (l < x0) x0 = l;
        if (r > x1) x1 = r;
      }
      const h = s.rows.length * s.step;
      this.area = { x: (x0 - b.x) / b.w, y: (s.y - b.y) / b.h, w: (x1 - x0) / b.w, h: h / b.h };
      this.mask = s.rows.map(([l, r]): [number, number] => [(l - x0) / (x1 - x0), (r - x0) / (x1 - x0)]);
    } else if (b.w > t.w * 2.4 || b.h > t.h * 2.4) {
      // Beyaz alan balonun dışına taşmış (çizgisi açık balon, arkadaki beyaz panel...).
      // Yazıyı koca alanın ortasına koyarsak orijinalin yerinden kayıyor, o yüzden
      // orijinal metnin etrafında tutuyoruz.
      const padX = t.w * 0.35;
      const padY = t.h * 0.25;
      const x = Math.max(b.x, t.x - padX);
      const y = Math.max(b.y, t.y - padY);
      const w = Math.min(b.x + b.w, t.x + t.w + padX) - x;
      const h = Math.min(b.y + b.h, t.y + t.h + padY) - y;
      this.area = { x: (x - b.x) / b.w, y: (y - b.y) / b.h, w: w / b.w, h: h / b.h };
      this.round = false;
    } else {
      // balonun çizgisine değmesin diye biraz içeriden
      const inset = input.round ? 0.08 : 0.05;
      this.area = { x: inset, y: inset, w: 1 - inset * 2, h: 1 - inset * 2 };
    }

    this.el.className = "box";
    this.el.style.setProperty("--d", `${index * 45}ms`);
    this.hl.className = "hl";
    this.hl.style.cssText = pct(t, 5);
    this.el.append(this.hl);

    // her orijinal satıra yumuşak kenarlı bir yama. bütün balonu kapatan oval
    // hiçbir zaman balonun çizgisine tam oturmuyordu
    const lines = input.lines.length ? input.lines : [t];
    for (const line of lines) {
      const wipe = document.createElement("div");
      wipe.className = "wipe";
      wipe.style.cssText = pct(line, 2) + `;background:${input.bg};box-shadow:0 0 3px 2px ${input.bg}`;
      this.el.append(wipe);
    }

    this.cover.className = "cover";
    this.cover.style.fontFamily = FONT_STACK;
    // siyah balonda yazı beyaz
    this.cover.style.color = input.dark ? "#fff" : "#111";
    const a = this.area;
    this.cover.style.left = a.x * 100 + "%";
    this.cover.style.top = a.y * 100 + "%";
    this.cover.style.width = a.w * 100 + "%";
    this.cover.style.height = a.h * 100 + "%";
    this.el.append(this.cover);
  }

  // offset: katmanın sayfadaki yeri, ekran koordinatını katman koordinatına çeviriyor
  place(offset: { x: number; y: number }) {
    const r = this.anchor.place();
    this.rect = r;
    this.el.hidden = !r;
    if (!r) return;
    this.el.style.translate = `${r.x - offset.x}px ${r.y - offset.y}px`;
    this.el.style.width = `${r.w}px`;
    this.el.style.height = `${r.h}px`;
    // yakınlaştırıldı ya da resim büyüdü: yazıyı yeni boyuta göre tekrar diz
    if (this.text && Math.abs(r.w - this.laidW) > 2) this.layout();
  }

  get done() {
    return this.el.classList.contains("done");
  }

  get failed() {
    return this.el.classList.contains("failed");
  }

  get peeking() {
    return this.el.classList.contains("peek");
  }

  peek() {
    this.el.classList.toggle("peek");
  }

  reset() {
    this.text = "";
    this.raw = "";
    this.el.classList.remove("done", "failed", "peek");
    this.cover.replaceChildren();
  }

  fail() {
    this.el.classList.add("failed");
  }

  fill(text: string, lang: string) {
    if (!text.trim()) {
      // bu kutuda çevrilecek bir şey yokmuş, sadece maviyi kaldır
      this.fail();
      return;
    }
    this.raw = text;
    this.lang = lang;
    if (lang === "tr") this.text = text.toLocaleUpperCase("tr");
    else this.text = text.toUpperCase();
    this.layout();
    this.el.classList.remove("failed", "peek");
    this.el.classList.add("done");
  }

  // font sonradan yüklenince ölçüler değişiyor, baştan dizmek lazım
  relayout() {
    if (this.text) this.layout();
  }

  layout() {
    const r = this.rect;
    if (!r) return;
    this.laidW = r.w;

    const w = r.w * this.area.w;
    const h = r.h * this.area.h;
    let shape;
    if (this.mask) shape = maskShape(this.mask.map(([l, rr]): [number, number] => [l * w, rr * w]), w, h);
    else if (this.round) shape = ellipseShape(w, h);
    else shape = rectShape(w, h);

    const fit = fitText(this.text, shape, measure, this.lang === "tr");
    const box = document.createElement("div");
    box.className = "lines";
    if (fit) {
      box.style.fontSize = `${fit.size}px`;
      box.style.lineHeight = `${fit.lineHeight}px`;
      fit.lines.forEach((line, i) => {
        // her satır kendi yerine: balon yamuksa satırlar da ona göre kayıyor
        const div = document.createElement("div");
        div.textContent = line.text;
        div.style.left = `${line.center}px`;
        div.style.top = `${fit.top + i * fit.lineHeight}px`;
        box.append(div);
      });
    } else {
      // balona hiç sığmıyor, hiç göstermemektense küçük göster
      box.classList.add("tiny");
      box.textContent = this.text;
    }
    this.cover.replaceChildren(box);
  }
}

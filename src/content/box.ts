import type { Rect, TranslateJob } from "../shared/messages";
import { Anchor } from "./anchor";
import { FONT_STACK, measure } from "./font";
import { fitText } from "./layout";

export interface BoxInput {
  id: number;
  bubble: Rect; // viewport CSS pixels
  text: Rect;
  lines: Rect[];
  round: boolean;
  bg: string;
  dark: boolean;
}

// One text area: a blue highlight while waiting, then the original lines painted over
// in the bubble's own color and the translation written on the real bubble.
export class Box {
  readonly id: number;
  readonly el = document.createElement("div");
  readonly round: boolean;
  private readonly hl = document.createElement("div");
  private readonly cover = document.createElement("div");
  private readonly anchor: Anchor;
  private text = "";
  private lang = "tr";
  private laidW = 0;
  rect: Rect | null = null;
  // the translation as it came in, before uppercasing (for the edit box)
  raw = "";
  // cache key from the background, so a hand fix can be saved
  key = "";

  // job: what gets sent for translation, in screenshot pixels
  constructor(input: BoxInput, index: number, public job: TranslateJob["regions"][number]) {
    this.id = input.id;
    this.round = input.round;
    this.anchor = new Anchor(input.bubble);

    const b = input.bubble;
    const pct = (r: Rect, pad: number) => {
      const x = Math.max(b.x, r.x - pad);
      const y = Math.max(b.y, r.y - pad);
      const w = Math.min(b.x + b.w, r.x + r.w + pad) - x;
      const h = Math.min(b.y + b.h, r.y + r.h + pad) - y;
      return `left:${((x - b.x) / b.w) * 100}%;top:${((y - b.y) / b.h) * 100}%;width:${(w / b.w) * 100}%;height:${(h / b.h) * 100}%`;
    };

    this.el.className = "box";
    this.el.style.setProperty("--d", `${index * 45}ms`);
    this.hl.className = "hl";
    this.hl.style.cssText = pct(input.text, 5);
    this.el.append(this.hl);

    // one soft patch per original line; a whole-bubble cover never lines up with the outline
    const lines = input.lines.length ? input.lines : [input.text];
    for (const line of lines) {
      const wipe = document.createElement("div");
      wipe.className = "wipe";
      wipe.style.cssText = pct(line, 2) + `;background:${input.bg};box-shadow:0 0 3px 2px ${input.bg}`;
      this.el.append(wipe);
    }

    this.cover.className = "cover";
    this.cover.style.fontFamily = FONT_STACK;
    // black bubbles have white letters
    this.cover.style.color = input.dark ? "#fff" : "#111";
    this.el.append(this.cover);
  }

  place() {
    const r = this.anchor.place();
    this.rect = r;
    this.el.hidden = !r;
    if (!r) return;
    this.el.style.translate = `${r.x}px ${r.y}px`;
    this.el.style.width = `${r.w}px`;
    this.el.style.height = `${r.h}px`;
    // zoomed or resized: lay the text out again for the new size
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
      // nothing to translate in this box, just drop the highlight
      this.fail();
      return;
    }
    this.raw = text;
    this.lang = lang;
    this.text = lang === "tr" ? text.toLocaleUpperCase("tr") : text.toUpperCase();
    this.layout();
    this.el.classList.remove("failed", "peek");
    this.el.classList.add("done");
  }

  private layout() {
    const r = this.rect;
    if (!r) return;
    this.laidW = r.w;

    // stay off the bubble's outline
    const inset = this.round ? 0.08 : 0.05;
    const w = r.w * (1 - inset * 2);
    const h = r.h * (1 - inset * 2);
    this.cover.style.inset = `${inset * 100}%`;

    const fit = fitText(this.text, w, h, this.round, measure, this.lang === "tr");
    const lines = document.createElement("div");
    lines.className = "lines";
    if (fit) {
      lines.style.fontSize = `${fit.size}px`;
      lines.style.lineHeight = `${fit.lineHeight}px`;
      for (const line of fit.lines) {
        const div = document.createElement("div");
        div.textContent = line;
        lines.append(div);
      }
    } else {
      // way too long for the bubble, show it small rather than not at all
      lines.style.fontSize = "7px";
      lines.style.lineHeight = "8px";
      lines.textContent = this.text;
    }
    this.cover.replaceChildren(lines);
  }
}

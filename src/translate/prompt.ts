import type { Rect, TranslateJob } from "../shared/messages";
import { LANGS } from "../shared/settings";

// smaller image = fewer input tokens = faster answer, bubble text is still readable
const MAX_SIDE = 1280;

export interface Extras {
  terms: string; // series glossary, "a = b" lines
  recent: string[]; // last lines translated in this series
  honorifics: "keep" | "adapt";
}

// Crops the part of the screen that has text on it and draws numbered boxes on it,
// so the model can answer per box.
export async function buildRequest(shot: ImageBitmap, job: TranslateJob, extras: Extras) {
  const all = job.regions.map((r) => r.bubble);
  let x0 = Math.min(...all.map((r) => r.x)) - 60;
  let y0 = Math.min(...all.map((r) => r.y)) - 60;
  let x1 = Math.max(...all.map((r) => r.x + r.w)) + 60;
  let y1 = Math.max(...all.map((r) => r.y + r.h)) + 60;
  x0 = Math.max(0, x0);
  y0 = Math.max(0, y0);
  x1 = Math.min(shot.width, x1);
  y1 = Math.min(shot.height, y1);

  const k = Math.min(1, MAX_SIDE / Math.max(x1 - x0, y1 - y0));
  const w = Math.round((x1 - x0) * k);
  const h = Math.round((y1 - y0) * k);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(shot, x0, y0, x1 - x0, y1 - y0, 0, 0, w, h);

  const map = (r: Rect) => ({ x: (r.x - x0) * k, y: (r.y - y0) * k, w: r.w * k, h: r.h * k });
  const line = Math.max(2, Math.round(w / 500));
  ctx.font = `bold ${Math.max(12, line * 7)}px sans-serif`;
  job.regions.forEach((r, i) => {
    const b = map(r.text);
    ctx.strokeStyle = "#ff1f4b";
    ctx.lineWidth = line;
    ctx.strokeRect(b.x - line * 2, b.y - line * 2, b.w + line * 4, b.h + line * 4);

    const label = String(i + 1);
    const tw = ctx.measureText(label).width + line * 4;
    const th = line * 9;
    const lx = Math.max(0, b.x - line * 2 - tw);
    const ly = Math.max(0, b.y - line * 2 - th / 2);
    ctx.fillStyle = "#ff1f4b";
    ctx.fillRect(lx, ly, tw, th);
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "middle";
    ctx.fillText(label, lx + line * 2, ly + th / 2);
  });

  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
  const image = toBase64(new Uint8Array(await blob.arrayBuffer()));
  return { image, prompt: promptText(job, extras) };
}

export function promptText(job: TranslateJob, extras: Extras) {
  const target = LANGS[job.target] ?? job.target;
  const source = job.source === "auto" ? "Detect it yourself." : `${LANGS[job.source] ?? job.source}.`;
  const boxes = job.regions.map((r, i) => `${i + 1}: max ${r.limit} characters`).join("\n");

  const honorifics =
    extras.honorifics === "keep"
      ? "Keep Japanese honorifics as they are (-san, -kun, -chan, senpai, sensei)."
      : `Turn Japanese honorifics into natural ${target} forms of address instead of keeping -san, -kun etc.`;

  let context = "";
  if (extras.terms.trim()) {
    context += `\nAlways translate these names and terms exactly like this:\n${extras.terms.trim()}\n`;
  }
  if (extras.recent.length) {
    context += `\nThe previous lines of this story, already translated (for tone and context only, don't translate them again):\n${extras.recent.map((l) => "- " + l).join("\n")}\n`;
  }

  return `This is part of a manga / comic page. Every red box with a number marks one text area (a speech bubble or a caption).
Source language: ${source}
Translate the text in every box into ${target}.

Rules:
- Read only the text inside the box. Words split across lines with a hyphen are one word, join them. Japanese can be vertical, read it right to left.
- Translate like a good fan translation: natural, spoken ${target} that fits the scene and the speaker's tone.
- ${honorifics}
- Stay under each box's character limit, shorten if you have to.
- If a box has no real text in it, return an empty "text".
${context}
Answer with one JSON object per line and nothing else, in box order:
{"id": 1, "text": "translation"}

If a character or place name shows up that is not in the list above, add one more line for it after the boxes:
{"name": "name as written", "as": "how you wrote it in ${target}"}

Boxes:
${boxes}`;
}

function toBase64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

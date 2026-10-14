import type { Rect, ScanResult } from "../shared/messages";
import { findBubbles } from "./heuristic";

// full-res retina shots are slow to label and gain nothing
const MAX_WIDTH = 1400;

export function analyze(shot: ImageBitmap): ScanResult {
  const scale = Math.min(1, MAX_WIDTH / shot.width);
  const w = Math.round(shot.width * scale);
  const h = Math.round(shot.height * scale);

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2d context unavailable");
  ctx.drawImage(shot, 0, 0, w, h);

  const found = findBubbles(ctx.getImageData(0, 0, w, h));
  // manga reads top to bottom, right to left
  found.sort((a, b) => a.text.y - b.text.y || b.text.x - a.text.x);

  const regions = found.map((d, id) => ({
    id,
    bubble: unscale(d.bubble, scale),
    text: unscale(d.text, scale),
    lines: d.lines.map((l) => unscale(l, scale)),
    round: d.round,
    bg: d.bg,
    dark: d.dark,
  }));

  return { width: shot.width, height: shot.height, regions };
}

function unscale(r: Rect, scale: number): Rect {
  return { x: r.x / scale, y: r.y / scale, w: r.w / scale, h: r.h / scale };
}

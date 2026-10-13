import type { Rect } from "../shared/messages";

// Translations are cached by what the text area looks like, so going back a page
// or rescanning shows them instantly without another API call.

export async function regionHash(shot: ImageBitmap, r: Rect) {
  const w = 48;
  const h = 24;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(shot, r.x, r.y, r.w, r.h, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;

  // coarse gray levels so a one-pixel scroll offset still gives the same key
  const bytes = new Uint8Array(w * h);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]) / 3 >> 5;
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function cacheGet(keys: string[]): Promise<Record<string, string>> {
  const got = await chrome.storage.local.get(keys.map((k) => "t:" + k));
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = got["t:" + k];
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

// TODO: prune old entries at some point, storage.local has a 10MB limit
export function cacheSet(key: string, text: string) {
  return chrome.storage.local.set({ ["t:" + key]: text });
}

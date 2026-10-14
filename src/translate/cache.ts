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

// entries are { t: text, at: last used }, older versions stored the plain string
type Entry = string | { t: string; at: number };

const textOf = (v: Entry) => (typeof v === "string" ? v : v.t);

export async function cacheGet(keys: string[]): Promise<Record<string, string>> {
  const got = await chrome.storage.local.get(keys.map((k) => "t:" + k));
  const out: Record<string, string> = {};
  const touched: Record<string, Entry> = {};
  for (const k of keys) {
    const v = got["t:" + k] as Entry | undefined;
    if (v === undefined) continue;
    out[k] = textOf(v);
    touched["t:" + k] = { t: textOf(v), at: Date.now() };
  }
  // used again, so it shouldn't be the first thing pruned
  if (Object.keys(touched).length) void chrome.storage.local.set(touched);
  return out;
}

export function cacheSet(key: string, text: string) {
  return chrome.storage.local.set({ ["t:" + key]: { t: text, at: Date.now() } });
}

// storage.local has a 10MB limit, a few thousand bubbles is nowhere near it
// but this keeps it from growing forever
const MAX_ENTRIES = 5000;

export async function pruneCache() {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith("t:"));
  if (keys.length <= MAX_ENTRIES) return;

  const at = (k: string) => {
    const v = all[k] as Entry;
    return typeof v === "string" ? 0 : v.at;
  };
  keys.sort((a, b) => at(a) - at(b));
  await chrome.storage.local.remove(keys.slice(0, keys.length - MAX_ENTRIES * 0.8));
}

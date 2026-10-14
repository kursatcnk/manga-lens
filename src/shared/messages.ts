export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Region {
  id: number;
  bubble: Rect; // white area the text sits in, screenshot pixels
  text: Rect;
  lines: Rect[];
  round: boolean;
  bg: string;
  dark: boolean; // white text on a black bubble
}

export interface ScanResult {
  width: number;
  height: number;
  regions: Region[];
}

export interface Prefs {
  target: string;
  auto: boolean;
  logo: "auto" | "always" | "never";
  hiddenSites: string[];
}

export interface Glossary {
  // one "original = translation" per line, written by hand or learned from the model
  terms: string;
  // last few translated lines, so the next page keeps the same voice
  recent: string[];
}

export type Request =
  | { type: "capture" }
  | { type: "detect" }
  | { type: "options" }
  | { type: "prefs" }
  | { type: "save-prefs"; prefs: Partial<Prefs> }
  | { type: "glossary"; series: string }
  | { type: "save-glossary"; series: string; terms: string }
  | { type: "remember"; key: string; text: string };

export type TabMessage = { type: "toggle" };

export type Reply<T> = { ok: true; data: T } | { ok: false; error: string };

// over the "translate" port
export interface TranslateJob {
  regions: { id: number; text: Rect; bubble: Rect; limit: number }[];
  source: string;
  target: string;
  series: string;
  // skip the cache, used by "translate this bubble again"
  fresh?: boolean;
}

export type ErrorCode = "no-key" | "auth" | "rate" | "refusal" | "other";

export type PortMessage =
  | { type: "item"; id: number; text: string; key: string }
  | { type: "done"; missing: number[] }
  | { type: "error"; code: ErrorCode; message: string };

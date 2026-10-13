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
  round: boolean;
  bg: string;
}

export interface ScanResult {
  width: number;
  height: number;
  regions: Region[];
}

export interface Prefs {
  target: string;
  auto: boolean;
}

export type Request =
  | { type: "capture" }
  | { type: "detect" }
  | { type: "options" }
  | { type: "prefs" }
  | { type: "save-prefs"; prefs: Partial<Prefs> };

export type TabMessage = { type: "toggle" };

export type Reply<T> = { ok: true; data: T } | { ok: false; error: string };

// over the "translate" port
export interface TranslateJob {
  regions: { id: number; text: Rect; bubble: Rect; limit: number }[];
  source: string;
  target: string;
}

export type ErrorCode = "no-key" | "auth" | "rate" | "refusal" | "other";

export type PortMessage =
  | { type: "item"; id: number; text: string }
  | { type: "done"; missing: number[] }
  | { type: "error"; code: ErrorCode; message: string };

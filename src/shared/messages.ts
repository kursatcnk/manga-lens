export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Region {
  id: number;
  bubble: Rect; // yazının içinde durduğu beyaz alan, ekran görüntüsü pikseli
  text: Rect;
  lines: Rect[];
  round: boolean;
  bg: string;
  dark: boolean; // siyah balonda beyaz yazı
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
  // her satırda bir "orijinal = çeviri", elle yazılmış ya da modelden öğrenilmiş
  terms: string;
  // son çevrilen birkaç satır, sonraki sayfa aynı tonda devam etsin
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

// "translate" portundan gidiyor
export interface TranslateJob {
  regions: { id: number; text: Rect; bubble: Rect; limit: number }[];
  source: string;
  target: string;
  series: string;
  // önbelleği atla, "bu balonu tekrar çevir" için
  fresh?: boolean;
}

export type ErrorCode = "no-key" | "auth" | "rate" | "refusal" | "other";

export type PortMessage =
  | { type: "item"; id: number; text: string; key: string }
  | { type: "done"; missing: number[] }
  | { type: "error"; code: ErrorCode; message: string };

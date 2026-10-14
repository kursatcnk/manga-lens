import type { Measure } from "./layout";

const NAME = "Manga Lens Comic";
export const FONT_STACK = `"${NAME}", "Comic Sans MS", "Segoe UI", sans-serif`;

// Comic Relief (OFL): Türkçe harfler latin-ext dosyasında, ı ise latin dosyasında
const FILES: [string, string][] = [
  ["comic-relief-latin-700-normal.woff2", "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"],
  ["comic-relief-latin-ext-700-normal.woff2", "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF"],
];

let loading: Promise<void> | null = null;

// shadow root içindeki @font-face çalışmıyor, o yüzden fontu sayfanın FontFaceSet'ine ekliyoruz.
// byte olarak yüklüyoruz ki sayfanın CSP'si engellemesin.
export function loadFont() {
  loading ??= (async () => {
    try {
      for (const [file, range] of FILES) {
        const res = await fetch(chrome.runtime.getURL(`fonts/${file}`));
        const face = new FontFace(NAME, await res.arrayBuffer(), { weight: "700", unicodeRange: range });
        await face.load();
        document.fonts.add(face);
      }
    } catch (err) {
      console.warn("[manga-lens] font failed, using fallback", err);
    }
  })();
  return loading;
}

const ctx = document.createElement("canvas").getContext("2d")!;

export const measure: Measure = (text, size) => {
  ctx.font = `700 ${size}px ${FONT_STACK}`;
  return ctx.measureText(text).width;
};

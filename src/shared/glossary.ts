import type { Glossary } from "./messages";

// Sayfa hangi seriye ait. Okuyucular bölüm/sayfa numarasını adrese koyuyor,
// rakam olan kısımları atınca seri kalıyor:
//   site.com/manga/bir-seri/chapter-12/3  ->  site.com/manga/bir-seri
// Kusursuz değil (bazı siteler seriyi de numarayla tutuyor) ama bölümler arasında
// isimleri aynı tutmaya yetiyor.
export function seriesKey(url: string) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter((p) => p && !/\d/.test(p)).slice(0, 3);
    return [u.hostname.replace(/^www\./, ""), ...parts].join("/");
  } catch {
    return url;
  }
}

// "Akira-san = Akira Abi" satırları -> çiftler, geri kalanı yok sayılıyor
export function parseTerms(text: string): [string, string][] {
  const out: [string, string][] = [];
  for (const line of text.split("\n")) {
    const i = line.indexOf("=");
    if (i < 0) continue;
    const a = line.slice(0, i).trim();
    const b = line.slice(i + 1).trim();
    if (a && b) out.push([a, b]);
  }
  return out;
}

// modelin bulduğu isimleri ekliyor, kullanıcının yazdığının üstüne yazmıyor
export function addTerms(text: string, found: [string, string][]) {
  const known = new Set(parseTerms(text).map(([a]) => a.toLowerCase()));
  const lines = text.trim() ? [text.trim()] : [];
  for (const [a, b] of found) {
    if (!a || !b || known.has(a.toLowerCase())) continue;
    known.add(a.toLowerCase());
    lines.push(`${a} = ${b}`);
  }
  return lines.join("\n");
}

const EMPTY: Glossary = { terms: "", recent: [] };

export async function loadGlossary(series: string): Promise<Glossary> {
  const key = "g:" + series;
  const got = await chrome.storage.local.get(key);
  return { ...EMPTY, ...(got[key] as Partial<Glossary> | undefined) };
}

export async function saveGlossary(series: string, g: Glossary) {
  await chrome.storage.local.set({ ["g:" + series]: g });
}

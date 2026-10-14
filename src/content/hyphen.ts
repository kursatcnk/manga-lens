const VOWELS = "aeıioöuüâîûAEIİOÖUÜÂÎÛ";

// Türkçe heceleme: her hecede bir sesli harf var, iki sesli arasında sessizler
// varsa sadece sonuncusu sonraki heceye geçiyor (TÜRK-ÇE, GÖZ-LE-Rİ).
export function syllables(word: string): string[] {
  const vowels: number[] = [];
  for (let i = 0; i < word.length; i++) {
    if (VOWELS.includes(word[i])) vowels.push(i);
  }
  if (vowels.length < 2) return [word];

  const parts: string[] = [];
  let start = 0;
  for (let k = 1; k < vowels.length; k++) {
    const between = vowels[k] - vowels[k - 1] - 1;
    const cut = between === 0 ? vowels[k] : vowels[k] - 1;
    parts.push(word.slice(start, cut));
    start = cut;
  }
  parts.push(word.slice(start));
  return parts;
}

// Kelimeyi satır sonunda bölmenin yolları, önce en uzun baş kısım.
// İki tarafta da en az iki harf kalsın, "A-" ya da "-N" çok kötü duruyor.
export function splits(word: string): [string, string][] {
  if (word.includes("-")) {
    const i = word.indexOf("-");
    return i > 0 && i < word.length - 1 ? [[word.slice(0, i + 1), word.slice(i + 1)]] : [];
  }
  const parts = syllables(word);
  const out: [string, string][] = [];
  for (let p = parts.length - 1; p >= 1; p--) {
    const head = parts.slice(0, p).join("");
    const tail = parts.slice(p).join("");
    if (letters(head) >= 2 && letters(tail) >= 2) out.push([head + "-", tail]);
  }
  return out;
}

function letters(s: string) {
  return s.replace(/[^\p{L}]/gu, "").length;
}

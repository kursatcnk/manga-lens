// Kabaca harcama takibi. Kullanıcı kendi anahtarıyla ödüyor, bir sayfanın ne
// tuttuğunu sağlayıcının paneline girmeden görebilsin.

// milyon token başına dolar [girdi, çıktı]
// Gemini 3.8 Flash'ın 2026 sonuna kadar tanıtım fiyatı var, sonra iki katına çıkıyor
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
  "gemini-3.8-flash": [0.75, 3.75],
  "gemini-3.5-flash-lite": [0.3, 2.5],
};

export interface ModelUsage {
  requests: number;
  bubbles: number;
  input: number;
  output: number;
}

// ay ("2026-10") -> model -> kullanım
export type UsageLog = Record<string, Record<string, ModelUsage>>;

export function costOf(model: string, u: ModelUsage) {
  const p = PRICES[model];
  if (!p) return null;
  return (u.input * p[0] + u.output * p[1]) / 1_000_000;
}

export function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function loadUsage(): Promise<UsageLog> {
  const { usage } = await chrome.storage.local.get("usage");
  return (usage as UsageLog | undefined) ?? {};
}

// iki istek aynı anda biterse ikisi de eski değeri okuyabilir,
// o yüzden yazmalar tek bir promise zincirinden geçiyor
let queue = Promise.resolve();

export function addUsage(model: string, input: number, output: number, bubbles: number) {
  queue = queue.then(async () => {
    const log = await loadUsage();
    const month = (log[monthKey()] ??= {});
    const u = (month[model] ??= { requests: 0, bubbles: 0, input: 0, output: 0 });
    u.requests++;
    u.bubbles += bubbles;
    u.input += input;
    u.output += output;
    await chrome.storage.local.set({ usage: log });
  }).catch(() => {});
  return queue;
}

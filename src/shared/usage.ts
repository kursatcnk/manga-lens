// Rough spending tracker. The user pays with their own key, so they should see
// what a page costs without opening the provider's console.

// USD per million tokens [input, output]
// Gemini 3.8 Flash has an intro price until the end of 2026, it doubles after that
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

// month ("2026-10") -> model -> usage
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

// two requests finishing together could both read the old value,
// so writes go through one promise chain
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

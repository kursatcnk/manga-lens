export type Provider = "claude" | "gemini";

export interface Settings {
  provider: Provider;
  claudeKey: string;
  claudeModel: string;
  geminiKey: string;
  geminiModel: string;
  target: string;
  auto: boolean;
  logo: "auto" | "always" | "never";
  hiddenSites: string[];
  // -san, -kun, senpai... keep them as they are or turn them into Turkish
  honorifics: "keep" | "adapt";
}

// first one is the default; for reading, speed matters more than the last bit of quality
export const CLAUDE_MODELS = ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"];
export const GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.8-flash"];

export const MODEL_NOTES: Record<string, string> = {
  "claude-haiku-5-5": "en hızlı, en ucuz",
  "claude-sonnet-5-5": "dengeli",
  "claude-opus-5-5": "en kaliteli, yavaş",
  "gemini-3.5-flash-lite": "en hızlı, en ucuz",
  "gemini-3.8-flash": "daha kaliteli",
};

export const LANGS: Record<string, string> = {
  tr: "Turkish",
  en: "English",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
};

const DEFAULTS: Settings = {
  provider: "claude",
  claudeKey: "",
  claudeModel: CLAUDE_MODELS[0],
  geminiKey: "",
  geminiModel: GEMINI_MODELS[0],
  target: "tr",
  auto: false,
  logo: "auto",
  hiddenSites: [],
  honorifics: "keep",
};

export async function loadSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get("settings");
  return { ...DEFAULTS, ...(settings as Partial<Settings> | undefined) };
}

export async function saveSettings(patch: Partial<Settings>) {
  const current = await loadSettings();
  await chrome.storage.local.set({ settings: { ...current, ...patch } });
}

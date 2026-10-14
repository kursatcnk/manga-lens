import Anthropic from "@anthropic-ai/sdk";
import type { ErrorCode } from "../shared/messages";
import type { Settings } from "../shared/settings";

export class TranslateError extends Error {
  constructor(readonly code: ErrorCode, message: string) {
    super(message);
  }
}

type OnText = (chunk: string) => void;

export function apiKey(s: Settings) {
  return s.provider === "claude" ? s.claudeKey : s.geminiKey;
}

export async function streamTranslation(s: Settings, image: string, prompt: string, onText: OnText, signal: AbortSignal) {
  if (!apiKey(s)) throw new TranslateError("no-key", "API key missing");
  if (s.provider === "gemini") return gemini(s, image, prompt, onText, signal);
  return claude(s, image, prompt, onText, signal);
}

async function claude(s: Settings, image: string, prompt: string, onText: OnText, signal: AbortSignal) {
  // the key belongs to the user and never leaves their browser except to the API
  const client = new Anthropic({ apiKey: s.claudeKey, dangerouslyAllowBrowser: true });

  // Translating bubbles needs no thinking, and thinking is most of the wait.
  // Haiku can turn it off, Sonnet does it with between_tools, Opus can't, so it gets
  // low effort plus the server-side fallback (the other two can't use that here).
  const model = s.claudeModel;
  // loosely typed, the installed SDK types don't know between_tools yet
  const extra: Record<string, unknown> = model.includes("haiku")
    ? { thinking: { type: "disabled" } }
    : model.includes("sonnet")
      ? { thinking: { type: "between_tools" } }
      : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };

  try {
    const stream = client.beta.messages.stream(
      {
        model,
        max_tokens: 4000,
        output_config: { effort: "low" },
        ...extra,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
              { type: "text", text: prompt },
            ],
          },
        ],
      },
      { signal },
    );
    stream.on("text", (t) => onText(t));
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal") throw new TranslateError("refusal", "The model declined this page");
  } catch (err) {
    if (err instanceof TranslateError) throw err;
    if (err instanceof Anthropic.AuthenticationError) throw new TranslateError("auth", "Invalid Claude API key");
    if (err instanceof Anthropic.RateLimitError) throw new TranslateError("rate", "Rate limited");
    if (err instanceof Anthropic.APIError) throw new TranslateError("other", `Claude ${err.status}: ${err.message}`);
    throw err;
  }
}

async function gemini(s: Settings, image: string, prompt: string, onText: OnText, signal: AbortSignal) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${s.geminiModel}:streamGenerateContent?alt=sse`;
  const res = await fetch(url, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", "x-goog-api-key": s.geminiKey },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ inline_data: { mime_type: "image/jpeg", data: image } }, { text: prompt }],
        },
      ],
      // default is "high", which is slow and pointless for translating bubbles
      generationConfig: { thinkingConfig: { thinkingLevel: "low" } },
    }),
  });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403 || body.includes("API_KEY_INVALID")) {
      throw new TranslateError("auth", "Invalid Gemini API key");
    }
    if (res.status === 429) throw new TranslateError("rate", "Rate limited");
    throw new TranslateError("other", `Gemini ${res.status}: ${body.slice(0, 200)}`);
  }

  // server-sent events, every "data:" line is a JSON chunk
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      try {
        const chunk = JSON.parse(line.slice(5));
        const cand = chunk.candidates?.[0];
        const parts: { text?: string }[] = cand?.content?.parts ?? [];
        const text = parts.map((p) => p.text ?? "").join("");
        if (text) onText(text);
        if (cand?.finishReason === "SAFETY" || cand?.finishReason === "PROHIBITED_CONTENT") {
          throw new TranslateError("refusal", "The model declined this page");
        }
      } catch (err) {
        if (err instanceof TranslateError) throw err;
      }
    }
  }
}

import { CLAUDE_MODELS, GEMINI_MODELS, loadSettings, saveSettings, type Provider } from "../shared/settings";

const form = document.querySelector<HTMLFormElement>("#form")!;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const claudeKey = $<HTMLInputElement>("claudeKey");
const geminiKey = $<HTMLInputElement>("geminiKey");
const claudeModel = $<HTMLSelectElement>("claudeModel");
const geminiModel = $<HTMLSelectElement>("geminiModel");
const target = $<HTMLSelectElement>("target");
const auto = $<HTMLInputElement>("auto");
const saved = $("saved");

claudeModel.append(...CLAUDE_MODELS.map((m) => new Option(m, m)));
geminiModel.append(...GEMINI_MODELS.map((m) => new Option(m, m)));

function provider(): Provider {
  return (form.querySelector<HTMLInputElement>('input[name="provider"]:checked')?.value as Provider) ?? "claude";
}

function showProvider() {
  document.querySelectorAll<HTMLElement>("[data-for]").forEach((el) => {
    el.hidden = el.dataset.for !== provider();
  });
}

form.addEventListener("change", (e) => {
  if ((e.target as HTMLInputElement).name === "provider") showProvider();
  saved.hidden = true;
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  await saveSettings({
    provider: provider(),
    claudeKey: claudeKey.value.trim(),
    claudeModel: claudeModel.value,
    geminiKey: geminiKey.value.trim(),
    geminiModel: geminiModel.value,
    target: target.value,
    auto: auto.checked,
  });
  saved.hidden = false;
});

const s = await loadSettings();
form.querySelector<HTMLInputElement>(`input[name="provider"][value="${s.provider}"]`)!.checked = true;
claudeKey.value = s.claudeKey;
geminiKey.value = s.geminiKey;
claudeModel.value = s.claudeModel;
geminiModel.value = s.geminiModel;
target.value = s.target;
auto.checked = s.auto;
showProvider();

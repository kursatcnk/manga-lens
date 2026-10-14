import { CLAUDE_MODELS, GEMINI_MODELS, MODEL_NOTES, loadSettings, saveSettings, type Provider, type Settings } from "../shared/settings";
import { costOf, loadUsage, monthKey } from "../shared/usage";

const form = document.querySelector<HTMLFormElement>("#form")!;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const claudeKey = $<HTMLInputElement>("claudeKey");
const geminiKey = $<HTMLInputElement>("geminiKey");
const claudeModel = $<HTMLSelectElement>("claudeModel");
const geminiModel = $<HTMLSelectElement>("geminiModel");
const target = $<HTMLSelectElement>("target");
const honorifics = $<HTMLSelectElement>("honorifics");
const auto = $<HTMLInputElement>("auto");
const logo = $<HTMLSelectElement>("logo");
const sites = $<HTMLUListElement>("sites");
const saved = $("saved");

const label = (m: string) => (MODEL_NOTES[m] ? `${m} (${MODEL_NOTES[m]})` : m);
claudeModel.append(...CLAUDE_MODELS.map((m) => new Option(label(m), m)));
geminiModel.append(...GEMINI_MODELS.map((m) => new Option(label(m), m)));

let hiddenSites: string[] = [];

function provider(): Provider {
  return (form.querySelector<HTMLInputElement>('input[name="provider"]:checked')?.value as Provider) ?? "claude";
}

function showProvider() {
  document.querySelectorAll<HTMLElement>("[data-for]").forEach((el) => {
    el.hidden = el.dataset.for !== provider();
  });
}

function showSites() {
  $("sitesBox").hidden = !hiddenSites.length;
  sites.replaceChildren(
    ...hiddenSites.map((site) => {
      const li = document.createElement("li");
      li.textContent = site;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Tekrar göster";
      btn.addEventListener("click", async () => {
        hiddenSites = hiddenSites.filter((s) => s !== site);
        await saveSettings({ hiddenSites });
        showSites();
      });
      li.append(btn);
      return li;
    }),
  );
}

async function showUsage() {
  const log = await loadUsage();
  const month = log[monthKey()] ?? {};
  const body = document.querySelector("#usage tbody")!;
  const rows = Object.entries(month);
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="5">Bu ay henüz çeviri yok.</td></tr>`;
    return;
  }
  let total = 0;
  body.replaceChildren(
    ...rows.map(([model, u]) => {
      const cost = costOf(model, u);
      if (cost !== null) total += cost;
      const tr = document.createElement("tr");
      for (const cell of [
        model,
        String(u.requests),
        String(u.bubbles),
        `${u.input.toLocaleString("tr")} / ${u.output.toLocaleString("tr")}`,
        cost === null ? "?" : `$${cost.toFixed(cost < 1 ? 3 : 2)}`,
      ]) {
        const td = document.createElement("td");
        td.textContent = cell;
        tr.append(td);
      }
      return tr;
    }),
  );
  if (rows.length > 1) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><b>Toplam</b></td><td></td><td></td><td></td><td><b>$${total.toFixed(2)}</b></td>`;
    body.append(tr);
  }
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
    honorifics: honorifics.value as Settings["honorifics"],
    auto: auto.checked,
    logo: logo.value as Settings["logo"],
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
honorifics.value = s.honorifics;
auto.checked = s.auto;
logo.value = s.logo;
hiddenSites = s.hiddenSites;
showProvider();
showSites();
void showUsage();

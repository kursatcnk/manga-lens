// sahte chrome api'si content script'ten önce yüklenmeli
import { loadFixture } from "./chrome-shim";
import "../src/content/index";

const pick = document.querySelector<HTMLSelectElement>("#pick")!;
const img = document.querySelector<HTMLImageElement>("#page")!;
const params = new URLSearchParams(location.search);

const show = async () => {
  await loadFixture(pick.value);
  img.src = `pages/${encodeURIComponent(pick.value)}`;
  params.set("page", pick.value);
  history.replaceState(null, "", "?" + params.toString());
};
pick.addEventListener("change", () => void show());

// ekran görüntüsü almak için adres satırından:
// ?y=500   -> resmi o kadar yukarı it (headless çekimde kaydırmak görüntüyü bozuyor)
// ?scan=1  -> resim yüklenince taramayı kendisi başlatsın
// ?dict=1  -> çeviriler bitince sözlük panelini aç
// ?chip=1  -> çeviriler bitince ilk balonun düğmelerini göster
// ?clean=1 -> üstteki sayfa seçme çubuğunu gizle
if (params.has("clean")) document.querySelector("header")!.hidden = true;
img.addEventListener("load", () => {
  const y = Number(params.get("y") || 0);
  if (y) img.style.marginTop = `${-y}px`;
  if (!params.has("scan")) return;
  setTimeout(() => {
    const lens = window.__mangaLens as unknown as
      | { toggle(): void; openGlossary(): Promise<void>; showChip(b: unknown): void; boxes: { done: boolean }[] }
      | undefined;
    lens?.toggle();
    if (params.has("dict")) setTimeout(() => void lens?.openGlossary(), 3500);
    if (params.has("chip")) setTimeout(() => lens?.showChip(lens.boxes.find((b) => b.done)), 3500);
  }, 300);
});

void (async () => {
  const pages: string[] = await (await fetch("pages.json")).json();
  pick.replaceChildren(...pages.map((p) => new Option(p, p)));

  const initial = params.get("page");
  if (initial && pages.includes(initial)) pick.value = initial;
  if (pages.length) await show();
  else document.body.insertAdjacentHTML("beforeend", "<p>dev/pages klasörüne test görseli koy.</p>");
})();

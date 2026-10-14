import { analyze } from "./detect/analyze";
import { loadGlossary, saveGlossary } from "./shared/glossary";
import type { PortMessage, Prefs, Reply, Request, TabMessage, TranslateJob } from "./shared/messages";
import { loadSettings, saveSettings } from "./shared/settings";
import { cacheSet, pruneCache } from "./translate/cache";
import { translate } from "./translate/run";

// Çekim ve tespit ayrı mesajlar, böylece sayfa ekran görüntüsü alınır alınmaz
// animasyonu başlatabiliyor ve animasyon görüntüye girmiyor.
let lastShot: ImageBitmap | null = null;

chrome.runtime.onMessage.addListener((msg: Request, sender, sendResponse: (reply: Reply<unknown>) => void) => {
  handle(msg, sender)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  return true;
});

async function handle(msg: Request, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (msg.type) {
    case "capture": {
      if (!sender.tab) throw new Error("no tab");
      const url = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" });
      // eski bitmap'i kapatmıyoruz, bir çeviri hâlâ onu okuyor olabilir
      lastShot = await createImageBitmap(await (await fetch(url)).blob());
      return null;
    }
    case "detect": {
      if (!lastShot) throw new Error("no capture");
      return analyze(lastShot);
    }
    case "options":
      await chrome.runtime.openOptionsPage();
      return null;
    case "prefs": {
      const s = await loadSettings();
      const prefs: Prefs = { target: s.target, auto: s.auto, logo: s.logo, hiddenSites: s.hiddenSites };
      return prefs;
    }
    case "save-prefs":
      await saveSettings(msg.prefs);
      return null;
    case "glossary":
      return loadGlossary(msg.series);
    case "save-glossary": {
      const g = await loadGlossary(msg.series);
      await saveGlossary(msg.series, { ...g, terms: msg.terms });
      return null;
    }
    case "remember":
      // kullanıcı balonu elle düzeltti, bir dahakine modelinkinden önce bu gelsin
      await cacheSet(msg.key, msg.text);
      return null;
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "translate") return;
  const ctrl = new AbortController();
  port.onDisconnect.addListener(() => ctrl.abort());

  const send = (m: PortMessage) => {
    if (ctrl.signal.aborted) return;
    try {
      port.postMessage(m);
    } catch {
      ctrl.abort();
    }
  };

  port.onMessage.addListener((job: TranslateJob) => {
    const shot = lastShot;
    if (!shot) {
      send({ type: "error", code: "other", message: "no capture" });
      return;
    }
    void translate(shot, job, send, ctrl.signal);
  });
});

function toggle(tabId: number | undefined) {
  if (tabId === undefined) return;
  const msg: TabMessage = { type: "toggle" };
  chrome.tabs.sendMessage(tabId, msg).catch(() => {
    // kurulumdan önce açılan sekmelerde yenilenene kadar content script yok
  });
}

chrome.action.onClicked.addListener((tab) => toggle(tab.id));
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "scan") toggle(tab?.id);
});

chrome.runtime.onStartup.addListener(() => void pruneCache());

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== "install") return;
  // ilk kurulum: hemen API anahtarı iste
  const s = await loadSettings();
  if (!s.claudeKey && !s.geminiKey) void chrome.runtime.openOptionsPage();
});

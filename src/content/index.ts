import type { TabMessage } from "../shared/messages";
import { Lens } from "./lens";

declare global {
  interface Window {
    __mangaLens?: Lens;
  }
}

// eklenti yenilenince script iki kere yüklenebiliyor
if (!window.__mangaLens) {
  const lens = new Lens();
  window.__mangaLens = lens;
  chrome.runtime.onMessage.addListener((msg: TabMessage) => {
    if (msg.type === "toggle") lens.toggle();
  });
}

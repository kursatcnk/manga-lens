import type { TabMessage } from "../shared/messages";
import { Lens } from "./lens";

declare global {
  interface Window {
    __mangaLens?: Lens;
  }
}

// the script can be injected twice when the extension reloads
if (!window.__mangaLens) {
  const lens = new Lens();
  window.__mangaLens = lens;
  chrome.runtime.onMessage.addListener((msg: TabMessage) => {
    if (msg.type === "toggle") lens.toggle();
  });
}

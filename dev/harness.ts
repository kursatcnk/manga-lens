// the shim has to be in place before the content script runs
import "./chrome-shim";
import "../src/content/index";

const pick = document.querySelector<HTMLSelectElement>("#pick")!;
const img = document.querySelector<HTMLImageElement>("#page")!;

const show = () => {
  img.src = `pages/${encodeURIComponent(pick.value)}`;
  history.replaceState(null, "", `?page=${encodeURIComponent(pick.value)}`);
};
pick.addEventListener("change", show);

void (async () => {
  const pages: string[] = await (await fetch("pages.json")).json();
  pick.replaceChildren(...pages.map((p) => new Option(p, p)));

  const initial = new URLSearchParams(location.search).get("page");
  if (initial && pages.includes(initial)) pick.value = initial;
  if (pages.length) show();
  else document.body.insertAdjacentHTML("beforeend", "<p>dev/pages klasörüne test görseli koy.</p>");
})();

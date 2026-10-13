import * as esbuild from "esbuild";
import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";

const args = new Set(process.argv.slice(2));
const dev = args.has("--dev");
const watch = args.has("--watch") || dev;

const FONTS = ["comic-relief-latin-700-normal.woff2", "comic-relief-latin-ext-700-normal.woff2"];
const fontDir = "node_modules/@fontsource/comic-relief/files";

const common = {
  bundle: true,
  target: "chrome120",
  logLevel: "info",
  sourcemap: watch ? "inline" : false,
};

const extension = [
  { ...common, entryPoints: ["src/background.ts"], outfile: "dist/background.js", format: "esm" },
  { ...common, entryPoints: ["src/content/index.ts"], outfile: "dist/content.js", format: "iife" },
  { ...common, entryPoints: ["src/options/options.ts"], outfile: "dist/options.js", format: "esm" },
];

async function copyFonts(to) {
  await mkdir(to, { recursive: true });
  for (const f of FONTS) await cp(`${fontDir}/${f}`, `${to}/${f}`);
}

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await cp("src/manifest.json", "dist/manifest.json");
await cp("src/options/options.html", "dist/options.html");
await cp("src/icons", "dist/icons", { recursive: true });
await copyFonts("dist/fonts");

if (!watch) {
  await Promise.all(extension.map((options) => esbuild.build(options)));
} else {
  for (const options of extension) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
  }
}

if (dev) {
  // the harness page has no extension APIs, dev/chrome-shim.ts fakes them
  await mkdir("dev/pages", { recursive: true });
  const pages = (await readdir("dev/pages")).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
  await writeFile("dev/pages.json", JSON.stringify(pages));
  await copyFonts("dev/fonts");

  const ctx = await esbuild.context({ ...common, entryPoints: ["dev/harness.ts"], outfile: "dev/harness.js", format: "iife" });
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: "dev", port: 5317 });
  console.log(`harness: http://localhost:${port}`);
}

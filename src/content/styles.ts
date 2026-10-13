export const css = `
:host { all: initial; }
* { box-sizing: border-box; }

.stage { position: fixed; inset: 0; pointer-events: none; }

/* dim + glowing edge + sweep while scanning */
.dim {
  position: fixed; inset: 0;
  background: rgba(8, 12, 28, .16);
  opacity: 0; transition: opacity .35s ease;
}
.on .dim { opacity: 1; }

.edge { position: fixed; inset: 0; opacity: 0; transition: opacity .5s ease; }
.edge.glow { filter: blur(18px); }
.scanning .edge { opacity: 1; }
.scanning .edge.glow { opacity: .85; }

/* @property doesn't work in a shadow root, so a huge gradient square spins
   behind a mask that only lets the screen border through */
.ring {
  position: absolute; inset: 0; overflow: hidden;
  padding: 3px;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
}
.glow .ring { padding: 14px; }
.spin {
  position: absolute; left: 50%; top: 50%;
  width: 250vmax; height: 250vmax; margin: -125vmax 0 0 -125vmax;
  background: conic-gradient(#4f8cff, #9b6bff, #ff5fa2, #ffb44f, #3fd4c4, #4f8cff);
}
.scanning .spin { animation: spin 2.8s linear infinite; }

.sweep {
  position: fixed; left: 0; right: 0; top: -40vh; height: 40vh;
  background: linear-gradient(to bottom,
    rgba(90, 150, 255, 0) 0%,
    rgba(90, 150, 255, .10) 55%,
    rgba(120, 170, 255, .32) 92%,
    rgba(200, 225, 255, .75) 100%);
  opacity: 0;
}
.scanning .sweep { opacity: 1; animation: sweep 1.5s cubic-bezier(.45, 0, .25, 1) infinite; }

/* text areas */
.layer { position: fixed; inset: 0; }
.box { position: absolute; left: 0; top: 0; transition: opacity .25s ease; }
.box.leaving { opacity: 0; }

.hl {
  position: absolute;
  border-radius: 10px;
  background: rgba(66, 133, 244, .28);
  box-shadow: 0 0 0 1.5px rgba(130, 175, 255, .95), 0 0 18px 3px rgba(66, 133, 244, .45);
  animation: pop .35s ease-out var(--d) backwards, pulse 1.6s ease-in-out calc(var(--d) + .35s) infinite;
  transition: opacity .3s ease;
}
.done .hl, .failed .hl { opacity: 0; animation: none; }

.wipe, .cover { position: absolute; opacity: 0; transition: opacity .35s ease; }
.wipe { border-radius: 4px; }
.cover {
  display: flex; align-items: center; justify-content: center;
  border-radius: 6px;
  color: #111;
  font-weight: 700;
  text-align: center;
}
.cover.round { border-radius: 50%; }
.lines > div { white-space: pre; }
.done .wipe, .done .cover { opacity: 1; }
.layer.original .wipe, .layer.original .cover { opacity: 0; }

/* top bar */
.bar {
  position: fixed; top: 12px; left: 50%;
  translate: -50% calc(-100% - 20px);
  transition: translate .45s cubic-bezier(.2, .9, .3, 1.15);
  display: flex; align-items: center; gap: 8px;
  max-width: calc(100vw - 24px);
  padding: 7px 8px 7px 12px;
  border-radius: 14px;
  background: rgba(20, 23, 34, .94);
  color: #e9ecf5;
  font: 13px/1.2 "Segoe UI", system-ui, sans-serif;
  box-shadow: 0 10px 30px rgba(0, 0, 0, .35), 0 0 0 1px rgba(255, 255, 255, .07);
  pointer-events: auto;
  white-space: nowrap;
}
.bar.show { translate: -50% 0; }
.bar .brand { display: flex; align-items: center; gap: 6px; font-weight: 600; }
.bar .brand svg { width: 18px; height: 18px; }
.bar .arrow { opacity: .55; }
.bar .status { min-width: 130px; opacity: .8; font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; }
.bar .status.err { color: #ff9aa8; opacity: 1; }
.bar select, .bar button {
  font: inherit; color: inherit;
  background: rgba(255, 255, 255, .08);
  border: 1px solid rgba(255, 255, 255, .12);
  border-radius: 8px;
  padding: 5px 8px;
  cursor: pointer;
}
.bar select option { color: #111; }
.bar button:hover, .bar select:hover { background: rgba(255, 255, 255, .14); }
.bar button[aria-pressed="true"] { background: rgba(91, 140, 255, .35); border-color: rgba(91, 140, 255, .6); }
.bar button.attn { background: #5b8cff; border-color: #5b8cff; color: #fff; }
.bar .icon { padding: 5px 9px; }

@media (max-width: 720px) {
  .bar .brand span, .bar .arrow { display: none; }
  .bar .status { min-width: 0; }
}

/* floating logo tab on the right edge */
.logo {
  position: fixed; right: 0; top: 50%;
  translate: 40% -50%;
  width: 46px; height: 46px;
  display: grid; place-items: center;
  border: 0; border-radius: 50%;
  background: #141826;
  box-shadow: 0 6px 20px rgba(0, 0, 0, .3), 0 0 0 1px rgba(255, 255, 255, .08);
  cursor: pointer;
  pointer-events: auto;
  transition: translate .25s ease;
}
.logo:hover, .on .logo { translate: -10px -50%; }
.scanning .logo svg, .busy .logo svg { animation: spin 1.2s linear infinite; }

@keyframes spin { to { transform: rotate(1turn); } }
@keyframes sweep { to { transform: translateY(140vh); } }
@keyframes pop { from { opacity: 0; transform: scale(.85); } }
@keyframes pulse {
  50% { box-shadow: 0 0 0 1.5px rgba(160, 195, 255, 1), 0 0 26px 7px rgba(66, 133, 244, .6); }
}

@media (prefers-reduced-motion: reduce) {
  .spin, .scanning .sweep, .hl, .logo svg { animation: none !important; }
}
`;

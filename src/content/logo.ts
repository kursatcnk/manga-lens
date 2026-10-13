// A lens ring with a speech bubble inside it.
export const logoSvg = `
<svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
  <defs>
    <linearGradient id="ml-ring" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5b8cff"/>
      <stop offset=".5" stop-color="#b06bff"/>
      <stop offset="1" stop-color="#ff6fa8"/>
    </linearGradient>
  </defs>
  <circle cx="14" cy="14" r="10" fill="none" stroke="url(#ml-ring)" stroke-width="3"/>
  <path d="M21.5 21.5 L28 28" stroke="url(#ml-ring)" stroke-width="3.4" stroke-linecap="round"/>
  <path d="M9 10.5h10a1.6 1.6 0 0 1 1.6 1.6v3.6a1.6 1.6 0 0 1-1.6 1.6h-5.2l-3 2.4v-2.4H9a1.6 1.6 0 0 1-1.6-1.6v-3.6A1.6 1.6 0 0 1 9 10.5z" fill="#fff"/>
</svg>`;

/* =====================================================================
   THEME — colors, fonts and light/dark for the whole page.
   ---------------------------------------------------------------------
   Change a value, save, push. Colors are hex codes. The "Dark" variants
   are used when mode is "dark", or when mode is "auto" and the viewer's
   device is set to dark. Fonts are Google Fonts family names
   (fonts.google.com) and load automatically.
   ===================================================================== */
const THEME = {
  mode: "light",              // "light" | "dark" | "auto"

  heading:     "#660000",     // unit titles and other headers
  headingDark: "#f0b3b3",     //   ...same, on a dark background

  accent:      "#8c1d1d",     // links, unit numbers, icons, highlights
  accentDark:  "#e09a9a",     //   ...same, on a dark background

  background:     "#fff4e8",  // page background behind the cards
  backgroundDark: "#1e1614",

  panel:      "#fffcf7",      // card background
  panelDark:  "#2a1f1c",

  text:      "#2b211c",       // main text color
  textDark:  "#f0e4da",

  headingFont: "IBM Plex Serif",   // unit titles
  bodyFont:    "IBM Plex Sans",    // everything else
  monoFont:    "IBM Plex Mono",    // numbers, labels, durations

  cornerRadius: 10,                // px, roundness of cards and buttons

  // How wide the page is allowed to grow. In a wide Google Sites embed the
  // leftover space either side is this cap doing its job; raise it to fill
  // more of the block, or set 99999 to fill the block completely.
  pageWidth: 1500                  // px
};

/* ===== Nothing below here needs editing. =============================
   Applies THEME to the page. This file is loaded before the page draws,
   so the colors are in place from the first frame.
   ===================================================================== */
(function () {
  const r = document.documentElement;
  const set = (k, v) => r.style.setProperty(k, v);
  if (THEME.mode === "light" || THEME.mode === "dark") r.dataset.theme = THEME.mode;
  set("--heading-light", THEME.heading);       set("--heading-dark", THEME.headingDark);
  set("--accent-light", THEME.accent);         set("--accent-dark", THEME.accentDark);
  set("--ground-light", THEME.background);     set("--ground-dark", THEME.backgroundDark);
  set("--panel-light", THEME.panel);           set("--panel-dark", THEME.panelDark);
  set("--ink-light", THEME.text);              set("--ink-dark", THEME.textDark);
  set("--serif", '"' + THEME.headingFont + '", Georgia, "Times New Roman", serif');
  set("--sans", '"' + THEME.bodyFont + '", "Segoe UI", Roboto, Helvetica, Arial, sans-serif');
  set("--mono", '"' + THEME.monoFont + '", Consolas, "Courier New", monospace');
  set("--radius", THEME.cornerRadius + "px");
  set("--page", (THEME.pageWidth || 1500) + "px");
  const fam = f => "family=" + encodeURIComponent(f).replace(/%20/g, "+") + ":ital,wght@0,400;0,500;0,600;1,400";
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?" +
    [THEME.headingFont, THEME.bodyFont, THEME.monoFont].map(fam).join("&") + "&display=swap";
  document.head.appendChild(link);
})();

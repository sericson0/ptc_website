# PTC Class Library — Google Sites setup

A single-file page (`index.html`) that shows class videos and materials in collapsible units and lessons. It is hosted on GitHub Pages and embedded in the Google Site.

**Live page:** https://sericson0.github.io/ptc_website/

**To update the site:** edit `index.html`, commit, push. GitHub Pages redeploys in about a minute; the Google Site embed picks it up on its next load (hard-refresh if it looks stale).

## What the page does

- **Units** are collapsible cards. **Lessons** inside them are collapsible rows.
- Each lesson holds one video (YouTube or Google Drive), optional notes, and a list of materials (slides, docs, PDFs, links).
- Videos load only when a lesson is opened, so a page with 100 clips stays fast.
- Search box filters lessons by title, notes, and material names.
- "Expand all" / "Collapse all" buttons, a sticky unit index, and shareable links to any unit or lesson (`#u2-unit-1-foundations-l3`).
- Works at phone width.

## Step 1 — Put the videos somewhere embeddable

**YouTube (recommended).** Upload each clip as **Unlisted** (not Private). Unlisted videos do not appear in search or on your channel but play for anyone with the link or embed. The player is faster and more reliable than Drive, and it handles mobile well.

The video ID is the part after `v=` in the URL. For `https://www.youtube.com/watch?v=abc123XYZ` the ID is `abc123XYZ`.

**Google Drive (works, with caveats).** Right-click the file, Share, set to **Anyone with the link, Viewer**. The file ID is the long string in `https://drive.google.com/file/d/FILE_ID/view`. Drive's player is slower to start and sometimes shows "video is still processing" for a while after upload.

## Step 2 — Add your lessons

Open `index.html`. The `COURSE` block near the top of the file (right after `THEME`) holds everything. A unit looks like this:

```js
{
  title: "Unit 1 · Foundations",
  summary: "One sentence about the unit.",
  lessons: [
    {
      title: "Lesson 1.1 · Key terms",
      date: "2026-09-10",        // optional, YYYY-MM-DD
      duration: "14:05",         // optional, shown at right
      youtube: "abc123XYZ",      // OR  drive: "FILE_ID"
      notes: "What this clip covers.",
      materials: [
        { label: "Lesson 1.1 slides", kind: "slides", url: "https://..." },
        { label: "Worksheet",        kind: "pdf",    url: "https://..." }
      ]
    }
  ]
}
```

- To add a lesson, copy one `{ ... }` lesson block and paste it after another one inside the same `lessons: [ ... ]` list. Keep the comma between blocks.
- To add a unit, copy a whole unit block and paste it into `units: [ ... ]`.
- `kind` can be `slides`, `doc`, `sheet`, `pdf`, `video`, or `link`. It only changes the icon.
- Leave `youtube`/`drive` out for a lesson with no video (materials only).
- A lesson with no `youtube`/`drive` line shows a "No video for this lesson" box instead of a broken player.

## Step 3 — Change colors and fonts

The `THEME` block at the top of `index.html` controls the look. Change a value, save, push.

```js
const THEME = {
  mode: "light",              // "light" | "dark" | "auto" (follow the viewer's device)

  accent:      "#0f6f7c",     // links, unit numbers, icons
  accentDark:  "#5cc4cf",     //   ...on a dark background

  background:     "#f5f7f6",  // page background behind the cards
  backgroundDark: "#131a1d",
  panel:      "#ffffff",      // card background
  panelDark:  "#1b2428",
  text:      "#1d2a30",       // main text color
  textDark:  "#e7ecea",

  headingFont: "IBM Plex Serif",   // any Google Fonts family name
  bodyFont:    "IBM Plex Sans",
  monoFont:    "IBM Plex Mono",

  cornerRadius: 10                 // px
};
```

- Secondary greys (borders, muted text, hover fills) are mixed automatically from `text` and `panel`, so you only set four colors per mode.
- To match the Google Site, set `accent` to the site's theme color and `background` to the site's section background.
- Fonts are loaded from Google Fonts by name. Browse fonts.google.com and paste the family name exactly, e.g. `"Lora"` or `"Nunito Sans"`.
- `mode: "light"` is the safe choice for an embed in a light Google Site. Use `"auto"` only if the surrounding site also switches with the viewer's device.

## Step 4 — Embed it in the Google Site

The page is hosted by GitHub Pages at the live address above (repo **Settings → Pages**, deploying from `main`, root folder).

1. In the Sites editor: **Insert → Embed → By URL**, paste the live address, choose **Whole page**, Insert.
2. Drag the block's corner handle to make it tall. Google Sites embeds have a fixed height; content taller than the block scrolls inside it. A good starting size is the height of the page with one unit open.
3. **Publish** the site.

If the fixed-height scrolling feels awkward later, an alternative is one embed block per unit (a copy of the file with only that unit in `COURSE.units`) stacked down the Sites page, so each block stays short.

## Site-level structure (native Google Sites, no code)

Use Sites' own tools for the navigation around this page:

- **Dropdown menu in the top bar:** in the Pages panel, drag a page underneath another to nest it. Nested pages appear as a dropdown under the parent. Suggested tree:
  - Home
  - Class Library ← this embed
  - Unit pages (optional, if you later want one page per unit)
  - Resources
  - About / Contact
- **Native collapsible text:** Insert → Collapsible group gives you a heading that expands to show text. Use it for FAQs or long text; it cannot hold a video, which is why the video library uses the embed above.
- **Table of contents block:** Insert → Table of contents auto-links to headings on the Sites page. Useful on long native pages.


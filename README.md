# PTC Class Library — Google Sites setup

A small static site that shows class videos and materials in collapsible units and lessons. It is hosted on GitHub Pages and embedded in the Google Site.

**Live page:** https://sericson0.github.io/ptc_website/

**To update the site:** edit the files, commit, push. GitHub Pages redeploys in about a minute; the Google Site embed picks it up on its next load (hard-refresh if it looks stale).

To preview before pushing, double-click `index.html` — it runs straight from disk, no server needed.

## Where things live

```
index.html                        the page, and the list of lesson groups it shows
lessons/01-embrace-and-box-step.js   one file per group of lessons  ← what you edit
lessons/02-coming-soon.js
lessons/03-extra-resources.js
lessons/_TEMPLATE.js              copy this to start a new group
images/                           stills from the clips, shown beside the key points
assets/theme.js                   colors, fonts, light/dark
assets/library.css                styling
assets/library.js                 the code that draws the page — no edits needed
```

Day to day you only open a file in `lessons/`. Each one is a single `PTC.addUnit({ ... })` call holding one group and its lessons.

## What the page does

- **Units** (groups of lessons) are collapsible cards. **Lessons** inside them are collapsible rows.
- There is no page title on the embed. The Google Site supplies the heading above it.
- Each lesson holds one video (YouTube or Google Drive), notes, two bullet lists, and a list of materials (slides, docs, PDFs, links). Anything you leave out simply is not drawn.
- Each lesson shows its video thumbnail. Pressing play swaps in the real player, so a long page loads one image per lesson instead of a dozen live video frames. Closing a lesson stops playback.
- Every video also carries a "Watch on YouTube" link, in case an embed is blocked on a school or work network.
- A lesson with no materials gives its full width to the video.
- Search box filters lessons by title, notes, bullet points, and material names.
- "Expand all" / "Collapse all" buttons, a sticky unit index, and shareable links to any unit or lesson (`#u1-the-embrace-and-box-step-l3`).
- Works at phone width.

## Step 1 — Put the videos somewhere embeddable

**YouTube (recommended).** Upload each clip as **Unlisted** (not Private). Unlisted videos do not appear in search or on your channel but play for anyone with the link or embed. The player is faster and more reliable than Drive, and it handles mobile well.

The video ID is the part after `v=` in the URL. For `https://www.youtube.com/watch?v=abc123XYZ` the ID is `abc123XYZ`.

**Google Drive (works, with caveats).** Right-click the file, Share, set to **Anyone with the link, Viewer**. The file ID is the long string in `https://drive.google.com/file/d/FILE_ID/view`. Drive's player is slower to start and sometimes shows "video is still processing" for a while after upload.

## Step 2 — Write the lessons

Open the file in `lessons/` for the group you are working on. A lesson looks like this:

```js
{
  title: "Lesson 1 · Embrace",
  date: "2026-09-10",        // optional, YYYY-MM-DD
  duration: "14:05",         // optional, shown at the right of the row
  youtube: "om_3wXzEBXk",    // OR  drive: "FILE_ID"

  notes: "A sentence or two under the video.",

  points: [                  // bullets under the heading "Key points"
    "Lead comes from the chest, not the arm",
    "Common mistake: rushing the second beat"
  ],

  practice: [                // bullets under the heading "Practice"
    "Ten boxes on your own before next week"
  ],

  materials: [
    { label: "Lesson 1 slides", kind: "slides", url: "https://..." },
    { label: "Worksheet",       kind: "pdf",    url: "https://..." }
  ]
}
```

- The three real lessons ship with **`TODO:` placeholder text** in `notes`, `points`, and `practice`. That text is visible on the live page until you replace it — search the `lessons/` folder for `TODO:` to find every spot.
- To add a lesson, copy one `{ ... }` block and paste it after another inside the same `lessons: [ ... ]` list. Keep the comma between blocks.
- Leave out anything you do not want: no `notes` line means no paragraph, `points: []` means no bullet list, no `youtube`/`drive` means a "No video for this lesson" box instead of a broken player.
- `kind` can be `slides`, `doc`, `sheet`, `pdf`, `video`, or `link`. It only changes the icon.

### Pictures on the key points

A bullet in `points` or `practice` is either plain text, or an object that also carries a still from the clip:

```js
points: [
  "A plain bullet, with no picture",
  { text: "A bullet with a picture", image: "images/l1-w-shape.jpg" }
]
```

Once any bullet in a list has a picture, that list stops being a bullet list and becomes a **row of cards** — picture on top, note underneath. It fits three across on a computer, two on a tablet and one on a phone, on its own, so a list of six lands as two tidy rows of three.

The stills live in [images/](images/). To cut a new one, pick the moment in the video and use ffmpeg:

```sh
# -ss is the timestamp; crop is WIDTH:HEIGHT:X:Y measured from the top-left
ffmpeg -ss 66 -i "L1 Embrace.mp4" -frames:v 1 \
  -vf "crop=400:300:370:45,scale=420:-1" -q:v 5 images/my-still.jpg
```

Crop tightly around the dancers, keeping a 4:3 shape so every still is the same size on the page. A whole 16:9 frame leaves the dancers too small to read once it is one card among three. Drop the `crop=...,` part to keep the full frame.

### Splitting the points into named groups

When one lesson's points fall into groups, use `sections` in place of `points`. Each section gets its own heading and its own row of cards. Lesson 1 uses this to separate the open side of the embrace from the closed side:

```js
sections: [
  { title: "Open side",   points: [ ... ] },
  { title: "Closed side", points: [ ... ] }
]
```

A lesson can use `points` or `sections` or both; anything you leave out is simply not drawn.

### Renaming a heading

The two standing headings are "Key points" and "Practice". Rename either one on a lesson:

```js
pointsTitle: "Steps",        // Lesson 2 uses this
practiceTitle: "Homework",
```

A `sections` group always carries its own `title`, so it needs no rename.

### Bold

Wrap anything in two asterisks to bold it, in a note or in a bullet:

```js
"**Begin with the weight on the left leg for leaders**, the right for followers."
```

It works mid-sentence, and the search box still matches across it.

The existing stills carry no `alt` text, because each one sits right next to the bullet that describes it and a screen reader would otherwise read the same thing twice. Add `alt: "..."` to a bullet if its picture shows something the words do not.

### The still image before you press play

By default each lesson shows YouTube's own thumbnail — the image you see on the video's YouTube page. YouTube keeps that image in several sizes but does not make every size for every video, so the page asks for the biggest and works down (`maxresdefault` → `sddefault` → `hqdefault` → `mqdefault`) until it finds one. You do not have to do anything for this.

To change it, either:

- **Set a custom thumbnail on YouTube** (Studio → the video → Thumbnail → Upload). It reaches this page within a few minutes; nothing here needs editing. A 1280×720 image also gives the page the sharpest size to work with.
- **Or point the lesson at any image** with a `poster` line, which wins over YouTube's:

```js
poster: "https://.../my-image.jpg",
```

  This is also the only way to give a **Google Drive** video a still image — Drive does not publish thumbnail URLs.

## Step 3 — Add a group of lessons

1. Copy `lessons/_TEMPLATE.js` to `lessons/04-something.js` and fill it in. The leading number only keeps the folder tidy.
2. Add one line to the list in `index.html`:

```html
<!-- ======= THE GROUPS OF LESSONS ON THIS PAGE, in order ======= -->
<script defer src="lessons/01-embrace-and-box-step.js"></script>
<script defer src="lessons/04-something.js"></script>
```

Groups appear on the page in the order they are listed there, so reordering the page means reordering these lines.

- **To hide a group without deleting it**, add `hidden: true` as the first line inside its `PTC.addUnit({ ... })`. "Unit 2" and "Extra resources" are hidden this way right now; delete that one line to bring either back.
- The sidebar unit index appears automatically once two or more groups are visible.

## Step 4 — Change colors and fonts

`assets/theme.js` controls the look. Change a value, save, push.

```js
const THEME = {
  mode: "light",              // "light" | "dark" | "auto" (follow the viewer's device)

  heading:     "#660000",     // unit titles and other headers
  headingDark: "#f0b3b3",     //   ...on a dark background
  accent:      "#8c1d1d",     // links, unit numbers, icons
  accentDark:  "#e09a9a",

  background:     "#fff4e8",  // page background behind the cards
  backgroundDark: "#1e1614",
  panel:      "#fffcf7",      // card background
  panelDark:  "#2a1f1c",
  text:      "#2b211c",       // main text color
  textDark:  "#f0e4da",

  headingFont: "IBM Plex Serif",   // any Google Fonts family name
  bodyFont:    "IBM Plex Sans",
  monoFont:    "IBM Plex Mono",

  cornerRadius: 10                 // px
};
```

- Secondary tones (borders, muted text, hover fills) are mixed automatically from `text` and `panel`, so you only set five colors per mode.
- To match the Google Site, set `background` to the site's section background so the embed has no visible seam.
- Fonts are loaded from Google Fonts by name. Browse fonts.google.com and paste the family name exactly, e.g. `"Lora"` or `"Nunito Sans"`.
- `mode: "light"` is the safe choice for an embed in a light Google Site. Use `"auto"` only if the surrounding site also switches with the viewer's device.

## Step 5 — Embed it in the Google Site

The page is hosted by GitHub Pages at the live address above (repo **Settings → Pages**, deploying from `main`, root folder).

**The quick way, no code.** In the Sites editor: **Insert → Embed → By URL**, paste `https://sericson0.github.io/ptc_website/`, choose **Whole page**, Insert. Drag the block's corner handle to make it tall, then **Publish**.

**The way that gives you an exact height.** **Insert → Embed → Embed code**, paste this, Next, Insert:

```html
<iframe src="https://sericson0.github.io/ptc_website/"
        title="PTC Class Library"
        width="100%" height="900"
        style="border:0; display:block;"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowfullscreen></iframe>
```

Keep the `allow` line. The YouTube player sits in an iframe *inside* this page, so from the Sites page it is two frames deep, and each frame has to pass those permissions down or pressing play and going fullscreen misbehave.

### How tall to make the block

Google Sites blocks are a fixed height and there is no auto-resizing for an embed from another domain, so anything taller than the block scrolls inside it. Measured at a typical Sites width:

| State | Page height |
| --- | --- |
| All lessons shut | ~750px |
| One lesson open | ~2100–3000px |
| Everything open | ~4900–6700px |

Nothing sensible shows a whole open lesson without scrolling, so pick a height that looks right shut and let people scroll inside it — **800–900px** is a good starting point. Drag the block as wide as the layout allows too: at full width the key-point cards sit three across, and the same lesson is about a third shorter than it is at two across.

### Matching the site's background

The page paints its own cream background (`#fff4e8`), so on a white Sites page the embed reads as a visible rectangle. To lose the seam, set `background` in [assets/theme.js](assets/theme.js) to whatever the Sites section behind it uses, then commit and push.

### One embed block per group

If the fixed-height scrolling feels awkward, put each group in its own embed block and stack them down the Sites page, so every block stays short. Add `?unit=` to the address to narrow the page to one group:

```
https://sericson0.github.io/ptc_website/?unit=1        first visible group
https://sericson0.github.io/ptc_website/?unit=box      any group whose title matches
```

The number counts visible groups only, so it shifts if you hide or unhide one; matching on a word from the title is steadier. An address that matches nothing falls back to showing the whole page. In single-group mode the sidebar index disappears and the group opens by itself.

## Site-level structure (native Google Sites, no code)

Use Sites' own tools for the navigation around this page:

- **Dropdown menu in the top bar:** in the Pages panel, drag a page underneath another to nest it. Nested pages appear as a dropdown under the parent. Suggested tree:
  - Home
  - Class Library ← this embed
  - Unit pages (optional, one `?unit=` embed each)
  - Resources
  - About / Contact
- **Native collapsible text:** Insert → Collapsible group gives you a heading that expands to show text. Use it for FAQs or long text; it cannot hold a video, which is why the video library uses the embed above.
- **Table of contents block:** Insert → Table of contents auto-links to headings on the Sites page. Useful on long native pages.

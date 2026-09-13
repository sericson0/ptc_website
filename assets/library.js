/* =====================================================================
   PTC Class Library — the engine.
   ---------------------------------------------------------------------
   This file draws the page. You should not need to edit it.
   Lesson content lives in lessons/*.js, colors in assets/theme.js.

   Each file in lessons/ calls PTC.addUnit({...}) once. The order the
   files are listed in index.html is the order the groups appear in.

   index.html?unit=2  (or ?unit=box-step) draws only one group, so the
   Google Site can hold one embed block per group instead of one long
   scrolling block.
   ===================================================================== */
(function () {
  "use strict";

  const UNITS = [];

  // The only thing a lessons/*.js file needs to call.
  window.PTC = {
    addUnit(unit) { UNITS.push(unit); return unit; }
  };

  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const isPlaceholder = id => !id || /^PASTE_/i.test(id);
  const list = v => (v == null ? [] : Array.isArray(v) ? v : [v]).filter(x => x !== "" && x != null);

  const ICONS = {
    chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    slides: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 17v3M8 21h8"/></svg>',
    doc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/></svg>',
    sheet: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M4 15h16M10 4v16"/></svg>',
    pdf: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 14h1.5a1.5 1.5 0 0 0 0-3H9v6"/></svg>',
    video: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>'
  };
  const KIND_NAMES = { slides: "Slides", doc: "Document", sheet: "Spreadsheet", pdf: "PDF", video: "Video", link: "Link" };

  // Colors are set in CSS: var() is not valid inside an SVG presentation attribute.
  const PLAY_ICON = '<svg viewBox="0 0 68 48" aria-hidden="true">' +
    '<rect class="pb" x="1" y="1" width="66" height="46" rx="12" stroke-width="2"/>' +
    '<path class="pt" d="M27 15.5 46 24l-19 8.5z"/></svg>';

  /* ---------- the pieces of one lesson ---------- */

  // YouTube keeps a thumbnail in several sizes but not every size for every
  // video, and it answers a missing one with a grey placeholder rather than
  // nothing — so the page walks this list, biggest first, until it gets a
  // real frame. A lesson can put its own image in front with
  //   poster: "https://..."
  function posters(lesson, id) {
    const own = lesson.poster ? [lesson.poster] : [];
    if (!id) return own;
    return own.concat(["maxresdefault", "sddefault", "hqdefault", "mqdefault"]
      .map(size => "https://i.ytimg.com/vi/" + id + "/" + size + ".jpg"));
  }

  function video(lesson) {
    if (lesson.youtube && !isPlaceholder(lesson.youtube)) {
      const id = encodeURIComponent(lesson.youtube);
      return {
        src: "https://www.youtube-nocookie.com/embed/" + id + "?rel=0",
        posters: posters(lesson, id),
        watch: "https://youtu.be/" + id,
        where: "YouTube"
      };
    }
    if (lesson.drive && !isPlaceholder(lesson.drive)) {
      const id = encodeURIComponent(lesson.drive);
      return {
        src: "https://drive.google.com/file/d/" + id + "/preview",
        posters: posters(lesson, ""),   // Drive has no thumbnail URL; poster: works
        watch: "https://drive.google.com/file/d/" + id + "/view",
        where: "Google Drive"
      };
    }
    return null;
  }

  function placeholder(lesson) {
    const hasKey = lesson.youtube || lesson.drive;
    return '<div class="placeholder">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/></svg>' +
      (hasKey
        ? '<div>Video not linked yet</div><code>replace ' + esc(lesson.youtube || lesson.drive) + '</code>'
        : '<div>No video for this lesson</div>') +
      '</div>';
  }

  // A titled bullet list. A missing or empty list draws nothing at all.
  function bullets(title, items) {
    const rows = list(items);
    if (!rows.length) return "";
    return '<div class="block"><h3 class="block-title">' + esc(title) + '</h3><ul class="points">' +
      rows.map(i => '<li>' + esc(i) + '</li>').join("") + '</ul></div>';
  }

  // Everything written under the video: notes first, then the bullet lists.
  function writeup(lesson) {
    return list(lesson.notes).map(p => '<p class="notes">' + esc(p) + '</p>').join("") +
      bullets("Key points", lesson.points) +
      bullets("Practice", lesson.practice);
  }

  function materials(lesson) {
    return list(lesson.materials).map(m => {
      const kind = KIND_NAMES[m.kind] ? m.kind : "link";
      return '<li><a href="' + esc(m.url) + '" target="_blank" rel="noopener">' + ICONS[kind] +
        '<span>' + esc(m.label) + '<span class="kind">' + KIND_NAMES[kind] + '</span></span></a></li>';
    }).join("");
  }

  // What the search box matches a lesson against.
  function haystack(lesson) {
    return [lesson.title, ...list(lesson.notes), ...list(lesson.points), ...list(lesson.practice),
      ...list(lesson.materials).map(m => m.label)].join(" ").toLowerCase();
  }

  function lessonHtml(lesson, lid) {
    const mats = materials(lesson);
    const dateStr = lesson.date
      ? new Date(lesson.date + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
      : "";
    const v = video(lesson);
    return '<li><details class="lesson" id="' + lid + '" data-search="' + esc(haystack(lesson)) + '">' +
      '<summary><div><div class="t">' + esc(lesson.title) + '</div>' +
      (dateStr ? '<div class="d">' + dateStr + '</div>' : "") + '</div>' +
      '<span class="dur">' + esc(lesson.duration || "") + '</span></summary>' +
      '<div class="body' + (mats ? "" : " solo") + '">' +
        '<div>' +
          '<div class="player">' + (v
            ? '<button class="poster" type="button" data-src="' + esc(v.src) + '" aria-label="Play ' + esc(lesson.title) + '">' +
                (v.posters.length ? '<img src="' + esc(v.posters[0]) + '" data-more="' + esc(v.posters.slice(1).join("|")) + '" alt="" loading="lazy">' : "") +
                '<span class="play">' + PLAY_ICON + '</span></button>'
            : placeholder(lesson)) + '</div>' +
          '<p class="watch">' +
            (v ? '<a href="' + esc(v.watch) + '" target="_blank" rel="noopener">Watch on ' + v.where + ' &#8599;</a>' : "") +
            (mats ? "" : '<a href="#' + lid + '">Link to this lesson</a>') +
          '</p>' +
          writeup(lesson) +
        '</div>' +
        (mats
          ? '<aside class="side"><h3>Materials</h3><ul class="materials">' + mats + '</ul>' +
            '<p class="permalink"><a href="#' + lid + '">Link to this lesson</a></p></aside>'
          : "") +
      '</div></details></li>';
  }

  /* ---------- the page ---------- */

  // ?unit=2 or ?unit=box-step narrows the page to a single group of lessons.
  function chosen(units) {
    const want = new URLSearchParams(location.search).get("unit");
    if (!want) return units;
    const n = Number(want);
    if (Number.isInteger(n) && n >= 1 && n <= units.length) return [units[n - 1]];
    const s = slug(want);
    const hit = units.filter(u => slug(u.title).includes(s));
    return hit.length ? hit : units;
  }

  function render() {
    const unitsEl = $("#units");
    const indexEl = $("#index");
    let lessonCount = 0;

    // Groups marked `hidden: true` stay in the folder but are not drawn.
    const units = chosen(UNITS.filter(u => u && !u.hidden));

    units.forEach((unit, ui) => {
      const uid = "u" + (ui + 1) + "-" + slug(unit.title);
      const n = String(ui + 1).padStart(2, "0");
      const lessons = list(unit.lessons);

      indexEl.insertAdjacentHTML("beforeend",
        '<li><a href="#' + uid + '" data-unit="' + uid + '"><span class="n">' + n + '</span><span>' + esc(unit.title) + '</span></a></li>');

      const lessonsHtml = lessons.map((lesson, li) => {
        lessonCount++;
        return lessonHtml(lesson, uid + "-l" + (li + 1));
      }).join("");

      unitsEl.insertAdjacentHTML("beforeend",
        '<details class="unit" id="' + uid + '"' + (ui === 0 ? " open" : "") + '>' +
          '<summary><span class="n">' + n + '</span><div><h2>' + esc(unit.title) + '</h2>' +
          '<div class="meta">' + lessons.length + (lessons.length === 1 ? " lesson" : " lessons") + '</div></div>' + ICONS.chev + '</summary>' +
          (unit.summary ? '<p class="summary-text">' + esc(unit.summary) + '</p>' : "") +
          '<ol class="lessons">' + lessonsHtml + '</ol>' +
        '</details>');
    });

    unitsEl.insertAdjacentHTML("beforeend", '<div class="no-results" id="no-results" hidden>No lessons match that search.</div>');
    $("#count").textContent = units.length + (units.length === 1 ? " unit · " : " units · ") +
      lessonCount + (lessonCount === 1 ? " lesson" : " lessons");
    // One visible group needs no sidebar index.
    if (units.length < 2) $("#layout").classList.add("solo");
  }

  // A lesson shows its thumbnail until someone presses play; the real player
  // loads on that press and is torn down when the lesson closes, so playback
  // stops and a long page never holds a dozen live video frames.
  function wirePlayers() {
    document.addEventListener("click", e => {
      const b = e.target.closest(".poster");
      if (!b) return;
      const p = b.parentElement;
      p.dataset.poster = p.innerHTML;
      const f = document.createElement("iframe");
      f.src = b.dataset.src + (b.dataset.src.includes("?") ? "&" : "?") + "autoplay=1";
      f.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen";
      f.allowFullscreen = true;
      f.title = b.getAttribute("aria-label");
      p.innerHTML = "";
      p.appendChild(f);
      f.focus();
    });

    document.querySelectorAll(".lesson").forEach(d => {
      d.addEventListener("toggle", () => {
        if (d.open) return;
        const p = $(".player", d);
        if (p && p.dataset.poster) p.innerHTML = p.dataset.poster;
      });
    });

    // Step down to the next thumbnail size. Two different things count as a
    // miss. The image can fail outright (offline, or a network that blocks
    // i.ytimg.com) — that fires "error". Or YouTube can answer a size it does
    // not have with HTTP 404 *and a valid 120x90 grey placeholder*, which the
    // browser loads happily; only its size gives it away, so every load is
    // measured. Running out of sizes leaves the play button on its own.
    const nextPoster = img => {
      const more = (img.dataset.more || "").split("|").filter(Boolean);
      if (!more.length) { img.remove(); return; }
      img.dataset.more = more.slice(1).join("|");
      img.src = more[0];
    };

    document.querySelectorAll(".poster img").forEach(img => {
      const check = () => { if (img.naturalWidth && img.naturalWidth <= 120) nextPoster(img); };
      img.addEventListener("error", () => nextPoster(img));
      img.addEventListener("load", check);
      if (img.complete) check();   // a cached image can beat these listeners
    });
  }

  function wireControls() {
    const all = sel => document.querySelectorAll(sel);
    $("#expand-all").addEventListener("click", () => all(".unit, .lesson").forEach(d => { d.open = true; }));
    $("#collapse-all").addEventListener("click", () => all(".unit, .lesson").forEach(d => { d.open = false; }));

    $("#index").addEventListener("click", e => {
      const a = e.target.closest("a[data-unit]");
      if (!a) return;
      const u = document.getElementById(a.dataset.unit);
      if (u) u.open = true;
    });

    const q = $("#q");
    let t;
    q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => filter(q.value), 120); });
  }

  function filter(raw) {
    const term = raw.trim().toLowerCase();
    let shown = 0;
    document.querySelectorAll(".unit").forEach(u => {
      let unitShown = 0;
      u.querySelectorAll(".lesson").forEach(l => {
        const hit = !term || l.dataset.search.includes(term);
        l.parentElement.hidden = !hit;
        if (hit) { unitShown++; shown++; }
      });
      u.hidden = term && unitShown === 0;
      if (term && unitShown) u.open = true;
    });
    $("#no-results").hidden = !(term && shown === 0);
  }

  // Deep links: #unit-id or #lesson-id opens the right sections and scrolls there.
  function openFromHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.open = true;
    const unit = el.closest(".unit");
    if (unit) unit.open = true;
    el.scrollIntoView({ block: "start" });
  }

  // Runs once every lessons/*.js file has registered its group.
  document.addEventListener("DOMContentLoaded", function () {
    render();
    wirePlayers();
    wireControls();
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
  });
})();

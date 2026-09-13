/* =====================================================================
   TEMPLATE — copy this file to start a new group of lessons.

   1. Copy it to lessons/04-whatever.js (any name; the number just keeps
      the folder in order).
   2. Fill it in.
   3. Add one line for it in index.html, in the list of lesson groups.
      Groups appear on the page in the order they are listed there.

   This file itself is never loaded — it is not listed in index.html.
   ===================================================================== */
PTC.addUnit({
  // hidden: true,            // uncomment to keep the group out of the page

  title: "Group title",
  summary: "One sentence about this group of lessons.",
  lessons: [
    {
      title: "Lesson 1 · Title",
      date: "2026-09-10",      // optional
      duration: "14:05",       // optional

      youtube: "PASTE_VIDEO_ID",   // the part after v= in the YouTube link
      // drive: "PASTE_FILE_ID",   // use this instead for a Google Drive file

      // poster: "https://...",    // optional: your own still image for the
                                   // lesson. Without it, YouTube's thumbnail
                                   // is used; a Drive video has none.

      notes: "A sentence or two under the video.",

      points: [                // bullets under the heading "Key points"
        "First point",
        "Second point"
      ],

      practice: [              // bullets under the heading "Practice"
        "What to drill before the next class"
      ],

      materials: [             // kind = slides | doc | sheet | pdf | video | link
        { label: "Slides", kind: "slides", url: "https://example.com" }
      ]
    }
  ]
});

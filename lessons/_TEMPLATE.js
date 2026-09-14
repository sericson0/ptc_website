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

      // Wrap anything in two asterisks to bold it, here or in a bullet.
      notes: "A sentence or two under the video. **This part is bold.**",

      // pointsTitle: "Steps",        // renames the "Key points" heading
      // practiceTitle: "Homework",   // renames the "Practice" heading


      // Bullets under the heading "Key points". Once any of them has a
      // picture the list is drawn as a row of cards instead: picture on
      // top, note underneath, three across on a computer.
      points: [
        "A plain bullet, with no picture",
        { text: "A bullet with a picture",
          image: "images/my-still.jpg" }
      ],

      // When the points fall into groups, use `sections` in place of
      // `points`. Each one gets its own heading and its own row of cards.
      // sections: [
      //   { title: "First group",  points: [ ... ] },
      //   { title: "Second group", points: [ ... ] }
      // ],

      practice: [              // bullets under the heading "Practice"
        "What to drill before the next class"
      ],

      materials: [             // kind = slides | doc | sheet | pdf | video | link
        { label: "Slides", kind: "slides", url: "https://example.com" }
      ]
    }
  ]
});

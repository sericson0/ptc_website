/* =====================================================================
   GROUP 1 — The Embrace and Box Step
   ---------------------------------------------------------------------
   The points and practice bullets below were pulled from the audio of the
   three clips, so edit or cut any that do not say what you want them to.

   Shape of a lesson:
     title     shown on the collapsed row
     date      optional, "YYYY-MM-DD"
     duration  optional, shown at the right of the row, e.g. "14:05"
     youtube   the video ID — the part after v= in the YouTube link
     drive     use instead of youtube for a Google Drive file ID
     notes     a sentence or two under the video (or a list of them)
     points    bullets under the heading "Key points". A bullet is either
               plain text, or { text, image } to put a still from the clip
               above it. Once any bullet has a picture the whole list is
               drawn as a row of cards.
     sections  use instead of `points` when the points fall into named
               groups: [{ title: "...", points: [...] }, ...]
     practice  bullets under the heading "Practice"
     pointsTitle / practiceTitle
               rename those two headings, e.g. pointsTitle: "Steps"
     materials links: { label, kind, url }
               kind = slides | doc | sheet | pdf | video | link

   Any note or bullet can carry **bold** by wrapping it in two asterisks.
   ===================================================================== */
PTC.addUnit({
  title: "The Embrace and Box Step",
  summary: "Key pointers for the embrace, the steps of the basic box, and tips for turning the box step.",
  lessons: [
    {
      title: "Lesson 1 · Embrace",
      youtube: "om_3wXzEBXk",
      notes: "Key pointers for the embrace.",
      sections: [
        {
          title: "Open side",
          points: [
            { text: "The leader's left hand and the follower's right meet palm to palm, with the leader's palm turned towards the follower's head.",
              image: "images/l1-open-side.jpg" },
            { text: "Hands held around shoulder height.",
              image: "images/l1-shoulder-height.jpg" },
            { text: "Keep hands centered between the couple, not pulled towards one side or the other.",
              image: "images/l1-hands-centered.jpg" },
            { text: "Wrists and elbows stay in one line. Do not crook the wrists in either direction.",
              image: "images/l1-wrists-elbows.jpg" },
            { text: "Picture the arms as a W: elbows below the shoulders, hands meeting at shoulder height.",
              image: "images/l1-w-shape.jpg" }
          ]
        },
        {
          title: "Closed side",
          points: [
            { text: "There are two types of embrace in tango. In close embrace the bodies touch; in open embrace there is space between the couple.",
              image: "images/l1-open-vs-close.jpg" },
            { text: "The closed side of the embrace is the leader's right arm and the follower's left.",
              image: "images/l1-closed-side.jpg" },
            { text: "In open embrace, the leader's right hand goes on the follower's shoulder blade, and the follower's left hand on the leader's tricep.",
              image: "images/l1-hand-placement.jpg" },
          ]
        }
      ],
      practice: [
        "Practice taking the embrace focusing on each of the points above. Take them one at a time",
        "For more advanced dancers, try the same but in a close embrace."
      ],
      materials: []
    },
    {
      title: "Lesson 2 · The box step",
      youtube: "vVXi_a_QcLw",
      notes: [
        "The steps of the basic box, a useful sequence of six steps for tango.",
        "Leader steps are: (1) back, (2) side, (3) forward, (4) forward, (5) side, (6) together",
        "**Begin with the weight on the left leg for leaders, the right for followers.**"
      ],
      pointsTitle: "Steps",
      points: [
        { text: "Step 1, back. Back right for the leader, forward left for the follower.",
          image: "images/l2-step-1-back.jpg" },
        { text: "Step 2, side left for leaders, right for the follower.",
          image: "images/l2-step-2-side.jpg" },
        { text: "Step 3, forward and outside partner: both feet are to one side of your partner's feet, such that a line could separate the two.",
          image: "images/l2-step-3-forward-outside.jpg" },
        { text: "Step 4, forward again, back inside partner.",
          image: "images/l2-step-4-forward-inside.jpg" },
        { text: "Step 5, side right for leader, left for the follower.",
          image: "images/l2-step-5-side.jpg" },
        { text: "Step 6, change weight. The feet come together and the weight goes back to the left foot for the leader, right for follower, ready to start again.",
          image: "images/l2-step-6-change-weight.jpg" }
      ],
      practice: [
        "Walk the six counts on your own: back, side, forward, forward, side, together and change weight.",
        "Repeat the box steps with a partner.",
        "Try the box to music, with one step per strong beat.",
        "Integrate the box into the rest of your dance.",

      ],
      materials: []
    },
    {
      title: "Lesson 3 · Rotating the box step",
      youtube: "IijVRP4NKb0",
      notes: "Tips for turning the box step.",
      points: [
        { text: "Rotating the box means every step travels the same way around, instead of returning to where you started.",
          image: "images/l3-direction.jpg" },
        { text: "Trick one, the diagonal cross: on the first step the leader steps diagonally and the follower takes the other diagonal, which sets up the rotation.",
          image: "images/l3-diagonal-cross.jpg" },
        { text: "Trick two, the step around: on the side step the follower takes a larger step around the leader.",
          image: "images/l3-step-around.jpg" },
        { text: "In the second half the roles reverse, and it is the leader who crosses diagonally, in front of the follower.",
          image: "images/l3-leader-crosses.jpg" },
        { text: "The leader then takes the larger step around on the side step, finishing the turn.",
          image: "images/l3-second-half.jpg" }
      ],
      practice: [
        "Know the box step first. Lesson 2 walks through the six steps."
      ],
      materials: []
    }
  ]
});

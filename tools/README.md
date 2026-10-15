# Video-to-lesson workflow

This local tool turns one finished video into a reviewed website lesson and an
optional private YouTube upload. It never changes the website, YouTube, or Git
before an explicit approval or button press, and it never makes a video public.

## One-time setup

1. Install Node.js 20 or newer and ffmpeg/ffprobe. This computer already has
   both.
2. Install local Whisper once:

   ```powershell
   npm.cmd run video:setup
   ```

3. Run `codex login status`. It must say `Logged in using ChatGPT`. If it does
   not, run `codex login` and choose **Sign in with ChatGPT**. Lesson drafting
   then uses the Codex allowance included with that ChatGPT plan. Transcription
   runs on this computer and uses no OpenAI API credits.
4. For YouTube upload, open Google Cloud Console:
   - create or select a project;
   - enable **YouTube Data API v3**;
   - configure the OAuth consent screen (while it is in testing, add your own
     Google account as a test user);
   - create an OAuth client with application type **Desktop app**;
   - download the JSON to `secrets/youtube-client.json`.
5. Optionally put the normal playlist URL in `YOUTUBE_PLAYLIST_URL` in `.env`.

The default provider is `subscription`, even if an old `OPENAI_API_KEY` remains
in `.env`. The app removes API-key variables from the Codex subprocess so it
cannot silently switch to API billing. To deliberately restore the old API
workflow, set `PTC_AI_PROVIDER=api`.

The app cannot purchase credits. OpenAI can use separately purchased ChatGPT
credits after the included Codex allowance is exhausted, so do not buy add-on
ChatGPT credits if you want the plan limit to be a hard stop.

Both `.env` and `secrets/` are ignored by Git. The first YouTube upload opens a
browser for Google authorization and stores the refresh token under
`.ptc-work/`, which is also ignored.

If Google reports that the saved YouTube token expired or was revoked, the app
opens Google authorization again automatically. Sign in with the account that
owns the YouTube channel and return to Video Studio to let the approved action
finish. Your lesson draft is kept. After updating this tool, restart Video Studio
to load the fix, then retry the approved action from the existing review screen.

An external Google OAuth app in **Testing** issues refresh tokens that expire
after seven days for YouTube access. To avoid that recurring expiry, review the
app's publishing status under **Google Auth Platform > Audience** in Google Cloud
Console. See [Google's refresh-token expiration documentation](https://developers.google.com/identity/protocols/oauth2#expiration).

## Open the graphical app

Double-click `open-video-studio.cmd`, or run:

```powershell
.\open-video-studio.cmd
```

Keep the terminal window open. The Video Studio opens in your browser and runs
only on `127.0.0.1` (your computer). Drop a video onto the large upload area,
choose its unit, and follow the progress and review screens. Large videos are
streamed directly into the ignored `.ptc-work/` folder instead of being held in
browser or server memory.

On Windows, Video Studio can use Codex bundled with the VS Code extension even
when `codex` is not on the normal system PATH. If it shows **Local AI setup
required**, the alert above the form identifies whether Whisper or the Codex
login needs attention. After resolving it, restart Video Studio and refresh
the browser page.

The review screen lets you edit every lesson note, teaching point, timestamp,
practice prompt, title, description, tag, and playlist. Changing a timestamp
quickly previews that frame and automatically saves it after a short pause.
**Update now** saves immediately. **Save draft** and approval wait for pending
image updates, so they use your selected timestamps. The final controls
separately approve the website update, private YouTube upload, and playlist
addition. After the approved actions finish, **Commit & push to GitHub** commits
only that lesson file, its generated images, and `index.html` when a new unit was
created, then pushes the current branch to `origin`.

Saving a still also saves your current draft edits. Each still updates in place,
so you can keep editing text or choosing another timestamp while extraction is
running. Still saves and **Save draft** run in order to preserve earlier image
choices. A failed extraction keeps the previously saved image.

## Command-line alternative

From PowerShell:

```powershell
.\new-video.cmd "C:\path\to\finished-video.mp4"
```

Or with Node directly:

```powershell
node tools/video-pipeline.mjs "C:\path\to\finished-video.mp4"
```

The tool will:

1. ask whether this is a topic in an existing unit or the first topic in a new
   unit;
2. extract compact audio chunks and transcribe them with local, timestamped
   Whisper;
3. use Codex signed into ChatGPT to draft lesson notes, named sections,
   practice ideas, and YouTube copy;
4. stage one video still for every key point under the ignored job folder;
5. save everything to `.ptc-work/<job>/draft.json` and open it for editing;
6. show the edited text again and require approval;
7. optionally upload the video as **private**, add it to the selected playlist,
   and put its video ID into the website lesson;
8. move approved stills into `images/`, then update an existing `lessons/*.js`
   file or create a new one and register it in `index.html`;
9. optionally commit those generated website files and push them to GitHub from
   the completion screen.

If you stop at review, nothing is submitted. Resume later with the exact command
printed by the tool, or:

```powershell
node tools/video-pipeline.mjs --resume ".ptc-work\<job>\draft.json"
```

## What “YouTube draft” means

The editable `draft.json` is the true draft. After approval, the API upload is
created as a private YouTube video with its title, description, tags, audience
setting, and playlist filled in. You do the final visibility change to Unlisted
or Public in YouTube Studio. Keeping that last action manual prevents an
accidental publication.

## Files produced

- `.ptc-work/<job>/transcript.txt` — readable timestamped transcript
- `.ptc-work/<job>/draft.json` — editable source of truth and resume state
- `.ptc-work/<job>/stills/` — proposed teaching stills before approval
- `images/<lesson>-NN.jpg` — approved teaching stills, created on website apply
- `lessons/*.js` and sometimes `index.html` — changed only after approval

Do not delete a job folder until its YouTube upload and website lesson are both
finished; it contains the resume state.

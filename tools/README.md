# Video-to-lesson workflow

This local tool turns one finished video into a reviewed website lesson and an
optional private YouTube upload. It never commits, pushes, publishes a public
video, or changes YouTube before an explicit approval.

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

The review screen lets you edit every lesson note, teaching point, timestamp,
practice prompt, title, description, tag, and playlist. It also previews all
proposed still images. The final controls separately approve the website update,
private YouTube upload, and playlist addition.

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
   file or create a new one and register it in `index.html`.

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

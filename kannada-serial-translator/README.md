# ಅನುವಾದ Anuvaada: Tamil serial to spoken Kannada

Anuvaada is a desktop app for Kannada script writers who are remaking a Tamil TV serial. It listens to the Tamil episode, writes every line in natural spoken Kannada (correct punctuation, the right respect level, Kannada idioms and the slang you choose), and reads the lines back to you in a Kannada voice.

You can use it in two ways:

| Mode | What you do | What you get |
|---|---|---|
| 🎬 **Episode** | Open the episode file (mp4, mkv, mp3, wav, m4a…) | A full Tamil and Kannada script with timings. You can click any line to hear the original Tamil or the Kannada voice, edit lines yourself, and export the script, subtitles or a Kannada voice track. |
| 🎙️ **Live** | Play the episode on the laptop (YouTube, Hotstar, Sun NXT, VLC…), or use the microphone | Kannada lines appear a few seconds after each Tamil line is spoken. The app can also speak them aloud. |

## What you need (API keys)

| Key | Needed? | Used for | Where to get it | Rough cost |
|---|---|---|---|---|
| **Sarvam AI** | **Required** | Understanding the Tamil speech (Saaras). It also translates if you have no Claude key, and speaks (Bulbul) if you have no Kenpath Labs key. | [dashboard.sarvam.ai](https://dashboard.sarvam.ai), then API Keys | ₹0.49 per minute of audio, about ₹10 per episode. New accounts get ₹100 of free credit. |
| **Claude (Anthropic)** | Recommended | Translation. Claude (Haiku 5.5 by default) reads each scene with the lines around it, so tone, honorifics, kinship words and character names stay consistent. It also corrects words the speech recognizer misheard. Sonnet 5.5 or Opus 5.5 can be picked under Settings → Advanced. | [console.anthropic.com](https://console.anthropic.com), then API Keys (add a little credit) | About 3¢ (≈ ₹3) per episode on Haiku |
| **Kenpath Labs** | Recommended | The Kannada voice (Svara), with four women's and four men's Kannada voices. | [platform.kenpathlabs.com](https://platform.kenpathlabs.com/signup), then API Keys | 100,000 free characters a month, then ₹1 per 1,000 characters |

You paste the keys into **Settings**. They stay on the laptop and are encrypted by Windows or macOS.

## Install (for the writer)

1. Download the installer:
   - **Windows:** `Anuvaada-Setup-1.5.2-win-x64.exe`
   - **Mac:** `Anuvaada-Setup-1.5.2-mac-arm64.dmg` for M1/M2/M3/M4 Macs, or `…-mac-x64.dmg` for older Intel Macs
2. Install it:
   - **Windows:** double-click the .exe. If a blue "Windows protected your PC" box appears, click **More info → Run anyway**. This appears because the app has no paid code-signing certificate.
   - **Mac:** open the .dmg and drag Anuvaada into Applications. The first time, **right-click the app → Open → Open**.
3. Open Anuvaada. The welcome screen asks for the keys and checks them before you start.
4. Optional: in **Settings → Kannada writing**, pick the speaking style (Bengaluru, Mysuru–Mandya, North Karnataka or Standard). Add the remake's names one per line, for example `மீனா = ಮೀனಾ`, and choose the voices.

### Using it

- **Episodes:** drag an episode file onto the window, or click **New episode**. A progress bar shows the three steps: **1 Listening → 2 Writing Kannada → 3 Ready**. The first Kannada lines appear within seconds, and everything is saved automatically under **Saved work**.
  - Click a line's time to hear the original Tamil, 🔊 to hear the Kannada, or ↻ to write that line again.
  - Click any Kannada line to edit it. Lines you edited are marked **✎ edited** and are kept if you translate the episode again.
  - **Pause** stops the work at any time. A banner then offers **Continue**, or **Try again** for any part of the audio that couldn't be heard.
  - **Listen in Kannada** reads the episode aloud from the selected line.
  - **Export** gives you: a Word script with Tamil and Kannada, Kannada only (.txt), an Excel table, subtitles (.srt), the Kannada voice for all lines, or a Kannada dub track timed to the episode.
  - Keyboard: **Space** play/pause · **↑ ↓** move between lines · **K** listen in Kannada · **E** edit the line. **A− / A+** change the Kannada text size.
- **Live:** choose **This laptop's sound** or **Microphone**, click **Start** and play the episode.
  - If **Speak Kannada aloud** is on, the app stops listening while it speaks so it doesn't hear itself. Headphones work best. If the speech falls behind, it skips ahead to the newest lines.
  - **Save as episode** turns the session into an editable episode.
  - **Mac:** the first time you use "This laptop's sound", allow *Screen & System Audio Recording* in System Settings → Privacy & Security, then restart Anuvaada. This needs macOS 13 or newer; on older Macs, use the microphone.
- The app follows your computer's light or dark mode.

## How it works

```
Tamil audio ──► cut at natural pauses (≤25 s) ──► Sarvam Saaras STT (ta-IN)
                                                       │  Tamil lines + timestamps
                                                       ▼
                         Claude: scene-aware Tamil → spoken Kannada dialogue
                         (style, glossary, story notes, previous lines as context;
                          structured JSON output: Kannada text + speaker gender)
                         └─ fallback: Sarvam Mayura (modern-colloquial)
                                                       │
                                                       ▼
                         Kenpath Labs Svara TTS (kn), male/female voice per line
                         └─ no Kenpath key: Sarvam Bulbul (kn-IN)
```

- **Electron** desktop app with a sandboxed window. All network calls are made from the main process, so API keys never reach the web page.
- A bundled **ffmpeg** pulls the sound out of any episode file, including large mkv or mp4 files with AC3 or AAC audio, without loading the video into memory.
- The Kannada and Tamil fonts (Noto Sans, SIL Open Font License) are bundled, so the script looks right on every computer.
- The first translation batch is small (10 lines) so Kannada appears quickly. After that, two batches of 30 run in parallel, each with the previous lines as context.
- Episodes are saved atomically (written to a temporary file, then renamed) with an in-memory index, so a crash can't corrupt saved work.
- Live capture runs in an AudioWorklet with an adaptive voice-activity chunker. It cuts after each line, or after at most 12 seconds.
- Translation model: `claude-haiku-5-5` by default (Sonnet 5.5 and Opus 5.5 selectable), with structured outputs. Episodes use `effort: medium`; Live uses `effort: low` for speed. If Claude refuses or can't be reached, that batch is translated by Sarvam instead and the app shows a warning.

## Developer guide

```bash
cd kannada-serial-translator
npm install
npm start                 # run the app
npm test                  # unit tests (segmenter, WAV, translator fallbacks)
xvfb-run -a node test/e2e.js        # 37 feature checks of the real app against mock Sarvam + Claude servers
xvfb-run -a node test/e2e-live.js   # live mode with a simulated microphone
npm run dist:win          # build Windows installer (run on Windows)
npm run dist:mac          # build macOS .dmg (run on a Mac)
```

The GitHub Actions workflow `.github/workflows/anuvaada-build.yml` builds the Windows `.exe` and macOS `.dmg` on GitHub's Windows and Mac machines and attaches them as downloadable artifacts. You can start it from the **Actions** tab with **Run workflow**.

For testing you can set keys with the environment variables `SARVAM_API_KEY` and `ANTHROPIC_API_KEY`, and point the app at other servers with `SARVAM_BASE_URL` and `ANTHROPIC_BASE_URL`.

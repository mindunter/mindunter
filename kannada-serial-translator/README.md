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
| **Sarvam AI** | **Required** | Understanding the Tamil speech (Saaras) and the Kannada voice (Bulbul). It also translates if you have no Claude key. | [dashboard.sarvam.ai](https://dashboard.sarvam.ai), then API Keys | Pay as you go. New accounts get free credits. |
| **Claude (Anthropic)** | Recommended | Best-quality translation. Claude reads each scene with the lines around it, so tone, honorifics, kinship words and character names stay consistent. It also corrects words the speech recognizer misheard. | [console.anthropic.com](https://console.anthropic.com), then API Keys (add a little credit) | A few rupees per episode |

You paste the keys into **Settings**. They stay on the laptop and are encrypted by Windows or macOS.

## Install (for the writer)

1. Download the installer:
   - **Windows:** `Anuvaada-Setup-1.0.0-win-x64.exe`
   - **Mac:** `Anuvaada-Setup-1.0.0-mac-arm64.dmg` for M1/M2/M3/M4 Macs, or `…-mac-x64.dmg` for older Intel Macs
2. Install it:
   - **Windows:** double-click the .exe. If a blue "Windows protected your PC" box appears, click **More info → Run anyway**. This appears because the app has no paid code-signing certificate.
   - **Mac:** open the .dmg and drag Anuvaada into Applications. The first time, **right-click the app → Open → Open**.
3. Open Anuvaada, go to **Settings**, paste the keys and click **Save & test keys**. Both should show ✓.
4. Optional: in **Character & place names**, add the remake's names one per line, for example `மீனா = ಮೀನಾ`. Pick the Kannada style (Bengaluru, Mysuru, North Karnataka or formal) and the voices.

### Using it

- **Episode:** click **Open episode file** and wait. Kannada lines appear while the app works; a 20-minute episode usually takes a few minutes. Everything is saved automatically under **Saved work**.
  - ▶ plays the original Tamil for that line, 🔊 speaks the Kannada, and ↻ translates the line again.
  - Click a Kannada line to edit it. Lines you edited are kept when you choose **Re-translate all**.
  - **Export** options: Kannada script (.txt), script with Tamil and notes (.doc for Word), subtitles (.srt), a table (.csv for Excel), the Kannada voice for all lines (.wav), or a Kannada dub track timed to the episode (.wav).
- **Live:** choose **Sound playing on this laptop** or **Microphone**, then click **Start listening** and play the episode.
  - If **Speak Kannada aloud** is on, the app stops listening while it speaks, so it doesn't translate its own voice. Use headphones for the best result.
  - **Save as episode** turns a live session into an editable project.
  - **Mac users:** the first time you use "Sound playing on this laptop", macOS asks for *Screen & System Audio Recording* permission. Allow it in System Settings → Privacy & Security, then restart Anuvaada. This needs macOS 13 or newer; on older Macs, use Microphone mode.

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
                         Sarvam Bulbul TTS (kn-IN), male/female voice per line
```

- **Electron** desktop app with a sandboxed window. All network calls are made from the main process, so API keys never reach the web page.
- A bundled **ffmpeg** pulls the sound out of any episode file, including large mkv or mp4 files with AC3 or AAC audio, without loading the video into memory.
- Live capture runs in an AudioWorklet with an adaptive voice-activity chunker. It cuts after each line, or after at most 12 seconds.
- Translation model: `claude-opus-5-5`, with structured outputs. Episodes use `effort: medium`; Live uses `effort: low` for speed. If Claude refuses or can't be reached, that batch is translated by Sarvam instead and the app shows a warning.

## Developer guide

```bash
cd kannada-serial-translator
npm install
npm start                 # run the app
npm test                  # unit tests (segmenter, WAV, translator fallbacks)
xvfb-run -a node test/e2e.js        # full app run against mock Sarvam + Claude servers
xvfb-run -a node test/e2e-live.js   # live mode with a simulated microphone
npm run dist:win          # build Windows installer (run on Windows)
npm run dist:mac          # build macOS .dmg (run on a Mac)
```

The GitHub Actions workflow `.github/workflows/anuvaada-build.yml` builds the Windows `.exe` and macOS `.dmg` on GitHub's Windows and Mac machines and attaches them as downloadable artifacts. You can start it from the **Actions** tab with **Run workflow**.

For testing you can set keys with the environment variables `SARVAM_API_KEY` and `ANTHROPIC_API_KEY`, and point the app at other servers with `SARVAM_BASE_URL` and `ANTHROPIC_BASE_URL`.

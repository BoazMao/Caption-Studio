# Raccoon Studio

Raccoon Studio is a Windows desktop subtitle editor for turning a video into corrected, translated subtitles. Open a local video or download one from a URL, transcribe and align speech locally with WhisperX, edit captions against the video and waveform, translate into a second language, and export separate source and translated SRT files.

The current language choices are **English and Chinese**, with English-to-Chinese subtitling as the main workflow. Downloads, transcription, alignment, and translation run as cancellable background tasks so you can keep using the editor.

## What it does

- Video preview with playback, seeking, and frame stepping.
- A zoomable waveform timeline with caption dragging, trimming, splitting, merging, multi-selection, copy/paste, and undo/redo.
- Local WhisperX transcription followed automatically by forced alignment, retaining word timestamps and complete speech results in the project.
- Source and translation text side by side. Timeline blocks show source text until a translation is available.
- Translation through a configurable OpenAI-compatible API, with stale translations and failures flagged for review.
- Project save/reopen, autosave recovery, and separate SRT export for each language.

## Download and run

**Requirements:** Windows 10 or 11, 64-bit x64.

1. Open the [latest release](https://github.com/BoazMao/Raccoon-Studio/releases/latest).
2. Download `Raccoon-Studio-<version>-win-x64.zip` from **Assets**. The current release is [v0.1.1](https://github.com/BoazMao/Raccoon-Studio/releases/tag/v0.1.1).
3. Extract the entire ZIP. Keep the executable, DLLs, locales, and resources together.
4. Open the extracted `win-unpacked` folder and run **Raccoon Studio.exe**.
5. Open **Settings** to configure the dependencies for the features you want to use.

The v0.1.1 release includes Electron, FFmpeg, FFprobe, yt-dlp, whisper.cpp with its CPU runtime DLLs, the WhisperX worker, and manual WhisperX setup scripts. The new Settings installer described below is available in source and unpackaged builds; it is not yet included in v0.1.1. **Node.js is not required to run the downloaded app.** The Windows executable is unsigned. A `SHA256SUMS.txt` file is provided with each release to verify the ZIP.

## Dependencies

You can open videos, edit captions, save projects, and export subtitles using the downloaded app. WhisperX transcription and AI translation require additional setup:

| Dependency                             | Used for                                                                                                  | Included in the Windows release?                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Electron                               | Desktop application and video playback                                                                    | Yes                                                               |
| FFmpeg and FFprobe                     | Media inspection, waveform extraction, audio preparation, download merging, and compatible video previews | Yes; selected automatically                                       |
| 64-bit Python 3.10–3.13                | Running WhisperX locally                                                                                  | No                                                                |
| WhisperX 3.8.6 and Transformers 4.57.6 | Speech recognition and forced alignment                                                                   | Installed through Settings in new builds; manual script in v0.1.1 |
| Recognition and alignment models       | Recognizing speech and matching words to audio                                                            | No; downloaded on first use                                       |
| yt-dlp                                 | Video URL metadata preview and download                                                                   | Yes, since v0.1.1                                                 |
| whisper.cpp CPU fallback               | Optional transcription engine without Python                                                              | Yes, since v0.1.1; GGML models remain external                    |
| OpenAI-compatible endpoint and model   | AI translation                                                                                            | No; configure your provider and its API key where required        |

### Local transcription: WhisperX

In new builds, open **Settings** and click **Install WhisperX**. Progress and cancellation appear in the task panel. The app downloads its own private Python 3.12.14 and installs WhisperX 3.8.6, Transformers 4.57.6, and CPU PyTorch 2.8.0. You do not need to install Python yourself. After verification, the app selects the installed Python executable, WhisperX engine, and CPU automatically. A failed or cancelled attempt preserves the previous working runtime.

Allow at least **6.5 GB free disk space** for installation, including temporary downloads. Dependency downloads are approximately **600 MB** and the installed runtime occupies approximately **2.3 GB**, excluding models. These are approximate and can vary with dependency versions. The runtime lives under the app's user-data folder in `runtime/whisperx`, outside the application folder, so replacing the unpackaged app does not remove it. No administrator access or API key is required.

Click **Check WhisperX setup**, then choose a recognition model. The default is `medium`; `tiny.en` is a smaller English-only option. Use a multilingual model for Chinese audio. For v0.1.1 or a custom/GPU environment, follow the [manual setup instructions](WHISPERX_SETUP.md#manual-or-gpu-environment).

First use needs internet access to download recognition, speech-detection, sentence, and language-specific alignment data. Audio processing stays local. After warming the cache, **Use cached models only** prevents new model downloads. Models are downloaded separately; Python is installed privately by the Settings installer in new builds.

CPU mode does not require CUDA. NVIDIA GPU mode requires a compatible driver, CUDA libraries, and CUDA-enabled PyTorch; see [WhisperX setup, GPU, and offline instructions](WHISPERX_SETUP.md). GPU operation has not been benchmarked in this project.

The release includes the optional **whisper.cpp legacy fallback** (`whisper-cli.exe` v1.7.6 and its CPU runtime DLLs). Choose it in Settings and select a compatible `ggml-<model>.bin` model; models are not bundled. This engine is independent of Python and WhisperX. You may also select a custom executable from the [whisper.cpp releases](https://github.com/ggml-org/whisper.cpp/releases).

### URL imports: yt-dlp

The release includes yt-dlp 2026.08.19 and selects it automatically. You may select a custom executable in **Settings**. For a custom version, download `yt-dlp.exe` from the [official yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases) and select its path. FFmpeg for merging is already included.

Use **Video URL** to preview metadata, then **Download & import**. The final merged video is imported automatically. Some sites additionally require a JavaScript runtime or authentication; the app does not manage cookies or DRM.

### AI translation

In **Settings**, enter:

- Your provider's OpenAI-compatible base URL, such as `https://your-provider.example/v1`.
- An exact translation-capable model ID available from that provider.
- An API key if the provider requires one.

The app calls `/chat/completions`. HTTPS is required for remote providers; local servers may use loopback HTTP, such as `http://127.0.0.1:1234/v1`.

Translation sends caption text to the configured endpoint. Transcription does not upload audio. API keys are excluded from project files and encrypted in Windows settings; if encryption is unavailable, the key is kept only in memory.

## Basic workflow

1. **Import:** Open a local video or download one from a URL.
2. **Transcribe:** Choose the source language and run WhisperX. Recognition and forced alignment run before captions are imported.
3. **Correct:** Edit text and timing against the waveform and preview. After source edits, use **Re-align selection** or **Re-align all**. Overlap icons and **Check sync** flags identify captions to inspect.
4. **Translate and review:** Choose the target language, translate, correct the results, and mark captions reviewed. Source changes make existing translations stale.
5. **Save and export:** Save a `.captionproj` project, then export separate source and translated SRT files.

Project files retain both text tracks, timing, review status, speech results, and a compressed waveform. New builds reuse the saved waveform on reopen when the media path, size, modification time, and duration match, instead of decoding audio again. Older projects and missing or damaged waveform caches are analyzed once and saved with the next project save or autosave. Videos remain at their referenced paths; use **Relink video** if you move them. Autosave recovery is separate from explicit project saves. Existing Caption Studio projects and settings remain compatible.

Review timing and translations before final export. Export uses the current text, including any unreviewed or stale translations. One project, one video, and one target language are supported at a time.

Useful shortcuts: **Space** for play/pause, **Left/Right** for frame stepping, **N** for a new caption, **S** to split, **M** to merge, **Ctrl+A/C/X/V** for caption selection and clipboard operations, **Ctrl+Z/Y** for undo/redo, and **Ctrl+S** to save. Caption shortcuts preserve normal text editing when a text field has focus.

## Run from source

Development requires Windows x64, **Node.js 22 or newer**, npm, and Git. The application uses Electron, React, and TypeScript, with separate renderer, main-process, and shared IPC code.

```powershell
git clone https://github.com/BoazMao/Raccoon-Studio.git
cd Raccoon-Studio
npm ci
npm run dev
```

`npm ci` installs the locked JavaScript dependencies and the development FFmpeg/FFprobe binaries. Transcription, URL downloads, and translation still need the external dependencies above. Use Settings → Install WhisperX, or run the manual setup script from the repository root.

To rebuild the unpackaged app:

```powershell
npm run build
npm run prepare:tools
npx electron-builder --win dir
```

Run `release\win-unpacked\Raccoon Studio.exe`. `npm run package` builds the optional portable executable.

Development checks are `npm run typecheck`, `npm test`, and `npm run test:e2e`. See [verification results and integration prerequisites](VERIFICATION.md) for test coverage and external-tool tests.

## License and references

Raccoon Studio is [MIT licensed](LICENSE). Bundled FFmpeg is GPL-3.0-or-later; its license and build information are included under `resources/tools`. See [FFmpeg's licensing information](https://ffmpeg.org/legal.html).

New builds include whisper.cpp under MIT and the standalone yt-dlp executable under GPLv3+, with upstream source references, license texts, and third-party notices in `resources/tools`. The build downloads pinned upstream binaries and verifies their SHA-256 hashes; binaries and models are not committed to this repository.

[Subtitle Edit](https://github.com/SubtitleEdit/subtitleedit) and [SmartSub](https://github.com/buxuku/SmartSub) informed the media/job separation and transcription/translation workflows. The interface and implementation are original.

# Caption Studio

A Windows desktop subtitle editor built with Electron, React and TypeScript. The editor stays interactive during downloads, waveform extraction, transcription and translation.

## Run

Use Windows 10/11 x64 and Node.js 22 or newer with npm. In this folder:

```powershell
npm ci
npm run dev
```

`npm run build` produces `dist/`. `npm start` launches that build. To rebuild the unpacked desktop app, run `npm run build` then `npx electron-builder --win dir`; launch `release/win-unpacked/Caption Studio.exe`. `npm run package` produces an unsigned portable Windows executable under `release/`. The portable executable includes the application and Electron; external media tools and Whisper models are configured separately.

## Configure external tools

Open **Settings**. Enter executable paths or browse to each file. Keep any DLLs supplied with a tool beside its executable. No command-line flags belong in these fields.

| Setting | Requirement |
| --- | --- |
| FFmpeg | `ffmpeg.exe`, with the `libx264` video encoder and AAC encoder; required for waveform extraction, Whisper audio preparation, merging and compatible previews. Bundled in the portable app and selected automatically. [Official download page](https://ffmpeg.org/download.html). |
| FFprobe | `ffprobe.exe`, required to inspect duration and frame rate. Bundled in the portable app and selected automatically. |
| yt-dlp | `yt-dlp.exe`, needed only for URL preview/download. [Official releases](https://github.com/yt-dlp/yt-dlp/releases). Some sites additionally require a JavaScript runtime, authentication or cookies; this version does not manage cookies or DRM. |
| WhisperX Python | 64-bit Python 3.10–3.13 with WhisperX 3.8.6 installed. Run `scripts/setup-whisperx.ps1`, then select `.tools/whisperx/Scripts/python.exe` in Settings. See [setup and offline instructions](WHISPERX_SETUP.md). Python is external; the worker script is bundled. |
| WhisperX model | Default `medium`; faster-whisper model ID or local CTranslate2 directory. Transcription and language-specific alignment models download on first use to the configured cache. Use a multilingual model for Chinese. |
| whisper.cpp (legacy fallback) | `whisper-cli.exe`, with the release's DLLs. Tested with the CPU x64 build of [v1.7.6](https://github.com/ggml-org/whisper.cpp/releases/tag/v1.7.6). It must support `-m`, `-f`, `-l`, `-dtw`, `-ojf`, `-of` and `-pp`. |
| GGML model (legacy fallback only) | A compatible GGML `.bin` model with a standard `ggml-<model>.bin` filename, so the app can select its matching DTW alignment preset. Tested with [ggml-tiny.en.bin](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin), about 78 MB, and `ggml-medium.bin`. Use a multilingual model such as `ggml-base.bin` for non-English audio. Models are not downloaded by the app. |
| Translation | An OpenAI-compatible base URL, for example `https://your-provider.example/v1`, an exact model ID offered by that provider, and its API key if required. The app POSTs to `/chat/completions`. HTTPS is required except for loopback HTTP servers such as `http://127.0.0.1:1234/v1`. |

For development, FFmpeg and FFprobe binaries are installed by the test dependencies at `node_modules/ffmpeg-static/ffmpeg.exe` and `node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe`. The app selects them automatically. The portable app selects its bundled copies. These automatic choices are saved as portable settings, so the temporary extraction path can change between launches. If you previously saved bare `ffmpeg` or `ffprobe` command names in Settings, the app upgrades those values to its bundled paths on next launch. Explicit custom paths remain yours to manage.

Transcription never uploads audio. Translation sends subtitle text to your configured provider when you click **Translate**. API keys stay out of project files and are encrypted using Electron `safeStorage` on Windows; if encryption is unavailable, the key is kept in memory only.

## Workflow

1. **Open video**, or choose **Video URL**, preview its metadata, then **Download & import**. Choose a destination folder. Only the final `after_move` output is imported, after merging completes.
2. Play/pause, seek with the scrubber or waveform, and step by the detected frame interval. H.264/AAC MP4 playback was tested with real files. For unsupported codecs, the playback error offers **Create compatible preview**: an asynchronous, cancellable H.264/AAC conversion. It preserves the original media path. **Relink video** preserves captions if you move the original file.
3. Configure WhisperX in Settings (see [setup instructions](WHISPERX_SETUP.md)). Select English or Chinese as the source language. **Transcribe** runs local speech recognition followed automatically by WhisperX forced alignment and adds editable captions with audio-based start/end times. The task panel shows progress and supports cancellation. Low-confidence or non-monotonic token timing is marked **Check sync**. Re-running transcription adds another set; use Undo to remove an unwanted run.
4. Select a caption by clicking its row or timeline block. Type source and target text side by side. Timing inputs use seconds with milliseconds. Drag blocks to move them; drag either edge to trim. Place the playhead inside a caption to split it at the nearest aligned word boundary, or merge the selection with the next caption in time order. Source text and timing edits mark the prior token alignment **Check sync**. Overlaps are allowed and flagged with an exclamation mark and a tooltip showing a conflicting interval. One row of caption blocks overlays a normalized full-height waveform. Each block shows source text until translation is available, then shows its translation. Both text tracks remain editable and export separately. Ctrl-click or Shift-click selects multiple captions; dragging moves the selection together. Copy/cut/paste preserves linked text and relative timing, with paste anchored at the playhead; paste beyond the media end is rejected. Timeline zoom ranges from 1× to 256× and shows milliseconds at close zoom.
5. Select English or Chinese as the target language and click **Translate**. Reviewed captions are skipped; other captions are retried. Source changes mark existing translations stale. In-flight replies cannot overwrite newer source text, manual target edits or another target language. Failed captions retain any existing target text and expose an error.
6. Check each translation, then click its review indicator. **Needs review** filters the list. Changing source text or the target language invalidates applicable translations. Review is a human decision, never an automatic consequence of receiving AI output.
7. **Save project** writes a versioned `.captionproj` JSON document. **Open project** reopens it. Media remains externally referenced, so keep it at its saved location or relink it.
8. **Export SRT** asks for a source filename and then a separate target filename. Each track is time-sorted and exported as UTF-8 with BOM and millisecond timing. Empty text is omitted from that track; unreviewed/stale/failed target text is exported as currently visible. Check the untranslated count and review filter before final delivery.

## Keyboard controls

| Key | Action |
| --- | --- |
| Space | Play / pause |
| Left / Right | Previous / next frame interval |
| Up / Down | Previous / next caption and seek to it |
| N | New caption at playhead |
| S | Split selected caption at playhead |
| M | Merge selected caption with next |
| Ctrl+A / Ctrl+C / Ctrl+X / Ctrl+V | Select all / copy / cut / paste captions at playhead (timeline or caption list focus) |
| Ctrl-click / Shift-click | Toggle caption selection / select a range |
| Delete | Delete selected captions |
| Ctrl+Z / Ctrl+Shift+Z or Ctrl+Y | Undo / redo |
| Ctrl+S / Ctrl+Shift+S | Save / Save as |

Editing shortcuts are suppressed inside text fields, so typing and native text undo work normally. All visible controls can be reached with Tab. Timeline blocks support Enter to select and seek. Frame stepping uses the detected average FPS; for variable-frame-rate media, create a constant-frame-rate compatible preview for consistent stepping.

## Autosave and recovery

Edits autosave after 700 ms of inactivity. Closing the window flushes the current project before quitting. Startup offers **Restore session**, and does not overwrite that recovery while the choice is pending. Autosave is separate from an explicitly saved project; Ctrl+S updates the named project.

Electron's `userData` folder (normally `%APPDATA%/caption-studio`) contains:

- `settings.json`: paths, endpoint configuration and encrypted key.
- `recovery.captionproj`: latest session recovery.
- `recovery/<project UUID>.captionproj`: per-project recovery copies, retained when changing projects.
- `cache/`: temporary Whisper audio and compatible playback copies. Whisper temporary files are removed after completion or cancellation. Successful playback copies remain because projects reference them.

No media is embedded in project files. Jobs do not resume after restarting; completed captions and translations are recovered. Undo history is session-only and bounded to 100 snapshots.

## Architecture

- `src/renderer/`: React workspace, playback, waveform canvas, timeline gestures and edit history. No Node or filesystem access.
- `src/shared/`: typed IPC request/event contracts, project validation, caption operations and SRT codecs.
- `src/main/main.ts`: native dialogs, validated IPC, restricted range-enabled media protocol, tool adapters and translation HTTP requests.
- `src/main/jobs.ts`: asynchronous `spawn(executable, argumentArray, {shell:false})`, progress and cancellation. Windows cancellation kills the process tree, including children started by yt-dlp.
- `src/main/storage.ts`: schema validation and serialized atomic project writes using temporary files and rename.
- `src/main/preload.ts`: the narrow context-isolated bridge. Node integration is disabled and renderer sandboxing is enabled.

Architectural references were [Subtitle Edit's Whisper model adapters](https://github.com/SubtitleEdit/subtitleedit/tree/main/src/libuilogic/AudioToText) and [SmartSub's main-process task/media helpers](https://github.com/buxuku/SmartSub/tree/main/main/helpers). The project/job/media separation informed this implementation; no UI or implementation code was copied.

## Verification

```powershell
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Fifteen core tests cover real disk roundtrips and concurrent writes, timing validation, aligned split and edit invalidation, stale and racing translations, SRT output, shell metacharacters and real child-process cancellation. The Electron test generates a real H.264/AAC video with FFmpeg and checks playback, pause, seek, frame stepping, waveform readiness, caption edits, save/reopen, pointer dragging, split/merge and undo/redo.

`npm run test:pipeline` additionally uses official tools and the public whisper.cpp `jfk.wav` sample. Place `yt-dlp.exe`, `jfk.wav`, `ggml-tiny.en.bin`, and `whisper/Release/whisper-cli.exe` with its DLLs under `.tools/test-assets/`. This ignored local folder travels with the checkout when it is moved. The integration test serves a local DASH stream, verifies actual separate-stream download and FFmpeg merging, runs actual whisper.cpp transcription in legacy mode (set `TEST_WHISPERX=1` for WhisperX recognition, forced alignment and re-alignment; see [WhisperX setup](WHISPERX_SETUP.md)) with editable caption import, then verifies translation failures/retries/review/export/cancellation against a local mock HTTP endpoint. It does not verify AI translation quality or any paid provider's credentials.

Validated in this workspace: TypeScript checks, all fifteen core tests, both Electron integration suites, and a clean npm dependency audit. Screenshots are saved as `verification.png` and `workflow-verification.png`.

## Version-one limits

Single project and video at a time; one translation language per project. Use **Re-align selection** or **Re-align all** after correcting source text. WhisperX preserves linked translations and flags incomplete alignment for review; check these cues against the waveform. Native video codecs depend on Electron; compatible previews require an FFmpeg build with libx264. Large projects render the caption list without virtualization. WhisperX Python, model/cache choices, yt-dlp and provider credentials are managed explicitly in Settings. whisper.cpp remains available as a legacy fallback. The bundled FFmpeg binary is GPL-3.0-or-later; its license and build information are in the portable app's `resources/tools` folder. FFmpeg source and licensing information are available from [FFmpeg](https://ffmpeg.org/). The portable app is unsigned.

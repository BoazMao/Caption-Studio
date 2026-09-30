# Verification — 30 September 2026

Tested on Windows x64 using Electron 44.4.5 and Node.js 24.19.0.

| Check | Result |
| --- | --- |
| TypeScript (`tsc --noEmit`) | Passed |
| Core automated tests | 22 passed, 0 failed |
| Dependency audit | 0 known vulnerabilities at installation/audit time |
| Real H.264/AAC video | Play, pause, seek and 30-fps frame stepping passed |
| Waveform | Real FFmpeg PCM extraction and displayed peaks passed |
| Timeline | Group drag, split, merge, clipboard shortcuts, bulk delete, undo/redo, icon-only overlap warnings with independent selection highlighting and waveform overlay/zoom passed; one block row shows source until replaced by target text |
| Persistence | Unicode roundtrip, ordered concurrent writes and UI save/reopen passed |
| Translation state | Stale marking, manual-edit protection, failure, retry and review passed |
| Download | Real yt-dlp metadata and fresh local DASH download, separate audio/video merging, final-file import passed |
| Local speech | Real WhisperX 3.8.6 CPU transcription and forced alignment of the JFK sample using tiny.en passed, including cached offline mode and Electron caption import/re-alignment. Multilingual tiny plus Chinese alignment also completed on synthetic Mandarin speech. GPU and broader natural-speech timing accuracy were not benchmarked. Legacy whisper.cpp validation remains available. |
| Translation transport | OpenAI-compatible local mock endpoint passed; no live AI provider or translation quality claim |
| Export | Separate source and target SRT files verified on disk |
| Cancellation | Real child-process tree and in-flight HTTP request cancellation passed |
| Compatible preview | FFmpeg H.264/AAC conversion and playback of the resulting file passed |
| Packaged application | Fresh profile and saved bare `ffmpeg`/`ffprobe` settings selected bundled tools automatically; ASAR/preload launch, bundled WhisperX worker/runtime setup check, real video playback and waveform passed |
| Raccoon Studio branding | Supplied ICO copied byte-for-byte; header icon and window title verified in development and unpacked builds; profile migration and legacy clipboard compatibility passed |
| Portable executable | Previous build only; not rebuilt for the WhisperX migration. Use the current unpacked app. |

The editor was launched and visually inspected from real Electron screenshots. Layout was adjusted so the video, linked text tracks, full-width timeline and compact task panel remain usable at the tested desktop size. Test-only native file dialogs are replaced by deterministic return values inside Playwright; the actual IPC, filesystem, media protocol and processing code runs unchanged.

The source archive contains reproducible tests. `scripts/e2e.cjs` generates its own media fixture. `scripts/pipeline.cjs` requires the external assets documented in README. `node scripts/package-smoke.cjs` validates `release/win-unpacked/Raccoon Studio.exe` after packaging. WhisperX is now the default engine and provides a separate forced-alignment stage plus re-alignment of corrected source text. Tests cover preserved IDs/translations, stale result protection, exact sentence text, 50 ms padding and short gaps, genuine overlaps, missing word times, full raw archives, replacement/edit races, Chinese character import, and save/reopen. Legacy DTW project data remains readable.

This workspace already contains the tools used for verification. Source-development paths are:

```text
FFmpeg:      node_modules\ffmpeg-static\ffmpeg.exe
FFprobe:     node_modules\ffprobe-static\bin\win32\x64\ffprobe.exe
yt-dlp:      .tools\test-assets\yt-dlp.exe
whisper.cpp: .tools\test-assets\whisper\Release\whisper-cli.exe
Legacy model: .tools\test-assets\ggml-tiny.en.bin
WhisperX:    .tools\whisperx\Scripts\python.exe
Test cache:  .tools\test-assets\whisperx-models
```

These paths are relative to the project folder. The unpacked app includes FFmpeg, FFprobe and the WhisperX worker. It discovers this checkout's Python environment automatically; Python and model caches are not bundled or committed. Fresh installations need the environment from [WhisperX setup](WHISPERX_SETUP.md), internet access for first model use (default medium), and yt-dlp for URL download. CPU tests used tiny models, not the default medium. Translation additionally needs a configured provider/model and, where required, an API key. No live-provider translation quality test was performed.

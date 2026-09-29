# Verification — 29 September 2026

Tested on Windows x64 using Electron 44.4.5 and Node.js 24.19.0.

| Check | Result |
| --- | --- |
| TypeScript (`tsc --noEmit`) | Passed |
| Core automated tests | 10 passed, 0 failed |
| Dependency audit | 0 known vulnerabilities at installation/audit time |
| Real H.264/AAC video | Play, pause, seek and 30-fps frame stepping passed |
| Waveform | Real FFmpeg PCM extraction and displayed peaks passed |
| Timeline | Pointer drag, split, merge, undo and redo passed |
| Persistence | Unicode roundtrip, ordered concurrent writes and UI save/reopen passed |
| Translation state | Stale marking, manual-edit protection, failure, retry and review passed |
| Download | Real yt-dlp metadata and fresh local DASH download, separate audio/video merging, final-file import passed |
| Local speech | Real whisper.cpp v1.7.6 CPU binary plus tiny.en model transcribed the public JFK sample with DTW token alignment; aligned cue start was imported into the editor |
| Translation transport | OpenAI-compatible local mock endpoint passed; no live AI provider or translation quality claim |
| Export | Separate source and target SRT files verified on disk |
| Cancellation | Real child-process tree and in-flight HTTP request cancellation passed |
| Compatible preview | FFmpeg H.264/AAC conversion and playback of the resulting file passed |
| Packaged application | Fresh profile and saved bare `ffmpeg`/`ffprobe` settings selected bundled tools automatically; ASAR/preload launch, real video playback and waveform passed |
| Portable executable | Built successfully, launched directly and inspected through the Windows desktop UI |

The editor was launched and visually inspected from real Electron screenshots. Layout was adjusted so the video, linked text tracks, full-width timeline and compact task panel remain usable at the tested desktop size. Test-only native file dialogs are replaced by deterministic return values inside Playwright; the actual IPC, filesystem, media protocol and processing code runs unchanged.

The source archive contains reproducible tests. `scripts/e2e.cjs` generates its own media fixture. `scripts/pipeline.cjs` requires the external assets documented in README. `node scripts/package-smoke.cjs` validates `release/win-unpacked/Caption Studio.exe` after packaging. Alignment uses Whisper's DTW token timestamps during transcription; manually rewritten text is marked for sync review, not automatically forced-aligned again.

This workspace already contains the tools used for verification. Source-development paths are:

```text
FFmpeg:      node_modules\ffmpeg-static\ffmpeg.exe
FFprobe:     node_modules\ffprobe-static\bin\win32\x64\ffprobe.exe
yt-dlp:      .tools\test-assets\yt-dlp.exe
whisper.cpp: .tools\test-assets\whisper\Release\whisper-cli.exe
Model:       .tools\test-assets\ggml-tiny.en.bin
```

These paths are relative to the project folder. The portable executable includes FFmpeg and FFprobe and selects them automatically. Use **Browse** for yt-dlp, whisper.cpp and a model. The test tools/model under `.tools/test-assets` are ignored by Git and are not included in the source ZIP or portable executable. Fresh installations must provide yt-dlp, whisper.cpp and a compatible Whisper model as described in README. Translation additionally needs a configured provider/model and, where required, an API key.

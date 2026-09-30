# WhisperX migration plan

## Implementation status

Implemented: default WhisperX adapter, cancellable transcription/forced alignment, corrected-text re-alignment, versioned result validation, legacy project compatibility, settings checks and offline cache controls. See [WHISPERX_SETUP.md](WHISPERX_SETUP.md) for installation. The legacy whisper.cpp fallback remains available while broader timing benchmarks and GPU validation are pending.

## Decision

Move Raccoon Studio's default local transcription and alignment workflow to WhisperX. The current whisper.cpp DTW token timing is not accurate enough for the intended subtitle workflow. Keep whisper.cpp available during migration so existing setups remain usable; remove or demote it only after WhisperX passes the Windows and English/Chinese checks below.

## Target workflow

1. Convert the imported media to local 16 kHz mono audio with the existing cancellable FFmpeg job.
2. Run WhisperX transcription and its separate forced-alignment pass in a cancellable background process. Expose transcription and alignment as distinct stages in the task panel. Do not import partially aligned captions as if they were complete.
3. Import WhisperX word/character timings into stable caption IDs. Group them into readable subtitle cues while retaining the underlying timing units for later split and timing edits. For Chinese, preserve character-level units when the aligner does not produce space-delimited words.
4. Flag words or captions that the aligner could not time, and never silently invent a precise timestamp. Keep the source text, target text, review state, and project autosave behavior intact.
5. Add **Re-align selection** and **Re-align all** for source text corrected after transcription. Align against the local audio using the corrected source text and existing approximate caption windows; update timing only after the job succeeds. Mark translations stale only when source text changes, not merely because timing was refined.

## Implementation sequence

- Introduce a versioned transcription/alignment result contract in `src/shared/` so the renderer and project file do not depend on WhisperX's raw JSON shape. Migrate existing `whisper-dtw` project data without dropping captions.
- Add a WhisperX adapter in the Electron main process. Launch Python/WhisperX with argument arrays, stream stage progress, cancel the entire process tree, and clean temporary audio/output on success, failure, and cancellation. Keep media processing off the renderer thread.
- Add Settings checks for the Python environment, WhisperX, ASR model, and language-specific alignment models. Document model downloads/cache and offline behavior. WhisperX uses a different model/runtime format from the current GGML `.bin` setup; do not present the existing model path as reusable.
- Make WhisperX the default once it passes validation. Retain a clearly labeled whisper.cpp fallback during transition, then decide whether its maintenance cost justifies keeping it.

## Validation gate

- Benchmark both paths on manually timed English and Chinese clips, including pauses, music/noise, numbers, punctuation, and overlapping speech. Compare transcription errors, missing alignments, and start/end boundary error against the same reference annotations; visually inspect the outliers in the editor.
- Verify CPU-only Windows operation and NVIDIA acceleration where available, model setup from a fresh machine, offline use after models are cached, cancellation, failure recovery, autosave/reopen, and separate SRT export.
- Add unit tests for alignment import, missing timestamps, corrected-text re-alignment, ID/translation preservation, and migration of existing projects, plus a real-audio Electron integration test. Do not remove whisper.cpp until WhisperX gives a clear timing improvement without unacceptable transcription regressions on both supported source languages.

WhisperX upstream: https://github.com/m-bain/whisperX

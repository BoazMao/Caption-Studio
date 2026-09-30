# WhisperX setup

WhisperX is the default speech engine. The existing whisper.cpp engine remains selectable as a legacy fallback. Existing projects, caption IDs, translations and review states are preserved.

## One-click Windows CPU setup

In the new source/unpackaged build, open **Settings → Install WhisperX**. This downloads a checksum-verified uv installer, private Python 3.12.14, CPU PyTorch/torchaudio 2.8.0, torchvision 0.23.0, WhisperX 3.8.6, and Transformers 4.57.6. A setup check imports recognition and alignment modules before activation. The selected engine, Python executable and CPU device are saved automatically. It does not change system Python, PATH or registry configuration.

Progress and cancellation appear in the task panel. Repeated clicks do not start a second simultaneous installation. Failed/cancelled installations remove their incomplete environment and retain the previous active runtime. Reinstall creates and verifies a new environment before selecting it; previous successful environments remain available on disk.

Internet access and at least 6.5 GB free disk space are required. Expect approximately 600 MB of dependency downloads and 2.3 GB installed, before models. The managed runtime is in the app's user-data folder under `runtime/whisperx`. No separate Python installation, administrator access, or API key is required. Model downloads occur on first transcription, not during runtime installation. The installer selects CPU; it does not install CUDA support.

Published v0.1.1 does not include this button; use the manual setup below with that release.

## Manual or GPU environment

Install 64-bit Python 3.10–3.13, then run from the project directory:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-whisperx.ps1
```

The script creates `.tools/whisperx` and installs WhisperX 3.8.6. To select a specific Python installation, pass `-Python 'C:\path\to\python.exe'`. In Settings, choose **WhisperX**, point **WhisperX Python executable** to `.tools\whisperx\Scripts\python.exe`, select **CPU**, and click **Check WhisperX setup**. The unpacked app includes the worker script; this manual route requires your own Python installation. Models are downloaded separately.

The model field accepts a faster-whisper model ID (for example `medium`, `large-v3`, `tiny.en`) or a local CTranslate2 model directory. GGML `.bin` files from whisper.cpp are not compatible. Use a multilingual model for Chinese. The default model is `medium`; smaller models trade recognition quality for lower CPU and memory requirements.

## Downloads and offline use

First use downloads the selected transcription model, Silero speech detection, sentence data, and a language-specific forced-alignment model into the configured cache. English uses `facebook/wav2vec2-base-960h`; Mandarin Chinese uses `jonatasgrosman/wav2vec2-large-xlsr-53-chinese-zh-cn`. Chinese alignment units are characters. These downloads require internet access and can be large. Transcription, alignment and audio remain local.

Once the required models have been used, enable **Use cached models only**. Missing cache data produces an error instead of silently downloading. A Python setup check confirms the runtime imports and selected device; it does not download or validate every model. Speaker diarization is not enabled and no Hugging Face token is required for the chosen public models.

## GPU setup

NVIDIA acceleration requires a compatible driver, CUDA libraries and CUDA-enabled PyTorch in the selected environment. Follow [WhisperX's installation instructions](https://github.com/m-bain/whisperX#setup-) for its supported versions. Select **NVIDIA GPU (CUDA)** and run the setup check. CPU mode does not require CUDA.

## Editing workflow

**Transcribe** prepares audio, recognizes speech, and aligns it before importing captions. The importer uses each returned aligned sentence as one block, preserving its exact text. It does not cut at length, duration or pause thresholds. Long blocks remain available for manual splitting. Progress and cancellation remain in the task panel. Missing or low-confidence alignment is marked **Check sync**; missing word times are not fabricated.

After correcting source text, select captions and click **Re-align selection**, or use **Re-align all**. Re-alignment uses the existing approximate time window with 0.5 seconds of context on each side. Large timing mistakes need a rough manual adjustment first. Results never overwrite source/timing edits made during the job. Target edits and review state are preserved. Source text changes still invalidate translation normally.

The timeline has one row of blocks: source text initially, translated text once available. Source and translation remain side by side in the editor and export as separate SRT files.

## Reproducible integration test

With the assets from README and the Python environment installed:

```powershell
$env:TEST_WHISPERX='1'
npm run build
npm run test:pipeline
```

The test uses `tiny.en`, real speech and forced alignment, re-alignment, then a mock translation endpoint. Warm the model cache before running if first-time downloads exceed the test timeout. This verifies integration, not translation quality or timing accuracy on all recordings.

## Result preservation and padding

Projects embed `speechRuns`: full returned transcription results, full per-input alignment results (including word/character details and additional fields), model/device/version metadata, and immutable imported caption snapshots. Re-alignment stores a separate run with its corrected source input. JSON-incompatible NaN/infinity values are retained as null. No new Chinese sentence detection is applied.

Aligned sentence times receive 50 ms padding at each end, clipped to media boundaries. Adjacent non-overlapping sentences share short gaps so padding cannot introduce overlap. Actual overlapping speech remains unchanged and is flagged by the editor. Missing word times stay missing; unavailable sentence times use an explicitly flagged approximate input window for review. Unusable results are retained with an import error and do not replace existing captions.

When captions exist, choose **Replace captions** or **Add captions** before transcription. Both changes support Undo/Redo. If captions change during replacement, results are archived but current edits are preserved. Raw archives increase project size and remain out of SRT exports. Previously saved projects cannot recover raw results that were discarded by earlier app versions; transcribe again to create the new archives.

## Installer verification

`npm run test:install` runs an opt-in network test that performs an actual installation in an isolated ignored test profile, checks duplicate prevention and automatic selection, and reopens the app to verify persistence. Build the app first. Unit tests cover failed verification, cancellation during dependency installation, preservation of the previous runtime, and invalid manifest paths.

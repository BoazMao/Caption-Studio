# WhisperX setup

WhisperX is the default speech engine. The existing whisper.cpp engine remains selectable as a legacy fallback. Existing projects, caption IDs, translations and review states are preserved.

## Windows CPU setup

Install 64-bit Python 3.10–3.13, then run from the project directory:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-whisperx.ps1
```

The script creates `.tools/whisperx` and installs WhisperX 3.8.6. To select a specific Python installation, pass `-Python 'C:\path\to\python.exe'`. In Settings, choose **WhisperX**, point **WhisperX Python executable** to `.tools\whisperx\Scripts\python.exe`, select **CPU**, and click **Check WhisperX setup**. The unpacked app includes the worker script; Python and the models remain external prerequisites.

The model field accepts a faster-whisper model ID (for example `medium`, `large-v3`, `tiny.en`) or a local CTranslate2 model directory. GGML `.bin` files from whisper.cpp are not compatible. Use a multilingual model for Chinese. The default model is `medium`; smaller models trade recognition quality for lower CPU and memory requirements.

## Downloads and offline use

First use downloads the selected transcription model, Silero speech detection, sentence data, and a language-specific forced-alignment model into the configured cache. English uses `facebook/wav2vec2-base-960h`; Mandarin Chinese uses `jonatasgrosman/wav2vec2-large-xlsr-53-chinese-zh-cn`. Chinese alignment units are characters. These downloads require internet access and can be large. Transcription, alignment and audio remain local.

Once the required models have been used, enable **Use cached models only**. Missing cache data produces an error instead of silently downloading. A Python setup check confirms the runtime imports and selected device; it does not download or validate every model. Speaker diarization is not enabled and no Hugging Face token is required for the chosen public models.

## GPU setup

NVIDIA acceleration requires a compatible driver, CUDA libraries and CUDA-enabled PyTorch in the selected environment. Follow [WhisperX's installation instructions](https://github.com/m-bain/whisperX#setup-) for its supported versions. Select **NVIDIA GPU (CUDA)** and run the setup check. CPU mode does not require CUDA.

## Editing workflow

**Transcribe** prepares audio, recognizes speech, and aligns it before importing captions. Progress and cancellation remain in the task panel. Missing or low-confidence alignment is marked **Check sync**; missing word times are not fabricated.

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

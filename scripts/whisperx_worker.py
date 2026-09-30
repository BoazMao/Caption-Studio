"""Caption Studio's local worker. stdout protocol: STUDIO:<JSON>, one line/event."""
import gc
import importlib.metadata
import json
import math
import os
from pathlib import Path
import sys
import wave


def progress(percent, message):
    print("STUDIO:" + json.dumps({"progress": percent, "message": message}), flush=True)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    request = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    cache = Path(request["cache"])
    cache.mkdir(parents=True, exist_ok=True)
    os.environ["HF_HOME"] = str(cache / "huggingface")
    os.environ["NLTK_DATA"] = str(cache / "nltk")
    if request.get("offline"):
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
    progress(16, "Loading WhisperX runtime")
    import numpy as np
    import torch
    import whisperx
    import nltk
    torch.hub.set_dir(str(cache / "torch"))
    nltk.data.path.insert(0, str(cache / "nltk"))
    device = request["device"]
    if device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA is not available in this Python environment. Select CPU or install CUDA-enabled PyTorch.")
    if request.get("check"):
        # Import the actual inference modules too, to catch incompatible dependencies.
        from whisperx.asr import load_model
        from whisperx.alignment import load_align_model
        progress(100, f"WhisperX {importlib.metadata.version('whisperx')} ready on {device}. Models load on first transcription.")
        return
    try:
        nltk.data.find("tokenizers/punkt_tab/english/")
    except LookupError:
        if request.get("offline"):
            raise RuntimeError("Offline cache lacks NLTK punkt_tab. Run once with offline mode disabled.")
        progress(18, "Downloading sentence data for alignment")
        if not nltk.download("punkt_tab", download_dir=str(cache / "nltk"), quiet=True):
            raise RuntimeError("Could not download NLTK sentence data")
    with wave.open(request["audio"], "rb") as wav:
        if (wav.getnchannels(), wav.getframerate(), wav.getsampwidth()) != (1, 16000, 2):
            raise RuntimeError("Expected 16 kHz mono PCM audio")
        audio = np.frombuffer(wav.readframes(wav.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    originals = request.get("captions")
    if originals is None:
        # WhisperX loads Silero via torch.hub. Resolve cached code locally so offline mode never probes GitHub.
        hub_load = torch.hub.load
        def cached_hub_load(repo_or_dir, *args, **kwargs):
            if repo_or_dir == "snakers4/silero-vad":
                cached = next((p for p in (cache / "torch").glob("snakers4_silero-vad_*") if (p / "hubconf.py").exists()), None)
                if cached:
                    kwargs.pop("trust_repo", None)
                    kwargs.pop("force_reload", None)
                    return hub_load(str(cached), *args, source="local", **kwargs)
                if request.get("offline"):
                    raise RuntimeError("Offline cache lacks Silero VAD. Transcribe once with offline mode disabled.")
            return hub_load(repo_or_dir, *args, **kwargs)
        torch.hub.load = cached_hub_load
        progress(20, "Loading transcription model (first use may download)")
        model = whisperx.load_model(request["model"], device, compute_type="float16" if device == "cuda" else "int8",
            language=request["language"], vad_method="silero", download_root=str(cache / "asr"),
            local_files_only=request.get("offline", False))
        progress(30, "Transcribing speech locally")
        result = model.transcribe(audio, batch_size=4 if device == "cuda" else 1, language=request["language"], progress_callback=lambda n: progress(30 + n * 0.3, "Transcribing speech locally"))
        segments = result["segments"]
        del model
        gc.collect()
        if device == "cuda":
            torch.cuda.empty_cache()
    else:
        segments = [{"start": max(0, c["start"] - 0.5), "end": min(len(audio)/16000, c["end"] + 0.5), "text": c["source"], "id": c["id"]} for c in originals]
    if not segments:
        Path(request["output"]).write_text(json.dumps({"version": 1, "language": request["language"], "segments": []}), encoding="utf-8")
        progress(99, "No speech detected")
        return
    progress(65, "Loading forced-alignment model (first use may download)")
    # HF models support local_files_only consistently; English and Mandarin caches stay separate.
    align_name = "facebook/wav2vec2-base-960h" if request["language"] == "en" else "jonatasgrosman/wav2vec2-large-xlsr-53-chinese-zh-cn"
    align_model, metadata = whisperx.load_align_model(request["language"], device,
        model_name=align_name, model_dir=str(cache / "alignment"), model_cache_only=request.get("offline", False))
    aligned = []
    for index, segment in enumerate(segments):
        result = whisperx.align([segment], align_model, metadata, audio, device,
            interpolate_method="ignore", return_char_alignments=False)
        words = [w for s in result["segments"] for w in s.get("words", [])]
        def finite(value):
            return float(value) if value is not None and math.isfinite(float(value)) else None
        aligned.append({"id": segment.get("id"), "start": segment["start"], "end": segment["end"], "text": segment["text"],
            "units": [{"text": w["word"], "start": finite(w.get("start")), "end": finite(w.get("end")), "confidence": finite(w.get("score"))} for w in words]})
        progress(65 + 32 * (index + 1) / max(1, len(segments)), f"Aligning speech {index + 1}/{len(segments)}")
    Path(request["output"]).write_text(json.dumps({"version": 1, "language": request["language"], "segments": aligned}, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    progress(99, "Alignment complete")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"WhisperX: {error}", file=sys.stderr, flush=True)
        sys.exit(1)

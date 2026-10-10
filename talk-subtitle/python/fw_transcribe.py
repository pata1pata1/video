"""talk-subtitle: faster-whisper speech-to-text backend (the standard on Windows).

Called by src/stt.ts with talk-subtitle/.venv's Python:

    python -I python/fw_transcribe.py --wav <16 kHz mono 16-bit WAV> --out <json>
        [--model large-v3-turbo] [--language ja] [--prompt "..."]
        [--threads 6] [--compute-type int8] [--beam-size 5]
        [--models-dir .local/models] [--offline]
    python -I python/fw_transcribe.py --check            (environment report, JSON on stdout)
    python -I python/fw_transcribe.py --download-only    (fetch the model, then exit)

Fully local: the only network access is the one-time model download from
Hugging Face (skipped with --offline once the model is present).

Why there is no PyAV here
-------------------------
Smart App Control blocks PyAV's DLLs on the Windows PC this tool runs on, and
its settings are not to be changed. faster_whisper imports `av` when the package
is loaded, but only uses it inside decode_audio() to read media files. This
wrapper never passes a file to faster-whisper: talk-subtitle already makes
audio/source-16k.wav with ffmpeg, which is read here with the standard `wave`
module and handed over as a float32 sample array. So before faster_whisper is
imported, `av` is registered as a placeholder module (install_pyav_placeholder),
which keeps the import working without loading any PyAV DLL. faster-whisper's
own files are not modified.
"""

import argparse
import json
import os
import sys
import time
import types
import wave

SAMPLE_RATE = 16000


class _PyAVNotUsed(types.ModuleType):
    """Stands in for the `av` package. Any real use is a bug in this wrapper."""

    def __getattr__(self, name):
        raise AttributeError(
            f"av.{name}: PyAV is not used by talk-subtitle (its DLLs are blocked by Smart App Control). "
            "Pass decoded samples to faster-whisper instead of a file path."
        )


def install_pyav_placeholder():
    """Called at the very start of main(), before `import faster_whisper`. Never imports the real PyAV
    (trying would make Windows block a DLL load and show a notification)."""
    sys.modules["av"] = _PyAVNotUsed("av")


def read_wav(path):
    """16 kHz mono 16-bit PCM WAV → float32 numpy array in [-1, 1]."""
    import numpy as np

    with wave.open(path, "rb") as w:
        rate, channels, width = w.getframerate(), w.getnchannels(), w.getsampwidth()
        if (rate, channels, width) != (SAMPLE_RATE, 1, 2):
            raise SystemExit(
                f"{path}: expected 16 kHz mono 16-bit WAV, got {rate} Hz / {channels} ch / {width * 8}-bit. "
                "Re-run `npm run analyze` to regenerate audio/source-16k.wav."
            )
        frames = w.readframes(w.getnframes())
    return np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0


def load_model(args):
    from faster_whisper import WhisperModel

    return WhisperModel(
        args.model,
        device="cpu",
        compute_type=args.compute_type,
        cpu_threads=args.threads,
        download_root=args.models_dir,
        local_files_only=args.offline,
    )


def check(args):
    import ctranslate2
    import faster_whisper

    print(json.dumps({
        "python": sys.version.split()[0],
        "executable": sys.executable,
        "fasterWhisper": faster_whisper.__version__,
        "ctranslate2": ctranslate2.__version__,
        "cpuComputeTypes": sorted(ctranslate2.get_supported_compute_types("cpu")),
        "pyav": "placeholder (not loaded)",
    }))


def transcribe(args):
    import ctranslate2
    import faster_whisper

    audio = read_wav(args.wav)
    duration = len(audio) / SAMPLE_RATE
    t0 = time.time()
    model = load_model(args)
    t1 = time.time()
    segments, info = model.transcribe(
        audio,
        language=None if args.language == "auto" else args.language,
        initial_prompt=args.prompt or None,
        beam_size=args.beam_size,
        word_timestamps=True,
        vad_filter=False,
    )
    out_segments = []
    last_pct = -1
    for s in segments:  # a generator: decoding happens while iterating
        out_segments.append({
            "start": s.start,
            "end": s.end,
            "text": s.text,
            "avgLogprob": s.avg_logprob,
            "noSpeechProb": s.no_speech_prob,
            "words": [{"text": w.word, "start": w.start, "end": w.end, "probability": w.probability} for w in (s.words or [])],
        })
        pct = int(min(1.0, s.end / duration) * 100) if duration else 100
        if pct // 10 > last_pct // 10:
            last_pct = pct
            print(f"progress = {pct}%", file=sys.stderr, flush=True)
    t2 = time.time()
    result = {
        "engine": {
            "name": "faster-whisper",
            "version": faster_whisper.__version__,
            "ctranslate2": ctranslate2.__version__,
            "model": args.model,
            "device": "cpu",
            "computeType": args.compute_type,
            "threads": args.threads,
            "beamSize": args.beam_size,
        },
        # Echoed back so the caller can verify the glossary prompt arrived intact.
        "promptReceived": args.prompt,
        # Proof that the real PyAV was never loaded in this run.
        "pyavPlaceholderActive": isinstance(sys.modules.get("av"), _PyAVNotUsed),
        "language": info.language,
        "languageProbability": info.language_probability,
        "durationSeconds": duration,
        "loadSeconds": t1 - t0,
        "transcribeSeconds": t2 - t1,
        "segments": out_segments,
    }
    tmp = args.out + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)
    os.replace(tmp, args.out)


def main():
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--wav")
    p.add_argument("--out")
    p.add_argument("--model", default="large-v3-turbo")
    p.add_argument("--language", default="ja")
    p.add_argument("--prompt", default="")
    p.add_argument("--threads", type=int, default=6)
    p.add_argument("--compute-type", default="int8")
    p.add_argument("--beam-size", type=int, default=5)
    p.add_argument("--models-dir", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".local", "models"))
    p.add_argument("--offline", action="store_true")
    p.add_argument("--check", action="store_true")
    p.add_argument("--download-only", action="store_true")
    args = p.parse_args()

    # First thing, before any code path can import faster_whisper.
    install_pyav_placeholder()

    os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
    if args.offline:
        os.environ["HF_HUB_OFFLINE"] = "1"

    if args.check:
        check(args)
    elif args.download_only:
        load_model(args)
        print(json.dumps({"model": args.model, "modelsDir": os.path.abspath(args.models_dir), "ready": True}))
    else:
        if not args.wav or not args.out:
            p.error("--wav and --out are required")
        transcribe(args)


if __name__ == "__main__":
    main()

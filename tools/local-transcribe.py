import argparse
import json
import os
import sys
from pathlib import Path

os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

from faster_whisper import WhisperModel
from huggingface_hub import snapshot_download


def main():
    parser = argparse.ArgumentParser(description="Transcribe lesson audio locally with faster-whisper.")
    parser.add_argument("audio", nargs="+")
    parser.add_argument("--model", default="small.en")
    parser.add_argument("--model-directory", required=True)
    args = parser.parse_args()

    model_path = Path(args.model_directory) / args.model
    if not (model_path / "model.bin").is_file():
        print(f"Downloading local Whisper model {args.model} (one time only)...", file=sys.stderr, flush=True)
        try:
            snapshot_download(
                repo_id=f"Systran/faster-whisper-{args.model}",
                local_dir=model_path,
                max_workers=1,
            )
        except Exception as error:
            raise RuntimeError(
                "The local Whisper model download was interrupted. Check the internet connection and retry; partial files are reused."
            ) from error

    print(f"Loading local Whisper model {args.model}...", file=sys.stderr, flush=True)
    model = WhisperModel(
        str(model_path),
        device="cpu",
        compute_type="int8",
        cpu_threads=0,
    )
    results = []
    for index, audio_path in enumerate(args.audio, start=1):
        print(f"Transcribing audio part {index} of {len(args.audio)}...", file=sys.stderr, flush=True)
        segments, info = model.transcribe(
            audio_path,
            language="en",
            beam_size=5,
            vad_filter=True,
            initial_prompt="Argentine tango dance lesson. Preserve dance terminology and step names accurately.",
        )
        items = [
            {"start": segment.start, "end": segment.end, "text": segment.text.strip()}
            for segment in segments
            if segment.text.strip()
        ]
        results.append({
            "text": " ".join(item["text"] for item in items),
            "segments": items,
            "language": info.language,
            "duration": info.duration,
        })
    print(json.dumps(results, ensure_ascii=False))


if __name__ == "__main__":
    main()

#!/usr/bin/env bash
# frames/element-*.jpeg (Remotion, silent) + public/audio/narration.wav -> out/<フォルダ名>.mp4
# Voice only (BGM is added on the platform at upload, per STYLE.md). Loudness: 2-pass loudnorm to -14 LUFS.
set -euo pipefail
cd "$(dirname "$0")/.."
ID=$(basename "$PWD")
mkdir -p out
WAV=public/audio/narration.wav
M=$(ffmpeg -hide_banner -i "$WAV" -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
get() { echo "$M" | sed -n "s/.*\"$1\" : \"\([^\"]*\)\".*/\1/p"; }
AF="loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true,aresample=48000,apad"
first=$(ls frames | head -1); digits=$(echo "$first" | sed 's/[^0-9]//g' | wc -c); digits=$((digits - 1))
ffmpeg -hide_banner -v error -y -framerate 30 -i "frames/element-%0${digits}d.jpeg" -i "$WAV" \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -profile:v high -r 30 \
  -af "$AF" -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart "out/$ID.mp4"
ffprobe -v error -show_entries format=duration:stream=codec_name,width,height,r_frame_rate -of compact "out/$ID.mp4"

#!/usr/bin/env bash
# Turn one rendered piece into the kit's web and README formats.
# Usage: ./export.sh <piece> [poster-time-seconds]
#   reads   <piece>/renders/video.mp4 (1920x1200, 30 fps)
#   writes  exports/<piece>.mp4 .webm .webp .gif -poster.webp
set -euo pipefail

piece="$1"
poster_at="${2:-0}"
here="$(cd "$(dirname "$0")" && pwd)"
src="$here/$piece/renders/video.mp4"
out="$here/exports"
frames="$(mktemp -d)"
trap 'rm -rf "$frames"' EXIT

[ -s "$src" ] || { echo "missing render: $src" >&2; exit 1; }
mkdir -p "$out"

# Site: H.264 for reach, VP9 for size. faststart so the browser can begin playback early.
ffmpeg -y -loglevel error -i "$src" -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p \
  -movflags +faststart -an "$out/$piece.mp4"
ffmpeg -y -loglevel error -i "$src" -c:v libvpx-vp9 -b:v 0 -crf 34 -row-mt 1 -an "$out/$piece.webm"

# README: animated WebP at 960 px wide, 24 fps, plus a GIF fallback at 880 px, 20 fps.
ffmpeg -y -loglevel error -i "$src" -vf "fps=24,scale=960:-2:flags=lanczos" "$frames/w%04d.png"
img2webp -loop 0 -lossy -q 72 -m 6 -d 42 "$frames"/w*.png -o "$out/$piece.webp" >/dev/null
# One palette for the whole clip, so colours don't shimmer between frames.
ffmpeg -y -loglevel error -i "$src" -filter_complex \
  "fps=20,scale=880:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle" \
  -loop 0 "$out/$piece.gif"

# Poster: one still at the hero frame.
ffmpeg -y -loglevel error -ss "$poster_at" -i "$src" -frames:v 1 -vf "scale=1920:-2" "$frames/poster.png"
img2webp -lossy -q 85 "$frames/poster.png" -o "$out/$piece-poster.webp" >/dev/null

ls -lh "$out/$piece".* "$out/$piece-poster.webp" | awk '{print $5, $9}'

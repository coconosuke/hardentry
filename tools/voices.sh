#!/bin/sh
# 声を作り直す: sh tools/voices.sh [Whisperのフォルダ]
cd "$(dirname "$0")/.." && mkdir -p build_tmp && node -e "import('./src/audio/lines.js').then(m=>{require('fs').writeFileSync('build_tmp/lines.json', JSON.stringify({LINES:m.LINES, SPEAKERS:m.SPEAKERS}))})" && python3 -I tools/voices.py "$@"

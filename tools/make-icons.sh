#!/bin/bash
# icons/icon.svg から PNG アイコンを作る（macOS の sips を使用）
# iPhone は透明な部分を黒く塗るので、最後に透明度のない RGB の PNG にそろえる
set -euo pipefail
cd "$(dirname "$0")/.."

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

make() {
  local size="$1" out="$2"
  sips -s format png -z "$size" "$size" icons/icon.svg --out "$tmp/$size.png" >/dev/null
  python3 - "$tmp/$size.png" "$out" <<'EOF'
import sys
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGBA")
lo, hi = im.getchannel("A").getextrema()
if lo != 255:
    sys.exit(f"{src}: 透明な部分があります (alpha min={lo})")
im.convert("RGB").save(out, optimize=True)
EOF
  echo "$out"
}

make 180 icons/apple-touch-icon.png
make 192 icons/icon-192.png
make 512 icons/icon-512.png

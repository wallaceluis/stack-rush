#!/usr/bin/env bash
# Gera dist/stack-rush-crazygames.zip para enviar no portal de desenvolvedores da CrazyGames.
# É o mesmo jogo da pasta assets/game, com o SDK v3 da CrazyGames incluído no index.html.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=app/src/main/assets/game
OUT=dist/crazygames
rm -rf "$OUT" dist/stack-rush-crazygames.zip
mkdir -p "$OUT"
cp -r "$SRC"/. "$OUT"/

# Carrega o SDK antes do platform.js (que detecta window.CrazyGames).
sed -i 's|<script src="platform.js"></script>|<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n<script src="platform.js"></script>|' "$OUT/index.html"
grep -q crazygames-sdk-v3 "$OUT/index.html"

(cd "$OUT" && zip -qr ../stack-rush-crazygames.zip .)
echo "dist/stack-rush-crazygames.zip"

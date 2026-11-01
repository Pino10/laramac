#!/bin/bash
# Copies the public face of Laramac (README, screenshots, icon, installer) into a checkout of the
# public releases repository. The source code itself stays in this repository.
#   scripts/sync-releases-repo.sh /path/to/laramac-releases
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:?Give the path to a checkout of the releases repository}"
mkdir -p "$DEST/docs/screenshots" "$DEST/build"
cp "$SRC/install.sh" "$DEST/install.sh"
cp "$SRC/build/icon.png" "$DEST/build/icon.png"
cp "$SRC"/docs/screenshots/*.png "$DEST/docs/screenshots/"
# The public README is the full guide, without the parts about working on the source.
python3 - "$SRC/README.md" "$DEST/README.md" <<'PY'
import sys, re
s = open(sys.argv[1]).read()
s = re.sub(r"\n## Development\n.*?(?=\n## License)", "\n## Source code\n\nLaramac is being tested privately before its source is published. Downloads, the installer and this guide live here in the meantime. Please report problems in [Issues](https://github.com/Pino10/laramac-releases/issues).\n", s, flags=re.S)
s = s.replace("Please report security issues privately through GitHub security advisories.", "Please report security issues privately through GitHub security advisories on this repository.")
open(sys.argv[2], 'w').write(s)
PY
echo "Synced into $DEST"

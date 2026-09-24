#!/bin/sh
# Refreshes public/vendor/mermaid.min.js from the npm registry.
#
# Mermaid is vendored rather than a dependency on purpose: the wrangler serves
# only public/, never node_modules/, and a devDependency would still land in
# package-lock.json, where the install consent modal would disclose its whole
# transitive tree.
#
# Usage: sh scripts/vendor-mermaid.sh [version]   (default: latest)
set -eu

VERSION="${1:-latest}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cd "$TMP"
TARBALL="$(npm pack "mermaid@$VERSION" --silent)"
tar xzf "$TARBALL" package/dist/mermaid.min.js package/LICENSE package/package.json
cp package/dist/mermaid.min.js "$ROOT/public/vendor/mermaid.min.js"
cp package/LICENSE "$ROOT/public/vendor/mermaid.LICENSE"
echo "Vendored mermaid $(node -p "require('./package/package.json').version")"

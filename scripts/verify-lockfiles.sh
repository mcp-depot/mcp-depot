#!/usr/bin/env bash
# Verifies package-lock.json files with a real `npm ci`, run inside a
# linux/amd64 node:22 container matching CI exactly (.github/workflows/ci.yml,
# npm-publish.yml). Exists because platform-optional dependencies (notably
# @emnapi/* pulled in via unrs-resolver's wasm32-wasi fallback) resolve
# differently on Windows than on Linux: a plain `npm install` run locally on
# Windows silently drops entries a Linux CI runner needs, producing a
# lockfile that looks fine locally but fails `npm ci` in CI with
# "Missing: @emnapi/... from lock file". This has broken CI three times on
# this branch already - this script is the fix for that recurring failure.
#
# Usage:
#   scripts/verify-lockfiles.sh            # only lockfiles staged for commit
#   scripts/verify-lockfiles.sh --all       # every known lockfile, regardless of git state
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
trap 'rm -rf "$REPO_ROOT/.verify-lockfiles-tmp"' EXIT

# label:package.json dir:extra npm-ci flags (root uses --ignore-scripts, matching npm-publish.yml)
TARGETS=(
  "root:.:--ignore-scripts"
  "server:server:"
  "client:client:"
)

check_docker() {
  command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1
}

changed_lockfiles() {
  git diff --cached --name-only 2>/dev/null | grep -E '(^|/)package-lock\.json$' || true
}

verify_one() {
  local label="$1" dir="$2" flags="$3"
  local lockfile="$dir/package-lock.json"
  [ "$dir" = "." ] && lockfile="package-lock.json"

  echo "==> Verifying $label ($lockfile) against a linux/amd64 node:22 container..."
  # A system-temp dir (mktemp -d) does not reliably bind-mount into Docker
  # Desktop on Windows - it silently appears empty inside the container.
  # A directory under the repo root does, so use that instead.
  local tmp="$REPO_ROOT/.verify-lockfiles-tmp/$label"
  rm -rf "$tmp"
  mkdir -p "$tmp"
  cp "$dir/package.json" "$tmp/"
  cp "$lockfile" "$tmp/"

  # MSYS_NO_PATHCONV avoids Git-Bash-on-Windows mangling "/w" into a
  # drive-letter path before it reaches docker.
  if MSYS_NO_PATHCONV=1 docker run --rm -v "$tmp:/w" -w /w node:22 sh -c "npx --yes npm@11 ci $flags" > "$tmp/npm-ci.log" 2>&1; then
    echo "    OK"
    rm -rf "$tmp"
    return 0
  else
    echo "    FAILED - npm ci could not install from $lockfile as committed."
    echo "    Last 20 lines of the log:"
    tail -20 "$tmp/npm-ci.log" | sed 's/^/    /'
    echo ""
    echo "    Fix: regenerate inside the same container this script uses, e.g.:"
    echo "      docker run --rm -v \"\$PWD/$dir:/w\" -w /w node:22 sh -c \"npx --yes npm@11 install --package-lock-only $flags\""
    echo "    Then copy the regenerated lockfile back over $lockfile."
    echo "    Do NOT run a plain 'npm install' locally afterward - it will re-clobber this fix on Windows/macOS."
    rm -rf "$tmp"
    return 1
  fi
}

if ! check_docker; then
  echo "verify-lockfiles: Docker not available - skipping lockfile verification."
  echo "(This check only runs when Docker is present. Lockfile drift will still be caught by CI.)"
  exit 0
fi

mode="${1:-}"
failed=0

for target in "${TARGETS[@]}"; do
  IFS=':' read -r label dir flags <<< "$target"
  lockfile="$dir/package-lock.json"
  [ "$dir" = "." ] && lockfile="package-lock.json"

  if [ "$mode" = "--all" ]; then
    verify_one "$label" "$dir" "$flags" || failed=1
  else
    if changed_lockfiles | grep -qx "$lockfile"; then
      verify_one "$label" "$dir" "$flags" || failed=1
    fi
  fi
done

if [ "$failed" = "1" ]; then
  echo ""
  echo "verify-lockfiles: one or more lockfiles would fail npm ci in CI. Commit blocked."
  exit 1
fi

exit 0

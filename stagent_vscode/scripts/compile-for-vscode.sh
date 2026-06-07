#!/usr/bin/env bash
# F5 / VS Code preLaunchTask：在常见路径中查找 node+npm 后执行 compile。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

find_npm_bin_dir() {
  local d
  for d in \
    "/opt/homebrew/bin" \
    "/usr/local/bin" \
    "$HOME/.volta/bin" \
    ; do
    if [ -x "$d/npm" ] && [ -x "$d/node" ]; then
      echo "$d"
      return 0
    fi
  done
  # nvm
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck disable=SC1090
    . "$HOME/.nvm/nvm.sh"
    command -v npm >/dev/null 2>&1 && dirname "$(command -v npm)" && return 0
  fi
  if command -v npm >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then
    dirname "$(command -v npm)"
    return 0
  fi
  return 1
}

BIN_DIR="$(find_npm_bin_dir)" || {
  echo "[stagent] 未找到 Node.js / npm。" >&2
  echo "[stagent] 请安装 LTS：https://nodejs.org/  安装后新开终端，再按 F5。" >&2
  echo "[stagent] 若已编译过，可选用调试配置「Extension (skip compile)」直接启动。" >&2
  exit 127
}

export PATH="$BIN_DIR:$PATH"
echo "[stagent] using node: $(node -v) npm: $(npm -v)"
npm run compile

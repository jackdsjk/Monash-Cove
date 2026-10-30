#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

fail() {
  echo "Cove: $*" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || fail "未找到 Node.js。请安装 Node 26+：https://nodejs.org/"
command -v npm >/dev/null 2>&1 || fail "未找到 npm。请安装 Node.js 26+。"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 26 ]; then
  echo "Cove: 当前 Node $(node -v)，建议 Node 26+；继续运行但兼容性未验证。" >&2
fi

if [ ! -d local-service/node_modules ]; then
  echo "Cove: 安装 local-service 依赖…"
  (cd local-service && npm ci)
fi
if [ ! -d webapp/node_modules ]; then
  echo "Cove: 安装 webapp 依赖…"
  (cd webapp && npm ci)
fi

if [ ! -f local-service/dist/index.js ]; then
  echo "Cove: 构建 local-service…"
  (cd local-service && npm run build)
fi
if [ ! -f webapp/dist/index.html ]; then
  echo "Cove: 构建 webapp…"
  (cd webapp && npm run build)
fi

if [ ! -f local-service/.env.local ]; then
  echo "Cove: 未找到 local-service/.env.local；Gmail 连接需要先配置 Google OAuth client。" >&2
  echo "      参考 local-service/.env.example。" >&2
fi

case "$(uname -s)" in
  Darwin)
    [ -d "/Applications/Google Chrome.app" ] || echo "Cove: 未检测到 Google Chrome；Moodle 登录助手需要 Chrome。" >&2
    ;;
  Linux)
    command -v google-chrome >/dev/null 2>&1 || command -v chromium >/dev/null 2>&1 || echo "Cove: 未检测到 Chrome/Chromium；Moodle 登录助手可能不可用。" >&2
    ;;
esac

PORT="${COVE_PORT:-4317}"
echo "Cove: 打开 http://127.0.0.1:${PORT}" >&2
if [ "$(uname -s)" = "Darwin" ] && [ "${COVE_NO_OPEN:-0}" != "1" ]; then
  (sleep 1; open "http://127.0.0.1:${PORT}") >/dev/null 2>&1 &
fi

cd local-service
exec node dist/index.js

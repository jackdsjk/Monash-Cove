# 本地 Monash 工具栈
#   source env.sh
#
# 把仓库内的 CLI 放到 PATH 最前面，避免用到系统里那个旧的全局 edstem (0.5.0)。

if [ -n "${BASH_SOURCE:-}" ]; then
  _monash_src="${BASH_SOURCE[0]}"
else
  _monash_src="$0"
fi

MONASH_STACK="$(cd "$(dirname "$_monash_src")" && pwd)"
export MONASH_STACK

export PATH="$MONASH_STACK/stack/tools/node_modules/.bin:$PATH"

# 墨尔本校区地址。马来西亚校区如果不同，改这里或在本机覆盖。
export MOODLE_BASE_URL="${MOODLE_BASE_URL:-https://learning.monash.edu}"

unset _monash_src

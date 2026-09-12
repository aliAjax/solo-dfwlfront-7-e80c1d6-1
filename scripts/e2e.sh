#!/usr/bin/env bash
# =============================================================================
# 一键环境准备 + 构建 + 浏览器核对
#
# 从干净状态（无 node_modules / dist）开始，自动完成：
#   1. npm 依赖安装（国内镜像优先，失败回退官方源）
#   2. 下载匹配架构的 Chrome for Testing（无需 root）
#   3. 用 apt 下载并解压 Chrome 缺失的系统库与中文字体（无需 root）
#   4. 生产构建
#   5. 启动 vite preview，依次运行 verify.mjs（38 项）与 verify-xss.mjs（19 项）
#
# 用法：
#   bash scripts/e2e.sh            # 幂等，已下载的内容会复用
#   bash scripts/e2e.sh --clean    # 先删除 node_modules 和 dist
#
# 可选环境变量：
#   NPM_REGISTRY            首选 npm 镜像（默认 https://registry.npmmirror.com）
#   CHROME_VERSION          Chrome for Testing 版本（默认与 Playwright 匹配的版本）
#   PORT                    preview 端口（默认 4173）
#   SKIP_BROWSER_PREP=1     跳过 Chrome/系统库准备（本机已有 Chrome 时用 CHROME_BIN 指定）
#   CHROME_BIN              直接指定 Chrome 可执行文件
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CHROME_VERSION="${CHROME_VERSION:-153.0.8010.12}"
PORT="${PORT:-4173}"
TOOLS_DIR="${TOOLS_DIR:-$HOME/.cache/gas-shift-e2e}"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"
NPM_FALLBACK="https://registry.npmjs.org"

c_reset=$'\033[0m'; c_blue=$'\033[1;34m'; c_green=$'\033[1;32m'
c_yellow=$'\033[1;33m'; c_red=$'\033[1;31m'
if [[ ! -t 1 ]]; then c_reset=""; c_blue=""; c_green=""; c_yellow=""; c_red=""; fi

CURRENT_PHASE=""
fail() {
  echo "${c_red}✗ 失败阶段：${CURRENT_PHASE}${c_reset}" >&2
  echo "${c_yellow}$1${c_reset}" >&2
  exit 1
}
trap 'rc=$?; if [[ $rc -ne 0 && "${BASH_COMMAND:-}" != "exit $rc" ]]; then
  echo "${c_red}✗ 命令失败（退出码 $rc）：${BASH_COMMAND}${c_reset}" >&2
  echo "${c_yellow}阶段：${CURRENT_PHASE}。可重跑本脚本，已下载内容会缓存复用。${c_reset}" >&2
fi' ERR

step() { CURRENT_PHASE="$1"; echo; echo "${c_blue}━━ $1 ${c_reset}"; }
ok()   { echo "${c_green}✓ $1${c_reset}"; }
warn() { echo "${c_yellow}⚠ $1${c_reset}"; }

[[ "${1:-}" == "--clean" ]] && {
  step "清理 node_modules 与 dist"
  rm -rf node_modules dist
  ok "已清理"
}

# ---------------------------------------------------------------- 1. 依赖
step "安装 npm 依赖"
command -v node >/dev/null || fail "未找到 node，请先安装 Node.js 20+"
command -v npm  >/dev/null || fail "未找到 npm"
echo "node $(node -v) / npm $(npm -v)"

if [[ ! -d node_modules ]]; then
  install_with() {
    local reg="$1"
    echo "尝试 registry: $reg"
    if [[ -f package-lock.json ]]; then
      npm ci --registry="$reg" --no-audit --no-fund || npm install --registry="$reg" --no-audit --no-fund
    else
      npm install --registry="$reg" --no-audit --no-fund
    fi
  }
  install_with "$NPM_REGISTRY" || install_with "$NPM_FALLBACK" \
    || fail "两个 npm 源都安装失败，请检查网络或用 NPM_REGISTRY 指定可用镜像"
else
  ok "node_modules 已存在，跳过（需要强制重装请用 --clean）"
fi
[[ -d node_modules/playwright ]] || fail "node_modules 中缺少 playwright，请检查 package.json"
ok "npm 依赖就绪"

# --------------------------------------------------- 2. Chrome 与系统库
CHROME_BIN="${CHROME_BIN:-}"
if [[ "${SKIP_BROWSER_PREP:-0}" != "1" ]]; then
  step "准备 Chrome for Testing"
  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64|amd64) PLATFORM="linux64" ;;
    aarch64|arm64) PLATFORM="linux-arm64" ;;
    *) fail "不支持的架构：$ARCH（可自行安装 Chrome 后用 CHROME_BIN 指定并设置 SKIP_BROWSER_PREP=1）" ;;
  esac
  CHROME_DIR="$TOOLS_DIR/chrome/chrome-$PLATFORM"
  CHROME_BIN="$CHROME_DIR/chrome"

  if [[ ! -x "$CHROME_BIN" ]]; then
    ZIP="$TOOLS_DIR/chrome-$PLATFORM.zip"
    mkdir -p "$TOOLS_DIR/chrome"
    URLS=(
      "https://cdn.npmmirror.com/binaries/chrome-for-testing/$CHROME_VERSION/$PLATFORM/chrome-$PLATFORM.zip"
      "https://storage.googleapis.com/chrome-for-testing-public/$CHROME_VERSION/$PLATFORM/chrome-$PLATFORM.zip"
    )
    downloaded=""
    for url in "${URLS[@]}"; do
      echo "下载: $url"
      if curl -fsSL --retry 3 --retry-all-errors --connect-timeout 15 --max-time 480 -o "$ZIP" "$url"; then
        downloaded=1; break
      fi
      warn "该地址失败，尝试下一个"
    done
    [[ -n "$downloaded" ]] || fail "Chrome 下载失败，可设置 CHROME_VERSION 或 CHROME_BIN 使用已有浏览器"
    unzip -q -o "$ZIP" -d "$TOOLS_DIR/chrome" || fail "Chrome 压缩包解压失败"
    rm -f "$ZIP"
  fi
  ok "Chrome 已下载：$CHROME_BIN"

  # ---- 系统库（仅 Linux；无 root，用 apt download + 家目录解压） ----
  step "检查 Chrome 系统库"
  MISSING_LIBS="$(ldd "$CHROME_BIN" 2>/dev/null | grep "not found" | awk '{print $1}' | sort -u || true)"
  NEED_FONT=1
  if command -v fc-list >/dev/null && fc-list 2>/dev/null | grep -qiE "wqy|noto.*cjk|zenhei"; then
    NEED_FONT=0
  fi

  if [[ -n "$MISSING_LIBS" || "$NEED_FONT" == "1" ]]; then
    if ! command -v apt-get >/dev/null; then
      warn "缺少运行库且系统没有 apt-get，请手动安装：$MISSING_LIBS"
    else
      echo "缺失库：${MISSING_LIBS:-（无）}；中文字体：$([[ $NEED_FONT == 1 ]] && echo 需要 || echo 已有)"
      APT_ROOT="$TOOLS_DIR/apt"
      LIBS_DIR="$TOOLS_DIR/libs"
      mkdir -p "$APT_ROOT/lists/partial" "$APT_ROOT/cache/archives/partial" "$LIBS_DIR"
      : > "$APT_ROOT/extended_states"
      cp /var/lib/dpkg/status "$APT_ROOT/status" 2>/dev/null || : > "$APT_ROOT/status"

      CODENAME="$(. /etc/os-release 2>/dev/null; echo "${VERSION_CODENAME:-bookworm}")"
      cat > "$APT_ROOT/sources.list" <<EOF
deb http://mirrors.aliyun.com/debian $CODENAME main
deb http://mirrors.aliyun.com/debian-security $CODENAME-security main
EOF
      APT_OPTS=(
        -o "Dir::State::Lists=$APT_ROOT/lists"
        -o "Dir::State::status=$APT_ROOT/status"
        -o "Dir::State::extended_states=$APT_ROOT/extended_states"
        -o "Dir::Etc::sourcelist=$APT_ROOT/sources.list"
        -o "Dir::Etc::sourceparts=-"
        -o "Dir::Cache=$APT_ROOT/cache"
        -o "Dir::Cache::archives=$APT_ROOT/cache/archives"
        -o "APT::Get::List-Cleanup=0"
      )

      APT_LOG="$APT_ROOT/apt.log"
      if [[ -z "$(ls -A "$APT_ROOT/lists" 2>/dev/null | grep -v partial || true)" ]]; then
        if ! apt-get "${APT_OPTS[@]}" update -qq >"$APT_LOG" 2>&1; then
          warn "阿里云镜像更新失败，回退 deb.debian.org"
          sed -i 's|mirrors.aliyun.com|deb.debian.org|g' "$APT_ROOT/sources.list"
          apt-get "${APT_OPTS[@]}" update -qq >"$APT_LOG" 2>&1 \
            || fail "apt 索引更新失败（网络受限？），详情：$APT_LOG"
        fi
      fi

      PKGS=(libnss3 libnspr4 libgbm1 libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0
            libcups2 libdbus-1-3 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3
            libxrandr2 libxi6 libxshmfence1 libdrm2 libwayland-server0 libavahi-client3
            libavahi-common3)
      [[ $NEED_FONT == 1 ]] && PKGS+=(fonts-wqy-zenhei)

      apt-get "${APT_OPTS[@]}" -y -qq --no-install-recommends --download-only install "${PKGS[@]}" \
        >>"$APT_LOG" 2>&1 || fail "Chrome 依赖 deb 下载失败，详情：$APT_LOG"
      for d in "$APT_ROOT/cache/archives/"*.deb; do dpkg-deb -x "$d" "$LIBS_DIR"; done

      # 字体装到用户字体目录
      if [[ $NEED_FONT == 1 ]] && find "$LIBS_DIR" -name "*.ttc" -o -name "*.ttf" | grep -q .; then
        mkdir -p "$HOME/.local/share/fonts"
        find "$LIBS_DIR" \( -name "*.ttc" -o -name "*.ttf" \) -exec cp -n {} "$HOME/.local/share/fonts/" \;
        command -v fc-cache >/dev/null && fc-cache -f "$HOME/.local/share/fonts" >/dev/null 2>&1 || true
      fi
    fi
  fi

  # 汇总解压库路径（供 Chrome 与本脚本后续使用）
  if [[ -d "$TOOLS_DIR/libs" ]]; then
    EXTRA_LIBS="$(find "$TOOLS_DIR/libs" -type d \( -name "*-linux-gnu" -o -name lib \) | tr '\n' ':')"
    export LD_LIBRARY_PATH="${EXTRA_LIBS}${LD_LIBRARY_PATH:-}"
  fi

  REMAIN="$(ldd "$CHROME_BIN" 2>/dev/null | grep "not found" || true)"
  [[ -z "$REMAIN" ]] || fail "Chrome 仍缺少运行库：$(echo "$REMAIN" | awk '{printf "%s ", $1}')"
  CHROME_VERSION_OUT="$("$CHROME_BIN" --version 2>/dev/null || true)"
  "$CHROME_BIN" --headless=new --no-sandbox --disable-gpu --dump-dom about:blank >/dev/null 2>&1 \
    || fail "Chrome 无法启动，请检查运行库"
  ok "Chrome 系统库完整，冒烟启动通过（${CHROME_VERSION_OUT:-版本未知}）"
fi

[[ -n "${CHROME_BIN:-}" && -x "$CHROME_BIN" ]] || fail "没有可用的 Chrome，请安装后通过 CHROME_BIN 指定"
export CHROME_BIN

# --------------------------------------------------------------------- 3. 构建
step "生产构建 (tsc -b && vite build)"
npm run build || fail "构建失败，请查看上方 TypeScript/Vite 输出"
ok "构建通过，产物在 dist/"

# ------------------------------------------------- 4. preview + 两套核对
step "启动 preview 服务 (端口 $PORT)"
LOG="$TOOLS_DIR/preview.log"
npx vite preview --port "$PORT" --strictPort --host 127.0.0.1 >"$LOG" 2>&1 &
PREVIEW_PID=$!
trap 'kill ${PREVIEW_PID:-} 2>/dev/null || true' EXIT

BASE_URL="http://127.0.0.1:$PORT"
export BASE_URL
for i in $(seq 1 30); do
  if curl -sf "$BASE_URL/" -o /dev/null; then break; fi
  kill -0 "$PREVIEW_PID" 2>/dev/null || fail "preview 进程提前退出，见日志：$LOG"
  sleep 1
  [[ $i == 30 ]] && fail "preview 服务 30 秒内未就绪，见日志：$LOG"
done
ok "preview 已就绪：$BASE_URL"

step "核对 1/2：功能回归 verify.mjs（桌面 + 手机，38 项）"
node verify.mjs | grep -vE "dbus|Failed to connect to the bus" \
  || fail "功能回归存在失败项，见上方 FAIL 明细"

step "核对 2/2：注入专项 verify-xss.mjs（19 项）"
node verify-xss.mjs | grep -vE "dbus|Failed to connect to the bus" \
  || fail "注入专项存在失败项，见上方 FAIL 明细"

echo
echo "${c_green}════════════════════════════════════════${c_reset}"
echo "${c_green}✓ 全部完成：依赖、Chrome、构建、57 项浏览器核对均通过${c_reset}"
echo "截图：$ROOT/screenshots/    preview 日志：$LOG"

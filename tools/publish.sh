#!/bin/zsh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/docs"
URL="https://psdreammakers.github.io/-/"
REMOTE="https://github.com/psdreammakers/-.git"

mkdir -p "$DEST"
cp "$ROOT/index.html" "$ROOT/styles.css" "$ROOT/app.js" "$ROOT/config.js" "$DEST/"
printf "%s\n" "$URL" > "$ROOT/online-url.txt"
printf 'window.GOODSHEET = { onlineUrl: "%s" };\n' "$URL" > "$ROOT/config.js"
printf 'window.GOODSHEET = { onlineUrl: "%s" };\n' "$URL" > "$DEST/config.js"

echo "已複製線下版到 docs/（線上快照）。修正線下不會自動上線，只有跑這一鍵才會更新。"

cd "$ROOT"
if [ ! -d .git ]; then
  git init
  git checkout -B main
fi
if ! git remote get-url origin >/dev/null 2>&1; then
  git remote add origin "$REMOTE"
fi

git add docs index.html styles.css app.js config.js online-url.txt .github/workflows/pages.yml
if git diff --cached --quiet; then
  echo "沒有新的上架內容。仍會推送到 GitHub。"
else
  git -c user.email="publish@local" -c user.name="GoodSheet Publish" commit -m "publish $(date '+%Y-%m-%d %H:%M')"
fi

if ! git push -u origin HEAD:main; then
  echo ""
  echo "推送失敗。請在這個視窗登入一次 GitHub："
  gh auth login
  git push -u origin HEAD:main
fi

if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  gh api -X POST "repos/psdreammakers/-/pages" -f build_type=workflow >/dev/null 2>&1 || \
    gh api -X PUT "repos/psdreammakers/-/pages" -f build_type=workflow >/dev/null 2>&1 || true
fi

echo ""
echo "線上更新已送出：$URL"
echo "第一次請到倉庫 Settings → Pages → Source 選 GitHub Actions，之後就不用再設。"
echo "網頁可能要等 1～2 分鐘才會開。"
open "$URL" || true

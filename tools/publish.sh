#!/bin/zsh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/published"
REPO_NAME="goodsheet-ledger"

mkdir -p "$DEST"
cp "$ROOT/index.html" "$ROOT/styles.css" "$ROOT/app.js" "$ROOT/config.js" "$DEST/"

write_url() {
  local url="$1"
  printf "%s\n" "$url" > "$ROOT/online-url.txt"
  printf 'window.GOODSHEET = { onlineUrl: "%s" };\n' "$url" > "$ROOT/config.js"
  printf 'window.GOODSHEET = { onlineUrl: "%s" };\n' "$url" > "$DEST/config.js"
}

echo "已把線下版複製到 published/（與工作檔分開，修正線下不會自動上線）。"

if ! command -v gh >/dev/null; then
  echo "找不到 gh。請先安裝 GitHub CLI，或把 published 資料夾拖到 https://app.netlify.com/drop"
  open "$DEST"
  open "https://app.netlify.com/drop"
  exit 0
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "第一次上架需要登入 GitHub（免費 Pages，這種小頁面流量可忽略）。"
  gh auth login
fi

USER="$(gh api user --jq .login)"
URL="https://${USER}.github.io/${REPO_NAME}/"

cd "$DEST"
if [ ! -d .git ]; then
  git init
  git checkout -B gh-pages
fi
git checkout -B gh-pages
git add index.html styles.css app.js config.js
if git diff --cached --quiet; then
  echo "內容與上次上架相同。"
else
  git -c user.email="publish@local" -c user.name="GoodSheet Publish" commit -m "publish $(date '+%Y-%m-%d %H:%M')"
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  if gh repo view "$USER/$REPO_NAME" >/dev/null 2>&1; then
    git remote add origin "https://github.com/$USER/$REPO_NAME.git"
  else
    gh repo create "$REPO_NAME" --public --source=. --remote=origin --disable-issues --disable-wiki
  fi
fi

git push -u origin gh-pages --force
gh api -X POST "repos/$USER/$REPO_NAME/pages" -f source[branch]=gh-pages -f source[path]=/ >/dev/null 2>&1 || true

write_url "$URL"
echo "線上更新完成：$URL"
echo "GitHub Pages 第一次可能要等 1～2 分鐘才開得了。"

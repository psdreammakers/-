#!/bin/zsh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/交易日誌"
DEST="$ROOT/線上"
REPO="psdreammakers/-"
REMOTE="https://github.com/$REPO.git"
URL="https://psdreammakers.github.io/-/"

say() { print -r -- "$@"; }

# 上架失敗就把線上網址清空，讓「線上打開」誠實說「還沒上架」，不要開到 404
clear_url() {
  : > "$ROOT/一鍵/online-url.txt"
  printf 'window.GOODSHEET = { onlineUrl: "" };\n' > "$SRC/config.js"
  printf 'window.GOODSHEET = { onlineUrl: "" };\n' > "$DEST/config.js" 2>/dev/null || true
}

die() {
  say ""
  say "✗ $1"
  clear_url
  say "線上版維持關閉。你的交易紀錄不受影響（資料只存在你自己的瀏覽器裡）。"
  exit 1
}

# 1) 複製線下版 → 線上快照
mkdir -p "$DEST/js"
cp "$SRC/index.html" "$SRC/styles.css" "$DEST/" || die "複製線上快照失敗。"
cp "$SRC"/js/*.js "$DEST/js/" || die "複製線上快照失敗（js/）。"
say "已複製線下版到 線上/（線上快照）。只有跑這一鍵才會更新線上。"

# 2) gh 有沒有裝、有沒有登入——分開報，不要一律叫人重登
command -v gh >/dev/null 2>&1 || die "找不到 gh 指令。請先安裝 GitHub CLI：brew install gh"
if ! gh auth status >/dev/null 2>&1; then
  say "GitHub 還沒登入，現在登入一次："
  gh auth login || die "GitHub 登入失敗。"
fi

# 3) 遠端倉庫還在不在
#    2026-08-29 修：倉庫 psdreammakers/- 被刪掉了，舊版腳本會直接 push 失敗，
#    然後跳去 gh auth login 叫人重登——但登入根本沒問題，問題是倉庫不見了。
if ! gh repo view "$REPO" >/dev/null 2>&1; then
  say ""
  say "⚠ GitHub 上找不到倉庫「$REPO」——它被刪掉了，所以線上版是 404。"
  say ""
  say "  要現在重建一個「公開」倉庫嗎？"
  say "  公開 = 任何人都能在網路上看到這個網頁畫面。"
  say "  你的交易紀錄「不會」上傳——資料只存在你自己的瀏覽器裡，上傳的只有程式碼。"
  say ""
  printf "  要建請輸入 yes（其他任何字＝取消）："
  read -r ans
  [[ "$ans" == "yes" ]] || die "已取消，沒有建立任何東西。"
  gh repo create "$REPO" --public --description "GoodSheet 交易紀錄（線上版）" || die "建立倉庫失敗。"
  say "✓ 倉庫已重建：https://github.com/$REPO"
fi

# 4) 寫入線上網址（推成功才留得住；失敗會被 clear_url 清掉）
printf "%s\n" "$URL" > "$ROOT/一鍵/online-url.txt"
printf 'window.GOODSHEET = { onlineUrl: "%s" };\n' "$URL" > "$SRC/config.js"
printf 'window.GOODSHEET = { onlineUrl: "%s" };\n' "$URL" > "$DEST/config.js"

# 5) git
cd "$ROOT" || die "切不進專案資料夾。"
[ -d .git ] || { git init && git checkout -B main; }
git remote get-url origin >/dev/null 2>&1 || git remote add origin "$REMOTE"
git remote set-url origin "$REMOTE"

git add 線上 交易日誌 一鍵/online-url.txt .github/workflows/pages.yml
if git diff --cached --quiet; then
  say "沒有新的上架內容，仍會推送一次。"
else
  git -c user.email="publish@local" -c user.name="GoodSheet Publish" \
      commit -m "publish $(date '+%Y-%m-%d %H:%M')" || die "commit 失敗。"
fi

git push -u origin HEAD:main || die "推送到 GitHub 失敗。跑 'gh auth status' 看登入狀態。"

say ""
say "✓ 線上更新已送出：$URL"
say "第一次可能還是 404（GitHub 要跑一兩分鐘建站）。若一直 404："
say "  打開 https://github.com/$REPO/settings/pages"
say "  Build and deployment → Source 選 GitHub Actions → Save"
say "  再到 Actions 把失敗的 Deploy Pages 按 Re-run。"
open "https://github.com/$REPO/actions" 2>/dev/null || true

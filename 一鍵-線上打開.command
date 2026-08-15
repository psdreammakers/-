#!/bin/zsh
cd "$(dirname "$0")"
URL="$(grep -v '^#' online-url.txt | tr -d '[:space:]')"
if [ -z "$URL" ]; then
  echo "還沒有線上網址。請先雙擊「一鍵-線上更新」。"
  read -k 1
  exit 1
fi
open "$URL"

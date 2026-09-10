#!/bin/zsh
cd "$(dirname "$0")/.."
chmod +x 一鍵/publish.sh
./一鍵/publish.sh
echo ""
echo "按任意鍵關閉視窗"
read -k 1

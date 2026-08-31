#!/bin/zsh
cd "$(dirname "$0")/.."
chmod +x tools/publish.sh
./tools/publish.sh
echo ""
echo "按任意鍵關閉視窗"
read -k 1

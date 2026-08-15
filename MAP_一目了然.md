# MAP

- `index.html` 交易紀錄／心理戰；記帳 v1、曲線、月曆；心理戰三格輸入＋下方總表
- `app.js` 成交 SSOT 與心理 SSOT 分開；00 只核對損益
- `WORK_LOG.md` 02 紀錄
- `.cursor/rules/ssot-work-log.mdc` 異動必記
- `.cursor/rules/ledger-form-v1.mdc` 記帳欄位已訂版
- `.cursor/rules/kpi-strip-v1.mdc` 曲線總表十格順序已訂版
- `啟動.html` 與三個一鍵；`docs/` 為線上快照（GitHub Pages）

資料流：成交（損益−手續費）與心理／行為／事件分庫；日曆用日期對上。  
00：`sum(淨) === 曲線終點−初始 === sum(日曆日淨)`；心理不進金額。

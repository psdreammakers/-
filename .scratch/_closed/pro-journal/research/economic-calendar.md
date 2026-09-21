# 經濟日曆來源與限制（靜態前端）

調查日：2026-09-09。範圍：無券商連結、本機 localStorage 日誌、GitHub Pages 上架。美盤（利率／就業／通膨／能源）、外匯常見貨幣、台灣公開日曆。證據只追第一方條款與官方文件。

## 給後續規格的一句話

**用「官方發布日程」當自動灌入本，不要用 Forex Factory／Investing.com 那類彙總表當本。** 靜態站拿不到 impact／actual／forecast 的合法即時流；那些欄若要有，只能人手填，或另開「需代理＋付費授權」的車道。資料過期點＝最後一次成功寫進站內 JSON（或瀏覽器快取）的時刻。失敗時當日日誌仍可寫，經濟事件區改顯示空狀態＋官方連結＋上次成功時間。

---

## 1. 靜態前端實際能／不能

GitHub Pages 是靜態託管：只發 HTML／CSS／JS，可選建置步驟，沒有你能假設的常駐伺服器。見 [About GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages)。

瀏覽器同源政策：跨站 `fetch` 必須對方回 `Access-Control-Allow-Origin`。沒有這顆頭，前端拿不到資料，不論授權多開。

### 瀏覽器直接能做的（已用 Origin `https://example.github.io` 對過回應頭）

| 端點 | CORS | 備註 |
| --- | --- | --- |
| [BEA ICS](https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics) | `Access-Control-Allow-Origin: *`，HTTP 200 | 唯一已證實「無金鑰、官方日程、瀏覽器可直接取」的美盤日曆檔 |
| [EIA APIv2](https://api.eia.gov/v2/) | `Access-Control-Allow-Origin: *` | 要免費 API key；這是時間序列，不是發布日曆 |
| [BLS Public Data API](https://api.bls.gov/publicAPI/v2/timeseries/data/) | `Access-Control-Allow-Origin: *`（只接受 POST） | 要註冊金鑰；這是序列值，不是日曆 |
| [Finnhub `/calendar/economic`](https://finnhub.io/api/v1/calendar/economic) | `Access-Control-Allow-Origin: *` | 無金鑰 401；Premium；條款禁止再散佈 |
| [FMP economic-calendar](https://financialmodelingprep.com/stable/economic-calendar) | `Access-Control-Allow-Origin: *` | 無金鑰 401；個人授權禁止公開展示 |
| [Trading Economics `/calendar`](https://api.tradingeconomics.com/calendar) | 會把 Origin 鏡回（對 `example.github.io` 回了 ACAO） | 無金鑰 401；付費 API |
| [raw.githubusercontent.com](https://raw.githubusercontent.com/) | `Access-Control-Allow-Origin: *` | 若把日曆 JSON 烘焙進倉庫，Pages 同源讀更乾淨，不必繞 raw |

### 瀏覽器直接做不到的（本次實測）

- **大多數官方 HTML／RSS 日曆沒有 CORS**：Fed FOMC 頁、Fed RSS、Census Economic Briefing Room、ECB 理事會日曆、BoE 新聞頁、台灣 [stat.gov.tw 預告發布時間表](https://www.stat.gov.tw/News_NoticeCalendar.aspx?n=3717)。前端 `fetch` 會被擋。
- **BLS 官方 iCal**（[文件寫的 URL](https://www.bls.gov/help/hlpical.htm) `https://www.bls.gov/schedule/news_release/bls.ics`）：本環境連帶瀏覽器 UA 都拿到 Akamai **403 Access Denied**，頁面引用 BLS 機器人政策。CORS 因此無法驗證。授權上可用，取檔上不穩定。
- **央行統計 API** `https://cpx.cbc.gov.tw/API/DataAPI/Get`：CORS 只放行 `https://petstore.swagger.io`，不是 GitHub Pages。而且這是序列，不是日曆。
- **Forex Factory 日曆**：Cloudflare challenge、`cross-origin-resource-policy: same-origin`、HTTP 403。沒有官方 API。
- **把 API 金鑰寫進前端**：金鑰等於公開。Finnhub／FMP／TE／EIA／BLS／FRED 都用 query 或 header 金鑰。
- **即時 actual／forecast／impact**：官方日程檔沒有這些欄。商業 API 有，但個人方案禁止把資料展示給站上訪客（見第 5 節）。
- **刮 HTML**：CORS、機器人政策、以及 Investing.com／Forex Factory 條款都擋。
- **假設常駐反向代理**：Pages 沒有。若要跨源取沒 CORS 的官方頁，必須另開一條「小代理」——這件事本身就是規格發現，不是預設能力。

### 不算自建伺服器、但能過閘的一條路

GitHub Actions 定時（或每次 push）在 **CI 端** 拉官方 ICS／HTML，寫成倉庫內 JSON，Pages 同源讀。這是「烘焙」，不是瀏覽器即時。過期點＝最後一次成功的 workflow。失敗＝繼續用上一份 JSON，或顯示空。

這條路**需要人確認**（開工權：上傳／自動化寫回倉庫），不是機械活。規格應寫成可選車道，不是第一版必做。

---

## 2. 建議用哪類來源

第一版自動灌入應是 **「該日將公布什麼、何時、哪國／哪機關」**，不是「數字已經出來、市場預期多少」。

建議組合：

1. **美盤日程本**：BEA ICS（瀏覽器可直接取）＋ Fed FOMC 年曆（日期少、可手維或 Actions 抓 HTML）＋ EIA 週報固定規則（週三 10:30 ET，假日另表）＋ BLS 高影響項（CPI、Employment Situation）用官方月曆頁當權威、必要時烘焙 ICS。
2. **外匯利率本**：各央行官方會議年曆（ECB、BoE、BoJ 等），同樣是日期表，不是即時數字。
3. **台灣本**：主計總處／中華民國統計資訊網「預告發布時間表」＋央行 SDDS 預告發布日曆。授權開，CORS 不開 → 烘焙或手維。
4. **不要當本的**：Forex Factory、Investing.com、未授權刮站、把 Finnhub／FMP／TE 個人金鑰塞進公開 Pages。

impact／actual／forecast 第一版當**選填手填**，或留空。不要假裝官方 ICS 裡有。

---

## 3. 美盤官方來源

### 3.1 聯準會 FOMC（利率）

- 擁有者：Board of Governors of the Federal Reserve System。
- 權威頁：[Meeting calendars, statements, and minutes](https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm)。每年約八次例會；未來年份標「tentative until confirmed at the meeting immediately preceding it」。
- 時間（官方新聞稿）：政策聲明 **第二天下午 2:00 Eastern**，主席記者會 **同日 2:30 Eastern**。[2027 年會期公告](https://www.federalreserve.gov/newsevents/pressreleases/monetary20250905a.htm)。
- 欄位：會議日期、是否附 SEP、聲明／紀要連結。**沒有** impact、actual、forecast。
- 授權：[Disclaimer — Copyright/trademark](https://www.federalreserve.gov/disclaimer.htm)：「Unless otherwise indicated, information on Board's website is in the public domain and may be copied and distributed without permission. Please cite to the Board as the source.」禁止冒用印章／「Federal Reserve」字樣造成會員印象。
- 機器介面：沒有官方 FOMC JSON API。有 [Calendar HTML](https://www.federalreserve.gov/newsevents/calendar.htm) 與 [RSS](https://www.federalreserve.gov/feeds/feeds.htm)。本次對 HTML／RSS **未見 CORS**。
- 更新：年曆預先公布；單場在前一場會後確認。
- 靜態前端：不能直接 `fetch` HTML。可手維八個日期，或 Actions 抓頁烘焙。

### 3.2 BLS（就業 NFP、通膨 CPI）

- 擁有者：U.S. Bureau of Labor Statistics。
- 日曆：
  - iCal 說明：[Subscribe to iCal Calendar](https://www.bls.gov/help/hlpical.htm)。URL：`https://www.bls.gov/schedule/news_release/bls.ics`。內容是「即將數月、BLS 全國辦公室多數新聞稿的發布日」。**暫定每週五約 15:30 Eastern 更新**。
  - Employment Situation 規則：[CPS definitions — publication dates](https://www.bls.gov/cps/definitions.htm)：通常是含 12 日那週之後的第三個週五，多半是次月第一個週五；聯邦假日改前一日週四。時點慣例 8:30 ET（見各新聞稿 embargo 行，例如 BEA／Census 聯合稿也寫 8:30 a.m.）。
- 資料 API（**不是日曆**）：[Developers](https://www.bls.gov/audience/developers.htm)、[API FAQs](https://www.bls.gov/developers/api_FAQs.htm)。v2 要註冊金鑰，每日 500 次、每 10 秒 50 次；v1 每日 25 次。回的是序列值，不是「明天幾點公布」。
- 授權：
  - [BLS Copyright Information](https://www.bls.gov/opub/copyright-information.htm)：聯邦機關出版物（除先前已有版權的照片插圖）屬 **public domain**，可自由使用，請註明 BLS。
  - [API Terms of Service](https://www.bls.gov/developers/termsOfService.htm)：二次使用不限制終端用途；須註明擷取日期，並寫「BLS.gov cannot vouch for the data or analyses derived from these data after the data have been retrieved from BLS.gov。」禁止用 BLS logo。
  - [Terms of Use — robots](https://www.bls.gov/bls/blsterms.htm)：過度機器人抓取禁止。本次對 ICS 的 curl 被 Akamai 以機器人政策 403。
- CORS：API 有 `*`。ICS 因 403 無法驗證。
- 靜態前端：授權允許展示發布日程；瀏覽器直拉 ICS **本次失敗**。第一版不要依賴即時拉 ICS。

### 3.3 BEA（GDP、PCE／個人所得）

- 擁有者：U.S. Bureau of Economic Analysis。
- 日曆：
  - 網頁：[Release Schedule](https://www.bea.gov/news/schedule)。
  - ICS：[Online Calendar Subscription](https://www.bea.gov/news/schedule/icalendar) → [`online-calendar-subscription.ics`](https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics)。
  - 實測 ICS：`TZID:America/New_York`；`DTSTART` 為 UTC（例：`20250131T133000Z`＝美東 8:30）；欄位 `SUMMARY`（名稱）、`DTSTART`（時間）、`DESCRIPTION`（`www.bea.gov`）。**沒有** country／impact／actual／forecast。
  - 頁面側欄曾列「Machine-Readable Format JSON」；本次對 `/news/schedule.json` 等候選 URL **沒有拿到 JSON 檔**。可用的機器格式是 ICS。
- 授權／API：[BEA API Terms of Service PDF](https://apps.bea.gov/API/_pdf/bea_api_tos.pdf) 允許用 API 搜尋、顯示、分析、擷取 BEA 資料；應用須顯著標示 “This product uses the Bureau of Economic Analysis (BEA) Data API but is not endorsed or certified by BEA.” API 本身是統計值，不是日曆。ICS 屬網站資訊，聯邦作品預設公有領域（見 [resources.data.gov Open Licenses](https://resources.data.gov/open-licenses/) 對 17 U.S.C. § 105 的說明）。
- CORS：ICS **`Access-Control-Allow-Origin: *`**。這是本次唯一證實可被 GitHub Pages 前端直接讀的官方日曆檔。
- 更新：BEA 寫明年發布表會在新年前三個月上網站（[Priorities and Schedules](https://www.bea.gov/about/policies-and-information/priorities-and-schedules-posting-content)）。ICS `Last-Modified` 本次為 2026-07-13。
- 覆蓋：GDP、Personal Income and Outlays（含 PCE）、國際貿易等。**不含** FOMC、NFP、CPI、EIA。

### 3.4 EIA（能源週報）

- 擁有者：U.S. Energy Information Administration。
- 週報頁：[Weekly Petroleum Status Report](https://www.eia.gov/petroleum/supply/weekly/)。
- 日程：[WPSR Schedule](https://www.eia.gov/petroleum/supply/weekly/schedule.php)：**一般週三美東 10:30 之後**上 CSV／XLS／摘要；其餘 PDF／HTML **週三 13:00 之後**。含假日的週次常延一天；頁上有假日改期表（2026 年 Labor Day 改 9/10 週四 12:00 ET）。
- 天然氣週報是另一份產品（Weekly Natural Gas Storage Report），不在這張石油週報表裡；規格若要「能源」應分開列，並回 EIA 該產品頁確認時間。
- 授權：[Copyrights and Reuse](https://www.eia.gov/about/copyrights_reuse.php)：美國政府出版物公有領域，可使用／散布資料、檔案、圖表；請註明來源與出版日。Logo 是商標。
- API：[Terms of Service](https://www.eia.gov/opendata/terms-of-service.php) 明確允許「develop a service to search, display, analyze, retrieve, view and otherwise get information from EIA data」。要免費 key。[FAQ 節流](https://www.eia.gov/opendata/faqs.php)：未公布精確防火牆規則；一般建議持續 < ~9,000／小時、突發 < 5／秒。API 是序列，不是「下週三幾點公布」。
- CORS：API 有 `*`。週報 HTML 日程頁本次 503；`ir.eia.gov` CSV 會跳 CloudFront 簽名短時 URL，不適合作前端穩定日曆。
- 靜態前端：把「週三 10:30 ET，假日看官方表」寫成規則即可覆蓋多數週次；假日表需偶爾對官方頁。

### 3.5 Census（零售等）

- 擁有者：U.S. Census Bureau。
- 頁：[Economic Briefing Room](https://www.census.gov/economic-indicators/)。有 [calendar-listview](https://www.census.gov/economic-indicators/calendar-listview.html) 與 RSS `indicator.xml`（頁上圖示）。
- 機器人政策（同頁）：禁止過度機器人；可能即時封鎖。
- CORS：本次 HTML **無 ACAO**。
- 與 BEA 聯合的國際貿易稿也在 BEA ICS 裡。零售銷售等仍以 Census 為準。

### 3.6 FRED（聖路易聯儲）

- [FRED API Terms of Use](https://fred.stlouisfed.org/docs/api/terms_of_use.html)：要 API key；須標示 “This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.” 第三方有版權的序列須另取得許可。**FRED 是序列庫，不是經濟日曆。** 本次對 `api.stlouisfed.org` 未觀察到 CORS。不要當日曆來源。

---

## 4. 外匯常見貨幣：官方央行日曆

這些是「利率決議日」，不是完整 FX 日曆（沒有各國 CPI／就業的單一官方彙總）。

| 貨幣 | 機關 | 官方日曆 | 機器／CORS | 授權要點 |
| --- | --- | --- | --- | --- |
| USD | Fed | [FOMC calendars](https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm) | HTML，無 CORS | 公有領域，引註 |
| EUR | ECB | [Governing Council meetings](https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html)；[Statistical calendars](https://www.ecb.europa.eu/press/calendars/statscal/html/index.en.html) | HTML，本次無 CORS。政策決定新聞稿 **14:15 CET**，見 [Governing Council decisions](https://www.ecb.europa.eu/press/govcdec/html/index.en.html) | 歐盟機構作品，使用時跟頁面版權聲明；前端仍過不了 CORS |
| GBP | BoE | [Upcoming MPC dates](https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates)；[Upcoming news](https://www.bankofengland.co.uk/news/upcoming) | HTML，本次無 CORS。公告通常週四 **12:00**（頁面說明） | 官方公開日程，前端不能直拉 |
| JPY | BoJ | 日銀公開「決定会合日程」年曆（官網 Announcements／Monetary Policy 年曆頁） | 預期同為 HTML、無 CORS | 需以 boj.or.jp 當期頁為準 |
| AUD／CAD／CHF 等 | RBA／BoC／SNB | 各央行政策會議年曆 | 同：HTML 日程，不是 JSON 日曆 API | 規格列「連到官方年曆」即可，不要假裝有統一 FX API |

**沒有**「G10 全部經濟事件、含 actual／forecast」的官方單一 API。那是商業彙總產品。

---

## 5. 台灣公開日曆

台灣**有**官方公開發布日程，但**沒有**一個「經濟日曆 JSON API」給瀏覽器。

### 5.1 行政院主計總處／中華民國統計資訊網

- 預告表：[預告發布時間表](https://www.stat.gov.tw/News_NoticeCalendar.aspx?n=3717)（主計總處網站也連到這份，見 [dgbas 資訊公開](https://www.dgbas.gov.tw) 側欄「統計發布時間表」）。
- 近期看板：[近期統計資料發布看板](https://www.stat.gov.tw/News_NoticeCalendar_Future.aspx?n=3907)。
- 實測欄位（頁面表格）：發布單位、資料項目、預定發布日期、**時刻（常見 16:00）**、資料期。CPI、失業率、國民所得概估等都在這張表。
- 授權：[主計總處政府網站資料開放宣告](https://www.dgbas.gov.tw/cp.aspx?n=3605) 採 [政府資料開放授權條款第 1 版](https://data.gov.tw/license)：無償、非專屬、可再授權，不限時間地域重製／改作／公開傳輸，**須註明出處**；不授與代表機關背書。
- CORS：HTML 200，**無 ACAO**，還設 ASP.NET session cookie。瀏覽器不能直拉。
- 更新：表上備註「於實際資料發布前 5 個工作日更正」；國民所得可能因審議延後。

### 5.2 中央銀行

- SDDS 預告：[Advance Release Calendar](https://www.cbc.gov.tw/en/cp-515-102276-849a0-2.html)（金融統計、外匯存底、利率、國際收支等，日期＋資料期）。註明 expected dates, subject to change。
- 新聞稿常寫下次發布時刻（例：金融情況「下午 4 時 20 分」），並指向「預告統計資料發布時間表」。
- 統計 API：[cpx.cbc.gov.tw API 說明](https://cpx.cbc.gov.tw/Data/ExportToAPIInfo) — `GET https://cpx.cbc.gov.tw/API/DataAPI/Get?FileName=項目代號`，JSON 序列。**不是日曆。** CORS 只允許 `petstore.swagger.io`。
- 授權：[政府網站資料開放宣告](https://www.cbc.gov.tw/tw/cp-307-36676-DE020-1.html) 同樣 OGDL-Taiwan-1.0（[英文版](https://www.cbc.gov.tw/en/cp-958-40419-F8209-2.html)）。金融統計月報頁另見創用 CC 姓名標示 3.0 台灣。須註明出處；logo／商標不在授權內。

### 5.3 其他部會

國發會景氣、經濟部工業生產／外銷訂單、財政部進出口，會出現在 stat.gov.tw 同一張跨機關預告表。不必另找「台灣經濟日曆 API」。勞動市場主序列在主計總處人力資源調查（同上表），不是美國 NFP 的台灣版 API。

---

## 6. 商業彙總 API（有欄位、授權與展示不合）

這些才給 trader 習慣的 **country + time + name + impact + actual + forecast + previous**。對「公開 GitHub Pages 個人日誌」幾乎都不能當本。

### 6.1 Finnhub Economic Calendar

- 文件：[API docs — Economic Calendar](https://finnhub.io/docs/api)（`GET /calendar/economic`，Premium）。欄位：`actual, country, estimate, event, impact, prev, time, unit`。時間字串如 `2020-06-02 01:30:00`（文件未寫時區；樣本像 UTC／交易所慣例，規格若用須再對一次官方樣本）。
- 歷史 surprise 僅 Enterprise。
- 授權：[Terms of Service](https://finnhub.io/terms-of-service)：**所有網站方案預設 personal use**；「not redistribute or share access to data or derived results … with anyone or any 3rd party without written approval」；個人方案不能給任何事業使用。公開 Pages 把日曆給訪客看＝再散佈。
- CORS：有 `*`，所以技術上金鑰會漏在前端。
- 定價頁寫 Economic Calendar 另計（本次見到約 $50／月、Personal Use）。

### 6.2 Financial Modeling Prep

- 文件：[Economic Data Releases Calendar](https://site.financialmodelingprep.com/developer/docs/stable/economics-calendar)。欄位：`date, country, event, currency, previous, estimate, actual, change, impact, changePercentage, unit`。FAQ：約 150+ 國、**時區 UTC**、約每 15 分鐘更新、日期窗最多 90 天。
- 授權：[Terms of Service](https://site.financialmodelingprep.com/terms-of-service)（2023-08-01）：
  - Personal Use 僅限個人非商業；**不得**把 Data 整合進任何第三人可及的工具／應用，**不得**為他人 host／share／display。
  - **Data Display**：沒有另簽協議，禁止在網站、部落格、軟體、多人應用展示（不論免費或付費、對內或對外）。
  - 禁止分享 API key。
- 定價頁明文：Displaying or redistributing data sourced from FMP requires a specific Data Display and Licensing Agreement。
- CORS：有 `*`。公開 Pages 展示＝違約。

### 6.3 Trading Economics

- API：[docs.tradingeconomics.com](https://docs.tradingeconomics.com/get_started/)；日曆 schema：[Economic Calendar Response Fields](https://docs.tradingeconomics.com/economic_calendar/schema/)：`Date`（UTC）、`Country`、`Category`、`Event`、`Source`、`Actual`／`Forecast`／`Previous`、importance 等。串流另有 WebSocket。
- 網站條款：[terms.aspx](https://tradingeconomics.com/terms.aspx)：「limited, personal, nontransferable, revocable license to analyse data」。API 定價依功能、量、**distribution** 調整（[api 頁](https://tradingeconomics.com/api/)）。
- CORS：鏡回 Origin。仍要金鑰；公開展示屬 distribution，不是免費個人分析授權能蓋的。

### 6.4 Alpha Vantage

- [Terms of Service](https://www.alphavantage.co/terms_of_service/)：商業用途要另洽 `premium@alphavantage.co`。Economic Indicators API 走 FRED，須另守 [FRED API ToS](https://fred.stlouisfed.org/docs/api/terms_of_use.html)。
- 文件有經濟**指標序列**與 earnings calendar，**不是**全球經濟事件日曆。免費額度 25 次／日（[support](https://www.alphavantage.co/support)）。不適合作當日日誌自動灌入。

### 6.5 Forex Factory

- 無官方公開 API。條款頁 [notices](https://www.forexfactory.com/notices)（Fair Economy, Inc.）：使用服務**不**取得內容智慧財產權；「Users may not use content from FEI's Services unless Users obtain permission from its owner or are otherwise permitted by law。」
- 實測：Cloudflare 挑戰、CORP `same-origin`、403。
- 規格：**排除**。社群刮蟲與第三方「FF JSON」都不是第一方授權。

### 6.6 Investing.com（Fusion Media）

- [Terms and Conditions PDF](https://cdn.investing.com/about-us/terms_and_conditions.pdf)：「You are expressly forbidden from employing any automated system or software to extract data for content from this website for any purpose. This includes, but is not limited to, scraping, data mining, robot or spider programs…」另禁止未書面同意散布／展示 Market Information。
- **排除。**

---

## 7. 資料在哪裡過期

| 來源類 | 權威新鮮度 | 若走烘焙／快取，過期點 |
| --- | --- | --- |
| BEA ICS | 檔案 `Last-Modified`；網站年曆預先公布 | 瀏覽器或 Actions 最後成功讀到 ICS 的時間。假日／shutdown 改期後，舊 ICS 會錯到下次拉 |
| BLS ICS | 文件：週五約 15:30 ET 暫定更新 | 若拉得到：同上。本次連拉都失敗 → 不能當即時依賴 |
| FOMC | 前一場會確認下一場；聲明當日 14:00 ET | 手維／烘焙的日期表；tentative 場次可能改 |
| EIA 週報 | 規則週三 10:30 ET；假日看官方表 | 規則本身很少改；假日表每年要對一次 |
| 台灣預告表 | 發布前 5 個工作日可更正 | 烘焙後直到下次成功抓頁 |
| Finnhub／FMP／TE | FMP 自稱 ~15 分鐘；TE 可串流 | **不建議用**。若違規使用，過期點仍是最後一次 API 成功 |
| 站內 JSON（Actions） | workflow 跑完的 commit 時間 | **這是第一版最誠實的過期點** |

「過期」對當日日誌的意思：盤前看到的事件名單，可能缺當日臨時改期、或還沒收 actual。日誌本體（計畫／複盤）在 localStorage，不該跟日曆一起過期。

---

## 8. 失敗時當日日誌長什麼樣

日誌寫入路徑與經濟事件解耦。

成功：當日日誌經濟事件區列出該日項目（時間已轉使用者時區、國別／機關、名稱、來源連回官方頁）。不顯示假的 impact 燈號，除非手填。

失敗或過期（任一種：CORS、403、ICS 解析失敗、Actions 沒跑、JSON 缺當日）：

1. 盤前／盤後欄位仍可編、仍可存 localStorage。
2. 經濟事件區改為：
   - 一句：「本日經濟事件未能自動更新。」
   - 上次成功時間（若有）。
   - 官方連結清單：Fed FOMC、BLS schedule、BEA schedule、EIA WPSR、stat.gov.tw 預告表、CBC ARC。
   - 「手動新增一筆」——名稱、時間、市場。這筆存在該日日誌裡，不依賴外網。
3. 不要用空白假裝「今日無事」；無事件與抓取失敗要分開。無事件＝成功取回且過濾後為空。失敗＝不知道。

時區顯示：美盤用 America/New_York（ICS 已標）；台灣用 Asia/Taipei（預告表 16:00 即此時區）；ECB 用 Europe/Berlin（CET／CEST）。存檔用絕對時間（UTC ISO），畫面再轉。

---

## 9. 靜態站三種合法架構（由窄到寬）

**A. 純前端、無金鑰、無 Actions（最窄，符合「本機可記、可上架」最小集）**

- 瀏覽器只拉 BEA ICS（已證實 CORS `*`）。
- FOMC／EIA／BLS／台灣：內建靜態表（FOMC 八場、EIA「週三 10:30 ET」、BLS「Employment Situation 多為次月首週五 8:30 ET」、台灣 CPI 約每月上旬 16:00）＋「過期請對官方頁」。
- 外匯：連到官方年曆，不自動列。
- 失敗：BEA ICS 掛了就只剩靜態表與手填。

**B. 同源烘焙（小代理的替代，仍不是自建伺服器）**

- GitHub Actions 定期抓 BEA ICS、（若 CI 不被擋）BLS ICS、必要時解析 Fed／stat.gov.tw。
- 寫 `econ-calendar.json` 進倉庫，Pages 同源讀。
- 過期＝最後一次成功 commit。
- 需要人同意「機器寫回倉庫」。

**C. 真的小代理＋付費展示授權**

- 自建或 serverless 代打 Finnhub／FMP／TE，金鑰留在伺服器。
- 另簽 redistribution／data display。
- **超出目前目的地**（無伺服器假設）。規格應寫「不做，除非另開票」。

---

## 10. 官方來源能給的欄 vs 日誌想要的欄

| 欄 | 官方日程（Fed／BLS／BEA／EIA／台灣） | 商業彙總 |
| --- | --- | --- |
| 時間 | 有（ICS 或表格時刻） | 有 |
| 國家／幣別 | 隱含（美／台／歐元區）；FX 要自己標 | 有 |
| 名稱 | 有 | 有 |
| 影響等級 | **無** | 有（廠商自訂） |
| actual／forecast／previous | **無**（公布後在新聞稿／API 序列裡，不是日曆） | 有 |
| 來源機關 | 有或可推 | 有時有 |

第一版自動灌入鎖：時間、市場、名稱、官方連結。其餘手填。

---

## 11. 證據索引（第一方）

- GitHub Pages：[About GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages)
- Fed 日曆：[fomccalendars.htm](https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm)；時間：[2027 會期新聞稿](https://www.federalreserve.gov/newsevents/pressreleases/monetary20250905a.htm)；授權：[disclaimer.htm](https://www.federalreserve.gov/disclaimer.htm)
- BLS iCal：[hlpical.htm](https://www.bls.gov/help/hlpical.htm)；版權：[copyright-information.htm](https://www.bls.gov/opub/copyright-information.htm)；API ToS：[termsOfService.htm](https://www.bls.gov/developers/termsOfService.htm)；機器人：[blsterms.htm](https://www.bls.gov/bls/blsterms.htm)；NFP 排程規則：[cps/definitions.htm](https://www.bls.gov/cps/definitions.htm)
- BEA ICS：[icalendar](https://www.bea.gov/news/schedule/icalendar)；API ToS：[bea_api_tos.pdf](https://apps.bea.gov/API/_pdf/bea_api_tos.pdf)
- EIA 週報日程：[schedule.php](https://www.eia.gov/petroleum/supply/weekly/schedule.php)；再利用：[copyrights_reuse.php](https://www.eia.gov/about/copyrights_reuse.php)；API ToS：[terms-of-service.php](https://www.eia.gov/opendata/terms-of-service.php)
- Census：[economic-indicators](https://www.census.gov/economic-indicators/)
- FRED API ToS：[terms_of_use.html](https://fred.stlouisfed.org/docs/api/terms_of_use.html)
- ECB：[mgcgc calendar](https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html)；[govcdec](https://www.ecb.europa.eu/press/govcdec/html/index.en.html)
- BoE：[upcoming-mpc-dates](https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates)
- 台灣預告表：[News_NoticeCalendar](https://www.stat.gov.tw/News_NoticeCalendar.aspx?n=3717)；OGDL：[data.gov.tw/license](https://data.gov.tw/license)；主計總處宣告：[cp.aspx?n=3605](https://www.dgbas.gov.tw/cp.aspx?n=3605)；央行 ARC：[cbc Advance Release Calendar](https://www.cbc.gov.tw/en/cp-515-102276-849a0-2.html)；央行開放宣告：[cp-307-36676](https://www.cbc.gov.tw/tw/cp-307-36676-DE020-1.html)
- Finnhub ToS：[finnhub.io/terms-of-service](https://finnhub.io/terms-of-service)；文件：[finnhub.io/docs/api](https://finnhub.io/docs/api)
- FMP ToS：[terms-of-service](https://site.financialmodelingprep.com/terms-of-service)；日曆文件：[economics-calendar](https://site.financialmodelingprep.com/developer/docs/stable/economics-calendar)
- Trading Economics 條款：[terms.aspx](https://tradingeconomics.com/terms.aspx)；schema：[economic_calendar/schema](https://docs.tradingeconomics.com/economic_calendar/schema/)
- Alpha Vantage ToS：[alphavantage.co/terms_of_service](https://www.alphavantage.co/terms_of_service/)
- Forex Factory：[forexfactory.com/notices](https://www.forexfactory.com/notices)
- Investing.com：[terms_and_conditions.pdf](https://cdn.investing.com/about-us/terms_and_conditions.pdf)

CORS／ICS 實測：2026-09-09，`curl -I -H 'Origin: https://example.github.io'`。BEA ICS 本體確認 `TZID:America/New_York` 與 `SUMMARY`／`DTSTART`。BLS ICS 回 403 Access Denied（機器人政策頁）。

/*
 * 交易日誌 — 日程表 (hand-maintained official release schedule; ticket 17).
 *
 * This is a plain data table, NOT a rule engine. Every row is one already-
 * known, already-published date pulled from an official source — nothing
 * here computes "FOMC is every six weeks" or "first Friday of the month" at
 * runtime. When a row's date needs updating (e.g. a "tentative" FOMC date
 * gets confirmed, or next year's calendar is published), a human edits this
 * file and bumps SCHEDULE_VERIFIED_AS_OF. See docs/adr/0001 for why this is
 * hand-maintained instead of an ICS pull or a CI bake.
 *
 * Scope (locked by ticket 17 / grilling in .scratch/pro-journal/issues/10):
 * only FOMC Statement, FOMC Press Conference, BLS Employment Situation, BLS
 * CPI, BEA GDP (any of its 3 estimates), and BEA Personal Income & Outlays.
 * Explicitly EXCLUDED: EIA (any release), any other BEA release (trade,
 * state GDP as a standalone item, etc.). Do not add rows outside these six
 * categories without a new ticket.
 *
 * Times are stored already in America/New_York wall-clock time (the "時間"
 * column), exactly as each agency states it (Fed: 2:00pm / 2:30pm ET; BLS
 * and BEA: 8:30am ET) — there is no UTC-to-ET conversion to get right or get
 * wrong at display time, because nothing here is stored in UTC. dateET is
 * the same America/New_York calendar date the release lands on.
 *
 * Verified against primary sources on SCHEDULE_VERIFIED_AS_OF:
 *   - https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
 *   - https://www.bls.gov/schedule/news_release/empsit.htm
 *   - https://www.bls.gov/schedule/news_release/cpi.htm
 *   - https://www.bea.gov/news/schedule (and its ICS feed, which lists GDP
 *     and Personal Income and Outlays release dates through 2026-12)
 * 2026 FOMC dates are published but "tentative until confirmed at the
 * meeting immediately preceding it" per the Fed's own calendar page.
 *
 * Usage (browser, plain <script> tag — load before store.js/app.js):
 *   TradingJournalSchedule.getScheduledEventsForDate("2026-09-16")
 *   // -> [ {id, dateET, timeET, name, agency, url}, ... ] (FOMC 聲明 + 記者會)
 *   TradingJournalSchedule.SCHEDULE_VERIFIED_AS_OF // -> "2026-09-10"
 *
 * Usage (Node, tests):
 *   const Schedule = require("./schedule.js");
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.TradingJournalSchedule = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // 日程表核對日 — last time this table was checked against the official
  // pages listed above. Not "last successful fetch": there is no fetch.
  var SCHEDULE_VERIFIED_AS_OF = "2026-09-10";

  var FED_AGENCY = "聯準會（Federal Reserve / FOMC）";
  var FED_URL = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";

  var BLS_AGENCY = "美國勞工統計局（U.S. Bureau of Labor Statistics, BLS）";
  var BLS_EMPSIT_URL = "https://www.bls.gov/schedule/news_release/empsit.htm";
  var BLS_CPI_URL = "https://www.bls.gov/schedule/news_release/cpi.htm";

  var BEA_AGENCY = "美國經濟分析局（U.S. Bureau of Economic Analysis, BEA）";
  var BEA_GDP_URL = "https://www.bea.gov/data/gdp/gross-domestic-product";
  var BEA_PIO_URL = "https://www.bea.gov/data/income-saving/personal-income";

  // ---- FOMC: statement day per meeting (second day of the two-day
  // meeting). Each date below produces two rows: statement (14:00 ET) and
  // press conference (14:30 ET), per the Fed's own press-release schedule
  // ("2027 年會期新聞稿" cited in research/economic-calendar.md).
  var FOMC_STATEMENT_DATES = [
    // 2024 — all confirmed
    "2024-01-31", "2024-03-20", "2024-05-01", "2024-06-12",
    "2024-07-31", "2024-09-18", "2024-11-07", "2024-12-18",
    // 2025 — all confirmed
    "2025-01-29", "2025-03-19", "2025-05-07", "2025-06-18",
    "2025-07-30", "2025-09-17", "2025-10-29", "2025-12-10",
    // 2026 — tentative until confirmed at the preceding meeting
    "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17",
    "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09",
  ];

  // ---- BLS Employment Situation (非農/失業率月報). Release date, 8:30 ET.
  var BLS_EMPLOYMENT_SITUATION_DATES = [
    "2025-12-16", // Nov 2025 data
    "2026-01-09", // Dec 2025 data
    "2026-02-11", // Jan 2026 data
    "2026-03-06", // Feb 2026 data
    "2026-04-03", // Mar 2026 data
    "2026-05-08", // Apr 2026 data
    "2026-06-05", // May 2026 data
    "2026-07-02", // Jun 2026 data (early: July 4 holiday week)
    "2026-08-07", // Jul 2026 data
    "2026-09-04", // Aug 2026 data
    "2026-10-02", // Sep 2026 data
    "2026-11-06", // Oct 2026 data
    "2026-12-04", // Nov 2026 data
  ];

  // ---- BLS CPI (消費者物價指數). Release date, 8:30 ET.
  var BLS_CPI_DATES = [
    "2025-12-18", // Nov 2025 data
    "2026-01-13", // Dec 2025 data
    "2026-02-13", // Jan 2026 data
    "2026-03-11", // Feb 2026 data
    "2026-04-10", // Mar 2026 data
    "2026-05-12", // Apr 2026 data
    "2026-06-10", // May 2026 data
    "2026-07-14", // Jun 2026 data
    "2026-08-12", // Jul 2026 data
    "2026-09-11", // Aug 2026 data
    "2026-10-14", // Sep 2026 data
    "2026-11-10", // Oct 2026 data
    "2026-12-10", // Nov 2026 data
  ];

  // ---- BEA GDP (three estimates per quarter) + Personal Income and
  // Outlays (includes PCE). BEA publishes both on the same release day each
  // month, 8:30 ET. Pulled from bea.gov/news/schedule's ICS feed.
  var BEA_RELEASES = [
    { date: "2026-02-20", gdp: "GDP 預估（Advance Estimate）· 2025 Q4 暨全年", pio: "個人所得與支出 · 2025 年 12 月" },
    { date: "2026-03-13", gdp: "GDP 第二次估計（Second Estimate）· 2025 Q4 暨全年", pio: "個人所得與支出 · 2026 年 1 月" },
    { date: "2026-04-09", gdp: "GDP 第三次估計（Third Estimate）· 2025 Q4 暨全年", pio: "個人所得與支出 · 2026 年 2 月" },
    { date: "2026-04-30", gdp: "GDP 預估（Advance Estimate）· 2026 Q1", pio: "個人所得與支出 · 2026 年 3 月" },
    { date: "2026-05-28", gdp: "GDP 第二次估計（Second Estimate）· 2026 Q1", pio: "個人所得與支出 · 2026 年 4 月" },
    { date: "2026-06-25", gdp: "GDP 第三次估計（Third Estimate）· 2026 Q1", pio: "個人所得與支出 · 2026 年 5 月" },
    { date: "2026-07-30", gdp: "GDP 預估（Advance Estimate）· 2026 Q2", pio: "個人所得與支出 · 2026 年 6 月" },
    { date: "2026-08-26", gdp: "GDP 第二次估計（Second Estimate）· 2026 Q2", pio: "個人所得與支出 · 2026 年 7 月" },
    { date: "2026-09-30", gdp: "GDP 第三次估計（Third Estimate）· 2026 Q2", pio: "個人所得與支出 · 2026 年 8 月" },
    { date: "2026-10-29", gdp: "GDP 預估（Advance Estimate）· 2026 Q3", pio: "個人所得與支出 · 2026 年 9 月" },
    { date: "2026-11-25", gdp: "GDP 第二次估計（Second Estimate）· 2026 Q3", pio: "個人所得與支出 · 2026 年 10 月" },
    { date: "2026-12-23", gdp: "GDP 第三次估計（Third Estimate）· 2026 Q3", pio: "個人所得與支出 · 2026 年 11 月" },
  ];

  // ---- build the flat row table -----------------------------------------

  function buildSchedule() {
    var rows = [];

    FOMC_STATEMENT_DATES.forEach(function (date) {
      rows.push({ id: "fomc-statement-" + date, dateET: date, timeET: "14:00", name: "FOMC 聲明", agency: FED_AGENCY, url: FED_URL });
      rows.push({ id: "fomc-presser-" + date, dateET: date, timeET: "14:30", name: "FOMC 記者會", agency: FED_AGENCY, url: FED_URL });
    });

    BLS_EMPLOYMENT_SITUATION_DATES.forEach(function (date) {
      rows.push({ id: "bls-empsit-" + date, dateET: date, timeET: "08:30", name: "Employment Situation（就業狀況報告）", agency: BLS_AGENCY, url: BLS_EMPSIT_URL });
    });

    BLS_CPI_DATES.forEach(function (date) {
      rows.push({ id: "bls-cpi-" + date, dateET: date, timeET: "08:30", name: "CPI（消費者物價指數）", agency: BLS_AGENCY, url: BLS_CPI_URL });
    });

    BEA_RELEASES.forEach(function (r) {
      rows.push({ id: "bea-gdp-" + r.date, dateET: r.date, timeET: "08:30", name: r.gdp, agency: BEA_AGENCY, url: BEA_GDP_URL });
      rows.push({ id: "bea-pio-" + r.date, dateET: r.date, timeET: "08:30", name: r.pio, agency: BEA_AGENCY, url: BEA_PIO_URL });
    });

    rows.sort(function (a, b) {
      if (a.dateET !== b.dateET) return a.dateET < b.dateET ? -1 : 1;
      if (a.timeET !== b.timeET) return a.timeET < b.timeET ? -1 : 1;
      return 0;
    });

    return rows;
  }

  var SCHEDULE = buildSchedule();

  function deepCloneRow(row) {
    return { id: row.id, dateET: row.dateET, timeET: row.timeET, name: row.name, agency: row.agency, url: row.url };
  }

  // The one lookup the rest of the app needs: given a 交易日 (America/New_York
  // calendar date), which official rows land on it. Most dates: empty array
  // — that is correct, not a bug, and callers must not treat it as failure.
  function getScheduledEventsForDate(dateET) {
    return SCHEDULE.filter(function (row) { return row.dateET === dateET; }).map(deepCloneRow);
  }

  function getFullSchedule() {
    return SCHEDULE.map(deepCloneRow);
  }

  return {
    SCHEDULE_VERIFIED_AS_OF: SCHEDULE_VERIFIED_AS_OF,
    getScheduledEventsForDate: getScheduledEventsForDate,
    getFullSchedule: getFullSchedule,
  };
});

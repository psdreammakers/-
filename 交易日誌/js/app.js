/*
 * 交易日誌 — UI layer. Talks to the journal data store (js/store.js) only
 * through its public API; keeps no trading logic of its own.
 */
(function () {
  "use strict";

  var store = window.TradingJournal.createDefaultStore();
  var GRADES = window.TradingJournal.GRADES;
  var SIDES = window.TradingJournal.SIDES;
  var MIND_GAME_TYPES = window.TradingJournal.MIND_GAME_TYPES;

  var state = {
    tab: "cmd", // "cmd" | "psych"
    formOpen: false,
    formErrors: [],
    openCardId: null, // set when a trade report card's detail view is open (also opened from 當日日誌 or 心理戰)
    detailErrors: [],
    filters: store.createDefaultFilters(),
    settingsOpen: false,
    settingsErrors: [],
    calendarMonth: currentMonthET(), // "YYYY-MM", 損益月曆 shown on 指揮中心
    openDayJournalDate: null, // "YYYY-MM-DD" | null — 當日日誌 overlay (also opened from 心理戰)
    mindGameErrorsForCard: [], // errors from the 心理遊戲 add-form inside 交易報告卡 detail
    mindGameErrorsForDay: [], // errors from the 心理遊戲 add-form inside 當日日誌

    // ---- 分解表與時段熱力圖聯動 (ticket 16) ------------------------------
    // Ephemeral, separate from state.filters (ticket 14's primary filter
    // bar). Never mutates state.filters, never affects hero stats/equity
    // curve, and 損益月曆 never touches it. See renderLinkedSection() below.
    breakdownDimension: "all", // "all" | "setup" | "product" | "grade"
    // null, or { kind:"breakdown", dimension, key } / { kind:"heatmap", weekday, hour }
    secondarySelection: null,
    breakdownSort: { col: "cumulativeEquity", dir: "desc" }, // display-only re-sort of store's rows
    tradeSort: { col: "time", dir: "desc" },
  };

  var app = document.getElementById("app");
  var WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  // 交易日 is an America/New_York calendar date (same as each card's dateET).
  function todayET() {
    try {
      var fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      return fmt.format(new Date());
    } catch (e) {
      var d = new Date();
      return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
    }
  }

  function currentMonthET() {
    return todayET().slice(0, 7);
  }

  function shiftMonth(ym, delta) {
    var year = parseInt(ym.slice(0, 4), 10);
    var month = parseInt(ym.slice(5, 7), 10);
    var d = new Date(Date.UTC(year, month - 1 + delta, 1));
    return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1);
  }

  function money(n) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    var rounded = Math.round(n * 100) / 100;
    var sign = rounded > 0 ? "+" : "";
    var cls = rounded > 0 ? "profit" : rounded < 0 ? "loss" : "";
    return '<span class="' + cls + '">' + sign + rounded.toLocaleString("en-US") + "</span>";
  }

  // number that isn't a dollar amount (ratios, counts) — no +/- coloring
  function num(n, decimals) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    return n.toFixed(decimals === undefined ? 2 : decimals);
  }

  function pct(n) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    return (n * 100).toFixed(1) + "%";
  }

  function escapeHtml(s) {
    if (s === null || s === undefined) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function accountName(accountId, accounts) {
    var found = accounts.filter(function (a) { return a.id === accountId; })[0];
    return found ? found.name : accountId;
  }

  function optionsHtml(values, selected) {
    return values
      .map(function (v) {
        return '<option value="' + escapeHtml(v) + '"' + (v === selected ? " selected" : "") + ">" + escapeHtml(v) + "</option>";
      })
      .join("");
  }

  // ---- command center -----------------------------------------------

  function renderFilterBar() {
    var accounts = store.getAccounts();
    var products = store.getProducts();
    var setups = store.getSetups();
    var f = state.filters;

    var accountOptions =
      '<option value="all"' + (f.accountId === "all" ? " selected" : "") + ">全部帳戶</option>" +
      accounts.map(function (a) {
        return '<option value="' + escapeHtml(a.id) + '"' + (a.id === f.accountId ? " selected" : "") + ">" + escapeHtml(a.name) + "</option>";
      }).join("");

    var productOptions =
      '<option value="all"' + (f.product === "all" ? " selected" : "") + ">全部商品</option>" +
      optionsHtml(products, f.product === "all" ? undefined : f.product);

    var setupOptions =
      '<option value="all"' + (f.setup === "all" ? " selected" : "") + ">全部 setup</option>" +
      optionsHtml(setups, f.setup === "all" ? undefined : f.setup);

    return (
      '<div class="panel">' +
      '<div class="row">' +
      '<label class="filter-field">帳戶<select id="filter-account">' + accountOptions + "</select></label>" +
      '<label class="filter-field">商品<select id="filter-product">' + productOptions + "</select></label>" +
      '<label class="filter-field">setup 標<select id="filter-setup">' + setupOptions + "</select></label>" +
      '<label class="filter-field">從<input type="date" id="filter-from" value="' + escapeHtml(f.dateFrom || "") + '"></label>' +
      '<label class="filter-field">到<input type="date" id="filter-to" value="' + escapeHtml(f.dateTo || "") + '"></label>' +
      '<button class="ghost" id="filter-clear-btn">清除篩選</button>' +
      "</div>" +
      "</div>"
    );
  }

  // 權益線 hover/click (ticket 20). Each <circle> below carries the point's
  // date/equity/day-net-P&L/day-card-count as data-* attributes, read by
  // wire() to show a tooltip on hover and open 當日日誌 on click. Hovering
  // is pure DOM (no state change, no re-render) so it stays smooth; only a
  // click ever touches `state`, and it only ever sets openDayJournalDate —
  // never the filter bar, never any breakdown/heatmap/trade-list selection.
  function renderEquityCurve(equityCurve) {
    if (!equityCurve) {
      return '<p class="muted">全部帳戶不畫合成權益線（每戶初始資金不同，沒有一條真的總權益）</p>';
    }
    var points = equityCurve.points;
    if (!points.length) {
      return '<p class="muted">這個篩選下沒有交易，權益線只有起點 ' + money(equityCurve.startEquity) + "</p>";
    }

    var values = [equityCurve.startEquity].concat(points.map(function (p) { return p.equity; }));
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var span = max - min || 1;
    var W = 600;
    var H = 140;
    var pad = 8;

    function xAt(i) {
      return values.length <= 1 ? 0 : (i / (values.length - 1)) * W;
    }
    function yAt(v) {
      return H - pad - ((v - min) / span) * (H - pad * 2);
    }

    var coords = values.map(function (v, i) { return xAt(i) + "," + yAt(v); }).join(" ");
    var last = values[values.length - 1];
    var lastColor = last > equityCurve.startEquity ? "var(--green)" : last < equityCurve.startEquity ? "var(--red)" : "var(--sky)";

    // One hoverable/clickable marker per card point (index i+1 into `values`,
    // since index 0 is the synthetic startEquity vertex with no card behind it).
    var markers = points
      .map(function (p, i) {
        return (
          '<circle class="eq-point" cx="' + xAt(i + 1) + '" cy="' + yAt(p.equity) + '" r="5" ' +
          'data-date="' + escapeHtml(p.dateET) + '" ' +
          'data-equity="' + p.equity + '" ' +
          'data-day-net-pnl="' + p.dayNetPnl + '" ' +
          'data-day-count="' + p.dayCardCount + '"></circle>'
        );
      })
      .join("");

    return (
      '<div class="equity-curve-wrap">' +
      '<svg viewBox="0 0 ' + W + " " + H + '" class="equity-curve" preserveAspectRatio="none">' +
      '<polyline points="' + coords + '" fill="none" stroke="' + lastColor + '" stroke-width="2"></polyline>' +
      '<g class="eq-points">' + markers + "</g>" +
      "</svg>" +
      '<div class="equity-tooltip" id="equity-tooltip" hidden></div>' +
      "</div>"
    );
  }

  function statHero(label, value) {
    return '<div class="hero"><div class="l">' + escapeHtml(label) + '</div><div class="v">' + value + "</div></div>";
  }

  function renderCommandCenter() {
    var accounts = store.getAccounts();
    var demo = store.isDemoActive();
    var stats = store.getCommandCenterStats(state.filters);

    var banner = demo
      ? '<div class="demo-banner">示範資料 — 這些是出廠範例交易，尚未有你自己的真實紀錄。存下第一筆真的交易報告卡後會自動消失。</div>'
      : "";

    var heroes = "";
    if (stats.mode === "single") {
      heroes +=
        statHero("目前權益", money(stats.currentEquity)) +
        statHero("初始資金", money(stats.startingCapital));
    }
    heroes +=
      statHero("累積損益", money(stats.netPnl)) +
      statHero("筆數", stats.count) +
      statHero("勝率", pct(stats.winRate)) +
      statHero("平均賺", money(stats.avgWin)) +
      statHero("平均賠", money(stats.avgLoss)) +
      statHero("期望值", money(stats.expectancy)) +
      statHero("賺賠比", num(stats.profitFactor)) +
      statHero("風報比", num(stats.rewardRiskRatio)) +
      statHero("最大單筆賺", money(stats.maxWin)) +
      statHero("最大單筆賠", money(stats.maxLoss)) +
      statHero("總手續費", money(stats.totalFees));

    var equityPanel =
      '<div class="panel">' +
      "<h2>權益線" + (stats.mode === "single" ? "（" + escapeHtml(stats.accountName) + "）" : "") + "</h2>" +
      renderEquityCurve(stats.equityCurve) +
      "</div>";

    return (
      banner +
      renderFilterBar() +
      '<div class="heroes">' + heroes + "</div>" +
      equityPanel +
      renderCalendar() +
      renderLinkedSection(stats, accounts)
    );
  }

  // ---- 分解表 · 時段熱力圖 · 交易報告卡清單 (ticket 16, "linked selection") --
  //
  // Three views of ONE shared ephemeral selection (state.secondarySelection),
  // kept deliberately separate from ticket 14's primary filter bar:
  //   - it is never written into state.filters
  //   - it never affects the hero stats or equity curve above (those only
  //     ever read state.filters, via stats = getCommandCenterStats(state.filters)
  //     computed in renderCommandCenter — this section only narrows further,
  //     downstream of that)
  //   - 損益月曆 above stays untouched by it, per existing behavior
  //
  // Clicking a breakdown row or a heatmap cell narrows the OTHER TWO views;
  // the view that originated the click keeps showing the full
  // primary-filtered set (highlighting the picked row/cell) rather than
  // collapsing into itself — this is what lets you compare rows/cells while
  // one of them is selected. This whole section is appended as one
  // self-contained function so it can be lifted/merged without touching the
  // equity-curve or day-journal code above it (owned by tickets 20 / 17+19).

  var BREAKDOWN_DIMENSIONS = [
    ["all", "全部"],
    ["setup", "setup 標"],
    ["product", "商品"],
    ["grade", "成績"],
  ];

  var BREAKDOWN_COLUMNS = [
    ["title", "標題"],
    ["count", "筆數"],
    ["winRate", "勝率"],
    ["expectancy", "期望值"],
    ["avgWin", "平均賺"],
    ["avgLoss", "平均賠"],
    ["profitFactor", "賺賠比"],
    ["rewardRiskRatio", "風報比"],
    ["cumulativeEquity", "累積權益"],
  ];

  var TRADE_COLUMNS = [
    ["time", "時間"],
    ["account", "帳戶"],
    ["product", "商品"],
    ["setup", "setup"],
    ["side", "方向"],
    ["size", "口數"],
    ["grade", "成績"],
    ["execGrade", "執行"],
    ["pnl", "損益"],
  ];

  var WEEKDAY_LABELS_SHORT = ["日", "一", "二", "三", "四", "五", "六"];

  // Narrows a primary-filtered card list down to the current linked
  // selection. Returns the input unchanged when there is no selection.
  function narrowCardsBySelection(cards, selection) {
    if (!selection) return cards;
    if (selection.kind === "breakdown") {
      if (selection.dimension === "grade") return cards.filter(function (c) { return c.grade === selection.key; });
      if (selection.dimension === "setup") return cards.filter(function (c) { return c.setup === selection.key; });
      if (selection.dimension === "product") return cards.filter(function (c) { return c.product === selection.key; });
      return cards;
    }
    if (selection.kind === "heatmap") {
      return cards.filter(function (c) {
        return window.TradingJournal.weekdayOfDateET(c.dateET) === selection.weekday &&
          parseInt(c.timeET.slice(0, 2), 10) === selection.hour;
      });
    }
    return cards;
  }

  // Generic display-only sort (headers are clickable; the store always
  // hands back its own default order, e.g. 累積權益 descending for
  // breakdown rows, 時間 descending is applied here for the trade list).
  function sortRows(rows, col, dir, valueFn) {
    var factor = dir === "asc" ? 1 : -1;
    return rows.slice().sort(function (a, b) {
      var av = valueFn(a, col);
      var bv = valueFn(b, col);
      if (av === null || av === undefined) av = -Infinity;
      if (bv === null || bv === undefined) bv = -Infinity;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
      return String(av).localeCompare(String(bv), "zh") * factor;
    });
  }

  function renderBreakdownTable(rows, dimension, selection, sort) {
    var sorted = sortRows(rows, sort.col, sort.dir, function (row, col) { return row[col]; });

    var heads = BREAKDOWN_COLUMNS.map(function (colDef) {
      var col = colDef[0];
      var mark = sort.col === col ? (sort.dir === "asc" ? " ↑" : " ↓") : "";
      return '<th class="sortable" data-breakdown-sort="' + col + '">' + escapeHtml(colDef[1]) + mark + "</th>";
    }).join("");

    var body = sorted.map(function (row) {
      var picked = selection && selection.kind === "breakdown" &&
        selection.dimension === dimension && selection.key === row.key;
      var attrs = dimension === "all"
        ? 'data-breakdown-clear="1"'
        : 'data-breakdown-dim="' + escapeHtml(dimension) + '" data-breakdown-key="' + escapeHtml(row.key) + '"';
      return (
        '<tr class="clickable' + (picked ? " picked" : "") + '" ' + attrs + '>' +
        "<td>" + escapeHtml(row.title) + "</td>" +
        "<td>" + row.count + "</td>" +
        "<td>" + pct(row.winRate) + "</td>" +
        "<td>" + money(row.expectancy) + "</td>" +
        "<td>" + money(row.avgWin) + "</td>" +
        "<td>" + money(row.avgLoss) + "</td>" +
        "<td>" + num(row.profitFactor) + "</td>" +
        "<td>" + num(row.rewardRiskRatio) + "</td>" +
        "<td>" + money(row.cumulativeEquity) + "</td>" +
        "</tr>"
      );
    }).join("");

    return '<div class="scroll"><table class="grid"><tr>' + heads + "</tr>" + body + "</table></div>";
  }

  function renderHeatmap(grid, selection) {
    var out = '<div class="scroll"><div class="heatmap-grid">';
    out += '<div class="heatmap-hd corner"></div>';
    for (var h = 0; h < 24; h++) out += '<div class="heatmap-hd">' + h + "</div>";
    for (var wd = 0; wd < 7; wd++) {
      out += '<div class="heatmap-wd">' + WEEKDAY_LABELS_SHORT[wd] + "</div>";
      for (var h2 = 0; h2 < 24; h2++) {
        var cell = grid[wd][h2];
        var cls = "heatmap-cell";
        if (cell.count === 0) cls += " empty";
        else if (cell.netPnl > 0) cls += " pos";
        else if (cell.netPnl < 0) cls += " neg";
        else cls += " zero";
        if (selection && selection.kind === "heatmap" && selection.weekday === wd && selection.hour === h2) {
          cls += " picked";
        }
        var text = cell.count === 0 ? "" : (cell.netPnl === 0 ? "0" : String(Math.round(cell.netPnl)));
        var title = "週" + WEEKDAY_LABELS_SHORT[wd] + " " + h2 + "時 · " +
          (cell.count === 0 ? "沒有交易" : cell.count + " 筆 · 淨損益 " + cell.netPnl);
        out += '<button type="button" class="' + cls + '" data-heat-wd="' + wd + '" data-heat-hour="' + h2 +
          '" title="' + escapeHtml(title) + '">' + text + "</button>";
      }
    }
    out += "</div></div>";
    return out;
  }

  function tradeSortValue(card, col, accounts) {
    switch (col) {
      case "time": return card.dateET + " " + card.timeET;
      case "account": return accountName(card.accountId, accounts);
      case "product": return card.product;
      case "setup": return card.setup;
      case "side": return card.side;
      case "size": return card.size;
      case "grade": return card.grade;
      case "execGrade": return card.execGrade;
      case "pnl": return store.netPnlOf(card);
      default: return "";
    }
  }

  function renderLinkedTradeTable(cards, accounts, sort) {
    if (!cards.length) return '<p class="muted">這個篩選沒有交易報告卡</p>';

    var sorted = sortRows(cards, sort.col, sort.dir, function (c, col) { return tradeSortValue(c, col, accounts); });

    var heads = TRADE_COLUMNS.map(function (colDef) {
      var col = colDef[0];
      var mark = sort.col === col ? (sort.dir === "asc" ? " ↑" : " ↓") : "";
      return '<th class="sortable" data-trade-sort="' + col + '">' + escapeHtml(colDef[1]) + mark + "</th>";
    }).join("");

    var rows = sorted.map(function (c) {
      return (
        '<tr class="clickable' + (c.isDemo ? " demo-row" : "") + '" data-card-id="' + escapeHtml(c.id) + '">' +
        "<td>" + escapeHtml(c.dateET) + " " + escapeHtml(c.timeET) + "</td>" +
        "<td>" + escapeHtml(accountName(c.accountId, accounts)) + "</td>" +
        "<td>" + escapeHtml(c.product) + "</td>" +
        "<td>" + escapeHtml(c.setup) + "</td>" +
        "<td>" + escapeHtml(c.side) + "</td>" +
        "<td>" + c.size + "</td>" +
        "<td>" + escapeHtml(c.grade) + "</td>" +
        "<td>" + escapeHtml(c.execGrade) + "</td>" +
        "<td>" + money(store.netPnlOf(c)) + "</td>" +
        "</tr>"
      );
    }).join("");

    return '<div class="scroll"><table class="grid"><tr>' + heads + "</tr>" + rows + "</table></div>";
  }

  function renderLinkedSection(stats, accounts) {
    var selection = state.secondarySelection;
    var narrowed = narrowCardsBySelection(stats.cards, selection);
    // The view that originated the click stays on the full primary-filtered
    // set; the other two use the narrowed set. With no selection, narrowed
    // === stats.cards, so all three agree anyway.
    var breakdownCards = (selection && selection.kind === "breakdown") ? stats.cards : narrowed;
    var heatmapCards = (selection && selection.kind === "heatmap") ? stats.cards : narrowed;
    var tradeCards = narrowed;

    var startingCapitalOrNull = stats.mode === "single" ? stats.startingCapital : null;
    var breakdownRows = store.getBreakdownForCards(breakdownCards, state.breakdownDimension, startingCapitalOrNull);
    var heatmapGrid = store.getHeatmapForCards(heatmapCards).grid;

    var dimChips = BREAKDOWN_DIMENSIONS.map(function (d) {
      return '<button type="button" class="chip' + (state.breakdownDimension === d[0] ? " on" : "") +
        '" data-breakdown-dim-select="' + d[0] + '">' + escapeHtml(d[1]) + "</button>";
    }).join("");

    var clearBtn = selection
      ? '<button type="button" class="ghost" id="clear-secondary-selection-btn">清除這三件的篩選</button>'
      : "";

    return (
      '<div class="panel">' +
      '<div class="row" style="justify-content:space-between">' +
      "<h2>分解表 · 時段熱力圖 · 交易報告卡</h2>" +
      '<button class="primary" id="new-card-btn">新增交易報告卡</button>' +
      "</div>" +
      '<p class="muted">點分解表列或熱力圖格，另外兩件跟著變；損益月曆不受影響。</p>' +
      '<div class="row">' + dimChips + clearBtn + "</div>" +
      renderBreakdownTable(breakdownRows, state.breakdownDimension, selection, state.breakdownSort) +
      '<p class="muted" style="margin:10px 0 4px">時段熱力圖（美東星期 × 小時）</p>' +
      renderHeatmap(heatmapGrid, selection) +
      '<h3 style="margin-top:16px">交易報告卡</h3>' +
      renderLinkedTradeTable(tradeCards, accounts, state.tradeSort) +
      "</div>"
    );
  }

  // ---- 損益月曆 (P&L calendar) ------------------------------------------
  //
  // Lives on 指揮中心, not a separate tab. One cell per 交易日 (America/New_York
  // calendar date), colored by that day's net P&L sign, with a weekly total
  // per row. Clicking a day only opens 當日日誌 — it does not touch any
  // filter used by the breakdown table / heatmap / trade list (ticket 16).

  function buildMonthGrid(ym, byDate) {
    var year = parseInt(ym.slice(0, 4), 10);
    var month = parseInt(ym.slice(5, 7), 10); // 1-12
    var daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    var firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0=Sun

    var cells = [];
    for (var i = 0; i < firstWeekday; i++) cells.push(null);
    for (var d = 1; d <= daysInMonth; d++) cells.push(ym + "-" + pad2(d));
    while (cells.length % 7 !== 0) cells.push(null);

    var rows = [];
    for (var start = 0; start < cells.length; start += 7) {
      var weekCells = cells.slice(start, start + 7);
      var weekNetPnl = 0;
      var weekCount = 0;
      weekCells.forEach(function (dateET) {
        var rec = dateET && byDate[dateET];
        if (rec) {
          weekNetPnl += rec.netPnl;
          weekCount += rec.count;
        }
      });
      rows.push({ cells: weekCells, weekNetPnl: weekNetPnl, weekCount: weekCount });
    }
    return rows;
  }

  function renderCalendar() {
    var ym = state.calendarMonth;
    var cards = store.getCards();
    var byDate = {};
    cards.forEach(function (c) {
      if (c.dateET.slice(0, 7) !== ym) return;
      var rec = byDate[c.dateET] || { netPnl: 0, count: 0 };
      rec.netPnl += store.netPnlOf(c);
      rec.count += 1;
      byDate[c.dateET] = rec;
    });

    var weeks = buildMonthGrid(ym, byDate);

    var head =
      WEEKDAY_LABELS.map(function (w) { return '<div class="cal-hd">' + w + "</div>"; }).join("") +
      '<div class="cal-hd">週合計</div>';

    var body = weeks
      .map(function (week) {
        var dayCells = week.cells
          .map(function (dateET) {
            if (!dateET) return '<div class="cal-day empty"></div>';
            var rec = byDate[dateET];
            var cls = "cal-day";
            if (rec) cls += rec.netPnl > 0 ? " up" : rec.netPnl < 0 ? " down" : " flat";
            var dayNum = parseInt(dateET.slice(8, 10), 10);
            return (
              '<button type="button" class="' + cls + '" data-date="' + dateET + '">' +
              '<div class="n">' + dayNum + "</div>" +
              (rec ? '<div class="p">' + money(rec.netPnl) + '</div><div class="c">' + rec.count + " 筆</div>" : "") +
              "</button>"
            );
          })
          .join("");
        var weekCell =
          '<div class="cal-week"><div>' + money(week.weekNetPnl) + '</div><div class="muted">' + week.weekCount + " 筆</div></div>";
        return dayCells + weekCell;
      })
      .join("");

    return (
      '<div class="panel">' +
      '<div class="row" style="justify-content:space-between">' +
      "<h2>損益月曆</h2>" +
      '<div class="row">' +
      '<button type="button" class="ghost" id="cal-prev">‹</button>' +
      '<span class="muted">' + escapeHtml(ym) + "</span>" +
      '<button type="button" class="ghost" id="cal-next">›</button>' +
      "</div>" +
      "</div>" +
      '<div class="cal-grid">' + head + body + "</div>" +
      "</div>"
    );
  }

  // ---- 當日日誌 (daily journal) -----------------------------------------
  //
  // One page per 交易日, opened by clicking a 損益月曆 day (including days
  // with zero trades — it must open fully blank, not conditional on having
  // trades). Not split by product. The day's trade cards are auto-listed
  // (no manual selection) in ascending time order; clicking a row opens the
  // same 交易報告卡 view the main list opens (see findCardById / renderCardSheet).

  function renderDayJournal(dateET) {
    var journal = store.getDayJournal(dateET);
    var setups = store.getSetups();
    var accounts = store.getAccounts();
    var cardsOnDate = store.getCardsOnDate(dateET);

    var setupChecks = setups
      .map(function (s) {
        var checked = journal.plannedSetups.indexOf(s) !== -1 ? " checked" : "";
        return (
          '<label class="chk"><input type="checkbox" name="plannedSetups" value="' + escapeHtml(s) + '"' + checked + "> " +
          escapeHtml(s) + "</label>"
        );
      })
      .join("");

    var rows = cardsOnDate
      .map(function (c) {
        return (
          '<tr class="clickable" data-card-id="' + escapeHtml(c.id) + '">' +
          "<td>" + escapeHtml(c.timeET) + "</td>" +
          "<td>" + escapeHtml(accountName(c.accountId, accounts)) + "</td>" +
          "<td>" + escapeHtml(c.product) + "</td>" +
          "<td>" + escapeHtml(c.setup) + "</td>" +
          "<td>" + escapeHtml(c.side) + "</td>" +
          "<td>" + c.size + "</td>" +
          "<td>" + escapeHtml(c.grade) + "</td>" +
          "<td>" + escapeHtml(c.execGrade) + "</td>" +
          "<td>" + money(c.pnl) + "</td>" +
          "<td>" + money(store.netPnlOf(c)) + "</td>" +
          "</tr>"
        );
      })
      .join("");

    var tradeTable = cardsOnDate.length
      ? '<div class="scroll"><table class="grid"><tr>' +
        "<th>美東時間</th><th>帳戶</th><th>商品</th><th>setup</th><th>方向</th><th>口數</th><th>成績</th><th>執行</th><th>平倉損益</th><th>淨損益</th>" +
        "</tr>" + rows + "</table></div>"
      : '<p class="muted">這天沒有交易報告卡</p>';

    return (
      '<div class="overlay" id="day-journal-overlay">' +
      '<div class="sheet">' +
      "<h2>當日日誌 · 美東 " + escapeHtml(dateET) + "</h2>" +
      '<form id="day-journal-form">' +
      '<label class="full">當日背景（有事才寫，可空：斷線／會議／資金異動／生活事件／跳空）' +
      '<input type="text" name="background" maxlength="160" value="' + escapeHtml(journal.background || "") + '"></label>' +
      "<h3>盤前</h3>" +
      '<div class="field-grid">' +
      '<label>風險上限（USD，可空）<input type="number" name="riskCapUsd" step="any" value="' +
      (journal.riskCapUsd === null ? "" : journal.riskCapUsd) + '"></label>' +
      '<label>一句計畫（可空）<input type="text" name="planLine" maxlength="120" value="' + escapeHtml(journal.planLine || "") + '"></label>' +
      "</div>" +
      '<p class="muted" style="margin:8px 0 4px">今天只做哪些 setup 標（可多選，只是計畫，不篩限當天能記的交易）</p>' +
      '<div class="row">' + (setupChecks || '<span class="muted">尚無 setup 標</span>') + "</div>" +
      "<h3>盤後</h3>" +
      '<div class="field-grid">' +
      '<label>做得好的一件（可空）<input type="text" name="didWell" maxlength="120" value="' + escapeHtml(journal.didWell || "") + '"></label>' +
      '<label>明天只改一件（可空）<input type="text" name="changeTomorrow" maxlength="120" value="' + escapeHtml(journal.changeTomorrow || "") + '"></label>' +
      "</div>" +
      '<p class="row" style="margin-top:14px">' +
      '<button type="submit" class="primary">存檔</button>' +
      '<button type="button" class="ghost" id="close-day-journal-btn">關閉</button>' +
      "</p>" +
      "</form>" +
      '<h3 style="margin-top:16px">當天交易報告卡</h3>' +
      tradeTable +
      renderDayMindGameSection(dateET) +
      "</div>" +
      "</div>"
    );
  }

  // 心理遊戲 bound directly to THIS 交易日 (ticket 19) — a separate, appended
  // block. Deliberately not interleaved with the background/盤前/盤後/trade-
  // list markup above (ticket 17 appends its own 經濟事件 block the same
  // way; a later merge combines both as separate sections). Entries bound to
  // a specific trade card, not the day itself, are NOT listed here — they
  // already show up from this same day's trade list -> that card's own
  // detail view, which is where they live (one binding, one place).
  function renderDayMindGameSection(dateET) {
    var entries = store.getMindGameEntriesForDate(dateET);
    return (
      '<div class="mindgame-section">' +
      '<h3 style="margin-top:16px">心理遊戲（綁當天）</h3>' +
      renderMindGameList(entries, { emptyText: "這天還沒有綁當天的心理遊戲（有對應交易的心理遊戲記在那張報告卡上）" }) +
      renderMindGameForm("day", state.mindGameErrorsForDay) +
      "</div>"
    );
  }

  function readDayJournalFormInput(form) {
    var fd = new FormData(form);
    function line(name) {
      var v = fd.get(name);
      return v === null ? undefined : v;
    }
    function num(name) {
      var v = fd.get(name);
      if (v === null || v === "") return undefined;
      return Number(v);
    }
    return {
      background: line("background"),
      riskCapUsd: num("riskCapUsd"),
      plannedSetups: fd.getAll("plannedSetups"),
      planLine: line("planLine"),
      didWell: line("didWell"),
      changeTomorrow: line("changeTomorrow"),
    };
  }

  // ---- new trade report card form ------------------------------------

  function renderForm() {
    var products = store.getProducts();
    var setups = store.getSetups();
    var accounts = store.getAccounts();

    var errorsHtml = state.formErrors.length
      ? '<div class="form-errors"><b>缺必填欄，未存檔：</b><ul>' +
        state.formErrors.map(function (e) { return "<li>" + escapeHtml(e) + "</li>"; }).join("") +
        "</ul></div>"
      : "";

    return (
      '<div class="overlay" id="form-overlay">' +
      '<div class="sheet">' +
      "<h2>新增交易報告卡</h2>" +
      errorsHtml +
      '<form id="card-form">' +
      '<div class="field-grid">' +
      '<label>商品 <span class="req">*</span><select name="product" required>' + optionsHtml(products) + "</select></label>" +
      '<label>setup 標 <span class="req">*</span><select name="setup" required>' + optionsHtml(setups) + "</select></label>" +
      '<label>帳戶 <span class="req">*</span><select name="accountId" required>' +
        accounts.map(function (a) { return '<option value="' + escapeHtml(a.id) + '">' + escapeHtml(a.name) + "</option>"; }).join("") +
        "</select></label>" +
      '<label>方向 <span class="req">*</span><select name="side" required>' + optionsHtml(SIDES) + "</select></label>" +
      '<label>成績 <span class="req">*</span><select name="grade" required>' + optionsHtml(GRADES) + "</select></label>" +
      '<label>執行評等 <span class="req">*</span><select name="execGrade" required>' + optionsHtml(GRADES) + "</select></label>" +
      '<label>口數（口） <span class="req">*</span><input type="number" name="size" min="1" step="1" required></label>' +
      '<label>平倉損益（USD） <span class="req">*</span><input type="number" name="pnl" step="any" required></label>' +
      '<label>美東日期 <span class="req">*</span><input type="date" name="dateET" required></label>' +
      '<label>美東時間 <span class="req">*</span><input type="time" name="timeET" required></label>' +
      '<label>進場價<input type="number" name="entryPrice" step="any"></label>' +
      '<label>出場價<input type="number" name="exitPrice" step="any"></label>' +
      '<label>停損<input type="number" name="stopPrice" step="any"></label>' +
      '<label>計畫風險（USD）<input type="number" name="plannedRisk" step="any"></label>' +
      '<label>手續費（USD，空＝0）<input type="number" name="fee" step="any"></label>' +
      '<label>進場理由<input type="text" name="entryReason" maxlength="120"></label>' +
      '<label>出場理由<input type="text" name="exitReason" maxlength="120"></label>' +
      '<label>教訓<input type="text" name="lesson" maxlength="120"></label>' +
      "</div>" +
      '<p class="row" style="margin-top:14px">' +
      '<button type="submit" class="primary">存檔</button>' +
      '<button type="button" class="ghost" id="cancel-form-btn">取消</button>' +
      "</p>" +
      "</form>" +
      "</div>" +
      "</div>"
    );
  }

  function readFormInput(form) {
    var fd = new FormData(form);
    function num(name) {
      var v = fd.get(name);
      if (v === null || v === "") return undefined;
      return Number(v);
    }
    function int(name) {
      var v = fd.get(name);
      if (v === null || v === "") return undefined;
      return parseInt(v, 10);
    }
    function str(name) {
      var v = fd.get(name);
      return v === null ? undefined : v;
    }
    return {
      product: str("product"),
      setup: str("setup"),
      accountId: str("accountId"),
      side: str("side"),
      grade: str("grade"),
      execGrade: str("execGrade"),
      size: int("size"),
      pnl: num("pnl"),
      dateET: str("dateET"),
      timeET: str("timeET"),
      entryPrice: num("entryPrice"),
      exitPrice: num("exitPrice"),
      stopPrice: num("stopPrice"),
      plannedRisk: num("plannedRisk"),
      fee: num("fee"),
      entryReason: str("entryReason"),
      exitReason: str("exitReason"),
      lesson: str("lesson"),
    };
  }

  // ---- card detail view (open one trade report card, incl. screenshots) --
  //
  // Screenshots render ONLY here — never as thumbnails in the 指揮中心 list
  // above, and never in any per-day list. This is also the only place a
  // screenshot can be attached or removed (a card is created with 0 via the
  // form above; screenshots are a property of an opened card).

  var MAX_SCREENSHOTS = window.TradingJournal.MAX_SCREENSHOTS;

  function renderCardDetail(cardId) {
    var card = store.getCardById(cardId);
    if (!card) return "";

    var accounts = store.getAccounts();
    var screenshots = card.screenshots || [];

    var errorsHtml = state.detailErrors.length
      ? '<div class="form-errors"><b>這張圖存不進去：</b><ul>' +
        state.detailErrors.map(function (e) { return "<li>" + escapeHtml(e) + "</li>"; }).join("") +
        "</ul></div>"
      : "";

    function field(label, value) {
      return '<div class="detail-field"><div class="l">' + escapeHtml(label) + '</div><div class="v">' + value + "</div></div>";
    }

    var fieldsHtml =
      '<div class="detail-grid">' +
      field("商品", escapeHtml(card.product)) +
      field("setup 標", escapeHtml(card.setup)) +
      field("帳戶", escapeHtml(accountName(card.accountId, accounts))) +
      field("方向", escapeHtml(card.side)) +
      field("口數", String(card.size)) +
      field("成績", escapeHtml(card.grade)) +
      field("執行評等", escapeHtml(card.execGrade)) +
      field("美東日期", escapeHtml(card.dateET) + " " + escapeHtml(card.timeET)) +
      field("平倉損益", money(card.pnl)) +
      field("手續費", card.fee === null ? "—" : String(card.fee)) +
      field("淨損益", money(store.netPnlOf(card))) +
      field("進場價", card.entryPrice === null ? "—" : String(card.entryPrice)) +
      field("出場價", card.exitPrice === null ? "—" : String(card.exitPrice)) +
      field("停損", card.stopPrice === null ? "—" : String(card.stopPrice)) +
      field("計畫風險", card.plannedRisk === null ? "—" : String(card.plannedRisk)) +
      field("進場理由", escapeHtml(card.entryReason) || "—") +
      field("出場理由", escapeHtml(card.exitReason) || "—") +
      field("教訓", escapeHtml(card.lesson) || "—") +
      "</div>";

    var shotsHtml = screenshots.length
      ? '<div class="shots">' +
        screenshots
          .map(function (src, i) {
            return (
              '<div class="shot">' +
              '<img src="' + escapeHtml(src) + '" alt="截圖 ' + (i + 1) + '">' +
              (card.isDemo ? "" : '<button type="button" class="shot-remove" data-remove-shot="' + i + '">移除</button>') +
              "</div>"
            );
          })
          .join("") +
        "</div>"
      : '<p class="muted">還沒有貼圖</p>';

    var addHtml = "";
    if (card.isDemo) {
      addHtml = '<p class="muted">示範資料不可貼圖。</p>';
    } else if (screenshots.length >= MAX_SCREENSHOTS) {
      addHtml = '<p class="muted">已經 ' + MAX_SCREENSHOTS + ' 張，這筆貼滿了。</p>';
    } else {
      addHtml =
        '<div class="paste-zone" id="paste-zone" tabindex="0">' +
        "點這裡按 Ctrl+V 貼上截圖，或選擇檔案上傳（還可以貼 " + (MAX_SCREENSHOTS - screenshots.length) + " 張）" +
        '<input type="file" id="shot-file-input" accept="image/*" style="display:block;margin-top:8px">' +
        "</div>";
    }

    // 心理遊戲 bound to THIS card (ticket 19) — a separate section, appended
    // after screenshots. Demo cards are read-only, same as screenshots.
    var mindGameEntries = store.getMindGameEntriesForCard(card.id);
    var mindGameSection =
      '<h3 style="margin-top:16px">心理遊戲</h3>' +
      renderMindGameList(mindGameEntries, { emptyText: "這張報告卡還沒有心理遊戲紀錄" }) +
      (card.isDemo
        ? '<p class="muted">示範資料不可記心理遊戲。</p>'
        : renderMindGameForm("card", state.mindGameErrorsForCard));

    return (
      '<div class="overlay" id="detail-overlay">' +
      '<div class="sheet">' +
      "<h2>交易報告卡" + (card.isDemo ? "（示範）" : "") + "</h2>" +
      errorsHtml +
      fieldsHtml +
      '<h3 style="margin-top:16px">截圖</h3>' +
      shotsHtml +
      addHtml +
      mindGameSection +
      '<p class="row" style="margin-top:14px">' +
      '<button type="button" class="ghost" id="close-detail-btn">關閉</button>' +
      "</p>" +
      "</div>" +
      "</div>"
    );
  }

  // ---- settings (accounts / products / setups) -------------------------

  function renderSettings() {
    var accounts = store.getAccounts();
    var products = store.getProducts();
    var setups = store.getSetups();

    var errorsHtml = state.settingsErrors.length
      ? '<div class="form-errors"><ul>' +
        state.settingsErrors.map(function (e) { return "<li>" + escapeHtml(e) + "</li>"; }).join("") +
        "</ul></div>"
      : "";

    function listSection(opts) {
      var rows = opts.items
        .map(function (item) {
          return (
            '<li class="settings-row">' +
            '<span>' + escapeHtml(opts.label(item)) + "</span>" +
            '<button type="button" class="ghost" data-settings-remove="' + opts.kind + '" data-id="' + escapeHtml(opts.id(item)) + '">刪除</button>' +
            "</li>"
          );
        })
        .join("");

      return (
        '<div class="settings-section">' +
        "<h3>" + escapeHtml(opts.title) + "</h3>" +
        '<ul class="settings-list">' + rows + "</ul>" +
        '<form class="settings-add-form" data-settings-add="' + opts.kind + '">' +
        opts.formFields +
        '<button type="submit" class="primary">新增' + escapeHtml(opts.title) + "</button>" +
        "</form>" +
        "</div>"
      );
    }

    var accountsSection = listSection({
      kind: "account",
      title: "帳戶",
      items: accounts,
      id: function (a) { return a.id; },
      label: function (a) { return a.name + "（初始資金 " + a.startingCapital.toLocaleString("en-US") + " USD）"; },
      formFields:
        '<input type="text" name="name" placeholder="帳戶名稱" required>' +
        '<input type="number" name="startingCapital" placeholder="初始資金（USD，空＝0）" step="any">',
    });

    var productsSection = listSection({
      kind: "product",
      title: "商品",
      items: products,
      id: function (p) { return p; },
      label: function (p) { return p; },
      formFields: '<input type="text" name="name" placeholder="根代號，例如 MYM" required>',
    });

    var setupsSection = listSection({
      kind: "setup",
      title: "setup 標",
      items: setups,
      id: function (s) { return s; },
      label: function (s) { return s; },
      formFields: '<input type="text" name="name" placeholder="setup 標名稱" required>',
    });

    return (
      '<div class="overlay" id="settings-overlay">' +
      '<div class="sheet">' +
      '<div class="row" style="justify-content:space-between">' +
      "<h2>設定</h2>" +
      '<button type="button" class="ghost" id="close-settings-btn">關閉</button>' +
      "</div>" +
      errorsHtml +
      accountsSection +
      productsSection +
      setupsSection +
      "</div>" +
      "</div>"
    );
  }

  function readImageFile(file, onDataUrl) {
    if (!file || !window.FileReader) return;
    var reader = new FileReader();
    reader.onload = function () {
      onDataUrl(String(reader.result));
    };
    reader.readAsDataURL(file);
  }

  // ---- 心理遊戲 (mind game) shared rendering (ticket 19) -----------------
  //
  // One store, three doors: a 交易報告卡's own detail view (bound entries for
  // that card), 當日日誌 (bound entries for that day), and this 心理戰 tab
  // (every entry, browsable). renderMindGameList/-Form are shared by all
  // three so a card-bound and a day-bound entry render identically wherever
  // they show up.

  function renderMindGameList(entries, opts) {
    opts = opts || {};
    if (!entries.length) {
      return '<p class="muted">' + escapeHtml(opts.emptyText || "還沒有心理遊戲紀錄") + "</p>";
    }
    var rows = entries
      .map(function (e) {
        var binding = "";
        var attrs = "";
        if (opts.showBinding) {
          if (e.cardId) {
            var card = store.getCardById(e.cardId);
            binding = card
              ? escapeHtml(card.dateET) + " " + escapeHtml(card.timeET) + " · " + escapeHtml(card.product) + "（報告卡）"
              : "（報告卡已不存在）";
            attrs = ' data-card-id="' + escapeHtml(e.cardId) + '"';
          } else {
            binding = escapeHtml(e.dateET) + "（當天）";
            attrs = ' data-open-day-date="' + escapeHtml(e.dateET) + '"';
          }
        }
        return (
          '<li class="mindgame-item' + (opts.showBinding ? " clickable" : "") + '"' + attrs + ">" +
          '<div class="mindgame-head">' +
          '<span class="mindgame-type">' + escapeHtml(e.type) + "</span>" +
          '<span class="mindgame-intensity">強度 ' + e.intensity + "/10</span>" +
          (binding ? '<span class="mindgame-binding">' + binding + "</span>" : "") +
          "</div>" +
          (e.note ? '<div class="mindgame-note">' + escapeHtml(e.note) + "</div>" : "") +
          "</li>"
        );
      })
      .join("");
    return '<ul class="mindgame-list">' + rows + "</ul>";
  }

  // kind: "card" | "day" — decides which state error-list this form reports
  // into and which binding wire() attaches on submit (state.openCardId or
  // state.openDayJournalDate — read at submit time, not carried as a hidden
  // field, since the surrounding overlay already fixes that context).
  function renderMindGameForm(kind, errors) {
    var errorsHtml = errors && errors.length
      ? '<div class="form-errors"><ul>' + errors.map(function (e) { return "<li>" + escapeHtml(e) + "</li>"; }).join("") + "</ul></div>"
      : "";
    return (
      errorsHtml +
      '<form class="mindgame-form" data-mindgame-form="' + kind + '">' +
      '<div class="field-grid">' +
      '<label>類型 <span class="req">*</span><select name="type" required>' + optionsHtml(MIND_GAME_TYPES) + "</select></label>" +
      '<label>強度（1–10） <span class="req">*</span><input type="number" name="intensity" min="1" max="10" step="1" value="5" required></label>' +
      '<label class="full">一句說明（選「其他」時必填）<input type="text" name="note" maxlength="120"></label>' +
      "</div>" +
      '<p class="row" style="margin-top:8px"><button type="submit" class="primary">新增心理遊戲</button></p>' +
      "</form>"
    );
  }

  function readMindGameFormInput(form) {
    var fd = new FormData(form);
    var intensityRaw = fd.get("intensity");
    return {
      type: fd.get("type"),
      intensity: intensityRaw === null || intensityRaw === "" ? undefined : parseInt(intensityRaw, 10),
      note: fd.get("note"),
    };
  }

  // ---- 心理戰 tab: browse ALL 心理遊戲 entries (card- and day-bound) -------
  //
  // The previously-stub tab from ticket 13. Every entry is reachable from
  // here — clicking a card-bound row opens that card's detail (same overlay
  // the 指揮中心 list and 當日日誌 open), clicking a day-bound row opens that
  // day's 當日日誌. This tab does not itself write entries — writing happens
  // where the context (which card, which day) is already established.

  function renderPsych() {
    var entries = store.getAllMindGameEntries();
    var body = entries.length
      ? renderMindGameList(entries, { showBinding: true })
      : '<p class="muted">還沒有任何心理遊戲紀錄。情緒劫持決策時，從交易報告卡或當日日誌記下第一則。</p>';

    return (
      '<div class="panel">' +
      "<h2>心理戰</h2>" +
      '<p class="muted">只在情緒劫持決策時才記，不是每日心情日記。點一列走進那張報告卡或那天的當日日誌。</p>' +
      body +
      "</div>"
    );
  }

  // ---- shell -----------------------------------------------------

  function render() {
    var topbar =
      '<div class="topbar">' +
      '<span class="brand">交易日誌</span>' +
      '<nav class="tabs">' +
      '<button class="' + (state.tab === "cmd" ? "on" : "") + '" data-tab="cmd">指揮中心</button>' +
      '<button class="' + (state.tab === "psych" ? "on" : "") + '" data-tab="psych">心理戰</button>' +
      "</nav>" +
      '<button class="ghost topbar-right" id="open-settings-btn">設定</button>' +
      "</div>";

    var body = state.tab === "cmd" ? renderCommandCenter() : renderPsych();

    // Four mutually-exclusive overlays: 交易報告卡 detail (openCardId), 當日
    // 日誌 (openDayJournalDate), the new-card form (formOpen), and settings
    // (settingsOpen). Opening any one is expected to close the other three —
    // wire() below enforces that on every entry point. The one deliberate
    // exception: clicking a trade row from inside 當日日誌 opens the card
    // detail on top of it (openCardId gets set without clearing
    // openDayJournalDate), so closing the card detail returns to the day
    // journal instead of losing your place.
    var overlay = "";
    if (state.openCardId) {
      overlay = renderCardDetail(state.openCardId);
    } else if (state.openDayJournalDate) {
      overlay = renderDayJournal(state.openDayJournalDate);
    } else if (state.formOpen) {
      overlay = renderForm();
    } else if (state.settingsOpen) {
      overlay = renderSettings();
    }

    app.innerHTML = topbar + '<div class="col">' + body + "</div>" + overlay;
    wire();
  }

  function wire() {
    var tabBtns = app.querySelectorAll("[data-tab]");
    for (var i = 0; i < tabBtns.length; i++) {
      tabBtns[i].addEventListener("click", function (e) {
        state.tab = e.currentTarget.getAttribute("data-tab");
        state.formOpen = false;
        state.openCardId = null;
        state.settingsOpen = false;
        state.openDayJournalDate = null;
        state.mindGameErrorsForCard = [];
        state.mindGameErrorsForDay = [];
        render();
      });
    }

    var newBtn = document.getElementById("new-card-btn");
    if (newBtn) {
      newBtn.addEventListener("click", function () {
        state.formOpen = true;
        state.formErrors = [];
        state.openCardId = null;
        state.settingsOpen = false;
        state.openDayJournalDate = null;
        render();
      });
    }

    // Broad selector on purpose: every trade-card list (main 指揮中心 table,
    // and 當日日誌's day list) marks its rows with data-card-id, and they all
    // open the same 交易報告卡 detail view below — one click-handler for
    // every card row, no matter which list/overlay it's rendered inside.
    var cardRows = app.querySelectorAll("[data-card-id]");
    for (var r = 0; r < cardRows.length; r++) {
      cardRows[r].addEventListener("click", function (e) {
        // Deliberately does not touch openDayJournalDate: clicking a row
        // from inside 當日日誌 opens the card detail on top of it, so
        // closing the detail lands back on the day journal.
        state.openCardId = e.currentTarget.getAttribute("data-card-id");
        state.detailErrors = [];
        state.mindGameErrorsForCard = [];
        state.formOpen = false;
        state.settingsOpen = false;
        render();
      });
    }

    var closeDetailBtn = document.getElementById("close-detail-btn");
    if (closeDetailBtn) {
      closeDetailBtn.addEventListener("click", function () {
        state.openCardId = null;
        state.detailErrors = [];
        state.mindGameErrorsForCard = [];
        render();
      });
    }

    function attachScreenshot(cardId, dataUrl) {
      var result = store.addScreenshot(cardId, dataUrl);
      if (!result.ok) {
        state.detailErrors = result.errors;
      } else {
        state.detailErrors = [];
      }
      render();
    }

    var shotFileInput = document.getElementById("shot-file-input");
    if (shotFileInput) {
      shotFileInput.addEventListener("change", function (e) {
        var file = e.target.files && e.target.files[0];
        var cardId = state.openCardId;
        readImageFile(file, function (dataUrl) {
          attachScreenshot(cardId, dataUrl);
        });
      });
    }

    var pasteZone = document.getElementById("paste-zone");
    if (pasteZone) {
      pasteZone.addEventListener("paste", function (e) {
        var items = (e.clipboardData && e.clipboardData.items) || [];
        var cardId = state.openCardId;
        for (var i = 0; i < items.length; i++) {
          if (items[i].type && items[i].type.indexOf("image/") === 0) {
            var file = items[i].getAsFile();
            if (file) {
              e.preventDefault();
              readImageFile(file, function (dataUrl) {
                attachScreenshot(cardId, dataUrl);
              });
            }
            break;
          }
        }
      });
    }

    var removeShotBtns = app.querySelectorAll("[data-remove-shot]");
    for (var s = 0; s < removeShotBtns.length; s++) {
      removeShotBtns[s].addEventListener("click", function (e) {
        var index = parseInt(e.currentTarget.getAttribute("data-remove-shot"), 10);
        var result = store.removeScreenshot(state.openCardId, index);
        if (!result.ok) {
          state.detailErrors = result.errors;
        } else {
          state.detailErrors = [];
        }
        render();
      });
    }

    var cancelBtn = document.getElementById("cancel-form-btn");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", function () {
        state.formOpen = false;
        render();
      });
    }

    var form = document.getElementById("card-form");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var input = readFormInput(form);
        var result = store.addCard(input);
        if (!result.ok) {
          state.formErrors = result.errors;
          render();
          return;
        }
        state.formOpen = false;
        state.formErrors = [];
        render();
      });
    }

    // ---- filter bar (指揮中心) ------------------------------------

    var filterAccount = document.getElementById("filter-account");
    if (filterAccount) {
      filterAccount.addEventListener("change", function (e) {
        state.filters.accountId = e.currentTarget.value;
        state.secondarySelection = null; // primary filter changed: ticket 16's linked selection resets
        render();
      });
    }
    var filterProduct = document.getElementById("filter-product");
    if (filterProduct) {
      filterProduct.addEventListener("change", function (e) {
        state.filters.product = e.currentTarget.value;
        state.secondarySelection = null;
        render();
      });
    }
    var filterSetup = document.getElementById("filter-setup");
    if (filterSetup) {
      filterSetup.addEventListener("change", function (e) {
        state.filters.setup = e.currentTarget.value;
        state.secondarySelection = null;
        render();
      });
    }
    var filterFrom = document.getElementById("filter-from");
    if (filterFrom) {
      filterFrom.addEventListener("change", function (e) {
        state.filters.dateFrom = e.currentTarget.value || null;
        state.secondarySelection = null;
        render();
      });
    }
    var filterTo = document.getElementById("filter-to");
    if (filterTo) {
      filterTo.addEventListener("change", function (e) {
        state.filters.dateTo = e.currentTarget.value || null;
        state.secondarySelection = null;
        render();
      });
    }
    var filterClearBtn = document.getElementById("filter-clear-btn");
    if (filterClearBtn) {
      filterClearBtn.addEventListener("click", function () {
        state.filters = store.createDefaultFilters();
        state.secondarySelection = null;
        render();
      });
    }

    // ---- 分解表 · 時段熱力圖 · 交易報告卡清單聯動 (ticket 16) -----------------

    var dimBtns = app.querySelectorAll("[data-breakdown-dim-select]");
    for (var db = 0; db < dimBtns.length; db++) {
      dimBtns[db].addEventListener("click", function (e) {
        state.breakdownDimension = e.currentTarget.getAttribute("data-breakdown-dim-select");
        render();
      });
    }

    var breakdownSortHeads = app.querySelectorAll("[data-breakdown-sort]");
    for (var bs = 0; bs < breakdownSortHeads.length; bs++) {
      breakdownSortHeads[bs].addEventListener("click", function (e) {
        var col = e.currentTarget.getAttribute("data-breakdown-sort");
        if (state.breakdownSort.col === col) {
          state.breakdownSort.dir = state.breakdownSort.dir === "asc" ? "desc" : "asc";
        } else {
          state.breakdownSort.col = col;
          state.breakdownSort.dir = col === "title" ? "asc" : "desc";
        }
        render();
      });
    }

    // Rows for dimensions other than "全部" toggle the shared linked
    // selection on/off; clicking the single "全部" row instead clears it
    // (mirrors clicking the dedicated clear button).
    var breakdownRowEls = app.querySelectorAll("[data-breakdown-dim][data-breakdown-key]");
    for (var br = 0; br < breakdownRowEls.length; br++) {
      breakdownRowEls[br].addEventListener("click", function (e) {
        var dimension = e.currentTarget.getAttribute("data-breakdown-dim");
        var key = e.currentTarget.getAttribute("data-breakdown-key");
        var cur = state.secondarySelection;
        if (cur && cur.kind === "breakdown" && cur.dimension === dimension && cur.key === key) {
          state.secondarySelection = null;
        } else {
          state.secondarySelection = { kind: "breakdown", dimension: dimension, key: key };
        }
        render();
      });
    }

    var breakdownClearRows = app.querySelectorAll("[data-breakdown-clear]");
    for (var bc = 0; bc < breakdownClearRows.length; bc++) {
      breakdownClearRows[bc].addEventListener("click", function () {
        state.secondarySelection = null;
        render();
      });
    }

    var heatCells = app.querySelectorAll("[data-heat-wd]");
    for (var hc = 0; hc < heatCells.length; hc++) {
      heatCells[hc].addEventListener("click", function (e) {
        var wd = parseInt(e.currentTarget.getAttribute("data-heat-wd"), 10);
        var hour = parseInt(e.currentTarget.getAttribute("data-heat-hour"), 10);
        var cur = state.secondarySelection;
        if (cur && cur.kind === "heatmap" && cur.weekday === wd && cur.hour === hour) {
          state.secondarySelection = null;
        } else {
          state.secondarySelection = { kind: "heatmap", weekday: wd, hour: hour };
        }
        render();
      });
    }

    var clearSecondaryBtn = document.getElementById("clear-secondary-selection-btn");
    if (clearSecondaryBtn) {
      clearSecondaryBtn.addEventListener("click", function () {
        state.secondarySelection = null;
        render();
      });
    }

    var tradeSortHeads = app.querySelectorAll("[data-trade-sort]");
    for (var ts = 0; ts < tradeSortHeads.length; ts++) {
      tradeSortHeads[ts].addEventListener("click", function (e) {
        var col = e.currentTarget.getAttribute("data-trade-sort");
        if (state.tradeSort.col === col) {
          state.tradeSort.dir = state.tradeSort.dir === "asc" ? "desc" : "asc";
        } else {
          state.tradeSort.col = col;
          state.tradeSort.dir = "desc";
        }
        render();
      });
    }

    // ---- 損益月曆 -------------------------------------------------------

    var calPrev = document.getElementById("cal-prev");
    if (calPrev) {
      calPrev.addEventListener("click", function () {
        state.calendarMonth = shiftMonth(state.calendarMonth, -1);
        render();
      });
    }
    var calNext = document.getElementById("cal-next");
    if (calNext) {
      calNext.addEventListener("click", function () {
        state.calendarMonth = shiftMonth(state.calendarMonth, 1);
        render();
      });
    }
    var calDays = app.querySelectorAll(".cal-day[data-date]");
    for (var d = 0; d < calDays.length; d++) {
      calDays[d].addEventListener("click", function (e) {
        // Opens 當日日誌 only — does not touch any breakdown/heatmap/trade-list
        // filter. Folds in as the fourth mutually-exclusive overlay: closes
        // form/settings/card-detail, same as any other "open an overlay" entry.
        state.openDayJournalDate = e.currentTarget.getAttribute("data-date");
        state.openCardId = null;
        state.formOpen = false;
        state.settingsOpen = false;
        state.mindGameErrorsForDay = [];
        render();
      });
    }

    // Same "open 當日日誌" behavior as a 損益月曆 day cell, but triggered from
    // a day-bound 心理遊戲 row on the 心理戰 tab (ticket 19) — one of the
    // three doors into that data.
    var openDayDateEls = app.querySelectorAll("[data-open-day-date]");
    for (var od = 0; od < openDayDateEls.length; od++) {
      openDayDateEls[od].addEventListener("click", function (e) {
        state.openDayJournalDate = e.currentTarget.getAttribute("data-open-day-date");
        state.openCardId = null;
        state.formOpen = false;
        state.settingsOpen = false;
        state.mindGameErrorsForDay = [];
        render();
      });
    }

    // ---- 權益線 hover + click (ticket 20) ------------------------------
    //
    // Hover is pure DOM (no state write, no render()) so it stays smooth
    // while the mouse moves. Click is the only thing that touches `state`,
    // and it only ever sets openDayJournalDate — exactly the same field and
    // same four-overlay-exclusion dance the 損益月曆 day cells above use, so
    // this reuses that one day-journal-opening mechanism rather than
    // inventing a second one. It never touches state.filters, and never
    // touches whatever selection state ticket 16's breakdown table / heatmap
    // / trade list introduces.
    var eqWrap = app.querySelector(".equity-curve-wrap");
    var eqTooltip = document.getElementById("equity-tooltip");
    var eqPoints = app.querySelectorAll(".eq-point");
    for (var eq = 0; eq < eqPoints.length; eq++) {
      (function (circle) {
        function showTooltip(e) {
          if (!eqTooltip || !eqWrap) return;
          var rect = eqWrap.getBoundingClientRect();
          var dateET = circle.getAttribute("data-date");
          var equity = Number(circle.getAttribute("data-equity"));
          var dayNetPnl = Number(circle.getAttribute("data-day-net-pnl"));
          var dayCount = circle.getAttribute("data-day-count");
          eqTooltip.innerHTML =
            '<div class="d">' + escapeHtml(dateET) + "</div>" +
            "<div>權益 " + money(equity) + "</div>" +
            "<div>當日損益 " + money(dayNetPnl) + "</div>" +
            "<div>筆數 " + escapeHtml(dayCount) + "</div>";
          eqTooltip.hidden = false;
          eqTooltip.style.left = (e.clientX - rect.left + 12) + "px";
          eqTooltip.style.top = (e.clientY - rect.top - 12) + "px";
        }
        circle.addEventListener("mouseenter", showTooltip);
        circle.addEventListener("mousemove", showTooltip);
        circle.addEventListener("mouseleave", function () {
          if (eqTooltip) eqTooltip.hidden = true;
        });
        circle.addEventListener("click", function () {
          state.openDayJournalDate = circle.getAttribute("data-date");
          state.openCardId = null;
          state.formOpen = false;
          state.settingsOpen = false;
          render();
        });
      })(eqPoints[eq]);
    }

    // ---- settings overlay --------------------------------------------

    var openSettingsBtn = document.getElementById("open-settings-btn");
    if (openSettingsBtn) {
      openSettingsBtn.addEventListener("click", function () {
        state.settingsOpen = true;
        state.settingsErrors = [];
        state.formOpen = false;
        state.openCardId = null;
        state.openDayJournalDate = null;
        state.mindGameErrorsForCard = [];
        state.mindGameErrorsForDay = [];
        render();
      });
    }

    var closeSettingsBtn = document.getElementById("close-settings-btn");
    if (closeSettingsBtn) {
      closeSettingsBtn.addEventListener("click", function () {
        state.settingsOpen = false;
        render();
      });
    }

    var removeBtns = app.querySelectorAll("[data-settings-remove]");
    for (var r = 0; r < removeBtns.length; r++) {
      removeBtns[r].addEventListener("click", function (e) {
        var kind = e.currentTarget.getAttribute("data-settings-remove");
        var id = e.currentTarget.getAttribute("data-id");
        var result;
        if (kind === "account") result = store.removeAccount(id);
        else if (kind === "product") result = store.removeProduct(id);
        else result = store.removeSetup(id);

        if (!result.ok) {
          state.settingsErrors = result.errors;
          render();
          return;
        }
        state.settingsErrors = [];
        // Don't leave the filter bar pointed at something that no longer exists.
        if (kind === "account" && state.filters.accountId === id) state.filters.accountId = "all";
        if (kind === "product" && state.filters.product === id) state.filters.product = "all";
        if (kind === "setup" && state.filters.setup === id) state.filters.setup = "all";
        render();
      });
    }

    var addForms = app.querySelectorAll("[data-settings-add]");
    for (var a = 0; a < addForms.length; a++) {
      addForms[a].addEventListener("submit", function (e) {
        e.preventDefault();
        var kind = e.currentTarget.getAttribute("data-settings-add");
        var fd = new FormData(e.currentTarget);
        var result;
        if (kind === "account") {
          var startingCapital = fd.get("startingCapital");
          result = store.addAccount({
            name: fd.get("name"),
            startingCapital: startingCapital === "" ? undefined : Number(startingCapital),
          });
        } else if (kind === "product") {
          result = store.addProduct(fd.get("name"));
        } else {
          result = store.addSetup(fd.get("name"));
        }

        if (!result.ok) {
          state.settingsErrors = result.errors;
          render();
          return;
        }
        state.settingsErrors = [];
        render();
      });
    }

    // ---- 當日日誌 -------------------------------------------------------

    var closeDayJournalBtn = document.getElementById("close-day-journal-btn");
    if (closeDayJournalBtn) {
      closeDayJournalBtn.addEventListener("click", function () {
        state.openDayJournalDate = null;
        state.mindGameErrorsForDay = [];
        render();
      });
    }
    var dayJournalForm = document.getElementById("day-journal-form");
    if (dayJournalForm) {
      dayJournalForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var input = readDayJournalFormInput(dayJournalForm);
        store.setDayJournal(state.openDayJournalDate, input);
        render();
      });
    }

    // ---- 心理遊戲 add-forms (ticket 19) — shared by card detail & 當日日誌 --
    //
    // kind "card" binds to state.openCardId (the card detail this form is
    // rendered inside of); kind "day" binds to state.openDayJournalDate.
    // Both overlays are mutually exclusive with each other's context, so the
    // currently-open id/date is always the right binding to attach.
    var mindGameForms = app.querySelectorAll("[data-mindgame-form]");
    for (var mg = 0; mg < mindGameForms.length; mg++) {
      mindGameForms[mg].addEventListener("submit", function (e) {
        e.preventDefault();
        var kind = e.currentTarget.getAttribute("data-mindgame-form");
        var input = readMindGameFormInput(e.currentTarget);
        if (kind === "card") input.cardId = state.openCardId;
        else input.dateET = state.openDayJournalDate;

        var result = store.addMindGameEntry(input);
        if (kind === "card") {
          state.mindGameErrorsForCard = result.ok ? [] : result.errors;
        } else {
          state.mindGameErrorsForDay = result.ok ? [] : result.errors;
        }
        render();
      });
    }
  }

  render();
})();

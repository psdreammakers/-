/*
 * 交易日誌 — UI layer. Talks to the journal data store (js/store.js) only
 * through its public API; keeps no trading logic of its own.
 */
(function () {
  "use strict";

  var store = window.TradingJournal.createDefaultStore();
  var GRADES = window.TradingJournal.GRADES;
  var SIDES = window.TradingJournal.SIDES;

  var state = {
    tab: "cmd", // "cmd" | "psych"
    formOpen: false,
    formErrors: [],
    calendarMonth: currentMonthET(), // "YYYY-MM", 損益月曆 shown on 指揮中心
    openDayJournalDate: null, // "YYYY-MM-DD" | null — 當日日誌 overlay
    openCardId: null, // string | null — reusable 交易報告卡 viewer (also used from 當日日誌)
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

  // Reusable "open report card by id" lookup — the one place any trade-card
  // list/table (main command center list, 當日日誌's day list, …) resolves a
  // clicked row's id to the card it should show in the report-card view.
  function findCardById(id) {
    var cards = store.getCards();
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].id === id) return cards[i];
    }
    return null;
  }

  function optionsHtml(values, selected) {
    return values
      .map(function (v) {
        return '<option value="' + escapeHtml(v) + '"' + (v === selected ? " selected" : "") + ">" + escapeHtml(v) + "</option>";
      })
      .join("");
  }

  // ---- command center -----------------------------------------------

  function renderCommandCenter() {
    var accounts = store.getAccounts();
    var cards = store.getCards();
    var summary = store.getSummary();
    var demo = store.isDemoActive();

    var sorted = cards.slice().sort(function (a, b) {
      var ak = a.dateET + " " + a.timeET;
      var bk = b.dateET + " " + b.timeET;
      return bk.localeCompare(ak);
    });

    var banner = demo
      ? '<div class="demo-banner">示範資料 — 這些是出廠範例交易，尚未有你自己的真實紀錄。存下第一筆真的交易報告卡後會自動消失。</div>'
      : "";

    var heroes =
      '<div class="heroes">' +
      '<div class="hero"><div class="l">累積損益</div><div class="v">' + money(summary.netPnl) + "</div></div>" +
      '<div class="hero"><div class="l">筆數</div><div class="v">' + summary.count + "</div></div>" +
      "</div>";

    var rows = sorted
      .map(function (c) {
        return (
          '<tr class="clickable' + (c.isDemo ? " demo-row" : "") + '" data-card-id="' + escapeHtml(c.id) + '">' +
          "<td>" + escapeHtml(c.dateET) + " " + escapeHtml(c.timeET) + "</td>" +
          "<td>" + escapeHtml(c.product) + "</td>" +
          "<td>" + escapeHtml(c.setup) + "</td>" +
          "<td>" + escapeHtml(accountName(c.accountId, accounts)) + "</td>" +
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

    var table = sorted.length
      ? '<div class="scroll"><table class="grid"><tr>' +
        "<th>美東時間</th><th>商品</th><th>setup</th><th>帳戶</th><th>方向</th><th>口數</th><th>成績</th><th>執行</th><th>平倉損益</th><th>淨損益</th>" +
        "</tr>" + rows + "</table></div>"
      : '<p class="muted">還沒有交易報告卡</p>';

    return (
      banner +
      heroes +
      renderCalendar() +
      '<div class="panel">' +
      '<div class="row" style="justify-content:space-between">' +
      "<h2>交易報告卡</h2>" +
      '<button class="primary" id="new-card-btn">新增交易報告卡</button>' +
      "</div>" +
      table +
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
      "</div>" +
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

  // ---- 交易報告卡 view (reusable) ----------------------------------------
  //
  // The one "open report card by id" view. Both the main command-center
  // list and 當日日誌's day list open this same sheet — no second viewer.
  // Deliberately read-only fields, no screenshots here (ticket 18's concern;
  // this ticket does not wire anything that would render them).

  function renderCardSheet(card, accounts) {
    if (!card) {
      return (
        '<div class="overlay" id="card-overlay"><div class="sheet">' +
        '<p class="muted">找不到這筆交易報告卡</p>' +
        '<p class="row"><button class="ghost" id="close-card-btn">關閉</button></p>' +
        "</div></div>"
      );
    }

    var rows = [
      ["美東時間", escapeHtml(card.dateET + " " + card.timeET)],
      ["帳戶", escapeHtml(accountName(card.accountId, accounts))],
      ["商品", escapeHtml(card.product)],
      ["setup 標", escapeHtml(card.setup)],
      ["方向", escapeHtml(card.side)],
      ["口數", card.size],
      ["成績", escapeHtml(card.grade)],
      ["執行評等", escapeHtml(card.execGrade)],
      ["平倉損益", money(card.pnl)],
      ["淨損益", money(store.netPnlOf(card))],
      ["進場價", card.entryPrice === null ? "—" : card.entryPrice],
      ["出場價", card.exitPrice === null ? "—" : card.exitPrice],
      ["停損", card.stopPrice === null ? "—" : card.stopPrice],
      ["計畫風險", card.plannedRisk === null ? "—" : money(card.plannedRisk)],
      ["手續費（空＝0）", card.fee === null ? "—" : money(card.fee)],
      ["進場理由", card.entryReason ? escapeHtml(card.entryReason) : "—"],
      ["出場理由", card.exitReason ? escapeHtml(card.exitReason) : "—"],
      ["教訓", card.lesson ? escapeHtml(card.lesson) : "—"],
    ];

    var dl =
      '<dl class="fields">' +
      rows.map(function (r) { return "<div><dt>" + r[0] + "</dt><dd>" + r[1] + "</dd></div>"; }).join("") +
      "</dl>";

    return (
      '<div class="overlay" id="card-overlay">' +
      '<div class="sheet">' +
      "<h2>交易報告卡" + (card.isDemo ? '　<span class="muted">（示範）</span>' : "") + "</h2>" +
      dl +
      '<p class="row" style="margin-top:12px"><button class="ghost" id="close-card-btn">關閉</button></p>' +
      "</div>" +
      "</div>"
    );
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

  // ---- psychology stub -------------------------------------------------

  function renderPsych() {
    return (
      '<div class="panel">' +
      "<h2>心理戰</h2>" +
      '<p class="muted">心理戰本還在建置中，之後可以在這裡記錄劫持決策的心理遊戲。</p>' +
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
      "</div>";

    var body = state.tab === "cmd" ? renderCommandCenter() : renderPsych();

    // Precedence when more than one overlay could apply: a report card
    // opened from within 當日日誌 shows on top of it; 當日日誌 shows on top
    // of the new-card form. Only one overlay is ever visible at a time.
    var overlay = "";
    if (state.openCardId) {
      overlay = renderCardSheet(findCardById(state.openCardId), store.getAccounts());
    } else if (state.openDayJournalDate) {
      overlay = renderDayJournal(state.openDayJournalDate);
    } else if (state.formOpen) {
      overlay = renderForm();
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
        render();
      });
    }

    var newBtn = document.getElementById("new-card-btn");
    if (newBtn) {
      newBtn.addEventListener("click", function () {
        state.formOpen = true;
        state.formErrors = [];
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
        // Opens 當日日誌 only — does not touch any breakdown/heatmap/trade-list filter.
        state.openDayJournalDate = e.currentTarget.getAttribute("data-date");
        render();
      });
    }

    // ---- reusable "open report card by id" — wired on every trade row ----

    var cardRows = app.querySelectorAll("[data-card-id]");
    for (var r = 0; r < cardRows.length; r++) {
      cardRows[r].addEventListener("click", function (e) {
        state.openCardId = e.currentTarget.getAttribute("data-card-id");
        render();
      });
    }
    var closeCardBtn = document.getElementById("close-card-btn");
    if (closeCardBtn) {
      closeCardBtn.addEventListener("click", function () {
        state.openCardId = null;
        render();
      });
    }

    // ---- 當日日誌 -------------------------------------------------------

    var closeDayJournalBtn = document.getElementById("close-day-journal-btn");
    if (closeDayJournalBtn) {
      closeDayJournalBtn.addEventListener("click", function () {
        state.openDayJournalDate = null;
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
  }

  render();
})();

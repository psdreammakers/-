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
    openCardId: null, // set when a trade report card's detail view is open
    detailErrors: [],
    filters: store.createDefaultFilters(),
    settingsOpen: false,
    settingsErrors: [],
  };

  var app = document.getElementById("app");

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

    return (
      '<svg viewBox="0 0 ' + W + " " + H + '" class="equity-curve" preserveAspectRatio="none">' +
      '<polyline points="' + coords + '" fill="none" stroke="' + lastColor + '" stroke-width="2"></polyline>' +
      "</svg>"
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

    var sorted = stats.cards.slice().sort(function (a, b) {
      var ak = a.dateET + " " + a.timeET;
      var bk = b.dateET + " " + b.timeET;
      return bk.localeCompare(ak);
    });

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
      : '<p class="muted">這個篩選沒有交易報告卡</p>';

    return (
      banner +
      renderFilterBar() +
      '<div class="heroes">' + heroes + "</div>" +
      equityPanel +
      '<div class="panel">' +
      '<div class="row" style="justify-content:space-between">' +
      "<h2>交易報告卡</h2>" +
      '<button class="primary" id="new-card-btn">新增交易報告卡</button>' +
      "</div>" +
      table +
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

    return (
      '<div class="overlay" id="detail-overlay">' +
      '<div class="sheet">' +
      "<h2>交易報告卡" + (card.isDemo ? "（示範）" : "") + "</h2>" +
      errorsHtml +
      fieldsHtml +
      '<h3 style="margin-top:16px">截圖</h3>' +
      shotsHtml +
      addHtml +
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
      '<button class="ghost topbar-right" id="open-settings-btn">設定</button>' +
      "</div>";

    var body = state.tab === "cmd" ? renderCommandCenter() : renderPsych();
    var formOverlay = state.formOpen ? renderForm() : "";
    var detailOverlay = state.openCardId ? renderCardDetail(state.openCardId) : "";
    var settingsOverlay = state.settingsOpen ? renderSettings() : "";

    app.innerHTML = topbar + '<div class="col">' + body + "</div>" + formOverlay + detailOverlay + settingsOverlay;
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
        render();
      });
    }

    var cardRows = app.querySelectorAll("tr[data-card-id]");
    for (var r = 0; r < cardRows.length; r++) {
      cardRows[r].addEventListener("click", function (e) {
        state.openCardId = e.currentTarget.getAttribute("data-card-id");
        state.detailErrors = [];
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
        render();
      });
    }
    var filterProduct = document.getElementById("filter-product");
    if (filterProduct) {
      filterProduct.addEventListener("change", function (e) {
        state.filters.product = e.currentTarget.value;
        render();
      });
    }
    var filterSetup = document.getElementById("filter-setup");
    if (filterSetup) {
      filterSetup.addEventListener("change", function (e) {
        state.filters.setup = e.currentTarget.value;
        render();
      });
    }
    var filterFrom = document.getElementById("filter-from");
    if (filterFrom) {
      filterFrom.addEventListener("change", function (e) {
        state.filters.dateFrom = e.currentTarget.value || null;
        render();
      });
    }
    var filterTo = document.getElementById("filter-to");
    if (filterTo) {
      filterTo.addEventListener("change", function (e) {
        state.filters.dateTo = e.currentTarget.value || null;
        render();
      });
    }
    var filterClearBtn = document.getElementById("filter-clear-btn");
    if (filterClearBtn) {
      filterClearBtn.addEventListener("click", function () {
        state.filters = store.createDefaultFilters();
        render();
      });
    }

    // ---- settings overlay --------------------------------------------

    var openSettingsBtn = document.getElementById("open-settings-btn");
    if (openSettingsBtn) {
      openSettingsBtn.addEventListener("click", function () {
        state.settingsOpen = true;
        state.settingsErrors = [];
        state.formOpen = false;
        state.openCardId = null;
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
  }

  render();
})();

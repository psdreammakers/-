/*
 * 交易日誌 — broker CSV import/export (手動上傳/下載成券商在用的檔案).
 *
 * Supports two shapes users actually asked for:
 *   - "ib":         Interactive Brokers' Activity Statement CSV, "Trades"
 *                    section (execution-level rows, tagged
 *                    Trades,Header,... / Trades,Data,...).
 *   - "ninjatrader": NinjaTrader's Trade Performance grid export /
 *                    Tradovate's Trades export (already one row per closed
 *                    round-trip trade).
 *
 * Neither format was confirmed against a real exported file from this
 * user's own broker — this is built from the well-documented public shape
 * of each platform's export. parse() is header-name-driven (not
 * fixed-column-position) and reports exactly which headers it found when it
 * can't make sense of a file, so a real mismatch is easy to diagnose and
 * fix rather than failing silently.
 *
 * IB's Trades section is EXECUTION-level, not trade-level: closing a
 * position produces its own row with the realized P&L; opening it produces
 * a separate row with realized P&L = 0. Only rows with a nonzero realized
 * P&L are actual closed trades — opening legs are silently skipped (not an
 * error). For that closing row, Quantity's sign is the CLOSING action, which
 * is the opposite of the position's own side (a negative/sell quantity
 * closes a long; a positive/buy quantity closes a short).
 *
 * NinjaTrader/Tradovate rows are already one-row-per-closed-trade, so no
 * such pairing is needed there.
 *
 * Usage (browser, plain <script> tag):
 *   TradingJournalCsvFormats.detectFormat(text) -> "ib" | "ninjatrader" | null
 *   TradingJournalCsvFormats.parse(text, formatKey, knownProducts)
 *     -> { ok:true, trades:[...], skipped:[...] } | { ok:false, error }
 *   TradingJournalCsvFormats.toCsv(cards, accounts, formatKey) -> string
 *
 * Usage (Node, tests):
 *   const CsvFormats = require("./csv-formats.js");
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.TradingJournalCsvFormats = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var FORMATS = [
    { key: "ib", label: "Interactive Brokers" },
    { key: "ninjatrader", label: "NinjaTrader / Tradovate" },
  ];

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  // RFC4180-ish: quoted fields may contain commas/newlines/escaped "".
  function parseCsvRows(text) {
    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;
    var i = 0;
    var n = text.length;
    while (i < n) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i++;
          continue;
        }
        field += c;
        i++;
        continue;
      }
      if (c === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (c === ",") {
        row.push(field);
        field = "";
        i++;
        continue;
      }
      if (c === "\r") {
        i++;
        continue;
      }
      if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        i++;
        continue;
      }
      field += c;
      i++;
    }
    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter(function (r) { return !(r.length === 1 && r[0].trim() === ""); });
  }

  function headerIndexMap(headerRow) {
    var map = {};
    (headerRow || []).forEach(function (h, idx) {
      map[String(h).trim().toLowerCase()] = idx;
    });
    return map;
  }

  function getField(row, map, names) {
    for (var i = 0; i < names.length; i++) {
      var idx = map[names[i].toLowerCase()];
      if (idx !== undefined && row[idx] !== undefined) return row[idx];
    }
    return undefined;
  }

  function normalizeProduct(rawSymbol, knownProducts) {
    if (!rawSymbol) return null;
    var upper = String(rawSymbol).trim().toUpperCase();
    for (var i = 0; i < knownProducts.length; i++) {
      if (upper.indexOf(knownProducts[i].toUpperCase()) === 0) return knownProducts[i];
    }
    return null;
  }

  // "2026-09-08, 09:42:00" / "2026-09-08 09:42:00" / "20260908;094200"
  function parseIBDateTime(raw) {
    if (!raw) return null;
    var s = String(raw).trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})[,\s]+(\d{2}):(\d{2})/);
    if (m) return { dateET: m[1] + "-" + m[2] + "-" + m[3], timeET: m[4] + ":" + m[5] };
    m = s.match(/^(\d{4})(\d{2})(\d{2});(\d{2})(\d{2})/);
    if (m) return { dateET: m[1] + "-" + m[2] + "-" + m[3], timeET: m[4] + ":" + m[5] };
    return null;
  }

  // "9/8/2026 9:42:00 AM"
  function parseNTDateTime(raw) {
    if (!raw) return null;
    var s = String(raw).trim();
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?/i);
    if (!m) return null;
    var month = parseInt(m[1], 10);
    var day = parseInt(m[2], 10);
    var year = parseInt(m[3], 10);
    var hour = parseInt(m[4], 10);
    var minute = m[5];
    var ampm = m[7] ? m[7].toUpperCase() : null;
    if (ampm === "PM" && hour < 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    return { dateET: year + "-" + pad2(month) + "-" + pad2(day), timeET: pad2(hour) + ":" + minute };
  }

  function formatNTDateTime(dateET, timeET) {
    var dp = dateET.split("-");
    var year = dp[0];
    var month = parseInt(dp[1], 10);
    var day = parseInt(dp[2], 10);
    var tp = timeET.split(":");
    var hour = parseInt(tp[0], 10);
    var minute = tp[1];
    var ampm = hour >= 12 ? "PM" : "AM";
    var h12 = hour % 12;
    if (h12 === 0) h12 = 12;
    return month + "/" + day + "/" + year + " " + h12 + ":" + minute + ":00 " + ampm;
  }

  function detectFormat(text) {
    var rows = parseCsvRows(text);
    for (var i = 0; i < Math.min(rows.length, 10); i++) {
      if (rows[i][0] === "Trades" && rows[i][1] === "Header") return "ib";
    }
    var head = headerIndexMap(rows[0]);
    if (head["symbol"] !== undefined && (head["realized p/l"] !== undefined || head["realized p&l"] !== undefined)) return "ib";
    if (head["instrument"] !== undefined && head["profit"] !== undefined) return "ninjatrader";
    return null;
  }

  function parseIB(text, knownProducts) {
    var rows = parseCsvRows(text);
    var headerIdx = -1;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][0] === "Trades" && rows[i][1] === "Header") {
        headerIdx = i;
        break;
      }
    }
    var map, dataRows;
    if (headerIdx !== -1) {
      map = headerIndexMap(rows[headerIdx].slice(2));
      dataRows = rows
        .filter(function (r) { return r[0] === "Trades" && r[1] === "Data"; })
        .map(function (r) { return r.slice(2); });
    } else {
      map = headerIndexMap(rows[0]);
      dataRows = rows.slice(1);
    }

    var hasRequired = map["symbol"] !== undefined && map["quantity"] !== undefined;
    var hasPnl = map["realized p/l"] !== undefined || map["realized p&l"] !== undefined || map["fifopnlrealized"] !== undefined;
    var hasDateTime = map["date/time"] !== undefined || (map["date"] !== undefined && map["time"] !== undefined);
    if (!hasRequired || !hasPnl || !hasDateTime) {
      return {
        ok: false,
        error: "看不懂這個 IB 檔案的欄位（要有 Symbol／Quantity／Date-Time／Realized P&L）。目前抓到的欄位：" + Object.keys(map).join("、"),
      };
    }

    var trades = [];
    var skipped = [];
    dataRows.forEach(function (r) {
      function get(names) { return getField(r, map, names); }
      var qty = parseFloat(get(["quantity"]));
      var pnl = parseFloat(get(["realized p/l", "realized p&l", "fifopnlrealized"]));
      if (!isFinite(qty) || !isFinite(pnl)) {
        skipped.push({ raw: r, reason: "數量或損益不是數字" });
        return;
      }
      if (pnl === 0) return; // opening leg — not a closed trade, not an error
      var dtRaw = get(["date/time"]);
      var dt = dtRaw !== undefined ? parseIBDateTime(dtRaw) : parseIBDateTime(get(["date"]) + ", " + get(["time"]));
      if (!dt) {
        skipped.push({ raw: r, reason: "看不懂日期時間：" + (dtRaw || "") });
        return;
      }
      var symbolRaw = get(["symbol"]);
      var commRaw = get(["comm/fee", "commission", "ibcommission"]);
      var priceRaw = get(["t. price", "tradeprice"]);
      trades.push({
        symbolRaw: symbolRaw,
        product: normalizeProduct(symbolRaw, knownProducts),
        // closing execution: a sell (negative qty) closes a long (多); a buy (positive qty) closes a short (空)
        side: qty < 0 ? "多" : "空",
        size: Math.round(Math.abs(qty)),
        pnl: pnl,
        fee: commRaw !== undefined && commRaw !== "" ? Math.abs(parseFloat(commRaw)) : null,
        entryPrice: null,
        exitPrice: priceRaw !== undefined && priceRaw !== "" ? parseFloat(priceRaw) : null,
        dateET: dt.dateET,
        timeET: dt.timeET,
      });
    });

    return { ok: true, trades: trades, skipped: skipped };
  }

  function parseNinjaTrader(text, knownProducts) {
    var rows = parseCsvRows(text);
    if (!rows.length) return { ok: false, error: "檔案是空的" };
    var map = headerIndexMap(rows[0]);
    var dataRows = rows.slice(1);

    var hasRequired = map["instrument"] !== undefined && (map["qty"] !== undefined || map["quantity"] !== undefined) && map["profit"] !== undefined;
    if (!hasRequired) {
      return {
        ok: false,
        error: "看不懂這個 NinjaTrader/Tradovate 檔案的欄位（要有 Instrument／Qty／Profit）。目前抓到的欄位：" + Object.keys(map).join("、"),
      };
    }

    var trades = [];
    var skipped = [];
    dataRows.forEach(function (r) {
      function get(names) { return getField(r, map, names); }
      var qty = parseFloat(get(["qty", "quantity"]));
      var pnl = parseFloat(get(["profit"]));
      if (!isFinite(qty) || !isFinite(pnl)) {
        skipped.push({ raw: r, reason: "數量或損益不是數字" });
        return;
      }
      var entryRaw = get(["entry time"]);
      var exitRaw = get(["exit time"]);
      var dt = parseNTDateTime(entryRaw) || parseNTDateTime(exitRaw);
      if (!dt) {
        skipped.push({ raw: r, reason: "看不懂進出場時間：" + (entryRaw || exitRaw || "") });
        return;
      }
      var posRaw = String(get(["market pos.", "market pos"]) || "").toLowerCase();
      var symbolRaw = get(["instrument"]);
      var commRaw = get(["commission"]);
      var entryPriceRaw = get(["entry price"]);
      var exitPriceRaw = get(["exit price"]);
      trades.push({
        symbolRaw: symbolRaw,
        product: normalizeProduct(symbolRaw, knownProducts),
        side: posRaw.indexOf("short") !== -1 ? "空" : "多",
        size: Math.round(Math.abs(qty)),
        pnl: pnl,
        fee: commRaw !== undefined && commRaw !== "" ? Math.abs(parseFloat(commRaw)) : null,
        entryPrice: entryPriceRaw !== undefined && entryPriceRaw !== "" ? parseFloat(entryPriceRaw) : null,
        exitPrice: exitPriceRaw !== undefined && exitPriceRaw !== "" ? parseFloat(exitPriceRaw) : null,
        dateET: dt.dateET,
        timeET: dt.timeET,
      });
    });

    return { ok: true, trades: trades, skipped: skipped };
  }

  function parse(text, formatKey, knownProducts) {
    knownProducts = knownProducts || [];
    if (formatKey === "ib") return parseIB(text, knownProducts);
    if (formatKey === "ninjatrader") return parseNinjaTrader(text, knownProducts);
    return { ok: false, error: "不認得的格式：" + formatKey };
  }

  function csvEscape(v) {
    var s = v === null || v === undefined ? "" : String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCsvRow(fields) {
    return fields.map(csvEscape).join(",");
  }

  function accountName(accountId, accounts) {
    var found = (accounts || []).filter(function (a) { return a.id === accountId; })[0];
    return found ? found.name : accountId;
  }

  // One synthetic row per closed trade (our card model has no separate
  // opening/closing executions to split back out) — same column shape as
  // IB's real Trades section, for a backup/reference file, not a literal
  // re-derivation of two real executions.
  function exportIB(cards, accounts) {
    var header = [
      "Trades", "Header", "DataDiscriminator", "Asset Category", "Currency", "Account", "Symbol",
      "Date/Time", "Quantity", "T. Price", "C. Price", "Proceeds", "Comm/Fee", "Basis", "Realized P/L", "MTM P/L", "Code",
    ];
    var lines = [toCsvRow(header)];
    (cards || []).forEach(function (c) {
      // Same closing-execution sign convention parseIB() reads: a sell
      // (negative qty) closes a long (多); a buy (positive qty) closes a
      // short (空) — keeps export -> parse a round trip, and matches what a
      // real IB closing row for that trade would actually look like.
      var qty = c.side === "多" ? -c.size : c.size;
      var fee = typeof c.fee === "number" ? c.fee : 0;
      lines.push(
        toCsvRow([
          "Trades", "Data", "Order", "Futures", "USD", accountName(c.accountId, accounts), c.product,
          c.dateET + ", " + c.timeET + ":00", qty,
          c.entryPrice !== null && c.entryPrice !== undefined ? c.entryPrice : "",
          c.exitPrice !== null && c.exitPrice !== undefined ? c.exitPrice : "",
          "", fee ? -fee : "", "", c.pnl, "", "C",
        ])
      );
    });
    return lines.join("\r\n") + "\r\n";
  }

  function exportNinjaTrader(cards, accounts) {
    var header = [
      "Instrument", "Account", "Strategy", "Market pos.", "Qty", "Entry price", "Exit price",
      "Entry time", "Exit time", "Entry name", "Exit name", "Profit", "Cum. net profit", "Commission", "MAE", "MFE", "ETD", "Bars",
    ];
    var lines = [toCsvRow(header)];
    (cards || []).forEach(function (c) {
      var fee = typeof c.fee === "number" ? c.fee : 0;
      var dt = formatNTDateTime(c.dateET, c.timeET);
      lines.push(
        toCsvRow([
          c.product, accountName(c.accountId, accounts), c.setup,
          c.side === "多" ? "Long" : "Short", c.size,
          c.entryPrice !== null && c.entryPrice !== undefined ? c.entryPrice : "",
          c.exitPrice !== null && c.exitPrice !== undefined ? c.exitPrice : "",
          dt, dt, "", "", c.pnl, "", fee ? -fee : "", "", "", "", "",
        ])
      );
    });
    return lines.join("\r\n") + "\r\n";
  }

  function toCsv(cards, accounts, formatKey) {
    if (formatKey === "ib") return exportIB(cards, accounts);
    if (formatKey === "ninjatrader") return exportNinjaTrader(cards, accounts);
    throw new Error("不認得的格式：" + formatKey);
  }

  return {
    FORMATS: FORMATS,
    detectFormat: detectFormat,
    parse: parse,
    toCsv: toCsv,
  };
});

// 交易日誌 — broker CSV import/export (js/csv-formats.js) tests.
// Run with:  node 交易日誌/tests/csv-formats.test.js

var assert = require("assert");
var path = require("path");
var CsvFormats = require(path.join(__dirname, "..", "js", "csv-formats.js"));

var tests = [];
function test(name, fn) {
  tests.push({ name: name, fn: fn });
}

var PRODUCTS = ["MNQ", "MES"];

// ---- IB (Interactive Brokers Activity Statement, "Trades" section) -----

var IB_SAMPLE =
  'Trades,Header,DataDiscriminator,Asset Category,Currency,Account,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code\r\n' +
  'Trades,Data,Order,Futures,USD,U1234567,MNQZ5,"2026-09-08, 09:42:00",2,20150,20200.5,-40300,-1.24,-40300,0,101,O\r\n' +
  'Trades,Data,Order,Futures,USD,U1234567,MNQZ5,"2026-09-08, 10:05:00",-2,20200.5,20200.5,40401,-1.24,-40300,235.5,0,C\r\n';

test("detectFormat recognizes the IB Trades-section shape", function () {
  assert.strictEqual(CsvFormats.detectFormat(IB_SAMPLE), "ib");
});

test("parseIB skips the opening leg (0 realized P&L) and keeps only the closing leg", function () {
  var result = CsvFormats.parse(IB_SAMPLE, "ib", PRODUCTS);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.trades.length, 1);
  var t = result.trades[0];
  assert.strictEqual(t.product, "MNQ", "MNQZ5 normalizes to the MNQ root");
  assert.strictEqual(t.side, "多", "closing via a sell (negative qty) means the position was long");
  assert.strictEqual(t.size, 2);
  assert.strictEqual(t.pnl, 235.5);
  assert.strictEqual(t.fee, 1.24, "Comm/Fee stored as a positive cost");
  assert.strictEqual(t.dateET, "2026-09-08");
  assert.strictEqual(t.timeET, "10:05");
});

test("parseIB reports which headers it found when required fields are missing", function () {
  var result = CsvFormats.parse("foo,bar\r\n1,2\r\n", "ib", PRODUCTS);
  assert.strictEqual(result.ok, false);
  assert.ok(result.error.indexOf("foo") !== -1 && result.error.indexOf("bar") !== -1);
});

// ---- NinjaTrader / Tradovate (already one row per closed trade) --------

var NT_SAMPLE =
  "Instrument,Account,Strategy,Market pos.,Qty,Entry price,Exit price,Entry time,Exit time,Profit,Commission\r\n" +
  'MES 12-26,Sim101,開盤區間,Long,3,4500.00,4520.00,9/10/2026 10:05:00 AM,9/10/2026 10:20:00 AM,120,-2.48\r\n';

test("detectFormat recognizes the NinjaTrader/Tradovate shape", function () {
  assert.strictEqual(CsvFormats.detectFormat(NT_SAMPLE), "ninjatrader");
});

test("parseNinjaTrader reads a closed trade directly (no execution pairing needed)", function () {
  var result = CsvFormats.parse(NT_SAMPLE, "ninjatrader", PRODUCTS);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.trades.length, 1);
  var t = result.trades[0];
  assert.strictEqual(t.product, "MES", "\"MES 12-26\" normalizes to the MES root");
  assert.strictEqual(t.side, "多");
  assert.strictEqual(t.size, 3);
  assert.strictEqual(t.pnl, 120);
  assert.strictEqual(t.fee, 2.48);
  assert.strictEqual(t.entryPrice, 4500);
  assert.strictEqual(t.exitPrice, 4520);
  assert.strictEqual(t.dateET, "2026-09-10");
  assert.strictEqual(t.timeET, "10:05");
});

test("parseNinjaTrader maps 'Short' market position to 空", function () {
  var shortSample = NT_SAMPLE.replace("Long", "Short");
  var result = CsvFormats.parse(shortSample, "ninjatrader", PRODUCTS);
  assert.strictEqual(result.trades[0].side, "空");
});

// ---- export (download) --------------------------------------------------

var CARDS = [
  { product: "MNQ", setup: "突破", accountId: "acc-main", side: "多", size: 2, pnl: 235.5, fee: 1.24, dateET: "2026-09-08", timeET: "10:05", entryPrice: 20150, exitPrice: 20200.5 },
];
var ACCOUNTS = [{ id: "acc-main", name: "主帳戶", startingCapital: 0 }];

test("toCsv('ib', ...) round-trips through parse() back to the same trade", function () {
  var csv = CsvFormats.toCsv(CARDS, ACCOUNTS, "ib");
  var result = CsvFormats.parse(csv, "ib", PRODUCTS);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.trades.length, 1);
  assert.strictEqual(result.trades[0].pnl, 235.5);
  assert.strictEqual(result.trades[0].side, "多");
});

test("toCsv('ninjatrader', ...) round-trips through parse() back to the same trade", function () {
  var csv = CsvFormats.toCsv(CARDS, ACCOUNTS, "ninjatrader");
  var result = CsvFormats.parse(csv, "ninjatrader", PRODUCTS);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.trades.length, 1);
  assert.strictEqual(result.trades[0].pnl, 235.5);
  assert.strictEqual(result.trades[0].size, 2);
});

// ---- runner ----------------------------------------------------------

var passed = 0;
var failed = 0;
tests.forEach(function (t) {
  try {
    t.fn();
    passed++;
    console.log("ok - " + t.name);
  } catch (e) {
    failed++;
    console.log("not ok - " + t.name);
    console.log("  " + e.message);
  }
});
console.log("\n" + passed + " passed, " + failed + " failed, " + (passed + failed) + " total");
process.exit(failed ? 1 : 0);

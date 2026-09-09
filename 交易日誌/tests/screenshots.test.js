// 交易日誌 — trade report card screenshots (ticket 18) store tests.
// Run with:  node 交易日誌/tests/screenshots.test.js
// No build step, no runtime deps beyond Node's built-in "assert".
//
// Screenshots are attached to an already-saved card, one at a time — a card
// is still created with 0 via addCard (unchanged from ticket 13), and
// screenshots are only ever added/removed once the card exists. Bytes here
// are just small fake strings/data-URIs; the store never looks inside them.

var assert = require("assert");
var path = require("path");
var TradingJournal = require(path.join(__dirname, "..", "js", "store.js"));

var tests = [];
function test(name, fn) {
  tests.push({ name: name, fn: fn });
}

function freshStore() {
  return TradingJournal.createStore(TradingJournal.createMemoryStorage());
}

function validCardInput(overrides) {
  var base = {
    product: "MNQ",
    setup: "突破",
    accountId: "acc-main",
    grade: "B",
    execGrade: "B",
    side: "多",
    size: 2,
    pnl: 100,
    dateET: "2026-09-10",
    timeET: "09:41",
  };
  for (var k in overrides) base[k] = overrides[k];
  return base;
}

function fakeImage(n) {
  return "data:image/png;base64,fake-image-" + n;
}

// ---- regression: 0 screenshots must still save fine (ticket 13 behavior) --

test("a card saves fine with 0 screenshots (screenshots stay optional)", function () {
  var store = freshStore();
  var result = store.addCard(validCardInput());
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.card.screenshots, []);

  var real = store.getRealCards();
  assert.strictEqual(real.length, 1);
  assert.deepStrictEqual(real[0].screenshots, []);
});

// ---- writing 0 and 3 screenshots, reading them back ------------------

test("writing 3 screenshots to a card and reading them back correctly", function () {
  var store = freshStore();
  var created = store.addCard(validCardInput());
  var cardId = created.card.id;

  var r1 = store.addScreenshot(cardId, fakeImage(1));
  assert.strictEqual(r1.ok, true);
  assert.deepStrictEqual(r1.card.screenshots, [fakeImage(1)]);

  var r2 = store.addScreenshot(cardId, fakeImage(2));
  assert.strictEqual(r2.ok, true);
  assert.deepStrictEqual(r2.card.screenshots, [fakeImage(1), fakeImage(2)]);

  var r3 = store.addScreenshot(cardId, fakeImage(3));
  assert.strictEqual(r3.ok, true);
  assert.deepStrictEqual(r3.card.screenshots, [fakeImage(1), fakeImage(2), fakeImage(3)]);

  // Reading back through a fresh accessor call (not just the mutation's
  // return value) confirms it round-trips through persistence.
  var readBack = store.getCardById(cardId);
  assert.deepStrictEqual(readBack.screenshots, [fakeImage(1), fakeImage(2), fakeImage(3)]);

  var real = store.getRealCards();
  assert.strictEqual(real.length, 1);
  assert.deepStrictEqual(real[0].screenshots, [fakeImage(1), fakeImage(2), fakeImage(3)]);
});

// ---- a 4th screenshot is rejected, enforced in the store layer -------

test("a 4th screenshot attempt is rejected by the store, not just the UI", function () {
  var store = freshStore();
  var created = store.addCard(validCardInput());
  var cardId = created.card.id;

  store.addScreenshot(cardId, fakeImage(1));
  store.addScreenshot(cardId, fakeImage(2));
  store.addScreenshot(cardId, fakeImage(3));

  var r4 = store.addScreenshot(cardId, fakeImage(4));
  assert.strictEqual(r4.ok, false, "expected the 4th screenshot to be rejected");
  assert.ok(r4.errors.length > 0);

  // Rejection must not silently mutate the card.
  var card = store.getCardById(cardId);
  assert.strictEqual(card.screenshots.length, 3, "a rejected 4th screenshot must not be stored");
  assert.deepStrictEqual(card.screenshots, [fakeImage(1), fakeImage(2), fakeImage(3)]);
});

test("MAX_SCREENSHOTS is exported and equals 3", function () {
  assert.strictEqual(TradingJournal.MAX_SCREENSHOTS, 3);
});

// ---- removeScreenshot --------------------------------------------------

test("removeScreenshot removes exactly the targeted screenshot", function () {
  var store = freshStore();
  var created = store.addCard(validCardInput());
  var cardId = created.card.id;

  store.addScreenshot(cardId, fakeImage(1));
  store.addScreenshot(cardId, fakeImage(2));
  store.addScreenshot(cardId, fakeImage(3));

  var removed = store.removeScreenshot(cardId, 1); // remove the middle one
  assert.strictEqual(removed.ok, true);
  assert.deepStrictEqual(removed.card.screenshots, [fakeImage(1), fakeImage(3)]);

  // After removing one, a new screenshot can be added again (back under 3).
  var added = store.addScreenshot(cardId, fakeImage(4));
  assert.strictEqual(added.ok, true);
  assert.deepStrictEqual(added.card.screenshots, [fakeImage(1), fakeImage(3), fakeImage(4)]);
});

test("removeScreenshot rejects an out-of-range index", function () {
  var store = freshStore();
  var created = store.addCard(validCardInput());
  var cardId = created.card.id;
  store.addScreenshot(cardId, fakeImage(1));

  var result = store.removeScreenshot(cardId, 5);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(store.getCardById(cardId).screenshots.length, 1);
});

// ---- demo cards are read-only for screenshots -------------------------

test("addScreenshot on a demo card id is rejected (demo data is read-only)", function () {
  var store = freshStore();
  assert.strictEqual(store.isDemoActive(), true);
  var demoCards = store.getCards();
  assert.ok(demoCards.length > 0);
  var demoId = demoCards[0].id;

  var result = store.addScreenshot(demoId, fakeImage(1));
  assert.strictEqual(result.ok, false);
  assert.strictEqual(store.hasRealCards(), false, "attempting to screenshot a demo card must not create a real card");
});

// ---- invalid input --------------------------------------------------

test("addScreenshot rejects a non-string / empty value", function () {
  var store = freshStore();
  var created = store.addCard(validCardInput());
  var cardId = created.card.id;

  assert.strictEqual(store.addScreenshot(cardId, "").ok, false);
  assert.strictEqual(store.addScreenshot(cardId, "   ").ok, false);
  assert.strictEqual(store.addScreenshot(cardId, null).ok, false);
  assert.strictEqual(store.addScreenshot(cardId, undefined).ok, false);
  assert.strictEqual(store.getCardById(cardId).screenshots.length, 0);
});

test("addScreenshot on an unknown card id is rejected", function () {
  var store = freshStore();
  var result = store.addScreenshot("no-such-card", fakeImage(1));
  assert.strictEqual(result.ok, false);
});

// ---- demo cards ship with an empty screenshots array -------------------

test("built-in demo cards each have an empty screenshots array", function () {
  var store = freshStore();
  var demoCards = store.getCards();
  demoCards.forEach(function (c) {
    assert.ok(Array.isArray(c.screenshots), "demo card " + c.id + " should have a screenshots array");
    assert.strictEqual(c.screenshots.length, 0);
  });
});

// ---- getCardById -------------------------------------------------------

test("getCardById finds a real card and returns null for an unknown id", function () {
  var store = freshStore();
  var created = store.addCard(validCardInput());
  var found = store.getCardById(created.card.id);
  assert.ok(found);
  assert.strictEqual(found.id, created.card.id);

  assert.strictEqual(store.getCardById("nope"), null);
});

test("getCardById also finds demo cards while demo is active", function () {
  var store = freshStore();
  var demoCards = store.getCards();
  var found = store.getCardById(demoCards[0].id);
  assert.ok(found);
  assert.strictEqual(found.isDemo, true);
});

// ---- runner ----------------------------------------------------------

var passed = 0;
var failed = 0;
tests.forEach(function (t) {
  try {
    t.fn();
    passed++;
    console.log("ok - " + t.name);
  } catch (err) {
    failed++;
    console.log("FAIL - " + t.name);
    console.log("    " + (err && err.message ? err.message : err));
  }
});

console.log("");
console.log(passed + " passed, " + failed + " failed, " + tests.length + " total");

process.exit(failed > 0 ? 1 : 0);

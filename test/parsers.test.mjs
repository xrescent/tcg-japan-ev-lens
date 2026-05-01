import assert from "node:assert/strict";
import {
  buildConsolationPrizeSummary,
  buildSnkrdunkSearchQuery,
  parseLatestSalesPoint,
  parseSalesHistoryOptions,
  parseSnkrdunkSearchResults,
  pickBestSnkrdunkResult,
  selectSalesOptionId,
  targetConditionForCard
} from "../src/parsers.js";

const psaCard = {
  id: 65456,
  name: "〔PSA10鑑定済〕メガルカリオex【MUR】{092/063} [その他]",
  is_psa_enabled: 1,
  psa: 10
};

const rawCardWithPsaApiValue = {
  id: 65459,
  name: "チルタリスex【SAR】{090/066} [SV4M]",
  is_psa_enabled: 2,
  psa: 10
};

const classMarkedPsaCard = {
  id: 999,
  name: "メガルカリオex【MUR】{092/063}",
  sourceElementClass: "gacha-info-card image-rank1 gacha-info-card-psa",
  psa: 10
};

assert.equal(targetConditionForCard(psaCard), "PSA10");
assert.equal(buildSnkrdunkSearchQuery(psaCard), "メガルカリオex MUR 092/063 PSA10");
assert.equal(targetConditionForCard(rawCardWithPsaApiValue), "B");
assert.equal(buildSnkrdunkSearchQuery(rawCardWithPsaApiValue), "チルタリスex SAR 090/066");
assert.equal(targetConditionForCard(classMarkedPsaCard), "PSA10");

const searchHtml = `
  <a href="https://snkrdunk.com/apparels/663638/used/43365776" aria-label="メガルカリオex MUR [M1L 092/063](拡張パック&quot;メガブレイブ&quot;) - ¥220,000">
    <span>メガルカリオex MUR [M1L 092/063](拡張パック&quot;メガブレイブ&quot;)</span>
    <span>PSA10</span>
  </a>
  <a href="https://snkrdunk.com/apparels/111111/used/1" aria-label="別カード - ¥1,000">
    <span>A</span>
  </a>
`;

const searchResults = parseSnkrdunkSearchResults(searchHtml);
assert.equal(searchResults.length, 2);
assert.equal(searchResults[0].productId, 663638);
assert.equal(searchResults[0].salePrice, 220000);
assert.equal(searchResults[0].condition, "PSA10");
assert.equal(pickBestSnkrdunkResult(searchResults, psaCard)?.productId, 663638);

const historyHtml = `
  <apparel-sales-history-item
    data-source-url="/v1/apparels/663638/sales-chart/used"
    :apparel-id="663638"
    :sales-chart-option-id="18"
    sales-chart-option-name="A"
  ></apparel-sales-history-item>
  <apparel-sales-history-item
    data-source-url="/v1/apparels/663638/sales-chart/used"
    :apparel-id="663638"
    :sales-chart-option-id="22"
    sales-chart-option-name="PSA10"
  ></apparel-sales-history-item>
`;

const options = parseSalesHistoryOptions(historyHtml);
assert.deepEqual(options, [
  { id: 18, name: "A" },
  { id: 22, name: "PSA10" }
]);
assert.equal(selectSalesOptionId(options, "PSA10"), 22);
assert.equal(selectSalesOptionId(options, "A"), 18);
assert.equal(selectSalesOptionId(options, "B"), 19);

assert.deepEqual(parseLatestSalesPoint({ points: [[2, 1200], [1, 900]] }), {
  timestamp: 2,
  price: 1200,
  date: "1970-01-01T00:00:00.002Z"
});

const packageWithConsolation = {
  number: 60,
  package_cards: [
    { rank: 1, number: 1, point: 50000 },
    { rank: 2, number: 1, point: 30000 },
    { rank: 2, number: 1, point: 15000 },
    { rank: 3, number: 1, point: 15000 },
    { rank: 3, number: 3, point: 6500 },
    { rank: 3, number: 2, point: 6500 },
    { rank: 3, number: 2, point: 6500 },
    { rank: 9, number: 1, point: 10000 },
    { rank: 4, number: null, point: 500, name: null, card_id: null },
    { rank: 4, number: null, point: 500, name: null, card_id: null },
    { rank: 4, number: null, point: 500, name: null, card_id: null },
    { rank: 4, number: null, point: 500, name: null, card_id: null },
    { rank: 4, number: null, point: 500, name: null, card_id: null },
    { rank: 4, number: null, point: 500, name: null, card_id: null }
  ]
};

assert.deepEqual(buildConsolationPrizeSummary(packageWithConsolation), {
  rank: 4,
  quantity: 49,
  point: 500,
  source: "api_point",
  placeholderCount: 6
});

console.log("parser tests passed");

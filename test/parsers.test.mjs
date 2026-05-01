import assert from "node:assert/strict";
import {
  buildConsolationPrizeSummary,
  buildSnkrdunkSearchQuery,
  parseClovePackageHtml,
  parseDopaPackageHtml,
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

const dopaProps = {
  packId: "3765",
  pack: {
    id: 3765,
    name: "265238　80000",
    imageUrl: "https://cdn.dopa-global.com/pack.webp",
    oneTimePoint: 80000,
    total: 560,
    remaining: 549,
    sold: 11,
    returnInfo: { minReturn: 300 },
    hazure_kind: "B"
  },
  previewImage: {
    lastOneCard: {
      data: {
        id: 736467,
        name: "(Japanese) Pikachu (PSA10)",
        imageUrl: "https://cdn.dopa-global.com/last.webp",
        productType: "psa",
        psaPoint: 10,
        quantity: 1,
        pack_card_point: 110000
      }
    },
    rankedCards: [
      {
        rank: "s",
        cards: {
          data: [
            {
              id: 1354585,
              name: "(Japanese) Rayquaza VMAX (PSA10)",
              imageUrl: "https://cdn.dopa-global.com/ray.webp",
              productType: "psa",
              psaPoint: 10,
              rarity: "HR",
              quantity: 1,
              pack_card_point: 1100000
            }
          ]
        }
      },
      {
        rank: "c",
        cards: {
          data: [
            {
              id: 10270965,
              name: "(Japanese) [1 Pack]Night Wanderer",
              imageUrl: "https://cdn.dopa-global.com/pack-card.webp",
              productType: "pack",
              rarity: "Pack",
              quantity: 559,
              pack_card_point: 300
            }
          ]
        }
      }
    ]
  }
};
const dopaFlight = `1c:${JSON.stringify(["$", "$L2c", null, dopaProps])}\n`;
const dopaHtml = `<script>self.__next_f.push(${JSON.stringify([1, dopaFlight])})</script>`;
const dopaPackage = parseDopaPackageHtml(dopaHtml, { packageId: 3765, locale: "zh" });

assert.equal(dopaPackage.source, "dopa");
assert.equal(dopaPackage.price, 80000);
assert.equal(dopaPackage.number, 560);
assert.equal(dopaPackage.stock, 549);
assert.equal(dopaPackage.package_cards.length, 3);
assert.equal(dopaPackage.package_cards[0].rank, 1);
assert.equal(dopaPackage.package_cards[0].number, 1);
assert.equal(dopaPackage.package_cards[0].is_psa_enabled, 1);
assert.equal(dopaPackage.package_cards[1].rank, 4);
assert.equal(dopaPackage.package_cards[1].product_type, "pack");
assert.equal(dopaPackage.package_cards[2].rank, 9);
assert.equal(buildSnkrdunkSearchQuery(dopaPackage.package_cards[0]), "Rayquaza VMAX HR PSA10");

const cloveNextData = {
  props: {
    pageProps: {
      oripa: {
        id: "cmoif1acp001vs601r30gq9c0",
        name: "GW2026 超激熱PSA10確定",
        price: 10000,
        quantity: 40000,
        remaining: 39172,
        category: "POKEMON",
        thumbnail: { "zh-TW": "https://storage.googleapis.com/clv_app_prd/oripa/thumbnail.png" },
        firstDisplayedPrizesForLineup: [
          {
            id: "first-1",
            prizeType: "FIRST",
            mainDescription: "(PSA)ピカチュウ",
            mainDescriptionEn: "PSA10 Pikachu (JP)",
            subDescription: "",
            kataban: "XYP 279/XY-P",
            imageUrl: "https://storage.googleapis.com/clv_app_prd/items/pika.jpg",
            condition: "PSA10",
            quantity: 1,
            referencePriceInfo: {
              referencePrice: 4700000,
              referencePriceUpdatedAt: "2026-05-01T00:00:15.263Z"
            }
          }
        ],
        secondDisplayedPrizesForLineup: [
          {
            id: "second-1",
            prizeType: "SECOND",
            mainDescription: "(PSA)ゲンガー&ミミッキュGX",
            subDescription: "SR",
            kataban: "SM9 103/095",
            imageUrl: "https://storage.googleapis.com/clv_app_prd/items/gengar.jpg",
            condition: "PSA10",
            quantity: 1,
            referencePriceInfo: { referencePrice: 550000 }
          }
        ],
        thirdDisplayedPrizesForLineup: [
          {
            id: "third-placeholder",
            prizeType: "THIRD",
            mainDescription: "(PSA)リーリエのアブリボン",
            subDescription: "AR",
            kataban: "sv9 105/100",
            imageUrl: "https://storage.googleapis.com/clv_app_prd/items/ribombee.jpg",
            condition: "PSA10",
            quantity: null
          }
        ],
        fourthDisplayedPrizesForLineup: [
          {
            id: "fourth-placeholder",
            prizeType: "FOURTH",
            mainDescription: "(PSA)ARランダムPSA10",
            subDescription: "AR",
            kataban: "-",
            imageUrl: "https://storage.googleapis.com/clv_app_prd/items/random.jpg",
            condition: "PSA10",
            quantity: null
          }
        ],
        extraDisplayedPrizesForLineup: [],
        roundNumberDisplayedPrizesForLineup: [],
        lastOneDisplayedPrizesForLineup: []
      }
    }
  },
  query: { category: "All", oripaId: "cmoif1acp001vs601r30gq9c0" },
  locale: "zh-TW"
};
const cloveHtml = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(cloveNextData)}</script>`;
const clovePackage = parseClovePackageHtml(cloveHtml, { packageId: "cmoif1acp001vs601r30gq9c0" });

assert.equal(clovePackage.source, "clove");
assert.equal(clovePackage.price, 10000);
assert.equal(clovePackage.number, 40000);
assert.equal(clovePackage.stock, 39172);
assert.equal(clovePackage.package_cards.length, 2);
assert.equal(clovePackage.package_cards[0].rank, 1);
assert.equal(clovePackage.package_cards[0].number, 1);
assert.equal(clovePackage.package_cards[0].is_psa_enabled, 1);
assert.equal(clovePackage.package_cards[0].point, 4700000);
assert.equal(clovePackage.package_cards[0].referencePriceUpdatedAt, "2026-05-01T00:00:15.263Z");
assert.equal(buildSnkrdunkSearchQuery(clovePackage.package_cards[0]), "ピカチュウ XYP 279/XY-P PSA10");
assert.deepEqual(clovePackage.consolation_prize, {
  rank: 4,
  quantity: 39998,
  point: null,
  source: "missing_clove_lower_tiers",
  placeholderCount: 2
});

console.log("parser tests passed");

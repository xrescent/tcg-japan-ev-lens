# Gacha EV Lens

Chrome MV3 extension for estimating the expected value of online TCG gacha pools.

## What It Does

- Detects TCG Japan pool pages such as `https://tcg-japan.com/pokemon/1603`.
- Detects DOPA Global pool pages such as `https://dopa-global.com/zh/gacha/3765`.
- Detects Clove pool pages such as `https://oripa.clove.jp/zh-TW/oripa/All/cmoif1acp001vs601r30gq9c0`.
- Reads TCG Japan pool metadata from the public Oripal package API.
- Reads DOPA Global pool metadata from the page's Next.js payload and maps S/A/B/C tiers into R1/R2/R3/R4.
- Reads Clove pool metadata from the page's Next.js payload and maps FIRST/SECOND/THIRD/FOURTH tiers into R1/R2/R3/R4.
- Searches SNKRDUNK with each prize card name, card number, rarity, and PSA grade when present.
- Fetches SNKRDUNK sales-chart data and uses the latest point as the card price.
- Uses PSA10 pricing only when the card name/class marks the prize as PSA; non-PSA prizes use SNKRDUNK B-condition sales-chart prices.
- Injects a fixed EV panel showing:
  - single-draw EV
  - draw cost
  - EV / cost ratio
  - per-prize contribution
  - manual price override inputs when search misses
  - separate R3 and R4 fixed-value overrides for placeholder/comfort-prize style pools
  - an option to apply those fixed values only to non-PSA prizes

## Install Locally

1. Open Chrome and go to `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this project folder.
5. Visit a supported TCG Japan, DOPA Global, or Clove pool page.

## Notes

- TCG Japan currently exposes the sample pool through `https://api.oripal-world.com/api/package/1603?shop_id=21`.
- DOPA Global pages embed pack totals, remaining draw counts, visible prize quantities, and last-one prize data in the page payload.
- Clove pages embed total draw count, remaining draw count, price, and displayed prize lineups in `__NEXT_DATA__`.
- SNKRDUNK search uses `https://snkrdunk.com/search?keywords=...`.
- SNKRDUNK sales data is read from `/v1/apparels/{id}/sales-chart/used?salesChartOptionId=...`.
- If the selected SNKRDUNK condition has no sales-chart data, the extension leaves the prize unpriced instead of using a mixed-condition listing price.
- When Rank 4 is shown as `其他可用`, the extension creates an `其他可用 / 安慰獎` row for the missing draw count. If the API exposes a placeholder `point` value, that value is used automatically; otherwise it is marked for manual entry.
- When Clove shows lower-tier lineup examples without exact quantities, the extension creates a `未公開下位獎 / 安慰獎` row for the undisclosed remaining draw count and marks it for manual entry.
- If a Clove prize has a public reference price and SNKRDUNK cannot find a usable price, the extension uses the Clove reference price and marks the row as `Clove參考價`.
- `rank9` / last-one prizes are shown in a separate helper panel and are not folded into the main single-draw EV automatically.
- The panel shows a warning when the pool stock differs from the published prize quantity sum.

## Verify Parser Logic

This workspace does not currently have `npm`, but the bundled Node runtime can run the parser tests:

```sh
/Applications/Codex.app/Contents/Resources/node test/parsers.test.mjs
```

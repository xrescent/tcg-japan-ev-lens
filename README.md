# TCG Japan EV Lens

Chrome MV3 extension for estimating the expected value of TCG Japan gacha pools.

## What It Does

- Detects TCG Japan pool pages such as `https://tcg-japan.com/pokemon/1603`.
- Reads pool metadata from the public Oripal package API.
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
5. Visit a supported TCG Japan pool page.

## Notes

- TCG Japan currently exposes the sample pool through `https://api.oripal-world.com/api/package/1603?shop_id=21`.
- SNKRDUNK search uses `https://snkrdunk.com/search?keywords=...`.
- SNKRDUNK sales data is read from `/v1/apparels/{id}/sales-chart/used?salesChartOptionId=...`.
- If the selected SNKRDUNK condition has no sales-chart data, the extension leaves the prize unpriced instead of using a mixed-condition listing price.
- When Rank 4 is shown as `其他可用`, the extension creates an `其他可用 / 安慰獎` row for the missing draw count. If the API exposes a placeholder `point` value, that value is used automatically; otherwise it is marked for manual entry.
- `rank9` / last-one prizes are shown in a separate helper panel and are not folded into the main single-draw EV automatically.
- The panel shows a warning when the pool stock differs from the published prize quantity sum.

## Verify Parser Logic

This workspace does not currently have `npm`, but the bundled Node runtime can run the parser tests:

```sh
/Applications/Codex.app/Contents/Resources/node test/parsers.test.mjs
```

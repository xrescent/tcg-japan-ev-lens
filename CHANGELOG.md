# Changelog

## 0.1.2

### Added

- Added rank-colored badges for prize tiers: R1 gold, R2 silver, R3 bronze, and R4 iron/black.
- Added collapsible Rank groups so users can scan and fold R1-R4 prize sections.
- Added per-Rank group summaries showing item count, draw quantity, EV contribution, and contribution share of total EV.
- Added `需補 N` indicators on Rank groups when prizes still need manual pricing.

### Changed

- Rank groups with missing prices now move to the top of the prize list.
- Within each Rank group, prizes that need manual input now appear before already-priced prizes.
- Manual price typing now updates the EV summary, row display, and Rank contribution metrics immediately without reordering the list mid-typing.
- Rank group ordering refreshes after manual input is committed, keeping long lists easier to clean up.

## 0.1.1

### Added

- Added Google search links next to SNKRDUNK links for prizes that need extra manual research.
- Added separate R3 and R4 bulk manual price controls.
- Added an option to apply R3/R4 bulk prices only to non-PSA prizes.
- Added visual coverage states: green when every prize quantity has a value, red when any prize still needs pricing.
- Added warning styling for individual unpriced prizes until a manual value is entered.
- Added `rank9` / last-one prize handling in a separate helper panel with manual last-prize valuation.
- Added automatic Rank 4 `其他可用 / 安慰獎` rows for missing prize quantity.

### Changed

- Non-PSA prizes now use SNKRDUNK B-condition sales-chart prices instead of PSA prices.
- SNKRDUNK pricing now reads the selected condition chart and does not use mixed-condition listing prices when chart data is missing.
- Rank 4 `其他可用` placeholders now use the TCG Japan API placeholder `point` value when available.
- Manual price inputs no longer re-render the full list on each keystroke, so users can type complete values normally.
- Manual and fetched price maps now use stable string keys, which supports synthetic rows such as `consolation-1606`.

### Fixed

- Fixed pools such as `https://tcg-japan.com/pokemon/1606`, where visible R1-R3 prizes total 11 but the pool has 60 draws. The extension now treats the remaining 49 draws as Rank 4 consolation prizes and uses the API `point: 500` value when present.
- Fixed detection for typo-like Rank 4 containers such as `gacha-info-detai gacha-info-detail-rank4`.

### Notes

- For `rank9` last-one prizes, the value is intentionally not folded into the normal single-draw EV automatically. The panel shows separate amortized and remaining-bundle calculations so users can judge whether buying the remaining pool makes sense.

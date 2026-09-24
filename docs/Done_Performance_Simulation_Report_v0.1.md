# PLOT Performance Calibration Report v0.1

## Calibration

The workbook baselines remain in `PERFORMANCE_STAGE_RULES` as the long-term economy targets.

The live v0.1 score uses `PERFORMANCE_RUNTIME_TARGETS`, generated from a deterministic seven-day mixed-board simulation using the current building catalog and settlement model. Activity and revenue targets are weekly major-Cash totals; customer targets are weekly averages.

| Stage | Activity / week | Revenue / week | Avg. customers | Retained customers |
|---|---:|---:|---:|---:|
| Humble | 2,773.55 | 37.36 | 117.43 | 53 |
| Starter | 11,661.42 | 140.56 | 439.86 | 326 |
| Growing | 28,595.29 | 334.62 | 964.00 | 149 |
| Established | 60,590.15 | 734.17 | 2,068.71 | 1,012 |
| Elite | 99,731.67 | 1,044.23 | 2,734.71 | 1,424 |
| Tycoon | 164,166.82 | 1,645.86 | 4,122.00 | 1,964 |

## Seven-day result

Mature mixed boards using the runtime targets scored as follows:

| Stage | Runtime score | Eligible | Workbook score |
|---|---:|---|---:|
| Humble | 95.30 | Yes | 65.21 |
| Starter | 93.50 | Yes | 45.68 |
| Growing | 93.02 | Yes | 30.72 |
| Established | 93.25 | Yes | 28.18 |
| Elite | 93.29 | Yes | 26.33 |
| Tycoon | 93.43 | Yes | 25.82 |

The no-hunt mature pass still qualifies every stage, with scores from 88.02 to 90.30. This is expected because Market Hunts are only 5% of the total performance score; they improve payout weight without becoming a hard weekly requirement.

## Payout cohort

The representative cohort contained 1,520 eligible players. The payout allocator distributed 1,999,241 of the 2,000,000 `$PLOT` pool after integer rounding. All six stage divisions received payouts.

The calibration is implemented in `packages/game/src/performance.ts` and reproduced by `scripts/simulate_performance.ts`.

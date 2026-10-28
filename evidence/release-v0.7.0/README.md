# v0.7.0 development-benchmark behavior diff

Date: 28 October 2026. Corpus: the frozen 152-case development manifest
(`benchmark/manifest.json`), not formal v4 and not human-labeled.

Method: for each case, `node <cli> scan benchmark/snapshots/<case> --json
--fail-on none`, recording per-severity finding counts and
`analysis_complete`.

| CLI | Source | `dist/cli.js` SHA-256 |
|---|---|---|
| v0.6.2 | `7defcb5` | `8fb4ed58d60670ef4b52bd968b96373cf1302c970bda56e5ce710ee0aa480edc` |
| main before the version bump | `6d5f044` | `fd811ee4b47407664dccfcaa628cfd45df270d40ae33e7cc04bd093f165fbda1` |

The version bump changes only the embedded version string in `dist/cli.js`.

| Count | v0.6.2 | `6d5f044` |
|---|---|---|
| critical | 6 | 4 |
| high | 68 | 36 |
| medium | 184 | 180 |
| low | 0 | 0 |
| complete scans | 58 | 46 |
| failed scans | 0 | 0 |

43 of 152 cases differ in at least one of these fields. Of the 34 high
findings removed (2 added elsewhere), 23 are in cases whose current scan
carries `agentci/analysis-agent-implicit-ingestion-unknown`. Per-case rows:
`dev-benchmark-v0.6.2-7defcb5.jsonl`, `dev-benchmark-6d5f044.jsonl`.

This is scanner behavior. It is not precision, recall, or evidence that any
removed alert was a false positive.

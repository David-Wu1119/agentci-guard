# Development-only annotation feasibility pilot

This pilot answers one question before full annotation begins: how much human
time and disagreement does the frozen annotation protocol produce?

It is **not accuracy evidence**. All selected workflows are from the development
split. The selection script uses only case ID, split, stratum, and annotation
unit count; it does not inspect evaluation workflow content or scanner
predictions.

## Frozen pilot

`manifest.json` selects one development workflow per stratum using the case
nearest that stratum's median annotation-unit count. A seeded hash breaks ties.
The resulting six workflows and 168 units are regenerated mechanically:

```bash
node scripts/benchmark/generate-pilot-sheet.mjs --check
```

Annotators must use separate copies of `annotation-sheet.csv` and
`timing-sheet.csv`. They must not run AgentCI Guard, open scanner output, inspect
another annotator's sheet, or open evaluation snapshots.

## Blind pilot procedure

The coordinator creates two isolated packets from the repository root:

```bash
pilot_dir="$(mktemp -d)"
node scripts/benchmark/export-pilot-packet.mjs "$pilot_dir/annotator-a"
node scripts/benchmark/export-pilot-packet.mjs "$pilot_dir/annotator-b"
```

Each packet contains only the selected development snapshots, rule contract,
analysis guide, blank annotation/timing sheets, source attribution, and
checksums. It excludes scanner code, built bundles, evaluation snapshots, and
predictions.

Each annotator follows the packet's `README.md`, fills all 168 annotation rows,
and records active minutes separately for each workflow. Use different stable
human pseudonyms.

After both independent passes:

```bash
node scripts/benchmark/import-annotation-csv.mjs \
  "$pilot_dir/annotator-a/annotation-sheet.csv" \
  reviewer-a "$pilot_dir/annotator-a.jsonl" \
  --coverage pilot

node scripts/benchmark/import-annotation-csv.mjs \
  "$pilot_dir/annotator-b/annotation-sheet.csv" \
  reviewer-b "$pilot_dir/annotator-b.jsonl" \
  --coverage pilot

node scripts/benchmark/compare-annotations.mjs \
  "$pilot_dir/annotator-a.jsonl" \
  "$pilot_dir/annotator-b.jsonl" \
  "$pilot_dir/disagreements.csv" \
  --coverage pilot

node scripts/benchmark/summarize-pilot.mjs \
  "$pilot_dir/annotator-a/timing-sheet.csv" \
  "$pilot_dir/annotator-b/timing-sheet.csv" \
  "$pilot_dir/annotator-a.jsonl" \
  "$pilot_dir/annotator-b.jsonl" \
  "$pilot_dir/summary.json"
```

Review the timing projection, agreement, and every disagreement. If the current
protocol is infeasible or ambiguous, revise and version it before opening
evaluation labels. Pilot labels must never be merged into evaluation metrics.

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

From the repository root:

```bash
pilot_dir="$(mktemp -d)"
cp benchmark/pilot/annotation-sheet.csv "$pilot_dir/annotator-a.csv"
cp benchmark/pilot/annotation-sheet.csv "$pilot_dir/annotator-b.csv"
cp benchmark/pilot/timing-sheet.csv "$pilot_dir/timing-a.csv"
cp benchmark/pilot/timing-sheet.csv "$pilot_dir/timing-b.csv"
```

Each annotator follows `ANNOTATION_GUIDE.md`, fills all 168 annotation rows, and
records active minutes separately for each workflow. Use different stable human
pseudonyms.

After both independent passes:

```bash
node scripts/benchmark/import-annotation-csv.mjs \
  "$pilot_dir/annotator-a.csv" reviewer-a "$pilot_dir/annotator-a.jsonl" \
  --coverage pilot

node scripts/benchmark/import-annotation-csv.mjs \
  "$pilot_dir/annotator-b.csv" reviewer-b "$pilot_dir/annotator-b.jsonl" \
  --coverage pilot

node scripts/benchmark/compare-annotations.mjs \
  "$pilot_dir/annotator-a.jsonl" \
  "$pilot_dir/annotator-b.jsonl" \
  "$pilot_dir/disagreements.csv" \
  --coverage pilot

node scripts/benchmark/summarize-pilot.mjs \
  "$pilot_dir/timing-a.csv" \
  "$pilot_dir/timing-b.csv" \
  "$pilot_dir/annotator-a.jsonl" \
  "$pilot_dir/annotator-b.jsonl" \
  "$pilot_dir/summary.json"
```

Review the timing projection, agreement, and every disagreement. If the current
protocol is infeasible or ambiguous, revise and version it before opening
evaluation labels. Pilot labels must never be merged into evaluation metrics.

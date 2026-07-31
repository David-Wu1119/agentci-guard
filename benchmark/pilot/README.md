# Development-only annotation feasibility pilot

This pilot answers two questions before formal annotation begins: how much
human time does the frozen protocol require, and how consistently can the sole
available annotator apply it after a washout period?

It is **not accuracy evidence or inter-rater agreement evidence**. All selected
workflows are from the development split. The selection script uses only case
ID, split, stratum, and annotation-unit count; it does not inspect evaluation
workflow content or scanner predictions.

## Frozen pilot

`manifest.json` selects one development workflow per stratum using the case
nearest that stratum's median annotation-unit count. A seeded hash breaks ties.
The resulting six workflows and 168 units are regenerated mechanically:

```bash
node scripts/benchmark/generate-pilot-sheet.mjs --check
```

The predeclared mode is a two-pass, single-annotator test-retest:

- the same stable human pseudonym is used for both passes;
- pass 2 starts at least seven full days after pass 1 ends;
- the completed pass-1 files remain closed throughout pass 2;
- neither pass may consult AgentCI Guard, scanner output, or evaluation
  snapshots.

This design measures intra-annotator repeatability. It does not create an
independent reviewer by renaming the same person.

## Blind pilot procedure

Create only the pass-1 packet at first:

```bash
node scripts/benchmark/export-pilot-packet.mjs \
  /absolute/private/path/agentci-pilot-pass-1
```

Fill all 168 annotation rows and record active minutes separately for each
workflow. Preserve the completed packet without opening it again. After the
latest pass-1 completion timestamp, wait at least seven full days, then create a
fresh pass-2 packet:

```bash
node scripts/benchmark/export-pilot-packet.mjs \
  /absolute/private/path/agentci-pilot-pass-2
```

The packet contains only the selected development snapshots, rule contract,
analysis guide, blank annotation/timing sheets, source attribution, and
checksums. It excludes scanner code, built bundles, evaluation snapshots, and
predictions. Use the same stable pseudonym in both packets, but do not copy
labels, notes, or explanations from pass 1 into pass 2.

After both passes:

```bash
node scripts/benchmark/import-annotation-csv.mjs \
  /absolute/private/path/agentci-pilot-pass-1/annotation-sheet.csv \
  annotator-01 /absolute/private/path/pass-1.jsonl \
  --coverage pilot \
  --review-mode test-retest \
  --pass 1

node scripts/benchmark/import-annotation-csv.mjs \
  /absolute/private/path/agentci-pilot-pass-2/annotation-sheet.csv \
  annotator-01 /absolute/private/path/pass-2.jsonl \
  --coverage pilot \
  --review-mode test-retest \
  --pass 2

node scripts/benchmark/compare-annotations.mjs \
  /absolute/private/path/pass-1.jsonl \
  /absolute/private/path/pass-2.jsonl \
  /absolute/private/path/disagreements.csv \
  --coverage pilot \
  --review-mode test-retest

node scripts/benchmark/summarize-pilot.mjs \
  /absolute/private/path/agentci-pilot-pass-1/timing-sheet.csv \
  /absolute/private/path/agentci-pilot-pass-2/timing-sheet.csv \
  /absolute/private/path/pass-1.jsonl \
  /absolute/private/path/pass-2.jsonl \
  /absolute/private/path/summary.json \
  --review-mode test-retest
```

The summary command rejects different pseudonyms and a washout shorter than the
predeclared seven days. Review the timing projection, repeatability statistics,
and every disagreement only after pass 2 is complete. If the protocol is
infeasible or ambiguous, revise and version it before opening evaluation
labels. Pilot labels must never be merged into evaluation metrics.

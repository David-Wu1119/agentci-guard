# Candidate nine-rule micro-pilot coordinator procedure

This is a versioned, **development-only** seven-workflow challenge packet (160
structural units). The historical v0.1.1 pilot under `benchmark/pilot/` stays
separate. The six original `dev` cases and one formerly `eval` case are all
development data now: detector tuning inspected the entire v3 split. The
coordinator manifest here preserves original IDs, strata, split, fixed source
commit/blob/SHA-256/bytes/license, the candidate scanner commit/bundle hash,
and the standalone contract hash. The exported annotator manifest uses neutral
IDs and omits historical strata/IDs/selection reasons.

This packet is pinned to scanner commit `38a3272436fc91877aca13509a56afd32051fc92`
and its own frozen contract. The scanner and rule semantics on current `main`
have since changed. These labels can measure one human's test–retest consistency
under this contract, but cannot validate the current scanner or its rules.
Evaluating current rules requires a separately versioned contract and packet
frozen before the human starts labeling them. Do not repin this packet.

This is a targeted mechanism check, not a representative sample, calibrated
precision/recall, independent reviewer study, or production gate. The human
decision contract was prepared with scanner design context; no scanner
predictions or labels are exported. The single human annotator labels twice.

## Freeze and export

From a checkout whose Git history contains the pinned scanner commit, verify
the generated blank packet:

```bash
node scripts/benchmark/candidate-pilot.mjs --check
```

This check reads the pinned Git objects; it does not check the scanner built
from the current checkout.

Export only pass 1 initially, to a new private directory:

```bash
node scripts/benchmark/candidate-pilot.mjs --export /absolute/private/path/candidate-pass-1
```

The exporter refuses an existing destination. Give the human only that packet,
not this coordinator directory, scanner code/output, or old completed sheets.
The packet's `README.md` tells the annotator what to fill. Keep the entire
filled packet, including its original blank `CHECKSUMS.sha256`.

After the latest pass-1 completion timestamp, wait at least seven full days,
then export a fresh pass-2 packet and compare the blank contracts:

```bash
node scripts/benchmark/candidate-pilot.mjs --export /absolute/private/path/candidate-pass-2
cmp /absolute/private/path/candidate-pass-1/CHECKSUMS.sha256 /absolute/private/path/candidate-pass-2/CHECKSUMS.sha256
```

If the checksum lists differ, stop. Do not compare pass-1 filled decisions
with pass 2 before the second pass is completed. CSV should be saved as UTF-8;
the importer accepts an optional UTF-8 BOM. Use the same stable pseudonym for
both passes. `active_minutes` is self-reported human time, never an AI estimate.

## Import and check after both passes

Use **new output paths outside both packets**. Imports and reports refuse to
overwrite; a retry uses a fresh filename. The importer requires every unit,
valid decisions, unchanged prefilled metadata, bounded evidence lines, and
the pinned candidate contract/source. It does not assign labels itself.

```bash
node scripts/benchmark/import-annotation-csv.mjs \
  /absolute/private/path/candidate-pass-1/annotation-sheet.csv \
  annotator-01 /absolute/private/path/candidate-pass-1.jsonl \
  --coverage candidate-pilot --review-mode test-retest --pass 1

node scripts/benchmark/import-annotation-csv.mjs \
  /absolute/private/path/candidate-pass-2/annotation-sheet.csv \
  annotator-01 /absolute/private/path/candidate-pass-2.jsonl \
  --coverage candidate-pilot --review-mode test-retest --pass 2

node scripts/benchmark/check-candidate-pilot-passes.mjs \
  /absolute/private/path/candidate-pass-1 \
  /absolute/private/path/candidate-pass-2 \
  /absolute/private/path/candidate-pass-1.jsonl \
  /absolute/private/path/candidate-pass-2.jsonl \
  /absolute/private/path/candidate-pilot-report.json

node scripts/benchmark/compare-annotations.mjs \
  /absolute/private/path/candidate-pass-1.jsonl \
  /absolute/private/path/candidate-pass-2.jsonl \
  /absolute/private/path/candidate-disagreements.csv \
  --coverage candidate-pilot --review-mode test-retest
```

The pair checker verifies matching blank packet checksums, static packet
integrity, matching filled CSV/JSONL records, the same pseudonym, plausible
per-case timing, and a seven-day washout. Its report contains per-rule
positive/negative/indeterminate counts and disagreement counts, not accuracy.
The separate disagreement CSV is for human review after pass 2; its pooled
agreement printout must not be interpreted without the per-rule distributions.
Do **not** run the historical `summarize-pilot.mjs`, two-human adjudicator, or
v3 scorer on these labels.

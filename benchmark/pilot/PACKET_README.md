# AgentCI Guard blind annotation pilot

This packet contains six frozen development workflows and 168 blank annotation
units. It measures annotation time and single-annotator test-retest
repeatability. It is not an accuracy benchmark or an inter-rater study.

## Rules

1. Work only from the files in this packet.
2. Do not run AgentCI Guard or search for its predictions.
3. Do not inspect the completed sheet, notes, or results from the other pass.
4. Follow `ANNOTATION_GUIDE.md`, `RULES.md`, and `analysis-model.md`.
5. An AI helper may navigate only if it receives this packet and no scanner
   code, output, or prior-pass context. A human must verify every accepted
   label.
6. Use the frozen workflow under
   `workflows/<case-id>/<original-workflow-path>`. Do not replace it with the
   current upstream file.
7. Use the same stable pseudonym in pass 1 and pass 2. Do not create a second
   identity for the same person.
8. If this is pass 2, begin only after seven full days have elapsed since the
   latest pass-1 completion timestamp.

This packet carries the exact v0.1.1 eight-rule `RULES.md` and
`analysis-model.md` instructions. They match its frozen annotation units, not
the current nine-rule scanner. Use this historical contract for both passes;
do not add the later `gated-ai-write-token` rule or apply later actor-gate and
source-provenance changes to these labels.

The archived `RULES.md` ends with a repository-relative analysis-model link;
in this packet, read the adjacent `analysis-model.md` instead.

The generic guide names repository paths. In this packet, use `RULES.md`,
`annotation-sheet.csv`, `manifest.json`, `analysis-model.md`, and
`workflows/<case-id>/<original-workflow-path>` instead of its repository sheet,
manifest, analysis model, and snapshot paths. There is no independent-review
sheet here; follow this packet's two-pass instructions, not the guide's
two-human workflow.

## Files to fill

- `annotation-sheet.csv`: complete every blank decision, evidence, and
  explanation field.
- `timing-sheet.csv`: use one stable pseudonym on every row and record ISO UTC
  start/end timestamps, active minutes, interruptions, and notes separately for
  each workflow.

For evidence, line numbers such as `12` or `12-18` are sufficient because the
sheet already records the original workflow path.

Return only the two filled CSV files to the study coordinator. Do not add API
keys, account names, email addresses, or other secrets.

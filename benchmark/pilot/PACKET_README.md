# AgentCI Guard blind annotation pilot

This packet contains six frozen development workflows and 168 blank annotation
units. It measures annotation time and protocol agreement. It is not an accuracy
benchmark.

## Rules

1. Work only from the files in this packet.
2. Do not run AgentCI Guard or search for its predictions.
3. Do not inspect another annotator's sheet before both independent passes are
   complete.
4. Follow `ANNOTATION_GUIDE.md`, `RULES.md`, and `analysis-model.md`.
5. AI may help navigate a file, but a human must verify every accepted label.
6. Use the frozen workflow under
   `workflows/<case-id>/<original-workflow-path>`. Do not replace it with the
   current upstream file.

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

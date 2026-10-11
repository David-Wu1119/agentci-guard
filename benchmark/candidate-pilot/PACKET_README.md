# Nine-rule candidate development micro-pilot

This packet contains seven fixed development workflows and 160 blank
structural annotation units. It is a **targeted challenge/feasibility set**,
not a random sample, formal held-out evaluation, or precision/recall estimate.
One source originally marked `eval` in v3 was reclassified as development
after all v3 evaluation cases were inspected during detector tuning. The
coordinator's provenance manifest preserves that history; this annotator
packet uses neutral local case IDs and one neutral stratum.

The packet contains no scanner code, predictions, or case-specific answer key.
Case family is **not** fully hidden: original repository/workflow names can
still reveal it. "Blind" here means no scanner decisions or earlier-pass
answers are available, not blindness to the YAML itself.
Its standalone `CONTRACT.md` is the only rule decision contract for these
nine-rule labels; do not substitute the archived v0.1.1 contract or the
repository's mixed baseline/candidate documents. The contract was prepared
with scanner design context, so it is not independent of the project. The
human annotator must make every label from the frozen YAML and contract.
An AI assistant from a chat that has seen scanner code, predictions, or earlier
answers is **not eligible to navigate or label this packet**.

## Pass 1

1. Open `CONTRACT.md`, `manifest.json`, and the seven YAML files under
   `workflows/<case-id>/`. Do not run AgentCI Guard or inspect its output.
2. Fill every blank decision and explanation cell in `annotation-sheet.csv`.
   Keep prefilled identity/source columns unchanged. Use `indeterminate` when
   the contract requires an unknown; do not guess.
3. Fill `timing-sheet.csv` with the same stable human pseudonym on every row,
   UTC start/end timestamps, active minutes, and interruption minutes. Record
   actual human time, not an AI-generated estimate.
4. Save the entire packet, including `CHECKSUMS.sha256`, and close it. Do not
   reopen its labels or notes during pass 2.

## Pass 2

Wait **at least seven full days after the latest pass-1 completion timestamp**.
Start from a newly exported, byte-identical blank packet and use the **same
human pseudonym**. Do not look at pass-1 labels, explanations, or timing while
filling pass 2. Return both filled CSVs and packet directories to the study
coordinator. Keep imported JSONL and comparison files **outside** the packets.

The source commit, blob SHA, snapshot SHA-256, byte length, and license for
each workflow are in `manifest.json`; `SOURCES.md` provides attribution. The
coordinator-only manifest also retains original case IDs, strata, and split.
`CHECKSUMS.sha256` hashes the original blank packet only, so the
two fresh exports can be compared before pass 2. Filling the CSVs naturally
changes their hashes; do not regenerate the checksum file afterward.

This protocol measures human annotation effort and the sole annotator's
test–retest consistency. Neither a high repeatability number nor agreement
between two AI models establishes correctness. Do not merge these development
labels into formal accuracy results. The coordinator's analysis will report
positive/negative/indeterminate counts and disagreements **per rule**, not
only pooled agreement across the negative-heavy sheet.

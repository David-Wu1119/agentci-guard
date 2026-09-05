# Deviations from PROTOCOL.md

## Run 1 voided — collector applied rule 4 case-insensitively (2026-09-05)

The first collection run (`run1-voided/`) selected four controls whose paths
were `.GitHub/workflows/...` and `.Github/workflows/Ci.yml`. GitHub only
executes workflow files under exactly `.github/workflows/`, so those files are
not workflows the tool's threat model concerns, and the protocol's rule 4
("directly under `.github/workflows/`") excludes them. The collector's
regular expression carried an `i` flag the protocol never granted. The whole
run is voided rather than patched, because re-querying the index can change
the walk order for every group; run 1's search responses, manifest, and
snapshots are kept for audit. No file from run 1 or run 2 was opened by the
developer before the sample closed. The fix is a one-character change in
`collect.mjs` (drop the `i` flag on the path check) and the rule's recorded
reason now says "(case-sensitive)".

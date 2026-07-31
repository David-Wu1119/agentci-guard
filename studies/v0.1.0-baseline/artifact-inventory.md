# Historical 75-Repository Study Artifact Inventory

## Verdict

The historical result is **not reproducible** from the surviving evidence.
Aggregate claims exist, but the data needed to independently regenerate them
does not.

## Surviving evidence

| Artifact                                        | Status  | What it proves                                                                                                 |
| ----------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------- |
| `docs/real-world-findings.md` and `WRITEUP.md`  | Present | The published aggregate numbers and narrative.                                                                 |
| Local Claude session transcript from 2026-06-22 | Present | The GitHub search query, generated scan script, selected inspection commands, and printed aggregate summaries. |
| Git history                                     | Present | Code changes that followed the exploratory scan.                                                               |
| Older repository snapshots                      | Present | Earlier AgentCI Guard source states, but no study corpus or raw report.                                        |

The recovered query was:

```text
gh search code 'anthropics/claude-code-action path:.github/workflows' \
  --limit 100 --json repository,path
```

The recovered script fetched each workflow through the GitHub contents API,
wrote it under `/tmp/wild`, scanned it, and wrote `/tmp/wild_report.json`.

## Missing evidence

- The exact 75 repository and workflow-path list.
- Repository commit SHAs or workflow blob SHAs.
- The fetched workflow files.
- The raw pre-fix and post-fix scanner outputs.
- A durable dependency/environment lock for the study execution.
- A script that validates the published tables from a fixed snapshot.
- Human labels that could support any accuracy claim.

The original files were created under `/tmp` and no surviving copy was found
in the current repository, local historical copies, the project handoff drive,
Claude output folders, shell history, or Git history.

## Consequence

The numbers `75`, `59 → 13`, and the published per-rule totals cannot be
advertised as reproducible research results. They may be retained only with an
explicit historical/non-reproducible warning, or removed. A new benchmark must
use fixed repository commits, committed metadata, immutable snapshots, and
scripts that regenerate every reported table.

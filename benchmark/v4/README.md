# V4 intake gate (not a benchmark yet)

No v4 cases, labels, predictions, or accuracy results are checked in. This
directory only defines a mechanical intake gate for a future repository-disjoint
sample. The seven-case candidate pilot and the human single-annotator formal
protocol must be completed or versioned separately before formal evaluation.

After the human protocol and selection plan are frozen, place a new
`manifest.json` here with `schema_version: 1`,
`benchmark_id: agentci-real-workflows-v4`,
`status: unlabeled`, an ISO UTC `frozen_at` timestamp, `workflow_count`, `repository_count`,
`agent_detection_task`, the nine `rules` and `task_granularity` from the
candidate contract, and these pins:

- `scanner_commit`, `scanner_source_tree`, and `scanner_bundle_sha256` for the
  tested scanner objects;
- `protocol_path` and `protocol_sha256` for the versioned human contract;
- `sampling_plan_path` and `sampling_plan_sha256` for the preregistered search,
  eligibility, exclusion, sample-size, and selection procedure.

Each case needs only `case_id`, `split: eval`, `stratum`, `repository`, `repository_url`,
`source_path`, `source_url`, `source_commit`, `blob_sha`, `sha256`, `bytes`,
`license`, and `snapshot_path`. The snapshot path is exactly
`snapshots/<case_id>/<source_path>` relative to this directory. Select at most
one direct `.github/workflows/*.yml` or `.yaml` file per repository. This gate
requires URL-safe filenames, syntactically pinned GitHub URLs, a nonempty
license identifier other than `NOASSERTION` or `Other`, exact snapshot hashes,
and no repository or identical-byte overlap
with any v1/v2/v3 development corpus. Run:

```bash
node scripts/benchmark/verify-v4-intake.mjs benchmark/v4/manifest.json
```

The checker prints counts only and never runs the scanner. Passing it **does
not** prove that URLs and licenses are authentic, the search frame was complete,
the sample was selected without cherry-picking, cases remained unseen by
developers, the protocol was
preregistered before collection, or labels are accurate. Record independent
selection receipts and chronology before claiming a sealed held-out study. Do
not reuse the v3 scorer: it requires two humans and rejects its old evaluation
split. A v4 registry, one-human review path, scorer, and error analysis remain
future work.

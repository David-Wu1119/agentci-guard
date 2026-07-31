# AgentCI Guard Benchmark Data Card

## Dataset identity

- Name: `agentci-real-workflows-v3`
- Status: frozen, unlabeled
- Size: 152 workflow files from 152 public repositories
- Splits: 57 development, 95 evaluation
- Primary units: 7,056
- Independent-review plan: 5,676 units
- Frozen provenance: `benchmark/manifest.json`
- Record schema: `benchmark/schemas/annotation-record.schema.json`

No accuracy metric has been produced from this dataset.

## Intended use

The dataset is designed to calibrate a narrow static linter:

1. measure reachable AI coding-agent usage detection;
2. measure eight documented GitHub Actions rule predicates;
3. expose false positives, false negatives, and scanner abstentions;
4. reproduce reported metrics from fixed public artifacts.

It is not intended for ecosystem prevalence estimates, repository ranking,
exploit claims, or training a production security classifier.

## Composition

| Stratum                         | Workflows | Selection purpose                                             |
| ------------------------------- | --------: | ------------------------------------------------------------- |
| Claude-Action-enriched          |        60 | Concentrate common AI-agent configurations                    |
| `actions/checkout` control      |        60 | Include ordinary workflows and non-agent lookalikes           |
| Inspected diversity development |        16 | Preserve viewed Codex/Aider/Cursor/OpenHands cases for tuning |
| Unseen diversity evaluation     |        16 | Test the same four families on replacement held-out workflows |

One workflow is retained per repository. Base splits are deterministic from the
recorded seed; v3's leakage correction and replacement IDs are explicit in the
manifest.

The corpus includes safe, risky, mitigated, and potentially indeterminate
cases. Sampling on a product token does not assert that every selected workflow
actually runs an agent; human agent-usage labels make that distinction.

## Sources and collection

All items came from authenticated GitHub code search over public, non-fork
repositories. Collection metadata records the exact query, requested frame
size, deterministic selection seed, repository, source path, source commit,
blob SHA, source URL, SHA-256, byte count, and detected SPDX license.

The base frames searched for:

```text
anthropics/claude-code-action path:.github/workflows
actions/checkout path:.github/workflows
```

Targeted diversity frames searched for exact Codex Action, Aider, Cursor Agent,
and OpenHands tokens. The final control correction required an exact-case direct
child of `.github/workflows` and a literal `actions/checkout` reference.

The checked-in snapshots—not live search results—are the reproducible research
input. Search ranking and public repositories can change over time.

## Version history and sampling corrections

The unlabeled v1 candidate had two defects:

- its enriched stratum lacked agent-family diversity;
- 15 control paths used `.GitHub`, `.Github`, or `.gitHub`, not the canonical
  `.github/workflows` path.

V1 is preserved under `benchmark/archive/agentci-real-workflows-v1/`. V2 added
16 diversity cases and replaced the 15 invalid controls through seeded
selection. Those diversity files were later inspected during classifier
correction, so v2 is preserved under
`benchmark/archive/agentci-real-workflows-v2/`.

V3 moves the 16 inspected cases to development and freezes 16 new
repository-disjoint evaluation replacements using a new deterministic seed.
Their contents were not used for scanner changes. All corrections happened
before human labeling or scanner evaluation.

## Licensing and attribution

Snapshots are included only when the GitHub repository metadata exposed a
nonempty SPDX identifier other than `NOASSERTION` or `Other`. Per-file
attribution, source commit, path, URL, and repository license are recorded in
`benchmark/THIRD_PARTY_NOTICES.md`.

The repository-level SPDX field is a practical inclusion filter, not legal
advice and not proof that every file has identical licensing. A source owner can
request review through the project contact process.

## Privacy and ethics

The corpus contains public workflow YAML and public repository metadata. It
does not collect secret values; expressions such as `${{ secrets.API_KEY }}`
are configuration references, not credential contents.

Findings and labels must not be used to claim a named repository is exploitable.
The benchmark measures scanner predicates. It does not test live workflows,
contact maintainers, execute untrusted code, or attempt exploitation.

## Known limitations

- The corpus is targeted and heavily enriched; prevalence cannot be inferred.
- Claude Action remains the largest AI family.
- Four held-out examples per added family are enough to expose obvious detector
  gaps but too small for strong family-specific percentages.
- Each snapshot contains the selected workflow file, not an entire repository.
  Local scripts and additional reusable workflows can therefore be
  indeterminate.
- GitHub repository permission defaults are not captured by workflow YAML.
- Licensing metadata, platform semantics, and public source availability can
  drift after the frozen commit.
- Human labels can disagree; raw agreement, Cohen's kappa, review coverage, and
  adjudication status must accompany metrics.

## Maintenance and leakage policy

The evaluation split is sealed until adjudication. Rule changes may use only
development data. If evaluation failures influence scanner changes, those cases
become development data and cannot remain an unbiased held-out result.

New data versions must use a new benchmark ID and preserve earlier manifests,
labels, metrics, and error analyses.

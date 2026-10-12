# AgentCI Guard Benchmark Data Card

## Dataset identity

- Name: `agentci-real-workflows-v3`
- Status: frozen, unlabeled, development-only after evaluation leakage
- Size: 152 workflow files from 152 repositories recorded as public at collection
- Historical split designations: 57 development, 95 evaluation; none now held out
- Primary units: 7,056
- Secondary-pass candidate plan: 5,676 units. The current formal tooling still
  encodes it as independent review, but no second human is available.
- Frozen provenance: `benchmark/manifest.json`
- Record schema: `benchmark/schemas/annotation-record.schema.json`

No accuracy metric has been produced from this dataset. The former evaluation
partition was inspected during detector tuning and is development data.

## Intended use

The dataset is now suitable for development and regression analysis of a narrow
static linter:

1. measure reachable AI coding-agent usage detection;
2. inspect eight documented GitHub Actions rule predicates from its original
   registry; the current scanner has a ninth rule absent from this registry;
3. expose false positives, false negatives, and scanner abstentions;
4. reproduce scanner behavior from fixed public artifacts.

It is not intended for ecosystem prevalence estimates, repository ranking,
exploit claims, or training a production security classifier.

## Composition

| Stratum                         | Workflows | Selection purpose                                             |
| ------------------------------- | --------: | ------------------------------------------------------------- |
| Claude-Action-enriched          |        60 | Concentrate common AI-agent configurations                    |
| `actions/checkout` control      |        60 | Include ordinary workflows and non-agent lookalikes           |
| Inspected diversity development |        16 | Preserve viewed Codex/Aider/Cursor/OpenHands cases for tuning |
| Former diversity evaluation     |        16 | Preserve replacement cases; no longer held out after leakage  |

One workflow is retained per repository. Base splits are deterministic from the
recorded seed; v3's leakage correction and replacement IDs are explicit in the
manifest.

The corpus includes safe, risky, mitigated, and potentially indeterminate
cases. Sampling on a product token does not assert that every selected workflow
actually runs an agent; human agent-usage labels make that distinction.

## Sources and collection

The collection records authenticated GitHub code search over public, non-fork
repositories. Collection metadata records the exact query, requested frame
size, deterministic selection seed, repository, source path, source commit,
blob SHA, source URL, SHA-256, byte count, and detected SPDX license.
The [dated upstream audit](REPRODUCIBILITY.md#upstream-origin-check) matched
146 pinned sources and found six HTTP 404s, with no byte mismatches. Those six
snapshots pass local integrity checks, but their recorded upstream origins
could not be independently verified at audit time.

The base frames searched for:

```text
anthropics/claude-code-action path:.github/workflows
actions/checkout path:.github/workflows
```

Targeted diversity frames searched for exact Codex Action, Aider, Cursor Agent,
and OpenHands tokens. The final control correction required an exact-case direct
child of `.github/workflows` and a literal `actions/checkout` reference.

The checked-in snapshots—not live search results—are the reproducible scanner
input. Their hashes support reruns, not proof that every recorded upstream
origin remains fetchable. Search ranking and repository availability can change.

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
Their contents were not used at that freeze. Subsequent detector corrections
used the v3 evaluation partition, so all v3 cases are now development data.

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
- The four former evaluation examples per added family cannot support held-out
  percentages; even a fresh four-case family sample would be too small for
  strong family-specific percentages.
- The annotation registry omits `agentci/gated-ai-write-token` and cannot
  measure all current scanner rules.
- Each snapshot contains the selected workflow file, not an entire repository.
  Local scripts and additional reusable workflows can therefore be
  indeterminate.
- GitHub repository permission defaults are not captured by workflow YAML.
- Licensing metadata, platform semantics, and public source availability can
  drift after the frozen commit.
- Only one human annotator is currently available. The development pilot can
  measure test-retest repeatability after a washout, but it cannot estimate
  inter-rater agreement or remove that person's systematic labeling bias.
- Human decisions can disagree across passes; repeatability, secondary-pass
  coverage, disagreement-resolution provenance, and the single-annotator
  limitation must accompany metrics.

## Maintenance and leakage policy

The v3 evaluation partition is development data. Its `eval` and `all` scoring
paths reject formal runs. Any v4 sample must be repository-disjoint from
development data, sealed before rule tuning, and annotated under a versioned
protocol with all current rules.

New data versions must use a new benchmark ID and preserve earlier manifests,
labels, metrics, and error analyses.

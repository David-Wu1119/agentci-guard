# AgentCI Guard v0.1.0 Baseline

This directory freezes the evidence available before the v0.1.1 calibration
work began. It is a baseline, not a claim that v0.1.0 was accurate.

## Identity

- Baseline working-tree commit: `cdba825972d577fe57579836a48a2fec6708c7c3`
- Published v0.1.0 tag commit: `cbaa29ec0ba46ad2b7db0341fafaaf77f5793c8a`
- Branch used for the follow-up work:
  `feat/v0.1.1-research-prototype`
- Captured: `2026-07-25T02:02:30+08:00`

The baseline commit is five commits after the published v0.1.0 tag. It is the
state that existed when this audit started, so both identities are recorded
instead of pretending they are the same.

## Commands and observed results

Run from the repository root:

| Command                                                           | Exit | Observed result                                                   |
| ----------------------------------------------------------------- | ---: | ----------------------------------------------------------------- |
| `pnpm check`                                                      |    0 | Typecheck passed; 6 test files and 25 tests passed; build passed. |
| `pnpm format:check`                                               |    1 | Six files failed Prettier checking.                               |
| `pnpm audit --prod`                                               |    0 | No known production dependency vulnerabilities.                   |
| `node dist/cli.js scan examples/vulnerable --json --fail-on none` |    0 | 9 findings: 2 critical, 4 high, 3 medium, 0 low.                  |
| `node dist/cli.js scan examples/hardened --json --fail-on none`   |    0 | 0 findings.                                                       |
| `npm pack --dry-run --json`                                       |    0 | Package prepared; 19 files; unpacked size 1,085,910 bytes.        |

The normalized vulnerable and hardened results are in
[`expected-results.json`](expected-results.json).

## Action entrypoint failure

The Action was simulated by setting the declared input environment variables
and invoking the manifest's `main` file:

```text
INPUT_PATH=examples/vulnerable
INPUT_SARIF=<temporary path>/agentci-results.sarif
INPUT_FAIL-ON=none
GITHUB_OUTPUT=<temporary path>/github-output
node dist/cli.js
```

Observed:

```text
exit=1
github_output=
sarif_exists=no
```

`dist/cli.js` printed Commander help because the JavaScript Action runtime does
not support `runs.args`. The manifest therefore did not pass the `scan`
subcommand or any inputs. This is the release-blocking v0.1.0 defect.

## Evidence boundary

The historical 75-repository scan is not reproducible from the surviving
artifacts. The search query and scan script were recovered from a local
transcript, but the raw workflow list, fetched workflow snapshots, repository
commit SHAs, and raw report were temporary files and are absent. See
[`artifact-inventory.md`](artifact-inventory.md).

Until a new fixed corpus is collected and published, the old aggregate numbers
must be described only as a historical, non-reproducible exploratory scan.

# W1 job-level write-token exclusivity: development-benchmark check

Date: 28 October 2026. Corpus: the frozen 152-case development manifest, not
formal v4 and not human-labeled.

| CLI | `dist/cli.js` SHA-256 |
|---|---|
| v0.7.0 (`09a0718`) | `8ae9ccda7955817cf22e19727ab590d37d708ab10166432b5ce006492b3599e3` |
| W1 branch (version string still 0.7.0) | recorded in the PR, since it changes with any later rebuild |

Per-severity counts, the gated and untrusted write-token counts, and complete
scans are identical across both runs: critical 4, high 36, medium 180, gated 0,
untrusted 2, jobs carrying both rules 0, complete scans 46. 0 of 152 cases
differ. The fix changes only jobs that carry both rules, and this corpus has
none. The synthetic case that found W1 is now a regression test in
`tests/gated-write.test.ts` ("reports only the critical rule when an ungated
sibling run: path is on another event").

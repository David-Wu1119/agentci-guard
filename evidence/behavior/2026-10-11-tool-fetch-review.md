# Issue-tool fetch: development-only behavior review

Compare the clean-commit scans of the same 152 frozen v3 snapshots:

```bash
node scripts/benchmark/report-behavior.mjs --compare \
  evidence/behavior/2026-10-11-b3f9680/cases.json \
  evidence/behavior/2026-10-11-0b6ec21/cases.json
```

The second scan ran at commit `0b6ec21` with zero working-tree changes and
`dist/cli.js` SHA-256 `d6a98d3ddf393c290c2bd14aefa450e43baf767ec0d0bc6bc2e2aee356c0bff9`.
All 152 snapshots scanned. Exactly two cases changed, both by gaining
`agentci/analysis-agent-tool-fetch-unknown`: `ai-027` changed from
`analysis_complete=true` to `false`, while `ai-033` was already incomplete
because of an independent event-condition diagnostic. Finding totals did not
change (32 critical, 45 high, 184 medium). These counts are behavioral
regression evidence on development data, not precision, recall, or observed
exploitability.

`ai-033` pins Anthropic Action `787c5a0...`. Its
[workflow](https://github.com/dshakes/lantern/blob/73a6e17c8f3ce81cd3e8fa72dc26f8d95e6de6c1/.github/workflows/sdlc-plan.yml#L5-L46)
passes an Issue number to a static prompt and permits `Bash(gh issue view:*)`.
The pinned [agent-mode implementation](https://github.com/anthropics/claude-code-action/blob/787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251/src/modes/agent/index.ts)
does not automatically append the Issue body; the
[GitHub CLI command](https://cli.github.com/manual/gh_issue_view) can display
it if the agent invokes that tool. A trusted labeler can act on an Issue
authored by someone else. The workflow alone cannot establish whether the
tool ran, whether the external App-token exchange succeeded, or whether the
model accepted any malicious text.

`ai-027` uses floating `@v1`, so its workflow snapshot cannot identify the
exact Action implementation loaded by any historical run. Its explicit
`Bash(gh issue:*)` allowlist, Issue-number prompt, `GH_TOKEN`, and
`allowed_non_write_users: '*'` justify an uncertainty diagnostic, not a
confirmed critical finding. No human labels were added or changed.

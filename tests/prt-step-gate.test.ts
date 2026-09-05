import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { scanWorkflow, type WorkflowFile } from "../src/index.js";

function findings(raw: string) {
  return scanWorkflow(
    { path: ".github/workflows/test.yml", document: YAML.parse(raw), raw },
    ".",
  );
}
const rulesOf = (raw: string) => new Set(findings(raw).map((f) => f.rule_id));

const PRT = "agentci/pull-request-target-ai";
const WRITE = "agentci/untrusted-ai-write-token";
const GATED = "agentci/gated-ai-write-token";
const CHECKOUT = "agentci/unsafe-checkout";

// The documented gate contract (docs/analysis-model.md, "Actor and provenance
// guards") says actor-gated *jobs and steps* do not raise the four
// untrusted-reachability findings, including pull-request-target-ai. At v0.4.0
// the pull_request_target rule consulted only the job-level gate, so an agent
// step guarded by `github.actor == github.repository_owner` was still reported
// as critical. Roadmap Day 2 regression input, reproduced at 5b99fb5.
describe("pull_request_target with an actor gate on the agent step", () => {
  const STEP_GATED = `
on: pull_request_target
permissions:
  contents: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@v1
        if: github.actor == github.repository_owner
        with:
          prompt: Review this pull request
`;

  it("does not report pull-request-target-ai when the only agent step is owner-gated", () => {
    const rules = rulesOf(STEP_GATED);
    expect(rules).not.toContain(PRT);
    expect(rules).not.toContain(WRITE);
    expect(rules).not.toContain(GATED);
    // Hygiene findings are about the job's authority, not who can trigger it.
    expect(rules).toContain("agentci/broad-write-permissions");
    expect(rules).toContain("agentci/unpinned-ai-action");
  });

  it("still reports it when the agent step is unguarded", () => {
    const rules = rulesOf(
      STEP_GATED.replace(
        "        if: github.actor == github.repository_owner\n",
        "",
      ),
    );
    expect(rules).toContain(PRT);
  });

  it("does not report it when the gate is on the job instead", () => {
    const raw = STEP_GATED.replace(
      "        if: github.actor == github.repository_owner\n",
      "",
    ).replace(
      "    runs-on: ubuntu-latest\n",
      "    if: github.actor == github.repository_owner\n    runs-on: ubuntu-latest\n",
    );
    expect(rulesOf(raw)).not.toContain(PRT);
  });

  it("reports it when one agent step is gated and another is not", () => {
    const raw = `
on: pull_request_target
permissions:
  contents: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@v1
        if: github.actor == github.repository_owner
        with:
          prompt: Review this pull request
      - uses: openai/codex-action@v1
        with:
          prompt: Also review
`;
    expect(rulesOf(raw)).toContain(PRT);
  });

  it("reports it when the step condition only widens reachability with ||", () => {
    const raw = STEP_GATED.replace(
      "if: github.actor == github.repository_owner",
      "if: github.actor == github.repository_owner || github.event.action == 'opened'",
    );
    expect(rulesOf(raw)).toContain(PRT);
  });

  it("reports it when the step condition is a runtime output the analyzer cannot prove", () => {
    const raw = STEP_GATED.replace(
      "if: github.actor == github.repository_owner",
      "if: steps.authorize.outputs.allowed == 'true'",
    );
    const result = findings(raw);
    expect(new Set(result.map((f) => f.rule_id))).toContain(PRT);
  });

  it("does not let a gate on the agent suppress an unsafe checkout in an earlier unguarded step", () => {
    const raw = `
on: pull_request_target
permissions:
  contents: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v1
        with:
          ref: \${{ github.event.pull_request.head.sha }}
      - uses: anthropics/claude-code-action@v1
        if: github.actor == github.repository_owner
        with:
          prompt: Review this pull request
`;
    const rules = rulesOf(raw);
    expect(rules).toContain(CHECKOUT);
    expect(rules).not.toContain(PRT);
  });

  it("keeps pull-request-target-ai for a read-only job with an unguarded agent", () => {
    // Read-only token permissions do not remove the finding under the
    // existing contract: pull_request_target exposes base-repository secrets.
    const raw = STEP_GATED.replace("contents: write", "contents: read").replace(
      "        if: github.actor == github.repository_owner\n",
      "",
    );
    expect(rulesOf(raw)).toContain(PRT);
  });
});

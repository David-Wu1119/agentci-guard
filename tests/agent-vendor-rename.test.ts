import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { looksLikeAiAction, scanWorkflow } from "../src/index.js";

function ruleIds(raw: string): Set<string> {
  return new Set(
    scanWorkflow(
      { path: ".github/workflows/test.yml", document: YAML.parse(raw), raw },
      ".",
    ).map((f) => f.rule_id),
  );
}

// Vendors rename. The OpenHands organization moved from All-Hands-AI to
// OpenHands and publishes agents under repositories other than `openhands`,
// so an org/repo pattern pinned to the old names silently stops matching.
// Corpus case openhands-003 (cloudera/cybersec) is exactly this.
describe("agent vendors that renamed their organization", () => {
  it("matches OpenHands actions published outside the legacy org and repo", () => {
    expect(
      looksLikeAiAction("OpenHands/extensions/plugins/pr-review@main"),
    ).toBe(true);
    expect(
      looksLikeAiAction("OpenHands/software-agent-sdk/actions/run@v1"),
    ).toBe(true);
  });

  it("still matches the legacy organization names", () => {
    expect(looksLikeAiAction("All-Hands-AI/openhands@v1")).toBe(true);
    expect(looksLikeAiAction("opendevin/opendevin-action@v1")).toBe(true);
  });

  it("flags the corpus shape: PR-triggered review agent with write scopes", () => {
    const rules = ruleIds(`
on:
  pull_request:
    types: [labeled, review_requested]
permissions:
  contents: read
  pull-requests: write
  issues: write
jobs:
  pr-review:
    if: github.event.label.name == 'review-this'
    runs-on: ubuntu-latest
    steps:
      - uses: OpenHands/extensions/plugins/pr-review@main
        with:
          llm-model: openhands/claude-sonnet-4-5
`);
    expect(rules).toContain("agentci/untrusted-ai-write-token");
  });

  it("does not match a repository merely named after the vendor", () => {
    expect(looksLikeAiAction("actions/checkout@v4")).toBe(false);
    expect(looksLikeAiAction("someuser/openhands-petstore-demo@v1")).toBe(
      false,
    );
  });
});

import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { scanWorkflow, type WorkflowFile } from "../src/index.js";
import { hasAgentGateBypass, isSelfGatingAgentAction } from "../src/detect.js";

function findings(raw: string) {
  return scanWorkflow(
    { path: ".github/workflows/test.yml", document: YAML.parse(raw), raw },
    ".",
  );
}
const rulesOf = (raw: string) => new Set(findings(raw).map((f) => f.rule_id));

const CRITICAL = "agentci/untrusted-ai-write-token";
const GATED = "agentci/gated-ai-write-token";

// anthropics/claude-code-action refuses users without write access by default
// (docs/security.md). When that gate is intact, the untrusted-trigger +
// write-token pattern is reported as high, not critical. Every condition that
// removes the gate, or that the docs do not cover, keeps critical.
const BARE = (extra = "", trigger = "issue_comment:\n    types: [created]") => `
on:
  ${trigger}
permissions:
  contents: write
  issues: write
jobs:
  claude:
    if: contains(github.event.comment.body, '@claude')
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: \${{ secrets.TOKEN }}${extra}
`;

describe("self-gating agent detection", () => {
  it("recognizes the action and excludes the base action", () => {
    expect(isSelfGatingAgentAction("anthropics/claude-code-action@v1")).toBe(
      true,
    );
    expect(
      isSelfGatingAgentAction(
        "anthropics/claude-code-action@abcdef0123456789abcdef0123456789abcdef01",
      ),
    ).toBe(true);
    expect(isSelfGatingAgentAction("Anthropics/Claude-Code-Action@main")).toBe(
      true,
    );
    expect(
      isSelfGatingAgentAction("anthropics/claude-code-base-action@v1"),
    ).toBe(false);
    expect(isSelfGatingAgentAction("openai/codex-action@v1")).toBe(false);
    expect(
      isSelfGatingAgentAction("someone/anthropics/claude-code-action@v1"),
    ).toBe(false);
  });

  it("treats any non-empty allowlist as a bypass, and the documented empty default as none", () => {
    expect(hasAgentGateBypass({ allowed_non_write_users: "*" })).toBe(true);
    expect(hasAgentGateBypass({ allowed_non_write_users: "alice,bob" })).toBe(
      true,
    );
    expect(hasAgentGateBypass({ allowed_bots: "renovate" })).toBe(true);
    expect(hasAgentGateBypass({ allowed_bots: "*" })).toBe(true);
    expect(hasAgentGateBypass({ allowed_non_write_users: "" })).toBe(false);
    expect(hasAgentGateBypass({ allowed_bots: "  " })).toBe(false);
    expect(hasAgentGateBypass({ prompt: "hi" })).toBe(false);
    expect(hasAgentGateBypass(undefined)).toBe(false);
    expect(hasAgentGateBypass("not an object")).toBe(false);
  });
});

describe("gated-ai-write-token (high) versus untrusted-ai-write-token (critical)", () => {
  it("downgrades the bare Anthropic template on issue_comment to high", () => {
    const rules = rulesOf(BARE());
    expect(rules).toContain(GATED);
    expect(rules).not.toContain(CRITICAL);
    const f = findings(BARE()).find((x) => x.rule_id === GATED);
    expect(f?.severity).toBe("high");
    expect(f?.evidence).toMatch(
      /refuses users without repository write access/,
    );
  });

  it("stays critical when allowed_non_write_users is set", () => {
    const rules = rulesOf(BARE("\n          allowed_non_write_users: '*'"));
    expect(rules).toContain(CRITICAL);
    expect(rules).not.toContain(GATED);
  });

  it("stays critical when allowed_bots is set, even to a specific bot", () => {
    const rules = rulesOf(BARE('\n          allowed_bots: "renovate"'));
    expect(rules).toContain(CRITICAL);
    expect(rules).not.toContain(GATED);
  });

  it("treats an explicitly empty allowlist as the default (high)", () => {
    const rules = rulesOf(BARE('\n          allowed_non_write_users: ""'));
    expect(rules).toContain(GATED);
    expect(rules).not.toContain(CRITICAL);
  });

  it("stays critical on pull_request_target regardless of the gate", () => {
    const rules = rulesOf(
      BARE("", "pull_request_target:\n    types: [opened]"),
    );
    expect(rules).toContain(CRITICAL);
    expect(rules).toContain("agentci/pull-request-target-ai");
    expect(rules).not.toContain(GATED);
  });

  it("stays critical on discussion events, which the docs do not list as checked", () => {
    const rules = rulesOf(
      BARE("", "discussion_comment:\n    types: [created]"),
    );
    expect(rules).toContain(CRITICAL);
    expect(rules).not.toContain(GATED);
  });

  it("downgrades on plain pull_request, which the docs do list as checked", () => {
    const rules = rulesOf(`
on: pull_request
permissions:
  pull-requests: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          prompt: "Review \${{ github.event.pull_request.title }}"
`);
    expect(rules).toContain(GATED);
    expect(rules).not.toContain(CRITICAL);
  });

  it("stays critical when untrusted text is expanded into a run: step in the same job", () => {
    const rules = rulesOf(`
on:
  issues:
    types: [opened]
permissions:
  contents: write
jobs:
  fix:
    runs-on: ubuntu-latest
    steps:
      - run: echo "\${{ github.event.issue.title }}" > /tmp/title
      - uses: anthropics/claude-code-action@v1
`);
    expect(rules).toContain(CRITICAL);
    expect(rules).not.toContain(GATED);
  });

  it("stays critical for claude-code-base-action, which performs no actor check", () => {
    const raw = BARE().replace(
      "anthropics/claude-code-action@v1",
      "anthropics/claude-code-base-action@v1",
    );
    const rules = rulesOf(raw);
    expect(rules).toContain(CRITICAL);
    expect(rules).not.toContain(GATED);
  });

  it("stays critical for a non-Anthropic agent whose default is not verified", () => {
    const raw = BARE().replace(
      "anthropics/claude-code-action@v1",
      "OpenHands/extensions/plugins/pr-review@main",
    );
    const rules = rulesOf(raw);
    expect(rules).toContain(CRITICAL);
    expect(rules).not.toContain(GATED);
  });

  it("stays critical when any ingesting step in the job is not the gated action", () => {
    const raw = BARE(
      '\n      - uses: openai/codex-action@v1\n        with:\n          prompt: "\${{ github.event.comment.body }}"',
    );
    const rules = rulesOf(raw);
    expect(rules).toContain(CRITICAL);
    expect(rules).not.toContain(GATED);
  });

  it("emits neither when an actor gate already makes the job unreachable", () => {
    const raw = BARE().replace(
      "if: contains(github.event.comment.body, '@claude')",
      "if: github.event.comment.author_association == 'OWNER'",
    );
    const rules = rulesOf(raw);
    expect(rules).not.toContain(CRITICAL);
    expect(rules).not.toContain(GATED);
  });

  it("does not downgrade the interpolation finding itself", () => {
    // The high-severity prompt-injection finding is about the interpolation
    // and is unaffected by the agent's own gate.
    const rules = rulesOf(
      BARE('\n          prompt: "\${{ github.event.comment.body }}"'),
    );
    expect(rules).toContain("agentci/untrusted-input-in-prompt");
    expect(rules).toContain(GATED);
  });
});

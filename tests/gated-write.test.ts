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
const VERIFIED_TAG_REF = "1d6de8cb0c237e7c15e9e1bdf973826ebae490cc";

// The Action's actor check cannot authenticate a parent Issue written by
// someone else. A direct prompt containing only the triggering comment can
// still receive the high-severity gate reduction.
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
      - uses: anthropics/claude-code-action@${VERIFIED_TAG_REF}
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

  it("requires an explicit token for the non-write-user bypass", () => {
    expect(hasAgentGateBypass({ allowed_non_write_users: "*" })).toBe(false);
    expect(
      hasAgentGateBypass({
        allowed_non_write_users: "alice,bob",
        github_token: "${{ github.token }}",
      }),
    ).toBe(true);
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
  it("uses only events that actually supply the matched prompt source for severity", () => {
    const raw = `
on:
  issue_comment:
    types: [created]
  discussion:
    types: [created]
permissions:
  contents: write
jobs:
  claude:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@${VERIFIED_TAG_REF}
        with:
          prompt: "Reply: \${{ github.event.comment.body }}"
`;
    expect(rulesOf(raw)).toContain(GATED);
    expect(rulesOf(raw)).not.toContain(CRITICAL);
    expect(
      findings(raw).find((finding) => finding.rule_id === GATED)
        ?.reachable_events,
    ).toEqual(["issue_comment"]);
  });

  it("keeps the bare tag-mode template critical for attacker-authored parent issues", () => {
    const rules = rulesOf(BARE());
    expect(rules).toContain(CRITICAL);
    expect(rules).not.toContain(GATED);
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

  it("does not let an empty allowlist sanitize a parent issue", () => {
    const rules = rulesOf(BARE('\n          allowed_non_write_users: ""'));
    expect(rules).toContain(CRITICAL);
    expect(rules).not.toContain(GATED);
  });

  it("stays critical on pull_request_target regardless of the gate", () => {
    const rules = rulesOf(
      BARE(
        "\n          track_progress: true",
        "pull_request_target:\n    types: [opened]",
      ).replace(
        "if: contains(github.event.comment.body, '@claude')",
        "if: github.event.action == 'opened'",
      ),
    );
    expect(rules).toContain(CRITICAL);
    expect(rules).toContain("agentci/pull-request-target-ai");
    expect(rules).not.toContain(GATED);
  });

  it("keeps a potential critical finding for an unverified mutable discussion ref", () => {
    const rules = rulesOf(
      BARE(
        '\n          prompt: "${{ github.event.discussion.body }}"',
        "discussion_comment:\n    types: [created]",
      ).replace(
        `anthropics/claude-code-action@${VERIFIED_TAG_REF}`,
        "anthropics/claude-code-action@v1",
      ),
    );
    expect(rules).toContain(CRITICAL);
    expect(rules).not.toContain(GATED);
  });

  it("downgrades on plain pull_request, which the docs do list as checked", () => {
    const rules = rulesOf(`
on:
  pull_request:
    types: [opened]
permissions:
  pull-requests: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@${VERIFIED_TAG_REF}
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
      - uses: anthropics/claude-code-action@${VERIFIED_TAG_REF}
`);
    expect(rules).toContain(CRITICAL);
    expect(rules).not.toContain(GATED);
  });

  it("stays critical for claude-code-base-action, which performs no actor check", () => {
    const raw = BARE(
      '\n          prompt: "${{ github.event.comment.body }}"',
    ).replace(
      `anthropics/claude-code-action@${VERIFIED_TAG_REF}`,
      "anthropics/claude-code-base-action@beta",
    );
    const rules = rulesOf(raw);
    expect(rules).toContain(CRITICAL);
    expect(rules).not.toContain(GATED);
  });

  it("does not assert implicit ingestion for a non-Anthropic agent without vendor evidence", () => {
    const raw = BARE().replace(
      `anthropics/claude-code-action@${VERIFIED_TAG_REF}`,
      "OpenHands/extensions/plugins/pr-review@main",
    );
    const rules = rulesOf(raw);
    expect(rules).not.toContain(CRITICAL);
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

  it("still reports a parent issue when only the commenter is trusted", () => {
    const raw = BARE().replace(
      "if: contains(github.event.comment.body, '@claude')",
      "if: github.event.comment.author_association == 'OWNER'",
    );
    const rules = rulesOf(raw);
    expect(rules).toContain(CRITICAL);
    expect(rules).not.toContain(GATED);
  });

  it("does not downgrade the interpolation finding itself", () => {
    // The high-severity prompt-injection finding is about the interpolation
    // and is unaffected by the agent's own gate.
    const rules = rulesOf(
      BARE('\n          prompt: "Reply: \${{ github.event.comment.body }}"'),
    );
    expect(rules).toContain("agentci/untrusted-input-in-prompt");
    expect(rules).toContain(GATED);
  });
});

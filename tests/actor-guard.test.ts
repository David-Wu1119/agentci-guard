import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { scanWorkflow, type WorkflowFile } from "../src/index.js";
import {
  hasTrustedActorGate,
  hasTrustedPrProvenanceGate,
} from "../src/workflow-model.js";

function workflow(raw: string): WorkflowFile {
  return { path: ".github/workflows/test.yml", document: YAML.parse(raw), raw };
}

// A write-token finding of either severity proves the job was treated as
// reachable by an untrusted actor; which one fires depends on the agent's own
// gate, which is not what these tests exercise.
const WRITE_TOKEN_RULES = [
  "agentci/untrusted-ai-write-token",
  "agentci/gated-ai-write-token",
];
function hasWriteTokenFinding(rules: Set<string>): boolean {
  return WRITE_TOKEN_RULES.some((rule) => rules.has(rule));
}

function ruleIds(raw: string): Set<string> {
  return new Set(scanWorkflow(workflow(raw), ".").map((f) => f.rule_id));
}

function aiStep(untrusted: string): string {
  return `
      - uses: anthropics/claude-code-action@v1
        with:
          prompt: "Fix: \${{ ${untrusted} }}"
          anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }}`;
}

const ISSUE_STEP = aiStep("github.event.issue.title");
const COMMENT_STEP = aiStep("github.event.comment.body");
const PR_STEP = aiStep("github.event.pull_request.title");

describe("actor and provenance guards preserve input authorship", () => {
  it("does not trust an issue's author merely because the owner labeled it", () => {
    const rules = ruleIds(`
on:
  issues:
    types: [labeled]
permissions:
  contents: write
  pull-requests: write
jobs:
  fix:
    runs-on: ubuntu-latest
    if: github.event.sender.login == github.repository_owner
    steps:${ISSUE_STEP}
`);
    expect(rules).toContain("agentci/untrusted-ai-write-token");
    expect(rules).toContain("agentci/untrusted-input-in-prompt");
    // Permission and pinning hygiene is independent of who can trigger.
    expect(rules).toContain("agentci/broad-write-permissions");
  });

  it("does trust owner-authored content on an opened-only issue event", () => {
    const rules = ruleIds(`
on:
  issues:
    types: [opened]
permissions:
  contents: write
jobs:
  fix:
    if: github.event.sender.login == github.repository_owner
    runs-on: ubuntu-latest
    steps:${ISSUE_STEP}
`);
    expect(hasWriteTokenFinding(rules)).toBe(false);
    expect(rules).not.toContain("agentci/untrusted-input-in-prompt");
  });

  it("does not trust PR title merely because its head is in the same repository", () => {
    const rules = ruleIds(`
on: pull_request
permissions:
  contents: read
  pull-requests: write
jobs:
  review:
    runs-on: ubuntu-latest
    if: github.event.pull_request.head.repo.full_name == github.repository
    steps:${PR_STEP}
`);
    expect(hasWriteTokenFinding(rules)).toBe(true);
    expect(rules).toContain("agentci/untrusted-input-in-prompt");
  });

  it("does not trust a pushed commit message merely because the owner merged it", () => {
    const rules = ruleIds(`
on: push
permissions:
  contents: write
jobs:
  summarize:
    if: github.actor == github.repository_owner
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-base-action@beta
        with:
          prompt: "Summarize \${{ github.event.head_commit.message }}"
`);
    expect(rules).toContain("agentci/untrusted-input-in-prompt");
  });

  it("does not treat a same-repository head condition as an actor gate on pull_request_target", () => {
    const rules = ruleIds(`
on: pull_request_target
permissions:
  contents: write
jobs:
  review:
    runs-on: ubuntu-latest
    if: github.event.pull_request.head.repo.full_name == github.repository
    steps:
      - uses: anthropics/claude-code-base-action@beta
        with:
          prompt: \${{ github.event.pull_request.body }}
`);
    expect(rules).toContain("agentci/pull-request-target-ai");
    expect(rules).toContain("agentci/untrusted-input-in-prompt");
  });

  it("does not attribute a PR head branch name to the owner who opened the PR", () => {
    const rules = ruleIds(`
on:
  pull_request:
    types: [opened]
permissions:
  contents: write
jobs:
  review:
    if: github.event.sender.login == github.repository_owner
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-base-action@beta
        with:
          prompt: \${{ github.event.pull_request.head.ref }}
`);
    expect(rules).toContain("agentci/untrusted-input-in-prompt");
    expect(rules).toContain("agentci/untrusted-ai-write-token");
  });

  it("does not treat a same-repository PR head as proof of commenter identity", () => {
    const rules = ruleIds(`
on: pull_request_review_comment
permissions:
  contents: write
jobs:
  review:
    if: github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-base-action@beta
        with:
          prompt: \${{ github.event.comment.body }}
`);
    expect(rules).toContain("agentci/untrusted-input-in-prompt");
    expect(rules).toContain("agentci/untrusted-ai-write-token");
  });

  it("keeps an owner-labeled PR body untrusted without calling its trigger untrusted", () => {
    const rules = ruleIds(`
on:
  pull_request_target:
    types: [labeled]
permissions:
  contents: write
jobs:
  review:
    if: github.event.sender.login == github.repository_owner
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-base-action@beta
        with:
          prompt: \${{ github.event.pull_request.body }}
`);
    expect(rules).toContain("agentci/untrusted-input-in-prompt");
    expect(rules).toContain("agentci/untrusted-ai-write-token");
    expect(rules).not.toContain("agentci/pull-request-target-ai");
  });

  it("treats an OWNER author_association allowlist as trusted", () => {
    const rules = ruleIds(`
on:
  issue_comment:
    types: [created]
permissions:
  contents: write
jobs:
  respond:
    runs-on: ubuntu-latest
    if: contains(fromJSON('["OWNER"]'), github.event.comment.author_association)
    steps:${COMMENT_STEP}
`);
    expect(hasWriteTokenFinding(rules)).toBe(false);
  });

  it.each(["MEMBER", "COLLABORATOR"])(
    "does not equate %s association with repository write access",
    (association) => {
      const rules = ruleIds(`
on: issue_comment
permissions:
  contents: write
jobs:
  respond:
    if: github.event.comment.author_association == '${association}'
    runs-on: ubuntu-latest
    steps:${COMMENT_STEP}
`);
      expect(rules).toContain("agentci/untrusted-input-in-prompt");
      expect(hasWriteTokenFinding(rules)).toBe(true);
    },
  );

  it.each([
    "github.event.issue.user.login == 'maintainer'",
    "github.event.issue.user.login == github.repository_owner",
    "github.event.issue.author_association == 'OWNER'",
    "contains(fromJSON('[\"OWNER\"]'), github.event.issue.author_association)",
  ])("does not treat the issue author as the issue commenter: %s", (gate) => {
    const rules = ruleIds(`
on: issue_comment
permissions:
  contents: write
jobs:
  respond:
    if: ${gate}
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-base-action@v1
        with:
          prompt: \${{ github.event.comment.body }}
`);
    expect(rules).toContain("agentci/untrusted-input-in-prompt");
    expect(rules).toContain("agentci/untrusted-ai-write-token");
  });

  it.each([
    "github.event.pull_request.user.login == 'maintainer'",
    "github.event.pull_request.author_association == 'OWNER'",
  ])(
    "does not treat the pull request author as a review commenter: %s",
    (gate) => {
      const rules = ruleIds(`
on: pull_request_review_comment
permissions:
  contents: write
jobs:
  respond:
    if: ${gate}
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-base-action@v1
        with:
          prompt: \${{ github.event.comment.body }}
`);
      expect(rules).toContain("agentci/untrusted-input-in-prompt");
      expect(rules).toContain("agentci/untrusted-ai-write-token");
    },
  );

  it.each([
    [
      "issue_comment",
      "github.event.comment.author_association == 'OWNER'",
      "github.event.issue.body",
    ],
    [
      "pull_request_review_comment",
      "github.event.comment.author_association == 'OWNER'",
      "github.event.pull_request.body",
    ],
    [
      "discussion_comment",
      "github.actor == 'maintainer'",
      "github.event.discussion.body",
    ],
  ])(
    "does not sanitize parent content when a trusted %s actor comments",
    (event, gate, source) => {
      const rules = ruleIds(`
on: ${event}
permissions:
  contents: write
jobs:
  respond:
    if: ${gate}
    runs-on: ubuntu-latest
    steps:
      - run: claude -p "\${{ ${source} }}"
`);
      expect(rules).toContain("agentci/untrusted-input-in-prompt");
      expect(rules).toContain("agentci/untrusted-ai-write-token");
    },
  );

  it("still reports an ungated untrusted job", () => {
    const rules = ruleIds(`
on:
  issues:
    types: [opened]
permissions:
  contents: write
  pull-requests: write
jobs:
  fix:
    runs-on: ubuntu-latest
    steps:${ISSUE_STEP}
`);
    expect(hasWriteTokenFinding(rules)).toBe(true);
    expect(rules).toContain("agentci/untrusted-input-in-prompt");
  });

  it("does not trust a fork-inclusive or unrelated condition", () => {
    const rules = ruleIds(`
on: pull_request
permissions:
  contents: write
jobs:
  fix:
    runs-on: ubuntu-latest
    if: github.event.pull_request.draft == false
    steps:${PR_STEP}
`);
    expect(hasWriteTokenFinding(rules)).toBe(true);
  });

  it("does not trust an actor guard that only widens reachability via ||", () => {
    const rules = ruleIds(`
on:
  issue_comment:
    types: [created]
permissions:
  contents: write
jobs:
  fix:
    runs-on: ubuntu-latest
    if: github.event.comment.author_association == 'OWNER' || github.event.comment.body == '/fix'
    steps:${COMMENT_STEP}
`);
    expect(hasWriteTokenFinding(rules)).toBe(true);
  });
});

describe("actor-guard expression parsing edge cases", () => {
  it("ignores boolean operators and parentheses inside quoted strings", () => {
    expect(
      hasTrustedActorGate(
        "github.event.comment.body == 'run && deploy || (skip)' && github.event.sender.login == github.repository_owner",
      ),
    ).toBe(true);
    expect(
      hasTrustedActorGate(
        'github.event.comment.body == "x) || (y" || github.actor == github.repository_owner',
      ),
    ).toBe(false);
  });

  it("strips redundant outer parentheses but not partial ones", () => {
    expect(
      hasTrustedActorGate("((github.actor == github.repository_owner))"),
    ).toBe(true);
    expect(
      hasTrustedActorGate(
        "(github.actor == github.repository_owner) || (github.event.action == 'x')",
      ),
    ).toBe(false);
    expect(
      hasTrustedActorGate(
        "(github.actor == github.repository_owner) && (github.event.action == 'x')",
      ),
    ).toBe(true);
  });

  it("handles the ${{ }} wrapper, odd whitespace, and non-string conditions", () => {
    expect(
      hasTrustedPrProvenanceGate(
        "${{   github.event.pull_request.head.repo.full_name   ==   github.repository   }}",
      ),
    ).toBe(true);
    expect(hasTrustedActorGate(true)).toBe(false);
    expect(hasTrustedActorGate(undefined)).toBe(false);
    expect(hasTrustedActorGate("")).toBe(false);
    expect(hasTrustedActorGate("   ")).toBe(false);
  });

  it("rejects a negated guard and an author_association outside the trusted set", () => {
    expect(
      hasTrustedActorGate("!(github.actor == github.repository_owner)"),
    ).toBe(false);
    expect(
      hasTrustedActorGate(
        "github.event.comment.author_association == 'CONTRIBUTOR'",
      ),
    ).toBe(false);
    expect(
      hasTrustedActorGate(
        'contains(fromJSON(\'["OWNER","CONTRIBUTOR"]\'), github.event.comment.author_association)',
      ),
    ).toBe(false);
    expect(
      hasTrustedActorGate(
        "contains(fromJSON('not json'), github.event.comment.author_association)",
      ),
    ).toBe(false);
  });

  it("accepts the reversed comparison and the negated fork flag", () => {
    expect(hasTrustedActorGate("github.repository_owner == github.actor")).toBe(
      true,
    );
    expect(
      hasTrustedPrProvenanceGate("!github.event.pull_request.head.repo.fork"),
    ).toBe(true);
    expect(
      hasTrustedPrProvenanceGate(
        "github.event.pull_request.head.repo.fork == false",
      ),
    ).toBe(true);
  });
});

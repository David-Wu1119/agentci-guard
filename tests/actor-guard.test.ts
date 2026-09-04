import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { scanWorkflow, type WorkflowFile } from "../src/index.js";
import { hasTrustedActorGate } from "../src/workflow-model.js";

function workflow(raw: string): WorkflowFile {
  return { path: ".github/workflows/test.yml", document: YAML.parse(raw), raw };
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

describe("actor and provenance guards suppress untrusted-reachability findings", () => {
  it("treats a repository-owner guard as trusted (ai-044 pattern)", () => {
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
    expect(rules).not.toContain("agentci/untrusted-ai-write-token");
    expect(rules).not.toContain("agentci/untrusted-input-in-prompt");
    // Permission and pinning hygiene is independent of who can trigger.
    expect(rules).toContain("agentci/broad-write-permissions");
  });

  it("treats a same-repository head guard as trusted (ai-032 pattern)", () => {
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
    expect(rules).not.toContain("agentci/untrusted-ai-write-token");
    expect(rules).not.toContain("agentci/untrusted-input-in-prompt");
  });

  it("treats an author_association allowlist as trusted", () => {
    const rules = ruleIds(`
on:
  issue_comment:
    types: [created]
permissions:
  contents: write
jobs:
  respond:
    runs-on: ubuntu-latest
    if: contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.comment.author_association)
    steps:${COMMENT_STEP}
`);
    expect(rules).not.toContain("agentci/untrusted-ai-write-token");
  });

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
    expect(rules).toContain("agentci/untrusted-ai-write-token");
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
    expect(rules).toContain("agentci/untrusted-ai-write-token");
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
    expect(rules).toContain("agentci/untrusted-ai-write-token");
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
      hasTrustedActorGate(
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
      hasTrustedActorGate("!github.event.pull_request.head.repo.fork"),
    ).toBe(true);
    expect(
      hasTrustedActorGate("github.event.pull_request.head.repo.fork == false"),
    ).toBe(true);
  });
});

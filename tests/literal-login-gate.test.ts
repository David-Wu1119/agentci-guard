import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { scanWorkflow, type WorkflowFile } from "../src/index.js";
import { hasTrustedActorGate } from "../src/workflow-model.js";

function ruleIds(raw: string): Set<string> {
  return new Set(
    scanWorkflow(
      { path: ".github/workflows/test.yml", document: YAML.parse(raw), raw },
      ".",
    ).map((f) => f.rule_id),
  );
}

// A job restricted to a literal login is exactly as sound as one restricted to
// github.repository_owner: GitHub resolves github.actor before the job starts,
// and a stranger cannot be that user. Corpus case ai-015 (marktext, ~61k
// stars) gates its agent on `github.actor == 'Jocs'` and was reported critical.
describe("literal-login actor gates", () => {
  it("recognizes a single literal login on actor and sender", () => {
    expect(hasTrustedActorGate("github.actor == 'Jocs'")).toBe(true);
    expect(hasTrustedActorGate('github.actor == "Jocs"')).toBe(true);
    expect(hasTrustedActorGate("'Jocs' == github.actor")).toBe(true);
    expect(hasTrustedActorGate("github.event.sender.login == 'Jocs'")).toBe(
      true,
    );
    expect(
      hasTrustedActorGate("github.event.comment.user.login == 'maintainer'"),
    ).toBe(true);
    expect(hasTrustedActorGate("github.triggering_actor == 'Jocs'")).toBe(true);
  });

  it("recognizes an allowlist of literal logins via contains(fromJSON(...))", () => {
    expect(
      hasTrustedActorGate(
        'contains(fromJSON(\'["alice","bob"]\'), github.actor)',
      ),
    ).toBe(true);
    expect(
      hasTrustedActorGate(
        "contains(fromJSON('[\"alice\"]'), github.event.comment.user.login)",
      ),
    ).toBe(true);
    // An empty allowlist gates nothing.
    expect(hasTrustedActorGate("contains(fromJSON('[]'), github.actor)")).toBe(
      false,
    );
  });

  it("does not trust inequality, a bot suffix wildcard, or a non-login field", () => {
    expect(hasTrustedActorGate("github.actor != 'dependabot[bot]'")).toBe(
      false,
    );
    expect(hasTrustedActorGate("endsWith(github.actor, '[bot]')")).toBe(false);
    expect(hasTrustedActorGate("github.event.comment.body == 'Jocs'")).toBe(
      false,
    );
    expect(
      hasTrustedActorGate("github.actor == github.event.issue.title"),
    ).toBe(false);
  });

  it("clears the marktext shape: literal login AND a trigger-phrase disjunction", () => {
    const rules = ruleIds(`
on:
  issue_comment:
    types: [created]
  issues:
    types: [opened, assigned]
jobs:
  claude:
    if: |
      github.actor == 'Jocs' &&
      (
        (github.event_name == 'issue_comment' && contains(github.event.comment.body, '@claude')) ||
        (github.event_name == 'issues' && contains(github.event.issue.body, '@claude'))
      )
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
    steps:
      - uses: anthropics/claude-code-action@v1
`);
    expect(rules).not.toContain("agentci/untrusted-ai-write-token");
    expect(rules).not.toContain("agentci/untrusted-input-in-prompt");
    expect(rules).toContain("agentci/broad-write-permissions");
  });

  it("still flags a trigger phrase alone, which anyone can type", () => {
    const rules = ruleIds(`
on:
  issue_comment:
    types: [created]
jobs:
  claude:
    if: contains(github.event.comment.body, '@claude')
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: anthropics/claude-code-action@v1
`);
    expect(rules).toContain("agentci/untrusted-ai-write-token");
  });
});

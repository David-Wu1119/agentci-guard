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

// YAML can identify a username, but cannot prove that account has repository
// write access. A hard-coded login is not equivalent to repository_owner.
describe("literal-login actor conditions", () => {
  it("does not mistake a named login for verified write access", () => {
    expect(hasTrustedActorGate("github.actor == 'Jocs'")).toBe(false);
    expect(hasTrustedActorGate('github.actor == "Jocs"')).toBe(false);
    expect(hasTrustedActorGate("'Jocs' == github.actor")).toBe(false);
    expect(hasTrustedActorGate("github.event.sender.login == 'Jocs'")).toBe(
      false,
    );
    expect(
      hasTrustedActorGate("github.event.comment.user.login == 'maintainer'"),
    ).toBe(false);
    expect(hasTrustedActorGate("github.triggering_actor == 'Jocs'")).toBe(
      false,
    );
  });

  it("does not trust a rerun initiator as the original comment author", () => {
    const rules = ruleIds(`
on: issue_comment
permissions:
  contents: write
jobs:
  respond:
    if: github.triggering_actor == 'maintainer'
    runs-on: ubuntu-latest
    steps:
      - run: claude -p "\${{ github.event.comment.body }}"
`);
    expect(rules).toContain("agentci/untrusted-input-in-prompt");
    expect(rules).toContain("agentci/untrusted-ai-write-token");
  });

  it("does not verify the access role of a literal-login allowlist", () => {
    expect(
      hasTrustedActorGate(
        'contains(fromJSON(\'["alice","bob"]\'), github.actor)',
      ),
    ).toBe(false);
    expect(
      hasTrustedActorGate(
        "contains(fromJSON('[\"alice\"]'), github.event.comment.user.login)",
      ),
    ).toBe(false);
    // An empty allowlist gates nothing.
    expect(hasTrustedActorGate("contains(fromJSON('[]'), github.actor)")).toBe(
      false,
    );
  });

  it("reports a named but unverified commenter reaching a write-capable base Action", () => {
    const rules = ruleIds(`
on: issue_comment
permissions:
  contents: write
jobs:
  respond:
    if: github.actor == 'Jocs'
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-base-action@beta
        with:
          prompt: \${{ github.event.comment.body }}
`);
    expect(rules).toContain("agentci/untrusted-input-in-prompt");
    expect(rules).toContain("agentci/untrusted-ai-write-token");
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

  it("keeps the parent issue untrusted when a trusted login assigns it", () => {
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
    expect(rules).toContain("agentci/untrusted-ai-write-token");
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
    // The action fetches the parent Issue, whose author can differ from the
    // commenter; the action's actor gate cannot sanitize that content.
    expect(rules).toContain("agentci/untrusted-ai-write-token");
  });
});

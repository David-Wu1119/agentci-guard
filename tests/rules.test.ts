import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { scanWorkflow, type WorkflowFile } from "../src/index.js";

const ROOT = "/repo";

/**
 * Parse an inline workflow exactly the way the loader does (YAML 1.2, so the
 * `on:` key stays a string) and run the real scanner against it.
 */
function rulesFor(workflow: string): Set<string> {
  const file: WorkflowFile = {
    path: `${ROOT}/.github/workflows/test.yml`,
    raw: workflow,
    document: YAML.parse(workflow),
  };
  return new Set(scanWorkflow(file, ROOT).map((finding) => finding.rule_id));
}

describe("per-rule detection", () => {
  it("flags an AI agent running on pull_request_target", () => {
    const rules = rulesFor(`
on: pull_request_target
jobs:
  claude:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@v1
`);
    expect(rules).toContain("agentci/pull-request-target-ai");
  });

  it("flags untrusted event content reaching a write-token AI job", () => {
    const rules = rulesFor(`
on: pull_request
permissions:
  contents: write
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - run: claude -p "\${{ github.event.pull_request.body }}"
`);
    expect(rules).toContain("agentci/untrusted-ai-write-token");
  });

  it("flags secrets exposed to an AI job", () => {
    const rules = rulesFor(`
on: push
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - run: claude
        env:
          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
`);
    expect(rules).toContain("agentci/ai-with-secrets");
  });

  it("flags untrusted event content passed into a prompt", () => {
    const rules = rulesFor(`
on: issue_comment
jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - name: respond
        run: claude -p "\${{ github.event.comment.body }}"
`);
    expect(rules).toContain("agentci/untrusted-input-in-prompt");
  });

  it("does not treat a fixed-format pull request SHA as prompt injection text", () => {
    const rules = rulesFor(`
on: pull_request
permissions:
  contents: read
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@0123456789abcdef0123456789abcdef01234567
        with:
          prompt: Review commit \${{ github.event.pull_request.head.sha }}
`);
    expect(rules.has("agentci/untrusted-input-in-prompt")).toBe(false);
  });

  it("does not infer shell access from capability words in prompt prose", () => {
    const rules = rulesFor(`
on: push
permissions:
  contents: read
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@0123456789abcdef0123456789abcdef01234567
        with:
          prompt: Do not enable shell or commands.
`);
    expect(rules.has("agentci/ai-shell-access")).toBe(false);
  });

  it("propagates untrusted workflow environment into an AI step", () => {
    const rules = rulesFor(`
on: issue_comment
permissions:
  issues: write
env:
  AGENT_REQUEST: \${{ github.event.comment.body }}
jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - run: claude -p "$AGENT_REQUEST"
`);
    expect(rules).toContain("agentci/untrusted-input-in-prompt");
    expect(rules).toContain("agentci/untrusted-ai-write-token");
  });

  it("honors a step override of an untrusted workflow environment key", () => {
    const rules = rulesFor(`
on: issue_comment
permissions:
  issues: write
env:
  AGENT_REQUEST: \${{ github.event.comment.body }}
jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - run: claude -p "$AGENT_REQUEST"
        env:
          AGENT_REQUEST: fixed trusted request
`);
    expect(rules.has("agentci/untrusted-input-in-prompt")).toBe(false);
    expect(rules.has("agentci/untrusted-ai-write-token")).toBe(false);
  });

  it("flags shell access combined with AI usage", () => {
    const rules = rulesFor(`
on: push
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - name: Run Claude
        run: claude -p "apply the requested change"
`);
    expect(rules).toContain("agentci/ai-shell-access");
  });

  it("flags broad write permissions near AI usage", () => {
    const rules = rulesFor(`
on: push
permissions:
  contents: write
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - run: claude
`);
    expect(rules).toContain("agentci/broad-write-permissions");
  });

  it("flags an unpinned AI action", () => {
    const rules = rulesFor(`
on: push
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@v1
`);
    expect(rules).toContain("agentci/unpinned-ai-action");
  });

  it("flags unsafe checkout of untrusted PR head", () => {
    const rules = rulesFor(`
on: pull_request_target
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          ref: \${{ github.event.pull_request.head.sha }}
          allow-unsafe-pr-checkout: true
`);
    expect(rules).toContain("agentci/unsafe-checkout");
  });

  it("does not flag a protected floating checkout major", () => {
    const rules = rulesFor(`
on: pull_request_target
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: \${{ github.event.pull_request.head.sha }}
`);
    expect(rules.has("agentci/unsafe-checkout")).toBe(false);
  });
});

describe("no false positives", () => {
  it("does not flag an AI action pinned to a full commit SHA", () => {
    const rules = rulesFor(`
on: push
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@0123456789abcdef0123456789abcdef01234567
`);
    expect(rules.has("agentci/unpinned-ai-action")).toBe(false);
  });

  it("produces no findings for a hardened, AI-free workflow", () => {
    const rules = rulesFor(`
on: push
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@0123456789abcdef0123456789abcdef01234567
      - run: npm test
`);
    expect(rules.size).toBe(0);
  });
});

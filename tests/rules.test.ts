import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { untrustedGitHubContextEvents } from "../src/detect.js";
import {
  scanWorkflow,
  scanWorkflowFiles,
  type WorkflowFile,
} from "../src/index.js";

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

  it("traces a serialized issue-comment payload passed into the agent prompt", () => {
    const rules = rulesFor(`
on:
  issue_comment:
    types: [created]
permissions:
  contents: write
env:
  PAYLOAD: \${{ toJSON(github.event) }}
jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - run: claude -p "$PAYLOAD"
`);
    expect(rules).toContain("agentci/untrusted-input-in-prompt");
    expect(rules).toContain("agentci/untrusted-ai-write-token");
  });

  it("does not generalize serialized event payload matching to push", () => {
    const rules = rulesFor(`
on: push
permissions:
  contents: write
env:
  PAYLOAD: \${{ toJSON(github.event) }}
jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - run: claude -p "$PAYLOAD"
`);
    expect(rules).not.toContain("agentci/untrusted-input-in-prompt");
    expect(rules).not.toContain("agentci/untrusted-ai-write-token");
  });

  it("does not treat unused Action environment JSON as agent task input", () => {
    const rules = rulesFor(`
on:
  issue_comment:
    types: [created]
permissions:
  contents: write
env:
  UNUSED_EVENT_LOG: \${{ toJSON(github.event) }}
jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@1d6de8cb0c237e7c15e9e1bdf973826ebae490cc
        with:
          prompt: Review this issue.
          anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }}
`);
    expect(rules).not.toContain("agentci/untrusted-input-in-prompt");
    expect(rules).not.toContain("agentci/untrusted-ai-write-token");
  });

  it("traces serialized event JSON referenced by an Action prompt", () => {
    const rules = rulesFor(`
on:
  issue_comment:
    types: [created]
permissions:
  contents: write
env:
  PAYLOAD: \${{ toJSON(github.event) }}
jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@1d6de8cb0c237e7c15e9e1bdf973826ebae490cc
        with:
          prompt: \${{ env.PAYLOAD }}
          anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }}
`);
    expect(rules).toContain("agentci/untrusted-input-in-prompt");
    expect(rules).toContain("agentci/untrusted-ai-write-token");
  });

  it("traces a standalone event serialization in an Action prompt", () => {
    const rules = rulesFor(`
on: issue_comment
permissions:
  contents: write
jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@1d6de8cb0c237e7c15e9e1bdf973826ebae490cc
        with:
          prompt: \${{ toJSON(github.event) }}
          anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }}
`);
    expect(rules).toContain("agentci/untrusted-input-in-prompt");
  });

  it("treats a tag-mode Action prompt as agent input", () => {
    const rules = rulesFor(`
on: issue_comment
permissions:
  contents: write
jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@1d6de8cb0c237e7c15e9e1bdf973826ebae490cc
        with:
          prompt: \${{ toJSON(github.event) }}
          track_progress: "true"
          anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }}
`);
    expect(rules).toContain("agentci/untrusted-input-in-prompt");
  });

  it("does not treat an unsupported Action input as prompt text", () => {
    const rules = rulesFor(`
on: issue_comment
permissions:
  contents: write
jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@1d6de8cb0c237e7c15e9e1bdf973826ebae490cc
        with:
          prompt: Review this issue.
          unused_event_log: \${{ toJSON(github.event) }}
          anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }}
`);
    expect(rules).not.toContain("agentci/untrusted-input-in-prompt");
    expect(rules).not.toContain("agentci/untrusted-ai-write-token");
  });

  it("does not claim whole-event prompt ingestion for an unverified Action ref", () => {
    const rules = rulesFor(`
on: issue_comment
permissions:
  contents: write
jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          prompt: \${{ toJSON(github.event) }}
`);
    expect(rules).not.toContain("agentci/untrusted-input-in-prompt");
    expect(rules).not.toContain("agentci/untrusted-ai-write-token");
  });

  it("attributes a prompt finding only to events that supply its input", () => {
    const raw = `
on: [push, issue_comment]
jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - run: claude -p "\${{ github.event.comment.body }}"
`;
    const file: WorkflowFile = {
      path: `${ROOT}/.github/workflows/test.yml`,
      raw,
      document: YAML.parse(raw),
    };
    const prompt = scanWorkflow(file, ROOT).find(
      (finding) => finding.rule_id === "agentci/untrusted-input-in-prompt",
    );

    expect(prompt?.reachable_events).toEqual(["issue_comment"]);
  });

  it("unions only the events matched by multiple prompt inputs", () => {
    const raw = `
on: [push, issue_comment, workflow_dispatch]
jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - run: claude -p "\${{ github.event.comment.body }} \${{ github.event.head_commit.message }}"
`;
    const file: WorkflowFile = {
      path: `${ROOT}/.github/workflows/test.yml`,
      raw,
      document: YAML.parse(raw),
    };
    const prompt = scanWorkflow(file, ROOT).find(
      (finding) => finding.rule_id === "agentci/untrusted-input-in-prompt",
    );

    expect(prompt?.reachable_events).toEqual(["issue_comment", "push"]);
  });

  it("keeps every reachable event for a wildcard prompt source", () => {
    const raw = `
on: [push, issue_comment]
jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - run: claude -p "\${{ github.ref_name }}"
`;
    const file: WorkflowFile = {
      path: `${ROOT}/.github/workflows/test.yml`,
      raw,
      document: YAML.parse(raw),
    };
    const prompt = scanWorkflow(file, ROOT).find(
      (finding) => finding.rule_id === "agentci/untrusted-input-in-prompt",
    );

    expect(prompt?.reachable_events).toEqual(["issue_comment", "push"]);
  });

  it("does not treat a dynamic step name as agent input", () => {
    const rules = rulesFor(`
on: issue_comment
permissions:
  contents: write
jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - name: "Comment: \${{ github.event.comment.body }}"
        run: claude -p 'Review this issue'
`);
    expect(rules).not.toContain("agentci/untrusted-input-in-prompt");
    expect(rules).not.toContain("agentci/untrusted-ai-write-token");
  });

  it("does not treat a literal event-field name as interpolated input", () => {
    const rules = rulesFor(`
on: issues
permissions:
  contents: write
jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - run: codex exec 'Print the literal text github.event.issue.body'
`);
    expect(rules).not.toContain("agentci/untrusted-input-in-prompt");
    expect(rules).not.toContain("agentci/untrusted-ai-write-token");
    expect(rules).toContain("agentci/ai-shell-access");
    expect(rules).toContain("agentci/broad-write-permissions");
  });

  it("ignores quoted field names and delimiters inside expressions", () => {
    expect(
      untrustedGitHubContextEvents("${{ 'github.event.issue.body }}' }}"),
    ).toEqual([]);
    expect(
      untrustedGitHubContextEvents(
        "${{ format('literal }} {0}', github.event.issue.body) }}",
      ),
    ).toContain("issues");
  });

  it("recognizes only the documented review-comment body field", () => {
    expect(
      untrustedGitHubContextEvents("${{ github.event.comment.body }}"),
    ).toContain("pull_request_review_comment");
    expect(
      untrustedGitHubContextEvents("${{ github.event.review_comment.body }}"),
    ).toEqual([]);
  });

  it("does not treat a boolean use of event JSON as agent task text", () => {
    expect(
      untrustedGitHubContextEvents(
        "${{ contains(toJSON(github.event), 'test') }}",
      ),
    ).toEqual([]);
    expect(untrustedGitHubContextEvents("${{ toJSON(steps) }}")).toEqual([]);
    expect(untrustedGitHubContextEvents("${{ github.event_path }}")).toEqual(
      [],
    );
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

  it("stops action capability options at a bare terminator", () => {
    const rules = rulesFor(`
on: push
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@0123456789abcdef0123456789abcdef01234567
        with:
          claude_args: '-- --allowedTools=Bash'
`);
    expect(rules.has("agentci/ai-shell-access")).toBe(false);
  });

  it("keeps explicit Bash allow entries in settings JSON", () => {
    const rules = rulesFor(`
on: push
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@0123456789abcdef0123456789abcdef01234567
        with:
          claude_args: >-
            --allowedTools Read --settings '{"permissions":{"allow":["Bash"]}}'
`);
    expect(rules).toContain("agentci/ai-shell-access");
  });

  it("preserves parent shell detection when settings JSON is malformed", () => {
    const rules = rulesFor(`
on: push
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@0123456789abcdef0123456789abcdef01234567
        with:
          claude_args: >-
            --allowedTools Read --settings '{"permissions":{"allow":["Bash"]}'
`);
    expect(rules).toContain("agentci/ai-shell-access");
  });

  it.each([
    [
      "skip-permissions flag",
      { claude_args: "--dangerously-skip-permissions" },
      true,
    ],
    [
      "flag after terminator",
      { claude_args: "-- --dangerously-skip-permissions" },
      false,
    ],
    ["separate tool input", { allowed_tools: "Bash" }, true],
    ["separate shell input", { allow_shell: true }, true],
    [
      "inline settings",
      { claude_args: `--settings='{"permissions":{"allow":["Bash(git:*)"]}}'` },
      true,
    ],
    [
      "settings after terminator",
      { claude_args: `-- --settings='{"permissions":{"allow":["Bash"]}}'` },
      false,
    ],
    [
      "deny entry",
      {
        claude_args: `--allowedTools Read --settings '{"permissions":{"deny":["Bash"]}}'`,
      },
      false,
    ],
    [
      "non-shell allow entry",
      {
        claude_args: `--allowedTools Read --settings '{"permissions":{"allow":["Read(Bash)"]}}'`,
      },
      false,
    ],
    [
      "malformed settings without allow-list",
      { claude_args: `--settings '{"permissions":{"allow":["Bash"]}'` },
      false,
    ],
    [
      "multiline malformed settings",
      {
        claude_args: `--allowedTools Read\n--settings '{"permissions":{"allow":["Bash"]}'`,
      },
      false,
    ],
  ])(
    "preserves Action capability boundaries: %s",
    (_name, inputs, expected) => {
      const rules = rulesFor(
        YAML.stringify({
          on: "push",
          jobs: {
            review: {
              "runs-on": "ubuntu-latest",
              steps: [
                {
                  uses: "anthropics/claude-code-action@0123456789abcdef0123456789abcdef01234567",
                  with: inputs,
                },
              ],
            },
          },
        }),
      );
      expect(rules.has("agentci/ai-shell-access")).toBe(expected);
    },
  );

  it.each([
    '--allowedTools Read --append-system-prompt "Describe Bash"',
    "--allowedTools Read --disallowedTools Bash",
    '--allowed-tools=Read --append-system-prompt "Describe Shell"',
    '--allowedTools Read --append-system-prompt "--allowedTools=Bash"',
  ])("limits shell capability to allow-list values: %s", (args) => {
    const rules = rulesFor(`
on: push
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@0123456789abcdef0123456789abcdef01234567
        with:
          claude_args: '${args}'
`);
    expect(rules.has("agentci/ai-shell-access")).toBe(false);
  });

  it.each([
    "--allowedTools Bash",
    "--allowedTools=Read,Bash",
    '--allowed-tools "Read Shell(git:*)" --disallowedTools Write',
    "--allowed-tools=Read Bash --append-system-prompt fixed",
  ])("keeps shell capability from real allow-list entries: %s", (args) => {
    const rules = rulesFor(`
on: push
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@0123456789abcdef0123456789abcdef01234567
        with:
          claude_args: '${args}'
`);
    expect(rules).toContain("agentci/ai-shell-access");
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

describe("checkout ref protection", () => {
  function scanCheckout(actionRef: string) {
    const raw = `
on: pull_request_target
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${actionRef}
        with:
          ref: \${{ github.event.pull_request.head.sha }}
`;
    return scanWorkflowFiles(
      [
        {
          path: `${ROOT}/.github/workflows/test.yml`,
          raw,
          document: YAML.parse(raw),
        },
      ],
      ROOT,
      { ignore: [], ignorePaths: [] },
    );
  }

  it.each([
    "v7.custom",
    "v1.custom",
    "v7.1.custom",
    "v7.1.0.custom",
    "v7.1.0.1",
    "v1.1.custom",
    "v2.1.0",
    "0123456789abcdef0123456789abcdef01234567",
  ])("leaves ambiguous or indeterminate checkout refs unknown: %s", (ref) => {
    const result = scanCheckout(ref);
    expect(result.diagnostics.map((item) => item.code)).toContain(
      "agentci/analysis-checkout-protection-unknown",
    );
    expect(result.analysis_complete).toBe(false);
    expect(result.findings.map((item) => item.rule_id)).not.toContain(
      "agentci/unsafe-checkout",
    );
  });

  it.each(["v2", "v3", "v4", "v5", "v6", "v7", "v7.1", "v7.1.0"])(
    "keeps known checkout refs protected: %s",
    (ref) => {
      const result = scanCheckout(ref);
      expect(result.findings).toEqual([]);
      expect(result.diagnostics).toEqual([]);
      expect(result.analysis_complete).toBe(true);
    },
  );

  it.each(["v1", "v1.1", "v1.2.3"])(
    "keeps checkout %s known-unprotected",
    (ref) => {
      const result = scanCheckout(ref);
      expect(result.findings.map((item) => item.rule_id)).toContain(
        "agentci/unsafe-checkout",
      );
      expect(result.diagnostics).toEqual([]);
      expect(result.analysis_complete).toBe(true);
    },
  );
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

import { describe, expect, it } from "vitest";
import YAML from "yaml";
import {
  looksLikeAiUsage,
  scanWorkflow,
  scanWorkflowFiles,
} from "../src/index.js";

function ruleIds(raw: string): Set<string> {
  return new Set(
    scanWorkflow(
      { path: ".github/workflows/test.yml", document: YAML.parse(raw), raw },
      ".",
    ).map((f) => f.rule_id),
  );
}

// Agents are also driven straight over HTTP, with no action and no local
// binary: the workflow curls a hosted agent endpoint. Held-out corpus cases
// holdout-cursor-003 and holdout-cursor-004 both take this shape.
describe("agents invoked over an HTTP API", () => {
  it("recognizes a hosted agent endpoint as agent usage", () => {
    const rules = ruleIds(`
on:
  issues:
    types: [opened]
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl --url https://api.cursor.com/v1/agents \\
            -H "Authorization: Bearer \${{ secrets.CURSOR_API_KEY }}" \\
            -d "{\\"prompt\\": \\"triage\\"}"
`);
    expect(rules).toContain("agentci/ai-with-secrets");
    expect(rules).not.toContain("agentci/ai-shell-access");
  });

  it("does not count status polling as a new agent invocation", () => {
    const rules = ruleIds(`
on: push
jobs:
  poll:
    runs-on: ubuntu-latest
    steps:
      - run: curl -X GET https://api.cursor.com/v1/agents/abc123
`);
    expect(rules.size).toBe(0);
    expect(
      looksLikeAiUsage("curl -X GET https://api.cursor.com/v1/agents"),
    ).toBe(false);
  });

  it("requires a command rather than a quoted endpoint mention", () => {
    expect(
      looksLikeAiUsage("echo 'curl -X POST https://api.cursor.com/v1/agents'"),
    ).toBe(false);
  });

  it("uses documented create routes and methods", () => {
    for (const request of [
      "curl -X POST https://api.cursor.com/v1/agents",
      "curl -X POST https://api.cursor.com/v1/agents/agent-1/runs",
      "curl -X POST https://api.cursor.com/v0/agents",
      "curl --request POST https://api.devin.ai/v1/sessions",
      'curl --request="POST" https://api.cursor.com/v1/agents',
      'curl -d\'{"prompt":"hi"}\' https://api.cursor.com/v1/agents',
      "curl -d '{}' https://api.devin.ai/v3/organizations/org-1/sessions",
      "curl -X POST https://api.github.com/agents/repos/owner/repo/tasks",
      "curl -X POST -i https://api.cursor.com/v1/agents",
      "curl -X POST --include --http1.1 https://api.cursor.com/v1/agents",
    ]) {
      expect(looksLikeAiUsage(request), request).toBe(true);
    }
    for (const request of [
      "curl -X GET https://api.cursor.com/v1/agents",
      "curl -G -d status=active https://api.cursor.com/v1/agents",
      "curl -X GET -d '{}' https://api.cursor.com/v1/agents",
      "curl -X GET https://api.devin.ai/v1/sessions",
      "curl -X GET https://api.devin.ai/v3/organizations/org-1/sessions",
      "curl -X GET https://api.github.com/agents/repos/owner/repo/tasks",
      "curl -X POST https://api.githubcopilot.com/v1/agents",
      "curl -X POST https://api.cursor.com/v1/agents/agent-1",
    ]) {
      expect(looksLikeAiUsage(request), request).toBe(false);
    }
  });

  it("does not let a prior GET hide a later POST command", () => {
    expect(
      looksLikeAiUsage(
        "curl -X GET https://api.cursor.com/v1/agents; curl -X POST https://api.cursor.com/v1/agents",
      ),
    ).toBe(true);
  });

  it("tracks hosted-agent dispatch through literal shell branches", () => {
    const scanRun = (run: string) => {
      const raw = YAML.stringify({
        on: "issues",
        permissions: { issues: "write" },
        jobs: {
          review: {
            "runs-on": "ubuntu-latest",
            steps: [{ run }],
          },
        },
      });
      return scanWorkflowFiles(
        [
          {
            path: ".github/workflows/test.yml",
            document: YAML.parse(raw),
            raw,
          },
        ],
        ".",
        { ignore: [], ignorePaths: [] },
      );
    };
    const dispatch =
      'curl -X POST https://api.cursor.com/v1/agents -d "\${{ github.event.issue.body }}"';
    for (const run of [
      "if true; then " + dispatch + "; fi",
      "if false; then :; else " + dispatch + "; fi",
      "for item in one; do " + dispatch + "; done",
      "time " + dispatch,
      "time -p " + dispatch,
      "X=1 " + dispatch,
      "env CI=1 " + dispatch,
    ]) {
      const result = scanRun(run);
      expect(result.agent_usages[0]?.kind).toBe("http");
      expect(result.findings.map((item) => item.rule_id)).toContain(
        "agentci/untrusted-input-in-prompt",
      );
      expect(result.diagnostics.map((item) => item.code)).not.toContain(
        "agentci/analysis-shell-control-flow-unknown",
      );
    }
    for (const run of [
      "# if true; then " + dispatch + "; fi",
      "if false; then " + dispatch + "; fi",
      "then " + dispatch,
    ]) {
      const result = scanRun(run);
      expect(result.agent_usages).toEqual([]);
      expect(result.findings).toEqual([]);
    }
    const uncertain = scanRun(
      'if test "$RUN_AGENT" = yes; then ' + dispatch + "; fi",
    );
    expect(uncertain.diagnostics.map((item) => item.code)).toContain(
      "agentci/analysis-shell-control-flow-unknown",
    );
    expect(uncertain.analysis_complete).toBe(false);

    expect(
      scanRun("if false || true; then " + dispatch + "; fi").agent_usages,
    ).toHaveLength(1);
    for (const run of [
      "if true && false; then " + dispatch + "; fi",
      "for item in ; do " + dispatch + "; done",
      "create_agent() { " + dispatch + "; }",
      "function create_agent { " + dispatch + "; }",
      "create_agent() { :; { :; }; " + dispatch + "; }",
      "false && " + dispatch,
      "true || " + dispatch,
      "if false && " + dispatch + "; then :; fi",
      "if true || " + dispatch + "; then :; fi",
      "! true && " + dispatch,
      "! false || " + dispatch,
    ]) {
      expect(scanRun(run).agent_usages).toEqual([]);
    }
    for (const run of [
      "create_agent() { " + dispatch + "; }",
      "create_agent() { " + dispatch + "; }; create_agent",
      "function create_agent { " + dispatch + "; }; create_agent",
      "create_agent() { :; { :; }; " + dispatch + "; }; create_agent",
      "create_agent() { bash -c '" + dispatch + "'; }; create_agent",
    ]) {
      const result = scanRun(run);
      expect(result.analysis_complete).toBe(false);
      expect(result.diagnostics.map((item) => item.code)).toContain(
        "agentci/analysis-run-dataflow-unknown",
      );
    }
    for (const run of [
      'if test "$X" && ' + dispatch + "; then :; fi",
      "echo maybe && " + dispatch,
      "if true | false; then " + dispatch + "; fi",
      "if false | true; then " + dispatch + "; fi",
      "while false | true; do " + dispatch + "; done",
      "case x in y) " + dispatch + ";; esac",
      "case x in x) :;; y) " + dispatch + ";; esac",
      "exit 0; " + dispatch,
      "if true; then exit 0; " + dispatch + "; fi",
      "for item in one; do break; " + dispatch + "; done",
      "select item in one; do " + dispatch + "; break; done",
      "false && (" + dispatch + ")",
      "true || (" + dispatch + ")",
    ]) {
      const result = scanRun(run);
      expect(result.agent_usages).toHaveLength(1);
      expect(result.analysis_complete).toBe(false);
      expect(result.diagnostics.map((item) => item.code)).toContain(
        "agentci/analysis-shell-control-flow-unknown",
      );
    }
    for (const run of ["! false && " + dispatch, "! true || " + dispatch]) {
      const result = scanRun(run);
      expect(result.agent_usages).toHaveLength(1);
      expect(result.diagnostics.map((item) => item.code)).not.toContain(
        "agentci/analysis-shell-control-flow-unknown",
      );
    }
    for (const run of [`result=$(${dispatch})`, `echo "$(${dispatch})"`]) {
      const result = scanRun(run);
      expect(result.analysis_complete).toBe(false);
      expect(result.diagnostics.map((item) => item.code)).toContain(
        "agentci/analysis-run-dataflow-unknown",
      );
    }
    const nestedShell = scanRun(`bash -c '${dispatch}'`);
    expect(nestedShell.agent_usages).toEqual([]);
    expect(nestedShell.analysis_complete).toBe(false);
    expect(nestedShell.diagnostics.map((item) => item.code)).toContain(
      "agentci/analysis-run-dataflow-unknown",
    );
    const nestedSubstitution = scanRun(`result=$(bash -c '${dispatch}')`);
    expect(nestedSubstitution.agent_usages).toEqual([]);
    expect(nestedSubstitution.analysis_complete).toBe(false);
    expect(nestedSubstitution.diagnostics.map((item) => item.code)).toContain(
      "agentci/analysis-run-dataflow-unknown",
    );
  });

  it("does not treat an endpoint in a request body or heredoc as dispatch", () => {
    expect(
      looksLikeAiUsage(
        `curl -X POST https://example.com -d '{"link":"https://api.cursor.com/v1/agents"}'`,
      ),
    ).toBe(false);
    expect(
      looksLikeAiUsage(
        "cat <<'EOF'\ncurl -X POST https://api.cursor.com/v1/agents\nEOF",
      ),
    ).toBe(false);
    expect(
      looksLikeAiUsage(
        "curl -X POST https://example.com # https://api.cursor.com/v1/agents",
      ),
    ).toBe(false);
    expect(
      looksLikeAiUsage(
        "curl -X POST https://example.com --referer https://api.cursor.com/v1/agents",
      ),
    ).toBe(false);
    expect(
      looksLikeAiUsage(
        "curl -X POST -e https://api.cursor.com/v1/agents https://example.com",
      ),
    ).toBe(false);
  });

  it("recognizes an explicit POST without a request body", () => {
    const raw = `
on: push
jobs:
  dispatch:
    runs-on: ubuntu-latest
    steps:
      - run: curl -X POST --url https://api.cursor.com/v1/agents
`;
    const rules = ruleIds(raw);
    expect(rules).not.toContain("agentci/ai-shell-access");
    const result = scanWorkflowFiles(
      [{ path: ".github/workflows/test.yml", document: YAML.parse(raw), raw }],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(result.agent_usages).toHaveLength(1);
    expect(result.agent_usages[0]?.kind).toBe("http");
  });

  it("reports payload ingestion without assigning the runner token to the remote agent", () => {
    const raw = `
on:
  issues:
    types: [opened]
permissions:
  contents: write
  issues: write
jobs:
  fix:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl https://api.cursor.com/v1/agents \\
            -H "Authorization: Bearer \${{ secrets.CURSOR_API_KEY }}" \\
            -d "{\\"prompt\\":\\"\${{ github.event.issue.body }}\\"}"
`;
    const result = scanWorkflowFiles(
      [{ path: ".github/workflows/test.yml", document: YAML.parse(raw), raw }],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    const rules = new Set(result.findings.map((finding) => finding.rule_id));
    expect(rules).not.toContain("agentci/untrusted-ai-write-token");
    expect(rules).toContain("agentci/untrusted-input-in-prompt");
    expect(rules).toContain("agentci/broad-write-permissions");
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "agentci/analysis-remote-agent-capability-unknown",
    );
  });

  it("does not attribute text in another command to the HTTP agent", () => {
    const raw = `
on:
  issues:
    types: [opened]
permissions:
  contents: write
jobs:
  fix:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -X POST https://api.cursor.com/v1/agents -d '{"prompt":"safe"}'
          echo "\${{ github.event.issue.body }}"
`;
    const result = scanWorkflowFiles(
      [{ path: ".github/workflows/test.yml", document: YAML.parse(raw), raw }],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    const rules = result.findings.map((finding) => finding.rule_id);
    expect(rules).not.toContain("agentci/untrusted-input-in-prompt");
    expect(rules).not.toContain("agentci/untrusted-ai-write-token");
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "agentci/analysis-run-dataflow-unknown",
    );
  });

  it("does not attribute a secret printed by another command to the HTTP agent", () => {
    const raw = `
on: push
permissions:
  contents: read
jobs:
  fix:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -X POST https://api.cursor.com/v1/agents -d '{"prompt":"safe"}'
          echo "\${{ secrets.BOT_TOKEN }}"
`;
    const result = scanWorkflowFiles(
      [{ path: ".github/workflows/test.yml", document: YAML.parse(raw), raw }],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(result.findings.map((finding) => finding.rule_id)).not.toContain(
      "agentci/ai-with-secrets",
    );
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "agentci/analysis-run-dataflow-unknown",
    );
  });

  it("does not attribute a secret in a shell comment to the HTTP agent", () => {
    const rules = ruleIds(`
on: push
jobs:
  fix:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -X POST https://api.cursor.com/v1/agents -d '{}' # \${{ secrets.BOT_TOKEN }}
`);
    expect(rules).not.toContain("agentci/ai-with-secrets");
  });

  it("does not attribute an unused workflow env value to a fixed HTTP payload", () => {
    const raw = `
on:
  issues:
    types: [opened]
permissions:
  contents: write
env:
  BODY: \${{ github.event.issue.body }}
jobs:
  fix:
    runs-on: ubuntu-latest
    steps:
      - run: curl -X POST https://api.cursor.com/v1/agents -d '{"prompt":"safe"}'
`;
    const result = scanWorkflowFiles(
      [{ path: ".github/workflows/test.yml", document: YAML.parse(raw), raw }],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    const rules = result.findings.map((finding) => finding.rule_id);
    expect(rules).not.toContain("agentci/untrusted-input-in-prompt");
    expect(rules).not.toContain("agentci/untrusted-ai-write-token");
  });

  it("follows a referenced env value into the HTTP request body", () => {
    const raw = `
on:
  issues:
    types: [opened]
permissions:
  contents: write
env:
  BODY: \${{ github.event.issue.body }}
jobs:
  fix:
    runs-on: ubuntu-latest
    steps:
      - run: curl -X POST https://api.cursor.com/v1/agents -d "$BODY"
`;
    const result = scanWorkflowFiles(
      [{ path: ".github/workflows/test.yml", document: YAML.parse(raw), raw }],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    const rules = result.findings.map((finding) => finding.rule_id);
    expect(rules).toContain("agentci/untrusted-input-in-prompt");
    expect(rules).not.toContain("agentci/untrusted-ai-write-token");
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "agentci/analysis-remote-agent-capability-unknown",
    );
  });

  it("does not expand shell variables inside single-quoted HTTP data", () => {
    const rules = ruleIds(`
on:
  issues:
    types: [opened]
permissions:
  contents: write
env:
  BODY: \${{ github.event.issue.body }}
jobs:
  fix:
    runs-on: ubuntu-latest
    steps:
      - run: curl -X POST https://api.cursor.com/v1/agents -d '$BODY'
`);
    expect(rules).not.toContain("agentci/untrusted-input-in-prompt");
  });

  it("tracks an expandable variable inside mixed-quoted JSON data", () => {
    const raw = `
on:
  issues:
    types: [opened]
permissions:
  contents: write
env:
  BODY: \${{ github.event.issue.body }}
jobs:
  fix:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -X POST https://api.cursor.com/v1/agents -d '{"prompt":"'"$BODY"'"}'
`;
    const result = scanWorkflowFiles(
      [{ path: ".github/workflows/test.yml", document: YAML.parse(raw), raw }],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(result.findings.map((finding) => finding.rule_id)).toContain(
      "agentci/untrusted-input-in-prompt",
    );
  });

  it("does not expand an escaped dollar sign in HTTP data", () => {
    const rules = ruleIds(`
on:
  issues:
    types: [opened]
env:
  BODY: \${{ github.event.issue.body }}
jobs:
  fix:
    runs-on: ubuntu-latest
    steps:
      - run: curl -X POST https://api.cursor.com/v1/agents -d "\\$BODY"
`);
    expect(rules).not.toContain("agentci/untrusted-input-in-prompt");
  });

  it("traces a GitHub env index expression in HTTP data", () => {
    const rules = ruleIds(`
on:
  issues:
    types: [opened]
env:
  BODY: \${{ github.event.issue.body }}
jobs:
  fix:
    runs-on: ubuntu-latest
    steps:
      - run: curl -X POST https://api.cursor.com/v1/agents -d "\${{ env['BODY'] }}"
`);
    expect(rules).toContain("agentci/untrusted-input-in-prompt");
  });

  it("abstains when a shell-local variable supplies the HTTP body", () => {
    const raw = `
on:
  issues:
    types: [opened]
env:
  BODY: \${{ github.event.issue.body }}
jobs:
  fix:
    runs-on: ubuntu-latest
    steps:
      - run: |
          PROMPT="$BODY"
          curl -X POST https://api.cursor.com/v1/agents -d "$PROMPT"
`;
    const result = scanWorkflowFiles(
      [{ path: ".github/workflows/test.yml", document: YAML.parse(raw), raw }],
      ".",
      { ignore: [], ignorePaths: [] },
    );
    expect(result.findings.map((finding) => finding.rule_id)).not.toContain(
      "agentci/untrusted-input-in-prompt",
    );
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "agentci/analysis-run-dataflow-unknown",
    );
  });

  it("counts a secret env value only when the HTTP command uses it", () => {
    const raw = (header: string) => `
on: push
permissions:
  contents: read
env:
  API_KEY: \${{ secrets.CURSOR_API_KEY }}
jobs:
  fix:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -X POST https://api.cursor.com/v1/agents ${header} -d '{"prompt":"safe"}'
`;
    expect(ruleIds(raw("")).has("agentci/ai-with-secrets")).toBe(false);
    expect(
      ruleIds(raw('-H "Authorization: Bearer $API_KEY"')).has(
        "agentci/ai-with-secrets",
      ),
    ).toBe(true);
  });

  it("does not presume ingestion without interpolation, as with any CLI", () => {
    const rules = ruleIds(`
on:
  issues:
    types: [opened]
permissions:
  contents: write
jobs:
  nightly:
    runs-on: ubuntu-latest
    steps:
      - run: curl https://api.openai.com/v1/responses -d '{"input":"summarize the README"}'
`);
    expect(rules).not.toContain("agentci/untrusted-ai-write-token");
  });

  it("respects an actor gate", () => {
    const rules = ruleIds(`
on:
  issue_comment:
    types: [created]
permissions:
  contents: write
jobs:
  fix:
    if: github.event.comment.author_association == 'OWNER'
    runs-on: ubuntu-latest
    steps:
      - run: curl https://api.cursor.com/v1/agents -d "\${{ github.event.comment.body }}"
`);
    expect(rules).not.toContain("agentci/untrusted-ai-write-token");
  });

  it("does not treat prose or documentation mentions as agent usage", () => {
    const rules = ruleIds(`
on: push
jobs:
  docs:
    runs-on: ubuntu-latest
    steps:
      # See api.anthropic.com for rate limits, and api.cursor.com for agents.
      - run: echo "our docs describe api.openai.com and api.cursor.com endpoints"
`);
    expect(rules.size).toBe(0);
  });

  it("does not treat an unrelated API host as an agent", () => {
    const rules = ruleIds(`
on:
  issues:
    types: [opened]
permissions:
  contents: write
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: curl https://api.github.com/repos/\${{ github.repository }}/issues
`);
    expect(rules.size).toBe(0);
  });

  it("does not treat a plain inference call as an agent", () => {
    const rules = ruleIds(`
on:
  issues:
    types: [opened]
permissions:
  contents: write
  issues: write
jobs:
  classify:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl https://api.anthropic.com/v1/messages \\
            -H "x-api-key: \${{ secrets.ANTHROPIC_API_KEY }}" \\
            -d "{\\"content\\":\\"\${{ github.event.issue.body }}\\"}"
`);
    // Injected text can corrupt the response, but the call holds no tools with
    // which to reach the repository. Inference is not agency.
    expect(rules.size).toBe(0);
  });
});

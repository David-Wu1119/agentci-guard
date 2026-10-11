import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { looksLikeAiUsage } from "../src/detect.js";
import { scanWorkflowFiles } from "../src/index.js";

function scan(run: string, environment = "") {
  const raw = `
on: issues
permissions:
  contents: write
${environment}jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - run: |
${run
  .trimEnd()
  .split("\n")
  .map((line) => `          ${line}`)
  .join("\n")}
`;
  return scanWorkflowFiles(
    [{ path: ".github/workflows/test.yml", document: YAML.parse(raw), raw }],
    ".",
    { ignore: [], ignorePaths: [] },
  );
}

function rules(result: ReturnType<typeof scan>) {
  return result.findings.map((finding) => finding.rule_id);
}

describe("local CLI run-step input flow", () => {
  it("does not attribute a sibling echo to a fixed CLI prompt", () => {
    const result = scan(
      `claude -p fixed\necho "\${{ github.event.issue.body }}"`,
    );
    expect(rules(result)).not.toContain("agentci/untrusted-input-in-prompt");
    expect(rules(result)).not.toContain("agentci/untrusted-ai-write-token");
    expect(rules(result)).toContain("agentci/ai-shell-access");
    expect(result.analysis_complete).toBe(true);
  });

  it("keeps && and || sibling commands separate from CLI input", () => {
    for (const separator of ["&&", "||"]) {
      const result = scan(
        `claude -p fixed ${separator} echo "\${{ github.event.issue.body }}"`,
      );
      expect(rules(result)).not.toContain("agentci/untrusted-input-in-prompt");
      expect(rules(result)).not.toContain("agentci/untrusted-ai-write-token");
      expect(result.analysis_complete).toBe(true);
    }
  });

  it("does not assert prompt input from an unused inherited environment value", () => {
    const result = scan(
      "claude -p fixed",
      "env:\n  REQUEST: \${{ github.event.issue.body }}\n",
    );
    expect(rules(result)).not.toContain("agentci/untrusted-input-in-prompt");
    expect(rules(result)).not.toContain("agentci/untrusted-ai-write-token");
    expect(result.diagnostics.map((item) => item.code)).toContain(
      "agentci/analysis-run-dataflow-unknown",
    );
    expect(result.analysis_complete).toBe(false);
  });

  it("traces a referenced environment value but not a single-quoted variable", () => {
    const environment = "env:\n  REQUEST: \${{ github.event.issue.body }}\n";
    const expanded = scan('claude -p "$REQUEST"', environment);
    expect(rules(expanded)).toContain("agentci/untrusted-input-in-prompt");
    expect(rules(expanded)).toContain("agentci/untrusted-ai-write-token");
    const literal = scan("claude -p '$REQUEST'", environment);
    expect(rules(literal)).not.toContain("agentci/untrusted-input-in-prompt");
    expect(rules(literal)).not.toContain("agentci/untrusted-ai-write-token");
    expect(literal.diagnostics.map((item) => item.code)).toContain(
      "agentci/analysis-run-dataflow-unknown",
    );
  });

  it("keeps direct CLI arguments as proven input, including quoted separators", () => {
    const result = scan(
      'claude -p "review; \${{ github.event.issue.body }}"\necho unrelated',
    );
    expect(rules(result)).toContain("agentci/untrusted-input-in-prompt");
    expect(rules(result)).toContain("agentci/untrusted-ai-write-token");
  });

  it("keeps punctuation inside a GitHub expression in the same CLI input", () => {
    for (const run of [
      "claude -p \${{ format('review; {0}', github.event.issue.body) }}",
      "claude -p \${{ format('review }}; {0}', github.event.issue.body) }}",
    ]) {
      const result = scan(run);
      expect(rules(result)).toContain("agentci/untrusted-input-in-prompt");
      expect(rules(result)).toContain("agentci/untrusted-ai-write-token");
    }
  });

  it("does not mistake a quoted greater-than sign in a prompt for redirection", () => {
    const result = scan('claude -p ">\${{ github.event.issue.body }}"');
    expect(rules(result)).toContain("agentci/untrusted-input-in-prompt");
    expect(rules(result)).toContain("agentci/untrusted-ai-write-token");
  });

  it("marks an earlier shell assignment read by the CLI as unresolved", () => {
    const result = scan(
      'REQUEST="\${{ github.event.issue.body }}"\nclaude -p "$REQUEST"',
    );
    expect(rules(result)).not.toContain("agentci/untrusted-input-in-prompt");
    expect(rules(result)).not.toContain("agentci/untrusted-ai-write-token");
    expect(result.diagnostics.map((item) => item.code)).toContain(
      "agentci/analysis-run-dataflow-unknown",
    );
  });

  it("marks piped input as unresolved instead of inventing a prompt finding", () => {
    for (const run of [
      'printf "%s" "\${{ github.event.issue.body }}" | claude -p -',
      'printf "%s" "\${{ github.event.issue.body }}" |& claude -p -',
      'printf "%s" "\${{ github.event.issue.body }}" 2>&1 | claude -p -',
    ]) {
      const result = scan(run);
      expect(rules(result)).not.toContain("agentci/untrusted-input-in-prompt");
      expect(rules(result)).not.toContain("agentci/untrusted-ai-write-token");
      expect(result.diagnostics.map((item) => item.code)).toContain(
        "agentci/analysis-run-dataflow-unknown",
      );
    }
  });

  it("does not treat an output-redirection path as an agent argument", () => {
    const result = scan('claude -p fixed > "\${{ github.event.issue.body }}"');
    expect(rules(result)).not.toContain("agentci/untrusted-input-in-prompt");
    expect(rules(result)).not.toContain("agentci/untrusted-ai-write-token");
    expect(result.diagnostics.map((item) => item.code)).toContain(
      "agentci/analysis-run-dataflow-unknown",
    );
  });

  it("does not treat an adjacent output-redirection path as a CLI argument", () => {
    const result = scan("claude -p fixed>\${{ github.event.issue.body }}");
    expect(rules(result)).not.toContain("agentci/untrusted-input-in-prompt");
    expect(rules(result)).not.toContain("agentci/untrusted-ai-write-token");
    expect(result.diagnostics.map((item) => item.code)).toContain(
      "agentci/analysis-run-dataflow-unknown",
    );
  });

  it("marks potential CLI arguments after redirection incomplete", () => {
    const result = scan(
      "REQUEST='\${{ github.event.issue.body }}'\n" +
        'claude -p fixed > out -p "$REQUEST"',
    );
    expect(rules(result)).not.toContain("agentci/untrusted-input-in-prompt");
    expect(rules(result)).not.toContain("agentci/untrusted-ai-write-token");
    expect(result.diagnostics.map((item) => item.code)).toContain(
      "agentci/analysis-run-dataflow-unknown",
    );
  });

  it("does not call a file-fed command substitution clean", () => {
    for (const argument of ['"$(cat request.txt)"', "$(cat request.txt)"]) {
      const result = scan(
        "echo '\${{ github.event.issue.body }}' > request.txt\n" +
          `claude -p ${argument}`,
      );
      expect(rules(result)).not.toContain("agentci/untrusted-input-in-prompt");
      expect(rules(result)).not.toContain("agentci/untrusted-ai-write-token");
      expect(result.diagnostics.map((item) => item.code)).toContain(
        "agentci/analysis-run-dataflow-unknown",
      );
    }
  });

  it("does not execute a CLI-looking line in heredoc data or a single-quoted substitution", () => {
    for (const run of [
      "cat <<'EOF'\nclaude -p fixed\nEOF",
      "echo '$(claude -p fixed)'",
    ]) {
      const result = scan(run);
      expect(result.agent_usages).toEqual([]);
      expect(rules(result)).not.toContain("agentci/ai-shell-access");
      expect(looksLikeAiUsage(run)).toBe(false);
    }
    expect(looksLikeAiUsage("claude -p fixed")).toBe(true);
    expect(looksLikeAiUsage("anthropics/claude-code-action@v1")).toBe(true);
  });

  it("does not mistake a quoted heredoc-looking string for a heredoc opener", () => {
    const result = scan(
      "echo '<<EOF'\nclaude -p '\${{ github.event.issue.body }}'",
    );
    expect(rules(result)).toContain("agentci/untrusted-input-in-prompt");
    expect(rules(result)).toContain("agentci/untrusted-ai-write-token");
  });

  it("marks a CLI inside double-quoted substitution incomplete, not proven", () => {
    for (const run of [
      'echo "$(claude -p fixed)"',
      'echo $(claude -p "\${{ github.event.issue.body }}")',
      'echo $(date; claude -p "\${{ github.event.issue.body }}")',
    ]) {
      const result = scan(run);
      expect(result.agent_usages).toEqual([]);
      expect(result.diagnostics.map((item) => item.code)).toContain(
        "agentci/analysis-run-dataflow-unknown",
      );
    }
  });

  it("does not hide a nested CLI because another CLI is already observed", () => {
    const result = scan(
      'claude -p fixed\necho "$(claude -p \\"\${{ github.event.issue.body }}\\")"',
    );
    expect(rules(result)).not.toContain("agentci/untrusted-input-in-prompt");
    expect(rules(result)).not.toContain("agentci/untrusted-ai-write-token");
    expect(result.diagnostics.map((item) => item.code)).toContain(
      "agentci/analysis-run-dataflow-unknown",
    );
  });
});

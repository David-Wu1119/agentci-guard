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
  it("recognizes an env-launched agent without treating env-only input as its prompt", () => {
    const direct = scan('env CI=1 claude -p "\${{ github.event.issue.body }}"');
    expect(direct.agent_usages).toHaveLength(1);
    expect(rules(direct)).toContain("agentci/untrusted-input-in-prompt");
    expect(rules(direct)).toContain("agentci/untrusted-ai-write-token");
    expect(rules(direct)).toContain("agentci/ai-shell-access");
    expect(direct.analysis_complete).toBe(true);

    const envOnly = scan(
      'env REQUEST="\${{ github.event.issue.body }}" claude -p fixed',
    );
    expect(envOnly.agent_usages).toHaveLength(1);
    expect(rules(envOnly)).not.toContain("agentci/untrusted-input-in-prompt");
    expect(rules(envOnly)).not.toContain("agentci/untrusted-ai-write-token");
    expect(envOnly.diagnostics.map((item) => item.code)).toContain(
      "agentci/analysis-run-dataflow-unknown",
    );
  });

  it("does not promote env prose or nested CLI execution to a proven sink", () => {
    for (const run of [
      'env CI=1 echo claude -p "\${{ github.event.issue.body }}"',
      "env CI=1 claude --help",
    ]) {
      const result = scan(run);
      expect(result.agent_usages).toEqual([]);
      expect(result.findings).toEqual([]);
    }
    const nested = scan('echo "$(env CI=1 claude -p fixed)"');
    expect(nested.agent_usages).toEqual([]);
    expect(nested.diagnostics.map((item) => item.code)).toContain(
      "agentci/analysis-run-dataflow-unknown",
    );
    const nestedShell = scan('result=$(bash -c "claude -p fixed")');
    expect(nestedShell.agent_usages).toEqual([]);
    expect(nestedShell.analysis_complete).toBe(false);
    expect(nestedShell.diagnostics.map((item) => item.code)).toContain(
      "agentci/analysis-run-dataflow-unknown",
    );
  });

  it("respects env's option terminator and executable boundary", () => {
    for (const run of [
      "env -- -i claude -p fixed",
      "env exec claude -p fixed",
      "env command claude -p fixed",
    ]) {
      const result = scan(run);
      expect(result.agent_usages).toEqual([]);
      expect(result.findings).toEqual([]);
    }
    for (const run of [
      "env -i -- claude -p fixed",
      "env -u REQUEST claude -p fixed",
      "env --unset=REQUEST claude -p fixed",
    ]) {
      expect(scan(run).agent_usages).toHaveLength(1);
    }
  });

  it("recognizes a literal shell assignment before a direct or env-launched CLI", () => {
    for (const run of [
      'CI=1 claude -p "\${{ github.event.issue.body }}"',
      'CI=1 env claude -p "\${{ github.event.issue.body }}"',
      'time claude -p "\${{ github.event.issue.body }}"',
      'time -p claude -p "\${{ github.event.issue.body }}"',
    ]) {
      const result = scan(run);
      expect(result.agent_usages).toHaveLength(1);
      expect(rules(result)).toContain("agentci/untrusted-input-in-prompt");
      expect(result.analysis_complete).toBe(true);
    }
    for (const run of [
      "CI=1 echo claude -p fixed",
      '"CI=1" claude -p fixed',
      "CI\\=1 claude -p fixed",
    ]) {
      const notAgent = scan(run);
      expect(notAgent.agent_usages).toEqual([]);
      expect(notAgent.findings).toEqual([]);
    }
    const envOnly = scan(
      'CI="\${{ github.event.issue.body }}" claude -p fixed',
    );
    expect(envOnly.agent_usages).toHaveLength(1);
    expect(rules(envOnly)).not.toContain("agentci/untrusted-input-in-prompt");
    expect(envOnly.diagnostics.map((item) => item.code)).toContain(
      "agentci/analysis-run-dataflow-unknown",
    );
  });

  it("marks an env-launched shell -c agent as unresolved, not a proven direct sink", () => {
    for (const shell of ["sh", "bash", "/bin/sh", "/bin/bash"]) {
      const nested = scan(
        `env CI=1 ${shell} -c "claude -p \${{ github.event.issue.body }}"`,
      );
      expect(nested.agent_usages).toEqual([]);
      expect(nested.findings).toEqual([]);
      expect(nested.diagnostics.map((item) => item.code)).toContain(
        "agentci/analysis-run-dataflow-unknown",
      );
      expect(nested.analysis_complete).toBe(false);
    }
    const prose = scan('env CI=1 sh -c "echo claude -p fixed"');
    expect(prose.agent_usages).toEqual([]);
    expect(prose.diagnostics).toEqual([]);
  });

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

  it("recognizes an agent command after shell control keywords", () => {
    for (const run of [
      'if true; then claude -p "\${{ github.event.issue.body }}"; fi',
      'if false; then :; else claude -p "\${{ github.event.issue.body }}"; fi',
      'for item in one; do claude -p "\${{ github.event.issue.body }}"; done',
      'if claude -p "\${{ github.event.issue.body }}"; then :; fi',
    ]) {
      const result = scan(run);
      expect(result.agent_usages).toHaveLength(1);
      expect(rules(result)).toContain("agentci/untrusted-input-in-prompt");
      expect(rules(result)).toContain("agentci/untrusted-ai-write-token");
      expect(result.analysis_complete).toBe(true);
    }
    for (const run of [
      'echo "then claude -p \${{ github.event.issue.body }}"',
      '"then" claude -p "\${{ github.event.issue.body }}"',
      '# if true; then claude -p "\${{ github.event.issue.body }}"; fi',
      'if false; then claude -p "\${{ github.event.issue.body }}"; fi',
      'then claude -p "\${{ github.event.issue.body }}"',
    ]) {
      expect(scan(run).agent_usages).toEqual([]);
    }
    const uncertain = scan(
      'if test "$RUN_AGENT" = yes; then claude -p "\${{ github.event.issue.body }}"; fi',
    );
    expect(uncertain.diagnostics.map((item) => item.code)).toContain(
      "agentci/analysis-shell-control-flow-unknown",
    );
    expect(uncertain.analysis_complete).toBe(false);
  });

  it("keeps compound conditions and function bodies out of certain CLI findings", () => {
    const dispatch = 'claude -p "\${{ github.event.issue.body }}"';
    const reached = scan(`if false || true; then ${dispatch}; fi`);
    expect(reached.agent_usages).toHaveLength(1);
    expect(reached.analysis_complete).toBe(true);
    for (const run of [
      `if true && false; then ${dispatch}; fi`,
      `for item in ; do ${dispatch}; done`,
      `create_agent() { ${dispatch}; }`,
      `function create_agent { ${dispatch}; }`,
      `create_agent() { :; { :; }; ${dispatch}; }`,
      `false && ${dispatch}`,
      `true || ${dispatch}`,
      `if false && ${dispatch}; then :; fi`,
      `if true || ${dispatch}; then :; fi`,
      `! true && ${dispatch}`,
      `! false || ${dispatch}`,
    ]) {
      expect(scan(run).agent_usages).toEqual([]);
    }
    for (const run of [
      `create_agent() { ${dispatch}; }`,
      `create_agent() { ${dispatch}; }; create_agent`,
      `function create_agent { ${dispatch}; }; create_agent`,
      `create_agent() { :; { :; }; ${dispatch}; }; create_agent`,
      `create_agent() { bash -c '${dispatch}'; }; create_agent`,
    ]) {
      const result = scan(run);
      expect(result.analysis_complete).toBe(false);
      expect(result.diagnostics.map((item) => item.code)).toContain(
        "agentci/analysis-run-dataflow-unknown",
      );
    }
    for (const run of [
      `if test "$X" && ${dispatch}; then :; fi`,
      `echo maybe && ${dispatch}`,
      `if true | false; then ${dispatch}; fi`,
      `if false | true; then ${dispatch}; fi`,
      `while false | true; do ${dispatch}; done`,
      `case x in y) ${dispatch};; esac`,
      `case x in x) :;; y) ${dispatch};; esac`,
      `exit 0; ${dispatch}`,
      `if true; then exit 0; ${dispatch}; fi`,
      `for item in one; do break; ${dispatch}; done`,
      `select item in one; do ${dispatch}; break; done`,
      `false && (${dispatch})`,
      `true || (${dispatch})`,
    ]) {
      const result = scan(run);
      expect(result.agent_usages).toHaveLength(1);
      expect(result.analysis_complete).toBe(false);
      expect(result.diagnostics.map((item) => item.code)).toContain(
        "agentci/analysis-shell-control-flow-unknown",
      );
    }
    for (const run of [`! false && ${dispatch}`, `! true || ${dispatch}`]) {
      const result = scan(run);
      expect(result.agent_usages).toHaveLength(1);
      expect(result.analysis_complete).toBe(true);
    }
  });

  it("does not enter compounds skipped by short-circuiting", () => {
    const dispatch = 'claude -p "\${{ github.event.issue.body }}"';
    for (const run of [
      `true || if true; then ${dispatch}; fi`,
      `false && if true; then ${dispatch}; fi`,
      `false && for item in one; do ${dispatch}; done`,
      `false && while true; do ${dispatch}; done`,
      `true || case x in x) ${dispatch};; esac`,
      `true || { :; ${dispatch}; }`,
    ]) {
      const result = scan(run);
      expect(result.agent_usages).toEqual([]);
      expect(result.findings).toEqual([]);
      expect(result.diagnostics.map((item) => item.code)).not.toContain(
        "agentci/analysis-shell-control-flow-unknown",
      );
      expect(result.analysis_complete).toBe(true);
    }
    const uncertain = scan(
      `test "$RUN_AGENT" && if true; then ${dispatch}; fi`,
    );
    expect(uncertain.agent_usages).toHaveLength(1);
    expect(uncertain.analysis_complete).toBe(false);
    expect(uncertain.diagnostics.map((item) => item.code)).toContain(
      "agentci/analysis-shell-control-flow-unknown",
    );
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

import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { looksLikeAiUsage } from "../src/detect.js";
import { scanWorkflowFiles } from "../src/index.js";

function scan(run: string, environment = "", event = "issues") {
  const raw = `
on: ${event}
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

function ruleSeverities(result: ReturnType<typeof scan>) {
  return result.findings.map(({ rule_id, severity }) => [rule_id, severity]);
}

describe("Codex CLI forms", () => {
  const forms = [
    "codex e",
    "codex review",
    ...["npx", "npx -y", "npx --yes"].flatMap((launcher) =>
      ["@openai/codex", "@openai/codex@0.50.0"].flatMap((packageRef) =>
        ["exec", "e", "review"].map(
          (subcommand) => `${launcher} ${packageRef} ${subcommand}`,
        ),
      ),
    ),
  ];
  const prompt = '"${{ github.event.comment.body }}"';

  it.each(forms)("matches codex exec for an untrusted prompt: %s", (form) => {
    const baseline = scan(`codex exec ${prompt}`, "", "issue_comment");
    const result = scan(`${form} ${prompt}`, "", "issue_comment");
    expect(result.agent_usages).toHaveLength(1);
    expect(ruleSeverities(baseline)).toEqual(
      expect.arrayContaining([
        ["agentci/untrusted-input-in-prompt", "high"],
        ["agentci/untrusted-ai-write-token", "critical"],
        ["agentci/ai-shell-access", "high"],
      ]),
    );
    expect(ruleSeverities(result)).toEqual(ruleSeverities(baseline));
    expect(result.diagnostics).toEqual(baseline.diagnostics);
    expect(result.analysis_complete).toBe(baseline.analysis_complete);
  });

  it("recognizes codex review without a prompt", () => {
    const baseline = scan('codex exec "check this"', "", "issue_comment");
    for (const form of forms.filter((form) => form.endsWith("review"))) {
      const result = scan(form, "", "issue_comment");
      expect(result.agent_usages, form).toHaveLength(1);
      expect(ruleSeverities(result), form).toEqual(ruleSeverities(baseline));
      expect(result.analysis_complete, form).toBe(baseline.analysis_complete);
    }
  });

  it("preserves Codex argument, stdin, redirection and control flow handling", () => {
    const scenarios: Array<[string, string?]> = [
      [`CODEX --model example ${prompt}`],
      [
        'CODEX "$REQUEST"',
        "env:\n  REQUEST: ${{ github.event.comment.body }}\n",
      ],
      [`printf "%s" ${prompt} | CODEX -`],
      [`printf "%s" ${prompt} |&\nCODEX -`],
      [`CODEX ${prompt} >out.txt`],
      [`CODEX fixed > ${prompt}`],
      [`CODEX --help >out.txt ${prompt}`],
      [`CODEX --help ${prompt}`],
      [`CODEX ${prompt} --version`],
      [`CODEX fixed && echo ${prompt}`],
      [`if true; then CODEX ${prompt}; fi`],
      [`if false; then CODEX ${prompt}; fi`],
      [`if test "$RUN_AGENT" = yes; then CODEX ${prompt}; fi`],
      [`env CI=1 CODEX ${prompt}`],
      ["bash -c 'CODEX fixed'"],
      ['echo "$(CODEX fixed)"'],
      [">out.txt CODEX fixed"],
    ];
    for (const [run, environment] of scenarios) {
      const baseline = scan(
        run.replaceAll("CODEX", "codex exec"),
        environment,
        "issue_comment",
      );
      for (const form of forms) {
        const command = run.replaceAll("CODEX", form);
        const result = scan(command, environment, "issue_comment");
        expect(result.agent_usages.length, command).toBe(
          baseline.agent_usages.length,
        );
        expect(ruleSeverities(result), command).toEqual(
          ruleSeverities(baseline),
        );
        expect(
          result.diagnostics.map(({ code }) => code),
          command,
        ).toEqual(baseline.diagnostics.map(({ code }) => code));
        expect(result.analysis_complete, command).toBe(
          baseline.analysis_complete,
        );
      }
    }
  });

  it("excludes Codex help/version checks including redirects", () => {
    for (const form of forms) {
      for (const argument of [
        "--help",
        "-h",
        "--version",
        "--model example --help",
        "--help >out.txt",
        "--help >first.txt>second.txt",
      ]) {
        const run = `${form} ${argument}`;
        const result = scan(run);
        expect(result.agent_usages, run).toEqual([]);
        expect(result.findings, run).toEqual([]);
      }
    }
  });

  it.each([
    "codex apply",
    "codex login",
    "codex resume",
    "codex",
    "codex --version",
    "npm install -g @openai/codex",
    'echo "run codex review later"',
    'echo "npx @openai/codex exec later"',
    "npx -y @openai/codex-fork exec fixed",
    "npx @openai/codex",
    "npx @openai/codex run fixed",
    "codex -m o3 exec fixed",
    "codex -m o3 e fixed",
    "codex -m o3 review fixed",
    "npx @openai/codex -m o3 exec fixed",
  ])("keeps non-agent and unsupported forms excluded: %s", (run) => {
    const result = scan(run);
    expect(result.agent_usages).toEqual([]);
    expect(result.findings).toEqual([]);
  });

  it("keeps codex run unchanged", () => {
    expect(
      ruleSeverities(scan(`codex run ${prompt}`, "", "issue_comment")),
    ).toEqual(
      ruleSeverities(scan(`codex exec ${prompt}`, "", "issue_comment")),
    );
  });
});

describe("local CLI run-step input flow", () => {
  it("keeps help-shaped option operands as CLI input", () => {
    const result = scan('claude --system-prompt "--help"');
    expect(result.agent_usages).toHaveLength(1);
    expect(rules(result)).toContain("agentci/ai-shell-access");
  });

  it("does not execute a chained leading-redirection target", () => {
    const result = scan(">out.txt> claude echo harmless");
    expect(result.agent_usages).toEqual([]);
    expect(result.findings).toEqual([]);
  });

  it.each(["claude --help 2>/dev/null", "claude --help &>/dev/null"])(
    "keeps a redirected help check excluded: %s",
    (run) => {
      const result = scan(run);
      expect(result.agent_usages).toEqual([]);
      expect(result.findings).toEqual([]);
    },
  );

  it("still observes a redirected real run", () => {
    const result = scan("claude -p review 2>/dev/null");
    expect(result.agent_usages).toHaveLength(1);
    expect(rules(result)).toContain("agentci/ai-shell-access");
  });

  it("keeps dataflow unknown for prompts after a help redirection", () => {
    const result = scan('codex exec --help >out.txt "review this patch"');
    expect(result.diagnostics.map((item) => item.code)).toContain(
      "agentci/analysis-run-dataflow-unknown",
    );
    expect(result.agent_usages).toHaveLength(1);
    expect(rules(result)).toContain("agentci/ai-shell-access");
    expect(result.analysis_complete).toBe(false);
  });

  it.each([
    "codex exec --help",
    "codex run -h",
    "codex exec --version",
    "codex exec --help >out.txt",
    "codex exec --help > out.txt",
    "codex exec --help >first.txt>second.txt",
    "claude --help",
    "claude --verbose --help",
    "claude --model sonnet --help",
    'claude --system-prompt "--help" --help',
    "codex exec --model example --help",
    'claude --append-system-prompt "Describe Bash" --help',
    "claude --allowedTools Read Bash --help",
    "cursor-agent --verbose --help",
    "aider --yes --version",
    "npx --yes @anthropic-ai/claude-code --verbose -h",
  ])("excludes help/version checks throughout CLI arguments: %s", (run) => {
    const result = scan(run);
    expect(result.agent_usages).toEqual([]);
    expect(rules(result)).not.toContain("agentci/ai-shell-access");
  });

  it.each([
    'claude -p "x"',
    'claude --help -p "x"',
    'claude --help "review this patch"',
    'claude --help -- "review this patch"',
    'claude --model sonnet --help -p "x"',
    'claude --verbose "review this patch" --help',
    'codex exec --help "review this patch"',
    'codex exec "review this patch" --version',
    'aider --version --message "review this patch"',
  ])(
    "keeps prompt-bearing CLI runs despite help/version arguments: %s",
    (run) => {
      const result = scan(run);
      expect(result.agent_usages).toHaveLength(1);
      expect(rules(result)).toContain("agentci/ai-shell-access");
    },
  );

  it.each([
    ">output.txt",
    "> output.txt",
    "2>output.txt",
    "<input.txt",
    ">>output.txt",
    "&>output.txt",
    ">output.txt 2>errors.txt",
    '>output.txt">"',
    ">output.txt\\>",
  ])(
    "leaves a CLI after a leading redirection unobserved (known limitation): %s",
    (redirect) => {
      const result = scan(`${redirect} claude -p review`);
      expect(result.agent_usages).toEqual([]);
      expect(result.findings).toEqual([]);
    },
  );

  it.each([
    '>output.txt echo "claude -p review"',
    ">output.txt claude --help",
    '">output.txt" claude -p review',
    "echo fixed &>output.txt claude -p review",
    ">out.txt>> claude echo harmless",
    "> out.txt> claude echo harmless",
    '>"out>file"> claude echo harmless',
  ])(
    "does not promote prose or checks after leading redirection: %s",
    (run) => {
      const result = scan(run);
      expect(result.agent_usages).toEqual([]);
      expect(result.findings).toEqual([]);
    },
  );

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
      'command -p claude -p "\${{ github.event.issue.body }}"',
      'command -- claude -p "\${{ github.event.issue.body }}"',
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

  it("recognizes npx yes flags before an agent package without promoting prose", () => {
    for (const launcher of [
      "npx -y",
      "npx --yes",
      "sudo npx -y",
      "env CI=1 npx --yes",
    ]) {
      for (const packageRef of [
        "@anthropic-ai/claude-code",
        "@anthropic-ai/claude-code@latest",
        "@anthropic-ai/claude-code@2.1.296",
      ]) {
        const run = `${launcher} ${packageRef} -p "\${{ github.event.issue.body }}"`;
        const result = scan(run);
        expect(result.agent_usages, run).toHaveLength(1);
        expect(rules(result), run).toContain(
          "agentci/untrusted-input-in-prompt",
        );
        expect(rules(result), run).toContain(
          "agentci/untrusted-ai-write-token",
        );
        expect(result.diagnostics, run).toEqual([]);
        expect(result.analysis_complete, run).toBe(true);
      }
    }
    for (const run of [
      "echo npx -y @anthropic-ai/claude-code -p fixed",
      "npx -y echo @anthropic-ai/claude-code -p fixed",
      "npx --yes @anthropic-ai/claude-code --help",
      "npx --yes @anthropic-ai/claude-code@latest --version",
      "npx --yes @anthropic-ai/claude-code-fork -p fixed",
      'npx --yes claude -p "\${{ github.event.issue.body }}"',
    ]) {
      const result = scan(run);
      expect(result.agent_usages, run).toEqual([]);
      expect(result.findings, run).toEqual([]);
    }
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

  it("does not treat shadowed literal shell commands as fixed conditions", () => {
    const dispatch = 'claude -p "\${{ github.event.issue.body }}"';
    for (const run of [
      `false() { true; }; if false; then ${dispatch}; fi`,
      `function false { true; }; false && ${dispatch}`,
      `true() { false; }; true || ${dispatch}`,
      `function true { false; }; if true; then :; else ${dispatch}; fi`,
      `:() { false; }; : || ${dispatch}`,
      `function false\n{\n true\n}\nif false; then ${dispatch}; fi`,
      `false() # comment\n{ true; }\nif false; then ${dispatch}; fi`,
      `false()\n# comment\n{ true; }\nif false; then ${dispatch}; fi`,
      `function false # comment\n{ true; }\nif false; then ${dispatch}; fi`,
      `false () { true; }; if false; then ${dispatch}; fi`,
      `false ( )\n{ true; }\nif false; then ${dispatch}; fi`,
      `if true; then false() { true; }; fi; if false; then ${dispatch}; fi`,
      `if false; then :; else false() { true; }; fi; if false; then ${dispatch}; fi`,
      `outer() { false() { true; }; }; outer; if false; then ${dispatch}; fi`,
      `outer() { inner() { false() { true; }; }; inner; }; outer; if false; then ${dispatch}; fi`,
      `top() { outer() { inner() { false() { true; }; }; inner; }; outer; }; top; if false; then ${dispatch}; fi`,
      `outer() { false() { true; }; }; time outer; if false; then ${dispatch}; fi`,
      `outer() { false() { true; }; }; time -p outer; if false; then ${dispatch}; fi`,
      `outer() { false() { true; }; }; time eval outer; if false; then ${dispatch}; fi`,
      `outer() { false() { true; }; }; time CI=1 eval outer; if false; then ${dispatch}; fi`,
      `outer() { false() { true; }; }; time ! outer || :; if false; then ${dispatch}; fi`,
      `outer() { false() { true; }; }; time -p ! outer || :; if false; then ${dispatch}; fi`,
      `outer() { false() { true; }; }; F=1 outer; if false; then ${dispatch}; fi`,
      `outer() { false() { true; }; }; eval outer; if false; then ${dispatch}; fi`,
      `outer() { false() { true; }; }; ! eval outer; if false; then ${dispatch}; fi`,
      `outer() { false() { true; }; }; builtin eval outer; if false; then ${dispatch}; fi`,
      `outer() { false() { true; }; }; command eval outer; if false; then ${dispatch}; fi`,
      `outer() { false() { true; }; }; builtin command eval outer; if false; then ${dispatch}; fi`,
      `outer() { false() { true; }; }; command builtin eval outer; if false; then ${dispatch}; fi`,
      `outer() { false() { true; }; }; command -p eval outer; if false; then ${dispatch}; fi`,
      `outer() { false() { true; }; }; command -- eval outer; if false; then ${dispatch}; fi`,
      `outer() { false() { true; }; }; command -p -- eval outer; if false; then ${dispatch}; fi`,
      `outer() { false() { true; }; }; builtin -- eval outer; if false; then ${dispatch}; fi`,
      `outer() { false() { true; }; }; builtin command -- eval outer; if false; then ${dispatch}; fi`,
      `outer() { false() { true; }; }; eval time outer; if false; then ${dispatch}; fi`,
      `outer() { false() { true; }; }; eval eval outer; if false; then ${dispatch}; fi`,
      `outer() { false() { true; }; }; f=outer; $f; if false; then ${dispatch}; fi`,
      `outer() { false() { true; }; }; f=outer; "$f"; if false; then ${dispatch}; fi`,
      `outer() { false() { true; }; }; o{u,u}ter; if false; then ${dispatch}; fi`,
      `false() ( true ); if false; then ${dispatch}; fi`,
      `false() if true; then true; fi; if false; then ${dispatch}; fi`,
      `false() for item in one; do true; done; if false; then ${dispatch}; fi`,
      `false() [[ 1 == 1 ]]; if false; then ${dispatch}; fi`,
    ]) {
      const result = scan(run);
      expect(result.agent_usages, run).toHaveLength(1);
      expect(result.analysis_complete).toBe(false);
      expect(result.diagnostics.map((item) => item.code)).toContain(
        "agentci/analysis-shell-control-flow-unknown",
      );
    }
    const unreachableDefinition = scan(
      `if false; then false() { true; }; fi; if false; then ${dispatch}; fi`,
    );
    expect(unreachableDefinition.agent_usages).toEqual([]);
    expect(unreachableDefinition.analysis_complete).toBe(true);
    const nestedUnreachable = scan(
      `outer() { if false; then false() { true; }; fi; }; if false; then ${dispatch}; fi`,
    );
    expect(nestedUnreachable.agent_usages).toEqual([]);
    expect(nestedUnreachable.analysis_complete).toBe(true);
    const uncalledOuter = scan(
      `outer() { false() { true; }; }; if false; then ${dispatch}; fi`,
    );
    expect(uncalledOuter.agent_usages).toEqual([]);
    expect(uncalledOuter.analysis_complete).toBe(true);
    const nestedNotCalled = scan(
      `outer() { inner() { false() { true; }; }; }; outer; if false; then ${dispatch}; fi`,
    );
    expect(nestedNotCalled.agent_usages).toEqual([]);
    expect(nestedNotCalled.analysis_complete).toBe(true);
    const nestedCallSkipped = scan(
      `outer() { inner() { false() { true; }; }; if false; then inner; fi; }; outer; if false; then ${dispatch}; fi`,
    );
    expect(nestedCallSkipped.agent_usages).toEqual([]);
    expect(nestedCallSkipped.analysis_complete).toBe(true);
    for (const command of [
      "time echo hi",
      "eval echo hi",
      "eval 'echo hi'",
      "'time' outer || :",
      '"time" outer || :',
      "'o{u,u}ter' || :",
      "F=1 time outer || :",
      "command outer || :",
      "builtin outer || :",
      "env eval outer || :",
      "builtin env eval outer || :",
      "builtin time eval outer || :",
      "command time eval outer || :",
      "if time outer; then :; fi",
      "while time outer; do break; done",
    ]) {
      const unrelatedCall = scan(
        `outer() { false() { true; }; }; ${command}; if false; then ${dispatch}; fi`,
      );
      expect(unrelatedCall.agent_usages, command).toEqual([]);
      expect(unrelatedCall.analysis_complete, command).toBe(true);
    }
  });

  it("does not report agent commands in uncalled function bodies", () => {
    const dispatch = 'claude -p "\${{ github.event.issue.body }}"';
    for (const run of [
      `function ignored\n{\n ${dispatch}\n}\n:`,
      `if true; then ignored() { ${dispatch}; }; fi`,
      `ignored() if true; then ${dispatch}; fi; :`,
      `ignored() while true; do ${dispatch}; break; done; :`,
      `ignored() ( ${dispatch} ); :`,
      `ignored() ( ( true ); ${dispatch} ); :`,
      `if ignored() { ${dispatch}; }; then :; fi`,
      `while ignored() { ${dispatch}; }; do break; done`,
    ]) {
      const result = scan(run);
      expect(result.agent_usages).toEqual([]);
      expect(result.analysis_complete).toBe(false);
      expect(result.diagnostics.map((item) => item.code)).toContain(
        "agentci/analysis-run-dataflow-unknown",
      );
    }
    const direct = scan(`ignored() { exit 0; }; ${dispatch}`);
    expect(direct.agent_usages).toHaveLength(1);
    expect(direct.analysis_complete).toBe(true);
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

  it("preserves short-circuit gates and pipeline input across newlines", () => {
    const dispatch = "claude -p fixed";
    for (const run of [
      `false &&\n${dispatch}`,
      `true ||\n${dispatch}`,
      `false && # skipped\n${dispatch}`,
    ]) {
      const result = scan(run);
      expect(result.agent_usages).toEqual([]);
      expect(result.findings).toEqual([]);
      expect(result.analysis_complete).toBe(true);
    }

    for (const pipe of ["|", "|&"]) {
      const piped = scan(
        `printf "\${{ github.event.issue.body }}" ${pipe}\nclaude -p fixed`,
      );
      expect(piped.agent_usages).toHaveLength(1);
      expect(piped.diagnostics.map((item) => item.code)).toContain(
        "agentci/analysis-run-dataflow-unknown",
      );
      expect(piped.analysis_complete).toBe(false);
    }
  });

  it("abstains on literal eval and shell-stdin agent execution", () => {
    for (const run of [
      'eval "claude -p fixed"',
      '! eval "claude -p fixed"',
      'time CI=1 eval "claude -p fixed"',
      'builtin eval "claude -p fixed"',
      'command -p eval "claude -p fixed"',
      'command -- eval "claude -p fixed"',
      'command -p -- eval "claude -p fixed"',
      'builtin -- eval "claude -p fixed"',
      'builtin command -- eval "claude -p fixed"',
      'bash <<< "claude -p fixed"',
      'bash -s <<< "claude -p fixed"',
      'bash -e <<< "claude -p fixed"',
      'sh -s <<< "claude -p fixed"',
      'bash -s -e <<< "claude -p fixed"',
      'bash -lc "claude -p fixed"',
      'bash --noprofile -c "claude -p fixed"',
      String.raw`printf 'claude -p fixed\n' | bash`,
      String.raw`printf 'claude -p fixed\n' | /usr/bin/bash`,
    ]) {
      const result = scan(run);
      expect(result.agent_usages).toEqual([]);
      expect(result.findings).toEqual([]);
      expect(result.diagnostics.map((item) => item.code)).toContain(
        "agentci/analysis-run-dataflow-unknown",
      );
      expect(result.analysis_complete).toBe(false);
    }
    for (const run of [
      'eval "echo claude -p fixed"',
      'command -p -v eval "claude -p fixed"',
      'builtin -p eval "claude -p fixed"',
      'env eval "claude -p fixed"',
      'builtin env eval "claude -p fixed"',
      'builtin time eval "claude -p fixed"',
      'command time eval "claude -p fixed"',
      'command -p echo "claude -p fixed"',
      'bash <<< "echo claude -p fixed"',
      String.raw`printf 'claude -p fixed\n' | cat`,
    ]) {
      const result = scan(run);
      expect(result.agent_usages).toEqual([]);
      expect(result.diagnostics).toEqual([]);
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

  it.each([
    'declare REQUEST="\${{ github.event.issue.body }}"\nclaude -p "$REQUEST"',
    'printf -v REQUEST "%s" "\${{ github.event.issue.body }}"\nclaude -p "$REQUEST"',
    'REQUEST="\${{ github.event.issue.body }}"\necho "$REQUEST" | claude -p fixed',
    'printf "%s" "\${{ github.event.issue.body }}" > /tmp/request\ncat /tmp/request | claude -p fixed',
  ])("does not clear unresolved shell-variable flow: %s", (run) => {
    const result = scan(run, "env:\n  REQUEST: safe\n");
    expect(result.diagnostics.map((item) => item.code)).toContain(
      "agentci/analysis-run-dataflow-unknown",
    );
    expect(result.analysis_complete).toBe(false);
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

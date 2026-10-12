import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runAction, type ActionIo } from "../src/action-runner.js";
import YAML from "yaml";
import packageJson from "../package.json" with { type: "json" };

const VERSION = packageJson.version;
const escaped = VERSION.replaceAll(".", "\\.");

async function temporaryOutput(): Promise<{
  output: string;
  sarif: string;
  json: string;
}> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "agentci-action-"));
  const output = path.join(directory, "github-output");
  const sarif = path.join(directory, "result.sarif");
  const json = path.join(directory, "result.json");
  await fs.writeFile(output, "", "utf8");
  return { output, sarif, json };
}

function captureIo(): ActionIo & { logs: string[]; errors: string[] } {
  const logs: string[] = [];
  const errors: string[] = [];
  return {
    logs,
    errors,
    log: (message) => logs.push(message),
    error: (message) => errors.push(message),
  };
}

describe("JavaScript Action entrypoint", () => {
  it("keeps the synthetic Action receipt and raw evidence in the same CI job", async () => {
    const ci = YAML.parse(
      await fs.readFile(".github/workflows/ci.yml", "utf8"),
    ) as {
      jobs: {
        verify: {
          steps: Array<{
            id?: string;
            name?: string;
            uses?: string;
            with?: Record<string, string>;
            env?: Record<string, string>;
            run?: string;
            if?: string;
            "continue-on-error"?: boolean;
          }>;
        };
      };
    };
    const steps = ci.jobs.verify.steps;
    const actionIndex = steps.findIndex((step) => step.id === "reusable");
    expect(steps[actionIndex - 1].run).toContain(
      "['show', `${actionCommit}:${file}`]",
    );
    expect(steps[actionIndex - 1].run).toContain("'dist/action.js'");
    expect(steps[actionIndex - 1].run).toContain(
      "artifacts/e4-incomplete-preflight.json",
    );
    expect(steps[actionIndex - 1].run).toContain("artifacts/incomplete.json");
    expect(steps[actionIndex]).toMatchObject({
      uses: "./",
      with: {
        path: "corpus/adversarial/cases/local-reusable",
        json: "artifacts/reusable.json",
        "fail-on": "none",
      },
    });
    expect(steps[actionIndex + 1]).toMatchObject({
      env: {
        E4_ACTION_JSON_PATH: "${{ steps.reusable.outputs.json-path }}",
        E4_WORKFLOW_SHA: "${{ github.workflow_sha }}",
      },
    });
    expect(steps[actionIndex + 1].run).toContain(
      "artifacts/e4-synthetic-receipt.json",
    );
    expect(steps[actionIndex + 1].run).toContain(
      "['show', `${process.env.E4_WORKFLOW_SHA}:.github/workflows/ci.yml`]",
    );
    expect(steps[actionIndex + 2]).toMatchObject({
      id: "incomplete",
      "continue-on-error": true,
      uses: "./",
      with: {
        path: "corpus/adversarial/cases/parse-error",
        sarif: "artifacts/incomplete.sarif",
        json: "artifacts/incomplete.json",
        "fail-on": "none",
      },
    });
    expect(steps[actionIndex + 3]).toMatchObject({
      env: {
        E4_INCOMPLETE_OUTCOME: "${{ steps.incomplete.outcome }}",
        E4_INCOMPLETE_JSON_SHA256:
          "${{ steps.incomplete.outputs.json-sha256 }}",
        E4_INCOMPLETE_JSON_PATH: "${{ steps.incomplete.outputs.json-path }}",
      },
    });
    expect(steps[actionIndex + 3].run).toContain(
      "assert.equal(process.env.E4_INCOMPLETE_OUTCOME, 'failure')",
    );
    expect(steps[actionIndex + 3].run).toContain("await loadActionRun({");
    expect(steps[actionIndex + 3].run).toContain(
      "assert.equal(run_incomplete, true)",
    );
    expect(steps[actionIndex + 3].run).toContain("agentci/parse-error");
    expect(steps[actionIndex + 3].run).toContain(
      "artifacts/e4-incomplete-receipt.json",
    );
    for (const run of [
      steps[actionIndex - 1].run,
      steps[actionIndex + 1].run,
      steps[actionIndex + 3].run,
    ]) {
      const script = run
        ?.split("node --input-type=module <<'NODE'\n")[1]
        ?.split("\nNODE")[0];
      expect(script).toBeTruthy();
      const syntax = spawnSync(
        process.execPath,
        ["--input-type=module", "--check"],
        { input: script, encoding: "utf8" },
      );
      expect(syntax.status, syntax.stderr).toBe(0);
    }
    expect(steps[actionIndex + 4]).toMatchObject({
      if: "success()",
      uses: "actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9",
      with: {
        name: "e4-synthetic-${{ github.run_id }}-${{ github.run_attempt }}",
        "if-no-files-found": "error",
      },
    });
    for (const file of [
      "artifacts/e3-reusable-preflight.json",
      "artifacts/reusable.json",
      "artifacts/reusable.sarif",
      "artifacts/e4-synthetic-receipt.json",
      "artifacts/e4-incomplete-preflight.json",
      "artifacts/incomplete.json",
      "artifacts/incomplete.sarif",
      "artifacts/e4-incomplete-receipt.json",
    ]) {
      expect(steps[actionIndex + 4].with?.path).toContain(file);
    }
    expect(steps[actionIndex + 5]).toMatchObject({
      if: "failure()",
      uses: "actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9",
      with: {
        name: "e4-synthetic-debug-${{ github.run_id }}-${{ github.run_attempt }}",
        "if-no-files-found": "warn",
      },
    });
    expect(steps[actionIndex + 5].with?.path).toContain(
      "artifacts/e4-incomplete-receipt.json",
    );
  });

  it("is wired through a dedicated JavaScript entrypoint", async () => {
    const manifest = YAML.parse(await fs.readFile("action.yml", "utf8")) as {
      runs: { using: string; main: string; args?: unknown };
    };

    expect(manifest.runs.using).toBe("node24");
    expect(manifest.runs.main).toBe("dist/action.js");
    expect(manifest.runs.args).toBeUndefined();
    expect((await fs.stat(manifest.runs.main)).isFile()).toBe(true);

    const ci = await fs.readFile(".github/workflows/ci.yml", "utf8");
    expect(ci.match(/uses:\s*\.\/\s*$/gm)?.length).toBeGreaterThanOrEqual(3);

    const publishedSmoke = await fs.readFile(
      ".github/workflows/published-tag-smoke.yml",
      "utf8",
    );
    // Both published-artifact smokes must target the version in package.json,
    // so a release cannot bump one without the other.
    expect(
      publishedSmoke.match(
        new RegExp(
          `uses:\\s*David-Wu1119\\/agentci-guard@v${escaped}\\s*$`,
          "gm",
        ),
      )?.length,
    ).toBe(3);
    expect(publishedSmoke).toMatch(
      new RegExp(`github\\.event\\.release\\.tag_name == 'v${escaped}'`),
    );
    expect(publishedSmoke).toContain(`github.ref == 'refs/tags/v${VERSION}'`);

    const npmSmoke = await fs.readFile(
      ".github/workflows/published-npm-smoke.yml",
      "utf8",
    );
    expect(npmSmoke).toContain(`agentci-guard@${VERSION}`);
    expect(npmSmoke).toContain(`github.ref == 'refs/tags/v${VERSION}'`);
    expect(npmSmoke).toContain('"$consumer_dir/node_modules/.bin/agentci"');
  });

  it("writes SARIF and incomplete-analysis outputs for an unverified Action ref", async () => {
    const temporary = await temporaryOutput();
    const io = captureIo();
    const code = await runAction(
      {
        INPUT_PATH: "examples/vulnerable",
        INPUT_SARIF: temporary.sarif,
        INPUT_JSON: temporary.json,
        "INPUT_FAIL-ON": "none",
        GITHUB_OUTPUT: temporary.output,
      },
      io,
    );

    expect(code).toBe(0);
    expect(
      JSON.parse(await fs.readFile(temporary.sarif, "utf8")),
    ).toMatchObject({
      version: "2.1.0",
    });
    const outputs = await fs.readFile(temporary.output, "utf8");
    expect(outputs).toMatch(/findings=[1-9]\d*/);
    expect(outputs).toContain(`sarif-path=${temporary.sarif}`);
    expect(outputs).toContain("diagnostics=1");
    expect(outputs).toContain("analysis-complete=false");
    expect(io.errors).toEqual([]);
  });

  it("writes the complete scan result as JSON and exposes its path before threshold failure", async () => {
    const manifest = YAML.parse(await fs.readFile("action.yml", "utf8")) as {
      inputs: Record<string, { default?: string }>;
      outputs: Record<string, unknown>;
    };
    expect(manifest.inputs.json.default).toBeUndefined();
    expect(manifest.outputs["json-path"]).toBeDefined();

    const temporary = await temporaryOutput();
    const io = captureIo();
    const code = await runAction(
      {
        INPUT_PATH: "examples/vulnerable",
        INPUT_SARIF: temporary.sarif,
        INPUT_JSON: temporary.json,
        "INPUT_FAIL-ON": "high",
        GITHUB_OUTPUT: temporary.output,
      },
      io,
    );

    expect(code).toBe(2);
    const result = JSON.parse(await fs.readFile(temporary.json, "utf8"));
    expect(Object.keys(result).sort()).toEqual(
      [
        "scanned_at",
        "root",
        "workflow_count",
        "agent_usages",
        "findings",
        "summary",
        "diagnostics",
        "analysis_complete",
      ].sort(),
    );
    expect(result.agent_usages.length).toBeGreaterThan(0);
    expect(result.findings[0].id).toBeTruthy();
    expect(result.analysis_complete).toBe(false);
    expect(await fs.readFile(temporary.output, "utf8")).toContain(
      `json-path=${temporary.json}`,
    );
  });

  it("declares the optional JSON digest output in the Action manifest", async () => {
    const manifest = YAML.parse(await fs.readFile("action.yml", "utf8")) as {
      outputs: Record<string, unknown>;
    };

    expect(manifest.outputs["json-sha256"]).toBeDefined();
  });

  it("reports the SHA-256 of exact JSON file bytes before threshold failure", async () => {
    const temporary = await temporaryOutput();
    const code = await runAction(
      {
        INPUT_PATH: "examples/vulnerable",
        INPUT_SARIF: temporary.sarif,
        INPUT_JSON: temporary.json,
        "INPUT_FAIL-ON": "high",
        GITHUB_OUTPUT: temporary.output,
      },
      captureIo(),
    );

    expect(code).toBe(2);
    const writtenBytes = await fs.readFile(temporary.json);
    const digest = createHash("sha256").update(writtenBytes).digest("hex");
    const outputs = await fs.readFile(temporary.output, "utf8");
    expect(outputs).toContain(`json-sha256=${digest}\n`);
    expect(outputs.match(/^json-sha256=/gm)).toHaveLength(1);
  });

  it("does not report a JSON digest when optional JSON is omitted", async () => {
    for (const jsonInput of [undefined, ""]) {
      const temporary = await temporaryOutput();
      const code = await runAction(
        {
          INPUT_PATH: "examples/hardened",
          INPUT_SARIF: temporary.sarif,
          INPUT_JSON: jsonInput,
          "INPUT_FAIL-ON": "none",
          GITHUB_OUTPUT: temporary.output,
        },
        captureIo(),
      );

      expect(code).toBe(0);
      expect(await fs.readFile(temporary.output, "utf8")).not.toContain(
        "json-sha256=",
      );
    }
  });

  it("does not report a JSON digest when the create-only JSON write fails", async () => {
    const temporary = await temporaryOutput();
    await fs.writeFile(temporary.json, "existing result\n", "utf8");
    const code = await runAction(
      {
        INPUT_PATH: "examples/hardened",
        INPUT_SARIF: temporary.sarif,
        INPUT_JSON: temporary.json,
        "INPUT_FAIL-ON": "none",
        GITHUB_OUTPUT: temporary.output,
      },
      captureIo(),
    );

    expect(code).toBe(1);
    expect(await fs.readFile(temporary.json, "utf8")).toBe("existing result\n");
    expect(await fs.readFile(temporary.output, "utf8")).not.toContain(
      "json-sha256=",
    );
  });

  it("does not write or report JSON when the optional input is omitted or empty", async () => {
    const defaultJson = path.resolve("agentci-results.json");
    expect(await fs.stat(defaultJson).catch(() => null)).toBeNull();

    for (const jsonInput of [undefined, ""]) {
      const temporary = await temporaryOutput();
      const code = await runAction(
        {
          INPUT_PATH: "examples/hardened",
          INPUT_SARIF: temporary.sarif,
          INPUT_JSON: jsonInput,
          "INPUT_FAIL-ON": "none",
          GITHUB_OUTPUT: temporary.output,
        },
        captureIo(),
      );

      expect(code).toBe(0);
      expect(await fs.stat(defaultJson).catch(() => null)).toBeNull();
      expect(await fs.readFile(temporary.output, "utf8")).not.toContain(
        "json-path=",
      );
    }
  });

  it("writes outputs before returning a threshold failure", async () => {
    const temporary = await temporaryOutput();
    const io = captureIo();
    const code = await runAction(
      {
        INPUT_PATH: "examples/vulnerable",
        INPUT_SARIF: temporary.sarif,
        INPUT_JSON: temporary.json,
        "INPUT_FAIL-ON": "high",
        GITHUB_OUTPUT: temporary.output,
      },
      io,
    );

    expect(code).toBe(2);
    expect(await fs.readFile(temporary.output, "utf8")).toContain("critical=");
    expect(io.errors[0]).toContain("at or above high");
  });

  it("preserves reusable-workflow caller paths in the JSON output", async () => {
    const temporary = await temporaryOutput();
    const code = await runAction({
      INPUT_PATH: "corpus/adversarial/cases/local-reusable",
      INPUT_SARIF: temporary.sarif,
      INPUT_JSON: temporary.json,
      "INPUT_FAIL-ON": "none",
      GITHUB_OUTPUT: temporary.output,
    });

    expect(code).toBe(0);
    const result = JSON.parse(await fs.readFile(temporary.json, "utf8"));
    expect(result.agent_usages[0].call_chain).toEqual([
      ".github/workflows/caller.yml#agent",
      ".github/workflows/bridge.yml#agent",
    ]);
    expect(
      result.findings.some((finding: { call_chain?: string[] }) =>
        finding.call_chain?.includes(".github/workflows/caller.yml#agent"),
      ),
    ).toBe(true);
  });

  it("keeps one incomplete-analysis diagnostic per reusable-workflow caller in Action JSON", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "agentci-callers-"));
    const workflows = path.join(root, ".github", "workflows");
    await fs.mkdir(workflows, { recursive: true });
    await fs.writeFile(
      path.join(workflows, "caller.yml"),
      `on: issue_comment
permissions:
  contents: read
jobs:
  first:
    uses: ./.github/workflows/agent.yml
  second:
    uses: ./.github/workflows/agent.yml
`,
    );
    await fs.writeFile(
      path.join(workflows, "agent.yml"),
      `on: workflow_call
jobs:
  agent:
    if: github.repository == 'owner/repo'
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@v1
`,
    );

    const temporary = await temporaryOutput();
    const code = await runAction({
      INPUT_PATH: root,
      INPUT_SARIF: temporary.sarif,
      INPUT_JSON: temporary.json,
      "INPUT_FAIL-ON": "none",
      GITHUB_OUTPUT: temporary.output,
    });

    expect(code).toBe(0);
    const result = JSON.parse(await fs.readFile(temporary.json, "utf8"));
    expect(result.analysis_complete).toBe(false);
    expect(
      result.diagnostics
        .filter(
          (diagnostic: { code: string }) =>
            diagnostic.code === "agentci/analysis-event-condition",
        )
        .map((diagnostic: { call_chain?: string[] }) => diagnostic.call_chain)
        .sort(),
    ).toEqual([
      [".github/workflows/caller.yml#first"],
      [".github/workflows/caller.yml#second"],
    ]);
  });

  it("reports invalid inputs as an Action error", async () => {
    const io = captureIo();
    const code = await runAction(
      {
        INPUT_PATH: "does-not-exist",
        INPUT_SARIF: "result.sarif",
        "INPUT_FAIL-ON": "none",
      },
      io,
    );

    expect(code).toBe(1);
    expect(io.errors).toEqual(["scan path is not a directory: does-not-exist"]);
  });

  it("fails on parse-error diagnostics without inventing a finding", async () => {
    const temporary = await temporaryOutput();
    const io = captureIo();
    const code = await runAction(
      {
        INPUT_PATH: "corpus/adversarial/cases/parse-error",
        INPUT_SARIF: temporary.sarif,
        INPUT_JSON: temporary.json,
        "INPUT_FAIL-ON": "none",
        GITHUB_OUTPUT: temporary.output,
      },
      io,
    );

    expect(code).toBe(1);
    expect(await fs.readFile(temporary.output, "utf8")).toContain("findings=0");
    expect(await fs.readFile(temporary.output, "utf8")).toContain(
      "analysis-complete=false",
    );
    const jsonBytes = await fs.readFile(temporary.json);
    expect(await fs.readFile(temporary.output, "utf8")).toContain(
      `json-sha256=${createHash("sha256").update(jsonBytes).digest("hex")}\n`,
    );
    expect(JSON.parse(await fs.readFile(temporary.json, "utf8"))).toMatchObject(
      {
        findings: [],
        analysis_complete: false,
        diagnostics: [{ code: "agentci/parse-error", severity: "error" }],
      },
    );
    expect(io.errors[0]).toContain("1 error diagnostic");
  });
});

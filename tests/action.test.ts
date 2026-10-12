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
    expect(manifest.inputs.json.default).toBe("agentci-results.json");
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

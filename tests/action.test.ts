import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runAction, type ActionIo } from "../src/action-runner.js";
import YAML from "yaml";

async function temporaryOutput(): Promise<{
  output: string;
  sarif: string;
}> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "agentci-action-"));
  const output = path.join(directory, "github-output");
  const sarif = path.join(directory, "result.sarif");
  await fs.writeFile(output, "", "utf8");
  return { output, sarif };
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
  });

  it("reads inputs, writes SARIF and outputs, and succeeds with fail-on none", async () => {
    const temporary = await temporaryOutput();
    const io = captureIo();
    const code = await runAction(
      {
        INPUT_PATH: "examples/vulnerable",
        INPUT_SARIF: temporary.sarif,
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
    expect(outputs).toContain("analysis-complete=true");
    expect(io.errors).toEqual([]);
  });

  it("writes outputs before returning a threshold failure", async () => {
    const temporary = await temporaryOutput();
    const io = captureIo();
    const code = await runAction(
      {
        INPUT_PATH: "examples/vulnerable",
        INPUT_SARIF: temporary.sarif,
        "INPUT_FAIL-ON": "high",
        GITHUB_OUTPUT: temporary.output,
      },
      io,
    );

    expect(code).toBe(2);
    expect(await fs.readFile(temporary.output, "utf8")).toContain("critical=");
    expect(io.errors[0]).toContain("at or above high");
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
    expect(io.errors[0]).toContain("1 error diagnostic");
  });
});

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { run, type CliIo } from "../src/cli.js";
import { parseFailOn } from "../src/options.js";
import packageJson from "../package.json" with { type: "json" };

function captureIo(): CliIo & { logs: string[]; errors: string[] } {
  const logs: string[] = [];
  const errors: string[] = [];
  return {
    logs,
    errors,
    log: (message) => logs.push(message),
    error: (message) => errors.push(message),
  };
}

const argv = (...args: string[]) => ["node", "agentci", ...args];

describe("agentci CLI, in process", () => {
  it("reports its version from package.json", async () => {
    const io = captureIo();
    expect(await run(argv("--version"), io)).toBe(0);
    expect(io.logs.join("\n")).toContain(packageJson.version);
  });

  it("prints help without failing", async () => {
    const io = captureIo();
    expect(await run(argv("--help"), io)).toBe(0);
    expect(io.logs.join("\n")).toContain("scan [options] [path]");
  });

  it("exits 2 when a finding meets the default high threshold", async () => {
    const io = captureIo();
    expect(await run(argv("scan", "examples/vulnerable"), io)).toBe(2);
    expect(io.logs.join("\n")).toContain("critical=2");
  });

  it("exits 0 for the hardened example and for fail-on none", async () => {
    expect(await run(argv("scan", "examples/hardened"), captureIo())).toBe(0);
    expect(
      await run(
        argv("scan", "examples/vulnerable", "--fail-on", "none"),
        captureIo(),
      ),
    ).toBe(0);
  });

  it("emits machine-readable JSON on request", async () => {
    const io = captureIo();
    await run(argv("scan", "examples/hardened", "--json"), io);
    const parsed = JSON.parse(io.logs.join("\n")) as {
      workflow_count: number;
      analysis_complete: boolean;
    };
    expect(parsed.workflow_count).toBeGreaterThan(0);
    expect(parsed.analysis_complete).toBe(true);
  });

  it("writes SARIF and Markdown to the requested paths", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "agentci-cli-"));
    const sarif = path.join(directory, "nested", "out.sarif");
    const markdown = path.join(directory, "nested", "report.md");
    const code = await run(
      argv(
        "scan",
        "examples/vulnerable",
        "--sarif",
        sarif,
        "--markdown",
        markdown,
        "--fail-on",
        "none",
      ),
      captureIo(),
    );
    expect(code).toBe(0);
    expect(JSON.parse(await fs.readFile(sarif, "utf8"))).toMatchObject({
      version: "2.1.0",
    });
    expect(await fs.readFile(markdown, "utf8")).toContain(
      "# AgentCI Guard Scan",
    );
  });

  it("appends GITHUB_OUTPUT lines when that variable is set", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "agentci-cli-"));
    const output = path.join(directory, "github-output");
    await fs.writeFile(output, "", "utf8");
    await run(
      argv("scan", "examples/hardened", "--fail-on", "none"),
      captureIo(),
      { GITHUB_OUTPUT: output },
    );
    const lines = await fs.readFile(output, "utf8");
    expect(lines).toContain("findings=0");
    expect(lines).toContain("analysis-complete=true");
  });

  it("exits 1 on a workflow parse error and still emits valid JSON", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "agentci-cli-"));
    await fs.mkdir(path.join(directory, ".github", "workflows"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(directory, ".github", "workflows", "broken.yml"),
      "on: [push\njobs:\n  x:\n    runs-on: ubuntu\n",
      "utf8",
    );
    const io = captureIo();
    expect(
      await run(argv("scan", directory, "--json", "--fail-on", "none"), io),
    ).toBe(1);
    const parsed = JSON.parse(io.logs.join("\n")) as {
      diagnostics: Array<{ code: string; severity: string }>;
      findings: unknown[];
    };
    expect(parsed.diagnostics).toEqual([
      expect.objectContaining({
        code: "agentci/parse-error",
        severity: "error",
      }),
    ]);
    expect(parsed.findings).toEqual([]);
  });

  it("rejects an unknown fail-on threshold", async () => {
    const io = captureIo();
    expect(await run(argv("scan", ".", "--fail-on", "bogus"), io)).toBe(1);
    expect(io.errors.join("\n")).toContain("fail-on must be one of");
    expect(() => parseFailOn("bogus")).toThrow(/fail-on must be one of/);
  });

  it("rejects a scan path that is not a directory", async () => {
    const io = captureIo();
    expect(await run(argv("scan", "/definitely/not/a/real/path"), io)).toBe(1);
    expect(io.errors.length).toBeGreaterThan(0);
  });

  it("explains a known rule and rejects an unknown one", async () => {
    const io = captureIo();
    expect(
      await run(argv("explain", "agentci/untrusted-ai-write-token"), io),
    ).toBe(0);
    expect(io.logs.join("\n")).toContain("Severity: critical");

    const unknown = captureIo();
    expect(await run(argv("explain", "agentci/nope"), unknown)).toBe(1);
    expect(unknown.errors.join("\n")).toContain("Unknown rule: agentci/nope");
  });

  it("reports usage errors through the error stream with a nonzero code", async () => {
    const io = captureIo();
    expect(await run(argv("scan", "--not-a-flag"), io)).not.toBe(0);
    expect(io.errors.join("\n")).toContain("unknown option");
  });
});

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { runAction, type ActionIo } from "../src/action-runner.js";
import { run, type CliIo } from "../src/cli.js";
import { scanRepository, scanWorkflow, toSarif } from "../src/index.js";

// Roadmap Day 3: an incomplete zero-finding scan must be distinguishable from a
// completed zero-finding scan in every supported output — JSON, text, Markdown,
// SARIF, the organization report, and the GitHub Action's log/outputs.

const REMOTE_REUSABLE = `
on: push
jobs:
  delegated:
    uses: example/shared/.github/workflows/ci.yml@v1
`;
const CLEAN = `
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test
`;
const BROKEN = "on: [push\njobs:\n  x:\n    runs-on: ubuntu\n";

async function repoWith(files: Record<string, string>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agentci-complete-"));
  await fs.mkdir(path.join(root, ".github", "workflows"), { recursive: true });
  for (const [name, raw] of Object.entries(files)) {
    await fs.writeFile(
      path.join(root, ".github", "workflows", name),
      raw,
      "utf8",
    );
  }
  return root;
}

describe("SARIF carries completeness and diagnostics", () => {
  it("marks an incomplete zero-finding scan as unsuccessful with a notification", async () => {
    const root = await repoWith({ "ci.yml": REMOTE_REUSABLE });
    const result = await scanRepository(root);
    expect(result.findings).toEqual([]);
    expect(result.analysis_complete).toBe(false);

    const sarif = toSarif(result);
    const run0 = sarif.runs[0];
    expect(run0.results).toEqual([]);
    expect(run0.invocations?.[0]?.executionSuccessful).toBe(false);
    const notes = run0.invocations?.[0]?.toolExecutionNotifications ?? [];
    expect(notes.length).toBe(result.diagnostics.length);
    expect(notes[0]?.descriptor?.id).toBe(
      "agentci/analysis-remote-reusable-workflow",
    );
    expect(notes[0]?.level).toBe("warning");
    expect(
      notes[0]?.locations?.[0]?.physicalLocation.artifactLocation.uri,
    ).toBe(".github/workflows/ci.yml");
    expect(run0.properties?.["agentci/analysisComplete"]).toBe(false);
  });

  it("marks a completed zero-finding scan as successful with no notifications", async () => {
    const root = await repoWith({ "ci.yml": CLEAN });
    const sarif = toSarif(await scanRepository(root));
    expect(sarif.runs[0].results).toEqual([]);
    expect(sarif.runs[0].invocations?.[0]?.executionSuccessful).toBe(true);
    expect(
      sarif.runs[0].invocations?.[0]?.toolExecutionNotifications ?? [],
    ).toEqual([]);
    expect(sarif.runs[0].properties?.["agentci/analysisComplete"]).toBe(true);
  });

  it("keeps findings and diagnostics distinct when both are present", async () => {
    const result = await scanRepository("examples/vulnerable");
    // The vulnerable example is complete; add an incomplete workflow beside it.
    const root = await repoWith({
      "agent.yml": await fs.readFile(
        "examples/vulnerable/.github/workflows/ai-agent.yml",
        "utf8",
      ),
      "delegated.yml": REMOTE_REUSABLE,
    });
    const mixed = await scanRepository(root);
    expect(mixed.findings.length).toBe(result.findings.length);
    expect(mixed.analysis_complete).toBe(false);
    const sarif = toSarif(mixed);
    expect(sarif.runs[0].results.length).toBe(mixed.findings.length);
    expect(sarif.runs[0].invocations?.[0]?.executionSuccessful).toBe(false);
    expect(
      sarif.runs[0].invocations?.[0]?.toolExecutionNotifications?.length,
    ).toBe(mixed.diagnostics.length);
  });

  it("reports a parse failure as an error-level notification", async () => {
    const root = await repoWith({ "broken.yml": BROKEN });
    const result = await scanRepository(root);
    const sarif = toSarif(result);
    expect(sarif.runs[0].invocations?.[0]?.executionSuccessful).toBe(false);
    const note =
      sarif.runs[0].invocations?.[0]?.toolExecutionNotifications?.[0];
    expect(note?.descriptor?.id).toBe("agentci/parse-error");
    expect(note?.level).toBe("error");
  });

  it("still accepts a bare findings array and then claims nothing about completeness", () => {
    const result = scanWorkflow(
      {
        path: ".github/workflows/x.yml",
        document: YAML.parse(CLEAN),
        raw: CLEAN,
      },
      ".",
    );
    const sarif = toSarif(result);
    expect(sarif.runs[0].results).toEqual([]);
    expect(sarif.runs[0].invocations).toBeUndefined();
    expect(sarif.runs[0].properties).toBeUndefined();
  });
});

describe("CLI and Action surface completeness", () => {
  function captureIo(): CliIo &
    ActionIo & { logs: string[]; errors: string[] } {
    const logs: string[] = [];
    const errors: string[] = [];
    return {
      logs,
      errors,
      log: (m) => logs.push(m),
      error: (m) => errors.push(m),
    };
  }

  it("CLI text output says the analysis was incomplete for a zero-finding scan", async () => {
    const root = await repoWith({ "ci.yml": REMOTE_REUSABLE });
    const io = captureIo();
    await run(["node", "agentci", "scan", root, "--fail-on", "none"], io);
    expect(io.logs.join("\n")).toMatch(/Analysis: incomplete/);
  });

  it("CLI --sarif writes completeness into the file", async () => {
    const root = await repoWith({ "ci.yml": REMOTE_REUSABLE });
    const out = path.join(root, "out.sarif");
    await run(
      ["node", "agentci", "scan", root, "--sarif", out, "--fail-on", "none"],
      captureIo(),
    );
    const sarif = JSON.parse(await fs.readFile(out, "utf8"));
    expect(sarif.runs[0].invocations[0].executionSuccessful).toBe(false);
  });

  it("Action emits a visible warning and analysis-complete=false, and exits 0 at fail-on none", async () => {
    const root = await repoWith({ "ci.yml": REMOTE_REUSABLE });
    const outputs = path.join(root, "gh-output");
    await fs.writeFile(outputs, "", "utf8");
    const summary = path.join(root, "gh-summary.md");
    await fs.writeFile(summary, "", "utf8");
    const io = captureIo();
    const code = await runAction(
      {
        INPUT_PATH: root,
        INPUT_SARIF: path.join(root, "a.sarif"),
        "INPUT_FAIL-ON": "none",
        GITHUB_OUTPUT: outputs,
        GITHUB_STEP_SUMMARY: summary,
      },
      io,
    );
    expect(code).toBe(0);
    expect(await fs.readFile(outputs, "utf8")).toContain(
      "analysis-complete=false",
    );
    expect(io.logs.join("\n")).toMatch(/::warning::.*incomplete/i);
    expect(io.errors).toEqual([]);
    expect(await fs.readFile(summary, "utf8")).toMatch(/incomplete/i);
  });
});

import { describe, expect, it } from "vitest";
import YAML from "yaml";
import {
  scanRepository,
  scanWorkflow,
  toSarif,
  type WorkflowFile,
} from "../src/index.js";

describe("scanRepository", () => {
  it("detects unsafe AI-agent workflow patterns", async () => {
    const result = await scanRepository("tests/fixtures");
    const rules = new Set(result.findings.map((finding) => finding.rule_id));

    expect(result.workflow_count).toBe(2);
    expect(rules).toContain("agentci/pull-request-target-ai");
    expect(rules).toContain("agentci/untrusted-ai-write-token");
    expect(rules).toContain("agentci/ai-with-secrets");
    expect(rules).toContain("agentci/untrusted-input-in-prompt");
    expect(rules).toContain("agentci/ai-shell-access");
    expect(rules).toContain("agentci/unsafe-checkout");
    expect(result.summary.critical).toBeGreaterThanOrEqual(2);
  });

  it("emits valid SARIF shape", async () => {
    const result = await scanRepository("tests/fixtures");
    const sarif = toSarif(result.findings);

    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0]?.tool.driver.name).toBe("AgentCI Guard");
    expect(sarif.runs[0]?.results.length).toBe(result.findings.length);
    for (const [index, entry] of (sarif.runs[0]?.results ?? []).entries()) {
      const finding = result.findings[index];
      expect(entry.locations[0]?.physicalLocation.region?.startLine).toBe(
        finding?.line,
      );
      expect(entry.properties["agentci/severity"]).toBe(finding?.severity);
      expect(entry.properties["agentci/reachableEvents"]).toEqual(
        finding?.reachable_events ?? [],
      );
      expect(entry.properties["agentci/stepIndex"]).toBe(finding?.step_index);
      expect(
        entry.locations[0]?.physicalLocation.region?.startLine ?? 0,
      ).toBeGreaterThan(1);
    }
  });

  it("locates the exact job and duplicate-name step by YAML structure", () => {
    const raw = `on: push
jobs:
  first:
    runs-on: ubuntu-latest
    env:
      target: decoy
    steps:
      - run: echo safe
  target:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Duplicate
        run: echo safe
      - name: Duplicate
        run: claude -p "review"
`;
    const workflow: WorkflowFile = {
      path: "/repo/.github/workflows/test.yml",
      raw,
      document: YAML.parse(raw),
    };
    const findings = scanWorkflow(workflow, "/repo");
    const jobFinding = findings.find(
      (finding) => finding.rule_id === "agentci/broad-write-permissions",
    );
    const stepFinding = findings.find(
      (finding) => finding.rule_id === "agentci/ai-shell-access",
    );
    const lines = raw.split("\n");
    expect(jobFinding?.line).toBe(
      lines.findIndex((line) => line === "  target:") + 1,
    );
    expect(stepFinding?.line).toBe(
      lines
        .map((line, index) => ({ line, number: index + 1 }))
        .filter(({ line }) => line === "      - name: Duplicate")[1]?.number,
    );
  });

  it("fails when an explicit config path is missing", async () => {
    await expect(
      scanRepository("tests/fixtures", {
        configPath: "tests/fixtures/does-not-exist.json",
      }),
    ).rejects.toThrow("Unable to read config file");
  });

  it("reports malformed YAML as a diagnostic, not a security finding", async () => {
    const result = await scanRepository("corpus/adversarial/cases/parse-error");

    expect(result.findings).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "agentci/parse-error",
        kind: "parse",
      }),
    ]);
    expect(result.analysis_complete).toBe(false);
  });
});

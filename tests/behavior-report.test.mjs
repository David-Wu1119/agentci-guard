import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const script = fileURLToPath(
  new URL("../scripts/benchmark/report-behavior.mjs", import.meta.url),
);

it("reports attribution-only changes in the behavioral diff", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "agentci-behavior-"));
  const beforePath = path.join(directory, "before.json");
  const afterPath = path.join(directory, "after.json");
  const finding = {
    rule_id: "agentci/ai-shell-access",
    severity: "high",
    file: "wf.yml",
    job: "agent",
    step: "same name",
    step_index: 0,
    line: 5,
  };
  const diagnostic = {
    code: "agentci/analysis-agent-event-unknown",
    severity: "warning",
    file: "wf.yml",
    job: "agent",
    step_index: 0,
    line: 5,
  };
  const cases = [
    [
      "finding-step",
      { findings: [finding] },
      { findings: [{ ...finding, step_index: 1 }] },
    ],
    [
      "finding-line",
      { findings: [finding] },
      { findings: [{ ...finding, line: 6 }] },
    ],
    [
      "diagnostic-step",
      { diagnostics: [diagnostic] },
      { diagnostics: [{ ...diagnostic, step_index: 1 }] },
    ],
    [
      "diagnostic-line",
      { diagnostics: [diagnostic] },
      { diagnostics: [{ ...diagnostic, line: 6 }] },
    ],
    [
      "diagnostic-severity",
      { diagnostics: [diagnostic] },
      { diagnostics: [{ ...diagnostic, severity: "error" }] },
    ],
    [
      "diagnostic-multiplicity",
      { diagnostics: [diagnostic] },
      { diagnostics: [diagnostic, diagnostic] },
    ],
  ];
  const record = (caseId, data) => ({
    case_id: caseId,
    repository: "example/repo",
    scanned: true,
    analysis_complete: false,
    findings: data.findings ?? [],
    diagnostics: data.diagnostics ?? [],
    by_severity: {
      critical: 0,
      high: data.findings?.length ?? 0,
      medium: 0,
      low: 0,
    },
  });
  const meta = {
    commit: "abcdef123456",
    scanner_version: "test",
    dist_cli_sha256: "test",
    report_schema_version: 2,
  };
  try {
    writeFileSync(
      beforePath,
      JSON.stringify({
        meta,
        cases: cases.map(([id, before]) => record(id, before)),
      }),
    );
    writeFileSync(
      afterPath,
      JSON.stringify({
        meta,
        cases: cases.map(([id, , after]) => record(id, after)),
      }),
    );
    const output = execFileSync(
      process.execPath,
      [script, "--compare", beforePath, afterPath],
      { encoding: "utf8" },
    );
    for (const [id] of cases)
      expect(output).toContain(`## ${id} (example/repo)`);
    expect(output).toContain("6 of 6 cases changed.");
    expect(output).toMatch(
      /## diagnostic-multiplicity \(example\/repo\)\n- diagnostic added:/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("rejects comparisons with an old or unknown report schema", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "agentci-behavior-"));
  const beforePath = path.join(directory, "before.json");
  const afterPath = path.join(directory, "after.json");
  const meta = { commit: "abcdef123456", scanner_version: "test" };
  try {
    for (const [beforeVersion, afterVersion] of [
      [undefined, 2],
      [1, 2],
      [1, 1],
    ]) {
      writeFileSync(
        beforePath,
        JSON.stringify({
          meta: { ...meta, report_schema_version: beforeVersion },
          cases: [],
        }),
      );
      writeFileSync(
        afterPath,
        JSON.stringify({
          meta: { ...meta, report_schema_version: afterVersion },
          cases: [],
        }),
      );
      const result = spawnSync(
        process.execPath,
        [script, "--compare", beforePath, afterPath],
        { encoding: "utf8" },
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Unsupported behavioral report schema");
      expect(result.stderr).toContain(`before: ${beforeVersion ?? "missing"}`);
      expect(result.stderr).toContain(`after: ${afterVersion}`);
      expect(result.stderr).toContain(
        "Regenerate both reports with this reporter",
      );
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

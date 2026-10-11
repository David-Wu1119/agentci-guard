import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RULES } from "../src/rules.js";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const generator = path.join(
  repositoryRoot,
  "scripts/benchmark/generate-annotation-sheet.mjs",
);
const jobRules = [
  "agentci/untrusted-ai-write-token",
  "agentci/gated-ai-write-token",
  "agentci/pull-request-target-ai",
  "agentci/ai-with-secrets",
  "agentci/broad-write-permissions",
];
const stepRules = [
  "agentci/untrusted-input-in-prompt",
  "agentci/ai-shell-access",
  "agentci/unpinned-ai-action",
  "agentci/unsafe-checkout",
];

describe("synthetic future-registry generation", () => {
  it("emits blank units for every current rule without changing frozen v3", () => {
    const temporary = fs.mkdtempSync(
      path.join(os.tmpdir(), "agentci-registry-synthetic-"),
    );
    try {
      const snapshot = path.join(temporary, "synthetic.yml");
      const manifestPath = path.join(temporary, "manifest.json");
      const outputPath = path.join(temporary, "annotation-sheet.csv");
      fs.writeFileSync(
        snapshot,
        "on: issue_comment\njobs:\n  triage:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Run agent\n        uses: anthropics/claude-code-action@v1\n  delegate:\n    uses: owner/repo/.github/workflows/reusable.yml@main\n",
      );
      expect(new Set([...jobRules, ...stepRules])).toEqual(
        new Set(Object.keys(RULES)),
      );
      fs.writeFileSync(
        manifestPath,
        JSON.stringify({
          benchmark_id: "synthetic-future-registry",
          agent_detection_task: "agentci/agent-usage",
          rules: Object.keys(RULES),
          task_granularity: Object.fromEntries([
            ["agentci/agent-usage", "step"],
            ...jobRules.map((rule) => [rule, "job"]),
            ...stepRules.map((rule) => [rule, "step"]),
          ]),
          cases: [
            {
              case_id: "synthetic-001",
              split: "dev",
              stratum: "synthetic",
              repository: "example/synthetic",
              source_commit: "0".repeat(40),
              source_path: ".github/workflows/synthetic.yml",
              snapshot_path: snapshot,
            },
          ],
        }),
      );
      expect(() => run("--check", manifestPath, outputPath)).toThrow();
      const incompleteManifestPath = path.join(temporary, "incomplete.json");
      const incompleteManifest = JSON.parse(
        fs.readFileSync(manifestPath, "utf8"),
      );
      incompleteManifest.rules = incompleteManifest.rules.filter(
        (rule: string) => rule !== "agentci/gated-ai-write-token",
      );
      delete incompleteManifest.task_granularity[
        "agentci/gated-ai-write-token"
      ];
      fs.writeFileSync(
        incompleteManifestPath,
        JSON.stringify(incompleteManifest),
      );
      expect(() => run("--check", incompleteManifestPath, outputPath)).toThrow(
        /current scanner rules/i,
      );
      const wrongAgentTaskPath = path.join(temporary, "wrong-agent-task.json");
      const wrongAgentTask = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      wrongAgentTask.agent_detection_task = "agentci/other-agent-usage";
      delete wrongAgentTask.task_granularity["agentci/agent-usage"];
      wrongAgentTask.task_granularity["agentci/other-agent-usage"] = "step";
      fs.writeFileSync(wrongAgentTaskPath, JSON.stringify(wrongAgentTask));
      expect(() => run("--check", wrongAgentTaskPath, outputPath)).toThrow(
        /agent detection task/i,
      );
      for (const [rule, scope] of [
        ["agentci/gated-ai-write-token", "step"],
        ["agentci/untrusted-input-in-prompt", "job"],
      ]) {
        const wrongScopePath = path.join(temporary, `${scope}-scope.json`);
        const wrongScope = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        wrongScope.task_granularity[rule] = scope;
        fs.writeFileSync(wrongScopePath, JSON.stringify(wrongScope));
        expect(() => run("--check", wrongScopePath, outputPath)).toThrow(
          /current rule scopes/i,
        );
      }
      expect(() =>
        run(
          "--write",
          manifestPath,
          path.join(repositoryRoot, "benchmark/annotation-sheet.csv"),
        ),
      ).toThrow(/frozen v3/i);
      run("--write", manifestPath, outputPath);
      run("--check", manifestPath, outputPath);
      const firstOutput = fs.readFileSync(outputPath, "utf8");
      expect(() => run("--write", manifestPath, outputPath)).toThrow(
        /existing registry/i,
      );
      expect(fs.readFileSync(outputPath, "utf8")).toBe(firstOutput);

      const [header, ...data] = fs
        .readFileSync(outputPath, "utf8")
        .trim()
        .split("\n")
        .map((line) => line.split(","));
      const rows = data.map((cells) =>
        Object.fromEntries(header.map((field, index) => [field, cells[index]])),
      );
      expect(rows).toHaveLength(20);
      expect(new Set(rows.map((row) => row.rule_id))).toEqual(
        new Set(["agentci/agent-usage", ...Object.keys(RULES)]),
      );
      expect(
        rows.filter((row) => row.rule_id === "agentci/gated-ai-write-token"),
      ).toHaveLength(2);
      expect(rows.filter((row) => row.scope === "reusable-call")).toHaveLength(
        5,
      );
      expect(rows.every((row) => row.ground_truth === "")).toBe(true);
      expect(rows.every((row) => row.evidence_lines === "")).toBe(true);
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  });
});

function run(mode: "--check" | "--write", manifest: string, output: string) {
  return execFileSync(process.execPath, [generator, mode, manifest, output], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: "pipe",
  });
}

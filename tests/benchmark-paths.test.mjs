import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

describe("benchmark checkout paths", () => {
  it.each(["plain", "space repo", "中文", "percent%20%2F", "hash#repo"])(
    "loads context and generates blank sheets in %s",
    (directory) => {
      const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "agentci-path-"));
      try {
        const root = path.join(fs.realpathSync(temporary), directory);
        const scripts = path.join(root, "scripts/benchmark");
        const benchmark = path.join(root, "benchmark");
        fs.mkdirSync(scripts, { recursive: true });
        fs.mkdirSync(benchmark);
        fs.mkdirSync(path.join(root, "node_modules"));
        fs.symlinkSync(
          path.join(repositoryRoot, "node_modules/yaml"),
          path.join(root, "node_modules/yaml"),
          "dir",
        );
        for (const name of [
          "annotation-lib.mjs",
          "unit-id.mjs",
          "csv.mjs",
          "generate-annotation-sheet.mjs",
          "generate-review-sheet.mjs",
          "generate-pilot-sheet.mjs",
        ]) {
          fs.copyFileSync(
            path.join(repositoryRoot, "scripts/benchmark", name),
            path.join(scripts, name),
          );
        }
        fs.writeFileSync(
          path.join(benchmark, "synthetic.yml"),
          "on: push\njobs:\n  test:\n    steps:\n      - run: echo synthetic\n",
        );
        fs.writeFileSync(
          path.join(benchmark, "manifest.json"),
          JSON.stringify({
            benchmark_id: "synthetic-path-check",
            status: "unlabeled",
            agent_detection_task: "agentci/agent-usage",
            rules: [],
            task_granularity: { "agentci/agent-usage": "step" },
            independent_review_plan: {
              always_review_tasks: ["agentci/agent-usage"],
            },
            cases: [
              {
                case_id: "synthetic-001",
                split: "dev",
                stratum: "synthetic",
                repository: "example/synthetic",
                source_commit: "0".repeat(40),
                source_path: ".github/workflows/synthetic.yml",
                snapshot_path: "benchmark/synthetic.yml",
              },
            ],
          }),
        );
        for (const name of [
          "generate-annotation-sheet.mjs",
          "generate-review-sheet.mjs",
          "generate-pilot-sheet.mjs",
        ]) {
          for (const mode of ["--write", "--check"]) {
            execFileSync(process.execPath, [path.join(scripts, name), mode], {
              cwd: temporary,
              stdio: "pipe",
            });
          }
        }
        const context = execFileSync(
          process.execPath,
          [
            "--input-type=module",
            "-e",
            `const m = await import(process.argv[1]);
             const c = m.loadContext();
             console.log(JSON.stringify({ root: m.repositoryRoot,
               benchmark: m.benchmarkRoot, units: c.registryRows.length,
               groundTruth: c.registryRows[0].ground_truth }));`,
            pathToFileURL(path.join(scripts, "annotation-lib.mjs")).href,
          ],
          { cwd: temporary, encoding: "utf8", stdio: "pipe" },
        );
        expect(JSON.parse(context)).toEqual({
          root,
          benchmark,
          units: 1,
          groundTruth: "",
        });
      } finally {
        fs.rmSync(temporary, { recursive: true, force: true });
      }
    },
  );
});

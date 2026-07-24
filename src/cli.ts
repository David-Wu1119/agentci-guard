#!/usr/bin/env node
import fs from "node:fs/promises";
import { Command } from "commander";
import pc from "picocolors";
import {
  formatGithubOutputs,
  renderMarkdownReport,
  renderTextReport,
  scanRepository,
  toSarif,
  hasFindingAtOrAbove,
} from "./index.js";
import { parseFailOn } from "./options.js";
import type { Severity } from "./types.js";

type ScanOptions = {
  json?: boolean;
  markdown?: string;
  sarif?: string;
  config?: string;
  failOn: "none" | Severity;
};

async function main(): Promise<void> {
  const program = new Command()
    .name("agentci")
    .description("Scan CI/CD workflows for unsafe AI coding-agent usage.")
    .version("0.1.1");

  program
    .command("scan")
    .description(
      "Scan a repository for unsafe AI-agent GitHub Actions patterns.",
    )
    .argument("[path]", "Repository path.", ".")
    .option("--json", "Print JSON output.", false)
    .option("--markdown <path>", "Write a Markdown report.")
    .option("--sarif <path>", "Write SARIF output.")
    .option(
      "--config <path>",
      "Path to an agentci config JSON file (default: agentci.config.json in the scan path).",
    )
    .option(
      "--fail-on <severity>",
      "Fail at or above severity: none, low, medium, high, critical.",
      "high",
    )
    .action(async (target: string, options: ScanOptions) => {
      const failOn = parseFailOn(options.failOn);
      const result = await scanRepository(target, {
        configPath: options.config,
      });

      if (options.sarif)
        await fs.writeFile(
          options.sarif,
          `${JSON.stringify(toSarif(result.findings), null, 2)}\n`,
          "utf8",
        );
      if (options.markdown)
        await fs.writeFile(
          options.markdown,
          renderMarkdownReport(result),
          "utf8",
        );

      if (options.json) console.log(JSON.stringify(result, null, 2));
      else console.log(renderTextReport(result));

      if (process.env.GITHUB_OUTPUT)
        await fs.appendFile(
          process.env.GITHUB_OUTPUT,
          formatGithubOutputs(result, options.sarif),
          "utf8",
        );

      if (
        result.diagnostics.some((diagnostic) => diagnostic.severity === "error")
      ) {
        process.exitCode = 1;
        return;
      }

      if (failOn !== "none" && hasFindingAtOrAbove(result.findings, failOn)) {
        process.exitCode = 2;
      }
    });

  program
    .command("explain")
    .description("Explain a rule by ID.")
    .argument(
      "<rule-id>",
      "Rule ID, for example agentci/untrusted-ai-write-token.",
    )
    .action(async (ruleId: string) => {
      const { RULES } = await import("./rules.js");
      const rule = RULES[ruleId];
      if (!rule) throw new Error(`Unknown rule: ${ruleId}`);
      console.log(pc.bold(rule.title));
      console.log(`Severity: ${rule.severity}`);
      console.log("");
      console.log(rule.why);
      console.log("");
      console.log("Fix:");
      for (const fix of rule.fix) console.log(`- ${fix}`);
    });

  await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  console.error(pc.red(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});

#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Command, CommanderError } from "commander";
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
import { RULES } from "./rules.js";
import type { Severity } from "./types.js";
import packageJson from "../package.json" with { type: "json" };

type ScanOptions = {
  json?: boolean;
  markdown?: string;
  sarif?: string;
  config?: string;
  failOn: "none" | Severity;
};

export type CliIo = {
  log(message: string): void;
  error(message: string): void;
};

const DEFAULT_IO: CliIo = {
  log: (message) => console.log(message),
  error: (message) => console.error(pc.red(message)),
};

/**
 * Run the CLI against a full argv (including the node and script entries) and
 * return the process exit code instead of setting it, so the command surface
 * can be exercised in-process by tests as well as from the bin wrapper.
 */
export async function run(
  argv: string[],
  io: CliIo = DEFAULT_IO,
  environment: Record<string, string | undefined> = process.env,
): Promise<number> {
  let exitCode = 0;
  const program = new Command()
    .name("agentci")
    .description("Scan CI/CD workflows for unsafe AI coding-agent usage.")
    .version(packageJson.version)
    .exitOverride()
    .configureOutput({
      writeOut: (text) => io.log(text.trimEnd()),
      writeErr: (text) => io.error(text.trimEnd()),
    });

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

      if (options.sarif) {
        await fs.mkdir(path.dirname(path.resolve(options.sarif)), {
          recursive: true,
        });
        await fs.writeFile(
          options.sarif,
          `${JSON.stringify(toSarif(result.findings), null, 2)}\n`,
          "utf8",
        );
      }
      if (options.markdown) {
        await fs.mkdir(path.dirname(path.resolve(options.markdown)), {
          recursive: true,
        });
        await fs.writeFile(
          options.markdown,
          renderMarkdownReport(result),
          "utf8",
        );
      }

      io.log(
        options.json
          ? JSON.stringify(result, null, 2)
          : renderTextReport(result),
      );

      if (environment.GITHUB_OUTPUT) {
        await fs.appendFile(
          environment.GITHUB_OUTPUT,
          formatGithubOutputs(result, options.sarif),
          "utf8",
        );
      }

      if (
        result.diagnostics.some((diagnostic) => diagnostic.severity === "error")
      ) {
        exitCode = 1;
        return;
      }
      if (failOn !== "none" && hasFindingAtOrAbove(result.findings, failOn)) {
        exitCode = 2;
      }
    });

  program
    .command("explain")
    .description("Explain a rule by ID.")
    .argument(
      "<rule-id>",
      "Rule ID, for example agentci/untrusted-ai-write-token.",
    )
    .action((ruleId: string) => {
      const rule = RULES[ruleId];
      if (!rule) throw new Error(`Unknown rule: ${ruleId}`);
      io.log(
        [
          pc.bold(rule.title),
          `Severity: ${rule.severity}`,
          "",
          rule.why,
          "",
          "Fix:",
          ...rule.fix.map((fix) => `- ${fix}`),
        ].join("\n"),
      );
    });

  try {
    await program.parseAsync(argv);
  } catch (error) {
    // Commander routes --help, --version, and usage errors through here once
    // exitOverride is set; its exit code is already the right one.
    if (error instanceof CommanderError) return error.exitCode;
    io.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
  return exitCode;
}

const invokedAsScript =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedAsScript) {
  run(process.argv).then((code) => {
    process.exitCode = code;
  });
}

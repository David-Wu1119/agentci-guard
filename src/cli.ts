#!/usr/bin/env node
import { realpathSync } from "node:fs";
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
import { renderOrgMarkdownReport, scanOrganization } from "./org.js";
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
export type CliDeps = {
  /** Injected for tests; defaults to the global fetch. */
  fetch?: typeof fetch;
};

type OrgOptions = {
  json?: boolean;
  markdown?: string;
  sarif?: string;
  token?: string;
  includeArchived?: boolean;
  includeForks?: boolean;
  failOn: "none" | Severity;
};

export async function run(
  argv: string[],
  io: CliIo = DEFAULT_IO,
  environment: Record<string, string | undefined> = process.env,
  deps: CliDeps = {},
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
          `${JSON.stringify(toSarif(result), null, 2)}\n`,
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
    .command("org")
    .description(
      "Scan every repository in a GitHub organization or user account without cloning; the audit deliverable.",
    )
    .argument("<org>", "GitHub organization or user login.")
    .option("--json", "Print JSON output.", false)
    .option("--markdown <path>", "Write the organization report as Markdown.")
    .option(
      "--sarif <path>",
      "Write SARIF output (files prefixed by repository).",
    )
    .option(
      "--token <token>",
      "GitHub token; defaults to GITHUB_TOKEN. Unauthenticated calls are limited to 60/hour.",
    )
    .option("--include-archived", "Also scan archived repositories.", false)
    .option("--include-forks", "Also scan forks.", false)
    .option(
      "--fail-on <severity>",
      "Fail at or above severity: none, low, medium, high, critical.",
      "high",
    )
    .action(async (org: string, options: OrgOptions) => {
      const failOn = parseFailOn(options.failOn);
      const result = await scanOrganization(org, {
        token: options.token ?? environment.GITHUB_TOKEN,
        includeArchived: options.includeArchived,
        includeForks: options.includeForks,
        fetch: deps.fetch,
      });

      if (options.sarif) {
        await fs.mkdir(path.dirname(path.resolve(options.sarif)), {
          recursive: true,
        });
        await fs.writeFile(
          options.sarif,
          `${JSON.stringify(toSarif(result), null, 2)}\n`,
          "utf8",
        );
      }
      if (options.markdown) {
        await fs.mkdir(path.dirname(path.resolve(options.markdown)), {
          recursive: true,
        });
        await fs.writeFile(
          options.markdown,
          renderOrgMarkdownReport(result),
          "utf8",
        );
      }

      io.log(
        options.json
          ? JSON.stringify(result, null, 2)
          : renderOrgMarkdownReport(result),
      );

      // Same contract as `scan` and the Action: an error diagnostic (a workflow
      // that failed to parse, a repository that could not be fetched) exits 1
      // regardless of --fail-on, because a report with holes must not read as
      // clean. Error outranks the finding threshold.
      const fetchFailures = result.repositories.filter((entry) =>
        entry.skipped?.startsWith("fetch failed"),
      );
      const scanErrors = result.diagnostics.filter(
        (diagnostic) =>
          diagnostic.severity === "error" &&
          diagnostic.code !== "agentci/org-fetch-failed",
      );
      if (fetchFailures.length > 0 || scanErrors.length > 0) {
        const reasons: string[] = [];
        if (fetchFailures.length > 0) {
          reasons.push(
            `${fetchFailures.length} repositor${fetchFailures.length === 1 ? "y" : "ies"} could not be fetched; see the Skipped section`,
          );
        }
        if (scanErrors.length > 0) {
          reasons.push(
            `${scanErrors.length} workflow(s) failed to parse or analyze; see the Incomplete analysis section`,
          );
        }
        io.error(`${reasons.join(". ")}.`);
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

/**
 * Whether this module is the script Node was asked to run. Node resolves the
 * main module through symlinks before setting `import.meta.url`, but leaves
 * `process.argv[1]` as given, so the two must be compared after resolving the
 * argv path the same way. Without that, `npm install -g` (whose bin entry is
 * a symlink) and any symlinked directory such as macOS `/tmp` made the CLI
 * load, do nothing, and exit 0.
 */
export function isInvokedAsScript(
  moduleUrl: string,
  argv1: string | undefined,
): boolean {
  if (argv1 === undefined) return false;
  const resolved = path.resolve(argv1);
  let real = resolved;
  try {
    real = realpathSync(resolved);
  } catch {
    // Not on disk (bundled or virtual); fall back to the plain comparison.
  }
  return (
    moduleUrl === pathToFileURL(real).href ||
    moduleUrl === pathToFileURL(resolved).href
  );
}

if (isInvokedAsScript(import.meta.url, process.argv[1])) {
  run(process.argv).then((code) => {
    process.exitCode = code;
  });
}

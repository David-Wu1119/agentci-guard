import fs from "node:fs/promises";
import path from "node:path";
import {
  formatGithubOutputs,
  hasFindingAtOrAbove,
  renderTextReport,
  scanRepository,
  toSarif,
} from "./index.js";
import { parseFailOn } from "./options.js";

export type ActionEnvironment = Record<string, string | undefined>;

export type ActionIo = {
  log(message: string): void;
  error(message: string): void;
};

const DEFAULT_IO: ActionIo = {
  log: (message) => console.log(message),
  error: (message) => console.error(`::error::${escapeCommand(message)}`),
};

/**
 * Execute the JavaScript Action from INPUT_* variables.
 *
 * The return value is an exit code so tests can exercise threshold and error
 * behavior without mutating the Vitest process.
 */
export async function runAction(
  environment: ActionEnvironment = process.env,
  io: ActionIo = DEFAULT_IO,
): Promise<number> {
  try {
    const target = input(environment, "PATH", ".");
    const sarifPath = input(environment, "SARIF", "agentci-results.sarif");
    const failOn = parseFailOn(
      input(environment, "FAIL-ON", "high").toLowerCase(),
    );

    if (!target.trim()) throw new Error("path input must not be empty.");
    if (!sarifPath.trim()) throw new Error("sarif input must not be empty.");
    if (/[\r\n]/.test(target) || /[\r\n]/.test(sarifPath)) {
      throw new Error("path and sarif inputs must be single-line values.");
    }

    const targetStat = await fs.stat(path.resolve(target)).catch(() => null);
    if (!targetStat?.isDirectory()) {
      throw new Error(`scan path is not a directory: ${target}`);
    }

    const result = await scanRepository(target);
    const resolvedSarif = path.resolve(sarifPath);
    await fs.mkdir(path.dirname(resolvedSarif), { recursive: true });
    await fs.writeFile(
      resolvedSarif,
      `${JSON.stringify(toSarif(result.findings), null, 2)}\n`,
      "utf8",
    );

    io.log(renderTextReport(result));

    const outputFile = environment.GITHUB_OUTPUT;
    if (outputFile) {
      await fs.appendFile(
        outputFile,
        formatGithubOutputs(result, sarifPath),
        "utf8",
      );
    }

    const errorDiagnostics = result.diagnostics.filter(
      (diagnostic) => diagnostic.severity === "error",
    );
    if (errorDiagnostics.length > 0) {
      io.error(
        `AgentCI Guard could not analyze every workflow: ${errorDiagnostics.length} error diagnostic(s).`,
      );
      return 1;
    }

    if (failOn !== "none" && hasFindingAtOrAbove(result.findings, failOn)) {
      io.error(
        `AgentCI Guard found ${result.findings.length} finding(s), including one at or above ${failOn}.`,
      );
      return 2;
    }
    return 0;
  } catch (error) {
    io.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function input(
  environment: ActionEnvironment,
  name: string,
  fallback: string,
): string {
  // GitHub preserves hyphens in JavaScript Action input environment names.
  // Accept an underscore alias as well for local runners and test harnesses.
  return (
    environment[`INPUT_${name}`] ??
    environment[`INPUT_${name.replaceAll("-", "_")}`] ??
    fallback
  ).trim();
}

function escapeCommand(message: string): string {
  return message
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}

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
    // The runner passes an omitted optional input as an empty environment value.
    const jsonInput = environment.INPUT_JSON;
    const jsonPath = jsonInput?.trim();
    const failOn = parseFailOn(
      input(environment, "FAIL-ON", "high").toLowerCase(),
    );

    if (!target.trim()) throw new Error("path input must not be empty.");
    if (!sarifPath.trim()) throw new Error("sarif input must not be empty.");
    if (jsonInput && !jsonPath)
      throw new Error("json input must not be empty.");
    if (
      /[\r\n]/.test(target) ||
      /[\r\n]/.test(sarifPath) ||
      (jsonInput && /[\r\n]/.test(jsonInput))
    ) {
      throw new Error(
        "path, sarif and json inputs must be single-line values.",
      );
    }
    if (jsonPath && path.resolve(jsonPath) === path.resolve(sarifPath)) {
      throw new Error("json and sarif inputs must refer to different files.");
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
      `${JSON.stringify(toSarif(result), null, 2)}\n`,
      "utf8",
    );
    if (jsonPath) {
      const resolvedJson = path.resolve(jsonPath);
      await fs.mkdir(path.dirname(resolvedJson), { recursive: true });
      await fs.writeFile(
        resolvedJson,
        `${JSON.stringify(result, null, 2)}\n`,
        "utf8",
      );
    }

    io.log(renderTextReport(result));

    if (!result.analysis_complete) {
      // A workflow command on stdout: GitHub renders it as an annotation, so a
      // zero-finding step cannot look clean when the analysis did not finish.
      const codes = [
        ...new Set(result.diagnostics.map((diagnostic) => diagnostic.code)),
      ].join(", ");
      const warning = `AgentCI Guard analysis incomplete: ${result.diagnostics.length} diagnostic(s) (${codes}). A zero-finding result from an incomplete analysis is not a clean result.`;
      io.log(`::warning::${escapeCommand(warning)}`);
      if (environment.GITHUB_STEP_SUMMARY) {
        await fs.appendFile(
          environment.GITHUB_STEP_SUMMARY,
          `> **Warning:** ${warning}\n`,
          "utf8",
        );
      }
    }

    const outputFile = environment.GITHUB_OUTPUT;
    if (outputFile) {
      await fs.appendFile(
        outputFile,
        `${formatGithubOutputs(result, sarifPath)}${jsonPath ? `json-path=${jsonPath}\n` : ""}`,
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

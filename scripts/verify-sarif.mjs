#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const sarifPath = process.argv[2];
if (!sarifPath) {
  console.error(
    "Usage: node scripts/verify-sarif.mjs <file.sarif> (optional EXPECT_* count variables)",
  );
  process.exit(2);
}

const severityToLevel = {
  low: "note",
  medium: "warning",
  high: "error",
  critical: "error",
};
const severityCounts = {
  low: 0,
  medium: 0,
  high: 0,
  critical: 0,
};
const errors = [];
let document;

try {
  document = JSON.parse(fs.readFileSync(sarifPath, "utf8"));
} catch (error) {
  console.error(
    `${sarifPath}: unable to parse SARIF JSON: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
}

if (document.version !== "2.1.0") {
  errors.push(`version must be 2.1.0, got ${String(document.version)}`);
}
if (
  typeof document.$schema !== "string" ||
  !document.$schema.includes("sarif")
) {
  errors.push("$schema must identify a SARIF schema");
}
if (!Array.isArray(document.runs) || document.runs.length !== 1) {
  errors.push("runs must contain exactly one run");
}

const run = document.runs?.[0];
const driver = run?.tool?.driver;
if (driver?.name !== "AgentCI Guard") {
  errors.push("tool.driver.name must be AgentCI Guard");
}
if (!Array.isArray(driver?.rules)) {
  errors.push("tool.driver.rules must be an array");
}
if (!Array.isArray(run?.results)) {
  errors.push("run.results must be an array");
}

const ruleIds = new Set();
for (const [index, rule] of (driver?.rules ?? []).entries()) {
  if (!rule || typeof rule.id !== "string" || rule.id.length === 0) {
    errors.push(`rules[${index}].id must be a non-empty string`);
    continue;
  }
  if (ruleIds.has(rule.id)) {
    errors.push(`duplicate rule metadata for ${rule.id}`);
  }
  ruleIds.add(rule.id);
}

for (const [index, result] of (run?.results ?? []).entries()) {
  const prefix = `results[${index}]`;
  if (
    !result ||
    typeof result.ruleId !== "string" ||
    result.ruleId.length === 0
  ) {
    errors.push(`${prefix}.ruleId must be a non-empty string`);
  } else if (!ruleIds.has(result.ruleId)) {
    errors.push(`${prefix}.ruleId ${result.ruleId} has no rule metadata`);
  }
  if (
    typeof result?.message?.text !== "string" ||
    result.message.text.length === 0
  ) {
    errors.push(`${prefix}.message.text must be a non-empty string`);
  }

  const severity = result?.properties?.["agentci/severity"];
  if (!Object.hasOwn(severityToLevel, severity)) {
    errors.push(`${prefix} has invalid agentci/severity ${String(severity)}`);
  } else {
    severityCounts[severity] += 1;
    if (result.level !== severityToLevel[severity]) {
      errors.push(
        `${prefix}.level ${String(result.level)} does not match ${severity}`,
      );
    }
  }

  const reachableEvents = result?.properties?.["agentci/reachableEvents"];
  if (
    !Array.isArray(reachableEvents) ||
    reachableEvents.some(
      (event) => typeof event !== "string" || event.length === 0,
    )
  ) {
    errors.push(
      `${prefix}.properties.agentci/reachableEvents must be a string array`,
    );
  }
  const stepIndex = result?.properties?.["agentci/stepIndex"];
  if (
    stepIndex !== undefined &&
    (!Number.isInteger(stepIndex) || stepIndex < 0)
  ) {
    errors.push(`${prefix}.properties.agentci/stepIndex must be non-negative`);
  }

  const locations = result?.locations;
  if (!Array.isArray(locations) || locations.length !== 1) {
    errors.push(`${prefix}.locations must contain exactly one location`);
    continue;
  }
  const physical = locations[0]?.physicalLocation;
  const uri = physical?.artifactLocation?.uri;
  if (typeof uri !== "string" || uri.length === 0 || path.isAbsolute(uri)) {
    errors.push(`${prefix} artifact URI must be a non-empty relative path`);
  }
  const line = physical?.region?.startLine;
  if (!Number.isInteger(line) || line < 2) {
    errors.push(`${prefix} startLine must be an integer greater than one`);
  }
}

const expectedCounts = {
  findings: parseExpected("EXPECT_FINDINGS"),
  low: parseExpected("EXPECT_LOW"),
  medium: parseExpected("EXPECT_MEDIUM"),
  high: parseExpected("EXPECT_HIGH"),
  critical: parseExpected("EXPECT_CRITICAL"),
};
const actualCounts = {
  findings: run?.results?.length ?? 0,
  ...severityCounts,
};
for (const [name, expected] of Object.entries(expectedCounts)) {
  if (expected !== undefined && actualCounts[name] !== expected) {
    errors.push(
      `${name} count ${actualCounts[name]} does not match expected ${expected}`,
    );
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Verified ${sarifPath}: ${actualCounts.findings} result(s), severity counts ${JSON.stringify(severityCounts)}.`,
  );
}

function parseExpected(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return undefined;
  if (!/^\d+$/.test(raw)) {
    errors.push(`${name} must be a non-negative integer, got ${raw}`);
    return undefined;
  }
  return Number.parseInt(raw, 10);
}

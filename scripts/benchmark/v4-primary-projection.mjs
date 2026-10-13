import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { unitId } from "./unit-id.mjs";

const AGENT_TASK = "agentci/agent-usage";
const CONFIG_FILES = ["agentci.config.json", ".agentcirc.json"];

function requireValue(condition, message) {
  if (!condition) throw new Error(`Invalid E3 Action run: ${message}`);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function validHash(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function stringArray(value) {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function relativeFile(value) {
  requireValue(typeof value === "string" && value.length > 0, "missing path");
  const normalized = value.replaceAll("\\", "/");
  requireValue(
    normalized === value &&
      path.posix.normalize(value) === value &&
      !value.startsWith("/") &&
      value !== ".." &&
      !value.startsWith("../") &&
      !value.includes("\0"),
    `non-canonical relative path: ${value}`,
  );
  return value;
}

function referencedWorkflowFiles(record) {
  const files = [relativeFile(record.file)];
  if (record.call_chain === undefined) return files;
  requireValue(
    Array.isArray(record.call_chain) &&
      record.call_chain.every(
        (entry) => typeof entry === "string" && /^[^#]+#[^#]+$/.test(entry),
      ),
    "invalid call_chain",
  );
  for (const entry of record.call_chain)
    files.push(relativeFile(entry.slice(0, entry.indexOf("#"))));
  return files;
}

function inside(root, file) {
  const absolute = path.resolve(file);
  const relative = path.relative(root, absolute);
  requireValue(
    relative && relative !== ".." && !relative.startsWith(`..${path.sep}`),
    `path outside trusted root: ${file}`,
  );
  return absolute;
}

async function regularBytes(file) {
  const metadata = await fs.lstat(file);
  requireValue(
    metadata.isFile() && !metadata.isSymbolicLink(),
    `not a regular file: ${file}`,
  );
  return fs.readFile(file);
}

async function inputInventory(inputRoot) {
  const root = await fs.realpath(inputRoot);
  const workflowDir = path.join(inputRoot, ".github", "workflows");
  for (const directory of [
    inputRoot,
    path.join(inputRoot, ".github"),
    workflowDir,
  ]) {
    const metadata = await fs.lstat(directory);
    requireValue(
      metadata.isDirectory() && !metadata.isSymbolicLink(),
      `unsafe input directory: ${directory}`,
    );
  }
  requireValue(
    (await fs.realpath(workflowDir)) ===
      path.join(root, ".github", "workflows"),
    "workflow directory escapes input root",
  );
  const entries = await fs.readdir(workflowDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => /\.ya?ml$/.test(entry.name))
    .map((entry) => {
      requireValue(entry.isFile(), `unsafe workflow entry: ${entry.name}`);
      return `.github/workflows/${entry.name}`;
    });
  for (const name of CONFIG_FILES) {
    const file = path.join(inputRoot, name);
    const metadata = await fs.lstat(file).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (metadata) {
      requireValue(
        metadata.isFile() && !metadata.isSymbolicLink(),
        `unsafe config: ${name}`,
      );
      files.push(name);
    }
  }
  return Promise.all(
    files
      .sort((a, b) => a.localeCompare(b))
      .map(async (file) => ({
        path: file,
        sha256: digest(await regularBytes(path.join(inputRoot, file))),
      })),
  );
}

function validateResult(result) {
  requireValue(isRecord(result), "JSON must be an object");
  requireValue(
    typeof result.scanned_at === "string" && result.scanned_at,
    "missing scan timestamp",
  );
  requireValue(
    typeof result.root === "string" && result.root,
    "missing scan root",
  );
  requireValue(
    Number.isSafeInteger(result.workflow_count) && result.workflow_count >= 0,
    "invalid workflow count",
  );
  requireValue(Array.isArray(result.findings), "missing findings array");
  requireValue(
    Array.isArray(result.agent_usages),
    "missing agent_usages array",
  );
  requireValue(isRecord(result.summary), "missing finding summary");
  for (const severity of ["low", "medium", "high", "critical"]) {
    requireValue(
      Number.isSafeInteger(result.summary[severity]) &&
        result.summary[severity] >= 0,
      `invalid ${severity} summary`,
    );
  }
  requireValue(Array.isArray(result.diagnostics), "missing diagnostics array");
  requireValue(
    typeof result.analysis_complete === "boolean",
    "missing analysis_complete",
  );
  for (const [kind, records] of [
    ["finding", result.findings],
    ["agent usage", result.agent_usages],
  ]) {
    for (const record of records) {
      requireValue(isRecord(record), `malformed ${kind}`);
      requireValue(
        typeof record.id === "string" && record.id,
        `missing ${kind} id`,
      );
      referencedWorkflowFiles(record);
      if (kind === "finding") {
        requireValue(
          typeof record.rule_id === "string" && record.rule_id,
          "missing finding rule_id",
        );
        for (const field of ["title", "message", "why", "evidence"])
          requireValue(
            typeof record[field] === "string",
            `invalid finding ${field}`,
          );
        requireValue(stringArray(record.fix), "invalid finding fix");
      } else {
        requireValue(
          typeof record.job === "string" && record.job,
          "missing agent usage job",
        );
        requireValue(
          Number.isSafeInteger(record.step_index) && record.step_index >= 0,
          "invalid agent usage step_index",
        );
        requireValue(
          ["action", "cli", "http", "other"].includes(record.kind),
          "invalid agent usage kind",
        );
        requireValue(
          typeof record.evidence === "string",
          "invalid agent usage evidence",
        );
      }
      if (record.step !== undefined || kind === "agent usage")
        requireValue(typeof record.step === "string", `invalid ${kind} step`);
      if (record.line !== undefined || kind === "agent usage")
        requireValue(
          Number.isSafeInteger(record.line) && record.line > 0,
          `invalid ${kind} line`,
        );
      if (record.reachable_events !== undefined || kind === "agent usage")
        requireValue(
          stringArray(record.reachable_events),
          `invalid ${kind} reachable_events`,
        );
      if (record.uncertain_reachable_events !== undefined)
        requireValue(
          stringArray(record.uncertain_reachable_events),
          `invalid ${kind} uncertain_reachable_events`,
        );
      if (record.job !== undefined) {
        requireValue(
          typeof record.job === "string" && record.job,
          `invalid ${kind} job`,
        );
      }
      if (record.step_index !== undefined) {
        requireValue(
          Number.isSafeInteger(record.step_index) && record.step_index >= 0,
          `invalid ${kind} step_index`,
        );
      }
    }
  }
  for (const diagnostic of result.diagnostics) {
    requireValue(isRecord(diagnostic), "malformed diagnostic");
    requireValue(
      typeof diagnostic.code === "string" && diagnostic.code,
      "missing diagnostic code",
    );
    requireValue(
      ["parse", "analysis"].includes(diagnostic.kind),
      "invalid diagnostic kind",
    );
    requireValue(
      ["error", "warning"].includes(diagnostic.severity),
      "invalid diagnostic severity",
    );
    requireValue(
      typeof diagnostic.message === "string",
      "invalid diagnostic message",
    );
    if (diagnostic.line !== undefined)
      requireValue(
        Number.isSafeInteger(diagnostic.line) && diagnostic.line > 0,
        "invalid diagnostic line",
      );
    if (diagnostic.job !== undefined)
      requireValue(
        typeof diagnostic.job === "string",
        "invalid diagnostic job",
      );
    if (diagnostic.step_index !== undefined)
      requireValue(
        Number.isSafeInteger(diagnostic.step_index) &&
          diagnostic.step_index >= 0,
        "invalid diagnostic step_index",
      );
    referencedWorkflowFiles(diagnostic);
  }
  requireValue(
    result.analysis_complete ===
      result.diagnostics.every(
        (diagnostic) =>
          diagnostic.code === "agentci/analysis-agent-event-unsupported",
      ),
    "analysis_complete contradicts diagnostics",
  );
  requireValue(
    result.findings.every((finding) =>
      ["low", "medium", "high", "critical"].includes(finding.severity),
    ) &&
      ["low", "medium", "high", "critical"].every(
        (severity) =>
          result.summary[severity] ===
          result.findings.filter((finding) => finding.severity === severity)
            .length,
      ),
    "finding summary contradicts findings",
  );
}

// shortcut: the receipt is supplied by the caller; E4 must attest it was captured in the same Action job.
export async function loadActionRun(options) {
  const {
    caseRecord,
    inputRoot,
    actionManifestPath,
    actionBundlePath,
    lockfilePath,
    expectedManifestSha256,
    expectedBundleSha256,
    expectedLockfileSha256,
    expectedActionCommit,
    jsonPath,
    outputRoot,
    runReceipt,
  } = options;
  requireValue(
    isRecord(caseRecord) && isRecord(runReceipt),
    "missing case or receipt",
  );
  requireValue(
    typeof caseRecord.case_id === "string" && caseRecord.case_id,
    "missing case ID",
  );
  requireValue(
    /^\.github\/workflows\/[^/]+\.ya?ml$/.test(
      relativeFile(caseRecord.source_path),
    ),
    "invalid source path",
  );
  requireValue(validHash(caseRecord.sha256), "invalid source digest");
  requireValue(validHash(expectedManifestSha256), "invalid manifest digest");
  requireValue(validHash(expectedBundleSha256), "invalid bundle digest");
  requireValue(validHash(expectedLockfileSha256), "invalid lockfile digest");
  requireValue(
    /^[0-9a-f]{40}$/.test(expectedActionCommit),
    "invalid Action commit",
  );
  requireValue(
    runReceipt.case_id === caseRecord.case_id,
    "receipt case mismatch",
  );
  requireValue(
    runReceipt.source_path === caseRecord.source_path,
    "receipt source mismatch",
  );
  requireValue(
    runReceipt.action_commit === expectedActionCommit,
    "receipt Action commit mismatch",
  );
  requireValue(
    runReceipt.action_manifest_sha256 === expectedManifestSha256,
    "receipt manifest digest mismatch",
  );
  requireValue(
    runReceipt.lockfile_sha256 === expectedLockfileSha256,
    "receipt lockfile digest mismatch",
  );
  requireValue(runReceipt.fail_on === "none", "Action must use fail-on none");
  requireValue(
    ["success", "failure"].includes(runReceipt.outcome),
    "invalid Action outcome",
  );
  requireValue(validHash(runReceipt.output_sha256), "invalid output digest");
  requireValue(
    Array.isArray(runReceipt.input_files),
    "missing input inventory",
  );

  const actualInputs = await inputInventory(inputRoot);
  const claimedInputs = runReceipt.input_files.map((entry) => {
    requireValue(isRecord(entry), "malformed input inventory entry");
    return { path: relativeFile(entry.path), sha256: entry.sha256 };
  });
  requireValue(
    claimedInputs.every((entry) => validHash(entry.sha256)) &&
      JSON.stringify(
        claimedInputs.sort((a, b) => a.path.localeCompare(b.path)),
      ) === JSON.stringify(actualInputs),
    "input inventory mismatch",
  );
  requireValue(
    actualInputs.some(
      (entry) =>
        entry.path === caseRecord.source_path &&
        entry.sha256 === caseRecord.sha256,
    ),
    "selected snapshot hash mismatch",
  );
  requireValue(
    digest(await regularBytes(actionBundlePath)) === expectedBundleSha256,
    "Action bundle hash mismatch",
  );
  const manifestBytes = await regularBytes(actionManifestPath);
  requireValue(
    digest(manifestBytes) === expectedManifestSha256,
    "Action manifest hash mismatch",
  );
  requireValue(
    digest(await regularBytes(lockfilePath)) === expectedLockfileSha256,
    "dependency lockfile hash mismatch",
  );
  const manifest = YAML.parse(manifestBytes.toString("utf8"));
  requireValue(
    isRecord(manifest) &&
      isRecord(manifest.runs) &&
      manifest.runs.using === "node24" &&
      manifest.runs.main === "dist/action.js" &&
      path.resolve(path.dirname(actionManifestPath), manifest.runs.main) ===
        path.resolve(actionBundlePath),
    "Action manifest runtime or entrypoint mismatch",
  );

  const root = path.resolve(outputRoot);
  const output = inside(root, jsonPath);
  requireValue(
    inside(await fs.realpath(root), await fs.realpath(output)) ===
      (await fs.realpath(output)),
    "output escapes trusted root",
  );
  const jsonBytes = await regularBytes(output);
  requireValue(
    digest(jsonBytes) === runReceipt.output_sha256,
    "Action JSON hash mismatch",
  );
  const result = JSON.parse(jsonBytes.toString("utf8"));
  validateResult(result);
  const workflowPaths = new Set(
    actualInputs
      .filter((entry) => entry.path.startsWith(".github/workflows/"))
      .map((entry) => entry.path),
  );
  for (const record of [
    ...result.findings,
    ...result.agent_usages,
    ...result.diagnostics,
  ]) {
    for (const file of referencedWorkflowFiles(record))
      requireValue(
        workflowPaths.has(file),
        `record references workflow absent from input inventory: ${file}`,
      );
  }
  // A matching root is necessary for an honest run, but E4 still must attest the invocation.
  requireValue(
    path.isAbsolute(result.root) &&
      path.resolve(result.root) === path.resolve(inputRoot),
    "Action JSON scan root differs from input root",
  );
  requireValue(
    result.workflow_count === workflowPaths.size,
    "workflow count contradicts input inventory",
  );
  const hasError = result.diagnostics.some(
    (diagnostic) => diagnostic.severity === "error",
  );
  requireValue(
    runReceipt.outcome === (hasError ? "failure" : "success"),
    "Action outcome contradicts diagnostics",
  );
  return { result, run_incomplete: !result.analysis_complete };
}

function registryKey(caseId, file, scope, job, step, rule) {
  return JSON.stringify([caseId, file, scope, job, step, rule]);
}

// Use the frozen task vocabulary; deriving it from one case's rows can hide a missing unit.
export function projectPrimary({
  caseRecord,
  registryRows,
  expectedUnitIds,
  registeredTaskIds,
  sourceBytes,
  result,
}) {
  requireValue(
    isRecord(caseRecord) && Array.isArray(registryRows),
    "missing case or registry",
  );
  requireValue(
    Array.isArray(expectedUnitIds) && expectedUnitIds.length > 0,
    "missing frozen unit IDs",
  );
  requireValue(
    expectedUnitIds.every((id) => typeof id === "string" && id),
    "invalid frozen unit ID",
  );
  const expected = new Set(expectedUnitIds);
  requireValue(
    expected.size === expectedUnitIds.length,
    "duplicate frozen unit ID",
  );
  requireValue(
    Array.isArray(registeredTaskIds) &&
      registeredTaskIds.length > 0 &&
      registeredTaskIds.every((id) => typeof id === "string" && id),
    "missing registered task IDs",
  );
  const ruleIds = new Set(registeredTaskIds);
  requireValue(
    ruleIds.size === registeredTaskIds.length,
    "duplicate registered task ID",
  );
  requireValue(
    /^\.github\/workflows\/[^/]+\.ya?ml$/.test(
      relativeFile(caseRecord.source_path),
    ),
    "invalid source path",
  );
  requireValue(
    typeof caseRecord.case_id === "string" && caseRecord.case_id,
    "missing case ID",
  );
  validateResult(result);
  const byKey = new Map();
  const unitIds = new Set();
  const units = registryRows.map((row) => {
    requireValue(isRecord(row), "malformed registry row");
    requireValue(
      row.case_id === caseRecord.case_id &&
        row.source_path === caseRecord.source_path,
      "registry case/source mismatch",
    );
    requireValue(
      typeof row.unit_id === "string" && row.unit_id,
      "missing unit ID",
    );
    requireValue(
      !unitIds.has(row.unit_id),
      `duplicate unit ID: ${row.unit_id}`,
    );
    requireValue(
      ["workflow", "job", "step", "reusable-call"].includes(row.scope),
      "invalid registry scope",
    );
    requireValue(
      typeof row.rule_id === "string" && row.rule_id,
      "missing registry rule",
    );
    requireValue(ruleIds.has(row.rule_id), "unregistered registry rule");
    requireValue(
      row.scope !== "workflow" || row.job_id === null,
      "workflow row has a job",
    );
    requireValue(
      row.scope === "step" || row.step_index === null,
      "non-step row has a step index",
    );
    const job = row.scope === "workflow" ? null : row.job_id;
    requireValue(
      row.scope === "workflow" ? job === null : typeof job === "string" && job,
      "invalid registry job",
    );
    const step = row.scope === "step" ? row.step_index : null;
    requireValue(
      step === null || (Number.isSafeInteger(step) && step >= 0),
      "invalid registry step",
    );
    requireValue(
      row.scope !== "step" || step !== null,
      "missing registry step index",
    );
    requireValue(
      row.unit_id === unitId(row.case_id, row.scope, job, step, row.rule_id),
      `unit ID does not match registry identity: ${row.unit_id}`,
    );
    const key = registryKey(
      row.case_id,
      row.source_path,
      row.scope,
      job,
      step,
      row.rule_id,
    );
    requireValue(
      !byKey.has(key),
      `duplicate registry identity: ${row.unit_id}`,
    );
    const unit = { unit_id: row.unit_id, alert: false, matched_records: [] };
    byKey.set(key, unit);
    unitIds.add(row.unit_id);
    return unit;
  });
  requireValue(
    unitIds.size === expected.size &&
      [...unitIds].every((id) => expected.has(id)),
    "registry unit IDs differ from frozen unit IDs",
  );

  const outOfScope = [];
  for (const [kind, records] of [
    ["finding", result.findings],
    ["agent_usage", result.agent_usages],
  ]) {
    for (const [index, record] of records.entries()) {
      const reference = { kind, index, id: record.id };
      const rule = kind === "finding" ? record.rule_id : AGENT_TASK;
      if (!ruleIds.has(rule)) {
        outOfScope.push(reference);
        continue;
      }
      const chain = record.call_chain ?? [];
      let scope;
      let job;
      let step;
      if (chain.length === 0) {
        if (record.file !== caseRecord.source_path) {
          outOfScope.push(reference);
          continue;
        }
        scope =
          kind === "finding" && record.step_index === undefined
            ? "job"
            : "step";
        job = record.job;
        step = scope === "step" ? record.step_index : null;
      } else {
        const first = chain[0];
        const prefix = `${caseRecord.source_path}#`;
        requireValue(
          first.startsWith(prefix) ||
            !chain.some((entry) => entry.startsWith(prefix)),
          `selected caller is not first: ${record.id}`,
        );
        if (!first.startsWith(prefix)) {
          outOfScope.push(reference);
          continue;
        }
        job = first.slice(prefix.length);
        scope =
          kind === "finding" && record.step_index === undefined
            ? "job"
            : "reusable-call";
        step = null;
      }
      const key = registryKey(
        caseRecord.case_id,
        caseRecord.source_path,
        scope,
        job,
        step,
        rule,
      );
      const unit = byKey.get(key);
      requireValue(unit, `unmatched selected-source record: ${record.id}`);
      unit.alert = true;
      unit.matched_records.push(reference);
    }
  }

  const hasParseGap = result.diagnostics.some(
    (diagnostic) =>
      diagnostic.kind === "parse" && diagnostic.file === caseRecord.source_path,
  );
  const workflowGapIds = registryRows
    .filter((row) => row.scope === "workflow")
    .map((row) => row.unit_id);
  requireValue(
    !hasParseGap || workflowGapIds.length > 0,
    "selected parse diagnostic lacks workflow units",
  );
  if (workflowGapIds.length > 0) {
    requireValue(
      Buffer.isBuffer(sourceBytes) &&
        validHash(caseRecord.sha256) &&
        digest(sourceBytes) === caseRecord.sha256,
      "workflow gap source snapshot mismatch",
    );
    const document = YAML.parseDocument(sourceBytes.toString("utf8"), {
      prettyErrors: true,
    });
    requireValue(
      document.errors.length > 0 === hasParseGap,
      "workflow gap contradicts source parse status",
    );
    if (!hasParseGap) {
      const parsed = document.toJS();
      requireValue(
        !isRecord(parsed) || !isRecord(parsed.jobs),
        "workflow units contradict source jobs",
      );
    }
  }
  return {
    units,
    parse_gap_unit_ids: hasParseGap ? workflowGapIds : [],
    structural_gap_unit_ids: hasParseGap ? [] : workflowGapIds,
    out_of_scope_records: outOfScope,
  };
}

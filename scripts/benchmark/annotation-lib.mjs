import fs from "node:fs";
import path from "node:path";
import { csvObjects } from "./csv.mjs";

export const repositoryRoot = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../..",
);
export const benchmarkRoot = path.join(repositoryRoot, "benchmark");
export const GROUND_TRUTH = new Set(["positive", "negative", "indeterminate"]);
export const REACHABILITY = new Set(["reachable", "unreachable", "unknown"]);
export const ASSESSMENT_STATUS = new Set([
  "present",
  "absent",
  "unknown",
  "not-applicable",
]);
export const PERMISSION_STATUS = new Set([
  "known",
  "none",
  "unknown",
  "not-applicable",
]);

export function loadContext(registryName = "annotation-sheet.csv") {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(benchmarkRoot, "manifest.json"), "utf8"),
  );
  const registryRows = csvObjects(
    fs.readFileSync(path.join(benchmarkRoot, registryName), "utf8"),
  );
  const registry = uniqueMap(
    registryRows,
    (row) => row.unit_id,
    `${registryName} unit`,
  );
  const cases = uniqueMap(
    manifest.cases,
    (item) => item.case_id,
    "manifest case",
  );
  return { manifest, registryRows, registry, cases };
}

export function recordFromCsvRow(row, annotator, reviewStatus = "independent") {
  if (!annotator || annotator === "adjudicated") {
    throw new Error("Independent labels need a stable human pseudonym.");
  }
  const groundTruth = normalized(row.ground_truth);
  const reachability = normalized(row.reachability);
  requireEnum(groundTruth, GROUND_TRUTH, `${row.unit_id}/ground_truth`);
  requireEnum(reachability, REACHABILITY, `${row.unit_id}/reachability`);

  const record = {
    schema_version: 2,
    unit_id: required(row.unit_id, "unit_id"),
    case_id: required(row.case_id, `${row.unit_id}/case_id`),
    split: required(row.split, `${row.unit_id}/split`),
    workflow_file: required(row.source_path, `${row.unit_id}/source_path`),
    scope: required(row.scope, `${row.unit_id}/scope`),
    job_id: emptyToNull(row.job_id),
    step_index:
      row.step_index === undefined || row.step_index.trim() === ""
        ? null
        : parseNonnegativeInteger(row.step_index, `${row.unit_id}/step_index`),
    step_name: emptyToNull(row.step_name),
    rule_id: required(row.rule_id, `${row.unit_id}/rule_id`),
    ground_truth: groundTruth,
    reachability,
    triggers: splitList(row.triggers),
    effective_permissions: assessment(
      row.permissions_status,
      row.effective_permissions,
      PERMISSION_STATUS,
      `${row.unit_id}/effective_permissions`,
    ),
    untrusted_source: assessment(
      row.untrusted_source_status,
      row.untrusted_source,
      ASSESSMENT_STATUS,
      `${row.unit_id}/untrusted_source`,
    ),
    agent_sink: assessment(
      row.agent_sink_status,
      row.agent_sink,
      ASSESSMENT_STATUS,
      `${row.unit_id}/agent_sink`,
    ),
    capability: assessment(
      row.capability_status,
      row.capability,
      ASSESSMENT_STATUS,
      `${row.unit_id}/capability`,
    ),
    mitigation: assessment(
      row.mitigation_status,
      row.mitigation,
      ASSESSMENT_STATUS,
      `${row.unit_id}/mitigation`,
    ),
    evidence_lines: parseEvidenceLines(row.evidence_lines, row.source_path),
    explanation: required(row.explanation, `${row.unit_id}/explanation`),
    annotator,
    adjudicator: null,
    review_status: reviewStatus,
    notes: row.notes?.trim() ?? "",
  };
  return record;
}

export function validateAnnotationSet(
  records,
  {
    registryName = "annotation-sheet.csv",
    role = "independent",
    expectedAnnotator,
  } = {},
) {
  const context = loadContext(registryName);
  const recordsByUnit = uniqueMap(records, (entry) => entry.unit_id, role);
  if (recordsByUnit.size !== context.registry.size) {
    throw new Error(
      `${role} has ${recordsByUnit.size} units; expected ${context.registry.size} from ${registryName}.`,
    );
  }

  const annotators = new Set();
  for (const [unitId, registry] of context.registry) {
    const record = recordsByUnit.get(unitId);
    if (!record) throw new Error(`${role} is missing ${unitId}.`);
    annotators.add(record.annotator);
    validateRecord(record, registry, context, role);
  }
  if (annotators.size !== 1) {
    throw new Error(`${role} must use exactly one annotator identity.`);
  }
  const [annotator] = annotators;
  if (expectedAnnotator && annotator !== expectedAnnotator) {
    throw new Error(
      `${role} annotator is ${annotator}; expected ${expectedAnnotator}.`,
    );
  }
  if (role === "independent" && annotator === "adjudicated") {
    throw new Error("Independent labels cannot use the adjudicated identity.");
  }
  if (role === "final" && annotator !== "adjudicated") {
    throw new Error('Final labels must use annotator: "adjudicated".');
  }
  return { ...context, recordsByUnit, annotator };
}

export function validateFinalAgainstSources(finalSet, primarySet, reviewerSet) {
  if (finalSet.recordsByUnit.size !== primarySet.recordsByUnit.size) {
    throw new Error("Final and primary label sets have different coverage.");
  }
  for (const [unitId, finalRecord] of finalSet.recordsByUnit) {
    const primary = primarySet.recordsByUnit.get(unitId);
    if (!primary)
      throw new Error(`Final record ${unitId} has no primary label.`);
    const reviewer = reviewerSet.recordsByUnit.get(unitId);
    const source = finalRecord.source_annotations;
    if (!sameSourceAnnotation(source?.a, primary)) {
      throw new Error(
        `${unitId}: final source annotation a does not match the published primary label.`,
      );
    }
    if (
      reviewer ? !sameSourceAnnotation(source?.b, reviewer) : source?.b !== null
    ) {
      throw new Error(
        `${unitId}: final source annotation b does not match the published review label.`,
      );
    }

    if (!reviewer) {
      if (
        finalRecord.review_status !== "single-pass" ||
        !decisionsEqual(finalRecord, primary)
      ) {
        throw new Error(
          `${unitId}: an unreviewed final record must preserve the primary decision as single-pass.`,
        );
      }
    } else if (decisionsEqual(primary, reviewer)) {
      if (
        finalRecord.review_status !== "independently-reviewed" ||
        !decisionsEqual(finalRecord, primary)
      ) {
        throw new Error(
          `${unitId}: an agreed final record must preserve the shared decision as independently-reviewed.`,
        );
      }
    } else if (finalRecord.review_status !== "adjudicated") {
      throw new Error(
        `${unitId}: a substantive independent-label disagreement must be adjudicated.`,
      );
    }
  }
}

export function decisionProjection(record) {
  return {
    ground_truth: record.ground_truth,
    reachability: record.reachability,
    triggers: [...record.triggers].sort(),
    permissions_status: record.effective_permissions.status,
    untrusted_source_status: record.untrusted_source.status,
    agent_sink_status: record.agent_sink.status,
    capability_status: record.capability.status,
    mitigation_status: record.mitigation.status,
  };
}

export function decisionsEqual(left, right) {
  return (
    JSON.stringify(decisionProjection(left)) ===
    JSON.stringify(decisionProjection(right))
  );
}

export function sourceAnnotation(record) {
  return {
    annotator: record.annotator,
    ground_truth: record.ground_truth,
    reachability: record.reachability,
    review_status: "independent",
  };
}

export function formatEvidenceLines(evidenceLines) {
  return evidenceLines
    .map((evidence) => {
      const range =
        evidence.start === evidence.end
          ? String(evidence.start)
          : `${evidence.start}-${evidence.end}`;
      return `${evidence.file}:${range}`;
    })
    .join(";");
}

export function readJsonLines(file) {
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(
          `${file}:${index + 1}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    });
}

export function writeJsonLines(file, records) {
  fs.writeFileSync(
    file,
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
  );
}

function validateRecord(record, registry, context, role) {
  if (record.schema_version !== 2) {
    throw new Error(`${record.unit_id}: schema_version must be 2.`);
  }
  const expectedMetadata = {
    case_id: registry.case_id,
    split: registry.split,
    workflow_file: registry.source_path,
    scope: registry.scope,
    job_id: emptyToNull(registry.job_id),
    step_index: registry.step_index === "" ? null : Number(registry.step_index),
    step_name: emptyToNull(registry.step_name),
    rule_id: registry.rule_id,
  };
  for (const [field, expected] of Object.entries(expectedMetadata)) {
    if (record[field] !== expected) {
      throw new Error(
        `${record.unit_id}/${field} is ${JSON.stringify(record[field])}; expected ${JSON.stringify(expected)}.`,
      );
    }
  }
  requireEnum(
    record.ground_truth,
    GROUND_TRUTH,
    `${record.unit_id}/ground_truth`,
  );
  requireEnum(
    record.reachability,
    REACHABILITY,
    `${record.unit_id}/reachability`,
  );
  if (
    !Array.isArray(record.triggers) ||
    record.triggers.some(
      (trigger) => typeof trigger !== "string" || trigger.length === 0,
    ) ||
    new Set(record.triggers).size !== record.triggers.length
  ) {
    throw new Error(`${record.unit_id}/triggers must be unique strings.`);
  }
  validateAssessment(
    record.effective_permissions,
    PERMISSION_STATUS,
    `${record.unit_id}/effective_permissions`,
  );
  for (const field of [
    "untrusted_source",
    "agent_sink",
    "capability",
    "mitigation",
  ]) {
    validateAssessment(
      record[field],
      ASSESSMENT_STATUS,
      `${record.unit_id}/${field}`,
    );
  }
  if (!Array.isArray(record.evidence_lines)) {
    throw new Error(`${record.unit_id}/evidence_lines must be an array.`);
  }
  const item = context.cases.get(record.case_id);
  const source = fs.readFileSync(
    path.join(repositoryRoot, item.snapshot_path),
    "utf8",
  );
  const lineCount = source.split(/\r?\n/).length;
  for (const evidence of record.evidence_lines) {
    if (
      evidence.file !== record.workflow_file ||
      !Number.isInteger(evidence.start) ||
      !Number.isInteger(evidence.end) ||
      evidence.start < 1 ||
      evidence.end < evidence.start ||
      evidence.end > lineCount
    ) {
      throw new Error(
        `${record.unit_id} has invalid evidence ${JSON.stringify(evidence)}.`,
      );
    }
  }
  if (
    record.ground_truth === "positive" &&
    record.evidence_lines.length === 0
  ) {
    throw new Error(`${record.unit_id}: positive labels need evidence lines.`);
  }
  if (typeof record.explanation !== "string" || !record.explanation.trim()) {
    throw new Error(`${record.unit_id}: explanation is required.`);
  }
  if (typeof record.notes !== "string") {
    throw new Error(`${record.unit_id}: notes must be a string.`);
  }
  if (
    record.adjudicator !== null &&
    (typeof record.adjudicator !== "string" ||
      !record.adjudicator.trim() ||
      record.adjudicator === "adjudicated")
  ) {
    throw new Error(
      `${record.unit_id}: adjudicator must be null or a stable human pseudonym.`,
    );
  }

  const hasUnknownDimension =
    record.reachability === "unknown" ||
    record.effective_permissions.status === "unknown" ||
    ["untrusted_source", "agent_sink", "capability", "mitigation"].some(
      (field) => record[field].status === "unknown",
    );
  if (record.ground_truth === "indeterminate" && !hasUnknownDimension) {
    throw new Error(
      `${record.unit_id}: indeterminate needs at least one explicitly unknown dimension.`,
    );
  }

  if (role === "independent" && record.review_status !== "independent") {
    throw new Error(
      `${record.unit_id}: independent record has invalid review_status.`,
    );
  }
  if (role === "independent" && record.adjudicator !== null) {
    throw new Error(
      `${record.unit_id}: independent records cannot name an adjudicator.`,
    );
  }
  if (
    role === "final" &&
    !["single-pass", "independently-reviewed", "adjudicated"].includes(
      record.review_status,
    )
  ) {
    throw new Error(`${record.unit_id}: invalid final review_status.`);
  }
  if (role === "final") {
    if (
      (record.review_status === "adjudicated") !==
      (typeof record.adjudicator === "string")
    ) {
      throw new Error(
        `${record.unit_id}: only adjudicated records must name an adjudicator.`,
      );
    }
    validateSourceAnnotations(record);
  }
}

function validateSourceAnnotations(record) {
  const source = record.source_annotations;
  if (!source || !source.a) {
    throw new Error(`${record.unit_id}: final record must preserve source a.`);
  }
  for (const key of ["a", "b"]) {
    const annotation = source[key];
    if (annotation === null && key === "b") continue;
    if (
      !annotation ||
      typeof annotation.annotator !== "string" ||
      !GROUND_TRUTH.has(annotation.ground_truth) ||
      !REACHABILITY.has(annotation.reachability) ||
      annotation.review_status !== "independent"
    ) {
      throw new Error(`${record.unit_id}: invalid source annotation ${key}.`);
    }
  }
  if (record.review_status === "single-pass" && source.b !== null) {
    throw new Error(
      `${record.unit_id}: single-pass record unexpectedly has source b.`,
    );
  }
  if (record.review_status !== "single-pass" && source.b === null) {
    throw new Error(`${record.unit_id}: reviewed record is missing source b.`);
  }
}

function sameSourceAnnotation(annotation, record) {
  return (
    annotation?.annotator === record.annotator &&
    annotation?.ground_truth === record.ground_truth &&
    annotation?.reachability === record.reachability &&
    annotation?.review_status === "independent"
  );
}

function assessment(rawStatus, rawDescription, statuses, field) {
  const status = normalized(rawStatus);
  requireEnum(status, statuses, `${field}/status`);
  const description = rawDescription?.trim() ?? "";
  if (["present", "known", "unknown"].includes(status) && !description) {
    throw new Error(`${field} needs a description when status is ${status}.`);
  }
  return { status, description };
}

function validateAssessment(value, statuses, field) {
  if (
    !value ||
    typeof value !== "object" ||
    !statuses.has(value.status) ||
    typeof value.description !== "string"
  ) {
    throw new Error(`${field} is invalid.`);
  }
  if (
    ["present", "known", "unknown"].includes(value.status) &&
    !value.description.trim()
  ) {
    throw new Error(
      `${field} needs a description when status is ${value.status}.`,
    );
  }
}

function parseEvidenceLines(value, defaultFile) {
  if (!value?.trim()) return [];
  return value
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const match = /^(?:(.+):)?(\d+)(?:-(\d+))?$/.exec(entry);
      if (!match) {
        throw new Error(
          `Invalid evidence line ${entry}; use 12, 12-15, or path.yml:12-15.`,
        );
      }
      const start = Number.parseInt(match[2], 10);
      const end = Number.parseInt(match[3] ?? match[2], 10);
      return { file: match[1] || defaultFile, start, end };
    });
}

function splitList(value) {
  if (!value?.trim()) return [];
  return [
    ...new Set(
      value
        .split(/[;,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].sort();
}

function uniqueMap(values, key, label) {
  const output = new Map();
  for (const value of values) {
    const id = key(value);
    if (!id) throw new Error(`${label} has an empty key.`);
    if (output.has(id)) throw new Error(`Duplicate ${label}: ${id}.`);
    output.set(id, value);
  }
  return output;
}

function emptyToNull(value) {
  const normalizedValue =
    value === undefined || value === null ? "" : String(value).trim();
  return normalizedValue === "" ? null : normalizedValue;
}

function normalized(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function required(value, field) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${field} is required.`);
  return text;
}

function requireEnum(value, allowed, field) {
  if (!allowed.has(value)) {
    throw new Error(
      `${field} must be one of ${[...allowed].join(", ")}; got ${String(value)}.`,
    );
  }
}

function parseNonnegativeInteger(value, field) {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${field} must be a non-negative integer.`);
  }
  return Number.parseInt(value, 10);
}

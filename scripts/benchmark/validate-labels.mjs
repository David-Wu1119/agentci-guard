#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  benchmarkRoot,
  loadContext,
  readJsonLines,
  validateAnnotationSet,
  validateFinalAgainstSources,
} from "./annotation-lib.mjs";

const errors = [];
const schemaFiles = [
  "schemas/manifest.schema.json",
  "schemas/annotation-record.schema.json",
];
const schemas = new Map();
for (const relative of schemaFiles) {
  try {
    const schema = JSON.parse(
      fs.readFileSync(path.join(benchmarkRoot, relative), "utf8"),
    );
    if (
      schema.$schema !== "https://json-schema.org/draft/2020-12/schema" ||
      typeof schema.$id !== "string" ||
      typeof schema.title !== "string"
    ) {
      errors.push(`${relative} is not a declared draft-2020-12 schema.`);
    }
    schemas.set(relative, schema);
  } catch (error) {
    errors.push(
      `${relative} cannot be parsed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

let manifestValidator;
let annotationValidator;
if (schemas.size === schemaFiles.length) {
  try {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    manifestValidator = ajv.compile(
      schemas.get("schemas/manifest.schema.json"),
    );
    annotationValidator = ajv.compile(
      schemas.get("schemas/annotation-record.schema.json"),
    );
  } catch (error) {
    errors.push(
      `Schema compilation failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

let full;
let review;
try {
  full = loadContext("annotation-sheet.csv");
  review = loadContext("review-sheet.csv");
  validateWithSchema(
    manifestValidator,
    full.manifest,
    "benchmark/manifest.json",
  );
  validateRegistries(full, review);
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error));
}

const labelDirectory = path.join(benchmarkRoot, "labels");
const primaryPath = path.join(labelDirectory, "annotator-a.jsonl");
const reviewerPath = path.join(labelDirectory, "annotator-b.jsonl");
const finalPath = path.join(labelDirectory, "adjudicated.jsonl");
const presence = [primaryPath, reviewerPath, finalPath].map((file) =>
  fs.existsSync(file),
);
if (presence.some(Boolean) && !presence.every(Boolean)) {
  errors.push(
    "Label publication is incomplete: annotator-a.jsonl, annotator-b.jsonl, and adjudicated.jsonl must appear together.",
  );
} else if (presence.every(Boolean)) {
  try {
    const primaryRecords = readJsonLines(primaryPath);
    const reviewerRecords = readJsonLines(reviewerPath);
    const finalRecords = readJsonLines(finalPath);
    validateRecordsWithSchema(
      annotationValidator,
      primaryRecords,
      "benchmark/labels/annotator-a.jsonl",
    );
    validateRecordsWithSchema(
      annotationValidator,
      reviewerRecords,
      "benchmark/labels/annotator-b.jsonl",
    );
    validateRecordsWithSchema(
      annotationValidator,
      finalRecords,
      "benchmark/labels/adjudicated.jsonl",
    );
    const primary = validateAnnotationSet(primaryRecords, {
      registryName: "annotation-sheet.csv",
      role: "independent",
    });
    const reviewer = validateAnnotationSet(reviewerRecords, {
      registryName: "review-sheet.csv",
      role: "independent",
    });
    const final = validateAnnotationSet(finalRecords, {
      registryName: "annotation-sheet.csv",
      role: "final",
      expectedAnnotator: "adjudicated",
    });
    validateFinalAgainstSources(final, primary, reviewer);
    if (primary.annotator === reviewer.annotator) {
      errors.push("Published independent label sets use the same annotator.");
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
}
if (presence.every(Boolean)) {
  if (!["adjudicated", "evaluated"].includes(full?.manifest.status)) {
    errors.push(
      "Complete public labels require manifest status adjudicated or evaluated.",
    );
  }
} else if (full && !["unlabeled", "labeling"].includes(full.manifest.status)) {
  errors.push(
    `Manifest status ${full.manifest.status} requires a complete label package.`,
  );
}

const resultDirectory = path.join(benchmarkRoot, "results");
const publishedResults =
  fs.existsSync(resultDirectory) &&
  fs
    .readdirSync(resultDirectory)
    .some((name) => /^metrics-(?:dev|eval|all)\.(?:json|md)$/.test(name));
if (publishedResults && !presence.every(Boolean)) {
  errors.push("Metrics exist without a complete public human-label package.");
}
if (publishedResults && full?.manifest.status !== "evaluated") {
  errors.push("Published metrics require manifest status evaluated.");
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    presence.every(Boolean)
      ? `Validated schemas and all public labels (${full.registry.size} primary units; ${review.registry.size} independently reviewed).`
      : `Validated schemas and blank annotation registries (${full.registry.size} primary units; ${review.registry.size} planned for independent review). Human labels are still absent.`,
  );
}

function validateRecordsWithSchema(validator, records, source) {
  if (!validator) {
    throw new Error(`${source} cannot be validated because its schema failed.`);
  }
  for (const [index, record] of records.entries()) {
    validateWithSchema(validator, record, `${source}:${index + 1}`);
  }
}

function validateWithSchema(validator, value, source) {
  if (!validator) {
    throw new Error(`${source} cannot be validated because its schema failed.`);
  }
  if (!validator(value)) {
    const details = (validator.errors ?? [])
      .map(
        (error) =>
          `${error.instancePath || "/"} ${error.message ?? "is invalid"}`,
      )
      .join("; ");
    throw new Error(`${source} failed JSON Schema validation: ${details}`);
  }
}

function validateRegistries(fullContext, reviewContext) {
  const manifest = fullContext.manifest;
  const tasks = new Set([manifest.agent_detection_task, ...manifest.rules]);
  if (manifest.benchmark_id !== "agentci-real-workflows-v3") {
    throw new Error("annotation registry must target the frozen v3 benchmark.");
  }
  if (manifest.annotation_schema_version !== 2) {
    throw new Error("manifest annotation_schema_version must be 2.");
  }
  if (
    manifest.annotation_schema !==
    "benchmark/schemas/annotation-record.schema.json"
  ) {
    throw new Error("manifest annotation_schema path is invalid.");
  }
  if (
    Object.keys(manifest.task_granularity).length !== tasks.size ||
    [...tasks].some(
      (task) => !["job", "step"].includes(manifest.task_granularity[task]),
    )
  ) {
    throw new Error("manifest task_granularity does not cover every task.");
  }
  if (manifest.task_granularity[manifest.agent_detection_task] !== "step") {
    throw new Error("agent-detection task granularity must be step.");
  }

  for (const row of fullContext.registryRows) {
    if (!tasks.has(row.rule_id)) {
      throw new Error(`${row.unit_id}: unknown task ${row.rule_id}.`);
    }
    const item = fullContext.cases.get(row.case_id);
    if (
      !item ||
      row.split !== item.split ||
      row.stratum !== item.stratum ||
      row.repository !== item.repository ||
      row.source_commit !== item.source_commit ||
      row.source_path !== item.source_path
    ) {
      throw new Error(`${row.unit_id}: registry provenance drifted.`);
    }
    const expectedGranularity = manifest.task_granularity[row.rule_id];
    if (
      row.scope !== "workflow" &&
      ((expectedGranularity === "job" && row.scope !== "job") ||
        (expectedGranularity === "step" &&
          !["step", "reusable-call"].includes(row.scope)))
    ) {
      throw new Error(`${row.unit_id}: scope does not match task granularity.`);
    }
  }
  if (fullContext.registry.size < manifest.workflow_count) {
    throw new Error("annotation registry has fewer units than workflows.");
  }

  const always = new Set(manifest.independent_review_plan.always_review_tasks);
  for (const [unitId, row] of reviewContext.registry) {
    const fullRow = fullContext.registry.get(unitId);
    if (!fullRow || JSON.stringify(row) !== JSON.stringify(fullRow)) {
      throw new Error(
        `${unitId}: review plan is not an exact registry subset.`,
      );
    }
  }
  for (const [unitId, row] of fullContext.registry) {
    if (always.has(row.rule_id) && !reviewContext.registry.has(unitId)) {
      throw new Error(`${unitId}: mandatory independent review is missing.`);
    }
  }
  const reviewCoverage =
    reviewContext.registry.size / fullContext.registry.size;
  if (reviewCoverage < manifest.minimum_independent_review_coverage) {
    throw new Error(
      `independent review plan covers ${reviewCoverage}; minimum is ${manifest.minimum_independent_review_coverage}.`,
    );
  }
}

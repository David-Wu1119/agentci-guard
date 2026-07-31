#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  decisionsEqual,
  readJsonLines,
  recordFromCsvRow,
  sourceAnnotation,
  validateAnnotationSet,
  writeJsonLines,
} from "./annotation-lib.mjs";
import { csvObjects } from "./csv.mjs";

const [
  primaryArgument,
  reviewerArgument,
  decisionsArgument,
  outputArgument,
  adjudicator,
] = process.argv.slice(2);
if (
  !primaryArgument ||
  !reviewerArgument ||
  !decisionsArgument ||
  !outputArgument ||
  !adjudicator
) {
  throw new Error(
    "Usage: node scripts/benchmark/adjudicate.mjs <primary.jsonl> <reviewer.jsonl> <filled-disagreements.csv> <adjudicated.jsonl> <adjudicator-pseudonym>",
  );
}
if (adjudicator === "adjudicated") {
  throw new Error("Adjudicator must be a stable human pseudonym.");
}

const primary = validateAnnotationSet(
  readJsonLines(path.resolve(primaryArgument)),
  {
    registryName: "annotation-sheet.csv",
    role: "independent",
  },
);
const reviewer = validateAnnotationSet(
  readJsonLines(path.resolve(reviewerArgument)),
  {
    registryName: "review-sheet.csv",
    role: "independent",
  },
);
if (primary.annotator === reviewer.annotator) {
  throw new Error("Independent label files must use different annotators.");
}
const decisionRows = csvObjects(
  fs.readFileSync(path.resolve(decisionsArgument), "utf8"),
);
const decisions = new Map();
for (const row of decisionRows) {
  if (!row.unit_id) throw new Error("Adjudication row is missing unit_id.");
  if (decisions.has(row.unit_id)) {
    throw new Error(`Duplicate adjudication row ${row.unit_id}.`);
  }
  decisions.set(row.unit_id, row);
}

const output = [];
const usedDecisions = new Set();
for (const registry of primary.registryRows) {
  const left = primary.recordsByUnit.get(registry.unit_id);
  const right = reviewer.recordsByUnit.get(registry.unit_id);
  let chosen = left;
  let reviewStatus = "single-pass";
  if (right && decisionsEqual(left, right)) {
    reviewStatus = "independently-reviewed";
  } else if (right) {
    const row = decisions.get(registry.unit_id);
    if (!row) {
      throw new Error(`Missing adjudication for ${registry.unit_id}.`);
    }
    chosen = recordFromCsvRow(row, "adjudicator-input");
    reviewStatus = "adjudicated";
    usedDecisions.add(registry.unit_id);
  }
  output.push({
    ...chosen,
    annotator: "adjudicated",
    adjudicator: reviewStatus === "adjudicated" ? adjudicator : null,
    review_status: reviewStatus,
    source_annotations: {
      a: sourceAnnotation(left),
      b: right ? sourceAnnotation(right) : null,
    },
  });
}
if (usedDecisions.size !== decisions.size) {
  const unused = [...decisions.keys()].filter(
    (unitId) => !usedDecisions.has(unitId),
  );
  throw new Error(
    `Adjudication CSV contains ${unused.length} unexpected row(s): ${unused.slice(0, 3).join(", ")}.`,
  );
}

validateAnnotationSet(output, {
  registryName: "annotation-sheet.csv",
  role: "final",
  expectedAnnotator: "adjudicated",
});
writeJsonLines(path.resolve(outputArgument), output);
const counts = {};
for (const record of output) {
  counts[record.review_status] = (counts[record.review_status] ?? 0) + 1;
}
console.log(
  `Wrote ${output.length} final units: ${Object.entries(counts)
    .map(([status, count]) => `${status}=${count}`)
    .join(", ")}.`,
);

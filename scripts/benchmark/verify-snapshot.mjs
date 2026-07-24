#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../..",
);
const benchmarkRoot = path.join(repositoryRoot, "benchmark");
const manifestPath = path.join(benchmarkRoot, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const errors = [];
const repositories = new Set();
const caseIds = new Set();
const snapshotPaths = new Set();
const strata = {};
const families = {};
const notices = fs.readFileSync(
  path.join(benchmarkRoot, "THIRD_PARTY_NOTICES.md"),
  "utf8",
);

for (const item of manifest.cases) {
  if (caseIds.has(item.case_id)) {
    errors.push(`${item.case_id}: duplicate case ID`);
  }
  caseIds.add(item.case_id);
  if (repositories.has(item.repository)) {
    errors.push(`${item.case_id}: repository is not unique`);
  }
  repositories.add(item.repository);
  if (snapshotPaths.has(item.snapshot_path)) {
    errors.push(`${item.case_id}: snapshot path is not unique`);
  }
  snapshotPaths.add(item.snapshot_path);
  strata[item.stratum] = (strata[item.stratum] ?? 0) + 1;
  if (item.configuration_family) {
    families[item.configuration_family] =
      (families[item.configuration_family] ?? 0) + 1;
  }

  if (!["dev", "eval"].includes(item.split)) {
    errors.push(`${item.case_id}: invalid split ${String(item.split)}`);
  }
  if (!/^[a-f0-9]{40}$/.test(item.source_commit)) {
    errors.push(`${item.case_id}: invalid source commit`);
  }
  if (!/^[a-f0-9]{40}$/.test(item.blob_sha)) {
    errors.push(`${item.case_id}: invalid blob SHA`);
  }
  if (!/^[a-f0-9]{64}$/.test(item.sha256)) {
    errors.push(`${item.case_id}: invalid SHA-256`);
  }
  if (!/^\.github\/workflows\/[^/]+\.ya?ml$/.test(item.source_path)) {
    errors.push(`${item.case_id}: source is not a direct workflow YAML`);
  }
  if (!item.license || ["NOASSERTION", "Other"].includes(item.license)) {
    errors.push(`${item.case_id}: no redistributable SPDX license`);
  }
  if (
    !item.source_url.includes(`/blob/${item.source_commit}/`) ||
    !item.source_url.endsWith(`/${item.source_path}`)
  ) {
    errors.push(`${item.case_id}: source URL is not commit-pinned`);
  }
  if (
    !new RegExp(`^\\|\\s*${escapeRegExp(item.case_id)}\\s*\\|`, "m").test(
      notices,
    )
  ) {
    errors.push(`${item.case_id}: missing third-party notice`);
  }

  const snapshot = path.join(repositoryRoot, item.snapshot_path);
  if (!fs.existsSync(snapshot)) {
    errors.push(`${item.case_id}: missing ${item.snapshot_path}`);
    continue;
  }
  const content = fs.readFileSync(snapshot);
  const digest = crypto.createHash("sha256").update(content).digest("hex");
  if (digest !== item.sha256) {
    errors.push(
      `${item.case_id}: sha256 ${digest} does not match ${item.sha256}`,
    );
  }
  if (content.length !== item.bytes) {
    errors.push(
      `${item.case_id}: ${content.length} bytes does not match ${item.bytes}`,
    );
  }
  const blobDigest = gitBlobSha(content);
  if (blobDigest !== item.blob_sha) {
    errors.push(
      `${item.case_id}: Git blob SHA ${blobDigest} does not match ${item.blob_sha}`,
    );
  }
}

if (manifest.benchmark_id !== "agentci-real-workflows-v3") {
  errors.push("current benchmark must be agentci-real-workflows-v3");
}
if (manifest.workflow_count !== 152 || manifest.repository_count !== 152) {
  errors.push("v3 must contain exactly 152 workflows from 152 repositories");
}
if (manifest.workflow_count !== manifest.cases.length) {
  errors.push("workflow_count does not match cases length");
}
if (manifest.repository_count !== repositories.size) {
  errors.push("repository_count does not match unique repositories");
}
if (manifest.workflow_count < 100 || manifest.repository_count < 50) {
  errors.push("benchmark minimum is 100 workflows from 50 repositories");
}
if (strata["ai-enriched"] !== 60 || strata.control !== 60) {
  errors.push(
    "original balanced strata must remain 60 AI-enriched / 60 control",
  );
}
const splitCounts = Object.fromEntries(
  ["dev", "eval"].map((split) => [
    split,
    manifest.cases.filter((item) => item.split === split).length,
  ]),
);
if (splitCounts.dev !== 57 || splitCounts.eval !== 95) {
  errors.push(
    `v3 split must be dev=57/eval=95, found dev=${splitCounts.dev}/eval=${splitCounts.eval}`,
  );
}
const diversityTarget = manifest.diversity_target_per_configuration;
const heldoutTarget = manifest.heldout_diversity_target_per_configuration;
const reclassifiedIds = new Set(
  manifest.development_reclassified_case_ids ?? [],
);
const heldoutIds = new Set(manifest.heldout_case_ids ?? []);
for (const family of [
  "codex-action",
  "aider-cli",
  "cursor-agent-cli",
  "openhands",
]) {
  if (families[family] !== diversityTarget + heldoutTarget) {
    errors.push(
      `${family}: expected ${diversityTarget + heldoutTarget} cases, found ${families[family] ?? 0}`,
    );
  }
  const developmentCount = manifest.cases.filter(
    (item) =>
      item.configuration_family === family &&
      item.selection_round === "inspected-before-heldout-freeze-v3" &&
      item.split === "dev",
  ).length;
  if (developmentCount !== diversityTarget) {
    errors.push(
      `${family}: expected ${diversityTarget} reclassified development cases, found ${developmentCount}`,
    );
  }
  const evaluationCount = manifest.cases.filter(
    (item) =>
      item.configuration_family === family &&
      item.selection_round === "heldout-diversity-v3" &&
      item.split === "eval",
  ).length;
  if (evaluationCount !== heldoutTarget) {
    errors.push(
      `${family}: expected ${heldoutTarget} held-out evaluation cases, found ${evaluationCount}`,
    );
  }
}
if (
  reclassifiedIds.size !== diversityTarget * 4 ||
  heldoutIds.size !== heldoutTarget * 4
) {
  errors.push(
    "v3 reclassified and held-out case lists must each contain 16 IDs",
  );
}
for (const item of manifest.cases) {
  if (
    reclassifiedIds.has(item.case_id) !==
      (item.selection_round === "inspected-before-heldout-freeze-v3") ||
    heldoutIds.has(item.case_id) !==
      (item.selection_round === "heldout-diversity-v3")
  ) {
    errors.push(
      `${item.case_id}: v3 split-correction metadata is inconsistent`,
    );
  }
  if (
    !reclassifiedIds.has(item.case_id) &&
    !heldoutIds.has(item.case_id) &&
    item.split !== baseSplit(item.repository, manifest.collection_seed)
  ) {
    errors.push(`${item.case_id}: deterministic base split was changed`);
  }

  let expectedSelectionKey;
  if (reclassifiedIds.has(item.case_id)) {
    expectedSelectionKey = selectionKey(
      manifest.diversity_collection_seed,
      item.configuration_family,
      item,
    );
  } else if (heldoutIds.has(item.case_id)) {
    expectedSelectionKey = selectionKey(
      manifest.heldout_diversity_collection_seed,
      item.configuration_family,
      item,
    );
  } else if (item.selection_round === "control-path-correction-v2") {
    expectedSelectionKey = selectionKey(
      manifest.control_path_correction?.seed,
      null,
      item,
    );
  }
  if (
    expectedSelectionKey !== undefined &&
    item.selection_key !== expectedSelectionKey
  ) {
    errors.push(`${item.case_id}: deterministic selection key was changed`);
  }
}

const archivedV2Path = path.join(
  repositoryRoot,
  manifest.supersedes?.manifest ?? "",
);
let archivedV2;
let archivedV1;
if (!fs.existsSync(archivedV2Path)) {
  errors.push("superseded v2 manifest is missing");
} else {
  archivedV2 = JSON.parse(fs.readFileSync(archivedV2Path, "utf8"));
  if (
    archivedV2.benchmark_id !== "agentci-real-workflows-v2" ||
    archivedV2.cases.length !== 136
  ) {
    errors.push("archived v2 manifest is not the 136-workflow candidate");
  } else {
    const currentById = new Map(
      manifest.cases.map((item) => [item.case_id, item]),
    );
    const archivedDiversityIds = new Set(
      archivedV2.cases
        .filter((item) => item.configuration_family)
        .map((item) => item.case_id),
    );
    if (
      archivedDiversityIds.size !== reclassifiedIds.size ||
      [...archivedDiversityIds].some((caseId) => !reclassifiedIds.has(caseId))
    ) {
      errors.push(
        "v3 reclassified IDs do not exactly match v2 diversity cases",
      );
    }
    for (const old of archivedV2.cases) {
      const current = currentById.get(old.case_id);
      if (!current) {
        errors.push(`${old.case_id}: v2 case is missing from v3`);
        continue;
      }
      for (const field of [
        "repository",
        "source_path",
        "source_commit",
        "blob_sha",
        "sha256",
        "bytes",
        "snapshot_path",
      ]) {
        if (current?.[field] !== old[field]) {
          errors.push(
            `${old.case_id}: v2 provenance field ${field} was changed`,
          );
        }
      }
      if (!reclassifiedIds.has(old.case_id) && current.split !== old.split) {
        errors.push(`${old.case_id}: non-reclassified v2 split was changed`);
      }
    }
  }
}

const archivedV1Path = path.join(
  repositoryRoot,
  archivedV2?.supersedes?.manifest ?? "",
);
if (!fs.existsSync(archivedV1Path)) {
  errors.push("superseded v1 manifest is missing");
} else {
  archivedV1 = JSON.parse(fs.readFileSync(archivedV1Path, "utf8"));
  if (
    archivedV1.benchmark_id !== "agentci-real-workflows-v1" ||
    archivedV1.cases.length !== 120
  ) {
    errors.push("archived v1 manifest is not the 120-workflow candidate");
  } else {
    const currentById = new Map(
      manifest.cases.map((item) => [item.case_id, item]),
    );
    const excluded = new Set(
      manifest.control_path_correction?.excluded_case_ids ?? [],
    );
    for (const old of archivedV1.cases) {
      const current = currentById.get(old.case_id);
      if (!current && excluded.has(old.case_id)) {
        const archivedSnapshot = path.join(repositoryRoot, old.snapshot_path);
        if (!fs.existsSync(archivedSnapshot)) {
          errors.push(`${old.case_id}: archived snapshot is missing`);
        } else {
          const content = fs.readFileSync(archivedSnapshot);
          const digest = crypto
            .createHash("sha256")
            .update(content)
            .digest("hex");
          if (digest !== old.sha256 || content.length !== old.bytes) {
            errors.push(`${old.case_id}: archived snapshot drifted`);
          }
          if (gitBlobSha(content) !== old.blob_sha) {
            errors.push(`${old.case_id}: archived Git blob SHA drifted`);
          }
        }
        continue;
      }
      for (const field of [
        "repository",
        "source_path",
        "source_commit",
        "blob_sha",
        "sha256",
        "bytes",
        "snapshot_path",
      ]) {
        if (current?.[field] !== old[field]) {
          errors.push(
            `${old.case_id}: v1 provenance field ${field} was changed`,
          );
        }
      }
    }
  }
}

const snapshotDirectories = fs
  .readdirSync(path.join(benchmarkRoot, "snapshots"), {
    withFileTypes: true,
  })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const archivedCaseIds = new Set([
  ...(archivedV2?.cases ?? []).map((item) => item.case_id),
  ...(archivedV1?.cases ?? []).map((item) => item.case_id),
]);
const allowedSnapshotIds = new Set([...caseIds, ...archivedCaseIds]);
if (
  [...caseIds].some((caseId) => !snapshotDirectories.includes(caseId)) ||
  snapshotDirectories.some((caseId) => !allowedSnapshotIds.has(caseId))
) {
  errors.push(
    "snapshot directories do not match the current or archived manifest",
  );
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Verified ${manifest.workflow_count} immutable workflows from ${manifest.repository_count} repositories, including ${Object.values(families).reduce((sum, count) => sum + count, 0)} targeted agent-diversity cases.`,
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function gitBlobSha(content) {
  return crypto
    .createHash("sha1")
    .update(`blob ${content.length}\0`)
    .update(content)
    .digest("hex");
}

function baseSplit(repository, seed) {
  const digest = crypto
    .createHash("sha256")
    .update(`${seed}:${repository}`)
    .digest();
  return digest.readUInt32BE(0) % 3 === 0 ? "dev" : "eval";
}

function selectionKey(seed, configuration, item) {
  if (typeof seed !== "string" || !seed) return undefined;
  const parts = [
    seed,
    ...(configuration ? [configuration] : []),
    item.repository,
    item.source_path,
    item.source_url,
  ];
  return crypto.createHash("sha256").update(parts.join(":")).digest("hex");
}

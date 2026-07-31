#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
);
const outputPath = path.join(repositoryRoot, "THIRD_PARTY_LICENSES.md");
const grouped = JSON.parse(
  execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  }),
);
const packages = new Map();

for (const entries of Object.values(grouped)) {
  for (const entry of entries) {
    for (const packagePath of entry.paths ?? []) {
      const metadata = JSON.parse(
        fs.readFileSync(path.join(packagePath, "package.json"), "utf8"),
      );
      const id = `${metadata.name}@${metadata.version}`;
      const licenseName = fs
        .readdirSync(packagePath)
        .find((name) => /^(?:licen[cs]e|copying)(?:\.|$)/i.test(name));
      if (!licenseName) {
        throw new Error(`${id} does not expose a license file.`);
      }
      packages.set(id, {
        name: metadata.name,
        version: metadata.version,
        license: metadata.license,
        homepage: metadata.homepage,
        text: fs
          .readFileSync(path.join(packagePath, licenseName), "utf8")
          .trim(),
      });
    }
  }
}

const lines = [
  "# Third-Party Runtime Licenses",
  "",
  "AgentCI Guard's committed JavaScript bundles include the locked production",
  "dependencies listed below. This file is generated from their installed",
  "package metadata and license files by",
  "`scripts/generate-third-party-licenses.mjs`.",
  "",
];
for (const item of [...packages.values()].sort((left, right) =>
  `${left.name}@${left.version}`.localeCompare(
    `${right.name}@${right.version}`,
  ),
)) {
  lines.push(
    `## ${item.name} ${item.version}`,
    "",
    `License: ${item.license ?? "unknown"}`,
    ...(item.homepage ? [`Homepage: ${item.homepage}`] : []),
    "",
    "```text",
    item.text,
    "```",
    "",
  );
}
const rendered = `${lines.join("\n").trimEnd()}\n`;
const mode = process.argv[2] ?? "--check";

if (mode === "--write") {
  fs.writeFileSync(outputPath, rendered);
  console.log(
    `Wrote ${packages.size} bundled dependency licenses to ${outputPath}.`,
  );
} else if (mode === "--check") {
  const existing = fs.existsSync(outputPath)
    ? fs.readFileSync(outputPath, "utf8")
    : "";
  if (existing !== rendered) {
    console.error(
      "THIRD_PARTY_LICENSES.md is stale; run node scripts/generate-third-party-licenses.mjs --write",
    );
    process.exitCode = 1;
  } else {
    console.log(`Verified ${packages.size} bundled dependency licenses.`);
  }
} else {
  throw new Error("Expected --check or --write.");
}

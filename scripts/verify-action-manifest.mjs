#!/usr/bin/env node
import fs from "node:fs";
import { isBuiltin } from "node:module";
import path from "node:path";
import YAML from "yaml";

const root = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
);
const manifestPath = path.join(root, "action.yml");
const manifest = YAML.parse(fs.readFileSync(manifestPath, "utf8"));
const packageMetadata = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);
const errors = [];

if (packageMetadata.type !== "module") {
  errors.push("package.json type must be module for the ESM Action bundle");
}
if (manifest?.runs?.using !== "node24") {
  errors.push("action.yml runs.using must be node24");
}
if (manifest?.runs?.main !== "dist/action.js") {
  errors.push("action.yml runs.main must be dist/action.js");
}
if (manifest?.runs && "args" in manifest.runs) {
  errors.push("action.yml must not route through runs.args");
}
if (!fs.existsSync(path.join(root, "dist", "action.js"))) {
  errors.push("dist/action.js is missing");
} else {
  const bundle = fs.readFileSync(path.join(root, "dist", "action.js"), "utf8");
  const imports = [
    ...bundle.matchAll(/(?:\bfrom\s*|\bimport\s*)["']([^"']+)["']/g),
  ].map((match) => match[1]);
  const external = imports.filter(
    (specifier) => !isBuiltin(specifier) && !specifier.startsWith("."),
  );
  if (external.length > 0) {
    errors.push(
      `dist/action.js has external runtime imports: ${[...new Set(external)].join(", ")}`,
    );
  }
}

const requiredInputs = ["path", "sarif", "fail-on"];
for (const name of requiredInputs) {
  if (!manifest?.inputs?.[name]) errors.push(`missing input ${name}`);
}
const requiredOutputs = [
  "findings",
  "critical",
  "high",
  "medium",
  "low",
  "sarif-path",
  "diagnostics",
  "analysis-complete",
];
for (const name of requiredOutputs) {
  if (!manifest?.outputs?.[name]) errors.push(`missing output ${name}`);
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    "Verified action.yml uses the self-contained committed Node 24 Action bundle with the documented inputs and outputs.",
  );
}

#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AjvDraft04 from "ajv-draft-04";
import addFormats from "ajv-formats";

const sarifPaths = process.argv.slice(2);
if (sarifPaths.length === 0) {
  console.error(
    "Usage: node scripts/verify-sarif-schema.mjs <file.sarif> [more.sarif ...]",
  );
  process.exit(2);
}

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const schemaPath = path.join(
  repositoryRoot,
  "schemas",
  "sarif-schema-2.1.0.json",
);
const schemaRaw = fs.readFileSync(schemaPath);
const schemaSha256 = crypto
  .createHash("sha256")
  .update(schemaRaw)
  .digest("hex");
const expectedSchemaSha256 =
  "c3b4bb2d6093897483348925aaa73af03b3e3f4bd4ca38cef26dcb4212a2682e";
if (schemaSha256 !== expectedSchemaSha256) {
  throw new Error(
    `Vendored OASIS SARIF schema has SHA-256 ${schemaSha256}; expected ${expectedSchemaSha256}.`,
  );
}
const schema = JSON.parse(schemaRaw.toString("utf8"));
if (
  schema.$schema !== "http://json-schema.org/draft-04/schema#" ||
  schema.id !==
    "https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json"
) {
  throw new Error("Vendored SARIF schema identity is unexpected.");
}

const ajv = new AjvDraft04({
  allErrors: true,
  strict: false,
});
addFormats(ajv);
const validate = ajv.compile(schema);
let failed = false;

for (const sarifArgument of sarifPaths) {
  const sarifPath = path.resolve(sarifArgument);
  let document;
  try {
    document = JSON.parse(fs.readFileSync(sarifPath, "utf8"));
  } catch (error) {
    console.error(
      `${sarifArgument}: unable to parse JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    failed = true;
    continue;
  }
  if (!validate(document)) {
    const details = (validate.errors ?? [])
      .map(
        (error) =>
          `${error.instancePath || "/"} ${error.message ?? "is invalid"}`,
      )
      .join("; ");
    console.error(
      `${sarifArgument}: official SARIF 2.1.0 schema validation failed: ${details}`,
    );
    failed = true;
  } else {
    console.log(
      `Verified ${sarifArgument} against the vendored OASIS SARIF 2.1.0 Errata 01 schema.`,
    );
  }
}

if (failed) process.exitCode = 1;

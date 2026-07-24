import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scanRepository } from "../src/index.js";

type CorpusCase = {
  id: string;
  path: string;
  expected_rules: string[];
  expected_diagnostics: string[];
};

const corpusRoot = path.resolve("corpus/adversarial");
const manifest = JSON.parse(
  await fs.readFile(path.join(corpusRoot, "manifest.json"), "utf8"),
) as { cases: CorpusCase[] };

describe("public adversarial corpus", () => {
  for (const fixture of manifest.cases) {
    it(fixture.id, async () => {
      const result = await scanRepository(path.join(corpusRoot, fixture.path));
      const rules = result.findings.map((finding) => finding.rule_id).sort();
      const diagnostics = result.diagnostics
        .map((diagnostic) => diagnostic.code)
        .sort();

      expect(rules).toEqual([...fixture.expected_rules].sort());
      expect(diagnostics).toEqual([...fixture.expected_diagnostics].sort());
      expect(result.analysis_complete).toBe(diagnostics.length === 0);
    });
  }
});

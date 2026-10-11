import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { parseWorkflowFile, scanWorkflowFiles } from "../dist/index.js";

const root = "/agentci-browser";
const file = `${root}/.github/workflows/input.yml`;
const bundle = await fs.readFile(
  new URL("./dist/scanner-browser.js", import.meta.url),
  "utf8",
);
assert.match(
  await fs.readFile(new URL("./dist/_headers", import.meta.url), "utf8"),
  /connect-src 'none'/,
);
let networkCalls = 0;
const sandbox = {
  fetch() {
    networkCalls++;
    throw new Error("browser scanner attempted a network request");
  },
};
vm.runInNewContext(bundle, sandbox, {
  filename: "scanner-browser.js",
  timeout: 5000,
});
const scan = sandbox.agentciScanWorkflow;
assert.equal(typeof scan, "function");
assert.equal(
  scan.version,
  JSON.parse(
    await fs.readFile(new URL("../package.json", import.meta.url), "utf8"),
  ).version,
);
assert.equal(scan.maxChars, 250_000);
assert.equal(scan.maxSteps, 500);

function withoutTimestamp(result) {
  const copy = JSON.parse(JSON.stringify(result));
  delete copy.scanned_at;
  return copy;
}

const manifest = JSON.parse(
  await fs.readFile(
    new URL("../corpus/adversarial/manifest.json", import.meta.url),
    "utf8",
  ),
);
let checked = 0;
for (const testCase of manifest.cases) {
  const directory = new URL(
    `../corpus/adversarial/${testCase.path}/.github/workflows/`,
    import.meta.url,
  );
  for (const name of (await fs.readdir(directory)).filter((name) =>
    /\.ya?ml$/.test(name),
  )) {
    const raw = await fs.readFile(new URL(name, directory), "utf8");
    const workflow = parseWorkflowFile(file, raw);
    const expected = scanWorkflowFiles([workflow], root, {
      ignore: [],
      ignorePaths: [],
    });
    assert.deepEqual(
      withoutTimestamp(scan(raw)),
      withoutTimestamp(expected),
      `${testCase.id}/${name}`,
    );
    checked++;
  }
}

assert.throws(() => scan("foo: bar\n"), /not a GitHub Actions workflow/);
assert.throws(
  () => scan("on:\njobs:\n  agent: {}\n"),
  /not a GitHub Actions workflow/,
);
assert.throws(
  () => scan("on: push\njobs: {}\n"),
  /not a GitHub Actions workflow/,
);
assert.throws(
  () => scan("on: push\njobs:\n  agent: null\n"),
  /not a GitHub Actions workflow/,
);
assert.throws(
  () => scan("on: push\njobs:\n  agent:\n    steps: [null]\n"),
  /not a GitHub Actions workflow/,
);
assert.throws(() => scan(" "), /Enter a GitHub Actions workflow/);
assert.throws(() => scan("a".repeat(scan.maxChars + 1)), {
  name: "RangeError",
});
const tooManySteps = `on: push\njobs:\n  agent:\n    runs-on: ubuntu-latest\n    steps:\n${"      - run: echo ok\n".repeat(scan.maxSteps + 1)}`;
assert.throws(() => scan(tooManySteps), /browser limit of 500 steps/);
const duplicateKey = scan("on: push\non: pull_request\njobs: {}\n");
assert.equal(duplicateKey.analysis_complete, false);
assert.equal(duplicateKey.diagnostics[0]?.code, "agentci/parse-error");
assert.equal(duplicateKey.findings.length, 0);
let aliases = "on: push\njobs:\n  a0: &a0 [x]\n";
for (let index = 1; index <= 8; index++) {
  aliases += `  a${index}: &a${index} [${Array(10)
    .fill(`*a${index - 1}`)
    .join(", ")}]\n`;
}
assert.throws(() => scan(aliases), /Excessive alias count/);
assert.equal(networkCalls, 0);

console.log(
  `PASS: browser-local scanner matched Node core on ${checked} adversarial YAML files; rejected non-workflow/oversized input; parse and alias errors fail closed; no network calls.`,
);

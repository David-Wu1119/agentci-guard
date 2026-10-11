import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { parseWorkflowFile, scanWorkflowFiles } from "../dist/index.js";

const root = "/agentci-browser";
const file = `${root}/.github/workflows/input.yml`;
const bundle = await fs.readFile(
  new URL("./dist/scanner-browser.js", import.meta.url),
  "utf8",
);
const digest = createHash("sha256").update(bundle).digest();
const html = await fs.readFile(
  new URL("./dist/index.html", import.meta.url),
  "utf8",
);
assert.ok(
  html.includes(
    `<script src="scanner-browser.js?v=${digest.toString("hex")}" integrity="sha256-${digest.toString("base64")}" defer></script>`,
  ),
);
for (const [name, tag] of [
  ["styles.css", "link"],
  ["app.js", "script"],
]) {
  const bytes = await fs.readFile(new URL(`./dist/${name}`, import.meta.url));
  const version = createHash("sha256").update(bytes).digest("hex");
  const reference = `${name}?v=${version}`;
  assert.ok(
    html.includes(
      tag === "link"
        ? `<link rel="stylesheet" href="${reference}">`
        : `<script src="${reference}" defer></script>`,
    ),
    `${name} must use its content hash in the page URL`,
  );
}
assert.ok(
  html.includes(`<code id="scanner-digest">${digest.toString("hex")}</code>`),
);
let sourceCommit = "";
let sourceDirty = true;
try {
  const sourceRoot = await fs.realpath(
    fileURLToPath(new URL("../", import.meta.url)),
  );
  const gitRoot = await fs.realpath(
    execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: sourceRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim(),
  );
  if (gitRoot !== sourceRoot)
    throw new Error("Source is nested in an unrelated Git repository");
  sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: sourceRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  sourceDirty = Boolean(
    execFileSync("git", ["status", "--porcelain"], {
      cwd: sourceRoot,
      encoding: "utf8",
    }).trim(),
  );
} catch {}
const sourceLabel = !sourceCommit
  ? "Source revision unavailable (non-Git build)"
  : sourceDirty
    ? "Uncommitted local build (no exact source commit)"
    : `<a href="https://github.com/David-Wu1119/agentci-guard/tree/${sourceCommit}">${sourceCommit}</a> (clean checkout; publication not verified by this build)`;
assert.ok(html.includes(`<span id="scanner-source">${sourceLabel}</span>`));
assert.match(
  html,
  /<p class="evidence-status"><strong>Accuracy unmeasured\.<\/strong> No sealed human-labeled evaluation\./,
);
assert.match(html, /<a href="#boundaries">Read the limits\.<\/a>/);
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
const featured = manifest.cases.find(
  (testCase) => testCase.id === "event-gated-prt",
);
assert.ok(featured);
const embedded = html.match(
  /<pre><code>(name: event-gated-prt[\s\S]*?)<\/code><\/pre>/,
)?.[1];
assert.ok(embedded);
const displayedSample = embedded.replaceAll("&#36;", "$");
assert.equal(
  displayedSample,
  (
    await fs.readFile(
      new URL(
        "../corpus/adversarial/cases/event-gated-prt/.github/workflows/agent.yml",
        import.meta.url,
      ),
      "utf8",
    )
  ).trimEnd(),
);
const featuredResult = scan(displayedSample);
assert.deepEqual(
  Array.from(featuredResult.findings, ({ rule_id, severity }) => [
    rule_id,
    severity,
  ]).sort(),
  featured.expected.findings
    .map(({ rule_id, severity }) => [rule_id, severity])
    .sort(),
);
assert.equal(featuredResult.analysis_complete, true);
assert.equal(featuredResult.diagnostics.length, 0);
assert.match(
  await fs.readFile(new URL("./dist/app.js", import.meta.url), "utf8"),
  /allowed_non_write_users requires an explicit github_token/,
);
assert.doesNotMatch(
  html,
  /broad allowlist removes the Action's default write-access gate/i,
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
const opaqueRun = scan(
  'on: push\njobs:\n  agent:\n    runs-on: ubuntu-latest\n    steps:\n      - run: eval "claude -p fixed"\n',
);
assert.equal(opaqueRun.analysis_complete, false);
assert.ok(
  opaqueRun.diagnostics.some(
    ({ code }) => code === "agentci/analysis-run-dataflow-unknown",
  ),
);
const shadowedLiteral = scan(
  'on: issues\npermissions:\n  contents: write\njobs:\n  agent:\n    runs-on: ubuntu-latest\n    steps:\n      - run: |\n          false() { true; }\n          if false; then claude -p "${{ github.event.issue.body }}"; fi\n',
);
assert.equal(shadowedLiteral.analysis_complete, false);
assert.ok(shadowedLiteral.agent_usages.length > 0);
assert.ok(
  shadowedLiteral.diagnostics.some(
    ({ code }) => code === "agentci/analysis-shell-control-flow-unknown",
  ),
);
const uncalledFunction = scan(
  'on: issues\npermissions:\n  contents: write\njobs:\n  agent:\n    runs-on: ubuntu-latest\n    steps:\n      - run: |\n          if ignored() { claude -p "${{ github.event.issue.body }}"; }; then :; fi\n',
);
assert.equal(uncalledFunction.agent_usages.length, 0);
assert.equal(uncalledFunction.findings.length, 0);
assert.equal(uncalledFunction.analysis_complete, false);
assert.ok(
  uncalledFunction.diagnostics.some(
    ({ code }) => code === "agentci/analysis-run-dataflow-unknown",
  ),
);
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

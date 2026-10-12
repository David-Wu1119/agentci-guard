import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createServer } from "node:http";
const root = new URL("./", import.meta.url).pathname;
const manifest = JSON.parse(
  await fs.readFile(new URL("./BUILD_MANIFEST.json", import.meta.url), "utf8"),
);
const scannerName = Object.keys(manifest).find((name) =>
  /^scanner-browser\.[a-f0-9]{64}\.js$/.test(name),
);
assert.ok(scannerName);
const appName = Object.keys(manifest).find((name) =>
  /^app\.[a-f0-9]{64}\.js$/.test(name),
);
assert.ok(appName);
const servedFiles = new Set(
  Object.keys(manifest).filter((name) => name !== "_headers"),
);
let tamperedAsset = "";
const server = createServer(async (request, response) => {
  const name =
    new URL(request.url, "http://localhost").pathname.slice(1) || "index.html";
  if (name === "favicon.ico") {
    response.writeHead(204).end();
    return;
  }
  if (request.method !== "GET" || !servedFiles.has(name)) {
    response.writeHead(404).end();
    return;
  }
  try {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader(
      "Content-Type",
      name.endsWith(".js")
        ? "text/javascript"
        : name.endsWith(".css")
          ? "text/css"
          : name.endsWith(".html")
            ? "text/html"
            : "text/plain",
    );
    const bytes = await fs.readFile(new URL(`./dist/${name}`, import.meta.url));
    response.end(
      tamperedAsset === name
        ? Buffer.concat([bytes, Buffer.from("\n// tampered")])
        : bytes,
    );
  } catch {
    response.writeHead(500).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const siteUrl = `http://127.0.0.1:${server.address().port}/`;
const targets = await (await fetch("http://127.0.0.1:9337/json")).json();
const target = targets.find((t) => t.type === "page");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});
let id = 0;
const waiting = new Map();
const exceptions = [];
const requests = [];
const responses = [];
socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.id) {
    const w = waiting.get(data.id);
    waiting.delete(data.id);
    data.error ? w.reject(data.error) : w.resolve(data.result);
  } else {
    if (data.method === "Runtime.exceptionThrown") exceptions.push(data.params);
    if (data.method === "Network.requestWillBeSent")
      requests.push(data.params.request.url);
    if (data.method === "Network.responseReceived")
      responses.push({
        url: data.params.response.url,
        status: data.params.response.status,
      });
  }
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const key = ++id;
    waiting.set(key, { resolve, reject });
    socket.send(JSON.stringify({ id: key, method, params }));
  });
const evaluate = async (expression) =>
  (
    await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
  ).result.value;
await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Page.navigate", {
  url: siteUrl,
});
for (let attempt = 0; attempt < 50; attempt++) {
  if ((await evaluate("document.readyState")) === "complete") break;
  await new Promise((r) => setTimeout(r, 100));
}
const checks = [];
const hero = await evaluate(
  '({label:document.querySelector(".scan-card")?.getAttribute("aria-label"),status:document.querySelector(".scan-card .status")?.textContent,marker:document.querySelector(".scan-card .severity")?.textContent,text:document.querySelector(".scan-card")?.textContent})',
);
assert.equal(hero.label, "Schematic workflow review checklist");
assert.equal(hero.status, "Schematic");
assert.equal(hero.marker, "NOT A SCAN RESULT");
assert.match(hero.text, /not executable YAML/);
assert.equal(hero.text.includes("CRITICAL"), false);
checks.push({
  hero: { label: hero.label, status: hero.status, marker: hero.marker },
});
const research = await evaluate(
  '({canonical:document.querySelector("link[rel=canonical]")?.href,robots:document.querySelector("meta[name=robots]")!==null,caseRows:Array.from(document.querySelectorAll("#research tbody tr")).map(row=>Array.from(row.cells).map(cell=>cell.textContent.trim())),pinned:document.querySelector("#research .case-links a")?.href.includes("blob/5c045e0469f412aecd0f9d5f32876bf10c7fc66b/"),methodsText:document.querySelector("#study-methods")?.textContent,methodsLinks:Array.from(document.querySelectorAll("#study-methods a")).map(link=>link.href),sourceHref:document.querySelector("#scanner-source a")?.href??null,localPreview:document.body.textContent.includes("Local preview")})',
);
assert.equal(research.canonical, "https://cryptoaxiom.net/");
assert.equal(research.robots, false);
assert.equal(research.pinned, true);
assert.match(
  research.methodsText,
  /v3.*development-only.*human evaluation.*pending/i,
);
const methodsCommit =
  research.sourceHref?.split("/").at(-1) ??
  "07537106d6557db9262ba0d506f1dfb8f3ce3123";
assert.deepEqual(research.methodsLinks, [
  `https://github.com/David-Wu1119/agentci-guard/blob/${methodsCommit}/BENCHMARK.md`,
  `https://github.com/David-Wu1119/agentci-guard/blob/${methodsCommit}/DATA_CARD.md`,
  `https://github.com/David-Wu1119/agentci-guard/blob/${methodsCommit}/REPRODUCIBILITY.md`,
]);
assert.equal(research.localPreview, false);
assert.deepEqual(research.caseRows, [
  ["agentci/pull-request-target-ai", "critical", "critical"],
  ["agentci/untrusted-input-in-prompt", "high", "high"],
]);
checks.push({ research });
const scanner = await evaluate(
  '({ready:typeof window.agentciScanWorkflow==="function",version:window.agentciScanWorkflow?.version,maxChars:window.agentciScanWorkflow?.maxChars,source:document.getElementById("scanner-source")?.textContent,sourceHref:document.querySelector("#scanner-source a")?.href??null})',
);
assert.equal(scanner.ready, true);
assert.equal(scanner.maxChars, 250000);
assert.deepEqual(
  await evaluate(
    '({controls:["workflow-yaml","workflow-file","load-example","scan-button"].map(id=>document.getElementById(id).disabled),examples:Array.from(document.querySelectorAll("[data-case]")).map(button=>button.disabled),status:document.getElementById("scan-status").textContent})',
  ),
  {
    controls: [false, false, false, false],
    examples: [false, false, false],
    status: "Load the sample or paste a workflow, then run the scanner.",
  },
);
assert.equal(
  await evaluate('document.getElementById("scan-results-heading").textContent'),
  "Ready to scan",
);
for (const name of ["styles.css"])
  assert.ok(
    requests.includes(new URL(`${name}?v=${manifest[name]}`, siteUrl).href),
    `${name} did not load from its content-versioned URL`,
  );
assert.ok(
  requests.includes(new URL(scannerName, siteUrl).href),
  "The content-addressed scanner did not load",
);
assert.ok(
  requests.includes(new URL(appName, siteUrl).href),
  "The content-addressed result renderer did not load",
);
assert.match(
  scanner.source,
  /Uncommitted local build|clean checkout|Source revision unavailable/,
);
if (scanner.sourceHref)
  assert.match(
    scanner.sourceHref,
    /^https:\/\/github\.com\/David-Wu1119\/agentci-guard\/tree\/[a-f0-9]{40}$/,
  );
await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 720,
  deviceScaleFactor: 1,
  mobile: true,
});
await evaluate('document.getElementById("load-example").click()');
await evaluate('document.getElementById("scan-button").click()');
const sample = await evaluate(
  '({heading:document.getElementById("scan-results-heading").textContent,status:document.getElementById("scan-status").textContent,complete:document.getElementById("scan-completeness").textContent,usages:Array.from(document.querySelectorAll("#scan-agent-usages li")).map(li=>li.textContent),rules:Array.from(document.querySelectorAll("#scan-findings li")).map(li=>li.textContent),diagnostics:document.querySelectorAll("#scan-diagnostics li").length,errorHidden:document.getElementById("scan-error").hidden})',
);
assert.equal(sample.heading, "2 findings for published sample");
assert.match(
  sample.status,
  /^1 recognized agent-use step; 2 findings; analysis complete for published sample\. Browser scanner trial \(page build source: /,
);
assert.ok(
  sample.status.includes(
    `page build source: ${scanner.sourceHref?.split("/").at(-1) ?? scanner.source.trim()}`,
  ),
);
assert.match(
  sample.status,
  /scanner and renderer scripts checked by the browser; compare separately with the published Action\/CLI/,
);
assert.doesNotMatch(sample.status, /Scanner v[0-9]/);
assert.match(sample.complete, /analysis_complete: true/);
assert.match(
  sample.complete,
  /does not validate the full GitHub Actions schema/,
);
assert.equal(
  await evaluate(
    'document.getElementById("scan-scope").textContent.includes("not a GitHub Actions schema validator")',
  ),
  true,
);
assert.equal(sample.rules.length, 2);
assert.match(sample.rules[0], /^CRITICAL · /);
assert.match(sample.rules[1], /^HIGH · /);
assert.equal(sample.usages.length, 1);
assert.match(sample.usages[0], /Evidence:.*anthropics\/claude-code-action@/);
assert.match(sample.usages[0], /Virtual location:.*input\.yml:/);
for (const [rule] of research.caseRows)
  assert.ok(
    sample.rules.some((row) => row.includes(rule)),
    rule,
  );
assert.equal(sample.errorHidden, true);
checks.push({ scanner, sample });
await new Promise((resolve) => setTimeout(resolve, 700));
const findingViewport = await evaluate(
  '({titleBottom:document.querySelector("#scan-findings li h5").getBoundingClientRect().bottom,viewportHeight:innerHeight,headingTop:document.getElementById("scan-results-heading").getBoundingClientRect().top,focus:document.activeElement.id,scrollY,provenance:document.getElementById("scanner-digest").textContent,provenanceClosed:!document.querySelector(".scanner-provenance").open,provenanceLabel:document.querySelector(".scanner-provenance summary").textContent,findingsBeforeUsages:!!(document.getElementById("scan-findings").compareDocumentPosition(document.getElementById("scan-agent-usages"))&Node.DOCUMENT_POSITION_FOLLOWING),warning:document.getElementById("scan-completeness").textContent})',
);
assert.ok(
  findingViewport.headingTop >= 0 &&
    findingViewport.titleBottom <= findingViewport.viewportHeight,
  JSON.stringify(findingViewport),
);
assert.match(findingViewport.warning, /does not.*guarantee security/);
assert.match(findingViewport.provenance, /^[a-f0-9]{64}$/);
assert.equal(findingViewport.focus, "scan-results-heading");
assert.equal(findingViewport.provenanceClosed, true);
assert.match(findingViewport.provenanceLabel, /not accuracy evidence/);
assert.equal(findingViewport.findingsBeforeUsages, true);
checks.push({ findingViewport });
await evaluate('document.querySelector(".scanner-provenance summary").focus()');
await send("Input.dispatchKeyEvent", {
  type: "keyDown",
  key: "Enter",
  code: "Enter",
  text: "\r",
  windowsVirtualKeyCode: 13,
  nativeVirtualKeyCode: 13,
});
await send("Input.dispatchKeyEvent", {
  type: "keyUp",
  key: "Enter",
  code: "Enter",
  windowsVirtualKeyCode: 13,
  nativeVirtualKeyCode: 13,
});
const disclosureAfterEnter = await evaluate(
  '({focus:document.activeElement.tagName,open:document.querySelector(".scanner-provenance").open})',
);
assert.equal(
  disclosureAfterEnter.open,
  true,
  JSON.stringify(disclosureAfterEnter),
);
checks.push({ provenanceKeyboardOpen: true });
await evaluate('document.querySelector(".scanner-provenance summary").click()');
for (const width of [1440, 1024, 768, 390, 320]) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: width < 500,
  });
  await new Promise((r) => setTimeout(r, 80));
  const dimensions = await evaluate(
    '({width:innerWidth,scroll:document.documentElement.scrollWidth,illustrativeButtons:document.querySelectorAll("[data-case]").length,scanButton:!!document.getElementById("scan-button")})',
  );
  assert.ok(dimensions.scroll <= dimensions.width, JSON.stringify(dimensions));
  assert.equal(dimensions.illustrativeButtons, 3);
  assert.equal(dimensions.scanButton, true);
  checks.push({ viewport: width, ...dimensions, overflow: false });
}
for (const name of ["default", "bypass", "unknown"]) {
  await evaluate(`document.querySelector('[data-case="${name}"]').click()`);
  const value = await evaluate(
    '({label:document.getElementById("case-label").textContent,pressed:document.querySelectorAll("[aria-pressed=true]").length,title:document.getElementById("case-title").textContent})',
  );
  assert.equal(value.pressed, 1);
  checks.push({ control: name, ...value });
}
const setAndScan = (raw) =>
  evaluate(`(() => {
    const input = document.getElementById("workflow-yaml");
    input.value = ${JSON.stringify(raw)};
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const button = document.getElementById("scan-button");
    button.focus();
    button.click();
    return {
      heading: document.getElementById("scan-results-heading").textContent,
      status: document.getElementById("scan-status").textContent,
      complete: document.getElementById("scan-completeness").textContent,
      error: document.getElementById("scan-error").textContent,
      outputHidden: document.getElementById("scan-output").hidden,
      findingText: document.getElementById("scan-findings").textContent,
      usageText: document.getElementById("scan-agent-usages").textContent,
      usageRows: document.querySelectorAll("#scan-agent-usages li").length,
      injectedUsageImages: document.querySelectorAll("#scan-agent-usages img").length,
      diagnostics: document.querySelectorAll("#scan-diagnostics li").length,
      focus: document.activeElement.id,
      errorTop: document.getElementById("scan-error").getBoundingClientRect().top,
      errorBottom: document.getElementById("scan-error").getBoundingClientRect().bottom,
      viewportHeight: innerHeight
    };
  })()`);
const malformed = await setAndScan("on: [\njobs: {");
assert.equal(malformed.heading, "Analysis incomplete for pasted YAML");
assert.match(malformed.complete, /analysis_complete: false/);
assert.match(malformed.usageText, /analysis is incomplete/);
assert.ok(malformed.diagnostics > 0);
assert.equal(malformed.outputHidden, false);
const partial = await setAndScan(
  "on: pull_request_target\njobs:\n  delegated:\n    uses: owner/repo/.github/workflows/ai.yml@main\n  agent:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: anthropics/claude-code-action@v1\n        with:\n          prompt: ${{ github.event.pull_request.body }}\n",
);
assert.equal(
  partial.heading,
  "Analysis incomplete — 3 findings for pasted YAML",
);
assert.match(partial.status, /3 findings; analysis incomplete/);
assert.match(partial.complete, /analysis_complete: false/);
assert.match(partial.findingText, /agentci\/pull-request-target-ai/);
assert.ok(partial.diagnostics > 0);
const genericYaml = await setAndScan("foo: bar");
assert.match(genericYaml.error, /not a GitHub Actions workflow/);
assert.equal(genericYaml.outputHidden, true);
const clean = await setAndScan(
  "on: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n",
);
assert.equal(clean.heading, "0 findings for pasted YAML");
assert.match(clean.findingText, /not proof of safety/i);
assert.match(clean.usageText, /No supported agent-use step detected/);
assert.equal(clean.error, "");
const usageOnly = await setAndScan(
  "on: push\npermissions:\n  contents: read\njobs:\n  agent:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Agent\n        uses: anthropics/claude-code-action@0123456789abcdef0123456789abcdef01234567\n        with:\n          prompt: hi\n",
);
assert.equal(usageOnly.heading, "0 findings for pasted YAML");
assert.equal(usageOnly.usageRows, 1);
assert.match(usageOnly.usageText, /Evidence:.*anthropics\/claude-code-action@/);
assert.match(usageOnly.complete, /analysis_complete: true/);
const lateCli = await setAndScan(
  `on: push\npermissions:\n  contents: read\njobs:\n  agent:\n    runs-on: ubuntu-latest\n    steps:\n      - run: |\n          echo ${"x".repeat(520)}\n          codex exec hello\n`,
);
assert.equal(lateCli.usageRows, 1);
assert.match(lateCli.usageText, /Evidence:.*codex exec hello/);
const httpUsage = await setAndScan(
  "on: push\njobs:\n  agent:\n    runs-on: ubuntu-latest\n    steps:\n      - run: curl -X POST https://api.cursor.com/v1/agents -d '{}'\n",
);
assert.equal(httpUsage.usageRows, 1);
assert.match(httpUsage.usageText, /Evidence:.*curl.*api\.cursor\.com/);
assert.doesNotMatch(httpUsage.usageText, /CLI ·/);
const hostileUsage = await setAndScan(
  "on: push\npermissions:\n  contents: read\njobs:\n  agent:\n    runs-on: ubuntu-latest\n    steps:\n      - name: <img src=x onerror=alert(1)>\n        uses: anthropics/claude-code-action@0123456789abcdef0123456789abcdef01234567\n        with:\n          prompt: hi\n",
);
assert.match(hostileUsage.usageText, /<img src=x onerror=alert\(1\)>/);
assert.equal(hostileUsage.injectedUsageImages, 0);
const reset = await evaluate(`(() => {
  const input = document.getElementById("workflow-yaml");
  input.value += "\\n";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return { hidden: document.getElementById("scan-output").hidden,
    usageRows: document.querySelectorAll("#scan-agent-usages li").length };
})()`);
assert.deepEqual(reset, { hidden: true, usageRows: 0 });
await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 700,
  deviceScaleFactor: 1,
  mobile: true,
});
const empty = await setAndScan("  ");
assert.match(empty.error, /Paste workflow YAML/);
assert.equal(empty.outputHidden, true);
assert.equal(empty.usageRows, 0);
assert.equal(empty.focus, "scan-results-heading");
assert.ok(
  empty.errorTop >= 0 && empty.errorBottom <= empty.viewportHeight,
  JSON.stringify(empty),
);
const oversized = await evaluate(`(() => {
  const input = document.getElementById("workflow-yaml");
  input.value = "x".repeat(window.agentciScanWorkflow.maxChars + 1);
  document.getElementById("scan-button").click();
  return { error: document.getElementById("scan-error").textContent, outputHidden: document.getElementById("scan-output").hidden };
})()`);
assert.match(oversized.error, /too large/);
assert.equal(oversized.outputHidden, true);
const tooManySteps = await setAndScan(
  `on: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n${Array.from({ length: 501 }, () => "      - run: echo ok").join("\n")}\n`,
);
assert.match(tooManySteps.error, /browser limit of 500 steps/);
assert.equal(tooManySteps.outputHidden, true);
checks.push({
  malformed,
  partial,
  genericYaml,
  clean,
  usageOnly,
  lateCli,
  httpUsage,
  hostileUsage,
  reset,
  empty,
  oversized,
  tooManySteps,
});
await evaluate("window.confirm = () => true");
const filePick = await evaluate(`(async () => {
  const sample = document.querySelector("#research pre code").textContent;
  const selected = new File([sample], "<img src=x onerror=alert(1)>.yaml", { type: "text/yaml" });
  const transfer = new DataTransfer();
  transfer.items.add(selected);
  const input = document.getElementById("workflow-file");
  input.files = transfer.files;
  input.focus();
  input.dispatchEvent(new Event("change"));
  for (let attempt = 0; attempt < 100 && document.getElementById("scan-button").disabled; attempt++)
    await new Promise((resolve) => setTimeout(resolve, 20));
  return { loaded: document.getElementById("workflow-yaml").value === sample,
    status: document.getElementById("scan-status").textContent,
    injectedImageCount: document.querySelectorAll("img").length,
    focus: document.activeElement.id };
})()`);
assert.equal(filePick.loaded, true);
assert.match(filePick.status, /loaded locally/);
assert.equal(filePick.injectedImageCount, 0);
assert.equal(filePick.focus, "workflow-file");
const uploadedScan = await evaluate(`(() => {
  document.getElementById("scan-button").click();
  return { heading: document.getElementById("scan-results-heading").textContent,
    status: document.getElementById("scan-status").textContent,
    location: document.getElementById("scan-findings").textContent };
})()`);
assert.match(uploadedScan.heading, /<img src=x onerror=alert\(1\)>\.yaml/);
assert.match(uploadedScan.status, /virtual scanner paths/);
assert.match(
  uploadedScan.location,
  /Virtual location: \.github\/workflows\/input\.yml/,
);
checks.push({ filePick, uploadedScan });
await send("Emulation.setDeviceMetricsOverride", {
  width: 320,
  height: 700,
  deviceScaleFactor: 1,
  mobile: false,
});
const longFilename = await evaluate(`(async () => {
  const name = "x".repeat(220) + ".yaml";
  const selected = new File(["on: push\\njobs:\\n  test:\\n    runs-on: ubuntu-latest\\n    steps:\\n      - run: echo ok\\n"], name, { type: "text/yaml" });
  const transfer = new DataTransfer();
  transfer.items.add(selected);
  const input = document.getElementById("workflow-file");
  input.files = transfer.files;
  input.dispatchEvent(new Event("change"));
  for (let attempt = 0; attempt < 100 && document.getElementById("scan-button").disabled; attempt++)
    await new Promise((resolve) => setTimeout(resolve, 20));
  document.getElementById("scan-button").click();
  return { named: document.getElementById("scan-results-heading").textContent.includes(name),
    width: innerWidth, scroll: document.documentElement.scrollWidth };
})()`);
assert.equal(longFilename.named, true);
assert.ok(
  longFilename.scroll <= longFilename.width,
  JSON.stringify(longFilename),
);
checks.push({ longFilename });
const oversizeFile = await evaluate(`(async () => {
  const pasted = "on: push";
  const yaml = document.getElementById("workflow-yaml");
  yaml.value = pasted;
  yaml.dispatchEvent(new Event("input", { bubbles: true }));
  const selected = new File(["x".repeat(window.agentciScanWorkflow.maxChars + 1)], "oversized.yml");
  const transfer = new DataTransfer();
  transfer.items.add(selected);
  const input = document.getElementById("workflow-file");
  input.files = transfer.files;
  input.dispatchEvent(new Event("change"));
  for (let attempt = 0; attempt < 100 && document.getElementById("scan-button").disabled; attempt++)
    await new Promise((resolve) => setTimeout(resolve, 20));
  return { pastedPreserved: yaml.value === pasted,
    error: document.getElementById("scan-error").textContent,
    outputHidden: document.getElementById("scan-output").hidden };
})()`);
assert.equal(oversizeFile.pastedPreserved, true);
assert.match(oversizeFile.error, /too large/);
assert.equal(oversizeFile.outputHidden, true);
checks.push({ oversizeFile });
await evaluate('document.getElementById("workflow-yaml").focus()');
await send("Input.dispatchKeyEvent", {
  type: "keyDown",
  key: "Tab",
  code: "Tab",
  windowsVirtualKeyCode: 9,
  nativeVirtualKeyCode: 9,
});
await send("Input.dispatchKeyEvent", {
  type: "keyUp",
  key: "Tab",
  code: "Tab",
  windowsVirtualKeyCode: 9,
  nativeVirtualKeyCode: 9,
});
const keyboardFocus = await evaluate("document.activeElement.id");
assert.equal(keyboardFocus, "workflow-file");
checks.push({ keyboardFocus });
const broken = await evaluate(
  'Array.from(document.querySelectorAll("a[href^=\\\"#\\\"]")).filter(a=>a.hash && !document.getElementById(a.hash.slice(1))).map(a=>a.hash)',
);
assert.deepEqual(broken, []);
await evaluate('document.getElementById("load-example").click()');
await evaluate('document.getElementById("scan-button").click()');
await fs.mkdir(root + "screenshots", { recursive: true });
for (const [name, width] of [
  ["desktop", 1440],
  ["mobile", 390],
]) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: name === "mobile",
  });
  await evaluate("window.scrollTo(0,0)");
  const layout = await send("Page.getLayoutMetrics");
  const size = layout.cssContentSize;
  const shot = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 },
  });
  await fs.writeFile(
    root + `screenshots/${name}.png`,
    Buffer.from(shot.data, "base64"),
  );
}
assert.equal(exceptions.length, 0);
assert.equal(requests.filter((url) => !url.startsWith(siteUrl)).length, 0);
await fs.writeFile(
  root + "VISUAL_CHECKS.json",
  JSON.stringify(
    {
      checks,
      consoleExceptions: exceptions,
      externalAssetRequests: requests.filter((u) => !u.startsWith(siteUrl)),
      brokenAnchors: broken,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "PASS: five responsive widths; real scanner, errors, file input, keyboard focus and three illustrative controls; no browser exceptions or external asset requests. Desktop/mobile screenshots saved.",
);
await send("Network.setCacheDisabled", { cacheDisabled: true });
tamperedAsset = scannerName;
const priorResponses = responses.length;
await send("Page.navigate", { url: `${siteUrl}?sri-check=1` });
for (let attempt = 0; attempt < 50; attempt++) {
  if ((await evaluate("document.readyState")) === "complete") break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}
assert.ok(
  responses
    .slice(priorResponses)
    .some(
      ({ url, status }) =>
        url === new URL(scannerName, siteUrl).href && status === 200,
    ),
  "Tampered scanner must be served over HTTP for the SRI check",
);
assert.equal(await evaluate("typeof window.agentciScanWorkflow"), "undefined");
assert.equal(
  await evaluate('document.getElementById("scan-button").disabled'),
  true,
);
assert.match(
  await evaluate('document.getElementById("scan-error").textContent'),
  /scanner did not load.*Refresh the page/i,
);
console.log(
  "PASS: browser rejected a tampered scanner with SRI and failed closed.",
);
tamperedAsset = appName;
const priorRendererResponses = responses.length;
await send("Page.navigate", { url: `${siteUrl}?sri-check=2` });
for (let attempt = 0; attempt < 50; attempt++) {
  if ((await evaluate("document.readyState")) === "complete") break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}
assert.ok(
  responses
    .slice(priorRendererResponses)
    .some(
      ({ url, status }) =>
        url === new URL(appName, siteUrl).href && status === 200,
    ),
  "Tampered renderer must be served over HTTP for the SRI check",
);
assert.equal(await evaluate("typeof window.agentciScanWorkflow"), "function");
assert.deepEqual(
  await evaluate(
    '({controls:["workflow-yaml","workflow-file","load-example","scan-button"].map(id=>document.getElementById(id).disabled),examples:Array.from(document.querySelectorAll("[data-case]")).map(button=>button.disabled)})',
  ),
  { controls: [true, true, true, true], examples: [true, true, true] },
);
assert.equal(
  await evaluate('document.getElementById("scan-results-heading").textContent'),
  "Preparing scanner",
);
await evaluate('document.getElementById("scan-button").click()');
assert.equal(
  await evaluate('document.getElementById("scan-output").hidden'),
  true,
);
assert.match(
  await evaluate('document.getElementById("scan-status").textContent'),
  /Preparing the browser scanner.*refresh the page/i,
);
console.log(
  "PASS: browser rejected a tampered renderer with SRI; no scan ran.",
);
socket.close();
await new Promise((resolve) => server.close(resolve));

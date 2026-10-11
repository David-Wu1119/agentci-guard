import fs from "node:fs/promises";
import assert from "node:assert/strict";
const root = new URL("./", import.meta.url).pathname;
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
  }
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const key = ++id;
    waiting.set(key, { resolve, reject });
    socket.send(JSON.stringify({ id: key, method, params }));
  });
const evaluate = async (expression) =>
  (await send("Runtime.evaluate", { expression, returnByValue: true })).result
    .value;
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
  url: new URL("./dist/index.html", import.meta.url).href,
});
for (let attempt = 0; attempt < 50; attempt++) {
  if ((await evaluate("document.readyState")) === "complete") break;
  await new Promise((r) => setTimeout(r, 100));
}
const checks = [];
const research = await evaluate(
  '({canonical:document.querySelector("link[rel=canonical]")?.href,robots:document.querySelector("meta[name=robots]")!==null,caseRows:Array.from(document.querySelectorAll("#research tbody tr")).map(row=>Array.from(row.cells).map(cell=>cell.textContent.trim())),pinned:document.querySelector("#research .case-links a")?.href.includes("blob/5c045e0469f412aecd0f9d5f32876bf10c7fc66b/"),localPreview:document.body.textContent.includes("Local preview")})',
);
assert.equal(research.canonical, "https://cryptoaxiom.net/");
assert.equal(research.robots, false);
assert.equal(research.pinned, true);
assert.equal(research.localPreview, false);
assert.deepEqual(research.caseRows, [
  ["agentci/untrusted-ai-write-token", "critical", "critical"],
  ["agentci/ai-with-secrets", "medium", "medium"],
  ["agentci/broad-write-permissions", "medium", "medium"],
]);
checks.push({ research });
for (const width of [1440, 768, 390, 320]) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: width < 500,
  });
  await new Promise((r) => setTimeout(r, 80));
  const dimensions = await evaluate(
    '({width:innerWidth,scroll:document.documentElement.scrollWidth,buttons:document.querySelectorAll("[data-case]").length})',
  );
  assert.ok(dimensions.scroll <= dimensions.width, JSON.stringify(dimensions));
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
const broken = await evaluate(
  'Array.from(document.querySelectorAll("a[href^=\\\"#\\\"]")).filter(a=>a.hash && !document.getElementById(a.hash.slice(1))).map(a=>a.hash)',
);
assert.deepEqual(broken, []);
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
assert.equal(requests.filter((url) => /^https?:/.test(url)).length, 0);
await fs.writeFile(
  root + "VISUAL_CHECKS.json",
  JSON.stringify(
    {
      checks,
      consoleExceptions: exceptions,
      externalAssetRequests: requests.filter((u) => /^https?:/.test(u)),
      brokenAnchors: broken,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "PASS: four responsive widths; three controls; anchor targets; no console exceptions or external asset requests. Desktop/mobile screenshots saved.",
);
socket.close();

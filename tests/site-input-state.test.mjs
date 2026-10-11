import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

function browserPage(hasScanner = true, scanResult = {}) {
  const makeElement = () => ({
    value: "",
    textContent: "",
    children: [],
    listeners: {},
    addEventListener(event, listener) {
      this.listeners[event] = listener;
    },
    append(...children) {
      this.children.push(...children);
    },
    replaceChildren(...children) {
      this.children = children;
    },
    focus() {},
    scrollIntoView() {},
  });
  const ids = [
    "workflow-yaml",
    "workflow-file",
    "scan-results-heading",
    "scan-status",
    "scan-error",
    "scan-output",
    "scan-completeness",
    "scan-agent-usages",
    "scan-findings",
    "scan-diagnostics",
    "scan-button",
    "load-example",
  ];
  const elements = new Map(ids.map((id) => [id, makeElement()]));
  const file = elements.get("workflow-file");
  let fileValue = "";
  Object.defineProperty(file, "value", {
    get: () => fileValue,
    set(value) {
      fileValue = value;
      if (!value) file.files = [];
    },
  });
  file.files = [];
  let allowReplace = false;
  let confirmations = 0;
  const scan = () => ({
    agent_usages: [],
    findings: [
      {
        severity: "high",
        title: "Test finding",
        rule_id: "agentci/test",
        file: ".github/workflows/input.yml",
        line: 7,
        message: "Test",
      },
    ],
    diagnostics: [],
    analysis_complete: true,
    ...scanResult,
  });
  scan.version = "test";
  runInNewContext(
    readFileSync(new URL("../site/src/app.js", import.meta.url), "utf8"),
    {
      window: {
        agentciScanWorkflow: hasScanner ? scan : undefined,
        confirm() {
          confirmations++;
          return allowReplace;
        },
      },
      document: {
        getElementById: (id) => elements.get(id),
        createElement: makeElement,
        createTextNode: (text) => ({ textContent: text, children: [] }),
        querySelector: () => ({ textContent: "on: issue_comment\n" }),
        querySelectorAll: () => [],
        activeElement: null,
        body: {},
      },
    },
  );
  return {
    elements,
    file,
    setAllowReplace(value) {
      allowReplace = value;
    },
    get confirmations() {
      return confirmations;
    },
  };
}

describe("browser workflow input", () => {
  it("shows the zero-based step index for a step-level diagnostic", () => {
    const page = browserPage(true, {
      diagnostics: [
        {
          code: "agentci/analysis-agent-event-unknown",
          severity: "warning",
          file: ".github/workflows/input.yml",
          line: 5,
          step_index: 0,
          message: "Unknown Action event path",
        },
      ],
    });
    const get = (id) => page.elements.get(id);
    get("workflow-yaml").value = "on: discussion_comment\n";
    get("scan-button").listeners.click();
    const details = get("scan-diagnostics")
      .children[0].children.flatMap((line) => line.children)
      .map((node) => node.textContent)
      .join(" ");
    expect(details).toMatch(/Step index:\s+0/);
  });

  it("identifies same-line findings, usages, and diagnostics by step", () => {
    const file = ".github/workflows/input.yml";
    const page = browserPage(true, {
      agent_usages: [0, 1].map((step_index) => ({
        job: "agent",
        step: "Duplicate",
        file,
        line: 5,
        step_index,
        evidence: "same action",
        reachable_events: ["push"],
      })),
      findings: [0, 1].map((step_index) => ({
        severity: "high",
        title: "Test finding",
        rule_id: "agentci/test",
        file,
        job: "agent",
        line: 5,
        step_index,
        message: "same finding",
      })),
      diagnostics: [0, 1].map((step_index) => ({
        code: "agentci/test",
        severity: "warning",
        file,
        job: "agent",
        line: 5,
        step_index,
        message: "same diagnostic",
      })),
    });
    const get = (id) => page.elements.get(id);
    get("workflow-yaml").value = "on: push\n";
    get("scan-button").listeners.click();
    const cardText = (item) =>
      item.children
        .flatMap((line) => line.children)
        .map((node) => node.textContent)
        .join(" ");
    for (const id of [
      "scan-agent-usages",
      "scan-findings",
      "scan-diagnostics",
    ]) {
      const cards = get(id).children.map(cardText);
      expect(cards).toHaveLength(2);
      expect(cards[0]).toMatch(/Step index:\s+0/);
      expect(cards[1]).toMatch(/Step index:\s+1/);
      if (id !== "scan-agent-usages") {
        expect(cards[0]).toMatch(/Job:\s+agent/);
      }
    }
  });

  it("fails closed with a refresh instruction when the scanner script is unavailable", () => {
    const page = browserPage(false);
    const get = (id) => page.elements.get(id);
    expect(get("scan-error").textContent).toMatch(
      /scanner did not load.*Refresh the page/i,
    );
    expect(get("scan-error").hidden).toBe(false);
    expect(get("scan-output").hidden).toBe(true);
    get("workflow-yaml").value = "on: push\n";
    get("scan-button").listeners.click();
    expect(get("scan-output").hidden).toBe(true);
  });

  it("keeps an existing draft until replacement is confirmed and clears stale file selection on edit", async () => {
    const page = browserPage();
    const get = (id) => page.elements.get(id);
    const yaml = get("workflow-yaml");
    yaml.value = "on: push\n";
    yaml.listeners.input();
    page.file.value = "C:\\fakepath\\old.yml";
    page.file.files = [{ name: "old.yml" }];
    get("scan-status").textContent = "Existing result";
    get("scan-output").hidden = false;

    get("load-example").listeners.click();
    expect(page.confirmations).toBe(1);
    expect(yaml.value).toBe("on: push\n");
    expect(page.file.files).toHaveLength(1);
    expect(get("scan-status").textContent).toBe("Existing result");
    expect(get("scan-output").hidden).toBe(false);

    page.setAllowReplace(true);
    get("load-example").listeners.click();
    expect(yaml.value).toBe("on: issue_comment\n");
    expect(page.file.files).toHaveLength(0);

    page.setAllowReplace(false);
    let reads = 0;
    page.file.value = "C:\\fakepath\\new.yml";
    page.file.files = [
      {
        name: "new.yml",
        size: 9,
        async text() {
          reads++;
          return "on: pull_request\n";
        },
      },
    ];
    get("scan-status").textContent = "Existing result";
    get("scan-output").hidden = false;
    await page.file.listeners.change();
    expect(page.confirmations).toBe(3);
    expect(reads).toBe(0);
    expect(yaml.value).toBe("on: issue_comment\n");
    expect(page.file.files).toHaveLength(0);
    expect(get("scan-status").textContent).toBe("Existing result");

    page.setAllowReplace(true);
    page.file.value = "C:\\fakepath\\new.yml";
    page.file.files = [
      {
        name: "new.yml",
        size: 9,
        async text() {
          reads++;
          return "on: pull_request\n";
        },
      },
    ];
    await page.file.listeners.change();
    expect(reads).toBe(1);
    expect(yaml.value).toBe("on: pull_request\n");
    yaml.value = "on: workflow_dispatch\n";
    yaml.listeners.input();
    expect(page.file.files).toHaveLength(0);
  });

  it("identifies the sample, uploaded file, and pasted YAML without treating virtual paths as real files", async () => {
    const page = browserPage();
    const get = (id) => page.elements.get(id);
    const yaml = get("workflow-yaml");
    get("load-example").listeners.click();
    get("scan-button").listeners.click();
    expect(get("scan-results-heading").textContent).toContain(
      "published sample",
    );

    page.setAllowReplace(true);
    page.file.value = "C:\\fakepath\\chosen.yml";
    page.file.files = [
      {
        name: "chosen.yml",
        size: 9,
        async text() {
          return "on: push\n";
        },
      },
    ];
    await page.file.listeners.change();
    get("scan-button").listeners.click();
    expect(get("scan-results-heading").textContent).toContain("chosen.yml");
    expect(get("scan-status").textContent).toContain("chosen.yml");

    yaml.value = "on: workflow_dispatch\n";
    yaml.listeners.input();
    get("scan-button").listeners.click();
    expect(get("scan-results-heading").textContent).toContain("pasted YAML");
    const details = get("scan-findings")
      .children[0].children.flatMap((node) => node.children)
      .map((node) => node.textContent)
      .join(" ");
    expect(details).toContain("Virtual location: ");
  });
});

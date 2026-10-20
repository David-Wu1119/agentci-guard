import { describe, expect, it } from "vitest";
import { decide } from "../scripts/audit-dependencies.mjs";

const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
const response = (changes = {}) => ({
  metadata: { vulnerabilities: { ...counts, ...changes } },
});

describe("dependency audit verdict", () => {
  it("uses severity counts rather than the presence of lower-level advisories", () => {
    expect(decide(response({ low: 1 }), "high")).toBe("clean");
    expect(decide(response({ high: 1 }), "high")).toBe("vulnerable");
    expect(decide(response({ critical: 1 }), "high")).toBe("vulnerable");
    for (const severity of Object.keys(counts)) {
      expect(decide(response({ [severity]: 1 }), severity)).toBe("vulnerable");
    }
  });

  it.each([
    {},
    [],
    1,
    { metadata: null },
    { metadata: [] },
    { metadata: {} },
    { metadata: { vulnerabilities: {} } },
    { metadata: { vulnerabilities: [] } },
    response({ high: -1 }),
    response({ high: 0.5 }),
    response({ high: "0" }),
    response({ high: null }),
    response({ high: true }),
    response({ high: Number.MAX_SAFE_INTEGER + 1 }),
    { ...response(), error: { message: "partial response" } },
  ])("never accepts malformed advisory metadata: %j", (parsed) => {
    expect(decide(parsed, "high")).toBe("invalid");
  });

  it("distinguishes a missing transport response from malformed metadata", () => {
    expect(decide(null, "high")).toBe("unreachable");
    expect(decide({ error: { message: "ECONNRESET" } }, "high")).toBe(
      "unreachable",
    );
  });

  it("rejects an unknown severity instead of silently checking only critical", () => {
    expect(() => decide(response({ high: 1 }), "typo")).toThrow(/level/i);
  });
});

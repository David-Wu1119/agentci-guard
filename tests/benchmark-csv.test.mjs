import { describe, expect, it } from "vitest";
import { csvObjects } from "../scripts/benchmark/csv.mjs";

describe("benchmark CSV import", () => {
  it("rejects duplicate headers instead of silently replacing a label", () => {
    const text = "unit_id,ground_truth,ground_truth\nu-1,positive,negative\n";

    expect(() => csvObjects(text)).toThrow(/duplicate.*ground_truth/i);
  });
});

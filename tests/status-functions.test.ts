import { describe, expect, it } from "vitest";
import { narrowEvents } from "../src/index.js";

const EVENTS = ["push", "pull_request", "issue_comment"];

// always(), success(), failure(), and cancelled() depend on prior step status,
// never on the triggering event, so they cannot narrow the event set. Treating
// them as complete removes a spurious diagnostic; substituting `true` for them
// would be wrong, because `!cancelled()` must not empty the event set.
describe("status functions in event reachability", () => {
  it.each([
    "always()",
    "success()",
    "failure()",
    "cancelled()",
    "!cancelled()",
    "success() || failure()",
    "always() && !cancelled()",
    "(always())",
    "${{ always() }}",
    "  success( )  ",
  ])("keeps every event and reports complete for %s", (condition) => {
    expect(narrowEvents(EVENTS, condition)).toEqual({
      events: EVENTS,
      complete: true,
    });
  });

  it("still narrows when a status function is combined with an event test", () => {
    const result = narrowEvents(
      EVENTS,
      "success() && github.event_name == 'push'",
    );
    expect(result.events).toEqual(["push"]);
  });

  it("stays conservative when combined with an unresolvable runtime value", () => {
    const result = narrowEvents(
      EVENTS,
      "always() && steps.build.outputs.changed == 'true'",
    );
    expect(result.events).toEqual(EVENTS);
    expect(result.complete).toBe(false);
  });

  it("does not treat a bare identifier or empty parentheses as a status function", () => {
    expect(narrowEvents(EVENTS, "always").complete).toBe(false);
    expect(narrowEvents(EVENTS, "()").complete).toBe(false);
    expect(narrowEvents(EVENTS, "status()").complete).toBe(false);
  });
});

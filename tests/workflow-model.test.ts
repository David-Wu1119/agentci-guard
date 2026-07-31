import { describe, expect, it } from "vitest";
import { narrowEvents } from "../src/index.js";

const EVENTS = ["push", "pull_request", "pull_request_target"];

describe("event-specific reachability", () => {
  it("handles constant true and false conditions", () => {
    expect(narrowEvents(EVENTS, true)).toEqual({
      events: EVENTS,
      complete: true,
    });
    expect(narrowEvents(EVENTS, false)).toEqual({
      events: [],
      complete: true,
    });
    expect(narrowEvents(EVENTS, "${{ false }}")).toEqual({
      events: [],
      complete: true,
    });
  });

  it("handles equality, inequality, and reversed equality", () => {
    expect(narrowEvents(EVENTS, "github.event_name == 'push'")).toEqual({
      events: ["push"],
      complete: true,
    });
    expect(
      narrowEvents(EVENTS, "github.event_name != 'pull_request_target'"),
    ).toEqual({
      events: ["push", "pull_request"],
      complete: true,
    });
    expect(narrowEvents(EVENTS, "'pull_request' == github.event_name")).toEqual(
      {
        events: ["pull_request"],
        complete: true,
      },
    );
    expect(narrowEvents(EVENTS, "github.event_name == 'PUSH'")).toEqual({
      events: ["push"],
      complete: true,
    });
  });

  it("evaluates simple boolean composition and negation", () => {
    expect(
      narrowEvents(
        EVENTS,
        "github.event_name == 'push' || github.event_name == 'pull_request'",
      ),
    ).toEqual({
      events: ["push", "pull_request"],
      complete: true,
    });
    expect(
      narrowEvents(
        EVENTS,
        "github.event_name == 'push' && github.event_name == 'pull_request'",
      ),
    ).toEqual({
      events: [],
      complete: true,
    });
    expect(
      narrowEvents(EVENTS, "!(github.event_name == 'pull_request_target')"),
    ).toEqual({
      events: ["push", "pull_request"],
      complete: true,
    });
    expect(
      narrowEvents(EVENTS, `contains(fromJSON('["PUSH"]'), github.event_name)`),
    ).toEqual({
      events: ["push"],
      complete: true,
    });
  });

  it("handles contains(fromJSON(...), github.event_name)", () => {
    expect(
      narrowEvents(
        EVENTS,
        `contains(fromJSON('["push","pull_request"]'), github.event_name)`,
      ),
    ).toEqual({
      events: ["push", "pull_request"],
      complete: true,
    });
  });

  it("retains unsupported branches as unknown without reviving known-false events", () => {
    expect(
      narrowEvents(
        EVENTS,
        "github.event_name == 'push' && startsWith(github.ref, 'refs/heads/')",
      ),
    ).toEqual({
      events: ["push"],
      complete: false,
    });
    expect(
      narrowEvents(EVENTS, "github.repository == 'owner/repository'"),
    ).toEqual({
      events: EVENTS,
      complete: false,
    });
    expect(
      narrowEvents(EVENTS, "false && github.repository == 'owner/repository'"),
    ).toEqual({
      events: [],
      complete: true,
    });
  });
});

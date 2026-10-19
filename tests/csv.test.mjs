import { describe, expect, it } from "vitest";
import { csvObjects, parseCsv, renderCsv } from "../scripts/benchmark/csv.mjs";

describe("annotation CSV integrity", () => {
  it.each([
    'unit_id\nuni"t-"001\n',
    'unit_id\n"unit-"001\n',
    'unit_id\n"unit-001"garbage\n',
    'unit_id\n "unit-001"\n',
    'unit_id\n"unit-001" \n',
    'unit_id\n"unit-001""\n',
  ])("rejects malformed quoting without rewriting the value: %j", (text) => {
    expect(() => parseCsv(text)).toThrow(/CSV/);
    expect(() => csvObjects(text)).toThrow(/CSV/);
  });

  it.each(["ends with CR\r", "embedded\rCR", "mixed\r\nlines", "\r"])(
    "round-trips carriage returns in the final field: %j",
    (value) => {
      const rows = [
        ["unit_id", "notes"],
        ["synthetic-001", value],
      ];
      expect(parseCsv(renderCsv(rows))).toEqual(rows);
    },
  );

  it("quotes carriage returns instead of emitting raw record-like text", () => {
    expect(renderCsv([["a\rb", "tail\r"]])).toBe('"a\rb","tail\r"\n');
  });

  it("retains quoted CR data immediately before CRLF or end of file", () => {
    expect(parseCsv('id,notes\r\n1,"note\r"\r\n2,"last\r"')).toEqual([
      ["id", "notes"],
      ["1", "note\r"],
      ["2", "last\r"],
    ]);
  });

  it("retains BOM, blank-line, empty-cell and escaped-quote compatibility", () => {
    expect(
      parseCsv('\uFEFFid,notes\r\n\r\n1,"hello, ""world""\nnext"\r\n2,\r\n'),
    ).toEqual([
      ["id", "notes"],
      ["1", 'hello, "world"\nnext'],
      ["2", ""],
    ]);
    expect(parseCsv("a,b,\n")).toEqual([["a", "b", ""]]);
    expect(parseCsv("")).toEqual([]);
  });

  it("keeps duplicate-header, row-width and unclosed-quote rejection", () => {
    expect(() => csvObjects("id,id\na,b\n")).toThrow(/Duplicate/);
    expect(() => csvObjects("id,notes\na\n")).toThrow(/cells/);
    expect(() => parseCsv('id\n"unfinished')).toThrow(/quoted field/);
  });

  it("round-trips delimiter and newline combinations without changing cells", () => {
    const values = [
      "",
      "0",
      " ",
      ",",
      '"',
      "\r",
      "\n",
      "\r\n",
      'a"b,c\r\nx',
      "中文",
    ];
    for (const left of values) {
      for (const right of values) {
        const rows = [["synthetic-id", left, right]];
        expect(parseCsv(renderCsv(rows))).toEqual(rows);
      }
    }
  });
});

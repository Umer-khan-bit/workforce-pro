import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { neutralise, toCsv, toXlsx } from "./export";

describe("export", () => {
  it("neutralises text a spreadsheet would run as a formula", () => {
    expect(neutralise('=HYPERLINK("http://x")')).toBe("'=HYPERLINK(\"http://x\")");
    for (const bad of ["+1", "-1", "@SUM(A1)", "\tx"]) expect(neutralise(bad).startsWith("'")).toBe(true);
    expect(neutralise("Ayesha Khan")).toBe("Ayesha Khan");
  });

  it("writes CSV with a byte order mark, quoted commas and quotes, and neutralised names", () => {
    const csv = toCsv(["Name", "Note"], [["=cmd|calc", 'He said "hi", twice'], ["عائشہ", 5]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("'=cmd");
    expect(csv).toContain('"He said ""hi"", twice"');
    expect(csv).toContain("عائشہ,5");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("writes a real xlsx: a zip with a workbook and a sheet, numbers kept as numbers, text neutralised", () => {
    const bytes = toXlsx(["Name", "Score"], [["=1+1", 87.5], [null, 3]]);
    const files = unzipSync(bytes);
    expect(Object.keys(files)).toEqual(expect.arrayContaining(["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"]));
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
    expect(sheet).toContain("<v>87.5</v>");
    expect(sheet).toContain("&apos;=1+1");
    expect(sheet).not.toContain('r="A3"');
  });
});

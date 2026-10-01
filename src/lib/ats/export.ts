import { strToU8, zipSync } from "fflate";
import type { AtsCandidate } from "./payload";

/** The columns of the CSV and Excel export, in order. */
export const EXPORT_HEADERS = [
  "Reference",
  "Name",
  "Job role",
  "City",
  "Experience (years)",
  "Job opening",
  "Opening role",
  "Stage",
  "Shortlisted on",
  "Last change",
  "IQ quartile",
  "EQ quartile",
  "Language quartile",
  "Language level (CEFR)",
  "Job skill quartile",
  "Top Performer",
  "Email",
  "Phone",
] as const;

export type ExportCell = string | number | null;

const STAGE: Record<string, string> = { SHORTLISTED: "Shortlisted", CONTACTED: "Contacted", INTERVIEWING: "Interviewing", OFFERED: "Offered", HIRED: "Hired", REJECTED: "Rejected" };
const day = (iso: string) => iso.slice(0, 10);

/** One spreadsheet row per shortlisted candidate. Email and phone are filled only after the candidate accepted. */
export function toRow(c: AtsCandidate): ExportCell[] {
  const result = (test: string) => c.candidate.results.find((r) => r.test === test);
  return [
    c.reference,
    c.candidate.name,
    c.candidate.jobRole,
    c.candidate.city,
    c.candidate.experienceYears,
    c.jobOpening.title ?? c.jobOpening.jobRole,
    c.jobOpening.jobRole,
    STAGE[c.status] ?? c.status,
    day(c.shortlistedAt),
    day(c.statusChangedAt),
    result("IQ")?.quartile ?? null,
    result("EQ")?.quartile ?? null,
    result("LANGUAGE")?.quartile ?? null,
    result("LANGUAGE")?.cefrLevel ?? null,
    result("SKILL")?.quartile ?? null,
    c.candidate.topPerformer ? "Yes" : "No",
    c.candidate.contact?.email ?? null,
    c.candidate.contact?.phone ?? null,
  ];
}

/**
 * A text cell that a spreadsheet could run as a formula (it starts with = + - @ or a control character) gets a
 * leading apostrophe, so a candidate who types "=HYPERLINK(...)" as their name cannot attack whoever opens the file.
 */
export function neutralise(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

const cellText = (v: ExportCell) => (v === null ? "" : typeof v === "number" ? String(v) : neutralise(v));

export function toCsv(headers: readonly string[], rows: ExportCell[][]): string {
  const esc = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [headers.map(esc).join(","), ...rows.map((r) => r.map((v) => esc(cellText(v))).join(","))];
  return `﻿${lines.join("\r\n")}\r\n`; // the byte order mark makes Excel read UTF-8 names (such as Urdu) correctly
}

const xml = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
const colName = (i: number) => String.fromCharCode(65 + (i % 26)).padStart(i >= 26 ? 2 : 1, String.fromCharCode(64 + Math.floor(i / 26)));

/** A real .xlsx file (a zip of a few XML files), with a bold header row. Numbers stay numbers; text is neutralised like the CSV. */
export function toXlsx(headers: readonly string[], rows: ExportCell[][], sheetName = "Shortlist"): Uint8Array {
  const sheetRows = [headers as readonly ExportCell[], ...rows].map((row, r) => {
    const cells = row
      .map((v, c) => {
        const ref = `${colName(c)}${r + 1}`;
        if (v === null) return "";
        if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
        return `<c r="${ref}" t="inlineStr"${r === 0 ? ' s="1"' : ""}><is><t xml:space="preserve">${xml(r === 0 ? String(v) : neutralise(String(v)))}</t></is></c>`;
      })
      .join("");
    return `<row r="${r + 1}">${cells}</row>`;
  });
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`),
    "xl/worksheets/sheet1.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows.join("")}</sheetData></worksheet>`),
  };
  return zipSync(files);
}

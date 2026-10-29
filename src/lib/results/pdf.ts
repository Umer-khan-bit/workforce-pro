import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/** Everything the report shows. Built by the report route from the database; nothing here touches it. */
export type ReportData = {
  brandName: string;
  candidateName: string;
  jobRole: string | null;
  city: string | null;
  experienceYears: number | null;
  generatedOn: string;
  topPerformer: boolean;
  /** A recruiter report: one line with the overall integrity result (counts only). */
  integritySummary?: string;
  results: ReportResult[];
  salary: { currency: string; marketLine: string; suggestedLine: string; basis: string } | null;
  disclaimer: string | null;
};

export type ReportResult = {
  title: string;
  /** Short lines such as "Quartile Q2 - better than 63% of 40 candidates in your job role". */
  lines: string[];
  traits: { trait: string; score: number }[] | null;
  feedback: string | null;
  tips: string[];
};

const PAGE = { width: 595.28, height: 841.89, margin: 50 };
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.4, 0.4, 0.45);
const BRAND = rgb(0.11, 0.4, 0.38);
const TRACK = rgb(0.9, 0.9, 0.92);

/**
 * The standard PDF fonts only cover Western European letters. Anything else (for example Urdu script)
 * becomes "?" instead of breaking the whole report; a few common typographic characters are mapped to
 * plain ones first.
 */
export function toPdfText(text: string): string {
  const map: Record<string, string> = { "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "...", " ": " ", "→": "->", "•": "-" };
  let out = "";
  for (const ch of text.replace(/\r\n?/g, "\n")) {
    if (map[ch]) out += map[ch];
    else if (ch === "\n" || (ch >= " " && ch <= "~") || (ch >= "¡" && ch <= "ÿ")) out += ch;
    else out += "?";
  }
  return out;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of toPdfText(text).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) line = next;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Builds the candidate's results report as a PDF. */
export async function buildReportPdf(data: ReportData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(toPdfText(`${data.brandName} results report`));
  doc.setAuthor(toPdfText(data.brandName));
  doc.setCreator(toPdfText(data.brandName));

  let page: PDFPage = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - PAGE.margin;
  const width = PAGE.width - PAGE.margin * 2;

  const room = (needed: number) => {
    if (y - needed < PAGE.margin) {
      page = doc.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - PAGE.margin;
    }
  };
  const text = (value: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {}) => {
    const size = opts.size ?? 10.5;
    const f = opts.bold ? bold : font;
    const indent = opts.indent ?? 0;
    for (const line of wrap(value, f, size, width - indent)) {
      room(size * 1.4);
      y -= size * 1.35;
      if (line) page.drawText(line, { x: PAGE.margin + indent, y, size, font: f, color: opts.color ?? INK });
    }
    y -= opts.gap ?? 0;
  };

  // Header
  page.drawRectangle({ x: 0, y: PAGE.height - 6, width: PAGE.width, height: 6, color: BRAND });
  text(data.brandName, { size: 20, bold: true, color: BRAND });
  text("Assessment results report", { size: 12, color: MUTED, gap: 8 });
  text(data.candidateName, { size: 15, bold: true });
  const about = [data.jobRole, data.city, data.experienceYears !== null ? `${data.experienceYears} years of experience` : null].filter(Boolean).join("  |  ");
  if (about) text(about, { color: MUTED });
  text(`Report date: ${data.generatedOn}`, { color: MUTED, gap: 6 });
  if (data.topPerformer) text("Top Performer badge earned", { bold: true, color: BRAND, gap: 4 });
  if (data.integritySummary) text(data.integritySummary, { bold: true, gap: 4 });

  if (data.results.length === 0) text("No assessment has been completed yet.", { gap: 8 });

  for (const r of data.results) {
    room(90);
    y -= 8;
    page.drawLine({ start: { x: PAGE.margin, y }, end: { x: PAGE.width - PAGE.margin, y }, thickness: 0.6, color: TRACK });
    y -= 4;
    text(r.title, { size: 14, bold: true, gap: 2 });
    for (const line of r.lines) text(line, { gap: 1 });
    if (r.traits) {
      y -= 4;
      for (const t of r.traits) {
        room(22);
        y -= 14;
        page.drawText(toPdfText(t.trait), { x: PAGE.margin, y, size: 10, font });
        page.drawText(`${t.score.toFixed(1)} / 5`, { x: PAGE.margin + 190, y, size: 10, font: bold });
        page.drawRectangle({ x: PAGE.margin + 250, y: y - 1, width: 220, height: 7, color: TRACK });
        page.drawRectangle({ x: PAGE.margin + 250, y: y - 1, width: 220 * Math.max(0, Math.min(1, (t.score - 1) / 4)), height: 7, color: BRAND });
      }
      y -= 4;
    }
    if (r.feedback) {
      y -= 4;
      text("Feedback", { bold: true, gap: 1 });
      text(r.feedback, { gap: 2 });
    }
    if (r.tips.length > 0) {
      text("How to improve", { bold: true, gap: 1 });
      r.tips.forEach((tip, i) => text(`${i + 1}. ${tip}`, { indent: 8, gap: 1 }));
    }
  }

  if (data.salary) {
    room(100);
    y -= 8;
    page.drawLine({ start: { x: PAGE.margin, y }, end: { x: PAGE.width - PAGE.margin, y }, thickness: 0.6, color: TRACK });
    y -= 4;
    text("Salary guide", { size: 14, bold: true, gap: 2 });
    text(data.salary.suggestedLine, { bold: true, gap: 1 });
    text(data.salary.marketLine, { gap: 1 });
    text(data.salary.basis, { color: MUTED, gap: 1 });
  }

  if (data.disclaimer) {
    room(50);
    y -= 10;
    text(data.disclaimer, { size: 8.5, color: MUTED });
  }

  // Page numbers
  const pages = doc.getPages();
  pages.forEach((p, i) => p.drawText(`${toPdfText(data.brandName)}  -  page ${i + 1} of ${pages.length}`, { x: PAGE.margin, y: 28, size: 8, font, color: MUTED }));

  return doc.save();
}

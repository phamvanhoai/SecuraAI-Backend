import PDFDocument from 'pdfkit';
import { resolve } from 'node:path';

type Metadata = {
  schemaVersion: string;
  exportId: string;
  title: string;
  generatedAt: string;
  displayTimeZone: string;
  exportedBy: { id: string; name: string; email: string; role: string };
  purpose: string;
  scope: string;
  format: string;
  recordCount: number;
  sourceSystem: string;
  sourceDataset: string;
  recordSetSha256: string;
};
type Row = {
  id: string;
  occurredAt: string;
  eventType: string;
  source: string;
  sourceIp: string | null;
  actor: string;
  actorEmail: string | null;
  actorType: string;
  status: string;
  resourceType: string;
  resourceId: string | null;
  correlationId: string | null;
  errorCode: string | null;
  durationMs: number | null;
};

const regularFont = resolve(process.cwd(), 'node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
const boldFont = resolve(process.cwd(), 'node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf');
const blue = '#1769F6';
const navy = '#101B3F';
const muted = '#60708F';
const border = '#DFE6F2';

export async function renderInvestigationLogPdf(
  metadata: Metadata,
  filters: Record<string, unknown>,
  rows: Row[],
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 42,
    bufferPages: true,
    info: {
      Title: metadata.title,
      Author: metadata.exportedBy.name,
      Subject: metadata.purpose,
      Keywords: 'SecuraAI, investigation logs, digital evidence',
      CreationDate: new Date(metadata.generatedAt),
    },
  });
  doc.registerFont('Body', regularFont);
  doc.registerFont('Bold', boldFont);
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const complete = new Promise<Buffer>((resolveBuffer, reject) => {
    doc.on('end', () => resolveBuffer(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  drawHeader(doc);
  doc.font('Bold').fontSize(18).fillColor(navy).text('Investigation Log Export', 42, 105);
  doc
    .font('Body')
    .fontSize(9)
    .fillColor(muted)
    .text(`Evidence export · Schema ${metadata.schemaVersion}`, 42, 129);
  doc.moveTo(42, 148).lineTo(553, 148).strokeColor(border).stroke();
  let y = section(doc, 'Export information', 165);
  y = keyValues(
    doc,
    [
      ['Export ID', metadata.exportId],
      ['Generated at (UTC)', metadata.generatedAt],
      ['Display time zone', metadata.displayTimeZone],
      ['Record count', String(metadata.recordCount)],
      ['Exported by', metadata.exportedBy.name],
      ['Email', metadata.exportedBy.email],
      ['Role', metadata.exportedBy.role],
      ['Scope', metadata.scope],
      ['Source', `${metadata.sourceSystem} · ${metadata.sourceDataset}`],
      ['Record-set SHA-256', metadata.recordSetSha256],
    ],
    y,
  );
  y = section(doc, 'Investigation purpose', y + 5);
  doc.font('Body').fontSize(9).fillColor(navy).text(metadata.purpose, 42, y, { width: 511 });
  y = doc.y + 14;
  y = section(doc, 'Applied filters', y);
  doc
    .font('Body')
    .fontSize(8)
    .fillColor(navy)
    .text(
      Object.keys(filters).length ? JSON.stringify(filters, null, 2) : 'No filters applied',
      42,
      y,
      { width: 511 },
    );
  y = doc.y + 16;
  y = section(doc, 'Detailed log records', y);
  for (const [index, row] of rows.entries()) {
    if (y > 640) {
      doc.addPage();
      drawHeader(doc);
      y = 105;
    }
    y = drawRecord(doc, row, index + 1, y);
  }
  if (!rows.length)
    doc
      .font('Body')
      .fontSize(9)
      .fillColor(muted)
      .text('No matching records.', 42, y + 8);
  const pages = doc.bufferedPageRange();
  for (let index = 0; index < pages.count; index += 1) {
    doc.switchToPage(index);
    doc
      .font('Body')
      .fontSize(7)
      .fillColor(muted)
      .text(
        `SecuraAI confidential · Export ${metadata.exportId} · Page ${index + 1} of ${pages.count}`,
        42,
        802,
        { width: 511, align: 'center' },
      );
  }
  doc.end();
  return complete;
}

function drawHeader(doc: PDFKit.PDFDocument) {
  doc.save().roundedRect(42, 38, 42, 42, 9).fill(blue).restore();
  doc
    .save()
    .lineWidth(2)
    .strokeColor('#FFFFFF')
    .moveTo(63, 47)
    .lineTo(75, 52)
    .lineTo(73, 65)
    .quadraticCurveTo(63, 74, 53, 65)
    .lineTo(51, 52)
    .closePath()
    .stroke()
    .restore();
  doc.font('Bold').fontSize(17).fillColor(navy).text('SecuraAI', 96, 49);
  doc.font('Body').fontSize(8).fillColor(muted).text('Security Risk Management Platform', 96, 69);
}
function section(doc: PDFKit.PDFDocument, title: string, y: number) {
  doc.font('Bold').fontSize(10).fillColor(blue).text(title, 42, y);
  return doc.y + 8;
}
function keyValues(doc: PDFKit.PDFDocument, entries: Array<[string, string]>, y: number) {
  for (const [label, value] of entries) {
    doc.font('Bold').fontSize(7).fillColor(muted).text(label.toUpperCase(), 42, y, { width: 120 });
    doc.font('Body').fontSize(8).fillColor(navy).text(value, 166, y, { width: 387 });
    y = Math.max(doc.y + 5, y + 16);
  }
  return y;
}
function drawRecord(doc: PDFKit.PDFDocument, row: Row, number: number, y: number) {
  const height = 154;
  doc.save().roundedRect(42, y, 511, height, 7).fillAndStroke('#F8FAFD', border).restore();
  doc
    .font('Bold')
    .fontSize(9)
    .fillColor(navy)
    .text(`${number}. ${row.eventType}`, 54, y + 12, { width: 370 });
  doc
    .font('Bold')
    .fontSize(8)
    .fillColor(
      row.status === 'SUCCESS' ? '#159455' : row.status === 'DENIED' ? '#C27208' : '#DC3545',
    )
    .text(row.status, 438, y + 12, { width: 102, align: 'right' });
  const fields: Array<[string, string]> = [
    ['Log ID', row.id],
    ['Occurred (UTC)', row.occurredAt],
    ['Occurred (local)', `${formatLocal(row.occurredAt)} Asia/Ho_Chi_Minh`],
    ['Source', row.source],
    ['Source IP', row.sourceIp ?? 'Not recorded'],
    ['Actor', row.actor],
    ['Actor email', row.actorEmail ?? 'Not recorded'],
    ['Actor type', row.actorType],
    ['Resource', `${row.resourceType}${row.resourceId ? ` · ${row.resourceId}` : ''}`],
    ['Correlation ID', row.correlationId ?? 'Not recorded'],
    ['Error code', row.errorCode ?? 'None'],
    ['Duration', row.durationMs === null ? 'Not recorded' : `${row.durationMs} ms`],
  ];
  fields.forEach(([label, value], index) => {
    const second = index % 2 === 1;
    const x = second ? 302 : 54;
    const width = second ? 239 : 232;
    const lineY = y + 35 + Math.floor(index / 2) * 18;
    doc
      .font('Bold')
      .fontSize(6.5)
      .fillColor(muted)
      .text(label.toUpperCase(), x, lineY, { width: 70 });
    doc
      .font('Body')
      .fontSize(7)
      .fillColor(navy)
      .text(value, x + 74, lineY, { width: width - 74, height: 16, ellipsis: true });
  });
  return y + height + 10;
}
function formatLocal(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
    hour12: false,
  }).format(new Date(value));
}

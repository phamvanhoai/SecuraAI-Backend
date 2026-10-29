import PDFDocument from 'pdfkit';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { reportExportsRepository } from './report-exports.repository.js';
import type { ExportReportRequest } from './dto/export-security-reports.dto.js';

const regularFont = resolve(process.cwd(), 'node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
const boldFont = resolve(process.cwd(), 'node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf');

const blue = '#1769F6';
const navy = '#101B3F';
const muted = '#60708F';
const border = '#DFE6F2';

function formatLocal(value: string): string {
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

function drawHeader(doc: PDFKit.PDFDocument): void {
  // Brand icon with shield
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
    // Shield Checkmark
    .lineWidth(1.8)
    .moveTo(58, 60)
    .lineTo(62, 64)
    .lineTo(68, 56)
    .stroke()
    .restore();

  doc.font('Bold').fontSize(17).fillColor(navy).text('SecuraAI', 96, 49);
  doc.font('Body').fontSize(8).fillColor(muted).text('Security Risk Management Platform', 96, 69);
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string, y: number): number {
  doc.font('Bold').fontSize(10).fillColor(blue).text(title, 42, y);
  return doc.y + 8;
}

function keyValues(
  doc: PDFKit.PDFDocument,
  entries: Array<[string, string]>,
  startY: number,
): number {
  let y = startY;
  for (const [label, value] of entries) {
    doc.font('Bold').fontSize(7).fillColor(muted).text(label.toUpperCase(), 42, y, { width: 125 });
    doc.font('Body').fontSize(8).fillColor(navy).text(value, 172, y, { width: 381 });
    y = Math.max(doc.y + 4, y + 15);
  }
  return y;
}

function getRatingColor(rating: string): string {
  switch (rating.toUpperCase()) {
    case 'CRITICAL':
      return '#DC3545';
    case 'HIGH':
      return '#C27208';
    case 'MEDIUM':
      return '#D97706';
    case 'LOW':
      return '#159455';
    default:
      return navy;
  }
}

export async function renderSecurityReportPdf(
  reportType: 'RISK' | 'INCIDENT' | 'SECURITY_POSTURE',
  item: {
    id: string;
    created_at: Date;
    users?: {
      id?: string;
      full_name?: string | null;
      role?: string | null;
      email?: string | null;
    } | null;
  },
  safeFilters: ExportReportRequest,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 42,
    bufferPages: true,
    info: {
      Title: `SecuraAI ${reportType} Report`,
      Author: item.users?.full_name ?? 'SecuraAI System',
      Subject: 'Security Risk & Compliance Export',
      Keywords: 'SecuraAI, enterprise security report, ISO 27001, audit evidence',
      CreationDate: item.created_at,
    },
  });

  doc.registerFont('Body', regularFont);
  doc.registerFont('Bold', boldFont);

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  const complete = new Promise<Buffer>((resolveBuffer, reject) => {
    doc.on('end', () => resolveBuffer(Buffer.concat(chunks)));
    doc.on('error', (err) => reject(err instanceof Error ? err : new Error(String(err))));
  });

  const printableWidth = 511;
  const startX = 42;

  drawHeader(doc);

  const mainTitle =
    reportType === 'RISK'
      ? 'Risk Register & Assessment Export'
      : reportType === 'INCIDENT'
        ? 'Incident Management & Response Export'
        : 'Executive Security Posture Export';

  doc.font('Bold').fontSize(18).fillColor(navy).text(mainTitle, startX, 105);
  doc
    .font('Body')
    .fontSize(9)
    .fillColor(muted)
    .text('Evidence & compliance export · Schema 2.0.0 · ISO/IEC 27001:2022 ISMS', startX, 129);

  doc.moveTo(startX, 148).lineTo(553, 148).strokeColor(border).stroke();

  // Load dataset
  let rawDataForDigest: unknown = null;
  let recordCount = 0;

  let riskData: Awaited<ReturnType<typeof reportExportsRepository.compileRiskData>> = [];
  let incidentData: Awaited<ReturnType<typeof reportExportsRepository.compileIncidentData>> = [];
  let postureData: Awaited<ReturnType<typeof reportExportsRepository.compileSecurityPostureData>> | null = null;

  if (reportType === 'RISK') {
    riskData = await reportExportsRepository.compileRiskData(safeFilters);
    rawDataForDigest = riskData;
    recordCount = riskData.length;
  } else if (reportType === 'INCIDENT') {
    incidentData = await reportExportsRepository.compileIncidentData(safeFilters);
    rawDataForDigest = incidentData;
    recordCount = incidentData.length;
  } else {
    postureData = await reportExportsRepository.compileSecurityPostureData(safeFilters);
    rawDataForDigest = postureData;
    recordCount = 7;
  }

  const recordSetSha256 = createHash('sha256')
    .update(JSON.stringify(rawDataForDigest))
    .digest('hex');

  // Export information section
  let y = sectionTitle(doc, 'Export information', 165);
  y = keyValues(
    doc,
    [
      ['Export ID', item.id],
      ['Generated at (UTC)', item.created_at.toISOString()],
      ['Generated at (local)', `${formatLocal(item.created_at.toISOString())} Asia/Ho_Chi_Minh`],
      ['Display time zone', 'Asia/Ho_Chi_Minh'],
      ['Record count', String(recordCount)],
      ['Exported by', item.users?.full_name ?? 'Unknown'],
      ['Email', item.users?.email ?? 'Not recorded'],
      ['Role', item.users?.role ?? 'SECURITY_OFFICER'],
      ['Scope', reportType],
      ['Classification', 'CONFIDENTIAL / RESTRICTED'],
      ['Framework', 'ISO/IEC 27001:2022 ISMS'],
      ['Record-set SHA-256', recordSetSha256],
    ],
    y,
  );

  // Applied filters section
  y = sectionTitle(doc, 'Applied filters', y + 6);
  const filterEntries = Object.entries(safeFilters).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  );
  if (filterEntries.length > 0) {
    const formattedFilters = filterEntries.map(([k, v]) => `${k}: ${String(v)}`).join('   |   ');
    doc.font('Body').fontSize(8).fillColor(navy).text(formattedFilters, startX, y, { width: printableWidth });
    y = doc.y + 12;
  } else {
    doc.font('Body').fontSize(8).fillColor(muted).text('No filters applied (All available records)', startX, y);
    y = doc.y + 12;
  }

  // Domain content
  if (reportType === 'SECURITY_POSTURE' && postureData) {
    y = sectionTitle(doc, 'Executive security posture metrics', y);

    // 4 KPI Summary Cards
    const cardWidth = 120;
    const cardHeight = 44;
    const cardGap = (printableWidth - cardWidth * 4) / 3;

    const cards = [
      {
        label: 'POSTURE SCORE',
        val: `${postureData.postureScore}/100`,
        sub: postureData.postureLevel,
        color: blue,
      },
      {
        label: 'COMPLIANCE RATE',
        val: `${postureData.complianceRate}%`,
        sub: 'Controls Passed',
        color: '#159455',
      },
      {
        label: 'TOTAL IT ASSETS',
        val: String(postureData.totalAssets),
        sub: `${postureData.criticalAssets} Critical`,
        color: '#4F46E5',
      },
      {
        label: 'OPEN RISKS',
        val: `${postureData.openRisks}/${postureData.totalRisks}`,
        sub: `${postureData.openIncidents} Incidents`,
        color: '#C27208',
      },
    ];

    cards.forEach((card, index) => {
      const cardX = startX + index * (cardWidth + cardGap);
      doc.save().roundedRect(cardX, y, cardWidth, cardHeight, 5).fillAndStroke('#F8FAFD', border).restore();
      doc.save().roundedRect(cardX, y, cardWidth, 3, 2).fill(card.color).restore();
      doc.font('Bold').fontSize(6.5).fillColor(muted).text(card.label, cardX + 8, y + 8);
      doc.font('Bold').fontSize(12).fillColor(navy).text(card.val, cardX + 8, y + 18);
      doc.font('Body').fontSize(7).fillColor(muted).text(card.sub, cardX + 8, y + 32);
    });

    y += cardHeight + 16;

    y = sectionTitle(doc, 'Security & operational indicators', y);

    const headers = ['Metric / Indicator', 'Current Value', 'Evaluation Assessment', 'Standard Benchmark'];
    const colWidths = [150, 80, 180, 101];

    doc.rect(startX, y, printableWidth, 20).fill(navy);
    let colX = startX;
    headers.forEach((h, i) => {
      doc.font('Bold').fontSize(7.5).fillColor('#FFFFFF').text(h, colX + 6, y + 6, {
        width: (colWidths[i] ?? 100) - 12,
      });
      colX += colWidths[i] ?? 100;
    });
    y += 20;

    const rows = [
      ['Security Posture Health Score', `${postureData.postureScore} / 100`, postureData.postureLevel, '>= 80 (Good)'],
      ['Control Compliance Rate', `${postureData.complianceRate}%`, 'Percentage of controls without open findings', '100% Target'],
      ['Total Monitored IT Assets', String(postureData.totalAssets), `${postureData.criticalAssets} critical / high priority`, 'Continuous asset discovery'],
      ['Open Operational Risks', String(postureData.openRisks), `Out of ${postureData.totalRisks} evaluated risks`, '< 5 critical open'],
      ['Active Incidents Under Response', String(postureData.openIncidents), `Out of ${postureData.totalIncidents} total incidents`, 'Zero uncontained critical'],
      ['24h Ingested Security Events', String(postureData.totalEvents24h), `Triggered ${postureData.totalAlerts24h} AI anomaly alerts`, 'Telemetry streaming active'],
      ['Open Control Weaknesses', String(postureData.openFindings), 'Findings requiring remediation', 'Zero overdue findings'],
    ];

    rows.forEach((row, rIndex) => {
      const bg = rIndex % 2 === 1 ? '#F8FAFD' : '#FFFFFF';
      doc.rect(startX, y, printableWidth, 18).fillAndStroke(bg, border);
      let cx = startX;
      row.forEach((cell, ci) => {
        doc.font('Body').fontSize(7.5).fillColor(navy).text(cell, cx + 6, y + 5, {
          width: (colWidths[ci] ?? 100) - 12,
          ellipsis: true,
        });
        cx += colWidths[ci] ?? 100;
      });
      y += 18;
    });
  } else if (reportType === 'RISK') {
    y = sectionTitle(doc, `Risk register entries (${riskData.length} records)`, y);

    const colWidths = [85, 160, 56, 65, 65, 80];
    const headers = ['Risk Code', 'Title', 'Status', 'Inherent', 'Residual', 'Created Date'];

    const drawTableHeader = (curY: number): number => {
      doc.rect(startX, curY, printableWidth, 20).fill(navy);
      let cx = startX;
      headers.forEach((h, i) => {
        doc.font('Bold').fontSize(7.2).fillColor('#FFFFFF').text(h, cx + 4, curY + 6, {
          width: (colWidths[i] ?? 70) - 8,
          lineBreak: false,
        });
        cx += colWidths[i] ?? 70;
      });
      return curY + 20;
    };

    y = drawTableHeader(y);

    if (riskData.length === 0) {
      doc.rect(startX, y, printableWidth, 22).fillAndStroke('#FFFFFF', border);
      doc.font('Body').fontSize(8).fillColor(muted).text('No matching risk records found.', startX + 10, y + 6);
      y += 22;
    } else {
      riskData.forEach((r, rIndex) => {
        doc.font('Body').fontSize(6.8);
        const titleHeight = doc.heightOfString(r.title, { width: (colWidths[1] ?? 160) - 8 });
        const rowHeight = Math.max(20, Math.min(titleHeight + 8, 34));

        if (y + rowHeight > 780) {
          doc.addPage();
          drawHeader(doc);
          y = drawTableHeader(105);
        }

        const inherent = r.risk_assessments[0]?.inherent_rating ?? 'N/A';
        const residual = r.risk_assessments[0]?.residual_rating ?? 'N/A';

        const row = [
          r.risk_code,
          r.title,
          r.status,
          inherent,
          residual,
          r.created_at.toISOString().slice(0, 10),
        ];

        const bg = rIndex % 2 === 1 ? '#F8FAFD' : '#FFFFFF';
        doc.rect(startX, y, printableWidth, rowHeight).fillAndStroke(bg, border);

        let cx = startX;
        row.forEach((cell, ci) => {
          const font = ci === 3 || ci === 4 ? 'Bold' : 'Body';
          const color = ci === 3 ? getRatingColor(inherent) : ci === 4 ? getRatingColor(residual) : navy;
          doc.font(font).fontSize(6.8).fillColor(color).text(cell, cx + 4, y + 5.5, {
            width: (colWidths[ci] ?? 70) - 8,
            height: rowHeight - 6,
            lineBreak: ci === 1,
            ellipsis: true,
          });
          cx += colWidths[ci] ?? 70;
        });
        y += rowHeight;
      });
    }
  } else {
    // INCIDENT
    y = sectionTitle(doc, `Incident log entries (${incidentData.length} records)`, y);

    const colWidths = [108, 136, 48, 66, 73, 80];
    const headers = ['Incident Code', 'Title', 'Severity', 'Status', 'Handler', 'Detected At'];

    const drawTableHeader = (curY: number): number => {
      doc.rect(startX, curY, printableWidth, 20).fill(navy);
      let cx = startX;
      headers.forEach((h, i) => {
        doc.font('Bold').fontSize(7.2).fillColor('#FFFFFF').text(h, cx + 4, curY + 6, {
          width: (colWidths[i] ?? 70) - 8,
          lineBreak: false,
        });
        cx += colWidths[i] ?? 70;
      });
      return curY + 20;
    };

    y = drawTableHeader(y);

    if (incidentData.length === 0) {
      doc.rect(startX, y, printableWidth, 22).fillAndStroke('#FFFFFF', border);
      doc.font('Body').fontSize(8).fillColor(muted).text('No matching incident records found.', startX + 10, y + 6);
      y += 22;
    } else {
      incidentData.forEach((inc, rIndex) => {
        doc.font('Body').fontSize(6.8);
        const titleHeight = doc.heightOfString(inc.title, { width: (colWidths[1] ?? 136) - 8 });
        const rowHeight = Math.max(20, Math.min(titleHeight + 8, 34));

        if (y + rowHeight > 780) {
          doc.addPage();
          drawHeader(doc);
          y = drawTableHeader(105);
        }

        const handlerName = inc.users_incidents_created_byTousers?.full_name ?? 'System / Auto';
        const detectedStr = inc.detected_at
          ? inc.detected_at.toISOString().slice(0, 16).replace('T', ' ')
          : 'N/A';

        const row = [
          inc.incident_code,
          inc.title,
          inc.severity,
          inc.status,
          handlerName,
          detectedStr,
        ];

        const bg = rIndex % 2 === 1 ? '#F8FAFD' : '#FFFFFF';
        doc.rect(startX, y, printableWidth, rowHeight).fillAndStroke(bg, border);

        let cx = startX;
        row.forEach((cell, ci) => {
          const font = ci === 2 || ci === 3 ? 'Bold' : 'Body';
          const color = ci === 2 ? getRatingColor(inc.severity) : navy;
          doc.font(font).fontSize(6.8).fillColor(color).text(cell, cx + 4, y + 5.5, {
            width: (colWidths[ci] ?? 70) - 8,
            height: rowHeight - 6,
            lineBreak: ci === 1,
            ellipsis: true,
          });
          cx += colWidths[ci] ?? 70;
        });
        y += rowHeight;
      });
    }
  }

  // Footer on all buffered pages
  const pages = doc.bufferedPageRange();
  for (let index = 0; index < pages.count; index += 1) {
    doc.switchToPage(index);
    doc
      .font('Body')
      .fontSize(7)
      .fillColor(muted)
      .text(
        `SecuraAI confidential · Export ${item.id} · Page ${index + 1} of ${pages.count}`,
        startX,
        802,
        { width: printableWidth, align: 'center' },
      );
  }

  doc.end();
  return complete;
}

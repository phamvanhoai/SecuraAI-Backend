import ExcelJS from 'exceljs';
import { PNG } from 'pngjs';
import { reportExportsRepository } from './report-exports.repository.js';
import type { ExportReportRequest } from './dto/export-security-reports.dto.js';

const blue = '1769F6';
const navy = '101B3F';
const muted = '60708F';
const pale = 'F3F7FE';
const border = 'DFE6F2';

const formulaPrefix = /^[=+\-@\t\r]/;

function sanitizeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let str = '';
  if (typeof value === 'string') {
    str = value.trim();
  } else if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    str = String(value).trim();
  } else if (value instanceof Date) {
    str = value.toISOString();
  } else if (
    typeof value === 'object' &&
    value !== null &&
    'toNumber' in value &&
    typeof (value as { toNumber: () => number }).toNumber === 'function'
  ) {
    str = String((value as { toNumber: () => number }).toNumber());
  }
  if (formulaPrefix.test(str)) {
    return `'${str}`;
  }
  return str;
}

function styleSection(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, size: 10, color: { argb: blue } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: pale } };
}

function thinBorder(): Partial<ExcelJS.Borders> {
  return {
    top: { style: 'thin', color: { argb: border } },
    bottom: { style: 'thin', color: { argb: border } },
    left: { style: 'thin', color: { argb: border } },
    right: { style: 'thin', color: { argb: border } },
  };
}

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

function drawSegment(
  png: PNG,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const steps = Math.ceil(len * 2);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const cx = x0 + t * dx;
    const cy = y0 + t * dy;
    const r = width / 2;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if (
          x >= 0 &&
          x < png.width &&
          y >= 0 &&
          y < png.height &&
          Math.hypot(x - cx, y - cy) <= r
        ) {
          const idx = (y * png.width + x) << 2;
          png.data[idx] = 255;
          png.data[idx + 1] = 255;
          png.data[idx + 2] = 255;
          png.data[idx + 3] = 255;
        }
      }
    }
  }
}

function createLogoPng(): Buffer {
  const size = 128;
  const png = new PNG({ width: size, height: size });
  const cornerRadius = 26;
  const bgR = 23;
  const bgG = 105;
  const bgB = 246; // #1769F6 brand blue

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const isTopLeft =
        x < cornerRadius &&
        y < cornerRadius &&
        Math.hypot(cornerRadius - x, cornerRadius - y) > cornerRadius;
      const isTopRight =
        x >= size - cornerRadius &&
        y < cornerRadius &&
        Math.hypot(x - (size - cornerRadius - 1), cornerRadius - y) > cornerRadius;
      const isBottomLeft =
        x < cornerRadius &&
        y >= size - cornerRadius &&
        Math.hypot(cornerRadius - x, y - (size - cornerRadius - 1)) > cornerRadius;
      const isBottomRight =
        x >= size - cornerRadius &&
        y >= size - cornerRadius &&
        Math.hypot(x - (size - cornerRadius - 1), y - (size - cornerRadius - 1)) > cornerRadius;

      const offset = (y * size + x) << 2;
      if (isTopLeft || isTopRight || isBottomLeft || isBottomRight) {
        png.data[offset + 3] = 0;
      } else {
        png.data[offset] = bgR;
        png.data[offset + 1] = bgG;
        png.data[offset + 2] = bgB;
        png.data[offset + 3] = 255;
      }
    }
  }

  // Draw shield contour (curved top and sides)
  const topPoints: Array<[number, number]> = [
    [36, 42],
    [44, 38],
    [54, 34],
    [64, 32],
    [74, 34],
    [84, 38],
    [92, 42],
  ];
  for (let i = 0; i < topPoints.length - 1; i++) {
    const p1 = topPoints[i]!;
    const p2 = topPoints[i + 1]!;
    drawSegment(png, p1[0], p1[1], p2[0], p2[1], 5.5);
  }

  // Left vertical & curve to tip
  const leftPoints: Array<[number, number]> = [
    [36, 42],
    [36, 68],
    [40, 80],
    [48, 92],
    [64, 104],
  ];
  for (let i = 0; i < leftPoints.length - 1; i++) {
    const p1 = leftPoints[i]!;
    const p2 = leftPoints[i + 1]!;
    drawSegment(png, p1[0], p1[1], p2[0], p2[1], 5.5);
  }

  // Right vertical & curve to tip
  const rightPoints: Array<[number, number]> = [
    [92, 42],
    [92, 68],
    [88, 80],
    [80, 92],
    [64, 104],
  ];
  for (let i = 0; i < rightPoints.length - 1; i++) {
    const p1 = rightPoints[i]!;
    const p2 = rightPoints[i + 1]!;
    drawSegment(png, p1[0], p1[1], p2[0], p2[1], 5.5);
  }

  // Checkmark inside shield
  drawSegment(png, 49, 66, 59, 76, 5.5);
  drawSegment(png, 59, 76, 79, 54, 5.5);

  return PNG.sync.write(png);
}

function cellValueToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  if (typeof value === 'object' && 'text' in value && typeof value.text === 'string') {
    return value.text.trim();
  }
  return '';
}

function applyRatingStyle(cell: ExcelJS.Cell): void {
  const val = cellValueToString(cell.value).toUpperCase();
  if (val === 'CRITICAL') {
    cell.font = { bold: true, size: 9, color: { argb: 'DC2626' } };
  } else if (val === 'HIGH') {
    cell.font = { bold: true, size: 9, color: { argb: 'C27208' } };
  } else if (val === 'MEDIUM') {
    cell.font = { bold: true, size: 9, color: { argb: 'B45309' } };
  } else if (val === 'LOW') {
    cell.font = { bold: true, size: 9, color: { argb: '159455' } };
  }
}

function applyRiskStatusStyle(cell: ExcelJS.Cell): void {
  const val = cellValueToString(cell.value).toUpperCase();
  if (val === 'OPEN') {
    cell.font = { bold: true, size: 9, color: { argb: 'C27208' } };
  } else if (val === 'UNDER_TREATMENT') {
    cell.font = { bold: true, size: 9, color: { argb: blue } };
  } else if (['CLOSED', 'ACCEPTED', 'MITIGATED', 'TRANSFERRED'].includes(val)) {
    cell.font = { bold: true, size: 9, color: { argb: '159455' } };
  }
}

function applyIncidentStatusStyle(cell: ExcelJS.Cell): void {
  const val = cellValueToString(cell.value).toUpperCase();
  if (['CLOSED', 'RESOLVED'].includes(val)) {
    cell.font = { bold: true, size: 9, color: { argb: '159455' } };
  } else if (val === 'CONTAINED') {
    cell.font = { bold: true, size: 9, color: { argb: blue } };
  } else if (['OPEN', 'TRIAGED', 'INVESTIGATING'].includes(val)) {
    cell.font = { bold: true, size: 9, color: { argb: 'C27208' } };
  }
}

export async function renderSecurityReportXlsx(
  reportType: 'RISK' | 'INCIDENT' | 'SECURITY_POSTURE',
  item: { id: string; created_at: Date; users: { full_name: string; role: string } },
  safeFilters: ExportReportRequest,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = item.users.full_name;
  workbook.lastModifiedBy = item.users.full_name;
  workbook.company = 'SecuraAI';
  workbook.created = item.created_at;
  workbook.modified = item.created_at;

  const sheetName =
    reportType === 'RISK'
      ? 'Risk Register'
      : reportType === 'INCIDENT'
        ? 'Incident Register'
        : 'Security Posture';

  const worksheet = workbook.addWorksheet(sheetName, {
    views: [{ showGridLines: false }],
  });
  worksheet.properties.defaultRowHeight = 18;

  let headers: string[] = [];
  let dataRows: (string | number)[][] = [];
  let columnWidths: number[] = [];

  if (reportType === 'RISK') {
    headers = [
      'Risk Code',
      'Title',
      'Status',
      'Inherent Rating',
      'Residual Rating',
      'Control Effectiveness',
      'Created Date',
    ];
    columnWidths = [18, 40, 20, 20, 20, 24, 18];

    const data = await reportExportsRepository.compileRiskData(safeFilters);
    dataRows = data.map((r) => [
      sanitizeCell(r.risk_code),
      sanitizeCell(r.title),
      sanitizeCell(r.status),
      sanitizeCell(r.risk_assessments[0]?.inherent_rating || 'N/A'),
      sanitizeCell(r.risk_assessments[0]?.residual_rating || 'N/A'),
      r.risk_assessments[0]?.control_effectiveness !== null &&
      r.risk_assessments[0]?.control_effectiveness !== undefined
        ? `${String(r.risk_assessments[0].control_effectiveness)}%`
        : 'N/A',
      r.created_at.toISOString().slice(0, 10),
    ]);
  } else if (reportType === 'INCIDENT') {
    headers = [
      'Incident Code',
      'Title',
      'Severity',
      'Status',
      'Assigned Handler',
      'Detected At',
      'Created Date',
    ];
    columnWidths = [20, 40, 18, 20, 28, 22, 18];

    const data = await reportExportsRepository.compileIncidentData(safeFilters);
    dataRows = data.map((inc) => [
      sanitizeCell(inc.incident_code),
      sanitizeCell(inc.title),
      sanitizeCell(inc.severity),
      sanitizeCell(inc.status),
      sanitizeCell(inc.users_incidents_created_byTousers?.full_name || 'System / Auto-Detected'),
      inc.detected_at ? inc.detected_at.toISOString().slice(0, 16).replace('T', ' ') : 'N/A',
      inc.created_at.toISOString().slice(0, 10),
    ]);
  } else {
    headers = ['Metric / Indicator', 'Current Value', 'Evaluation Assessment', 'Standard Benchmark'];
    columnWidths = [35, 22, 45, 28];

    const posture = await reportExportsRepository.compileSecurityPostureData(safeFilters);
    dataRows = [
      ['Security Posture Health Score', `${posture.postureScore} / 100`, posture.postureLevel, '>= 80 (Good)'],
      ['Control Compliance Rate', `${posture.complianceRate}%`, 'Percentage of controls without open findings', '100% Target'],
      ['Total Monitored IT Assets', posture.totalAssets, `${posture.criticalAssets} critical / high priority`, 'Continuous asset discovery'],
      ['Open Operational Risks', posture.openRisks, `Out of ${posture.totalRisks} evaluated risks`, '< 5 critical open'],
      ['Active Incidents Under Response', posture.openIncidents, `Out of ${posture.totalIncidents} total incidents`, 'Zero uncontained critical'],
      ['24h Ingested Security Events', posture.totalEvents24h, `Triggered ${posture.totalAlerts24h} AI anomaly alerts`, 'Telemetry streaming active'],
      ['Open Control Weaknesses', posture.openFindings, 'Findings requiring remediation', 'Zero overdue findings'],
    ];
  }

  const lastColLetter = String.fromCharCode(64 + headers.length);

  // Row 1 & 2: Brand & Title Banner
  worksheet.mergeCells('A1:A2');
  worksheet.mergeCells(`B1:${lastColLetter}1`);
  const mainTitle =
    reportType === 'RISK'
      ? 'SECURAAI · RISK REGISTER & ASSESSMENT EXPORT'
      : reportType === 'INCIDENT'
        ? 'SECURAAI · INCIDENT MANAGEMENT & RESPONSE EXPORT'
        : 'SECURAAI · EXECUTIVE SECURITY POSTURE EXPORT';

  worksheet.getCell('B1').value = mainTitle;
  worksheet.getCell('B1').font = { bold: true, size: 16, color: { argb: navy } };
  worksheet.getCell('B1').alignment = { vertical: 'middle' };
  worksheet.getRow(1).height = 36;
  worksheet.getRow(2).height = 30;

  const logoWidth = 72;
  const logoHeight = 72;
  const colAWidth = columnWidths[0] ?? 20;
  const colAPixels = colAWidth * 7.5;
  const colOffset = Math.max(0.04, (colAPixels - logoWidth) / (2 * colAPixels));
  const rowOffset = 0.14;

  const imageId = workbook.addImage({
    base64: `data:image/png;base64,${createLogoPng().toString('base64')}`,
    extension: 'png',
  });
  worksheet.addImage(imageId, {
    tl: { col: colOffset, row: rowOffset },
    ext: { width: logoWidth, height: logoHeight },
  });

  worksheet.mergeCells(`B2:${lastColLetter}2`);
  const subtitle =
    reportType === 'RISK'
      ? 'Enterprise risk assessment & treatment register · ISO/IEC 27001:2022 ISMS'
      : reportType === 'INCIDENT'
        ? 'Incident management, response & triage register · ISO/IEC 27001:2022 ISMS'
        : 'Executive security posture & control compliance overview · ISO/IEC 27001:2022 ISMS';

  worksheet.getCell('B2').value = subtitle;
  worksheet.getCell('B2').font = { italic: true, size: 10, color: { argb: muted } };
  worksheet.getCell('B2').alignment = { vertical: 'middle' };

  // Metadata Section
  const metadataRows: Array<[string, string]> = [
    ['Schema version', '2.0.0'],
    ['Export ID', item.id],
    ['Report type', reportType],
    ['Generated at (UTC)', item.created_at.toISOString()],
    ['Generated at (local)', formatLocal(item.created_at.toISOString())],
    ['Exported by', item.users.full_name],
    ['Exporter role', item.users.role],
    ['Classification', 'CONFIDENTIAL / RESTRICTED'],
    ['Framework', 'ISO/IEC 27001:2022 ISMS'],
    ['Record count', String(dataRows.length)],
  ];

  worksheet.getCell('A4').value = 'EXPORT METADATA';
  styleSection(worksheet.getCell('A4'));
  metadataRows.forEach(([label, value], index) => {
    const row = 5 + index;
    worksheet.getCell(`A${row}`).value = label;
    worksheet.getCell(`A${row}`).font = { bold: true, size: 9, color: { argb: muted } };
    worksheet.mergeCells(`B${row}:${lastColLetter}${row}`);
    worksheet.getCell(`B${row}`).value = value;
    worksheet.getCell(`B${row}`).font = { size: 9, color: { argb: navy } };
  });

  // Applied Filters Section
  const filterRow = 5 + metadataRows.length + 1;
  worksheet.getCell(`A${filterRow}`).value = 'APPLIED FILTERS';
  styleSection(worksheet.getCell(`A${filterRow}`));
  worksheet.mergeCells(`B${filterRow}:${lastColLetter}${filterRow}`);

  const filterParts: string[] = [];
  if (safeFilters.severity) filterParts.push(`Severity: ${safeFilters.severity}`);
  if (safeFilters.status) filterParts.push(`Status: ${safeFilters.status}`);
  if (safeFilters.startDate || safeFilters.endDate) {
    filterParts.push(
      `Period: ${safeFilters.startDate || 'All'} to ${safeFilters.endDate || 'Now'}`,
    );
  }
  worksheet.getCell(`B${filterRow}`).value =
    filterParts.length > 0
      ? filterParts.join('   |   ')
      : 'No filters applied (All available records)';
  worksheet.getCell(`B${filterRow}`).font = { size: 9, color: { argb: navy } };

  // Table Header Row
  const headerRowNumber = filterRow + 2;
  worksheet.getRow(headerRowNumber).values = headers;
  worksheet.getRow(headerRowNumber).height = 24;
  worksheet.getRow(headerRowNumber).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFF' }, size: 9 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blue } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.border = thinBorder();
  });

  // Data Rows
  dataRows.forEach((rowValues) => {
    const row = worksheet.addRow(rowValues);
    row.height = 20;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = thinBorder();
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.font = { size: 9, color: { argb: navy } };
    });

    if (reportType === 'RISK') {
      applyRiskStatusStyle(row.getCell(3));
      applyRatingStyle(row.getCell(4));
      applyRatingStyle(row.getCell(5));
      row.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(7).alignment = { vertical: 'middle', horizontal: 'center' };
    } else if (reportType === 'INCIDENT') {
      applyRatingStyle(row.getCell(3));
      applyIncidentStatusStyle(row.getCell(4));
      row.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(7).alignment = { vertical: 'middle', horizontal: 'center' };
    } else if (reportType === 'SECURITY_POSTURE') {
      row.getCell(2).font = { bold: true, size: 9, color: { argb: navy } };
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
    }
  });

  // AutoFilter & Freeze Panes
  worksheet.autoFilter = {
    from: `A${headerRowNumber}`,
    to: `${lastColLetter}${Math.max(headerRowNumber, worksheet.rowCount)}`,
  };
  worksheet.views = [{ state: 'frozen', ySplit: headerRowNumber, showGridLines: false }];

  // Column Widths
  worksheet.columns = columnWidths.map((width) => ({ width }));

  // Page Setup & Footer
  worksheet.headerFooter.oddFooter = '&LConfidential · SecuraAI Enterprise ISMS&RPage &P of &N';
  worksheet.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
  };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

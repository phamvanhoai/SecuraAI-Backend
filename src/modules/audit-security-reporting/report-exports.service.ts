import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { AppError } from '../../common/errors/app-error.js';
import { reportExportsRepository } from './report-exports.repository.js';
import type {
  ExportReportRequest,
  ListExportReportsQuery,
  ReportExportItem,
} from './dto/export-security-reports.dto.js';

const formulaPrefix = /^[=+\-@\t\r]/;

function sanitizeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value).trim();
  if (formulaPrefix.test(str)) {
    return `'${str}`;
  }
  return str;
}

function escapeCsvRow(row: string[]): string {
  return row
    .map((cell) => {
      const sanitized = sanitizeCell(cell);
      if (sanitized.includes(',') || sanitized.includes('"') || sanitized.includes('\n')) {
        return `"${sanitized.replace(/"/g, '""')}"`;
      }
      return sanitized;
    })
    .join(',');
}

function mapReportExportItem(
  item: {
    id: string;
    report_type: string;
    status: any;
    storage_uri: string | null;
    filters: any;
    generated_at: Date | null;
    created_at: Date;
    users: { id: string; full_name: string; role: string };
  },
  overrideSummary?: { recordCount: number; period?: string; highlights?: string[] },
): ReportExportItem {
  const filters = (item.filters as Record<string, unknown> | null) || null;
  const format = (filters?.format as 'EXCEL' | 'PDF' | 'CSV') || 'EXCEL';
  const recordCount =
    overrideSummary?.recordCount ??
    (typeof filters?.recordCount === 'number' ? filters.recordCount : 0);
  const isRevoked = filters?.isRevoked === true;
  const revokedAt = typeof filters?.revokedAt === 'string' ? filters.revokedAt : null;
  const revokedBy = typeof filters?.revokedBy === 'string' ? filters.revokedBy : null;
  const revocationReason = typeof filters?.revocationReason === 'string' ? filters.revocationReason : null;

  return {
    id: item.id,
    reportType: item.report_type,
    format,
    status: item.status,
    storageUri: item.storage_uri,
    requestedBy: {
      id: item.users.id,
      fullName: item.users.full_name,
      role: item.users.role,
    },
    filters,
    summary: {
      recordCount,
      period:
        overrideSummary?.period ??
        (filters?.startDate || filters?.endDate
          ? `${String(filters?.startDate || 'All')} to ${String(filters?.endDate || 'Now')}`
          : 'All available records'),
      highlights: overrideSummary?.highlights,
    },
    downloadUrl: `/api/v1/reports/exports/${item.id}/download`,
    isRevoked,
    revokedAt,
    revokedBy,
    revocationReason,
    generatedAt: item.generated_at ? item.generated_at.toISOString() : null,
    createdAt: item.created_at.toISOString(),
  };
}

export const reportExportsService = {
  async exportReport(userId: string, input: ExportReportRequest): Promise<ReportExportItem> {
    const actor = await reportExportsRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE') {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    if (actor.role !== 'SECURITY_OFFICER' && actor.role !== 'EXECUTIVE') {
      throw new AppError(403, 'FORBIDDEN', 'Security Officer or Executive role required');
    }

    const format = input.format || 'EXCEL';
    const now = new Date();

    let recordCount = 0;
    const highlights: string[] = [];

    if (input.reportType === 'RISK') {
      const data = await reportExportsRepository.compileRiskData(input);
      recordCount = data.length;
      highlights.push(`Compiled ${recordCount} organizational risk records.`);
    } else if (input.reportType === 'INCIDENT') {
      const data = await reportExportsRepository.compileIncidentData(input);
      recordCount = data.length;
      highlights.push(`Compiled ${recordCount} incident response records.`);
    } else {
      const posture = await reportExportsRepository.compileSecurityPostureData(input);
      recordCount = posture.totalAssets;
      highlights.push(
        `Security posture rated ${posture.postureLevel} (${posture.postureScore}/100) across ${posture.totalAssets} assets.`,
      );
    }

    const filtersRecord = {
      format,
      startDate: input.startDate || null,
      endDate: input.endDate || null,
      severity: input.severity || null,
      status: input.status || null,
      recordCount,
    };

    const tempId = crypto.randomUUID();
    const storageUri = `/api/v1/reports/exports/${tempId}/download`;

    const createdRecord = await reportExportsRepository.createExportRecord({
      reportType: input.reportType,
      requestedBy: actor.id,
      filters: filtersRecord,
      status: 'COMPLETED',
      storageUri,
      generatedAt: now,
    });

    return mapReportExportItem(createdRecord, {
      recordCount,
      period:
        input.startDate || input.endDate
          ? `${input.startDate || 'All'} to ${input.endDate || 'Now'}`
          : 'All available records',
      highlights,
    });
  },

  async listExports(userId: string, query: ListExportReportsQuery) {
    const actor = await reportExportsRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE') {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    if (actor.role !== 'SECURITY_OFFICER' && actor.role !== 'EXECUTIVE') {
      throw new AppError(403, 'FORBIDDEN', 'Security Officer or Executive role required');
    }

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const { items, totalItems } = await reportExportsRepository.listExports({
      reportType: query.reportType,
      status: query.status,
      skip,
      take: limit,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    const mappedItems: ReportExportItem[] = items.map((item) => mapReportExportItem(item));

    return {
      items: mappedItems,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit) || 1,
      },
    };
  },

  async getExportDetail(userId: string, exportId: string): Promise<ReportExportItem> {
    const actor = await reportExportsRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE') {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    if (actor.role !== 'SECURITY_OFFICER' && actor.role !== 'EXECUTIVE') {
      throw new AppError(403, 'FORBIDDEN', 'Security Officer or Executive role required');
    }

    const item = await reportExportsRepository.findExportById(exportId);
    if (!item) {
      throw new AppError(404, 'NOT_FOUND', 'Report export not found');
    }

    return mapReportExportItem(item);
  },

  async revokeExport(userId: string, exportId: string, reason: string): Promise<ReportExportItem> {
    const actor = await reportExportsRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE') {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    if (actor.role !== 'SECURITY_OFFICER' && actor.role !== 'EXECUTIVE') {
      throw new AppError(403, 'FORBIDDEN', 'Security Officer or Executive role required');
    }

    const item = await reportExportsRepository.findExportById(exportId);
    if (!item) {
      throw new AppError(404, 'NOT_FOUND', 'Report export not found');
    }

    const currentFilters = (item.filters as Record<string, unknown> | null) || {};
    if (currentFilters.isRevoked === true) {
      throw new AppError(400, 'BAD_REQUEST', 'Report export has already been revoked');
    }

    const now = new Date();
    const updatedFilters = {
      ...currentFilters,
      isRevoked: true,
      revokedAt: now.toISOString(),
      revokedBy: `${actor.full_name} (${actor.role})`,
      revocationReason: reason.trim(),
    };

    const beforeData = {
      id: item.id,
      report_type: item.report_type,
      status: item.status,
      filters: currentFilters,
    };

    const afterData = {
      id: item.id,
      report_type: item.report_type,
      status: item.status,
      filters: updatedFilters,
      revocation_reason: reason.trim(),
    };

    const updated = await reportExportsRepository.updateExportFilters(
      exportId,
      updatedFilters as any,
      {
        actorUserId: actor.id,
        beforeData,
        afterData,
      },
    );
    return mapReportExportItem(updated);
  },

  async downloadReport(
    userId: string,
    exportId: string,
  ): Promise<{ filename: string; contentType: string; content: string | Buffer }> {
    const actor = await reportExportsRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE') {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    if (actor.role !== 'SECURITY_OFFICER' && actor.role !== 'EXECUTIVE') {
      throw new AppError(403, 'FORBIDDEN', 'Security Officer or Executive role required');
    }

    const item = await reportExportsRepository.findExportById(exportId);
    if (!item) {
      throw new AppError(404, 'NOT_FOUND', 'Report export not found');
    }

    const filters = (item.filters as Record<string, unknown> | null) || {};
    if (filters.isRevoked === true) {
      const reason = filters.revocationReason ? `: ${String(filters.revocationReason)}` : '';
      throw new AppError(410, 'GONE', `Report export has been revoked${reason}`);
    }

    const format = (filters.format as string) || 'EXCEL';
    const reportType = item.report_type;
    const dateStr = item.created_at.toISOString().slice(0, 10);

    const safeFilters: ExportReportRequest = {
      reportType: reportType as any,
      format: format as any,
      startDate: filters.startDate as string | undefined,
      endDate: filters.endDate as string | undefined,
      severity: filters.severity as string | undefined,
      status: filters.status as string | undefined,
    };

    if (format === 'PDF') {
      const pdfBuffer = await generatePdfBuffer(reportType as any, item, safeFilters);
      return {
        filename: `securaai-${reportType.toLowerCase()}-report-${dateStr}.pdf`,
        contentType: 'application/pdf',
        content: pdfBuffer,
      };
    }

    if (format === 'EXCEL') {
      const excelBuffer = await generateExcelBuffer(reportType as any, item, safeFilters);
      return {
        filename: `securaai-${reportType.toLowerCase()}-report-${dateStr}.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        content: excelBuffer,
      };
    }

    // Default: CSV with UTF-8 BOM (\uFEFF)
    const csvContent = await generateCsvContent(reportType as any, item, safeFilters);
    return {
      filename: `securaai-${reportType.toLowerCase()}-report-${dateStr}.csv`,
      contentType: 'text/csv; charset=utf-8',
      content: csvContent,
    };
  },
};

async function generateCsvContent(
  reportType: 'RISK' | 'INCIDENT' | 'SECURITY_POSTURE',
  item: { created_at: Date; users: { full_name: string } },
  safeFilters: ExportReportRequest,
): Promise<string> {
  const rows: string[][] = [];

  if (reportType === 'RISK') {
    rows.push(['SecuraAI Risk Register & Assessment Export Report']);
    rows.push([`Exported At: ${item.created_at.toISOString()}`, `Exported By: ${item.users.full_name}`]);
    rows.push([]);
    rows.push([
      'Risk Code',
      'Title',
      'Status',
      'Inherent Rating',
      'Residual Rating',
      'Control Effectiveness',
      'Created At',
    ]);

    const data = await reportExportsRepository.compileRiskData(safeFilters);
    for (const r of data) {
      rows.push([
        r.risk_code,
        r.title,
        r.status,
        r.risk_assessments[0]?.inherent_rating || 'N/A',
        r.risk_assessments[0]?.residual_rating || 'N/A',
        r.risk_assessments[0]?.control_effectiveness ? `${r.risk_assessments[0].control_effectiveness}%` : 'N/A',
        r.created_at.toISOString().slice(0, 10),
      ]);
    }
  } else if (reportType === 'INCIDENT') {
    rows.push(['SecuraAI Incident Management Export Report']);
    rows.push([`Exported At: ${item.created_at.toISOString()}`, `Exported By: ${item.users.full_name}`]);
    rows.push([]);
    rows.push([
      'Incident Code',
      'Title',
      'Severity',
      'Status',
      'Handler',
      'Detected At',
      'Created At',
    ]);

    const data = await reportExportsRepository.compileIncidentData(safeFilters);
    for (const inc of data) {
      rows.push([
        inc.incident_code,
        inc.title,
        inc.severity,
        inc.status,
        inc.users_incidents_created_byTousers?.full_name || 'System / Auto-Detected',
        inc.detected_at ? inc.detected_at.toISOString().slice(0, 16) : 'N/A',
        inc.created_at.toISOString().slice(0, 10),
      ]);
    }
  } else {
    rows.push(['SecuraAI Executive Security Posture Export Report']);
    rows.push([`Exported At: ${item.created_at.toISOString()}`, `Exported By: ${item.users.full_name}`]);
    rows.push([]);
    rows.push(['Metric / Indicator', 'Current Value', 'Evaluation Assessment']);

    const posture = await reportExportsRepository.compileSecurityPostureData(safeFilters);
    rows.push(['Security Posture Health Score', `${posture.postureScore} / 100`, posture.postureLevel]);
    rows.push(['Control Compliance Rate', `${posture.complianceRate}%`, 'Percentage of controls without open findings']);
    rows.push(['Total IT Assets', String(posture.totalAssets), `${posture.criticalAssets} critical / high priority`]);
    rows.push(['Open Operational Risks', String(posture.openRisks), `Out of ${posture.totalRisks} evaluated risks`]);
    rows.push(['Active Incidents Under Response', String(posture.openIncidents), `Out of ${posture.totalIncidents} total incidents`]);
    rows.push(['24h Ingested Security Events', String(posture.totalEvents24h), `Triggered ${posture.totalAlerts24h} AI anomaly alerts`]);
    rows.push(['Open Control Weaknesses', String(posture.openFindings), 'Findings requiring remediation']);
  }

  return '\uFEFF' + rows.map(escapeCsvRow).join('\r\n');
}

async function generateExcelBuffer(
  reportType: 'RISK' | 'INCIDENT' | 'SECURITY_POSTURE',
  item: { created_at: Date; users: { full_name: string; role: string } },
  safeFilters: ExportReportRequest,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SecuraAI Enterprise Platform';
  workbook.created = item.created_at;

  const sheetName =
    reportType === 'RISK'
      ? 'Risk Register'
      : reportType === 'INCIDENT'
        ? 'Incidents'
        : 'Security Posture';
  const worksheet = workbook.addWorksheet(sheetName, {
    views: [{ showGridLines: true }],
  });

  const titleText =
    reportType === 'RISK'
      ? 'SecuraAI Enterprise Risk Register & Assessment Report'
      : reportType === 'INCIDENT'
        ? 'SecuraAI Incident Management & Response Report'
        : 'SecuraAI Executive Security Posture & Compliance Report';

  worksheet.addRow([titleText]);
  const titleRow = worksheet.getRow(1);
  titleRow.height = 30;
  titleRow.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F172A' },
  };
  titleRow.alignment = { vertical: 'middle', horizontal: 'center' };

  worksheet.addRow([
    `Export ID: ${item.created_at.toISOString().slice(0, 10)}`,
    `Generated At: ${item.created_at.toISOString()}`,
    `Requested By: ${item.users.full_name} (${item.users.role})`,
    'Framework: ISO/IEC 27001:2022',
  ]);
  const metaRow = worksheet.getRow(2);
  metaRow.font = { italic: true, size: 9, color: { argb: 'FF475569' } };

  worksheet.addRow([]); // Blank spacer

  let headers: string[] = [];
  let dataRows: (string | number)[][] = [];

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
    const data = await reportExportsRepository.compileRiskData(safeFilters);
    dataRows = data.map((r) => [
      sanitizeCell(r.risk_code),
      sanitizeCell(r.title),
      sanitizeCell(r.status),
      sanitizeCell(r.risk_assessments[0]?.inherent_rating || 'N/A'),
      sanitizeCell(r.risk_assessments[0]?.residual_rating || 'N/A'),
      r.risk_assessments[0]?.control_effectiveness
        ? `${r.risk_assessments[0].control_effectiveness}%`
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

  // Merge title across columns
  worksheet.mergeCells(1, 1, 1, headers.length);

  // Add Header Row
  worksheet.addRow(headers);
  const headerRowNumber = 4;
  const headerRow = worksheet.getRow(headerRowNumber);
  headerRow.height = 24;
  headerRow.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1769F6' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' };

  // Add Data Rows
  for (let i = 0; i < dataRows.length; i++) {
    const rowValues = dataRows[i]!;
    worksheet.addRow(rowValues);
    const row = worksheet.getRow(headerRowNumber + 1 + i);
    row.height = 20;
    row.font = { size: 9, color: { argb: 'FF1E293B' } };
    row.alignment = { vertical: 'middle' };

    if (i % 2 === 1) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8FAFC' },
      };
    }

    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });
  }

  if (worksheet.columns) {
    for (const column of worksheet.columns) {
      let maxLength = 12;
      column.eachCell?.({ includeEmpty: false }, (cell) => {
        const cellLength = cell.value ? String(cell.value).length : 0;
        if (cellLength > maxLength) {
          maxLength = cellLength;
        }
      });
      column.width = Math.min(Math.max(maxLength + 4, 14), 45);
    }
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

async function generatePdfBuffer(
  reportType: 'RISK' | 'INCIDENT' | 'SECURITY_POSTURE',
  item: { created_at: Date; users: { full_name: string; role: string } },
  safeFilters: ExportReportRequest,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 40,
        size: 'A4',
        info: {
          Title: `SecuraAI ${reportType} Report`,
          Author: 'SecuraAI Enterprise Platform',
          Subject: 'Security Risk & Compliance Export',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const printableWidth = 515;
      const startX = 40;

      // Draw top header brand line
      doc.rect(startX, 35, printableWidth, 4).fill('#1769F6');

      // Brand Title & Subtitle
      doc.fontSize(16).fillColor('#0F172A').font('Helvetica-Bold');
      doc.text('SecuraAI Enterprise Security Platform', startX, 48);

      const titleText =
        reportType === 'RISK'
          ? 'Risk Register & Assessment Report'
          : reportType === 'INCIDENT'
            ? 'Incident Management & Response Report'
            : 'Executive Security Posture Report';

      doc.fontSize(12).fillColor('#1769F6').font('Helvetica-Bold');
      doc.text(titleText, startX, 70);

      // Metadata card
      const metaBoxY = 92;
      doc.roundedRect(startX, metaBoxY, printableWidth, 44, 4).fillAndStroke('#F8FAFC', '#E2E8F0');

      doc.fontSize(8.5).font('Helvetica').fillColor('#475569');
      doc.text(`Requested By: ${item.users.full_name} (${item.users.role})`, startX + 12, metaBoxY + 10);
      doc.text(
        `Generated At: ${item.created_at.toISOString().replace('T', ' ').slice(0, 19)} UTC`,
        startX + 12,
        metaBoxY + 24,
      );

      doc.text('Framework: ISO/IEC 27001:2022 ISMS', startX + 270, metaBoxY + 10);
      doc.text('Classification: CONFIDENTIAL / RESTRICTED', startX + 270, metaBoxY + 24);

      let currentY = metaBoxY + 56;

      (async () => {
        if (reportType === 'SECURITY_POSTURE') {
          const posture = await reportExportsRepository.compileSecurityPostureData(safeFilters);

          // 4 KPI Summary Cards
          const cardWidth = 120;
          const cardHeight = 44;
          const cardGap = (printableWidth - cardWidth * 4) / 3;

          const cards = [
            { label: 'Posture Score', val: `${posture.postureScore}/100`, sub: posture.postureLevel, color: '#1769F6' },
            { label: 'Compliance Rate', val: `${posture.complianceRate}%`, sub: 'Controls Passed', color: '#10B981' },
            { label: 'Total IT Assets', val: String(posture.totalAssets), sub: `${posture.criticalAssets} Critical`, color: '#6366F1' },
            { label: 'Open Risks', val: `${posture.openRisks}/${posture.totalRisks}`, sub: `${posture.openIncidents} Incidents`, color: '#F59E0B' },
          ];

          cards.forEach((card, index) => {
            const cardX = startX + index * (cardWidth + cardGap);
            doc.roundedRect(cardX, currentY, cardWidth, cardHeight, 4).fillAndStroke('#FFFFFF', '#CBD5E1');
            doc.rect(cardX, currentY, cardWidth, 3).fill(card.color);
            doc.fontSize(8).font('Helvetica-Bold').fillColor('#64748B').text(card.label, cardX + 8, currentY + 7);
            doc.fontSize(11).font('Helvetica-Bold').fillColor('#0F172A').text(card.val, cardX + 8, currentY + 19);
            doc.fontSize(7.5).font('Helvetica').fillColor('#64748B').text(card.sub, cardX + 8, currentY + 32);
          });

          currentY += cardHeight + 16;

          // Details Table
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#0F172A').text('Security & Operational Indicators', startX, currentY);
          currentY += 16;

          const headers = ['Indicator / Metric', 'Value', 'Assessment', 'Target'];
          const colWidths = [150, 80, 185, 100];

          // Draw Table Header
          doc.rect(startX, currentY, printableWidth, 20).fill('#1769F6');
          let colX = startX;
          headers.forEach((h, i) => {
            doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#FFFFFF').text(h, colX + 6, currentY + 5, {
              width: (colWidths[i] ?? 100) - 12,
            });
            colX += colWidths[i] ?? 100;
          });
          currentY += 20;

          const rows = [
            ['Posture Health Score', `${posture.postureScore} / 100`, posture.postureLevel, '>= 80 (Good)'],
            ['Control Compliance Rate', `${posture.complianceRate}%`, 'Evaluated controls without non-conformities', '100% Target'],
            ['Monitored IT Assets', String(posture.totalAssets), `${posture.criticalAssets} critical / high priority`, 'Full discovery'],
            ['Open Operational Risks', String(posture.openRisks), `Out of ${posture.totalRisks} total registered risks`, '< 5 critical'],
            ['Active Incidents Under Response', String(posture.openIncidents), `Out of ${posture.totalIncidents} total incidents`, '0 uncontained'],
            ['24h Ingested Security Events', String(posture.totalEvents24h), `Triggered ${posture.totalAlerts24h} AI anomaly alerts`, 'Active stream'],
            ['Open Audit Findings', String(posture.openFindings), 'Findings requiring remediation', '0 overdue'],
          ];

          rows.forEach((row, rIndex) => {
            const bg = rIndex % 2 === 1 ? '#F8FAFC' : '#FFFFFF';
            doc.rect(startX, currentY, printableWidth, 18).fillAndStroke(bg, '#E2E8F0');
            let cx = startX;
            row.forEach((cell, ci) => {
              doc.fontSize(8).font('Helvetica').fillColor('#1E293B').text(cell, cx + 6, currentY + 4, {
                width: (colWidths[ci] ?? 100) - 12,
                ellipsis: true,
              });
              cx += colWidths[ci] ?? 100;
            });
            currentY += 18;
          });
        } else if (reportType === 'RISK') {
          const data = await reportExportsRepository.compileRiskData(safeFilters);

          doc.fontSize(10).font('Helvetica-Bold').fillColor('#0F172A').text(`Risk Register Entries (${data.length} records)`, startX, currentY);
          currentY += 16;

          const colWidths = [70, 165, 60, 75, 75, 70];
          const headers = ['Risk Code', 'Title', 'Status', 'Inherent', 'Residual', 'Created'];

          const drawTableHeader = () => {
            doc.rect(startX, currentY, printableWidth, 20).fill('#1769F6');
            let cx = startX;
            headers.forEach((h, i) => {
              doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#FFFFFF').text(h, cx + 6, currentY + 5, {
                width: (colWidths[i] ?? 70) - 12,
              });
              cx += colWidths[i] ?? 70;
            });
            currentY += 20;
          };

          drawTableHeader();

          data.forEach((r, rIndex) => {
            if (currentY > 760) {
              doc.addPage();
              doc.rect(startX, 35, printableWidth, 4).fill('#1769F6');
              currentY = 48;
              drawTableHeader();
            }

            const row = [
              r.risk_code,
              r.title,
              r.status,
              r.risk_assessments[0]?.inherent_rating || 'N/A',
              r.risk_assessments[0]?.residual_rating || 'N/A',
              r.created_at.toISOString().slice(0, 10),
            ];

            const bg = rIndex % 2 === 1 ? '#F8FAFC' : '#FFFFFF';
            doc.rect(startX, currentY, printableWidth, 18).fillAndStroke(bg, '#E2E8F0');
            let cx = startX;
            row.forEach((cell, ci) => {
              doc.fontSize(8).font('Helvetica').fillColor('#1E293B').text(cell, cx + 6, currentY + 4, {
                width: (colWidths[ci] ?? 70) - 12,
                ellipsis: true,
              });
              cx += colWidths[ci] ?? 70;
            });
            currentY += 18;
          });
        } else {
          // INCIDENT
          const data = await reportExportsRepository.compileIncidentData(safeFilters);

          doc.fontSize(10).font('Helvetica-Bold').fillColor('#0F172A').text(`Incident Log Entries (${data.length} records)`, startX, currentY);
          currentY += 16;

          const colWidths = [75, 155, 65, 65, 85, 70];
          const headers = ['Incident Code', 'Title', 'Severity', 'Status', 'Handler', 'Detected At'];

          const drawTableHeader = () => {
            doc.rect(startX, currentY, printableWidth, 20).fill('#1769F6');
            let cx = startX;
            headers.forEach((h, i) => {
              doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#FFFFFF').text(h, cx + 6, currentY + 5, {
                width: (colWidths[i] ?? 70) - 12,
              });
              cx += colWidths[i] ?? 70;
            });
            currentY += 20;
          };

          drawTableHeader();

          data.forEach((inc, rIndex) => {
            if (currentY > 760) {
              doc.addPage();
              doc.rect(startX, 35, printableWidth, 4).fill('#1769F6');
              currentY = 48;
              drawTableHeader();
            }

            const row = [
              inc.incident_code,
              inc.title,
              inc.severity,
              inc.status,
              inc.users_incidents_created_byTousers?.full_name || 'System / Auto',
              inc.detected_at ? inc.detected_at.toISOString().slice(0, 10) : 'N/A',
            ];

            const bg = rIndex % 2 === 1 ? '#F8FAFC' : '#FFFFFF';
            doc.rect(startX, currentY, printableWidth, 18).fillAndStroke(bg, '#E2E8F0');
            let cx = startX;
            row.forEach((cell, ci) => {
              doc.fontSize(8).font('Helvetica').fillColor('#1E293B').text(cell, cx + 6, currentY + 4, {
                width: (colWidths[ci] ?? 70) - 12,
                ellipsis: true,
              });
              cx += colWidths[ci] ?? 70;
            });
            currentY += 18;
          });
        }

        // Footer note at bottom
        doc.fontSize(7.5).font('Helvetica').fillColor('#94A3B8');
        doc.text(
          'SecuraAI Enterprise Platform • Confidential & Proprietary • Certified ISO/IEC 27001 ISMS',
          startX,
          800,
          { align: 'center', width: printableWidth },
        );

        doc.end();
      })().catch(reject);
    } catch (err) {
      reject(err);
    }
  });
}

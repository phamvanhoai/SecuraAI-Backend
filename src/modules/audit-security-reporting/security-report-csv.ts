import { createHash } from 'node:crypto';
import { reportExportsRepository } from './report-exports.repository.js';
import type { ExportReportRequest } from './dto/export-security-reports.dto.js';

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let str = '';
  if (typeof value === 'string') {
    str = value.trim();
  } else if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    str = String(value).trim();
  } else if (value instanceof Date) {
    str = value.toISOString();
  } else if (
    typeof value === 'object' &&
    'toNumber' in value &&
    typeof (value as { toNumber: () => number }).toNumber === 'function'
  ) {
    str = String((value as { toNumber: () => number }).toNumber());
  } else {
    str = JSON.stringify(value);
  }

  const safe = /^[=+\-@]/.test(str) ? `'${str}` : str;
  return `"${safe.replaceAll('"', '""')}"`;
}

export async function renderSecurityReportCsv(
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
): Promise<string> {
  const metadataHeaders = [
    'Schema Version',
    'Export ID',
    'Generated At UTC',
    'Display Time Zone',
    'Exported By',
    'Exporter Email',
    'Exporter Role',
    'Purpose',
    'Scope',
    'Applied Filters',
    'Record Count',
    'Record-set SHA-256',
  ];

  let domainHeaders: string[] = [];
  let dataRows: (string | number)[][] = [];
  let rawDataForDigest: unknown = null;

  if (reportType === 'RISK') {
    domainHeaders = [
      'Risk Code',
      'Title',
      'Status',
      'Inherent Rating',
      'Residual Rating',
      'Control Effectiveness',
      'Created Date',
    ];

    const data = await reportExportsRepository.compileRiskData(safeFilters);
    rawDataForDigest = data;
    dataRows = data.map((r) => [
      r.risk_code,
      r.title,
      r.status,
      r.risk_assessments[0]?.inherent_rating ?? 'N/A',
      r.risk_assessments[0]?.residual_rating ?? 'N/A',
      r.risk_assessments[0]?.control_effectiveness !== null &&
      r.risk_assessments[0]?.control_effectiveness !== undefined
        ? `${String(r.risk_assessments[0].control_effectiveness)}%`
        : 'N/A',
      r.created_at.toISOString().slice(0, 10),
    ]);
  } else if (reportType === 'INCIDENT') {
    domainHeaders = [
      'Incident Code',
      'Title',
      'Severity',
      'Status',
      'Assigned Handler',
      'Detected At',
      'Created Date',
    ];

    const data = await reportExportsRepository.compileIncidentData(safeFilters);
    rawDataForDigest = data;
    dataRows = data.map((inc) => [
      inc.incident_code,
      inc.title,
      inc.severity,
      inc.status,
      inc.users_incidents_created_byTousers?.full_name ?? 'System / Auto-Detected',
      inc.detected_at ? inc.detected_at.toISOString().slice(0, 16).replace('T', ' ') : 'N/A',
      inc.created_at.toISOString().slice(0, 10),
    ]);
  } else {
    domainHeaders = [
      'Metric / Indicator',
      'Current Value',
      'Evaluation Assessment',
      'Standard Benchmark',
    ];

    const posture = await reportExportsRepository.compileSecurityPostureData(safeFilters);
    rawDataForDigest = posture;
    dataRows = [
      ['Security Posture Health Score', `${posture.postureScore} / 100`, posture.postureLevel, '>= 80 (Good)'],
      ['Control Compliance Rate', `${posture.complianceRate}%`, 'Percentage of controls without open findings', '100% Target'],
      ['Total Monitored IT Assets', String(posture.totalAssets), `${posture.criticalAssets} critical / high priority`, 'Continuous asset discovery'],
      ['Open Operational Risks', String(posture.openRisks), `Out of ${posture.totalRisks} evaluated risks`, '< 5 critical open'],
      ['Active Incidents Under Response', String(posture.openIncidents), `Out of ${posture.totalIncidents} total incidents`, 'Zero uncontained critical'],
      ['24h Ingested Security Events', String(posture.totalEvents24h), `Triggered ${posture.totalAlerts24h} AI anomaly alerts`, 'Telemetry streaming active'],
      ['Open Control Weaknesses', String(posture.openFindings), 'Findings requiring remediation', 'Zero overdue findings'],
    ];
  }

  const recordSetSha256 = createHash('sha256')
    .update(JSON.stringify(rawDataForDigest ?? dataRows))
    .digest('hex');

  const csvHeaders = [...metadataHeaders, ...domainHeaders];

  const metadataValues = [
    '2.0.0',
    item.id,
    item.created_at.toISOString(),
    'Asia/Ho_Chi_Minh',
    item.users?.full_name ?? 'Unknown',
    item.users?.email ?? '',
    item.users?.role ?? '',
    'Security Audit & Risk Management',
    reportType,
    JSON.stringify(safeFilters),
    String(dataRows.length),
    recordSetSha256,
  ];

  const csvRows = dataRows.map((domainRow) =>
    [...metadataValues, ...domainRow].map(csvCell).join(','),
  );

  return `\uFEFF${csvHeaders.map(csvCell).join(',')}\r\n${csvRows.length > 0 ? csvRows.join('\r\n') : ''}`;
}

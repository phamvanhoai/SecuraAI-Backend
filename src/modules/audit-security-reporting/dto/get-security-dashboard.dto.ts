import { z } from 'zod';

export const riskDistributionItemSchema = z.object({
  rating: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  count: z.number().int().nonnegative(),
  percentage: z.number().nonnegative(),
});

export const securityIndicatorsSchema = z.object({
  totalAssets: z.number().int().nonnegative(),
  criticalAssets: z.number().int().nonnegative(),
  activeEventSources: z.number().int().nonnegative(),
  totalSecurityControls: z.number().int().nonnegative(),
});

export const riskMetricsSchema = z.object({
  totalRisks: z.number().int().nonnegative(),
  openRisks: z.number().int().nonnegative(),
  criticalRisks: z.number().int().nonnegative(),
  highRisks: z.number().int().nonnegative(),
  mediumRisks: z.number().int().nonnegative(),
  lowRisks: z.number().int().nonnegative(),
  pendingReassessments: z.number().int().nonnegative(),
  riskDistribution: z.array(riskDistributionItemSchema),
});

export const incidentStatisticsSchema = z.object({
  totalIncidents: z.number().int().nonnegative(),
  openIncidents: z.number().int().nonnegative(),
  inProgressIncidents: z.number().int().nonnegative(),
  resolvedIncidents: z.number().int().nonnegative(),
  criticalIncidents: z.number().int().nonnegative(),
});

export const anomalyAlertMetricsSchema = z.object({
  totalEvents24h: z.number().int().nonnegative(),
  totalAlerts24h: z.number().int().nonnegative(),
  newAlerts24h: z.number().int().nonnegative(),
  reviewingAlerts24h: z.number().int().nonnegative(),
  confirmedIncidents24h: z.number().int().nonnegative(),
});

export const recentAlertSchema = z.object({
  id: z.string().uuid(),
  severity: z.string(),
  status: z.string(),
  detectionType: z.string().optional(),
  generatedAt: z.string(),
});

export const operationalDetailsSchema = z.object({
  recentAlerts: z.array(recentAlertSchema),
  recentIncidents: z.array(
    z.object({
      id: z.string().uuid(),
      incidentCode: z.string(),
      title: z.string(),
      severity: z.string(),
      status: z.string(),
      detectedAt: z.string().nullable(),
    }),
  ),
  highRiskAssets: z.array(
    z.object({
      id: z.string().uuid(),
      assetCode: z.string(),
      name: z.string(),
      criticality: z.string(),
      status: z.string(),
      openRisksCount: z.number().int().nonnegative(),
      activeIncidentsCount: z.number().int().nonnegative(),
    }),
  ),
  openControlWeaknessesCount: z.number().int().nonnegative(),
});

export const executiveSummarySchema = z.object({
  postureScore: z.number().min(0).max(100),
  postureLevel: z.enum(['STRONG', 'ADEQUATE', 'NEEDS_ATTENTION', 'CRITICAL']),
  complianceRate: z.number().min(0).max(100),
  strategicHighlights: z.array(z.string()),
});

export const securityDashboardResponseSchema = z.object({
  userRole: z.enum(['SECURITY_OFFICER', 'EXECUTIVE']),
  securityIndicators: securityIndicatorsSchema,
  riskMetrics: riskMetricsSchema,
  incidentStatistics: incidentStatisticsSchema,
  aiAlertMetrics: anomalyAlertMetricsSchema,
  operationalDetails: operationalDetailsSchema.optional(),
  executiveSummary: executiveSummarySchema.optional(),
});

export type SecurityDashboardResponse = z.infer<typeof securityDashboardResponseSchema>;
export type SecurityIndicators = z.infer<typeof securityIndicatorsSchema>;
export type RiskMetrics = z.infer<typeof riskMetricsSchema>;
export type IncidentStatistics = z.infer<typeof incidentStatisticsSchema>;
export type AnomalyAlertMetrics = z.infer<typeof anomalyAlertMetricsSchema>;
export type OperationalDetails = z.infer<typeof operationalDetailsSchema>;
export type ExecutiveSummary = z.infer<typeof executiveSummarySchema>;

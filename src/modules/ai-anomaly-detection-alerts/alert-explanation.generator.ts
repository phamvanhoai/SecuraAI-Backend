import { logger } from '../../config/logger.js';
import { ollamaClient, type GeneratedAlertExplanation } from './ollama.client.js';

export interface StoredAlertExplanationInput {
  anomalyScore: number;
  threshold: number;
  suggestedRiskLevel: string | null;
  detectedAt: Date;
  featureContributions: Array<{
    featureName: string;
    featureValue: string | null;
    contributionScore: number | null;
    rank: number | null;
  }>;
  eventId: string;
}

function fallbackExplanation(input: StoredAlertExplanationInput): string {
  const read = (name: string): unknown => {
    try {
      return JSON.parse(
        input.featureContributions.find((f) => f.featureName === name)?.featureValue ?? 'null',
      ) as unknown;
    } catch {
      return null;
    }
  };
  const record = (name: string): Record<string, unknown> => {
    const value = read(name);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  };
  const ruleNames: Record<string, string> = {
    AUTH_FAILURE_BURST: 'Repeated failed sign-ins were detected.',
    AUTH_SUCCESS_AFTER_FAILURE: 'A successful sign-in followed repeated failed attempts.',
    APP_DENIAL_BURST: 'Repeated denied access to an application was detected.',
    APP_SUCCESS_AFTER_DENIAL: 'Successful application access followed repeated denials.',
    VPN_SSO_FAILURE_BURST: 'Repeated failed VPN or SSO sign-ins were detected.',
    VPN_SSO_NEW_CONTEXT_OFF_HOURS:
      'Successful VPN or SSO access used a new IP address or device outside working hours.',
  };
  const rawRules = read('matched_rules');
  const rules = Array.isArray(rawRules)
    ? rawRules.filter((r): r is string => typeof r === 'string')
    : [];
  const score = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 1 }).format(
    input.anomalyScore,
  );
  const threshold = new Intl.NumberFormat('en', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(input.threshold);
  const sections = [
    rules.length
      ? rules
          .map((rule) => ruleNames[rule] ?? 'A configured detection rule matched this activity.')
          .join(' ')
      : 'The detection score met the configured threshold.',
  ];
  const statistical = record('statistical_baseline');
  if (statistical.method === 'empirical-history-v1') {
    return `The current activity was compared with ${String(statistical.activeWindows)} previous active ${String(statistical.windowMinutes)}-minute windows for the same account/source and event family.\n\nHistorical anomaly score: ${score}. This is an adjusted empirical rarity score, not attack probability. It reached the configured threshold of ${threshold}.\n\nReview the historical comparison below for the observed values, reference sample sizes and equally or more unusual observations. No fixed rule points or severity bonuses are added. Confirm whether this activity was expected before taking action.`;
  }
  const failures = record('failure_count_in_window');
  if (
    typeof failures.count === 'number' &&
    failures.count > 0 &&
    typeof failures.windowMinutes === 'number'
  )
    sections.push(
      String(failures.count) +
        ' failed attempts were recorded within ' +
        String(failures.windowMinutes) +
        ' minutes.',
    );
  const baseline = record('baseline_context');
  if (
    baseline.ready === true &&
    baseline.newIp === true &&
    typeof baseline.successfulEvents === 'number'
  )
    sections.push(
      'The IP address was not seen in ' +
        String(baseline.successfulEvents) +
        ' previous successful events.',
    );
  if (baseline.ready === true && baseline.newDevice === true)
    sections.push('The device was not seen in the available successful activity history.');
  const hours = record('working_hours');
  if (
    hours.offHours === true &&
    typeof hours.localHour === 'number' &&
    typeof hours.timeZone === 'string'
  )
    sections.push(
      'The event occurred during hour ' +
        String(hours.localHour).padStart(2, '0') +
        ':00 in ' +
        hours.timeZone +
        ', outside configured working hours.',
    );
  sections.push(
    'Priority score: ' +
      score +
      (input.suggestedRiskLevel ? ' (' + input.suggestedRiskLevel + ').' : '.') +
      ' This is a signal-strength score, not attack probability.',
  );
  sections.push(
    input.anomalyScore >= input.threshold
      ? `The detection score ${score} met the configured threshold ${threshold}. Rules provide scoring evidence; they do not bypass this threshold.`
      : `This historical alert has a score of ${score}, below its recorded threshold ${threshold}. It predates the current threshold-only policy; new events below threshold do not create alerts.`,
  );
  sections.push(
    'Review the related activity and confirm whether the access was expected before taking action.',
  );
  return sections.join('\n\n');
}

function formatGeneratedExplanation(explanation: GeneratedAlertExplanation): string {
  const sections = [explanation.summary];
  if (explanation.observations.length > 0) {
    sections.push(`Observations: ${explanation.observations.join('; ')}`);
  }
  if (explanation.recommendedActions.length > 0) {
    sections.push(`Recommended actions: ${explanation.recommendedActions.join('; ')}`);
  }
  return sections.join('\n');
}

export async function generateStoredAlertExplanation(
  input: StoredAlertExplanationInput,
  options?: { timeoutMs: number },
): Promise<string> {
  if (options && options.timeoutMs <= 0) return fallbackExplanation(input);
  try {
    const generated = await ollamaClient.generateAlertExplanation(input, options);
    return generated ? formatGeneratedExplanation(generated) : fallbackExplanation(input);
  } catch (error: unknown) {
    logger.warn(
      {
        error: error instanceof Error ? error.message : 'Unknown Ollama error',
        eventId: input.eventId,
      },
      'Ollama alert explanation generation failed; storing deterministic fallback',
    );
    return fallbackExplanation(input);
  }
}

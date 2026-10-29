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
  const levelText = input.suggestedRiskLevel
    ? ` The suggested risk level is ${input.suggestedRiskLevel}.`
    : '';
  const strongestFactor = input.featureContributions[0]?.featureName;
  const factorText = strongestFactor
    ? ` The strongest recorded factor is ${strongestFactor}.`
    : ' No individual feature contributions were recorded.';
  const rules = input.featureContributions.find(
    (item) => item.featureName === 'matched_rules',
  )?.featureValue;
  if (rules && rules !== '[]') {
    return `Detection rule matched: ${rules}. The signal score is ${input.anomalyScore.toFixed(4)}; rule-based detection is independent of the behavioral threshold ${input.threshold.toFixed(4)}.${levelText} Evidence: ${input.featureContributions
      .filter((item) => !['detection_group', 'engine_version'].includes(item.featureName))
      .map((item) => `${item.featureName}: ${item.featureValue ?? 'not recorded'}`)
      .join('; ')}`;
  }
  return `The anomaly score ${input.anomalyScore.toFixed(4)} met the model threshold ${input.threshold.toFixed(4)}.${levelText}${factorText}`;
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
): Promise<string> {
  try {
    const generated = await ollamaClient.generateAlertExplanation(input);
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

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
    rank: number | null;
  }>;
  eventId: string;
}

// Build deterministic analyst text when Ollama cannot provide an explanation.
function fallbackExplanation(input: StoredAlertExplanationInput): string {
  const score = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 1 }).format(
    input.anomalyScore,
  );
  const threshold = new Intl.NumberFormat('en', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(input.threshold);
  return [
    'The ML/LLM detection pipeline classified this event as malicious.',
    `Diagnostic evidence score: ${score}${input.suggestedRiskLevel ? ` (${input.suggestedRiskLevel})` : ''}. This is not attack probability.`,
    `The configured model or Asset threshold used for ML escalation was ${threshold}. The final alert decision came from the LLM MALICIOUS verdict, not from the LLM score.`,
    'Review the stored ML prediction, LLM classification and related events before taking action.',
  ].join('\n\n');
}

// Convert the validated Ollama JSON structure into stored plain text.
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

// Generate explanation text and fall back safely when the optional model fails.
export async function generateStoredAlertExplanation(
  input: StoredAlertExplanationInput,
  options?: { timeoutMs: number },
): Promise<string> {
  // Ollama writes prose only; fallback text keeps alert creation independent of it.
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

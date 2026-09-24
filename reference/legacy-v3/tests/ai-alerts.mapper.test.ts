import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { toAlertResponse } from '../src/modules/ai-alerts/ai-alerts.mapper.js';
import type { AlertRecord } from '../src/modules/ai-alerts/ai-alerts.repository.js';

const alert: AlertRecord = {
  ai_alert_id: 'alert-id',
  alert_code: 'AI-001',
  anomaly_score: new Prisma.Decimal('0.92'),
  risk_score: new Prisma.Decimal('8.5'),
  risk_level: 'high',
  title: 'Unusual activity',
  description: null,
  status: 'new',
  detected_at: new Date('2026-09-11T03:00:00Z'),
  created_at: new Date('2026-09-11T03:00:00Z'),
  assets: null,
  log_sources: { log_source_id: 'source-id', name: 'Authentication', source_type: 'authentication' },
  ai_model_versions: { ai_model_version_id: 'model-id', model_name: 'Detector', version: '1', provider: null },
  security_events: { security_event_id: 'event-id', event_type: 'login', event_time: new Date('2026-09-11T03:00:00Z') },
};

describe('AI alert response mapping', () => {
  it('exposes the stored AI-suggested risk values', () => {
    expect(toAlertResponse(alert)).toMatchObject({ riskScore: 8.5, riskLevel: 'high' });
  });

  it('preserves missing AI risk suggestions as null', () => {
    expect(toAlertResponse({ ...alert, risk_score: null, risk_level: null })).toMatchObject({
      riskScore: null,
      riskLevel: null,
    });
  });
});

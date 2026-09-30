import { describe, expect, it } from 'vitest';
import {
  updateEventSourceParamsSchema,
  updateEventSourceSchema,
} from '../src/modules/event-ingestion/dto/update-event-source.dto.js';

describe('updateEventSourceParamsSchema', () => {
  it('accepts valid UUID parameter', () => {
    const validUuid = '3a9bf33a-02db-48e4-a8ad-90517278d7f2';
    const result = updateEventSourceParamsSchema.safeParse({ id: validUuid });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(validUuid);
    }
  });

  it('rejects invalid UUID parameter', () => {
    const result = updateEventSourceParamsSchema.safeParse({ id: 'not-a-valid-uuid' });
    expect(result.success).toBe(false);
  });
});

describe('updateEventSourceSchema', () => {
  it('accepts partial update with name only', () => {
    const result = updateEventSourceSchema.safeParse({
      name: 'Updated Wazuh Manager',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Updated Wazuh Manager');
    }
  });

  it('accepts complete valid update payload', () => {
    const result = updateEventSourceSchema.safeParse({
      name: 'Wazuh SIEM Cluster',
      endpoint: 'https://wazuh-cluster.internal:55000',
      ingestionMethod: 'API',
      authenticationType: 'API_KEY',
      status: 'INACTIVE',
      description: 'Updated operational notes for SIEM cluster',
      eventFamilies: ['AUTHENTICATION', 'APPLICATION_ACCESS'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects update payload with empty object (no fields)', () => {
    const result = updateEventSourceSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects empty string name', () => {
    const result = updateEventSourceSchema.safeParse({
      name: '   ',
    });
    expect(result.success).toBe(false);
  });

  it('rejects API method when endpoint is explicitly empty', () => {
    const result = updateEventSourceSchema.safeParse({
      ingestionMethod: 'API',
      endpoint: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty event families array', () => {
    const result = updateEventSourceSchema.safeParse({
      eventFamilies: [],
    });
    expect(result.success).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { updateNotificationPreferencesSchema } from '../src/modules/notification-system-logs/dto/update-notification-preferences.dto.js';

describe('update notification preferences DTO', () => {
  it('accepts supported channels when at least one is enabled', () => {
    expect(
      updateNotificationPreferencesSchema.parse({
        channels: { inSystem: true, email: false },
      }),
    ).toEqual({ channels: { inSystem: true, email: false } });
  });

  it.each([
    { channels: { inSystem: false, email: false } },
    { channels: { inSystem: true } },
    { channels: { inSystem: true, email: true, sms: true } },
  ])('rejects unsupported or unusable preferences %#', (input) => {
    expect(updateNotificationPreferencesSchema.safeParse(input).success).toBe(false);
  });
});

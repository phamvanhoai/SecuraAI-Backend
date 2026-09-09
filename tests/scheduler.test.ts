import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  startScheduler,
  stopScheduler,
  getSchedulerStatus,
  runSchedulerTick,
} from '@/modules/integrations/scheduler.js';
import { integrationsService } from '@/modules/integrations/integrations.service.js';

vi.mock('@/modules/integrations/integrations.service.js', () => ({
  integrationsService: {
    processDueSyncSchedules: vi.fn(),
  },
}));

describe('In-Process Synchronization Scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopScheduler();
  });

  afterEach(() => {
    stopScheduler();
  });

  it('starts and stops scheduler lifecycle cleanly', () => {
    expect(getSchedulerStatus().isRunning).toBe(false);

    startScheduler(60000);
    expect(getSchedulerStatus().isRunning).toBe(true);

    stopScheduler();
    expect(getSchedulerStatus().isRunning).toBe(false);
  });

  it('executes tick and calls processDueSyncSchedules', async () => {
    vi.mocked(integrationsService.processDueSyncSchedules).mockResolvedValue();

    await runSchedulerTick();

    expect(integrationsService.processDueSyncSchedules).toHaveBeenCalledTimes(1);
    expect(getSchedulerStatus().isProcessing).toBe(false);
  });

  it('resets isProcessing to false even when processDueSyncSchedules throws an exception', async () => {
    vi.mocked(integrationsService.processDueSyncSchedules).mockRejectedValue(
      new Error('Database connectivity glitch'),
    );

    await runSchedulerTick();

    expect(integrationsService.processDueSyncSchedules).toHaveBeenCalledTimes(1);
    // Crucial: scheduler must not deadlock; isProcessing must be false
    expect(getSchedulerStatus().isProcessing).toBe(false);
  });
});

import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { toLogSourceResponse } from './security-monitoring.mapper.js';
import { securityMonitoringRepository } from './security-monitoring.repository.js';
import type {
  CreateLogSourceBody,
  ListLogSourcesQuery,
  UpdateLogSourceBody,
} from './dto/log-source.dto.js';
import type { IngestSecurityEventsBody } from './dto/security-event.dto.js';
import { normalizeSecurityEvents } from './security-event.normalizer.js';
import { aiAlertsService } from '../ai-alerts/index.js';

type Actor = { userId: string; permissions: readonly string[] };
type RequestContext = { ipAddress: string | null; userAgent: string | null };

const requirePermission = (actor: Actor, permission: string): void => {
  if (!actor.permissions.includes(permission)) {
    throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
  }
};

const validateRelations = async (
  input: Pick<CreateLogSourceBody, 'assetId' | 'integrationId'>,
): Promise<void> => {
  if (input.assetId) {
    const asset = await securityMonitoringRepository.findActiveAsset(input.assetId);
    if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset was not found or is unusable');
  }
  if (input.integrationId) {
    const integration = await securityMonitoringRepository.findUsableIntegration(
      input.integrationId,
    );
    if (!integration) {
      throw new AppError(404, 'INTEGRATION_NOT_FOUND', 'Integration was not found or is disabled');
    }
  }
};

export const securityMonitoringService = {
  async listLogSources(query: ListLogSourcesQuery, actor: Actor) {
    requirePermission(actor, 'log-sources.read');
    const result = await securityMonitoringRepository.listLogSources(query);
    return {
      items: result.items.map(toLogSourceResponse),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  },

  async createLogSource(input: CreateLogSourceBody, actor: Actor, context: RequestContext) {
    requirePermission(actor, 'log-sources.manage');
    await validateRelations(input);
    const source = await securityMonitoringRepository.createLogSource(input, {
      actorUserId: actor.userId,
      ...context,
    });
    return toLogSourceResponse(source);
  },

  async updateLogSource(
    logSourceId: string,
    input: UpdateLogSourceBody,
    actor: Actor,
    context: RequestContext,
  ) {
    requirePermission(actor, 'log-sources.manage');
    await validateRelations(input);
    const source = await securityMonitoringRepository.updateLogSource(logSourceId, input, {
      actorUserId: actor.userId,
      ...context,
    });
    if (!source) throw new AppError(404, 'LOG_SOURCE_NOT_FOUND', 'Log source was not found');
    return toLogSourceResponse(source);
  },

  async deleteLogSource(logSourceId: string, actor: Actor, context: RequestContext): Promise<void> {
    requirePermission(actor, 'log-sources.manage');
    try {
      const result = await securityMonitoringRepository.deleteLogSource(logSourceId, {
        actorUserId: actor.userId,
        ...context,
      });
      if (result.kind === 'not_found') {
        throw new AppError(404, 'LOG_SOURCE_NOT_FOUND', 'Log source was not found');
      }
      if (result.kind === 'blocked') {
        throw new AppError(
          409,
          'LOG_SOURCE_HAS_DEPENDENCIES',
          'Log source has security events or alerts and cannot be deleted',
          result.dependencies,
        );
      }
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new AppError(
          409,
          'LOG_SOURCE_HAS_DEPENDENCIES',
          'Log source has dependent records and cannot be deleted',
        );
      }
      throw error;
    }
  },

  async ingestSecurityEvents(
    logSourceId: string,
    input: IngestSecurityEventsBody,
    actor: Actor,
    context: RequestContext,
  ) {
    requirePermission(actor, 'security-events.ingest');
    const source = await securityMonitoringRepository.findLogSourceForIngestion(logSourceId);
    if (!source) throw new AppError(404, 'LOG_SOURCE_NOT_FOUND', 'Log source was not found');
    if (source.status !== 'active') {
      throw new AppError(409, 'LOG_SOURCE_INACTIVE', 'Log source is not active');
    }
    const events = normalizeSecurityEvents(input, source.configuration);
    const result = await securityMonitoringRepository.ingestSecurityEvents(logSourceId, events, {
      actorUserId: actor.userId,
      ...context,
    });
    if (!result) throw new AppError(409, 'LOG_SOURCE_INACTIVE', 'Log source is not active');
    const detection = await aiAlertsService.detectAlertsForEvents(result.eventsForDetection, {
      actorUserId: actor.userId,
      ...context,
    });
    return {
      received: input.events.length,
      ingested: result.ingested,
      duplicates: result.duplicates,
      alertsCreated: detection.alertsCreated,
    };
  },
};

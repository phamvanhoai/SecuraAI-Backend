import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AppError } from '../../common/errors/app-error.js';
import {
  toAlertFeedbackResponse,
  toAlertConfirmationResponse,
  toAlertResponse,
  toModelConfigurationResponse,
} from './ai-alerts.mapper.js';
import { aiAlertsRepository } from './ai-alerts.repository.js';
import type {
  CreateModelConfigurationBody,
  ListModelConfigurationsQuery,
} from './dto/model-configuration.dto.js';
import type { ListAlertsQuery } from './dto/alert-query.dto.js';
import { modelParametersSchema } from './dto/model-configuration.dto.js';
import type { DetectionEvent } from './ai-alerts.repository.js';
import type {
  EvaluateAlertReliabilityBody,
  ListAlertFeedbackQuery,
} from './dto/alert-feedback.dto.js';
import type { ConfirmAlertBody } from './dto/confirm-alert.dto.js';
import type { FalsePositiveBody } from './dto/false-positive.dto.js';

type Actor = { userId: string; permissions: readonly string[] };
type RequestContext = { ipAddress: string | null; userAgent: string | null };
type InternalRequestContext = RequestContext & { actorUserId: string };

const requirePermission = (actor: Actor, permission: string): void => {
  if (!actor.permissions.includes(permission)) {
    throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
  }
};

const alertCodeFor = (eventId: string, modelVersionId: string, ruleId: string): string =>
  `AI-${createHash('sha256')
    .update(`${eventId}:${modelVersionId}:${ruleId}`)
    .digest('hex')
    .slice(0, 40)}`;

export const aiAlertsService = {
  async markFalsePositive(
    alertId: string,
    input: FalsePositiveBody,
    actor: Actor,
    context: RequestContext,
  ) {
    requirePermission(actor, 'ai-alerts.mark-false-positive');
    const result = await aiAlertsRepository.markFalsePositive(alertId, input, {
      actorUserId: actor.userId,
      ...context,
    });
    if (result.kind === 'not_found')
      throw new AppError(404, 'AI_ALERT_NOT_FOUND', 'AI alert was not found');
    if (result.kind === 'invalid_status') {
      throw new AppError(
        409,
        'AI_ALERT_STATUS_CONFLICT',
        'Alert cannot be marked false positive in its current status',
      );
    }
    return { ...toAlertConfirmationResponse(result.alert), changed: result.kind === 'marked' };
  },
  async confirmAlertAsIncident(
    alertId: string,
    input: ConfirmAlertBody,
    actor: Actor,
    context: RequestContext,
  ) {
    requirePermission(actor, 'ai-alerts.confirm');
    const result = await aiAlertsRepository.confirmAlertAsIncident(alertId, input, {
      actorUserId: actor.userId,
      ...context,
    });
    if (result.kind === 'not_found') {
      throw new AppError(404, 'AI_ALERT_NOT_FOUND', 'AI alert was not found');
    }
    if (result.kind === 'invalid_status') {
      throw new AppError(
        409,
        'AI_ALERT_STATUS_CONFLICT',
        `An alert with status "${result.status}" cannot be confirmed as an incident`,
      );
    }
    return {
      ...toAlertConfirmationResponse(result.alert),
      changed: result.kind === 'confirmed',
    };
  },

  async evaluateAlertReliability(
    alertId: string,
    input: EvaluateAlertReliabilityBody,
    actor: Actor,
    context: RequestContext,
  ) {
    requirePermission(actor, 'ai-alerts.feedback');
    const feedback = await aiAlertsRepository.evaluateAlertReliability(alertId, input, {
      actorUserId: actor.userId,
      ...context,
    });
    if (!feedback) throw new AppError(404, 'AI_ALERT_NOT_FOUND', 'AI alert was not found');
    return toAlertFeedbackResponse(feedback);
  },

  async listAlertFeedback(alertId: string, query: ListAlertFeedbackQuery, actor: Actor) {
    requirePermission(actor, 'ai-alerts.feedback');
    const result = await aiAlertsRepository.listAlertFeedback(alertId, query);
    if (!result.exists) throw new AppError(404, 'AI_ALERT_NOT_FOUND', 'AI alert was not found');
    return {
      items: result.items.map(toAlertFeedbackResponse),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  },

  async listAlerts(query: ListAlertsQuery, actor: Actor) {
    requirePermission(actor, 'ai-alerts.read');
    const serverTime = new Date();
    const result = await aiAlertsRepository.listAlerts(query);
    return {
      items: result.items.map(toAlertResponse),
      serverTime,
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  },

  async detectAlertsForEvents(
    events: DetectionEvent[],
    context: InternalRequestContext,
  ): Promise<{ alertsCreated: number }> {
    if (events.length === 0) return { alertsCreated: 0 };
    const models = await aiAlertsRepository.findActiveDetectionModels();
    let alertsCreated = 0;

    for (const model of models) {
      const parameters = modelParametersSchema.safeParse(model.parameters);
      if (!parameters.success) continue;
      for (const event of events) {
        const rules = parameters.data.rules.filter(
          (rule) => rule.enabled && rule.eventType === event.eventType,
        );
        for (const rule of rules) {
          const count = await aiAlertsRepository.countMatchingEvents(
            event,
            rule.windowSeconds,
            rule.groupBy,
          );
          if (count < rule.threshold) continue;
          try {
            const alert = await aiAlertsRepository.createAlertIfMissing(
              {
                alertCode: alertCodeFor(event.id, model.ai_model_version_id, rule.id),
                securityEventId: event.id,
                logSourceId: event.logSourceId,
                assetId: event.assetId,
                modelVersionId: model.ai_model_version_id,
                ruleId: rule.id,
                title: rule.name,
                description: `[rule:${rule.id}] Detected ${count} ${event.eventType} events within ${rule.windowSeconds} seconds.`,
                anomalyScore: Math.min(1, count / rule.threshold),
              },
              context,
            );
            if (alert) alertsCreated += 1;
          } catch (error: unknown) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
              continue;
            }
            throw error;
          }
        }
      }
    }
    return { alertsCreated };
  },

  async listModelConfigurations(query: ListModelConfigurationsQuery, actor: Actor) {
    requirePermission(actor, 'ai-models.read');
    const result = await aiAlertsRepository.listModelConfigurations(query);
    return {
      items: result.items.map(toModelConfigurationResponse),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  },

  async createModelConfiguration(
    input: CreateModelConfigurationBody,
    actor: Actor,
    context: RequestContext,
  ) {
    requirePermission(actor, 'ai-models.manage');
    try {
      const model = await aiAlertsRepository.createModelConfiguration(input, {
        actorUserId: actor.userId,
        ...context,
      });
      return toModelConfigurationResponse(model);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(409, 'MODEL_VERSION_EXISTS', 'Model name and version already exist');
      }
      throw error;
    }
  },

  async activateModelConfiguration(modelVersionId: string, actor: Actor, context: RequestContext) {
    requirePermission(actor, 'ai-models.manage');
    const model = await aiAlertsRepository.activateModelConfiguration(modelVersionId, {
      actorUserId: actor.userId,
      ...context,
    });
    if (!model) throw new AppError(404, 'MODEL_VERSION_NOT_FOUND', 'Model version was not found');
    return toModelConfigurationResponse(model);
  },
};

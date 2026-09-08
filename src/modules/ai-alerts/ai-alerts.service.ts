import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { toModelConfigurationResponse } from './ai-alerts.mapper.js';
import { aiAlertsRepository } from './ai-alerts.repository.js';
import type {
  CreateModelConfigurationBody,
  ListModelConfigurationsQuery,
} from './dto/model-configuration.dto.js';

type Actor = { userId: string; permissions: readonly string[] };
type RequestContext = { ipAddress: string | null; userAgent: string | null };

const requirePermission = (actor: Actor, permission: string): void => {
  if (!actor.permissions.includes(permission)) {
    throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
  }
};

export const aiAlertsService = {
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

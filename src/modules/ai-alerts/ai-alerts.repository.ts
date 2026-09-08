import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type {
  CreateModelConfigurationBody,
  ListModelConfigurationsQuery,
} from './dto/model-configuration.dto.js';

export const modelConfigurationSelect = {
  ai_model_version_id: true,
  model_name: true,
  algorithm: true,
  version: true,
  provider: true,
  model_path: true,
  parameters: true,
  is_active: true,
  created_at: true,
} satisfies Prisma.ai_model_versionsSelect;

export type ModelConfigurationRecord = Prisma.ai_model_versionsGetPayload<{
  select: typeof modelConfigurationSelect;
}>;

type RequestContext = {
  actorUserId: string;
  ipAddress: string | null;
  userAgent: string | null;
};

const toParametersJson = (input: CreateModelConfigurationBody): Prisma.InputJsonObject => ({
  ollamaModel: input.ollamaModel,
  rules: input.rules.map((rule) => ({ ...rule })),
});

export const aiAlertsRepository = {
  async listModelConfigurations(
    query: ListModelConfigurationsQuery,
  ): Promise<{ items: ModelConfigurationRecord[]; total: number }> {
    const where: Prisma.ai_model_versionsWhereInput = {
      ...(query.modelName !== undefined && { model_name: query.modelName }),
      ...(query.active !== undefined && { is_active: query.active }),
    };
    const [total, items] = await prisma.$transaction([
      prisma.ai_model_versions.count({ where }),
      prisma.ai_model_versions.findMany({
        where,
        select: modelConfigurationSelect,
        orderBy: [{ created_at: 'desc' }, { ai_model_version_id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return { items, total };
  },

  createModelConfiguration(
    input: CreateModelConfigurationBody,
    context: RequestContext,
  ): Promise<ModelConfigurationRecord> {
    return prisma.$transaction(async (transaction) => {
      const model = await transaction.ai_model_versions.create({
        data: {
          model_name: input.modelName,
          algorithm: input.algorithm,
          version: input.version,
          provider: input.provider,
          ...(input.modelPath !== undefined && { model_path: input.modelPath }),
          parameters: toParametersJson(input),
          is_active: false,
        },
        select: modelConfigurationSelect,
      });
      await transaction.audit_logs.create({
        data: {
          actor_user_id: context.actorUserId,
          module: 'ai-alerts',
          action: 'ai_model_configuration.created',
          entity_type: 'ai_model_version',
          entity_id: model.ai_model_version_id,
          after_data: {
            modelName: model.model_name,
            algorithm: model.algorithm,
            version: model.version,
            provider: model.provider,
            parameters: toParametersJson(input),
            active: false,
          },
          ip_address: context.ipAddress,
          user_agent: context.userAgent,
        },
      });
      return model;
    });
  },

  activateModelConfiguration(
    modelVersionId: string,
    context: RequestContext,
  ): Promise<ModelConfigurationRecord | null> {
    return prisma.$transaction(
      async (transaction) => {
        const target = await transaction.ai_model_versions.findUnique({
          where: { ai_model_version_id: modelVersionId },
          select: modelConfigurationSelect,
        });
        if (!target) return null;
        await transaction.ai_model_versions.updateMany({
          where: { model_name: target.model_name, is_active: true },
          data: { is_active: false },
        });
        const activated = await transaction.ai_model_versions.update({
          where: { ai_model_version_id: modelVersionId },
          data: { is_active: true },
          select: modelConfigurationSelect,
        });
        await transaction.audit_logs.create({
          data: {
            actor_user_id: context.actorUserId,
            module: 'ai-alerts',
            action: 'ai_model_configuration.activated',
            entity_type: 'ai_model_version',
            entity_id: modelVersionId,
            before_data: { active: target.is_active },
            after_data: { active: true },
            ip_address: context.ipAddress,
            user_agent: context.userAgent,
          },
        });
        return activated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  },
};

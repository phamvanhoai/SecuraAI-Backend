import { AppError } from '../../common/errors/app-error.js';
import { executeSafeHttpRequest, validateExternalUrl } from '../../common/utils/ssrf-validator.js';
import { integrationsRepository } from './integrations.repository.js';
import { toIntegrationResponseDto, type IntegrationResponseDto } from './integrations.mapper.js';
import type {
  CreateIntegrationDto,
  QueryIntegrationsDto,
  TestConnectionDto,
  UpdateIntegrationDto,
} from './dto/index.js';
import type { Prisma } from '@prisma/client';

export type TestConnectionResult = {
  connected: boolean;
  statusCode: number | null;
  latencyMs: number;
  message: string;
};

export const integrationsService = {
  async createIntegration(dto: CreateIntegrationDto, userId?: string): Promise<IntegrationResponseDto> {
    if (dto.baseUrl) {
      await validateExternalUrl(dto.baseUrl);
    }

    const created = await integrationsRepository.create({
      name: dto.name,
      integration_type: dto.integrationType,
      base_url: dto.baseUrl,
      configuration: dto.configuration as Prisma.InputJsonValue | undefined,
      created_by_user_id: userId,
      status: 'inactive',
    });

    await integrationsRepository.createLog({
      integration_id: created.integration_id,
      level: 'info',
      message: `Integration "${created.name}" created (${created.integration_type})`,
    });

    return toIntegrationResponseDto(created);
  },

  async listIntegrations(query: QueryIntegrationsDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = {
      type: query.type,
      status: query.status,
      search: query.search,
    };

    const [items, total] = await Promise.all([
      integrationsRepository.findMany({
        skip,
        take: limit,
        ...filter,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      }),
      integrationsRepository.count(filter),
    ]);

    return {
      items: items.map(toIntegrationResponseDto),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async getIntegrationById(id: string): Promise<IntegrationResponseDto> {
    const record = await integrationsRepository.findById(id);
    if (!record) {
      throw new AppError(404, 'INTEGRATION_NOT_FOUND', `Integration with ID "${id}" was not found`);
    }
    return toIntegrationResponseDto(record);
  },

  async updateIntegration(id: string, dto: UpdateIntegrationDto): Promise<IntegrationResponseDto> {
    const existing = await integrationsRepository.findById(id);
    if (!existing) {
      throw new AppError(404, 'INTEGRATION_NOT_FOUND', `Integration with ID "${id}" was not found`);
    }

    if (dto.baseUrl) {
      await validateExternalUrl(dto.baseUrl);
    }

    const updated = await integrationsRepository.update(id, {
      name: dto.name,
      base_url: dto.baseUrl,
      configuration: dto.configuration as Prisma.InputJsonValue | undefined,
      status: dto.status,
    });

    await integrationsRepository.createLog({
      integration_id: id,
      level: 'info',
      message: `Integration configuration updated`,
    });

    return toIntegrationResponseDto(updated);
  },

  async testConnection(id: string, dto: TestConnectionDto): Promise<TestConnectionResult> {
    const integration = await integrationsRepository.findById(id);
    if (!integration) {
      throw new AppError(404, 'INTEGRATION_NOT_FOUND', `Integration with ID "${id}" was not found`);
    }

    if (!integration.base_url) {
      throw new AppError(
        400,
        'NO_ENDPOINT_CONFIGURED',
        'Cannot test connection: No base URL configured for this integration',
      );
    }

    const startTime = Date.now();
    try {
      const res = await executeSafeHttpRequest({
        url: integration.base_url,
        method: 'GET',
        timeoutMs: dto.timeoutMs,
      });

      if (res.ok) {
        await integrationsRepository.update(id, {
          status: 'active',
          last_connected_at: new Date(),
        });

        await integrationsRepository.createLog({
          integration_id: id,
          level: 'info',
          message: `Connection test succeeded with status ${res.statusCode} (${res.latencyMs}ms)`,
          details: { statusCode: res.statusCode, latencyMs: res.latencyMs },
        });

        return {
          connected: true,
          statusCode: res.statusCode,
          latencyMs: res.latencyMs,
          message: 'Connection established successfully',
        };
      }

      // External server returned non-2xx status
      await integrationsRepository.update(id, {
        status: 'error',
      });

      await integrationsRepository.createLog({
        integration_id: id,
        level: 'warn',
        message: `Connection test returned HTTP ${res.statusCode} (${res.statusText})`,
        details: { statusCode: res.statusCode, latencyMs: res.latencyMs },
      });

      return {
        connected: false,
        statusCode: res.statusCode,
        latencyMs: res.latencyMs,
        message: `External endpoint responded with HTTP status ${res.statusCode} (${res.statusText || 'Non-success'})`,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : 'Unknown network or socket error';

      await integrationsRepository.update(id, {
        status: 'error',
      });

      await integrationsRepository.createLog({
        integration_id: id,
        level: 'error',
        message: `Connection test failed: ${errorMessage}`,
        details: { error: errorMessage, latencyMs },
      });

      return {
        connected: false,
        statusCode: null,
        latencyMs,
        message: `Connection test failed: ${errorMessage}`,
      };
    }
  },
};

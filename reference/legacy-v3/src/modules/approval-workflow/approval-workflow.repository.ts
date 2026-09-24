import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { QueryWorkflowDefinitionsDto } from './dto/query-workflows.dto.js';
import type { WorkflowDefinitionRecord } from './approval-workflow.mapper.js';

const SORT_FIELD_MAP: Record<QueryWorkflowDefinitionsDto['sortBy'], keyof Prisma.workflow_definitionsOrderByWithRelationInput> = {
  name: 'name',
  entityType: 'entity_type',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  isActive: 'is_active',
};

export const approvalWorkflowRepository = {
  buildWhereClause(query: QueryWorkflowDefinitionsDto): Prisma.workflow_definitionsWhereInput {
    const where: Prisma.workflow_definitionsWhereInput = {};

    if (query.entityType) {
      where.entity_type = query.entityType;
    }

    if (query.isActive !== undefined) {
      where.is_active = query.isActive;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return where;
  },

  async findWorkflowDefinitions(
    query: QueryWorkflowDefinitionsDto,
  ): Promise<WorkflowDefinitionRecord[]> {
    const where = this.buildWhereClause(query);
    const sortField = SORT_FIELD_MAP[query.sortBy];
    const orderBy: Prisma.workflow_definitionsOrderByWithRelationInput = {
      [sortField]: query.sortOrder,
    };

    const skip = (query.page - 1) * query.limit;

    return prisma.workflow_definitions.findMany({
      where,
      orderBy,
      skip,
      take: query.limit,
      select: {
        workflow_definition_id: true,
        name: true,
        description: true,
        entity_type: true,
        is_active: true,
        created_at: true,
        updated_at: true,
        users: {
          select: {
            user_id: true,
            full_name: true,
            email: true,
          },
        },
        _count: {
          select: {
            workflow_steps: true,
          },
        },
      },
    });
  },

  async countWorkflowDefinitions(where: Prisma.workflow_definitionsWhereInput): Promise<number> {
    return prisma.workflow_definitions.count({ where });
  },

  async getWorkflowSummaryCounts(): Promise<{ total: number; active: number; inactive: number }> {
    const [total, active] = await Promise.all([
      prisma.workflow_definitions.count(),
      prisma.workflow_definitions.count({ where: { is_active: true } }),
    ]);

    return {
      total,
      active,
      inactive: total - active,
    };
  },

  async findById(workflowDefinitionId: string): Promise<WorkflowDefinitionRecord | null> {
    return prisma.workflow_definitions.findUnique({
      where: { workflow_definition_id: workflowDefinitionId },
      select: {
        workflow_definition_id: true,
        name: true,
        description: true,
        entity_type: true,
        is_active: true,
        created_at: true,
        updated_at: true,
        users: {
          select: {
            user_id: true,
            full_name: true,
            email: true,
          },
        },
        _count: {
          select: {
            workflow_steps: true,
          },
        },
      },
    });
  },
};

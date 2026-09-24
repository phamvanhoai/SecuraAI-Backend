import { approvalWorkflowRepository } from './approval-workflow.repository.js';
import { approvalWorkflowMapper } from './approval-workflow.mapper.js';
import type {
  QueryWorkflowDefinitionsDto,
  WorkflowDefinitionListResponseDto,
} from './dto/index.js';

export const approvalWorkflowService = {
  async listWorkflowDefinitions(
    query: QueryWorkflowDefinitionsDto,
  ): Promise<WorkflowDefinitionListResponseDto> {
    const where = approvalWorkflowRepository.buildWhereClause(query);

    const [records, filteredTotal, summary] = await Promise.all([
      approvalWorkflowRepository.findWorkflowDefinitions(query),
      approvalWorkflowRepository.countWorkflowDefinitions(where),
      approvalWorkflowRepository.getWorkflowSummaryCounts(),
    ]);

    const items = records.map((record) => approvalWorkflowMapper.toListItemDto(record));
    const totalPages = Math.ceil(filteredTotal / query.limit) || 1;

    return {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total: filteredTotal,
        totalPages,
      },
      summary,
    };
  },
};

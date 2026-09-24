import type { Request, Response } from 'express';
import { approvalWorkflowService } from './approval-workflow.service.js';
import type { QueryWorkflowDefinitionsDto } from './dto/query-workflows.dto.js';

export const approvalWorkflowController = {
  async listWorkflowDefinitions(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as QueryWorkflowDefinitionsDto;
    const result = await approvalWorkflowService.listWorkflowDefinitions(query);
    res.status(200).json({
      success: true,
      data: result,
    });
  },
};

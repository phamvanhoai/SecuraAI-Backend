import type { RequestHandler } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { AppError } from '../../common/errors/app-error.js';
import type { CreatePolicyDraftInput } from './dto/create-policy-draft.dto.js';
import { getPolicyVersionParamsSchema } from './dto/get-policy-version.dto.js';
import { listPublishablePoliciesQuerySchema } from './dto/list-publishable-policies.dto.js';
import {
  listOwnPolicyDraftsQuerySchema,
  policyDraftParamsSchema,
  updatePolicyDraftSchema,
} from './dto/manage-policy-draft.dto.js';
import type { PolicyDraftResponse } from './policy-compliance.mapper.js';
import {
  publishPolicyVersionBodySchema,
  publishPolicyVersionParamsSchema,
} from './dto/publish-policy-version.dto.js';
import {
  updatePolicyCreateVersionBodySchema,
  updatePolicyCreateVersionParamsSchema,
} from './dto/update-policy-create-version.dto.js';
import { policyComplianceService } from './policy-compliance.service.js';
import {
  assignPolicyDepartmentsBodySchema,
  assignPolicyDepartmentsParamsSchema,
  listPolicyDepartmentAssignmentsQuerySchema,
} from './dto/assign-policy-departments.dto.js';
import {
  employeePolicyQuerySchema,
  policyAcknowledgementParamsSchema,
} from './dto/acknowledge-policy.dto.js';
import { policyAcknowledgementService } from './policy-acknowledgement.service.js';

type CreatePolicyDraftResponse = { success: true; data: PolicyDraftResponse };

export const listPolicyDepartmentAssignments: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const query = listPolicyDepartmentAssignmentsQuerySchema.parse(req.query);
  const data = await policyComplianceService.listPolicyDepartmentAssignments(query, req.auth);
  res.status(200).json({ success: true, data });
};

export const assignPolicyDepartments: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { policyId } = assignPolicyDepartmentsParamsSchema.parse(req.params);
  const body = assignPolicyDepartmentsBodySchema.parse(req.body);
  const data = await policyComplianceService.assignPolicyDepartments(policyId, body, req.auth, {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 1000) ?? null,
  });
  res.status(200).json({ success: true, data });
};

export const listMyPolicyAcknowledgements: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const query = employeePolicyQuerySchema.parse(req.query);
  const data = await policyAcknowledgementService.list(query, req.auth);
  res.status(200).json({ success: true, data });
};

export const getMyPolicyAcknowledgement: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { policyId, versionId } = policyAcknowledgementParamsSchema.parse(req.params);
  const data = await policyAcknowledgementService.detail(policyId, versionId, req.auth);
  res.status(200).json({ success: true, data });
};

export const acknowledgePolicyVersion: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { policyId, versionId } = policyAcknowledgementParamsSchema.parse(req.params);
  const data = await policyAcknowledgementService.acknowledge(
    policyId,
    versionId,
    req.auth,
    {
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent')?.slice(0, 1000) ?? null,
    },
  );
  res.status(200).json({ success: true, data });
};

export const createPolicyDraft: RequestHandler<
  ParamsDictionary,
  CreatePolicyDraftResponse,
  CreatePolicyDraftInput
> = async (req, res) => {
  if (!req.auth) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }

  const data = await policyComplianceService.createPolicyDraft(req.body, req.auth, {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 1000) ?? null,
  });
  res.status(201).json({ success: true, data });
};

export const updatePolicyAndCreateVersion: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { policyId } = updatePolicyCreateVersionParamsSchema.parse(req.params);
  const body = updatePolicyCreateVersionBodySchema.parse(req.body);
  const data = await policyComplianceService.updatePolicyAndCreateVersion(
    policyId,
    body,
    req.auth,
    {
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent')?.slice(0, 1000) ?? null,
    },
  );
  res.status(201).json({ success: true, data });
};

export const listOwnedPublishedPoliciesForNewVersion: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const data = await policyComplianceService.listOwnedPublishedPoliciesForNewVersion(req.auth);
  res.status(200).json({ success: true, data });
};

export const listPublishablePolicies: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const query = listPublishablePoliciesQuerySchema.parse(req.query);
  const data = await policyComplianceService.listPublishablePolicies(query, req.auth);
  res.status(200).json({ success: true, data });
};

export const getDraftPolicyVersion: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { policyId, versionId } = getPolicyVersionParamsSchema.parse(req.params);
  const data = await policyComplianceService.getDraftPolicyVersion(policyId, versionId, req.auth);
  res.status(200).json({ success: true, data });
};

export const listOwnPolicyDrafts: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const query = listOwnPolicyDraftsQuerySchema.parse(req.query);
  const data = await policyComplianceService.listOwnDrafts(query, req.auth);
  res.status(200).json({ success: true, data });
};

export const getOwnPolicyDraft: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { policyId, versionId } = policyDraftParamsSchema.parse(req.params);
  const data = await policyComplianceService.getOwnDraft(policyId, versionId, req.auth);
  res.status(200).json({ success: true, data });
};

export const updateOwnPolicyDraft: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { policyId, versionId } = policyDraftParamsSchema.parse(req.params);
  const body = updatePolicyDraftSchema.parse(req.body);
  const data = await policyComplianceService.updateOwnDraft(policyId, versionId, body, req.auth, {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 1000) ?? null,
  });
  res.status(200).json({ success: true, data });
};

export const publishPolicyVersion: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  const { policyId, versionId } = publishPolicyVersionParamsSchema.parse(req.params);
  const body = publishPolicyVersionBodySchema.parse(req.body);
  const data = await policyComplianceService.publishVersion(policyId, versionId, body, req.auth, {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 1000) ?? null,
  });
  res.status(200).json({ success: true, data });
};

export const policyComplianceController = {
  acknowledgePolicyVersion,
  assignPolicyDepartments,
  createPolicyDraft,
  getDraftPolicyVersion,
  getMyPolicyAcknowledgement,
  listPublishablePolicies,
  getOwnPolicyDraft,
  listOwnPolicyDrafts,
  listPolicyDepartmentAssignments,
  listOwnedPublishedPoliciesForNewVersion,
  listMyPolicyAcknowledgements,
  publishPolicyVersion,
  updateOwnPolicyDraft,
  updatePolicyAndCreateVersion,
} as const;

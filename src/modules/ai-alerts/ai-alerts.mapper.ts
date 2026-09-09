import type { ModelConfigurationRecord } from './ai-alerts.repository.js';

export const toModelConfigurationResponse = (model: ModelConfigurationRecord) => ({
  id: model.ai_model_version_id,
  modelName: model.model_name,
  algorithm: model.algorithm,
  version: model.version,
  provider: model.provider,
  modelPath: model.model_path,
  parameters: model.parameters,
  active: model.is_active,
  createdAt: model.created_at,
});

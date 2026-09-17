import type { IntegrationConnector, IntegrationEntity } from './connector.interface.js';
import { WazuhConnector } from './wazuh.connector.js';
import { GenericHttpConnector } from './generic-http.connector.js';
import { AppError } from '../../../common/errors/app-error.js';

export function resolveConnector(integration: IntegrationEntity): IntegrationConnector {
  const config = (integration.configuration as Record<string, unknown> | null) ?? {};
  const provider = typeof config.provider === 'string' ? config.provider.toLowerCase().trim() : null;
  const authType = typeof config.authType === 'string' ? config.authType.toLowerCase().trim() : null;

  if (provider === 'wazuh' || authType === 'wazuh_jwt') {
    return new WazuhConnector();
  }

  if (provider === 'generic-http' || !provider) {
    return new GenericHttpConnector();
  }

  throw new AppError(
    400,
    'UNSUPPORTED_INTEGRATION_PROVIDER',
    `Unsupported integration provider: "${provider}"`,
  );
}

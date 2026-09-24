import { AppError } from '../../../common/errors/app-error.js';
import type { IntegrationConnector, IntegrationEntity } from './connector.interface.js';
import { WazuhConnector } from './wazuh.connector.js';
import { GenericHttpConnector } from './generic-http.connector.js';

export function resolveConnector(integration: IntegrationEntity): IntegrationConnector {
  const config = (integration.configuration as Record<string, unknown> | null) ?? {};
  const explicitProvider = typeof config.provider === 'string' ? config.provider.toLowerCase().trim() : null;
  const authType = typeof config.authType === 'string' ? config.authType.toLowerCase().trim() : null;

  if (explicitProvider === 'wazuh' || authType === 'wazuh_jwt' || authType === 'wazuh_basic_jwt') {
    return new WazuhConnector();
  }

  if (explicitProvider === 'generic-http' || explicitProvider === 'generic' || !explicitProvider) {
    return new GenericHttpConnector();
  }

  // Fail-closed for unknown/unsupported explicit provider
  throw new AppError(
    400,
    'UNSUPPORTED_PROVIDER',
    `Integration provider "${explicitProvider}" is not supported. Supported providers: "wazuh", "generic-http".`,
  );
}

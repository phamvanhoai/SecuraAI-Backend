import { z } from 'zod';

export const assetTypes = ['APPLICATION', 'SERVER', 'DATABASE', 'ENDPOINT', 'NETWORK_DEVICE', 'OTHER'] as const;
export const assetTypeSchema = z.enum(assetTypes, { error: 'Select a supported asset type' });

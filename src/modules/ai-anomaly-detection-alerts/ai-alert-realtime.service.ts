import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../common/errors/app-error.js';
import { anomalyDetectionRepository } from './anomaly-detection.repository.js';

const realtimeTicketClaimsSchema = z.object({
  sub: z.uuid(),
  type: z.literal('ai-alert-realtime'),
  iat: z.number().int().optional(),
  exp: z.number().int().optional(),
});

const REALTIME_TICKET_TTL_SECONDS = 30;

async function requireSecurityOfficer(userId: string): Promise<void> {
  const actor = await anomalyDetectionRepository.findActor(userId);
  if (!actor || actor.status !== 'ACTIVE')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  if (actor.role !== 'SECURITY_OFFICER')
    throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
}

export const aiAlertRealtimeService = {
  async issueTicket(userId: string) {
    await requireSecurityOfficer(userId);
    return {
      ticket: jwt.sign({ type: 'ai-alert-realtime' }, env.JWT_ACCESS_SECRET, {
        algorithm: 'HS256',
        subject: userId,
        issuer: 'securaai-api',
        audience: 'securaai-ai-alert-realtime',
        expiresIn: REALTIME_TICKET_TTL_SECONDS,
      }),
      expiresInSeconds: REALTIME_TICKET_TTL_SECONDS,
      path: `${env.API_PREFIX}/ai-alerts/realtime`,
    };
  },

  verifyTicket(ticket: string): string | null {
    try {
      const verified: unknown = jwt.verify(ticket, env.JWT_ACCESS_SECRET, {
        algorithms: ['HS256'],
        issuer: 'securaai-api',
        audience: 'securaai-ai-alert-realtime',
      });
      const claims = realtimeTicketClaimsSchema.safeParse(verified);
      return claims.success ? claims.data.sub : null;
    } catch {
      return null;
    }
  },
};

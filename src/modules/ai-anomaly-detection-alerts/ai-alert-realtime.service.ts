import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../common/errors/app-error.js';
import { anomalyDetectionRepository } from './anomaly-detection.repository.js';

// Accept only tickets created for the AI alert realtime connection.
const realtimeTicketClaimsSchema = z.object({
  sub: z.uuid(),
  type: z.literal('ai-alert-realtime'),
  iat: z.number().int().optional(),
  exp: z.number().int().optional(),
});

// Keep tickets short-lived because the browser sends them during WebSocket setup.
const REALTIME_TICKET_TTL_SECONDS = 30;

// Realtime AI alerts are available only to an active Security Officer.
async function requireSecurityOfficer(userId: string): Promise<void> {
  const actor = await anomalyDetectionRepository.findActor(userId);
  if (!actor || actor.status !== 'ACTIVE')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  if (actor.role !== 'SECURITY_OFFICER')
    throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
}

export const aiAlertRealtimeService = {
  // Create a one-time connection ticket after checking the current user again.
  async issueTicket(userId: string) {
    await requireSecurityOfficer(userId);
    return {
      // Limit the token to this realtime endpoint with a dedicated audience and type.
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

  // Return the user ID only when the signature, scope, expiry and claims are valid.
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
      // Invalid or expired tickets are rejected without exposing verification details.
      return null;
    }
  },
};

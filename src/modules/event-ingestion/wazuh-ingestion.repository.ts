import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { WazuhEventIngestInput } from './dto/wazuh-event-ingest.dto.js';

export const wazuhIngestionRepository = {
  async findWazuhEventSource() {
    return prisma.event_sources.findFirst({
      where: {
        source_type: 'WAZUH',
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        status: true,
      },
    });
  },

  async ensureDefaultWazuhSource(adminUserId?: string) {
    const existing = await prisma.event_sources.findFirst({
      where: { source_type: 'WAZUH' },
      select: { id: true, name: true, status: true },
    });
    if (existing) {
      return existing;
    }

    // If no admin user provided, get any active admin or user in system
    let creatorId = adminUserId;
    if (!creatorId) {
      const admin = await prisma.users.findFirst({
        where: { role: 'ADMIN', status: 'ACTIVE' },
        select: { id: true },
      });
      creatorId = admin?.id;
    }

    if (!creatorId) {
      const anyUser = await prisma.users.findFirst({
        where: { status: 'ACTIVE' },
        select: { id: true },
      });
      creatorId = anyUser?.id;
    }

    if (!creatorId) {
      throw new Error('Cannot initialize Wazuh event source: No active system user found.');
    }

    return prisma.event_sources.create({
      data: {
        name: 'Wazuh SIEM Ingestion (Default)',
        source_type: 'WAZUH',
        endpoint: '/api/v1/integrations/wazuh/events',
        ingestion_method: 'API',
        authentication_type: 'TOKEN',
        status: 'ACTIVE',
        description: 'Default Wazuh SIEM Edge Normalizer webhook ingestion source',
        created_by: creatorId,
        event_source_families: {
          create: [
            { event_family: 'AUTHENTICATION' },
            { event_family: 'VPN_SSO' },
            { event_family: 'APPLICATION_ACCESS' },
          ],
        },
      },
      select: {
        id: true,
        name: true,
        status: true,
      },
    });
  },

  async saveNormalizedEvent(eventSourceId: string, event: WazuhEventIngestInput) {
    let occurredAt: Date;
    try {
      occurredAt = new Date(event.timestamp);
      if (isNaN(occurredAt.getTime())) {
        occurredAt = new Date();
      }
    } catch {
      occurredAt = new Date();
    }

    const payloadJson = event as unknown as Prisma.InputJsonValue;

    // Check if external event already exists to prevent duplication
    if (event.rawEventId) {
      const existing = await prisma.normalized_events.findUnique({
        where: {
          event_source_id_external_event_id: {
            event_source_id: eventSourceId,
            external_event_id: event.rawEventId,
          },
        },
        select: {
          id: true,
          external_event_id: true,
          event_family: true,
          event_type: true,
          ingested_at: true,
        },
      });

      if (existing) {
        return existing;
      }
    }

    return prisma.normalized_events.create({
      data: {
        event_source_id: eventSourceId,
        external_event_id: event.rawEventId ?? null,
        event_family: event.eventFamily,
        event_type: event.eventType,
        occurred_at: occurredAt,
        account_identifier: event.actor.username,
        source_ip: event.sourceIp ?? null,
        device_identifier: event.agent.name,
        severity: event.rule.level ? String(event.rule.level) : null,
        mapping_status: 'UNMAPPED',
        normalized_payload: payloadJson,
      },
      select: {
        id: true,
        external_event_id: true,
        event_family: true,
        event_type: true,
        ingested_at: true,
      },
    });
  },
};

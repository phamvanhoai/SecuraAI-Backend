import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { ViewIncidentsQuery } from './dto/view-incidents.dto.js';

export const incidentViewSelect = {
  id: true,
  incident_code: true,
  title: true,
  description: true,
  severity: true,
  status: true,
  handler_user_id: true,
  detected_at: true,
  confirmed_at: true,
  closed_at: true,
  created_at: true,
  updated_at: true,
  users_incidents_created_byTousers: {
    select: { id: true, full_name: true, email: true },
  },
  users_incidents_handler_user_idTousers: {
    select: { id: true, full_name: true, email: true },
  },
  _count: {
    select: {
      incident_actions: true,
      incident_assets: true,
      incident_controls: true,
      incident_evidence: true,
      incident_risks: true,
    },
  },
} satisfies Prisma.incidentsSelect;

export type IncidentViewRecord = Prisma.incidentsGetPayload<{
  select: typeof incidentViewSelect;
}>;

export const incidentsRepository = {
  findActor(userId: string) {
    return prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });
  },

  list(query: ViewIncidentsQuery) {
    const where: Prisma.incidentsWhereInput = {
      ...(query.search
        ? {
            OR: [
              { incident_code: { contains: query.search, mode: 'insensitive' as const } },
              { title: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(query.severity
        ? { severity: { equals: query.severity, mode: 'insensitive' as const } }
        : {}),
      ...(query.status
        ? { status: query.status.toUpperCase() as Prisma.Enumincident_statusFilter }
        : {}),
    };
    return prisma.$transaction([
      prisma.incidents.count({ where }),
      prisma.incidents.findMany({
        where,
        select: incidentViewSelect,
        orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
  },

  findById(incidentId: string) {
    return prisma.incidents.findUnique({
      where: { id: incidentId },
      select: incidentViewSelect,
    });
  },
};

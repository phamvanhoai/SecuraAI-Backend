import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { MyCertificatesQuery } from './dto/my-certificates.dto.js';

const certificateSelect = {
  training_certificate_id: true,
  certificate_number: true,
  issued_at: true,
  users: { select: { full_name: true } },
  training_enrollments: {
    select: {
      training_enrollment_id: true,
      completed_at: true,
      training_campaigns: {
        select: {
          title: true,
          training_courses: { select: { title: true } },
        },
      },
    },
  },
} satisfies Prisma.training_certificatesSelect;

export const myCertificatesRepository = {
  async list(userId: string, query: MyCertificatesQuery) {
    const where: Prisma.training_certificatesWhereInput = {
      training_enrollments: { user_id: userId },
    };
    if (query.q) {
      where.OR = [
        { certificate_number: { contains: query.q, mode: 'insensitive' } },
        {
          training_enrollments: {
            training_campaigns: { title: { contains: query.q, mode: 'insensitive' } },
          },
        },
        {
          training_enrollments: {
            training_campaigns: {
              training_courses: { title: { contains: query.q, mode: 'insensitive' } },
            },
          },
        },
      ];
    }
    const [total, items] = await prisma.$transaction([
      prisma.training_certificates.count({ where }),
      prisma.training_certificates.findMany({
        where,
        select: certificateSelect,
        orderBy: [{ issued_at: 'desc' }, { training_certificate_id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return { total, items };
  },
};

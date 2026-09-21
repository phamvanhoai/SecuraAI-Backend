import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { IssuedCertificatesQuery } from './dto/issued-certificates.dto.js';

const issuedCertificateSelect = {
  training_certificate_id: true,
  certificate_number: true,
  issued_at: true,
  users: { select: { full_name: true } },
  training_enrollments: {
    select: {
      training_enrollment_id: true,
      completed_at: true,
      users: {
        select: {
          full_name: true,
          email: true,
          employee_code: true,
          departments: { select: { name: true } },
        },
      },
      training_campaigns: {
        select: {
          title: true,
          training_courses: { select: { title: true } },
        },
      },
    },
  },
} satisfies Prisma.training_certificatesSelect;

export const issuedCertificatesRepository = {
  async list(query: IssuedCertificatesQuery) {
    const where: Prisma.training_certificatesWhereInput = {};
    if (query.q) {
      where.OR = [
        { certificate_number: { contains: query.q, mode: 'insensitive' } },
        {
          training_enrollments: {
            users: { full_name: { contains: query.q, mode: 'insensitive' } },
          },
        },
        { training_enrollments: { users: { email: { contains: query.q, mode: 'insensitive' } } } },
        {
          training_enrollments: {
            users: { employee_code: { contains: query.q, mode: 'insensitive' } },
          },
        },
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
        select: issuedCertificateSelect,
        orderBy: [{ issued_at: 'desc' }, { training_certificate_id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return { total, items };
  },
};

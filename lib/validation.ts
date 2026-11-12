import { z } from 'zod';

export const incidentInput = z.object({
  title: z.string().trim().min(5).max(180),
  summary: z.string().trim().min(10),
  serviceId: z.uuid(),
  severity: z.number().int().min(1).max(5),
  occurredAt: z.iso.datetime(),
  symptoms: z.array(z.uuid()).max(10).default([]),
});

export const statusInput = z.object({ status: z.enum(['open', 'investigating']) });
export const resolveInput = z.object({
  status: z.literal('resolved'),
  rootCause: z.string().trim().min(3),
  categoryId: z.uuid(),
});
export const updateInput = z.discriminatedUnion('status', [statusInput, resolveInput]);
export const reopenInput = z.object({ reason: z.string().trim().min(3) });

export const incidentFilters = z
  .object({
    q: z.string().trim().max(200).default(''),
    status: z.enum(['open', 'investigating', 'resolved']).optional(),
    service: z.uuid().optional(),
    minSeverity: z.coerce.number().int().min(1).max(5).default(1),
    maxSeverity: z.coerce.number().int().min(1).max(5).default(5),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .refine((value) => value.minSeverity <= value.maxSeverity, {
    message: 'Minimum severity cannot exceed maximum severity',
  });

export const userInput = z.object({
  email: z
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(10),
  role: z.enum(['admin', 'analyst']),
});

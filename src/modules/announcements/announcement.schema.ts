import { z } from 'zod';
import { nullableString, paginationQuerySchema, requiredString } from '../../schemas/common.schema';
import { ANNOUNCEMENT_AUDIENCES, ANNOUNCEMENT_STATUSES } from '../../types/enums';

const isoDateTime = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date and time');

export const createAnnouncementSchema = z.object({
  title: requiredString(200, 'Title'),
  body: requiredString(20000, 'Message'),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES),
  gradeLevelId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  classId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  isPinned: z.boolean().optional(),
  publishAt: z.union([isoDateTime, z.null()]).optional(),
  expiresAt: z.union([isoDateTime, z.null()]).optional(),
  attachmentUrl: nullableString(500),
  publishNow: z.boolean().optional(),
});

export const updateAnnouncementSchema = createAnnouncementSchema
  .omit({ publishNow: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const listAnnouncementsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(200).optional(),
  status: z.enum(ANNOUNCEMENT_STATUSES).optional(),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES).optional(),
  classId: z.coerce.number().int().positive().optional(),
  gradeLevelId: z.coerce.number().int().positive().optional(),
});

export type CreateAnnouncementBody = z.infer<typeof createAnnouncementSchema>;
export type UpdateAnnouncementBody = z.infer<typeof updateAnnouncementSchema>;
export type ListAnnouncementsQuery = z.infer<typeof listAnnouncementsQuerySchema>;

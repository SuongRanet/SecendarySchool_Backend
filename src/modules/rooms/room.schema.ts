import { z } from 'zod';
import {
  booleanQuerySchema,
  nullableString,
  paginationQuerySchema,
  requiredString,
} from '../../schemas/common.schema';

export const createRoomSchema = z.object({
  code: requiredString(30, 'Code'),
  name: requiredString(100, 'Name'),
  building: nullableString(100),
  floor: nullableString(30),
  capacity: z.union([z.coerce.number().int().positive().max(1000), z.null()]).optional(),
  isActive: z.boolean().optional(),
});

export const updateRoomSchema = createRoomSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const listRoomsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
  building: z.string().trim().max(100).optional(),
  isActive: booleanQuerySchema,
});

export type CreateRoomBody = z.infer<typeof createRoomSchema>;
export type UpdateRoomBody = z.infer<typeof updateRoomSchema>;
export type ListRoomsQuery = z.infer<typeof listRoomsQuerySchema>;

import { withTransaction } from '../../database/connection';
import type { AuditContext, PaginatedResult, PaginationParams, SortParams } from '../../types';
import { AppError } from '../../utils/app-error';
import * as auditService from '../audit/audit.service';
import * as repository from './room.repository';
import type { RoomSortColumn } from './room.repository';
import type { CreateRoomInput, RoomDto, RoomFilters, RoomRow, UpdateRoomInput } from './room.types';

const toDto = (row: RoomRow): RoomDto => ({
  id: row.id,
  code: row.code,
  name: row.name,
  building: row.building,
  floor: row.floor,
  capacity: row.capacity,
  isActive: row.is_active,
  scheduleCount: row.schedule_count ?? 0,
});

export const list = async (
  filters: RoomFilters,
  pagination: PaginationParams,
  sort: SortParams<RoomSortColumn>,
): Promise<PaginatedResult<RoomDto>> => {
  const result = await repository.findRooms(filters, pagination, sort);

  return { rows: result.rows.map(toDto), total: result.total };
};

export const listAll = async (filters: RoomFilters = {}): Promise<RoomDto[]> => {
  const rows = await repository.findAllRooms(filters);
  return rows.map(toDto);
};

export const getById = async (id: number): Promise<RoomDto> => {
  const row = await repository.findRoomById(id);

  if (!row) {
    throw AppError.notFound('Room not found', 'ROOM_NOT_FOUND');
  }

  return toDto(row);
};

export const create = async (input: CreateRoomInput, context: AuditContext): Promise<RoomDto> => {
  const duplicate = await repository.findRoomByCode(input.code);

  if (duplicate) {
    throw AppError.conflict('A room with this code already exists', 'ROOM_CODE_TAKEN');
  }

  const created = await withTransaction(async (client) => {
    const row = await repository.insertRoom(input, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'CREATE',
        entityType: 'room',
        entityId: row.id,
        description: `Created room ${row.name}`,
        newValue: { code: row.code, name: row.name, capacity: row.capacity },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );

    return row;
  });

  return getById(created.id);
};

export const update = async (
  id: number,
  input: UpdateRoomInput,
  context: AuditContext,
): Promise<RoomDto> => {
  const existing = await repository.findRoomById(id);

  if (!existing) {
    throw AppError.notFound('Room not found', 'ROOM_NOT_FOUND');
  }

  if (input.code) {
    const duplicate = await repository.findRoomByCode(input.code, id);

    if (duplicate) {
      throw AppError.conflict('A room with this code already exists', 'ROOM_CODE_TAKEN');
    }
  }

  const { oldValue, newValue } = auditService.diff(
    {
      code: existing.code,
      name: existing.name,
      building: existing.building,
      floor: existing.floor,
      capacity: existing.capacity,
      isActive: existing.is_active,
    },
    input,
  );

  await withTransaction(async (client) => {
    await repository.updateRoom(id, input, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'UPDATE',
        entityType: 'room',
        entityId: id,
        description: `Updated room ${existing.name}`,
        oldValue,
        newValue,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });

  return getById(id);
};

export const archive = async (id: number, context: AuditContext): Promise<void> => {
  const existing = await repository.findRoomById(id);

  if (!existing) {
    throw AppError.notFound('Room not found', 'ROOM_NOT_FOUND');
  }

  if ((existing.schedule_count ?? 0) > 0) {
    throw AppError.conflict(
      'This room is still used by active schedules and cannot be archived',
      'ROOM_IN_USE',
    );
  }

  await withTransaction(async (client) => {
    await repository.softDeleteRoom(id, client);

    await auditService.record(
      {
        userId: context.userId,
        action: 'ARCHIVE',
        entityType: 'room',
        entityId: id,
        description: `Archived room ${existing.name}`,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      client,
    );
  });
};

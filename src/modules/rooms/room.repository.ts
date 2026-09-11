import { pool } from '../../database/connection';
import type { Queryable } from '../../database/connection';
import type { PaginatedResult, PaginationParams, SortParams } from '../../types';
import { buildSearchPattern } from '../../utils/pagination';
import { ACTIVE_YEAR, buildUpdateSet, ParamBuilder } from '../../utils/sql';
import type { CreateRoomInput, RoomFilters, RoomRow, UpdateRoomInput } from './room.types';

export const ROOM_SORT_COLUMNS = ['code', 'name', 'building', 'capacity'] as const;
export type RoomSortColumn = (typeof ROOM_SORT_COLUMNS)[number];

const SORT_COLUMN_SQL: Record<RoomSortColumn, string> = {
  code: 'r.code',
  name: 'r.name',
  building: 'r.building',
  capacity: 'r.capacity',
};

/*
 * How many periods the room is booked for this year.
 *
 * Schedules are rebuilt every year and the old ones are kept, so an unscoped
 * count grew with the school's age rather than describing its week.
 */
const SCHEDULE_COUNT = `
  (SELECT COUNT(*)::int FROM schedules s
    WHERE s.room_id = r.id AND s.is_active
      AND s.academic_year_id = ${ACTIVE_YEAR}) AS schedule_count
`;

const buildConditions = (filters: RoomFilters, builder: ParamBuilder): string[] => {
  const conditions = ['r.deleted_at IS NULL'];

  if (filters.isActive !== undefined) {
    conditions.push(`r.is_active = ${builder.add(filters.isActive)}`);
  }

  if (filters.building) {
    conditions.push(`r.building = ${builder.add(filters.building)}`);
  }

  if (filters.search) {
    const pattern = builder.add(buildSearchPattern(filters.search));
    conditions.push(`(r.name ILIKE ${pattern} OR r.code ILIKE ${pattern} OR r.building ILIKE ${pattern})`);
  }

  return conditions;
};

export const findRooms = async (
  filters: RoomFilters,
  pagination: PaginationParams,
  sort: SortParams<RoomSortColumn>,
): Promise<PaginatedResult<RoomRow>> => {
  const builder = new ParamBuilder();
  const conditions = buildConditions(filters, builder);
  const where = `WHERE ${conditions.join(' AND ')}`;

  const totalResult = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM rooms r ${where}`,
    builder.params,
  );

  const limit = builder.add(pagination.limit);
  const offset = builder.add(pagination.offset);

  const rows = await pool.query<RoomRow>(
    `SELECT r.*, ${SCHEDULE_COUNT}
       FROM rooms r
       ${where}
      ORDER BY ${SORT_COLUMN_SQL[sort.sortBy]} ${sort.sortOrder}, r.id ASC
      LIMIT ${limit} OFFSET ${offset}`,
    builder.params,
  );

  return { rows: rows.rows, total: totalResult.rows[0]?.count ?? 0 };
};

export const findAllRooms = async (filters: RoomFilters = {}): Promise<RoomRow[]> => {
  const builder = new ParamBuilder();
  const conditions = buildConditions(filters, builder);

  const result = await pool.query<RoomRow>(
    `SELECT r.*, ${SCHEDULE_COUNT}
       FROM rooms r
      WHERE ${conditions.join(' AND ')}
      ORDER BY r.code ASC`,
    builder.params,
  );

  return result.rows;
};

export const findRoomById = async (
  id: number,
  executor: Queryable = pool,
): Promise<RoomRow | null> => {
  const result = await executor.query<RoomRow>(
    `SELECT r.*, ${SCHEDULE_COUNT} FROM rooms r WHERE r.id = $1 AND r.deleted_at IS NULL`,
    [id],
  );

  return result.rows[0] ?? null;
};

export const findRoomByCode = async (
  code: string,
  excludeId?: number,
  executor: Queryable = pool,
): Promise<RoomRow | null> => {
  const params: unknown[] = [code];
  let sql = 'SELECT * FROM rooms WHERE LOWER(code) = LOWER($1) AND deleted_at IS NULL';

  if (excludeId !== undefined) {
    params.push(excludeId);
    sql += ` AND id <> $${params.length}`;
  }

  const result = await executor.query<RoomRow>(sql, params);
  return result.rows[0] ?? null;
};

export const insertRoom = async (
  input: CreateRoomInput,
  executor: Queryable = pool,
): Promise<RoomRow> => {
  const result = await executor.query<RoomRow>(
    `INSERT INTO rooms (code, name, building, floor, capacity, is_active)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, TRUE))
     RETURNING *`,
    [
      input.code,
      input.name,
      input.building ?? null,
      input.floor ?? null,
      input.capacity ?? null,
      input.isActive ?? null,
    ],
  );

  return result.rows[0];
};

export const updateRoom = async (
  id: number,
  input: UpdateRoomInput,
  executor: Queryable = pool,
): Promise<RoomRow | null> => {
  const { assignments, params } = buildUpdateSet(input, {
    code: { column: 'code' },
    name: { column: 'name' },
    building: { column: 'building' },
    floor: { column: 'floor' },
    capacity: { column: 'capacity' },
    isActive: { column: 'is_active' },
  });

  if (assignments.length === 0) {
    return findRoomById(id, executor);
  }

  params.push(id);

  const result = await executor.query<RoomRow>(
    `UPDATE rooms SET ${assignments.join(', ')}
      WHERE id = $${params.length} AND deleted_at IS NULL
      RETURNING *`,
    params,
  );

  return result.rows[0] ?? null;
};

export const softDeleteRoom = async (id: number, executor: Queryable = pool): Promise<boolean> => {
  const result = await executor.query(
    'UPDATE rooms SET deleted_at = NOW(), is_active = FALSE WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );

  return result.rowCount !== null && result.rowCount > 0;
};

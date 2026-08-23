import { pool } from '../../database/connection';
import type { Queryable } from '../../database/connection';
import type { PaginatedResult, PaginationParams, SortParams } from '../../types';
import { buildSearchPattern } from '../../utils/pagination';
import { buildUpdateSet, ParamBuilder } from '../../utils/sql';
import type {
  CreateParentInput,
  ParentChildRow,
  ParentFilters,
  ParentRow,
  UpdateParentInput,
} from './parent.types';

export const PARENT_SORT_COLUMNS = [
  'parent_code',
  'first_name_en',
  'last_name_en',
  'created_at',
] as const;
export type ParentSortColumn = (typeof PARENT_SORT_COLUMNS)[number];

const SORT_COLUMN_SQL: Record<ParentSortColumn, string> = {
  parent_code: 'p.parent_code',
  first_name_en: 'p.first_name_en',
  last_name_en: 'p.last_name_en',
  created_at: 'p.created_at',
};

const EXTRA_SELECT = `
  u.username,
  (SELECT COUNT(*)::int
     FROM student_parents sp
     JOIN students s ON s.id = sp.student_id AND s.deleted_at IS NULL
    WHERE sp.parent_id = p.id) AS children_count
`;

const buildConditions = (filters: ParentFilters, builder: ParamBuilder): string[] => {
  const conditions = ['p.deleted_at IS NULL'];

  if (filters.isActive !== undefined) {
    conditions.push(`p.is_active = ${builder.add(filters.isActive)}`);
  }

  if (filters.studentId !== undefined) {
    conditions.push(
      `EXISTS (SELECT 1 FROM student_parents sp2
                WHERE sp2.parent_id = p.id AND sp2.student_id = ${builder.add(filters.studentId)})`,
    );
  }

  if (filters.hasAccount !== undefined) {
    conditions.push(filters.hasAccount ? 'p.user_id IS NOT NULL' : 'p.user_id IS NULL');
  }

  if (filters.search) {
    const pattern = builder.add(buildSearchPattern(filters.search));
    conditions.push(
      `(p.first_name_en ILIKE ${pattern}
        OR p.last_name_en ILIKE ${pattern}
        OR CONCAT(p.first_name_en, ' ', p.last_name_en) ILIKE ${pattern}
        OR p.first_name_kh ILIKE ${pattern}
        OR p.last_name_kh ILIKE ${pattern}
        OR p.parent_code ILIKE ${pattern}
        OR p.phone_number ILIKE ${pattern}
        OR p.email ILIKE ${pattern})`,
    );
  }

  return conditions;
};

export const findParents = async (
  filters: ParentFilters,
  pagination: PaginationParams,
  sort: SortParams<ParentSortColumn>,
): Promise<PaginatedResult<ParentRow>> => {
  const builder = new ParamBuilder();
  const where = `WHERE ${buildConditions(filters, builder).join(' AND ')}`;

  const totalResult = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM parents p ${where}`,
    builder.params,
  );

  const limit = builder.add(pagination.limit);
  const offset = builder.add(pagination.offset);

  const rows = await pool.query<ParentRow>(
    `SELECT p.*, ${EXTRA_SELECT}
       FROM parents p
       LEFT JOIN users u ON u.id = p.user_id
       ${where}
      ORDER BY ${SORT_COLUMN_SQL[sort.sortBy]} ${sort.sortOrder}, p.id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    builder.params,
  );

  return { rows: rows.rows, total: totalResult.rows[0]?.count ?? 0 };
};

export const findAllParents = async (filters: ParentFilters = {}): Promise<ParentRow[]> => {
  const builder = new ParamBuilder();

  const result = await pool.query<ParentRow>(
    `SELECT p.*, ${EXTRA_SELECT}
       FROM parents p
       LEFT JOIN users u ON u.id = p.user_id
      WHERE ${buildConditions(filters, builder).join(' AND ')}
      ORDER BY p.first_name_en ASC, p.last_name_en ASC`,
    builder.params,
  );

  return result.rows;
};

export const findParentById = async (
  id: number,
  executor: Queryable = pool,
): Promise<ParentRow | null> => {
  const result = await executor.query<ParentRow>(
    `SELECT p.*, ${EXTRA_SELECT}
       FROM parents p
       LEFT JOIN users u ON u.id = p.user_id
      WHERE p.id = $1 AND p.deleted_at IS NULL`,
    [id],
  );

  return result.rows[0] ?? null;
};

export const findParentByUserId = async (
  userId: number,
  executor: Queryable = pool,
): Promise<ParentRow | null> => {
  const result = await executor.query<ParentRow>(
    `SELECT p.*, ${EXTRA_SELECT}
       FROM parents p
       LEFT JOIN users u ON u.id = p.user_id
      WHERE p.user_id = $1 AND p.deleted_at IS NULL`,
    [userId],
  );

  return result.rows[0] ?? null;
};

export const findParentByCode = async (
  code: string,
  excludeId?: number,
  executor: Queryable = pool,
): Promise<ParentRow | null> => {
  const params: unknown[] = [code];
  let sql = 'SELECT * FROM parents WHERE LOWER(parent_code) = LOWER($1) AND deleted_at IS NULL';

  if (excludeId !== undefined) {
    params.push(excludeId);
    sql += ` AND id <> $${params.length}`;
  }

  const result = await executor.query<ParentRow>(sql, params);
  return result.rows[0] ?? null;
};

export const insertParent = async (
  input: CreateParentInput & { parentCode: string; userId: number | null },
  executor: Queryable = pool,
): Promise<ParentRow> => {
  const result = await executor.query<ParentRow>(
    `INSERT INTO parents (
        user_id, parent_code, first_name_en, last_name_en, first_name_kh, last_name_kh,
        gender, date_of_birth, national_id, phone_number, alternate_phone, email,
        occupation, workplace, address, province, profile_photo, is_active
     ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7::gender, $8::date, $9, $10, $11, $12,
        $13, $14, $15, $16, $17, COALESCE($18, TRUE)
     )
     RETURNING *`,
    [
      input.userId,
      input.parentCode,
      input.firstNameEn,
      input.lastNameEn,
      input.firstNameKh ?? null,
      input.lastNameKh ?? null,
      input.gender ?? null,
      input.dateOfBirth ?? null,
      input.nationalId ?? null,
      input.phoneNumber ?? null,
      input.alternatePhone ?? null,
      input.email ?? null,
      input.occupation ?? null,
      input.workplace ?? null,
      input.address ?? null,
      input.province ?? null,
      input.profilePhoto ?? null,
      input.isActive ?? null,
    ],
  );

  return result.rows[0];
};

export const updateParent = async (
  id: number,
  input: UpdateParentInput,
  executor: Queryable = pool,
): Promise<ParentRow | null> => {
  const { assignments, params } = buildUpdateSet(input, {
    parentCode: { column: 'parent_code' },
    firstNameEn: { column: 'first_name_en' },
    lastNameEn: { column: 'last_name_en' },
    firstNameKh: { column: 'first_name_kh' },
    lastNameKh: { column: 'last_name_kh' },
    gender: { column: 'gender', cast: 'gender' },
    dateOfBirth: { column: 'date_of_birth', cast: 'date' },
    nationalId: { column: 'national_id' },
    phoneNumber: { column: 'phone_number' },
    alternatePhone: { column: 'alternate_phone' },
    email: { column: 'email' },
    occupation: { column: 'occupation' },
    workplace: { column: 'workplace' },
    address: { column: 'address' },
    province: { column: 'province' },
    profilePhoto: { column: 'profile_photo' },
    isActive: { column: 'is_active' },
  });

  if (assignments.length === 0) {
    return findParentById(id, executor);
  }

  params.push(id);

  const result = await executor.query<ParentRow>(
    `UPDATE parents SET ${assignments.join(', ')}
      WHERE id = $${params.length} AND deleted_at IS NULL
      RETURNING *`,
    params,
  );

  return result.rows[0] ?? null;
};

export const linkUser = async (
  parentId: number,
  userId: number | null,
  executor: Queryable = pool,
): Promise<void> => {
  await executor.query('UPDATE parents SET user_id = $2 WHERE id = $1', [parentId, userId]);
};

export const softDeleteParent = async (
  id: number,
  executor: Queryable = pool,
): Promise<boolean> => {
  const result = await executor.query(
    'UPDATE parents SET deleted_at = NOW(), is_active = FALSE WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );

  return result.rowCount !== null && result.rowCount > 0;
};

/** The children linked to a guardian, with each child's current placement. */
export const findParentChildren = async (
  parentId: number,
  executor: Queryable = pool,
): Promise<ParentChildRow[]> => {
  const result = await executor.query<ParentChildRow>(
    `SELECT sp.id AS link_id,
            s.id AS student_id,
            s.student_code,
            s.first_name_en, s.last_name_en, s.first_name_kh, s.last_name_kh,
            s.gender, s.date_of_birth, s.profile_photo, s.status,
            sp.relationship, sp.is_primary_contact, sp.is_emergency_contact, sp.can_pick_up,
            ce.class_id AS current_class_id,
            cc.name AS current_class_name,
            cg.name_en AS current_grade_level_name,
            ce.academic_year_id AS current_academic_year_id,
            cy.name AS current_academic_year_name
       FROM student_parents sp
       JOIN students s ON s.id = sp.student_id
       LEFT JOIN LATERAL (
         SELECT e.class_id, e.academic_year_id
           FROM enrollments e
          WHERE e.student_id = s.id AND e.status = 'ACTIVE'
          ORDER BY e.enrolled_date DESC, e.id DESC
          LIMIT 1
       ) ce ON TRUE
       LEFT JOIN classes cc ON cc.id = ce.class_id
       LEFT JOIN grade_levels cg ON cg.id = cc.grade_level_id
       LEFT JOIN academic_years cy ON cy.id = ce.academic_year_id
      WHERE sp.parent_id = $1 AND s.deleted_at IS NULL
      ORDER BY s.first_name_en ASC`,
    [parentId],
  );

  return result.rows;
};

export const countChildren = async (
  parentId: number,
  executor: Queryable = pool,
): Promise<number> => {
  const result = await executor.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM student_parents sp
       JOIN students s ON s.id = sp.student_id AND s.deleted_at IS NULL
      WHERE sp.parent_id = $1`,
    [parentId],
  );

  return result.rows[0]?.count ?? 0;
};

/**
 * Whether a guardian is linked to a student. Used by any workspace that lets a
 * parent read a child's record, so the check lives beside the link table rather
 * than being rewritten in each controller.
 */
export const isLinkedToStudent = async (
  parentId: number,
  studentId: number,
  executor: Queryable = pool,
): Promise<boolean> => {
  const result = await executor.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM student_parents
        WHERE parent_id = $1 AND student_id = $2
     ) AS exists`,
    [parentId, studentId],
  );

  return result.rows[0]?.exists ?? false;
};

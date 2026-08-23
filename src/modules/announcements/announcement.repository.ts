import { pool } from '../../database/connection';
import type { Queryable } from '../../database/connection';
import type { PaginatedResult, PaginationParams } from '../../types';
import { buildSearchPattern } from '../../utils/pagination';
import { buildUpdateSet, ParamBuilder } from '../../utils/sql';
import type {
  AnnouncementFilters,
  AnnouncementRow,
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
} from './announcement.types';

const BASE_SELECT = `
  SELECT a.*,
         g.name_en AS grade_level_name,
         c.name AS class_name,
         u.username AS created_by_name
    FROM announcements a
    LEFT JOIN grade_levels g ON g.id = a.grade_level_id
    LEFT JOIN classes c ON c.id = a.class_id
    LEFT JOIN users u ON u.id = a.created_by
`;

const buildConditions = (filters: AnnouncementFilters, builder: ParamBuilder): string[] => {
  const conditions: string[] = ['TRUE'];

  if (filters.status) {
    conditions.push(`a.status = ${builder.add(filters.status)}::announcement_status`);
  }

  if (filters.audience) {
    conditions.push(`a.audience = ${builder.add(filters.audience)}::announcement_audience`);
  }

  if (filters.classId !== undefined) {
    conditions.push(`a.class_id = ${builder.add(filters.classId)}`);
  }

  if (filters.gradeLevelId !== undefined) {
    conditions.push(`a.grade_level_id = ${builder.add(filters.gradeLevelId)}`);
  }

  if (filters.search) {
    const pattern = builder.add(buildSearchPattern(filters.search));
    conditions.push(`(a.title ILIKE ${pattern} OR a.body ILIKE ${pattern})`);
  }

  /*
   * Audience matching for a reader: an announcement reaches them when it targets
   * everyone, their role group, or a grade or class one of their children (or
   * they themselves) belongs to.
   */
  if (filters.forUserId !== undefined) {
    const userId = builder.add(filters.forUserId);

    conditions.push(`a.status = 'PUBLISHED'`);
    conditions.push('(a.expires_at IS NULL OR a.expires_at > NOW())');
    conditions.push(`(
      a.audience = 'ALL'
      OR (a.audience = 'TEACHERS' AND EXISTS (
            SELECT 1 FROM teachers t WHERE t.user_id = ${userId} AND t.deleted_at IS NULL))
      OR (a.audience = 'PARENTS' AND EXISTS (
            SELECT 1 FROM parents p WHERE p.user_id = ${userId} AND p.deleted_at IS NULL))
      OR (a.audience = 'STUDENTS' AND EXISTS (
            SELECT 1 FROM students s WHERE s.user_id = ${userId} AND s.deleted_at IS NULL))
      OR (a.audience = 'GRADE' AND EXISTS (
            SELECT 1
              FROM enrollments e
              JOIN classes c2 ON c2.id = e.class_id
              JOIN students s2 ON s2.id = e.student_id
              LEFT JOIN student_parents sp ON sp.student_id = s2.id
              LEFT JOIN parents p2 ON p2.id = sp.parent_id
             WHERE e.status = 'ACTIVE'
               AND c2.grade_level_id = a.grade_level_id
               AND (s2.user_id = ${userId} OR p2.user_id = ${userId})))
      OR (a.audience = 'CLASS' AND EXISTS (
            SELECT 1
              FROM enrollments e2
              JOIN students s3 ON s3.id = e2.student_id
              LEFT JOIN student_parents sp2 ON sp2.student_id = s3.id
              LEFT JOIN parents p3 ON p3.id = sp2.parent_id
             WHERE e2.status = 'ACTIVE'
               AND e2.class_id = a.class_id
               AND (s3.user_id = ${userId} OR p3.user_id = ${userId})))
      OR (a.audience = 'CLASS' AND EXISTS (
            SELECT 1 FROM classes c3
              JOIN teachers t2 ON t2.id = c3.homeroom_teacher_id
             WHERE c3.id = a.class_id AND t2.user_id = ${userId}))
    )`);
  }

  return conditions;
};

export const findAnnouncements = async (
  filters: AnnouncementFilters,
  pagination: PaginationParams,
): Promise<PaginatedResult<AnnouncementRow>> => {
  const builder = new ParamBuilder();
  const where = `WHERE ${buildConditions(filters, builder).join(' AND ')}`;

  const totalResult = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM announcements a ${where}`,
    builder.params,
  );

  const limit = builder.add(pagination.limit);
  const offset = builder.add(pagination.offset);

  const rows = await pool.query<AnnouncementRow>(
    `${BASE_SELECT} ${where}
      ORDER BY a.is_pinned DESC, COALESCE(a.published_at, a.created_at) DESC
      LIMIT ${limit} OFFSET ${offset}`,
    builder.params,
  );

  return { rows: rows.rows, total: totalResult.rows[0]?.count ?? 0 };
};

export const findAnnouncementById = async (
  id: number,
  executor: Queryable = pool,
): Promise<AnnouncementRow | null> => {
  const result = await executor.query<AnnouncementRow>(`${BASE_SELECT} WHERE a.id = $1`, [id]);
  return result.rows[0] ?? null;
};

export const insertAnnouncement = async (
  input: CreateAnnouncementInput & { academicYearId: number | null; createdBy: number | null },
  executor: Queryable = pool,
): Promise<AnnouncementRow> => {
  const result = await executor.query<{ id: number }>(
    `INSERT INTO announcements (
        title, body, audience, grade_level_id, class_id, academic_year_id,
        status, is_pinned, publish_at, published_at, expires_at, attachment_url,
        created_by, published_by
     ) VALUES (
        $1, $2, $3::announcement_audience, $4, $5, $6,
        CASE
          WHEN $7::boolean THEN 'PUBLISHED'::announcement_status
          WHEN $8::timestamptz IS NOT NULL THEN 'SCHEDULED'::announcement_status
          ELSE 'DRAFT'::announcement_status
        END,
        COALESCE($9, FALSE), $8::timestamptz,
        CASE WHEN $7::boolean THEN NOW() ELSE NULL END,
        $10::timestamptz, $11, $12::bigint,
        -- $12 is the author. It fills created_by, and published_by as well when
        -- the announcement goes out immediately. Both uses must name the type:
        -- without the cast PostgreSQL deduces one type from the column and
        -- another from the CASE branch and refuses the statement.
        CASE WHEN $7::boolean THEN $12::bigint ELSE NULL END
     )
     RETURNING id`,
    [
      input.title,
      input.body,
      input.audience,
      input.gradeLevelId ?? null,
      input.classId ?? null,
      input.academicYearId,
      input.publishNow ?? false,
      input.publishAt ?? null,
      input.isPinned ?? null,
      input.expiresAt ?? null,
      input.attachmentUrl ?? null,
      input.createdBy,
    ],
  );

  return (await findAnnouncementById(result.rows[0].id, executor)) as AnnouncementRow;
};

export const updateAnnouncement = async (
  id: number,
  input: UpdateAnnouncementInput,
  executor: Queryable = pool,
): Promise<AnnouncementRow | null> => {
  const { assignments, params } = buildUpdateSet(input, {
    title: { column: 'title' },
    body: { column: 'body' },
    audience: { column: 'audience', cast: 'announcement_audience' },
    gradeLevelId: { column: 'grade_level_id' },
    classId: { column: 'class_id' },
    isPinned: { column: 'is_pinned' },
    publishAt: { column: 'publish_at', cast: 'timestamptz' },
    expiresAt: { column: 'expires_at', cast: 'timestamptz' },
    attachmentUrl: { column: 'attachment_url' },
  });

  if (assignments.length === 0) {
    return findAnnouncementById(id, executor);
  }

  params.push(id);

  await executor.query(
    `UPDATE announcements SET ${assignments.join(', ')} WHERE id = $${params.length}`,
    params,
  );

  return findAnnouncementById(id, executor);
};

export const setStatus = async (
  id: number,
  status: string,
  publishedBy: number | null,
  executor: Queryable = pool,
): Promise<AnnouncementRow | null> => {
  await executor.query(
    `UPDATE announcements
        SET status = $2::announcement_status,
            published_at = CASE WHEN $2 = 'PUBLISHED' THEN COALESCE(published_at, NOW()) ELSE published_at END,
            published_by = CASE WHEN $2 = 'PUBLISHED' THEN $3 ELSE published_by END,
            archived_at = CASE WHEN $2 = 'ARCHIVED' THEN NOW() ELSE NULL END
      WHERE id = $1`,
    [id, status, publishedBy],
  );

  return findAnnouncementById(id, executor);
};

export const deleteAnnouncement = async (
  id: number,
  executor: Queryable = pool,
): Promise<boolean> => {
  const result = await executor.query('DELETE FROM announcements WHERE id = $1', [id]);
  return result.rowCount !== null && result.rowCount > 0;
};

/** Publishes scheduled announcements whose time has come. */
export const publishDueAnnouncements = async (
  executor: Queryable = pool,
): Promise<AnnouncementRow[]> => {
  const result = await executor.query<{ id: number }>(
    `UPDATE announcements
        SET status = 'PUBLISHED'::announcement_status, published_at = NOW()
      WHERE status = 'SCHEDULED' AND publish_at IS NOT NULL AND publish_at <= NOW()
      RETURNING id`,
  );

  const published: AnnouncementRow[] = [];

  for (const row of result.rows) {
    const announcement = await findAnnouncementById(row.id, executor);

    if (announcement) {
      published.push(announcement);
    }
  }

  return published;
};

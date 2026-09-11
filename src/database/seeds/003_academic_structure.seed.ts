import type { PoolClient } from 'pg';
import { logger } from '../../utils/logger';

/**
 * Hun Sen Turey Secondary School is a lower secondary school: the cycle runs
 * Grade 7 to Grade 9 only. Grade 9 is the exit grade — its pupils leave the
 * school at the end of it rather than being promoted within it.
 */
const GRADE_LEVELS = [
  { code: 'G7', nameEn: 'Grade 7', nameKh: 'ថ្នាក់ទី៧', order: 7, isExitGrade: false },
  { code: 'G8', nameEn: 'Grade 8', nameKh: 'ថ្នាក់ទី៨', order: 8, isExitGrade: false },
  { code: 'G9', nameEn: 'Grade 9', nameKh: 'ថ្នាក់ទី៩', order: 9, isExitGrade: true },
];

/**
 * The ten subjects Hun Sen Turey teaches and examines.
 *
 * These are the subjects the school teaches and examines. The coefficient is the
 * weight a subject carries
 * when averaging a term: Khmer and Mathematics count for three, the sciences and
 * English for two, the social subjects for one.
 */
const SUBJECTS = [
  { code: 'MATH', nameEn: 'Mathematics', nameKh: 'គណិតវិទ្យា', group: 'CORE', coefficient: 3 },
  { code: 'KHM', nameEn: 'Khmer Literature', nameKh: 'អក្សរសាស្ត្រខ្មែរ', group: 'CORE', coefficient: 3 },
  { code: 'ENG', nameEn: 'English', nameKh: 'ភាសាអង់គ្លេស', group: 'CORE', coefficient: 2 },
  { code: 'PHY', nameEn: 'Physics', nameKh: 'រូបវិទ្យា', group: 'SCIENCE', coefficient: 2 },
  { code: 'CHEM', nameEn: 'Chemistry', nameKh: 'គីមីវិទ្យា', group: 'SCIENCE', coefficient: 2 },
  { code: 'BIO', nameEn: 'Biology', nameKh: 'ជីវវិទ្យា', group: 'SCIENCE', coefficient: 2 },
  { code: 'EARTH', nameEn: 'Earth Science', nameKh: 'ផែនដីវិទ្យា', group: 'SCIENCE', coefficient: 1 },
  { code: 'HIST', nameEn: 'History', nameKh: 'ប្រវត្តិវិទ្យា', group: 'SOCIAL', coefficient: 1 },
  { code: 'GEO', nameEn: 'Geography', nameKh: 'ភូមិវិទ្យា', group: 'SOCIAL', coefficient: 1 },
  { code: 'CIVIC', nameEn: 'Moral-Civics', nameKh: 'សីលធម៌-ពលរដ្ឋវិជ្ជា', group: 'SOCIAL', coefficient: 1 },
];

/**
 * One home room per class group. Hun Sen Turey runs three Grade 7 groups, three
 * Grade 8 groups and two Grade 9 groups, and each keeps the same room all
 * year, so the room code matches the class it belongs to.
 */
const ROOMS = [
  { code: '7A', name: 'Room 7A', building: 'Main Building', floor: '1', capacity: 45 },
  { code: '7B', name: 'Room 7B', building: 'Main Building', floor: '1', capacity: 45 },
  { code: '7C', name: 'Room 7C', building: 'Main Building', floor: '1', capacity: 45 },
  { code: '8A', name: 'Room 8A', building: 'Main Building', floor: '2', capacity: 45 },
  { code: '8B', name: 'Room 8B', building: 'Main Building', floor: '2', capacity: 45 },
  { code: '8C', name: 'Room 8C', building: 'Main Building', floor: '2', capacity: 45 },
  { code: '9A', name: 'Room 9A', building: 'Main Building', floor: '3', capacity: 45 },
  { code: '9B', name: 'Room 9B', building: 'Main Building', floor: '3', capacity: 45 },
];

/** Seeds the grade levels, subjects and rooms a primary school starts with. */
export const seedAcademicStructure = async (client: PoolClient): Promise<void> => {
  for (const grade of GRADE_LEVELS) {
    await client.query(
      `INSERT INTO grade_levels (code, name_en, name_kh, level_order, is_exit_grade)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (code) DO UPDATE
         SET name_en = EXCLUDED.name_en,
             name_kh = EXCLUDED.name_kh,
             level_order = EXCLUDED.level_order,
             is_exit_grade = EXCLUDED.is_exit_grade`,
      [grade.code, grade.nameEn, grade.nameKh, grade.order, grade.isExitGrade],
    );
  }

  for (const subject of SUBJECTS) {
    await client.query(
      `INSERT INTO subjects (code, name_en, name_kh, subject_group)
       VALUES ($1, $2, $3, $4::subject_group)
       ON CONFLICT (code) DO UPDATE
         SET name_en = EXCLUDED.name_en,
             name_kh = EXCLUDED.name_kh,
             subject_group = EXCLUDED.subject_group`,
      [subject.code, subject.nameEn, subject.nameKh, subject.group],
    );
  }

  /**
   * Subjects dropped from the curriculum are archived rather than deleted: a
   * grade already awarded in ICT belongs to the pupil's record whatever the
   * school teaches now. Archiving also takes them off the timetable and out of
   * every class's subject list, which is what "no longer taught" means here.
   */
  const retired = await client.query<{ code: string }>(
    `UPDATE subjects
        SET is_active = FALSE, deleted_at = COALESCE(deleted_at, NOW())
      WHERE code <> ALL($1::text[])
        AND deleted_at IS NULL
      RETURNING code`,
    [SUBJECTS.map((subject) => subject.code)],
  );

  if (retired.rowCount) {
    await client.query(
      `DELETE FROM class_subjects
        WHERE subject_id IN (SELECT id FROM subjects WHERE deleted_at IS NOT NULL)`,
    );
    await client.query(
      `DELETE FROM schedules
        WHERE subject_id IN (SELECT id FROM subjects WHERE deleted_at IS NOT NULL)`,
    );
    await client.query(
      `DELETE FROM grade_subjects
        WHERE subject_id IN (SELECT id FROM subjects WHERE deleted_at IS NOT NULL)`,
    );

    logger.info(
      `Archived ${retired.rowCount} subject(s) no longer taught: ${retired.rows
        .map((row) => row.code)
        .join(', ')}`,
    );
  }

  for (const room of ROOMS) {
    await client.query(
      `INSERT INTO rooms (code, name, building, floor, capacity)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (code) DO UPDATE
         SET name = EXCLUDED.name, building = EXCLUDED.building, capacity = EXCLUDED.capacity`,
      [room.code, room.name, room.building, room.floor, room.capacity],
    );
  }

  // Every subject of the lower secondary curriculum is taught in all three
  // grades, each carrying its coefficient into the grade-subject link.
  for (const subject of SUBJECTS) {
    await client.query(
      `INSERT INTO grade_subjects (grade_level_id, subject_id, coefficient)
       SELECT g.id, s.id, $2
         FROM grade_levels g
         CROSS JOIN subjects s
        WHERE s.code = $1
       ON CONFLICT (grade_level_id, subject_id) DO UPDATE
         SET coefficient = EXCLUDED.coefficient`,
      [subject.code, subject.coefficient],
    );
  }

  // A database seeded under the previous primary-school curriculum still holds
  // Grade 1-6 and subjects such as Art and Music. They are retired rather than
  // deleted, and only when nothing references them — an in-use row is left
  // alone and reported, because removing it would break historical records.
  const retiredGrades = await client.query<{ code: string }>(
    `UPDATE grade_levels
        SET is_active = FALSE, deleted_at = NOW()
      WHERE code <> ALL($1::text[])
        AND deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM classes c WHERE c.grade_level_id = grade_levels.id)
      RETURNING code`,
    [GRADE_LEVELS.map((grade) => grade.code)],
  );

  const retiredSubjects = await client.query<{ code: string }>(
    `UPDATE subjects
        SET is_active = FALSE, deleted_at = NOW()
      WHERE code <> ALL($1::text[])
        AND deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM class_subjects cs WHERE cs.subject_id = subjects.id)
      RETURNING code`,
    [SUBJECTS.map((subject) => subject.code)],
  );

  const stuckGrades = await client.query<{ code: string }>(
    `SELECT code FROM grade_levels
      WHERE code <> ALL($1::text[]) AND deleted_at IS NULL`,
    [GRADE_LEVELS.map((grade) => grade.code)],
  );

  if (retiredGrades.rowCount || retiredSubjects.rowCount) {
    logger.info(
      `Retired ${retiredGrades.rowCount} grade level(s) and ${retiredSubjects.rowCount} subject(s) that are not part of the lower secondary curriculum`,
    );
  }

  if (stuckGrades.rowCount) {
    logger.warn(
      `These grade levels are outside the lower secondary curriculum but still have classes, so they were kept: ${stuckGrades.rows.map((row) => row.code).join(', ')}`,
    );
  }

  // Rooms carried over from an earlier layout are removed, but only when no
  // class and no timetable period still points at them.
  const removedRooms = await client.query<{ code: string }>(
    `DELETE FROM rooms
      WHERE code <> ALL($1::text[])
        AND NOT EXISTS (SELECT 1 FROM classes c WHERE c.room_id = rooms.id)
        AND NOT EXISTS (SELECT 1 FROM schedules s WHERE s.room_id = rooms.id)
      RETURNING code`,
    [ROOMS.map((room) => room.code)],
  );

  const keptRooms = await client.query<{ code: string }>(
    `SELECT code FROM rooms WHERE code <> ALL($1::text[])`,
    [ROOMS.map((room) => room.code)],
  );

  if (removedRooms.rowCount) {
    logger.info(`Removed ${removedRooms.rowCount} room(s) that are no longer part of the school`);
  }

  if (keptRooms.rowCount) {
    logger.warn(
      `These rooms are outside the current layout but are still in use, so they were kept: ${keptRooms.rows.map((row) => row.code).join(', ')}`,
    );
  }

  logger.info(
    `Seeded ${GRADE_LEVELS.length} grade levels, ${SUBJECTS.length} subjects and ${ROOMS.length} rooms`,
  );
};

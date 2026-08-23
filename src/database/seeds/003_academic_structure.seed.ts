import type { PoolClient } from 'pg';
import { logger } from '../../utils/logger';

/**
 * Hun Sen Turi Secondary School is a lower secondary school: the cycle runs
 * Grade 7 to Grade 9 only. Grade 9 is the exit grade, so its students sit the
 * national examination instead of being promoted within this school.
 */
const GRADE_LEVELS = [
  { code: 'G7', nameEn: 'Grade 7', nameKh: 'ថ្នាក់ទី៧', order: 7, isExitGrade: false },
  { code: 'G8', nameEn: 'Grade 8', nameKh: 'ថ្នាក់ទី៨', order: 8, isExitGrade: false },
  { code: 'G9', nameEn: 'Grade 9', nameKh: 'ថ្នាក់ទី៩', order: 9, isExitGrade: true },
];

/**
 * The Cambodian lower secondary curriculum (MoEYS). The coefficient is the
 * weight the subject carries when averaging a term: the core subjects and the
 * sciences count for more than the applied ones.
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
  { code: 'ICT', nameEn: 'ICT', nameKh: 'ព័ត៌មានវិទ្យា', group: 'APPLIED', coefficient: 1 },
  { code: 'PE', nameEn: 'Physical Education', nameKh: 'អប់រំកាយ', group: 'APPLIED', coefficient: 1 },
];

const ROOMS = [
  { code: 'R101', name: 'Room 101', building: 'Main Building', floor: '1', capacity: 40 },
  { code: 'R102', name: 'Room 102', building: 'Main Building', floor: '1', capacity: 40 },
  { code: 'R103', name: 'Room 103', building: 'Main Building', floor: '1', capacity: 40 },
  { code: 'R201', name: 'Room 201', building: 'Main Building', floor: '2', capacity: 40 },
  { code: 'R202', name: 'Room 202', building: 'Main Building', floor: '2', capacity: 40 },
  { code: 'LAB1', name: 'Computer Lab', building: 'Annex', floor: '1', capacity: 30 },
  { code: 'GYM', name: 'Gymnasium', building: 'Annex', floor: '1', capacity: 80 },
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

  logger.info(
    `Seeded ${GRADE_LEVELS.length} grade levels, ${SUBJECTS.length} subjects and ${ROOMS.length} rooms`,
  );
};

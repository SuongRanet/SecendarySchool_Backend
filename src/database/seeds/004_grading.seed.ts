import type { PoolClient } from 'pg';
import { logger } from '../../utils/logger';

const DEFAULT_SCHEME = {
  code: 'STANDARD',
  name: 'Standard primary grading',
  description: 'Homework 10%, Quiz 20%, Midterm 30%, Final 40%.',
};

const COMPONENTS = [
  { type: 'HOMEWORK', weight: 10 },
  { type: 'QUIZ', weight: 20 },
  { type: 'MIDTERM', weight: 30 },
  { type: 'FINAL', weight: 40 },
];

/**
 * The school's own bands, taken from the Student Achievement sheets.
 *
 * Those sheets mark out of 50 and label a pupil Very Good at 40, Good at 32.5
 * and Average at 25 — exactly 80%, 65% and 50%. Expressed as percentages the
 * scale below reproduces the printed grade for every one of the 225 pupils on
 * the sheets, so a grade calculated here matches the paper the school issues.
 */
const SCALES = [
  { letter: 'A', min: 80, max: 100, gpa: 4, performance: 'EXCELLENT', remark: 'Very Good' },
  { letter: 'B', min: 65, max: 79.99, gpa: 3, performance: 'GOOD', remark: 'Good' },
  { letter: 'C', min: 50, max: 64.99, gpa: 2, performance: 'FAIR', remark: 'Average' },
  { letter: 'F', min: 0, max: 49.99, gpa: 0, performance: 'NEEDS_IMPROVEMENT', remark: 'Poor' },
];

/** Seeds the default grading scheme, its weightings and its letter grade scale. */
export const seedGradingSchemes = async (client: PoolClient): Promise<void> => {
  const result = await client.query<{ id: number }>(
    `INSERT INTO grading_schemes (code, name, description, is_default)
     VALUES ($1, $2, $3, TRUE)
     ON CONFLICT (code) DO UPDATE
       SET name = EXCLUDED.name, description = EXCLUDED.description
     RETURNING id`,
    [DEFAULT_SCHEME.code, DEFAULT_SCHEME.name, DEFAULT_SCHEME.description],
  );

  const schemeId = result.rows[0].id;

  for (const component of COMPONENTS) {
    await client.query(
      `INSERT INTO grading_scheme_components (grading_scheme_id, assessment_type, weight_percent)
       VALUES ($1, $2::assessment_type, $3)
       ON CONFLICT (grading_scheme_id, assessment_type) DO UPDATE
         SET weight_percent = EXCLUDED.weight_percent`,
      [schemeId, component.type, component.weight],
    );
  }

  for (const scale of SCALES) {
    await client.query(
      `INSERT INTO grade_scales
         (grading_scheme_id, letter_grade, min_score, max_score, gpa_point, performance, remark_en)
       VALUES ($1, $2, $3, $4, $5, $6::performance_level, $7)
       ON CONFLICT (grading_scheme_id, letter_grade) DO UPDATE
         SET min_score = EXCLUDED.min_score,
             max_score = EXCLUDED.max_score,
             gpa_point = EXCLUDED.gpa_point,
             performance = EXCLUDED.performance,
             remark_en = EXCLUDED.remark_en`,
      [schemeId, scale.letter, scale.min, scale.max, scale.gpa, scale.performance, scale.remark],
    );
  }

  /**
   * Drop bands the school no longer uses.
   *
   * The upsert above only ever adds or updates a letter, so a band retired from
   * SCALES stayed behind and overlapped its neighbours — a mark of 52 matched
   * both the new C (50-64.99) and the old D (40-54.99), and `applyScale` takes
   * whichever it finds first. Two bands covering one mark is not a scale.
   */
  const retired = await client.query<{ letter_grade: string }>(
    `DELETE FROM grade_scales
      WHERE grading_scheme_id = $1 AND letter_grade <> ALL($2::text[])
      RETURNING letter_grade`,
    [schemeId, SCALES.map((scale) => scale.letter)],
  );

  if (retired.rowCount) {
    logger.info(
      `Removed ${retired.rowCount} retired grade band(s): ${retired.rows.map((r) => r.letter_grade).join(', ')}`,
    );
  }

  logger.info('Seeded the default grading scheme with weightings and grade scale');
};

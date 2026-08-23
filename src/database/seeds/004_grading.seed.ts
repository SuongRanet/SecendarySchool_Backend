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

const SCALES = [
  { letter: 'A', min: 85, max: 100, gpa: 4, performance: 'EXCELLENT', remark: 'Excellent' },
  { letter: 'B', min: 70, max: 84.99, gpa: 3, performance: 'GOOD', remark: 'Good' },
  { letter: 'C', min: 55, max: 69.99, gpa: 2, performance: 'FAIR', remark: 'Fair' },
  { letter: 'D', min: 40, max: 54.99, gpa: 1, performance: 'NEEDS_IMPROVEMENT', remark: 'Needs improvement' },
  { letter: 'F', min: 0, max: 39.99, gpa: 0, performance: 'NEEDS_IMPROVEMENT', remark: 'Fail' },
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

  logger.info('Seeded the default grading scheme with weightings and grade scale');
};

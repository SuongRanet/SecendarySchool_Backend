/**
 * Small helpers for composing parameterized SQL. Values are always bound as
 * placeholders — no user input is ever concatenated into a statement.
 */

export interface SqlFragment {
  text: string;
  params: unknown[];
}

/**
 * Builds the `SET` clause of an UPDATE from a partial patch, skipping keys whose
 * value is `undefined`. An explicit `null` is kept so a field can be cleared.
 *
 * `columnMap` maps the input keys to their column name and optional cast.
 */
export const buildUpdateSet = <TPatch extends object>(
  patch: TPatch,
  columnMap: Partial<Record<keyof TPatch & string, { column: string; cast?: string }>>,
  startIndex = 1,
): { assignments: string[]; params: unknown[]; nextIndex: number } => {
  const assignments: string[] = [];
  const params: unknown[] = [];
  let index = startIndex;

  for (const [key, value] of Object.entries(patch) as [keyof TPatch & string, unknown][]) {
    const mapping = columnMap[key];

    if (!mapping || value === undefined) {
      continue;
    }

    params.push(value);
    assignments.push(`${mapping.column} = $${index}${mapping.cast ? `::${mapping.cast}` : ''}`);
    index += 1;
  }

  return { assignments, params, nextIndex: index };
};

/** Joins conditions into a `WHERE` clause, or an empty string when there are none. */
export const buildWhere = (conditions: string[]): string =>
  conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

/**
 * Accumulates bound parameters while composing a query, handing out the correct
 * `$n` placeholder for each one.
 */
export class ParamBuilder {
  private readonly values: unknown[] = [];

  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }

  get params(): unknown[] {
    return this.values;
  }

  get length(): number {
    return this.values.length;
  }
}

/**
 * The enrolment statuses that mean "this pupil held a place in this year".
 *
 * A year's own statistics must not shrink as the year is wound up. Promotion
 * turns an enrolment into PROMOTED and graduation turns it into COMPLETED, so a
 * chart that counts only ACTIVE rows shows a class of forty-six as empty the
 * moment its pupils move up — which erases the year rather than describing it.
 *
 * TRANSFERRED and WITHDRAWN are deliberately absent: those pupils left the
 * school part way through and did not finish the year with the class.
 *
 * Use this wherever a figure describes an academic year. Somewhere reporting on
 * today — who is in class this morning, whose homework is due — still wants
 * ACTIVE alone.
 */
export const ENROLLED_IN_YEAR = "('ACTIVE', 'COMPLETED', 'PROMOTED')";

/**
 * A scalar subquery for the academic year the school is currently in.
 *
 * Once the database holds more than one year, any figure that counts through
 * `classes` or `class_subjects` without naming a year silently sums every year
 * the school has ever run: a teacher who taught 8A last year and 8A this year
 * shows as teaching two classes, and the subject count doubles.
 *
 * Queries that already receive an academic year should use that instead — this
 * is for the ones whose signature has no year to pass, such as the teacher list,
 * where "how many classes" can only sensibly mean "this year".
 */
export const ACTIVE_YEAR = '(SELECT id FROM academic_years WHERE is_active)';

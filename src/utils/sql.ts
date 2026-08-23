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

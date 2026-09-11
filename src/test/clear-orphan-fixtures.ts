import { Client } from 'pg';

/**
 * Clears academic years left behind by an interrupted test run.
 *
 * Fixtures create their own academic year and delete it afterwards, but a suite
 * whose `beforeAll` throws never reaches its `afterAll`, and `DELETE
 * /academic-years/:id` refuses a year that still has an archived class attached.
 * The abandoned years then sit in the database and block later runs: academic
 * years may not overlap, so the next fixture that wants the same window fails
 * with ACADEMIC_YEAR_OVERLAP — an error that says nothing whatever about the
 * behaviour under test.
 *
 * That is not hypothetical. Eleven had accumulated before anyone noticed, and
 * the resulting failures were mistaken for real ones more than once. This runs
 * before the suite so every run starts from a clean calendar.
 *
 * Only years that fixtures create are touched, and only when nothing was ever
 * recorded against them. A year holding a register, a mark or a report card is
 * left alone: it is either real data or a failure worth seeing.
 */
export const setup = async (): Promise<void> => {
  const connectionString =
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/primary_school_test';

  const client = new Client({ connectionString });

  try {
    await client.connect();
  } catch {
    // No database: the API suites will skip themselves anyway.
    return;
  }

  try {
    const result = await client.query(
      `DELETE FROM academic_years y
        WHERE (y.name LIKE 'Test Year %' OR y.name LIKE 'Following %')
          AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.academic_year_id = y.id)
          AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.academic_year_id = y.id)
          AND NOT EXISTS (SELECT 1 FROM grades g WHERE g.academic_year_id = y.id)
          AND NOT EXISTS (SELECT 1 FROM report_cards rc WHERE rc.academic_year_id = y.id)
          AND NOT EXISTS (SELECT 1 FROM assessments s WHERE s.academic_year_id = y.id)`,
    );

    if (result.rowCount) {
      // eslint-disable-next-line no-console
      console.warn(
        `[fixtures] Cleared ${result.rowCount} academic year(s) abandoned by an earlier run.`,
      );
    }
  } catch {
    // An un-migrated database has no such tables; nothing to clear.
  } finally {
    await client.end();
  }
};

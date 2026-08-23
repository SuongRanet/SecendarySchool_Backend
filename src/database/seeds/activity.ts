import { closePool, withTransaction } from '../connection';
import { logger } from '../../utils/logger';
import { seedSchoolActivity } from './007_school_activity.seed';

/**
 * Generates the timetable, attendance register, assessments and grades for the
 * active academic year. Run it after `seed:population`, which creates the
 * classes and people this builds on.
 */
const run = async (): Promise<void> => {
  await withTransaction(seedSchoolActivity);

  logger.info('School activity seeded');
};

run()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error('Activity seed failed', error);
    await closePool();
    process.exit(1);
  });

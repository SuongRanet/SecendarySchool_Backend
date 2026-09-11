import { closePool, withTransaction } from '../connection';
import { logger } from '../../utils/logger';
import { seedTimetable } from './010_timetable.seed';

/**
 * Assigns subject teachers to every class and builds the weekly timetable for
 * the active year. Writes nothing else, so the school's real marks are left
 * untouched.
 */
const run = async (): Promise<void> => {
  await withTransaction(seedTimetable);
};

run()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error('Timetable build failed', error);
    await closePool();
    process.exit(1);
  });

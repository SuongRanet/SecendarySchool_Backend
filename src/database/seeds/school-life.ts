import { closePool, withTransaction } from '../connection';
import { logger } from '../../utils/logger';
import { seedSchoolLife, GUARDIAN_PASSWORD } from './011_school_life.seed';

/**
 * Fills guardians, the register, marks, homework, exams and announcements for
 * the active year. Marks are calibrated to the report cards the school already
 * issued, so nothing here contradicts the printed results.
 */
const run = async (): Promise<void> => {
  await withTransaction(seedSchoolLife);
  logger.info(`Guardian logins use the password: ${GUARDIAN_PASSWORD}`);
};

run()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error('School life seed failed', error);
    await closePool();
    process.exit(1);
  });

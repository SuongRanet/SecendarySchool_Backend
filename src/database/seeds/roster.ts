import { closePool, withTransaction } from '../connection';
import { logger } from '../../utils/logger';
import { seedRealRoster, YEAR_NAME } from './009_real_roster.seed';

/**
 * Loads the school's real 2025-2026 roster from the Student Achievement sheets.
 * Kept separate from the demo seeds because these are real children.
 */
const run = async (): Promise<void> => {
  await withTransaction(seedRealRoster);
  logger.info(`${YEAR_NAME} is now the active year`);
};

run()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error('Roster import failed', error);
    await closePool();
    process.exit(1);
  });

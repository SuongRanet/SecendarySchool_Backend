import { closePool, withTransaction } from '../connection';
import { logger } from '../../utils/logger';
import { DEFAULT_PASSWORD, seedSchoolPopulation } from './006_school_population.seed';

/**
 * Generates a full school population on top of the standard seed. Kept separate
 * from `npm run seed` so a real deployment never receives generated people.
 */
const run = async (): Promise<void> => {
  await withTransaction(seedSchoolPopulation);

  logger.info(`Every generated account uses the password: ${DEFAULT_PASSWORD}`);
};

run()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error('Population seed failed', error);
    await closePool();
    process.exit(1);
  });

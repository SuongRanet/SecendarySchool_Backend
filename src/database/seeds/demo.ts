import { closePool, withTransaction } from '../connection';
import { logger } from '../../utils/logger';
import { DEMO_PASSWORD, seedDemoAccounts } from './006_demo_accounts.seed';

/**
 * Optional demo data, kept out of the standard seed so a real deployment never
 * gets these accounts by accident. Run it with `npm run seed:demo`.
 */
const run = async (): Promise<void> => {
  await withTransaction(seedDemoAccounts);

  logger.info(`Every demo account uses the password: ${DEMO_PASSWORD}`);
  logger.info('Teachers: teacher1, teacher2, teacher3');
  logger.info('Students: student1 … student6');
  logger.info('Guardians: parent1, parent2, parent3');
};

run()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error('Demo seed failed', error);
    await closePool();
    process.exit(1);
  });

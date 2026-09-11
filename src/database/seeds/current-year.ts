import { closePool, withTransaction } from '../connection';
import { logger } from '../../utils/logger';
import { archiveYear } from './012_archive_year.seed';
import { seedCurrentYear } from './013_current_year.seed';

/**
 * Puts the school into the present: last year filed away as history, this year
 * half taught.
 *
 * Both halves run inside one transaction. The archive shift moves the finished
 * year out of the way and the current-year seed moves into the space it leaves,
 * so a failure between them would leave the school with either two overlapping
 * years or none at all. Rolling both back together means a failed run changes
 * nothing.
 */
const run = async (): Promise<void> => {
  const summary = await withTransaction(async (client) => {
    await archiveYear(client);

    return seedCurrentYear(client);
  });

  const rows = Object.entries(summary.counts)
    .map(([entity, count]) => `  ${entity.padEnd(22)}${String(count).padStart(7)}`)
    .join('\n');

  logger.info(
    `\n${summary.yearName} is active: ${summary.start} to ${summary.end}\n` +
      `Today is ${summary.today}; Semester 1 is finished and Semester 2 is ` +
      `${summary.semester2Progress}% taught.\n${rows}`,
  );
};

run()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error('Current-year seed failed', error);
    await closePool();
    process.exit(1);
  });

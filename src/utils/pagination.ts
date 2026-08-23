import type { PaginationParams, SortParams } from '../types';

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/** Normalizes `page` / `limit` query values into safe pagination parameters. */
export const resolvePagination = (
  page: number | undefined,
  limit: number | undefined,
): PaginationParams => {
  const safePage = Number.isFinite(page) && (page as number) > 0 ? Math.floor(page as number) : DEFAULT_PAGE;
  const requestedLimit =
    Number.isFinite(limit) && (limit as number) > 0 ? Math.floor(limit as number) : DEFAULT_LIMIT;
  const safeLimit = Math.min(requestedLimit, MAX_LIMIT);

  return {
    page: safePage,
    limit: safeLimit,
    offset: (safePage - 1) * safeLimit,
  };
};

/**
 * Resolves a sort column against an allow-list. Sort columns can never come
 * straight from the query string because they are interpolated into SQL.
 */
export const resolveSort = <TColumn extends string>(
  sortBy: string | undefined,
  sortOrder: string | undefined,
  allowedColumns: readonly TColumn[],
  fallbackColumn: TColumn,
): SortParams<TColumn> => {
  const column = allowedColumns.includes(sortBy as TColumn) ? (sortBy as TColumn) : fallbackColumn;
  const order = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  return { sortBy: column, sortOrder: order };
};

/**
 * Escapes the LIKE wildcards in a user supplied search term so a literal `%`
 * cannot turn a search into a full table scan match.
 */
export const escapeLikePattern = (term: string): string =>
  term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');

/** Builds the `%term%` pattern used by every `ILIKE` search. */
export const buildSearchPattern = (term: string): string => `%${escapeLikePattern(term.trim())}%`;

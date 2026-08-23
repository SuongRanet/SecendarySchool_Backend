import { describe, expect, it } from 'vitest';
import {
  buildSearchPattern,
  escapeLikePattern,
  MAX_LIMIT,
  resolvePagination,
  resolveSort,
} from '../pagination';

describe('resolvePagination', () => {
  it('falls back to the defaults when values are missing', () => {
    expect(resolvePagination(undefined, undefined)).toEqual({ page: 1, limit: 20, offset: 0 });
  });

  it('computes the offset from the page and limit', () => {
    expect(resolvePagination(3, 25)).toEqual({ page: 3, limit: 25, offset: 50 });
  });

  it('rejects non-positive values instead of producing a negative offset', () => {
    expect(resolvePagination(0, -5)).toEqual({ page: 1, limit: 20, offset: 0 });
  });

  it('caps the limit so one request cannot pull the whole table', () => {
    expect(resolvePagination(1, 5_000).limit).toBe(MAX_LIMIT);
  });
});

describe('resolveSort', () => {
  const columns = ['name', 'created_at'] as const;

  it('accepts a column from the allow-list', () => {
    expect(resolveSort('name', 'asc', columns, 'created_at')).toEqual({
      sortBy: 'name',
      sortOrder: 'ASC',
    });
  });

  it('falls back when the column is not allowed, so nothing can be injected', () => {
    expect(resolveSort('name; DROP TABLE users', 'asc', columns, 'created_at').sortBy).toBe(
      'created_at',
    );
  });

  it('defaults to descending for an unrecognised order', () => {
    expect(resolveSort('name', 'sideways', columns, 'created_at').sortOrder).toBe('DESC');
  });
});

describe('escapeLikePattern', () => {
  it('escapes the wildcards so a literal % is searched for', () => {
    expect(escapeLikePattern('100%')).toBe('100\\%');
    expect(escapeLikePattern('a_b')).toBe('a\\_b');
    expect(escapeLikePattern('back\\slash')).toBe('back\\\\slash');
  });

  it('wraps a trimmed term for an ILIKE search', () => {
    expect(buildSearchPattern('  Dara ')).toBe('%Dara%');
  });
});

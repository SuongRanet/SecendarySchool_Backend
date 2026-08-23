import { describe, expect, it } from 'vitest';
import {
  booleanQuerySchema,
  dateSchema,
  emailSchema,
  idParamSchema,
  namedIdParamSchema,
  numberListSchema,
  optionalEmailSchema,
  paginationQuerySchema,
  passwordSchema,
  phoneSchema,
  requiredString,
  timeSchema,
} from '../common.schema';

describe('idParamSchema', () => {
  it('coerces a route parameter string into a positive integer', () => {
    expect(idParamSchema.parse({ id: '42' })).toEqual({ id: 42 });
  });

  it.each(['0', '-1', 'abc', '1.5'])('rejects %s', (value) => {
    expect(idParamSchema.safeParse({ id: value }).success).toBe(false);
  });
});

describe('namedIdParamSchema', () => {
  it('validates a differently named identifier', () => {
    expect(namedIdParamSchema('studentId').parse({ studentId: '7' })).toEqual({ studentId: 7 });
  });
});

describe('paginationQuerySchema', () => {
  it('accepts page and limit as query strings', () => {
    const parsed = paginationQuerySchema.parse({ page: '2', limit: '50' });

    expect(parsed.page).toBe(2);
    expect(parsed.limit).toBe(50);
  });

  it('accepts an empty query', () => {
    expect(paginationQuerySchema.safeParse({}).success).toBe(true);
  });

  it('rejects a page below one', () => {
    expect(paginationQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });
});

describe('requiredString', () => {
  it('trims and keeps the value', () => {
    expect(requiredString(50, 'First name').parse('  Dara  ')).toBe('Dara');
  });

  it('rejects a value that is only whitespace', () => {
    expect(requiredString(50, 'First name').safeParse('   ').success).toBe(false);
  });

  it('rejects a value past the maximum length', () => {
    expect(requiredString(5).safeParse('123456').success).toBe(false);
  });
});

describe('emailSchema', () => {
  it('accepts a valid address', () => {
    expect(emailSchema.parse('sokha@example.com')).toBe('sokha@example.com');
  });

  it('rejects a malformed address', () => {
    expect(emailSchema.safeParse('sokha@').success).toBe(false);
  });

  it('optionalEmailSchema accepts an omitted value', () => {
    expect(optionalEmailSchema.safeParse(undefined).success).toBe(true);
  });
});

describe('phoneSchema', () => {
  it('accepts a Cambodian style number', () => {
    expect(phoneSchema.safeParse('012345678').success).toBe(true);
  });

  it('rejects letters', () => {
    expect(phoneSchema.safeParse('call-me').success).toBe(false);
  });
});

describe('dateSchema', () => {
  it('accepts an ISO calendar date', () => {
    expect(dateSchema.parse('2026-03-15')).toBe('2026-03-15');
  });

  it.each(['15/03/2026', '2026-3-5', '2026-03-15T08:00:00Z'])('rejects %s', (value) => {
    expect(dateSchema.safeParse(value).success).toBe(false);
  });
});

describe('timeSchema', () => {
  it.each(['07:30', '23:59', '07:30:00'])('accepts %s', (value) => {
    expect(timeSchema.safeParse(value).success).toBe(true);
  });

  it.each(['24:00', '7:30', '07:60'])('rejects %s', (value) => {
    expect(timeSchema.safeParse(value).success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('accepts a password that meets the policy', () => {
    expect(passwordSchema.safeParse('Str0ngPass').success).toBe(true);
  });

  it.each([
    ['too short', 'Ab1cdef'],
    ['no uppercase', 'str0ngpass'],
    ['no lowercase', 'STR0NGPASS'],
    ['no digit', 'StrongPass'],
  ])('rejects a password with %s', (_reason, value) => {
    expect(passwordSchema.safeParse(value).success).toBe(false);
  });
});

describe('booleanQuerySchema', () => {
  it('coerces the strings a query string actually carries', () => {
    expect(booleanQuerySchema.parse('true')).toBe(true);
    expect(booleanQuerySchema.parse('false')).toBe(false);
  });

  it('passes a real boolean through', () => {
    expect(booleanQuerySchema.parse(true)).toBe(true);
  });

  it('is optional', () => {
    expect(booleanQuerySchema.parse(undefined)).toBeUndefined();
  });

  it('rejects any other string', () => {
    expect(booleanQuerySchema.safeParse('yes').success).toBe(false);
  });
});

describe('numberListSchema', () => {
  it('splits a comma separated list', () => {
    expect(numberListSchema.parse('1,2,3')).toEqual([1, 2, 3]);
  });

  it('accepts a repeated query parameter', () => {
    expect(numberListSchema.parse(['4', '5'])).toEqual([4, 5]);
  });

  it('drops entries that are not positive integers', () => {
    expect(numberListSchema.parse('1,abc,0,-2,3')).toEqual([1, 3]);
  });
});

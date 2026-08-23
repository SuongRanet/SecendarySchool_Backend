import { describe, expect, it } from 'vitest';
import { buildUpdateSet, buildWhere, ParamBuilder } from '../sql';

describe('buildUpdateSet', () => {
  const columnMap = {
    firstName: { column: 'first_name' },
    status: { column: 'status', cast: 'student_status' },
    dateOfBirth: { column: 'date_of_birth', cast: 'date' },
  };

  it('builds a parameterized SET clause for the provided fields', () => {
    const result = buildUpdateSet({ firstName: 'Dara', status: 'ACTIVE' }, columnMap);

    expect(result.assignments).toEqual(['first_name = $1', 'status = $2::student_status']);
    expect(result.params).toEqual(['Dara', 'ACTIVE']);
  });

  it('skips undefined fields so a partial update leaves the rest alone', () => {
    const result = buildUpdateSet({ firstName: 'Dara', status: undefined }, columnMap);

    expect(result.assignments).toEqual(['first_name = $1']);
    expect(result.params).toEqual(['Dara']);
  });

  it('keeps an explicit null so a field can be cleared', () => {
    const result = buildUpdateSet({ dateOfBirth: null }, columnMap);

    expect(result.assignments).toEqual(['date_of_birth = $1::date']);
    expect(result.params).toEqual([null]);
  });

  it('ignores keys that are not in the column map', () => {
    const result = buildUpdateSet({ firstName: 'Dara', notAColumn: 'x' }, columnMap);

    expect(result.assignments).toEqual(['first_name = $1']);
    expect(result.params).toEqual(['Dara']);
  });

  it('continues numbering from the given start index', () => {
    const result = buildUpdateSet({ firstName: 'Dara' }, columnMap, 4);

    expect(result.assignments).toEqual(['first_name = $4']);
    expect(result.nextIndex).toBe(5);
  });
});

describe('buildWhere', () => {
  it('returns an empty string when there is nothing to filter', () => {
    expect(buildWhere([])).toBe('');
  });

  it('joins conditions with AND', () => {
    expect(buildWhere(['a = $1', 'b = $2'])).toBe('WHERE a = $1 AND b = $2');
  });
});

describe('ParamBuilder', () => {
  it('hands out sequential placeholders and collects the values', () => {
    const builder = new ParamBuilder();

    expect(builder.add('first')).toBe('$1');
    expect(builder.add(42)).toBe('$2');
    expect(builder.params).toEqual(['first', 42]);
    expect(builder.length).toBe(2);
  });
});

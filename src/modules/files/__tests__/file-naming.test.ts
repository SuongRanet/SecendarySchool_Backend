import { describe, expect, it } from 'vitest';
import {
  assertAcceptable,
  buildStoredName,
  displayName,
  parseFileUrl,
  resolveStoredFile,
} from '../file.service';
import { AppError } from '../../../utils/app-error';

/**
 * A pupil names a file whatever their phone names it, so everything here is
 * hostile input: the name reaches the file system and the URL reaches the
 * download route.
 */
describe('buildStoredName', () => {
  it('keeps the extension and a readable version of the name', () => {
    const stored = buildStoredName('Maths page 4.jpg');

    expect(stored).toMatch(/^[0-9a-f]{24}__Maths-page-4\.jpg$/);
    expect(displayName(stored)).toBe('Maths-page-4.jpg');
  });

  it('strips directory separators out of the name', () => {
    const stored = buildStoredName('../../etc/passwd.png');

    expect(stored).not.toContain('/');
    expect(stored).not.toContain('..');
    expect(stored.endsWith('.png')).toBe(true);
  });

  it('falls back to a name when nothing usable is left', () => {
    expect(displayName(buildStoredName('....pdf'))).toBe('homework.pdf');
  });

  it('gives two uploads of the same name different stored names', () => {
    expect(buildStoredName('page.jpg')).not.toBe(buildStoredName('page.jpg'));
  });
});

describe('assertAcceptable', () => {
  it('accepts a photograph', () => {
    expect(() => assertAcceptable('image/jpeg', 'page.jpg')).not.toThrow();
  });

  it('accepts a PDF', () => {
    expect(() => assertAcceptable('application/pdf', 'answers.pdf')).not.toThrow();
  });

  it('refuses an executable', () => {
    expect(() => assertAcceptable('application/x-msdownload', 'run.exe')).toThrow(AppError);
  });

  it('refuses a file whose extension contradicts its declared type', () => {
    expect(() => assertAcceptable('image/png', 'payload.exe')).toThrow(AppError);
  });
});

describe('resolveStoredFile', () => {
  it.each(['../.env', '..', 'a/b.jpg', 'a\b.jpg', '../../secret.pdf'])(
    'refuses %s',
    (name) => {
      expect(() => resolveStoredFile('homework', name)).toThrow(AppError);
    },
  );
});

describe('parseFileUrl', () => {
  it('reads back a URL this server produced', () => {
    expect(parseFileUrl('/files/homework/abc__page.jpg')).toEqual({
      folder: 'homework',
      storedName: 'abc__page.jpg',
    });
  });

  it.each([
    'https://elsewhere.example/evil.png',
    '/files/homework/../../.env',
    '/files/secrets/key.pem',
    '/etc/passwd',
    '',
  ])('rejects %s', (url) => {
    expect(parseFileUrl(url)).toBeNull();
  });
});

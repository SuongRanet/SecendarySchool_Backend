import { describe, expect, it } from 'vitest';
import { assertPhotoAcceptable, photoPublicId } from '../photo.service';
import { AppError } from '../../../utils/app-error';

describe('photoPublicId', () => {
  it('gives each person one fixed image, so a new upload replaces the old', () => {
    expect(photoPublicId('students', 42)).toBe('hun-sen-turey/students/student-42');
    expect(photoPublicId('teachers', 7)).toBe('hun-sen-turey/teachers/teacher-7');
  });
});

describe('assertPhotoAcceptable', () => {
  it.each([
    ['image/jpeg', 'me.JPG'],
    ['image/jpeg', 'me.jpeg'],
    ['image/png', 'me.png'],
    ['image/webp', 'me.webp'],
    ['image/heic', 'IMG_0001.HEIC'],
  ])('accepts %s named %s', (mimeType, name) => {
    expect(() => assertPhotoAcceptable(mimeType, name)).not.toThrow();
  });

  it.each([
    ['application/pdf', 'photo.pdf'],
    ['image/jpeg', 'photo.exe'],
    ['image/gif', 'photo.gif'],
    ['image/png', 'photo'],
  ])('refuses %s named %s', (mimeType, name) => {
    expect(() => assertPhotoAcceptable(mimeType, name)).toThrow(AppError);
  });
});

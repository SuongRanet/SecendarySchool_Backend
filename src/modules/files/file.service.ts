import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../config';
import { AppError } from '../../utils/app-error';
import type { UploadFolder, UploadedFileDto } from './file.types';

/**
 * Homework attachments on disk.
 *
 * Grades 7 to 9 hand work in as a photograph of a page far more often than as a
 * typed document, so the accepted list is led by images and rounded out with the
 * few document types a school actually receives. Anything else is refused by
 * extension *and* by declared type, because a browser will happily label a
 * renamed executable as an image.
 */
const ALLOWED: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/heic': ['.heic'],
  'image/heif': ['.heif'],
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/plain': ['.txt'],
};

export const ALLOWED_MIME_TYPES = Object.keys(ALLOWED);

export const ALLOWED_EXTENSIONS = Object.values(ALLOWED).flat();

/** The separator between the random prefix and the student's own file name. */
const NAME_SEPARATOR = '__';

const FOLDERS: UploadFolder[] = ['homework'];

export const isUploadFolder = (value: string): value is UploadFolder =>
  (FOLDERS as string[]).includes(value);

/**
 * Reduces a name the student typed to something safe to put on disk: no
 * directory separators, no leading dots, nothing but letters, digits, dash and
 * underscore. The extension is handled separately so it cannot be smuggled.
 */
const safeBaseName = (originalName: string): string => {
  const base = path
    .basename(originalName, path.extname(originalName))
    .normalize('NFKD')
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  return base.length > 0 ? base : 'homework';
};

export const assertAcceptable = (mimeType: string, originalName: string): void => {
  const extensions = ALLOWED[mimeType];
  const extension = path.extname(originalName).toLowerCase();

  if (!extensions || !extensions.includes(extension)) {
    throw AppError.badRequest(
      `That file type is not accepted. Use a photo (JPG, PNG, WebP, HEIC), a PDF, a Word document or a text file.`,
      'UPLOAD_TYPE_NOT_ALLOWED',
    );
  }
};

/** `<random>__<student's name>.<ext>`, so the display name survives the round trip. */
export const buildStoredName = (originalName: string): string => {
  const extension = path.extname(originalName).toLowerCase();

  return `${crypto.randomBytes(12).toString('hex')}${NAME_SEPARATOR}${safeBaseName(originalName)}${extension}`;
};

/** Recovers what the student called the file, for display back to them. */
export const displayName = (storedName: string): string => {
  const index = storedName.indexOf(NAME_SEPARATOR);

  return index === -1 ? storedName : storedName.slice(index + NAME_SEPARATOR.length);
};

export const folderPath = (folder: UploadFolder): string => path.join(env.uploadDir, folder);

export const ensureFolder = (folder: UploadFolder): string => {
  const target = folderPath(folder);
  fs.mkdirSync(target, { recursive: true });

  return target;
};

/**
 * Resolves a stored name to a path inside the folder, refusing anything that
 * escapes it. A name arriving as `../../.env` must never resolve.
 */
export const resolveStoredFile = (folder: UploadFolder, storedName: string): string => {
  if (/[/\\]|\.\./.test(storedName)) {
    throw AppError.badRequest('Invalid file name', 'INVALID_FILE_NAME');
  }

  const base = folderPath(folder);
  const resolved = path.resolve(base, storedName);

  if (resolved !== path.join(base, storedName) || !resolved.startsWith(base + path.sep)) {
    throw AppError.badRequest('Invalid file name', 'INVALID_FILE_NAME');
  }

  if (!fs.existsSync(resolved)) {
    throw AppError.notFound('File not found', 'FILE_NOT_FOUND');
  }

  return resolved;
};

/**
 * Splits a stored URL back into its parts. Accepts what `toDto` produced and
 * nothing else, so an `attachment_url` typed in by hand cannot point the
 * download route at an arbitrary place.
 */
export const parseFileUrl = (
  url: string,
): { folder: UploadFolder; storedName: string } | null => {
  const match = /^\/files\/([a-z-]+)\/([^/\\]+)$/.exec(url.trim());

  if (!match || !isUploadFolder(match[1])) {
    return null;
  }

  return { folder: match[1], storedName: match[2] };
};

export const toDto = (
  folder: UploadFolder,
  storedName: string,
  mimeType: string,
  sizeBytes: number,
): UploadedFileDto => ({
  url: `/files/${folder}/${storedName}`,
  fileName: displayName(storedName),
  mimeType,
  sizeBytes,
});

/** Removes a stored file, ignoring one that has already gone. */
export const remove = (folder: UploadFolder, storedName: string): void => {
  try {
    fs.unlinkSync(resolveStoredFile(folder, storedName));
  } catch {
    // A missing attachment is not worth failing a request over.
  }
};

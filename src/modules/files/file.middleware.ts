import multer from 'multer';
import type { Request } from 'express';
import { env } from '../../config';
import { AppError } from '../../utils/app-error';
import * as service from './file.service';

/**
 * Homework uploads go straight to disk under a generated name.
 *
 * The type is checked twice: here, so a refused file is never written, and again
 * in the service, so the rule lives in one place. The size ceiling is multer's
 * own, which aborts the stream rather than buffering a large file first.
 */
const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    try {
      callback(null, service.ensureFolder('homework'));
    } catch (caught) {
      callback(caught as Error, '');
    }
  },
  filename: (_req, file, callback) => {
    callback(null, service.buildStoredName(file.originalname));
  },
});

export const homeworkUpload = multer({
  storage,
  limits: { fileSize: env.maxUploadBytes, files: 1 },
  fileFilter: (_req: Request, file, callback) => {
    try {
      service.assertAcceptable(file.mimetype, file.originalname);
      callback(null, true);
    } catch (caught) {
      callback(caught as Error);
    }
  },
}).single('file');

/** Turns multer's own errors into the API's error shape. */
export const translateUploadError = (caught: unknown): unknown => {
  if (caught instanceof multer.MulterError) {
    if (caught.code === 'LIMIT_FILE_SIZE') {
      return AppError.badRequest(
        `That file is too large. The limit is ${env.MAX_UPLOAD_MB} MB.`,
        'UPLOAD_TOO_LARGE',
      );
    }

    return AppError.badRequest('That file could not be accepted', 'UPLOAD_REJECTED');
  }

  return caught;
};

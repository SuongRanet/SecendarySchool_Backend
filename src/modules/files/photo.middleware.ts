import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../utils/app-error';
import { MAX_PHOTO_BYTES, assertPhotoAcceptable } from './photo.service';

/**
 * Profile photos are held in memory, never written to disk: they go straight
 * on to Cloudinary, and the 5 MB ceiling keeps the buffer small.
 */
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES, files: 1 },
  fileFilter: (_req: Request, file, callback) => {
    try {
      assertPhotoAcceptable(file.mimetype, file.originalname);
      callback(null, true);
    } catch (caught) {
      callback(caught as Error);
    }
  },
}).single('photo');

/** Runs multer for a `photo` field, mapping its errors onto the API's error shape. */
export const receivePhoto = (req: Request, res: Response, next: NextFunction): void => {
  photoUpload(req, res, (caught) => {
    if (caught instanceof multer.MulterError) {
      next(
        caught.code === 'LIMIT_FILE_SIZE'
          ? AppError.badRequest('That photo is too large. The limit is 5 MB.', 'PHOTO_TOO_LARGE')
          : AppError.badRequest('That photo could not be accepted', 'PHOTO_REJECTED'),
      );
      return;
    }

    if (caught) {
      next(caught);
      return;
    }

    if (!req.file) {
      next(AppError.badRequest('No photo was uploaded', 'PHOTO_REQUIRED'));
      return;
    }

    next();
  });
};

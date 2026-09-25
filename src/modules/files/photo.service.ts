import type { UploadApiResponse } from 'cloudinary';
import { env } from '../../config';
import { AppError } from '../../utils/app-error';
import cloudinary from '../../utils/cloudinary';
import { logger } from '../../utils/logger';

/**
 * Profile photos for students and teachers, hosted on Cloudinary.
 *
 * Unlike homework attachments these are not private to a class: a photo is
 * shown on every roster, register and profile the person appears on, so it is
 * served straight from Cloudinary's CDN rather than streamed through the API.
 *
 * Each person owns exactly one image, stored under a fixed public id. A new
 * upload overwrites the old one in place, so replacing a photo never leaves an
 * orphan behind, and removing it needs nothing but the person's id.
 */
export type PhotoOwner = 'students' | 'teachers';

const PHOTO_TYPES: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/heic': ['.heic'],
  'image/heif': ['.heif'],
};

export const PHOTO_MIME_TYPES = Object.keys(PHOTO_TYPES);

/** A portrait needs far less than a homework scan. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** The side, in pixels, every stored portrait is cropped to. */
const PHOTO_SIZE = 512;

const ROOT_FOLDER = 'hun-sen-turey';

export const photoPublicId = (owner: PhotoOwner, id: number): string =>
  `${ROOT_FOLDER}/${owner}/${owner === 'students' ? 'student' : 'teacher'}-${id}`;

export const assertPhotoAcceptable = (mimeType: string, originalName: string): void => {
  const extensions = PHOTO_TYPES[mimeType];
  const dot = originalName.lastIndexOf('.');
  const extension = dot === -1 ? '' : originalName.slice(dot).toLowerCase();

  if (!extensions || !extensions.includes(extension)) {
    throw AppError.badRequest(
      'That file type is not accepted. Use a JPG, PNG, WebP or HEIC photo.',
      'PHOTO_TYPE_NOT_ALLOWED',
    );
  }
};

const assertConfigured = (): void => {
  if (!env.cloudinaryEnabled) {
    throw new AppError(
      'Photo storage is not configured on the server',
      503,
      'PHOTO_STORAGE_NOT_CONFIGURED',
    );
  }
};

/**
 * Uploads a portrait and returns its CDN URL.
 *
 * The image is cropped square around the face and re-encoded as JPEG, so a
 * HEIC photo from an iPhone still displays in every browser. The returned URL
 * carries a version segment, which changes on each upload and so busts any
 * cached copy of the previous photo.
 */
export const uploadPhoto = async (
  owner: PhotoOwner,
  id: number,
  buffer: Buffer,
): Promise<string> => {
  assertConfigured();

  try {
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          public_id: photoPublicId(owner, id),
          overwrite: true,
          invalidate: true,
          resource_type: 'image',
          format: 'jpg',
          transformation: [
            { width: PHOTO_SIZE, height: PHOTO_SIZE, crop: 'fill', gravity: 'face' },
            { quality: 'auto' },
          ],
        },
        (error, response) => {
          if (error || !response) {
            reject(error ?? new Error('Cloudinary returned no response'));
            return;
          }

          resolve(response);
        },
      );

      stream.end(buffer);
    });

    return result.secure_url;
  } catch (caught) {
    // Cloudinary's message can name the account or the key; keep it in the log.
    logger.error('Cloudinary photo upload failed', caught);
    throw new AppError('The photo could not be uploaded. Please try again.', 502, 'PHOTO_UPLOAD_FAILED');
  }
};

/** Deletes a stored portrait. A photo that is already gone is not an error. */
export const deletePhoto = async (owner: PhotoOwner, id: number): Promise<void> => {
  if (!env.cloudinaryEnabled) {
    return;
  }

  try {
    await cloudinary.uploader.destroy(photoPublicId(owner, id), {
      resource_type: 'image',
      invalidate: true,
    });
  } catch (caught) {
    // The database no longer points at it, so a leftover image is harmless.
    logger.warn('Cloudinary photo delete failed', caught);
  }
};

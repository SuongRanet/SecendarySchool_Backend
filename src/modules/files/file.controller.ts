import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { sendSuccess } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';
import { isElevated } from '../../middleware/role.middleware';
import { requireUser } from '../../utils/request-context';
import * as assignmentRepository from '../assignments/assignment.repository';
import * as teacherRepository from '../teachers/teacher.repository';
import { assertStudentReadAccess } from '../students/student.access';
import { homeworkUpload, translateUploadError } from './file.middleware';
import * as service from './file.service';

/** Runs multer, mapping its errors onto the API's error shape. */
export const receiveHomeworkFile = (req: Request, res: Response, next: NextFunction): void => {
  homeworkUpload(req, res, (caught) => {
    if (caught) {
      next(translateUploadError(caught));
      return;
    }

    next();
  });
};

export const uploadHomeworkFile = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;

  if (!file) {
    throw AppError.badRequest('No file was uploaded', 'FILE_REQUIRED');
  }

  return sendSuccess(
    res,
    service.toDto('homework', file.filename, file.mimetype, file.size),
    'File uploaded successfully',
    201,
  );
});

/**
 * Streams a stored file back, but only to someone entitled to the record it
 * belongs to. The file name is unguessable, yet that is a secret, not an
 * authorisation — a link forwarded to the wrong parent must still be refused.
 */
export const downloadFile = asyncHandler(async (req: Request, res: Response) => {
  const folder = String(req.params.folder);

  if (!service.isUploadFolder(folder)) {
    throw AppError.notFound('File not found', 'FILE_NOT_FOUND');
  }

  const storedName = String(req.params.filename);
  const url = `/files/${folder}/${storedName}`;
  const owner = await assignmentRepository.findAttachmentOwner(url);

  if (!owner) {
    throw AppError.notFound('File not found', 'FILE_NOT_FOUND');
  }

  if (owner.kind === 'submission') {
    await assertStudentReadAccess(req, owner.studentId);
  } else {
    const user = requireUser(req);

    if (!isElevated(user)) {
      const teaches = user.teacherId
        ? await teacherRepository.teacherHasClassAccess(user.teacherId, owner.classId)
        : false;
      const enrolled =
        teaches ||
        (await assignmentRepository.isInClass(user.studentId, user.parentId, owner.classId));

      if (!teaches && !enrolled) {
        throw AppError.forbidden('You do not have access to this file', 'FILE_ACCESS_DENIED');
      }
    }
  }

  const absolute = service.resolveStoredFile(folder, storedName);

  // `inline` so a photograph opens in place; the browser still offers to save it.
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${encodeURIComponent(service.displayName(storedName))}"`,
  );
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.type(path.extname(absolute));

  fs.createReadStream(absolute).pipe(res);
});

/** What an upload returns to the client, and what a stored file looks like. */
export interface UploadedFileDto {
  /** Relative URL the client stores and later asks for, e.g. `/files/homework/ab12__page1.jpg`. */
  url: string;
  /** The name the student chose, recovered from the stored name for display. */
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export type UploadFolder = 'homework';

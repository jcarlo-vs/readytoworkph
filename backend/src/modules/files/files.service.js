// Uploaded files: size limits, checking image types, deleting replaced files.
import { hooks } from '../../services/hooks.js';

export const MAX_RESUME_MB = 5;

// Each worker keeps one resume file; a replaced or removed file is deleted from storage.
export const deleteFile = (key) => key && hooks.storage.remove(key).catch((err) => console.error(err));

export const MAX_PHOTO_MB = 1; // the browser crops and shrinks photos to ~400px before upload, so real ones are far smaller

// Checks the file's first bytes, so a renamed file of another type is rejected.
export const imageType = (b) =>
  b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? 'image/jpeg'
  : b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? 'image/png'
  : b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' ? 'image/webp'
  : null;

// Shown when a user has no photo, so <img> tags never error and the initials underneath show through.
export const BLANK_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

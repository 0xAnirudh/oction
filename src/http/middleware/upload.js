import multer from 'multer';
import { config } from '../../config.js';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

// Files are held in memory and handed straight to the storage driver, so
// nothing lands on the API's disk on the way to Cloudinary.
export const uploadImages = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.media.maxBytes, files: config.media.maxPerItem },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) {
      cb(Object.assign(new Error('unsupported_image_type'), { status: 415 }));
      return;
    }
    cb(null, true);
  },
}).array('images', config.media.maxPerItem);

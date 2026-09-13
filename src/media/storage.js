import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { log } from '../log.js';

// Two drivers behind one shape. Local disk is the default so the project
// runs with nothing configured; Cloudinary is the production path and
// needs three credentials in the environment.
//
// `handle` is whatever the driver needs to delete the file again - a
// relative path here, a public_id there - so a deletion does not have to
// know which driver stored it.

function localPaths(filename) {
  return {
    dir: path.resolve(process.cwd(), config.media.localDir),
    publicBase: '/uploads',
    filename,
  };
}

const localDriver = {
  name: 'local',
  async upload(file) {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const filename = `${crypto.randomUUID()}${ext}`;
    const { dir, publicBase } = localPaths(filename);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, filename), file.buffer);
    const url = `${publicBase}/${filename}`;
    return {
      url,
      // No image processing on the local driver - a thumbnail here would
      // mean a native image library for a path only used in development.
      // Cloudinary does it in the URL; this serves the original and the
      // browser scales it.
      thumbUrl: url,
      handle: filename,
    };
  },
  async remove(handle) {
    const { dir } = localPaths(handle);
    await fs.rm(path.join(dir, handle), { force: true });
  },
};

let cloudinaryClient;

async function getCloudinary() {
  if (cloudinaryClient) return cloudinaryClient;
  const { v2 } = await import('cloudinary');
  const { cloudName, apiKey, apiSecret } = config.media.cloudinary;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      'MEDIA_DRIVER=cloudinary needs CLOUDINARY_CLOUD_NAME, _API_KEY and _API_SECRET',
    );
  }
  v2.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
  cloudinaryClient = v2;
  return v2;
}

const cloudinaryDriver = {
  name: 'cloudinary',
  async upload(file) {
    const cloudinary = await getCloudinary();
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: config.media.cloudinary.folder, resource_type: 'image' },
        (err, res) => (err ? reject(err) : resolve(res)),
      );
      stream.end(file.buffer);
    });
    return {
      url: cloudinary.url(result.public_id, {
        secure: true,
        quality: 'auto',
        fetch_format: 'auto',
      }),
      thumbUrl: cloudinary.url(result.public_id, {
        secure: true,
        width: 400,
        height: 400,
        crop: 'fill',
        quality: 'auto',
        fetch_format: 'auto',
      }),
      handle: result.public_id,
      width: result.width,
      height: result.height,
    };
  },
  async remove(handle) {
    const cloudinary = await getCloudinary();
    await cloudinary.uploader.destroy(handle);
  },
};

const DRIVERS = { local: localDriver, cloudinary: cloudinaryDriver };

export function getStorage() {
  const driver = DRIVERS[config.media.driver];
  if (!driver) throw new Error(`unknown MEDIA_DRIVER: ${config.media.driver}`);
  return driver;
}

export async function uploadAll(files) {
  const storage = getStorage();
  const stored = [];
  try {
    for (const file of files) stored.push(await storage.upload(file));
    return stored;
  } catch (err) {
    // Half an upload is worse than none - the item would list with gaps.
    await Promise.all(stored.map((s) => storage.remove(s.handle).catch(() => {})));
    log.error('upload failed, rolled back', {
      err: err.message,
      rolledBack: stored.length,
    });
    throw err;
  }
}

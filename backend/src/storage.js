// Private file storage on Cloudflare R2 (S3-compatible). Files are never public:
// readers get short-lived signed links from the API.
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let client;
const s3 = () =>
  (client ??= new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  }));
const Bucket = () => process.env.R2_BUCKET;

export const storage = {
  put: (key, body, contentType) => s3().send(new PutObjectCommand({ Bucket: Bucket(), Key: key, Body: body, ContentType: contentType })),
  remove: (key) => s3().send(new DeleteObjectCommand({ Bucket: Bucket(), Key: key })),
  // `filename` makes the browser show/save the file under its original name.
  signedUrl: (key, filename, seconds = 300) =>
    getSignedUrl(s3(), new GetObjectCommand({
      Bucket: Bucket(), Key: key,
      ResponseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
    }), { expiresIn: seconds }),
};

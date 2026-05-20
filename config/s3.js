require('dotenv').config();
const { S3Client } = require('@aws-sdk/client-s3');

const s3Config = {
  region: process.env.AWS_REGION || '',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY || '',
    secretAccessKey: process.env.AWS_SECRET_KEY || ''
  }
};

// Create S3 client instance
let s3Client = null;

const getS3Client = () => {
  if (!s3Client) {
    if (!process.env.AWS_REGION || !process.env.AWS_ACCESS_KEY || !process.env.AWS_SECRET_KEY) {
      console.warn('⚠️ AWS S3 not configured. Please set AWS_REGION, AWS_ACCESS_KEY, AWS_SECRET_KEY in .env');
      return null;
    }
    s3Client = new S3Client(s3Config);
  }
  return s3Client;
};

const isS3Configured = () => {
  return !!(
    process.env.AWS_REGION &&
    process.env.AWS_ACCESS_KEY &&
    process.env.AWS_SECRET_KEY &&
    process.env.AWS_BUCKET_NAME
  );
};

const getBucketName = () => process.env.AWS_BUCKET_NAME || '';

const getS3Url = (key) => {
  if (!key) return null;
  return `https://${getBucketName()}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};

module.exports = {
  getS3Client,
  isS3Configured,
  getBucketName,
  getS3Url,
  s3Config
};

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Load AWS SDK v2 for multer-s3
const AWS = require('aws-sdk');
const multerS3 = require('multer-s3');
const { isS3Configured, getBucketName } = require('../config/s3');

// Allowed image types
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Ensure uploads directory exists (for local fallback)
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// File filter - only images allowed
const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Chỉ chấp nhận file hình ảnh (JPEG, PNG, GIF, WEBP)'), false);
  }
};

// Generate unique filename
const generateFilename = (file) => {
  const timestamp = Date.now();
  const random = Math.round(Math.random() * 1E9);
  const ext = path.extname(file.originalname).toLowerCase();
  return `${timestamp}-${random}${ext}`;
};

// Local storage configuration (fallback)
const localStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    cb(null, generateFilename(file));
  }
});

// Create multer upload instance based on configuration
let upload = null;

const getUploadInstance = () => {
  if (upload) return upload;

  if (isS3Configured()) {
    try {
      // Configure S3 client with AWS SDK v2
      const s3 = new AWS.S3({
        region: process.env.AWS_REGION,
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY
      });

      const s3Storage = multerS3({
        s3: s3,
        bucket: getBucketName(),
        contentType: (req, file, cb) => {
          cb(null, file.mimetype);
        },
        metadata: (req, file, cb) => {
          cb(null, { fieldName: file.fieldname });
        },
        key: (req, file, cb) => {
          const filename = generateFilename(file);
          cb(null, `uploads/${filename}`);
        }
      });

      upload = multer({
        storage: s3Storage,
        limits: { fileSize: MAX_FILE_SIZE },
        fileFilter: fileFilter
      });

      console.log('✅ AWS S3 upload configured');
    } catch (error) {
      console.error('❌ Error configuring S3 storage:', error.message);
      console.log('⚠️ Falling back to local storage');
      upload = multer({
        storage: localStorage,
        limits: { fileSize: MAX_FILE_SIZE },
        fileFilter: fileFilter
      });
    }
  } else {
    upload = multer({
      storage: localStorage,
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: fileFilter
    });
    console.log('ℹ️ Using local storage for uploads (S3 not configured)');
  }

  return upload;
};

// Export single upload middleware
const uploadSingle = (req, res, next) => {
  const uploadInstance = getUploadInstance();
  const singleUpload = uploadInstance.single('image');
  
  singleUpload(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'File quá lớn. Kích thước tối đa là 5MB.'
          });
        }
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn hình ảnh'
      });
    }
    
    next();
  });
};

module.exports = {
  uploadSingle,
  getUploadInstance,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE
};

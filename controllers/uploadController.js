const { uploadSingle } = require('../middleware/upload');
const { isS3Configured, getS3Url } = require('../config/s3');

// Upload single image to S3 or local storage
const uploadImage = (req, res, next) => {
  uploadSingle(req, res, (err) => {
    if (err) {
      if (err instanceof Error) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      return res.status(400).json({
        success: false,
        message: 'Đã xảy ra lỗi khi upload'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn hình ảnh'
      });
    }

    // Determine the URL based on storage type
    let fileUrl;
    let filename;

    if (isS3Configured() && req.file.location) {
      // S3 URL (from AWS)
      fileUrl = req.file.location;
      filename = req.file.key ? req.file.key.split('/').pop() : req.file.filename;
    } else {
      // Local URL fallback
      filename = req.file.filename;
      fileUrl = `/uploads/${filename}`;
    }

    res.json({
      success: true,
      message: 'Upload thành công',
      data: {
        filename: filename,
        url: fileUrl,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        storageType: isS3Configured() ? 's3' : 'local'
      }
    });
  });
};

module.exports = {
  uploadImage
};

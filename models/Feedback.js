const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID là bắt buộc']
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: [true, 'Product ID là bắt buộc']
  },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking'
  },
  customerName: {
    type: String,
    required: [true, 'Tên khách hàng là bắt buộc']
  },
  rating: {
    type: Number,
    required: [true, 'Đánh giá sao là bắt buộc'],
    min: [1, 'Số sao tối thiểu là 1'],
    max: [5, 'Số sao tối đa là 5']
  },
  title: {
    type: String,
    trim: true,
    maxlength: [200, 'Tiêu đề không được quá 200 ký tự']
  },
  content: {
    type: String,
    required: [true, 'Nội dung feedback là bắt buộc'],
    maxlength: [2000, 'Nội dung không được quá 2000 ký tự']
  },
  images: [{
    type: String
  }],
  isVerified: {
    type: Boolean,
    default: false
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  isVisible: {
    type: Boolean,
    default: true
  },
  adminReply: {
    content: String,
    repliedAt: Date,
    repliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  helpful: {
    type: Number,
    default: 0
  },
  deviceUsed: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

feedbackSchema.index({ productId: 1 });
feedbackSchema.index({ userId: 1 });
feedbackSchema.index({ rating: 1 });
feedbackSchema.index({ isFeatured: 1 });
feedbackSchema.index({ isVisible: 1 });
feedbackSchema.index({ createdAt: -1 });

feedbackSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

feedbackSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    ret.id = ret._id.toHexString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

feedbackSchema.statics.getAverageRating = async function(productId) {
  const result = await this.aggregate([
    { $match: { productId: new mongoose.Types.ObjectId(productId), isVisible: true } },
    {
      $group: {
        _id: '$productId',
        averageRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 }
      }
    }
  ]);

  return result.length > 0 ? {
    averageRating: Math.round(result[0].averageRating * 10) / 10,
    totalReviews: result[0].totalReviews
  } : { averageRating: 0, totalReviews: 0 };
};

module.exports = mongoose.model('Feedback', feedbackSchema);

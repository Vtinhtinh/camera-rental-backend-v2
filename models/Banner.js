const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Tiêu đề banner là bắt buộc'],
    trim: true,
    maxlength: [200, 'Tiêu đề không được quá 200 ký tự']
  },
  subtitle: {
    type: String,
    trim: true,
    maxlength: [300, 'Phụ đề không được quá 300 ký tự']
  },
  image: {
    type: String,
    required: [true, 'Hình ảnh banner là bắt buộc']
  },
  link: {
    type: String,
    default: ''
  },
  buttonText: {
    type: String,
    default: 'Xem ngay'
  },
  position: {
    type: String,
    enum: ['main', 'promo', 'secondary'],
    default: 'main'
  },
  order: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  startDate: {
    type: Date,
    default: null
  },
  endDate: {
    type: Date,
    default: null
  },
  backgroundColor: {
    type: String,
    default: '#ffffff'
  },
  textColor: {
    type: String,
    default: '#000000'
  }
}, {
  timestamps: true
});

bannerSchema.index({ isActive: 1 });
bannerSchema.index({ position: 1 });
bannerSchema.index({ order: 1 });

bannerSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

bannerSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    ret.id = ret._id.toHexString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Banner', bannerSchema);

const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Tên sản phẩm là bắt buộc'],
    trim: true,
    maxlength: [200, 'Tên sản phẩm không được quá 200 ký tự']
  },
  sku: {
    type: String,
    unique: true,
    trim: true,
    default: null
  },
  brand: {
    type: String,
    required: [true, 'Hãng sản xuất là bắt buộc'],
    enum: ['Canon', 'Sony', 'Fujifilm', 'Nikon', 'GoPro', 'Khác']
  },
  category: {
    type: String,
    enum: ['Du lịch', 'Vlog', 'Chuyên nghiệp'],
    default: 'Chuyên nghiệp'
  },
  description: {
    type: String,
    default: ''
  },
  specifications: {
    type: Map,
    of: String,
    default: {}
  },
  // Ảnh sản phẩm - mảng nhiều ảnh (ảnh chính là images[0])
  images: [{
    type: String,
    default: ''
  }],
  // Ảnh mẫu chụp - ảnh do máy ảnh này chụp ra
  sampleImages: [{
    type: String
  }],
  // Ảnh chính - giữ lại để tương thích với dữ liệu cũ
  mainImage: {
    type: String,
    default: ''
  },
  pricing: {
    price6h: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    price12h: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    price1d: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      description: 'Giá cho 1 ngày'
    },
    price2d: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      description: 'Giá cho 2 ngày đầu tiên'
    },
    pricePerDay: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      description: 'Giá cộng thêm cho mỗi ngày từ ngày 3'
    }
  },
  stock: {
    type: Number,
    default: 1,
    min: 0
  },
  isAvailable: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  isHot: {
    type: Boolean,
    default: false
  },
  isNew: {
    type: Boolean,
    default: false
  },
  rentalCount: {
    type: Number,
    default: 0
  },
  averageRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  reviewCount: {
    type: Number,
    default: 0
  },
  accessories: [{
    name: String,
    quantity: Number
  }],
  tags: [{
    type: String
  }]
}, {
  timestamps: true
});

productSchema.index({ name: 'text', description: 'text', brand: 'text' });
productSchema.index({ brand: 1 });
productSchema.index({ category: 1 });
productSchema.index({ isFeatured: 1 });
productSchema.index({ isHot: 1 });
productSchema.index({ isNew: 1 });
productSchema.index({ rentalCount: -1 });
productSchema.index({ price: 1 });

productSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

productSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    ret.id = ret._id.toHexString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Product', productSchema);

const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
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
  customerName: {
    type: String,
    required: [true, 'Tên khách hàng là bắt buộc'],
    trim: true
  },
  customerPhone: {
    type: String,
    required: [true, 'Số điện thoại là bắt buộc'],
    trim: true
  },
  customerEmail: {
    type: String,
    trim: true,
    lowercase: true
  },
  startDate: {
    type: Date,
    required: [true, 'Ngày bắt đầu thuê là bắt buộc']
  },
  endDate: {
    type: Date,
    required: [true, 'Ngày kết thúc thuê là bắt buộc']
  },
  rentalDays: {
    type: Number,
    required: true,
    min: 1
  },
  pricing: {
    type: {
      type: String,
      enum: ['3h', '6h', '12h', '1d', '2d', '3d+'],
      required: true
    },
    unitPrice: Number
  },
  rentalType: {
    type: String,
    enum: ['day', 'hour'],
    default: 'day'
  },
  // Hình thức nhận máy: 'store_pickup' = tới tiệm lấy, 'home_delivery' = giao tận nhà
  deliveryMethod: {
    type: String,
    enum: ['store_pickup', 'home_delivery'],
    default: 'store_pickup'
  },
  rentalHours: {
    type: Number,
    default: null
  },
  totalPrice: {
    type: Number,
    required: true,
    min: 0
  },
  deposit: {
    type: Number,
    default: 0,
    min: 0
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'delivered', 'returned', 'cancelled'],
    default: 'pending'
  },
  notes: {
    type: String,
    default: ''
  },
  deliveryAddress: {
    type: String,
    default: ''
  },
  returnAddress: {
    type: String,
    default: ''
  },
  staffNote: {
    type: String,
    default: ''
  },
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'paid', 'partial'],
    default: 'unpaid'
  },
  paymentHistory: [{
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'paymentType'
  }],
  paymentType: {
    type: String,
    enum: ['Payment', 'VietQRPayment'],
    default: null
  },
  cancelledAt: Date,
  cancelledReason: String,
  deliveredAt: Date,
  returnedAt: Date,
  // Identity verification documents
  identityDocuments: {
    cccdFront: {
      type: String,
      default: ''
    },
    cccdBack: {
      type: String,
      default: ''
    },
    vneid: {
      type: String,
      default: ''
    },
    selfie: {
      type: String,
      default: ''
    }
  },
  identityVerified: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

bookingSchema.index({ userId: 1 });
bookingSchema.index({ productId: 1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ startDate: 1 });
bookingSchema.index({ endDate: 1 });
bookingSchema.index({ createdAt: -1 });

bookingSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

bookingSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    ret.id = ret._id.toHexString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

bookingSchema.statics.checkAvailability = async function(productId, startDate, endDate, excludeBookingId = null) {
  const query = {
    productId,
    status: { $nin: ['cancelled', 'returned'] },
    $or: [
      { startDate: { $lte: new Date(endDate) }, endDate: { $gte: new Date(startDate) } }
    ]
  };

  if (excludeBookingId) {
    query._id = { $ne: excludeBookingId };
  }

  const conflictingBookings = await this.find(query);
  return conflictingBookings.length === 0;
};

module.exports = mongoose.model('Booking', bookingSchema);

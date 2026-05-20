const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID là bắt buộc']
  },
  amount: {
    type: Number,
    required: [true, 'Số tiền là bắt buộc'],
    min: [0, 'Số tiền không được âm']
  },
  paymentMethod: {
    type: String,
    enum: ['cod', 'vnpay'],
    required: [true, 'Phương thức thanh toán là bắt buộc']
  },
  paymentType: {
    type: String,
    enum: ['deposit', 'full', 'remaining'],
    default: 'deposit'
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  transactionId: {
    type: String,
    default: ''
  },
  acbData: {
    qrDataURL: String,
    qrCode: String,
    accountNumber: String,
    accountName: String,
    bankName: String,
    bankCode: String
  },
  codData: {
    fee: Number,
    deliveryAddress: String
  },
  vnpayData: {
    vnpTxnRef: String,
    vnpAmount: Number,
    vnpTransactionNo: String,
    vnpBankCode: String,
    vnpPayDate: String,
    vnpResponseCode: String
  },
  paidAt: {
    type: Date
  },
  expiresAt: {
    type: Date
  },
  description: {
    type: String,
    default: ''
  },
  notes: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

paymentSchema.index({ bookingId: 1 });
paymentSchema.index({ userId: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ paymentMethod: 1 });
paymentSchema.index({ transactionId: 1 });
paymentSchema.index({ createdAt: -1 });

paymentSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

paymentSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    ret.id = ret._id.toHexString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

paymentSchema.methods.isExpired = function() {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
};

module.exports = mongoose.model('Payment', paymentSchema);

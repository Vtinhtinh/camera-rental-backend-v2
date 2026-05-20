const mongoose = require('mongoose');

const PAYMENT_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled'
};

const vietqrPaymentSchema = new mongoose.Schema({
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null,
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID là bắt buộc'],
    index: true
  },
  amount: {
    type: Number,
    required: [true, 'Số tiền là bắt buộc'],
    min: [0, 'Số tiền không được âm'],
    validate: {
      validator: Number.isInteger,
      message: 'Số tiền phải là số nguyên (VND)'
    }
  },
  bankAccount: {
    type: String,
    required: [true, 'Số tài khoản ngân hàng là bắt buộc'],
    trim: true,
    maxlength: [20, 'Số tài khoản không được quá 20 ký tự']
  },
  bankName: {
    type: String,
    required: [true, 'Tên ngân hàng là bắt buộc'],
    trim: true,
    maxlength: [100, 'Tên ngân hàng không được quá 100 ký tự']
  },
  accountName: {
    type: String,
    required: [true, 'Tên chủ tài khoản là bắt buộc'],
    trim: true,
    maxlength: [100, 'Tên chủ tài khoản không được quá 100 ký tự']
  },
  transferContent: {
    type: String,
    required: [true, 'Nội dung chuyển khoản là bắt buộc'],
    trim: true,
    maxlength: [200, 'Nội dung chuyển khoản không được quá 200 ký tự']
  },
  qrUrl: {
    type: String,
    default: '',
    trim: true
  },
  status: {
    type: String,
    enum: Object.values(PAYMENT_STATUS),
    default: PAYMENT_STATUS.PENDING,
    index: true
  },
  paidAt: {
    type: Date,
    default: null
  },
  expiresAt: {
    type: Date,
    default: null,
    index: true
  },
  notes: {
    type: String,
    default: '',
    maxlength: [500, 'Ghi chú không được quá 500 ký tự']
  },
  // Telegram integration
  telegramMessageId: {
    type: String,
    default: null
  },
  telegramChatId: {
    type: String,
    default: null
  },
  // Cancellation info
  cancelledAt: {
    type: Date,
    default: null
  },
  cancelledBy: {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    name: {
      type: String,
      default: null
    }
  },
  cancellationReason: {
    type: String,
    default: '',
    maxlength: [500, 'Lý do hủy không được quá 500 ký tự']
  }
}, {
  timestamps: true
});

vietqrPaymentSchema.index({ createdAt: -1 });
vietqrPaymentSchema.index({ status: 1, createdAt: -1 });

vietqrPaymentSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

vietqrPaymentSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    ret.id = ret._id.toHexString();
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

vietqrPaymentSchema.methods.isExpired = function() {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
};

vietqrPaymentSchema.methods.isPending = function() {
  return this.status === PAYMENT_STATUS.PENDING;
};

vietqrPaymentSchema.methods.markAsExpired = function(reason = 'Hết hạn thanh toán') {
  this.status = PAYMENT_STATUS.EXPIRED;
  if (reason) this.notes = reason;
  return this;
};

vietqrPaymentSchema.methods.markAsCompleted = function() {
  this.status = PAYMENT_STATUS.COMPLETED;
  this.paidAt = new Date();
  return this;
};

vietqrPaymentSchema.methods.markAsFailed = function(reason = '') {
  this.status = PAYMENT_STATUS.FAILED;
  if (reason) this.notes = reason;
  return this;
};

vietqrPaymentSchema.methods.markAsCancelled = function(reason = '') {
  this.status = PAYMENT_STATUS.CANCELLED;
  this.cancelledAt = new Date();
  if (reason) this.cancellationReason = reason;
  return this;
};

vietqrPaymentSchema.statics.PAYMENT_STATUS = PAYMENT_STATUS;

const VietQRPayment = mongoose.model('VietQRPayment', vietqrPaymentSchema);

module.exports = VietQRPayment;

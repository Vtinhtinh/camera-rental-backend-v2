const Booking = require('../models/Booking');
const Product = require('../models/Product');
const VietQRPayment = require('../models/VietQRPayment');
const VietQRService = require('../services/VietQRService');
const TelegramService = require('../services/telegramService');
const { sendBookingNotification, sendStatusUpdateNotification } = require('../config/telegram');

// Payment expiration time in milliseconds (15 minutes)
const PAYMENT_EXPIRY_MS = 15 * 60 * 1000;

const calculatePricing = (startDate, endDate, product, rentalType = 'day', hours = null) => {
  // Support both old and new field names for backward compatibility
  const pricing = product.pricing || {};
  const price6h = pricing.price6h || 0;
  const price12h = pricing.price12h || 0;
  const price2d = pricing.price2d || pricing.price1d || 0;
  const pricePerDay = pricing.pricePerDay || pricing.price3dPlus || 0;

  // Hourly rental mode
  if (rentalType === 'hour' && hours) {
    let pricingType, unitPrice, totalPrice;

    if (hours === 6) {
      pricingType = '6h';
      unitPrice = price6h;
      totalPrice = price6h;
    } else if (hours === 12) {
      pricingType = '12h';
      unitPrice = price12h;
      totalPrice = price12h;
    } else {
      // Default fallback
      pricingType = '6h';
      unitPrice = price6h;
      totalPrice = price6h;
    }

    return {
      pricing: { type: pricingType, unitPrice },
      totalPrice,
      rentalDays: 1,
      rentalHours: hours
    };
  }

  // Day rental mode - New pricing logic
  const start = new Date(startDate);
  const end = new Date(endDate);
  const hoursDiff = Math.ceil((end - start) / (1000 * 60 * 60));

  // For hourly rental within same day
  if (hoursDiff <= 6) {
    return {
      pricing: { type: '6h', unitPrice: price6h },
      totalPrice: price6h,
      rentalDays: 1,
      rentalHours: 6
    };
  } else if (hoursDiff <= 12) {
    return {
      pricing: { type: '12h', unitPrice: price12h },
      totalPrice: price12h,
      rentalDays: 1,
      rentalHours: 12
    };
  }

  // Day rental: calculate number of days
  const days = Math.ceil(hoursDiff / 24);

  let totalPrice;
  let pricingType;
  let unitPrice;

  if (days <= 2) {
    // 1-2 days: use price2d (flat rate for first 2 days)
    pricingType = days === 1 ? '1d' : '2d';
    unitPrice = price2d;
    totalPrice = price2d;
  } else {
    // 3+ days: price2d + (days - 2) * pricePerDay
    pricingType = `${days}d`;
    unitPrice = pricePerDay;
    totalPrice = price2d + (days - 2) * pricePerDay;
  }

  return {
    pricing: { type: pricingType, unitPrice },
    totalPrice,
    rentalDays: days
  };
};

const createBooking = async (req, res, next) => {
  try {
    const { productId, startDate, endDate, customerName, customerPhone, customerEmail, notes, deliveryAddress, rentalType, hours, identityDocuments, deliveryMethod } = req.body;

    // Validate common fields
    if (!productId || !customerName || !customerPhone) {
      return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin bắt buộc' });
    }

    // Validate delivery method
    const validDeliveryMethods = ['store_pickup', 'home_delivery'];
    if (deliveryMethod && !validDeliveryMethods.includes(deliveryMethod)) {
      return res.status(400).json({ message: 'Hình thức nhận máy không hợp lệ' });
    }

    // Validate delivery address for home delivery
    if (deliveryMethod === 'home_delivery' && !deliveryAddress?.trim()) {
      return res.status(400).json({ message: 'Vui lòng cung cấp địa chỉ giao hàng' });
    }

    // Validate identity documents
    if (identityDocuments) {
      const { cccdFront, cccdBack, vneid, selfie } = identityDocuments;
      if (!cccdFront || !cccdBack || !vneid || !selfie) {
        return res.status(400).json({ message: 'Vui lòng cung cấp đầy đủ giấy tờ xác minh danh tính' });
      }
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Sản phẩm không tồn tại' });
    }

    if (!product.isAvailable || product.stock < 1) {
      return res.status(400).json({ message: 'Sản phẩm hiện không có sẵn' });
    }

    let pricingInfo;
    let actualStartDate, actualEndDate;

    if (rentalType === 'hour' && hours) {
      // Hourly rental
      if (![3, 6, 12].includes(hours)) {
        return res.status(400).json({ message: 'Số giờ thuê không hợp lệ' });
      }

      // For hourly rental, startDate is the pickup datetime
      if (!startDate) {
        return res.status(400).json({ message: 'Vui lòng chọn ngày/giờ nhận máy' });
      }

      actualStartDate = new Date(startDate);
      actualEndDate = new Date(actualStartDate.getTime() + hours * 60 * 60 * 1000);

      pricingInfo = calculatePricing(null, null, product, 'hour', hours);
    } else {
      // Day rental (default)
      if (!startDate || !endDate) {
        return res.status(400).json({ message: 'Vui lòng chọn ngày nhận và trả máy' });
      }

      actualStartDate = new Date(startDate);
      actualEndDate = new Date(endDate);

      if (actualStartDate >= actualEndDate) {
        return res.status(400).json({ message: 'Ngày kết thúc phải sau ngày bắt đầu' });
      }

      if (actualStartDate < new Date()) {
        return res.status(400).json({ message: 'Ngày bắt đầu không thể là ngày trong quá khứ' });
      }

      const isAvailable = await Booking.checkAvailability(productId, actualStartDate, actualEndDate);
      if (!isAvailable) {
        return res.status(400).json({ message: 'Máy ảnh đã được đặt trong khoảng thời gian này' });
      }

      pricingInfo = calculatePricing(startDate, endDate, product);
    }

    // Create booking first
    const booking = await Booking.create({
      userId: req.user._id,
      productId,
      customerName,
      customerPhone,
      customerEmail: customerEmail || req.user.email,
      startDate: actualStartDate,
      endDate: actualEndDate,
      notes,
      deliveryAddress: deliveryMethod === 'home_delivery' ? deliveryAddress : '',
      rentalType: rentalType || 'day',
      deliveryMethod: deliveryMethod || 'store_pickup',
      paymentStatus: 'unpaid',
      paymentType: 'VietQRPayment',
      identityDocuments: identityDocuments || {},
      ...pricingInfo
    });

    // Check for existing pending VietQR payment (reuse if available)
    const existingPendingPayment = await VietQRPayment.findOne({
      booking: booking._id,
      status: VietQRPayment.PAYMENT_STATUS.PENDING
    });

    // If existing pending payment exists and not expired, reuse it
    if (existingPendingPayment && !existingPendingPayment.isExpired()) {
      // Link existing payment to booking
      booking.paymentHistory = [existingPendingPayment._id];
      await booking.save();

      await booking.populate('productId');

      await Product.findByIdAndUpdate(productId, {
        $inc: { rentalCount: 1 }
      });

      await sendBookingNotification(booking);

      // Send VietQR payment alert with inline buttons
      await TelegramService.sendVietQRPaymentAlert(existingPendingPayment, booking);

      return res.status(201).json({
        success: true,
        message: 'Đặt thuê thành công',
        data: {
          booking,
          payment: {
            id: existingPendingPayment._id,
            amount: existingPendingPayment.amount,
            transferContent: existingPendingPayment.transferContent,
            qrUrl: existingPendingPayment.qrUrl,
            bankInfo: {
              bankName: existingPendingPayment.bankName,
              accountNumber: existingPendingPayment.bankAccount,
              accountName: existingPendingPayment.accountName
            },
            expiresAt: existingPendingPayment.expiresAt,
            reused: true
          }
        }
      });
    }

    // If existing payment is expired or not found, create new payment
    // First, expire any existing pending payments for this booking
    if (existingPendingPayment) {
      existingPendingPayment.markAsExpired('Thay thế bằng thanh toán mới');
      await existingPendingPayment.save();
    }

    const bankInfo = VietQRService.getBankInfo();
    const transferContent = VietQRService.formatTransferContent(booking._id.toString());

    // Generate QR URL
    let qrUrl = '';
    try {
      qrUrl = await VietQRService.generateQRImageUrl(pricingInfo.totalPrice, transferContent);
    } catch (qrError) {
      console.warn('[Booking] Failed to generate QR URL:', qrError.message);
    }

    const vietqrPayment = await VietQRPayment.create({
      booking: booking._id,
      user: req.user._id,
      amount: pricingInfo.totalPrice,
      bankAccount: bankInfo.accountNumber,
      bankName: bankInfo.bankName,
      accountName: bankInfo.accountName,
      transferContent: transferContent,
      qrUrl: qrUrl,
      status: VietQRPayment.PAYMENT_STATUS.PENDING,
      expiresAt: new Date(Date.now() + PAYMENT_EXPIRY_MS)
    });
    console.log('[createBooking] Created VietQRPayment:', vietqrPayment._id);

    // Link payment to booking
    booking.paymentHistory = [vietqrPayment._id];
    await booking.save();

    await booking.populate('productId');

    await Product.findByIdAndUpdate(productId, {
      $inc: { rentalCount: 1 }
    });

    await sendBookingNotification(booking);

    // Send VietQR payment alert with inline buttons
    await TelegramService.sendVietQRPaymentAlert(vietqrPayment, booking);

    res.status(201).json({
      success: true,
      message: 'Đặt thuê thành công',
      data: {
        booking,
        payment: {
          id: vietqrPayment._id,
          amount: vietqrPayment.amount,
          transferContent: vietqrPayment.transferContent,
          qrUrl: vietqrPayment.qrUrl,
          bankInfo: bankInfo,
          expiresAt: vietqrPayment.expiresAt
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

const getMyBookings = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const query = { userId: req.user._id };

    if (status) {
      query.status = status;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [bookings, total] = await Promise.all([
      Booking.find(query)
        .populate('productId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Booking.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        bookings,
        pagination: {
          currentPage: Number(page),
          totalPages: Math.ceil(total / Number(limit)),
          totalBookings: total
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

const getBookingById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const booking = await Booking.findById(id)
      .populate('productId')
      .populate('userId', 'name email phone')
      .populate({
        path: 'paymentHistory',
        populate: { path: 'booking' }
      });

    // If paymentHistory is not properly populated, try to fetch payments separately
    console.log('[getBookingById] paymentHistory before check:', JSON.stringify(booking.paymentHistory, null, 2));
    if (booking.paymentHistory && booking.paymentHistory.length > 0) {
      const firstPayment = booking.paymentHistory[0];
      console.log('[getBookingById] firstPayment type:', typeof firstPayment);
      console.log('[getBookingById] firstPayment:', firstPayment);
      // Check if it's populated (has _id) or just an ObjectId string
      const isPopulated = firstPayment && typeof firstPayment === 'object' && firstPayment._id;
      console.log('[getBookingById] isPopulated:', isPopulated);

      if (!isPopulated) {
        // It's an ObjectId, fetch the payment from VietQRPayment collection
        const VietQRPayment = require('../models/VietQRPayment');
        try {
          const populatedPayments = await Promise.all(
            booking.paymentHistory.map(async (paymentId) => {
              try {
                const payment = await VietQRPayment.findById(paymentId);
                console.log('[getBookingById] Fetched payment:', payment?._id);
                return payment;
              } catch {
                return null;
              }
            })
          );
          booking.paymentHistory = populatedPayments.filter(p => p !== null);
          console.log('[getBookingById] paymentHistory after populate:', booking.paymentHistory.length, 'payments');
        } catch (err) {
          console.log('[getBookingById] Could not populate paymentHistory:', err.message);
        }
      }
    }

    if (!booking) {
      return res.status(404).json({ message: 'Đơn thuê không tồn tại' });
    }

    const bookingUserId = booking.userId._id ? booking.userId._id.toString() : booking.userId.toString();

    if (bookingUserId !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Bạn không có quyền xem đơn này' });
    }

    res.json({
      success: true,
      data: { booking }
    });
  } catch (error) {
    next(error);
  }
};

const cancelBooking = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const booking = await Booking.findById(id);

    if (!booking) {
      return res.status(404).json({ message: 'Đơn thuê không tồn tại' });
    }

    if (booking.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Bạn không có quyền hủy đơn này' });
    }

    if (['delivered', 'returned', 'cancelled'].includes(booking.status)) {
      return res.status(400).json({ message: 'Không thể hủy đơn ở trạng thái này' });
    }

    booking.status = 'cancelled';
    booking.cancelledAt = new Date();
    booking.cancelledReason = reason || '';
    await booking.save();

    res.json({
      success: true,
      message: 'Hủy đơn thuê thành công',
      data: { booking }
    });
  } catch (error) {
    next(error);
  }
};

const getAllBookings = async (req, res, next) => {
  try {
    const { status, startDate, endDate, page = 1, limit = 20 } = req.query;
    const query = {};

    if (status) {
      query.status = status;
    }

    if (startDate || endDate) {
      query.startDate = {};
      if (startDate) query.startDate.$gte = new Date(startDate);
      if (endDate) query.startDate.$lte = new Date(endDate);
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [bookings, total] = await Promise.all([
      Booking.find(query)
        .populate('productId')
        .populate('userId', 'name email phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Booking.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        bookings,
        pagination: {
          currentPage: Number(page),
          totalPages: Math.ceil(total / Number(limit)),
          totalBookings: total
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

const updateBookingStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, staffNote } = req.body;

    const booking = await Booking.findById(id);

    if (!booking) {
      return res.status(404).json({ message: 'Đơn thuê không tồn tại' });
    }

    const oldStatus = booking.status;
    const validStatuses = ['pending', 'confirmed', 'processing', 'delivered', 'returned', 'cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
    }

    booking.status = status;
    if (staffNote) booking.staffNote = staffNote;
    if (status === 'delivered') booking.deliveredAt = new Date();
    if (status === 'returned') booking.returnedAt = new Date();

    await booking.save();
    await booking.populate('productId');

    await sendStatusUpdateNotification(booking, oldStatus, status);

    res.json({
      success: true,
      message: 'Cập nhật trạng thái thành công',
      data: { booking }
    });
  } catch (error) {
    next(error);
  }
};

const getBookingStats = async (req, res, next) => {
  try {
    const [total, pending, processing, delivered, returned, cancelled, todayRevenue] = await Promise.all([
      Booking.countDocuments(),
      Booking.countDocuments({ status: 'pending' }),
      Booking.countDocuments({ status: 'processing' }),
      Booking.countDocuments({ status: 'delivered' }),
      Booking.countDocuments({ status: 'returned' }),
      Booking.countDocuments({ status: 'cancelled' }),
      Booking.aggregate([
        {
          $match: {
            createdAt: {
              $gte: new Date(new Date().setHours(0, 0, 0, 0))
            }
          }
        },
        { $group: { _id: null, total: { $sum: '$totalPrice' } } }
      ])
    ]);

    res.json({
      success: true,
      data: {
        total,
        pending,
        processing,
        delivered,
        returned,
        cancelled,
        todayRevenue: todayRevenue[0]?.total || 0
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createBooking,
  getMyBookings,
  getBookingById,
  cancelBooking,
  getAllBookings,
  updateBookingStatus,
  getBookingStats
};

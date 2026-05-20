const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const VietQRPayment = require('../models/VietQRPayment');
const PaymentService = require('../services/PaymentService');
const VietQRService = require('../services/VietQRService');
const VNPayService = require('../services/VNPayService');
const TelegramService = require('../services/telegramService');
const { sendPaymentConfirmationNotification, sendPendingPaymentAlert, emitPaymentUpdate } = require('../config/telegram');

const paymentController = {
  async createPayment(req, res) {
    try {
      const { bookingId, amount, paymentMethod, paymentType, description } = req.body;
      const userId = req.user.id;

      if (!bookingId || !amount || !paymentMethod) {
        return res.status(400).json({
          success: false,
          message: 'Thiếu thông tin bắt buộc'
        });
      }

      const booking = await Booking.findById(bookingId);
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy đơn đặt hàng'
        });
      }

      const payment = new Payment({
        bookingId,
        userId,
        amount,
        paymentMethod,
        paymentType: paymentType || 'deposit',
        status: 'pending',
        description: description || `Thanh toán đơn hàng ${bookingId}`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      await payment.save();

      const paymentResult = await PaymentService.processPayment({
        method: paymentMethod,
        amount,
        bookingId,
        userId,
        description: payment.description
      });

      if (!paymentResult.success) {
        payment.status = 'failed';
        payment.notes = paymentResult.error;
        await payment.save();

        return res.status(400).json({
          success: false,
          message: paymentResult.error
        });
      }

      payment.transactionId = paymentResult.qrData?.transactionId ||
                              paymentResult.transactionRef;
      await payment.save();

      res.status(201).json({
        success: true,
        message: 'Tạo thanh toán thành công',
        data: {
          payment: payment,
          qrData: paymentResult.qrData,
          paymentDetails: paymentResult.paymentDetails
        }
      });
    } catch (error) {
      console.error('Create payment error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server khi tạo thanh toán'
      });
    }
  },

  async generateQRCode(req, res) {
    try {
      const { amount, bookingId, description } = req.body;
      const userId = req.user.id;

      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Số tiền không hợp lệ'
        });
      }

      const result = await PaymentService.generateACBQRCode(amount, bookingId, description);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error || 'Lỗi tạo mã QR'
        });
      }

      const payment = new Payment({
        bookingId: bookingId || null,
        userId,
        amount,
        paymentMethod: 'acb_qr',
        paymentType: 'deposit',
        status: 'pending',
        transactionId: result.qrData.transactionId,
        description: description || 'Thanh toán qua QR ACB',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      await payment.save();

      res.json({
        success: true,
        message: 'Tạo mã QR thành công',
        data: {
          paymentId: payment._id,
          ...result.qrData
        }
      });
    } catch (error) {
      console.error('Generate QR error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server khi tạo mã QR'
      });
    }
  },

  async getPaymentInfo(req, res) {
    try {
      const { paymentId } = req.params;

      // Try to find in Payment collection first
      let payment = await Payment.findById(paymentId).populate('bookingId');

      // If not found, try VietQRPayment collection
      if (!payment) {
        payment = await VietQRPayment.findById(paymentId).populate('booking');
      }

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy thanh toán'
        });
      }

      // Check and auto-expire if needed
      if (payment.isExpired && payment.isExpired() && payment.status === VietQRPayment.PAYMENT_STATUS.PENDING) {
        payment.markAsExpired('Tự động hết hạn');
        await payment.save();
      }

      const isVietQR = payment.constructor.modelName === 'VietQRPayment';

      const transferInfo = isVietQR ? {
        bankName: payment.bankName,
        accountNumber: payment.bankAccount,
        accountName: payment.accountName,
        amount: payment.amount,
        description: payment.transferContent
      } : PaymentService.generateACBTransferInfo(
        payment.amount,
        payment.bookingId?._id || payment.bookingId,
        payment.description
      );

      res.json({
        success: true,
        data: {
          payment: {
            id: payment._id,
            amount: payment.amount,
            status: payment.status,
            expiresAt: payment.expiresAt,
            transferContent: isVietQR ? payment.transferContent : payment.description,
            qrUrl: isVietQR ? payment.qrUrl : null,
            bankInfo: isVietQR ? {
              bankName: payment.bankName,
              accountNumber: payment.bankAccount,
              accountName: payment.accountName
            } : null,
            isVietQR
          },
          transferInfo
        }
      });
    } catch (error) {
      console.error('Get payment error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
    }
  },

  // Get payment by booking ID
  async getPaymentByBooking(req, res) {
    try {
      const { bookingId } = req.params;

      // Find VietQRPayment by booking
      const vietqrPayment = await VietQRPayment.findOne({ booking: bookingId })
        .sort({ createdAt: -1 });

      if (vietqrPayment) {
        // Check and auto-expire if needed
        if (vietqrPayment.isExpired() && vietqrPayment.status === VietQRPayment.PAYMENT_STATUS.PENDING) {
          vietqrPayment.markAsExpired('Tự động hết hạn');
          await vietqrPayment.save();
        }

        return res.json({
          success: true,
          data: {
            payment: {
              id: vietqrPayment._id,
              amount: vietqrPayment.amount,
              status: vietqrPayment.status,
              expiresAt: vietqrPayment.expiresAt,
              transferContent: vietqrPayment.transferContent,
              qrUrl: vietqrPayment.qrUrl,
              bankInfo: {
                bankName: vietqrPayment.bankName,
                accountNumber: vietqrPayment.bankAccount,
                accountName: vietqrPayment.accountName
              },
              isVietQR: true,
              createdAt: vietqrPayment.createdAt
            }
          }
        });
      }

      // If no VietQRPayment, try regular Payment
      const booking = await Booking.findById(bookingId);
      if (booking?.paymentHistory?.length > 0) {
        const payment = await Payment.findById(booking.paymentHistory[booking.paymentHistory.length - 1]);
        if (payment) {
          return res.json({
            success: true,
            data: {
              payment: {
                id: payment._id,
                amount: payment.amount,
                status: payment.status,
                expiresAt: payment.expiresAt,
                description: payment.description,
                isVietQR: false
              }
            }
          });
        }
      }

      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thanh toán cho đơn hàng này'
      });
    } catch (error) {
      console.error('Get payment by booking error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
    }
  },

  async confirmPayment(req, res) {
    try {
      const { paymentId } = req.params;
      const { notes } = req.body;

      const payment = await Payment.findById(paymentId);

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy thanh toán'
        });
      }

      if (payment.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Thanh toán đã được xử lý'
        });
      }

      payment.status = 'completed';
      payment.paidAt = new Date();
      payment.notes = notes || payment.notes;
      await payment.save();

      if (payment.bookingId) {
        await Booking.findByIdAndUpdate(payment.bookingId, {
          paymentStatus: 'paid',
          $push: { paymentHistory: payment._id }
        });
      }

      res.json({
        success: true,
        message: 'Xác nhận thanh toán thành công',
        data: payment
      });
    } catch (error) {
      console.error('Confirm payment error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
    }
  },

  async cancelPayment(req, res) {
    try {
      const { paymentId } = req.params;
      const { reason } = req.body;

      const payment = await Payment.findById(paymentId);

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy thanh toán'
        });
      }

      if (payment.status === 'completed') {
        return res.status(400).json({
          success: false,
          message: 'Không thể hủy thanh toán đã hoàn thành'
        });
      }

      payment.status = 'cancelled';
      payment.notes = reason || 'Hủy bởi người dùng';
      await payment.save();

      res.json({
        success: true,
        message: 'Hủy thanh toán thành công',
        data: payment
      });
    } catch (error) {
      console.error('Cancel payment error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
    }
  },

  async getUserPayments(req, res) {
    try {
      const userId = req.user.id;
      const { status, page = 1, limit = 10 } = req.query;

      const query = { userId };
      if (status) {
        query.status = status;
      }

      const payments = await Payment.find(query)
        .populate('bookingId')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

      const total = await Payment.countDocuments(query);

      res.json({
        success: true,
        data: {
          payments,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      console.error('Get user payments error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
    }
  },

  async getAllPayments(req, res) {
    try {
      const { status, paymentMethod, page = 1, limit = 20 } = req.query;

      const query = {};
      if (status) query.status = status;
      if (paymentMethod) query.paymentMethod = paymentMethod;

      const payments = await Payment.find(query)
        .populate('bookingId')
        .populate('userId', 'name email phone')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

      const total = await Payment.countDocuments(query);

      // Stats from Payment collection (regular payments)
      const paymentStats = await Payment.aggregate([
        { $match: { status: 'completed' } },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ]);

      // Stats from VietQRPayment collection
      const vietqrStats = await VietQRPayment.aggregate([
        { $match: { status: VietQRPayment.PAYMENT_STATUS.COMPLETED } },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ]);

      // Total payments from both collections
      const totalPaymentsCount = await Payment.countDocuments() + await VietQRPayment.countDocuments();

      // Pending payments from both collections
      const pendingPaymentCount = await Payment.countDocuments({ status: 'pending' });
      const pendingVietqrCount = await VietQRPayment.countDocuments({ status: VietQRPayment.PAYMENT_STATUS.PENDING });
      const totalPending = pendingPaymentCount + pendingVietqrCount;

      // Combine stats from both collections
      const totalCompleted = (paymentStats[0]?.count || 0) + (vietqrStats[0]?.count || 0);
      const totalAmount = (paymentStats[0]?.totalAmount || 0) + (vietqrStats[0]?.totalAmount || 0);

      console.log('[Stats Debug] Payment stats:', paymentStats);
      console.log('[Stats Debug] VietQR stats:', vietqrStats);
      console.log('[Stats Debug] Combined - count:', totalCompleted, 'amount:', totalAmount);

      res.json({
        success: true,
        data: {
          payments,
          stats: {
            totalCompleted,
            totalAmount,
            totalPayments: totalPaymentsCount,
            pendingPayments: totalPending
          },
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: totalPaymentsCount,
            pages: Math.ceil(totalPaymentsCount / limit)
          }
        }
      });
    } catch (error) {
      console.error('Get all payments error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
    }
  },

  // Get all VietQR payments with booking info
  async getAllVietQRPayments(req, res) {
    try {
      const { status, page = 1, limit = 50 } = req.query;

      const query = {};
      if (status) query.status = status;

      const payments = await VietQRPayment.find(query)
        .populate('booking')
        .populate('user', 'name email phone')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

      const total = await VietQRPayment.countDocuments(query);

      const stats = await VietQRPayment.aggregate([
        { $match: { status: VietQRPayment.PAYMENT_STATUS.COMPLETED } },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ]);

      res.json({
        success: true,
        data: {
          payments: payments.map(p => ({
            id: p._id,
            amount: p.amount,
            bankName: p.bankName,
            bankAccount: p.bankAccount,
            accountName: p.accountName,
            transferContent: p.transferContent,
            qrUrl: p.qrUrl,
            status: p.status,
            paidAt: p.paidAt,
            expiresAt: p.expiresAt,
            notes: p.notes,
            createdAt: p.createdAt,
            booking: p.booking,
            user: p.user
          })),
          stats: {
            totalCompleted: stats[0]?.count || 0,
            totalAmount: stats[0]?.totalAmount || 0
          },
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      console.error('Get all VietQR payments error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
    }
  },

  async getPaymentStats(req, res) {
    try {
      const { startDate, endDate } = req.query;

      const matchStage = {};
      if (startDate || endDate) {
        matchStage.createdAt = {};
        if (startDate) matchStage.createdAt.$gte = new Date(startDate);
        if (endDate) matchStage.createdAt.$lte = new Date(endDate);
      }

      const stats = await Payment.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' }
          }
        }
      ]);

      const methodStats = await Payment.aggregate([
        { $match: { ...matchStage, status: 'completed' } },
        {
          $group: {
            _id: '$paymentMethod',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' }
          }
        }
      ]);

      const pendingCount = stats.find(s => s._id === 'pending')?.count || 0;
      const completedStats = stats.find(s => s._id === 'completed') || { count: 0, totalAmount: 0 };

      res.json({
        success: true,
        data: {
          overview: {
            pendingPayments: pendingCount,
            completedPayments: completedStats.count,
            totalRevenue: completedStats.totalAmount
          },
          byStatus: stats,
          byMethod: methodStats
        }
      });
    } catch (error) {
      console.error('Get payment stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
    }
  },

  // ==================== VNPAY PAYMENT ====================
  async createVNPayPayment(req, res) {
    try {
      const { bookingId, amount, description } = req.body;
      const userId = req.user.id;

      console.log('='.repeat(60));
      console.log('[VNPay] CREATE PAYMENT REQUEST');
      console.log('='.repeat(60));
      console.log('User ID:', userId);
      console.log('Booking ID:', bookingId);
      console.log('Amount:', amount, 'Type:', typeof amount);
      console.log('Description:', description);
      console.log('Request IP:', req.ip);
      console.log('X-Forwarded-For:', req.headers['x-forwarded-for']);
      console.log('='.repeat(60));

      // Validate amount - VNPay Sandbox requires minimum 1000 VND
      const numericAmount = parseFloat(amount);
      const MIN_AMOUNT = 10000; // Minimum 10,000 VND for sandbox

      if (!amount || isNaN(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Số tiền không hợp lệ'
        });
      }

      if (numericAmount < MIN_AMOUNT) {
        return res.status(400).json({
          success: false,
          message: `Số tiền tối thiểu cho thanh toán VNPay là ${MIN_AMOUNT.toLocaleString()} VND`
        });
      }

      // Generate unique order ID
      const orderId = `VNP${Date.now()}${Math.floor(Math.random() * 999)}`;

      // Create safe description - remove Vietnamese diacritics and special characters
      const safeDescription = description
        ? description
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
            .replace(/[<>\"'&%#]/g, '')       // Remove dangerous chars
            .replace(/\s+/g, '-')             // Replace spaces with hyphens
            .substring(0, 100)               // Truncate to 100 chars
        : `Thanh-toan-don-hang-${orderId}`;

      console.log('[VNPay] Creating payment URL for order:', orderId);
      console.log('[VNPay] Safe description:', safeDescription);

      // Create payment URL
      const paymentData = VNPayService.createPaymentUrl({
        amount: numericAmount,
        orderId,
        description: safeDescription,
        req
      });

      console.log('[VNPay] Payment URL created:', paymentData.paymentUrl ? 'SUCCESS' : 'FAILED');

      // Save payment record
      const payment = new Payment({
        bookingId: bookingId || null,
        userId,
        amount: numericAmount,
        paymentMethod: 'vnpay',
        paymentType: 'deposit',
        status: 'pending',
        transactionId: orderId,
        description: `Thanh toan VNPay - ${orderId}`,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        vnpayData: {
          vnpTxnRef: orderId,
          vnpAmount: numericAmount * 100
        }
      });

      await payment.save();
      console.log('[VNPay] Payment record saved:', payment._id);

      res.json({
        success: true,
        message: 'Tạo thanh toán VNPay thành công',
        data: {
          paymentId: payment._id,
          paymentUrl: paymentData.paymentUrl,
          orderId: paymentData.orderId,
          amount: paymentData.amount,
          expireTime: paymentData.expireTime,
          clientIp: paymentData.clientIp
        }
      });
    } catch (error) {
      console.error('[VNPay] CREATE PAYMENT ERROR:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi tạo thanh toán VNPay: ' + error.message
      });
    }
  },

  async vnpayReturn(req, res) {
    try {
      const query = req.query;
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
      
      console.log('='.repeat(60));
      console.log('[VNPay] RETURN URL HIT');
      console.log('='.repeat(60));
      console.log('Query:', query);
      console.log('Client URL:', clientUrl);
      console.log('='.repeat(60));

      // Verify secure hash FIRST
      const isValidSignature = VNPayService.verifyReturnUrl(query);

      console.log('[VNPay] Signature valid:', isValidSignature);

      if (!isValidSignature) {
        console.log('[VNPay] INVALID SIGNATURE - Redirecting to error page');
        return res.redirect(`${clientUrl}/payment/vnpay-return?success=false&message=invalid_signature`);
      }

      const {
        vnp_ResponseCode,
        vnp_TxnRef,
        vnp_Amount,
        vnp_TransactionNo,
        vnp_BankCode,
        vnp_PayDate,
        vnp_OrderInfo
      } = query;

      console.log('[VNPay] Transaction details:', {
        responseCode: vnp_ResponseCode,
        txnRef: vnp_TxnRef,
        amount: vnp_Amount,
        transactionNo: vnp_TransactionNo,
        bankCode: vnp_BankCode,
        payDate: vnp_PayDate
      });

      // Find payment by transaction reference
      const payment = await Payment.findOne({ transactionId: vnp_TxnRef });

      if (!payment) {
        console.log('[VNPay] Payment not found for txnRef:', vnp_TxnRef);
        return res.redirect(`${clientUrl}/payment/vnpay-return?success=false&message=payment_not_found`);
      }

      console.log('[VNPay] Payment found:', payment._id, 'Status:', payment.status);

      // Check if already processed
      if (payment.status === 'completed') {
        console.log('[VNPay] Payment already processed');
        return res.redirect(`${clientUrl}/payment/vnpay-return?success=true&order=${vnp_TxnRef}&already_processed=true`);
      }

      // Update payment based on response code
      const responseResult = VNPayService.getResponseCodeResult(vnp_ResponseCode);
      console.log('[VNPay] Response result:', responseResult);

      if (responseResult.success) {
        payment.status = 'completed';
        payment.paidAt = new Date();
        payment.vnpayData = {
          ...payment.vnpayData,
          vnpTransactionNo: vnp_TransactionNo,
          vnpBankCode: vnp_BankCode,
          vnpPayDate: vnp_PayDate,
          vnpResponseCode: vnp_ResponseCode,
          vnpOrderInfo: vnp_OrderInfo
        };

        // Update booking payment status
        if (payment.bookingId) {
          await Booking.findByIdAndUpdate(payment.bookingId, {
            paymentStatus: 'paid',
            $push: { paymentHistory: payment._id }
          });
          console.log('[VNPay] Booking updated to paid');
        }
      } else {
        payment.status = 'failed';
        payment.notes = responseResult.message;
        payment.vnpayData = {
          ...payment.vnpayData,
          vnpResponseCode: vnp_ResponseCode
        };
        console.log('[VNPay] Payment marked as failed:', responseResult.message);
      }

      await payment.save();
      console.log('[VNPay] Payment saved');

      // Redirect to frontend
      const redirectUrl = responseResult.success
        ? `${clientUrl}/payment/vnpay-return?success=true&order=${vnp_TxnRef}&amount=${vnp_Amount}`
        : `${clientUrl}/payment/vnpay-return?success=false&order=${vnp_TxnRef}&code=${vnp_ResponseCode}&message=${encodeURIComponent(responseResult.message)}`;

      console.log('[VNPay] Redirecting to:', redirectUrl);
      res.redirect(redirectUrl);
    } catch (error) {
      console.error('[VNPay] RETURN URL ERROR:', error);
      res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/payment/vnpay-return?success=false&message=server_error`);
    }
  },

  async getVNPayIpn(req, res) {
    try {
      const query = req.query;

      // Verify secure hash
      const isValidSignature = VNPayService.verifyReturnUrl(query);

      if (!isValidSignature) {
        return res.status(200).json({ RspCode: '97', Message: 'Invalid signature' });
      }

      const { vnp_ResponseCode, vnp_TxnRef, vnp_Amount } = query;

      const payment = await Payment.findOne({ transactionId: vnp_TxnRef });

      if (!payment) {
        return res.status(200).json({ RspCode: '01', Message: 'Payment not found' });
      }

      // Check if already processed
      if (payment.status === 'completed') {
        return res.status(200).json({ RspCode: '00', Message: 'Confirm Success' });
      }

      // Process based on response code
      if (vnp_ResponseCode === '00') {
        payment.status = 'completed';
        payment.paidAt = new Date();

        if (payment.bookingId) {
          await Booking.findByIdAndUpdate(payment.bookingId, {
            paymentStatus: 'paid',
            $push: { paymentHistory: payment._id }
          });
        }

        await payment.save();
        return res.status(200).json({ RspCode: '00', Message: 'Confirm Success' });
      } else {
        payment.status = 'failed';
        payment.notes = `VNPay error code: ${vnp_ResponseCode}`;
        await payment.save();
        return res.status(200).json({ RspCode: vnp_ResponseCode, Message: 'Payment failed' });
      }
    } catch (error) {
      console.error('VNPay IPN error:', error);
      res.status(200).json({ RspCode: '99', Message: 'Unknown error' });
    }
  },

  // ==================== VIETQR PAYMENT ====================
  async createVietQRPayment(req, res) {
    try {
      const { bookingId, amount } = req.body;
      const userId = req.user.id;

      // Validation
      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Số tiền thanh toán không hợp lệ'
        });
      }

      // Verify booking exists if provided
      if (bookingId) {
        const booking = await Booking.findById(bookingId);
        if (!booking) {
          return res.status(404).json({
            success: false,
            message: 'Không tìm thấy đơn đặt hàng'
          });
        }
      }

      // Generate unique transfer content
      const transferContent = VietQRService.formatTransferContent(bookingId);

      // Generate VietQR URL
      const qrImageUrl = await VietQRService.generateQRImageUrl(amount, transferContent);

      // Get bank info
      const bankInfo = VietQRService.getBankInfo();

      // Create payment record
      const payment = new VietQRPayment({
        booking: bookingId || null,
        user: userId,
        amount: Math.floor(amount),
        bankAccount: bankInfo.accountNumber,
        bankName: bankInfo.bankName,
        accountName: bankInfo.accountName,
        transferContent: transferContent,
        qrUrl: qrImageUrl,
        status: VietQRPayment.PAYMENT_STATUS.PENDING,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
      });

      await payment.save();

      // Send Telegram notification with inline buttons
      let bookingInfo = null;
      if (bookingId) {
        bookingInfo = await Booking.findById(bookingId).populate('productId');
      }
      await TelegramService.sendVietQRPaymentAlert(payment, bookingInfo);

      res.status(201).json({
        success: true,
        message: 'Tạo thanh toán VietQR thành công',
        data: {
          paymentId: payment._id,
          amount: payment.amount,
          transferContent: payment.transferContent,
          qrUrl: qrImageUrl,
          bankInfo: bankInfo,
          expiresAt: payment.expiresAt,
          formattedAmount: VietQRService.formatCurrency(amount)
        }
      });
    } catch (error) {
      console.error('[VietQR] Create payment error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Lỗi server khi tạo thanh toán VietQR'
      });
    }
  },

  // ==================== ADMIN VIETQR PAYMENT CONFIRMATION ====================
  async adminConfirmPayment(req, res) {
    try {
      const { paymentId } = req.params;
      const { notes } = req.body;
      const adminId = req.user.id;
      const adminName = req.user.name || 'Admin';

      console.log('[Admin Confirm VietQR] paymentId:', paymentId, 'adminId:', adminId);

      // Find payment
      const payment = await VietQRPayment.findById(paymentId);
      console.log('[Admin Confirm VietQR] payment found:', payment ? 'yes' : 'no', 'status:', payment?.status);

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy thanh toán'
        });
      }

      // Check if payment is expired (auto-expire if needed)
      if (payment.isExpired && payment.isExpired() && payment.status === VietQRPayment.PAYMENT_STATUS.PENDING) {
        payment.markAsExpired('Tự động hết hạn trước khi xác nhận');
        await payment.save();
      }

      // Validate payment status - return specific error message
      if (payment.status === VietQRPayment.PAYMENT_STATUS.COMPLETED) {
        return res.status(400).json({
          success: false,
          message: 'Thanh toán đã được xác nhận trước đó'
        });
      }

      if (payment.status === VietQRPayment.PAYMENT_STATUS.CANCELLED) {
        return res.status(400).json({
          success: false,
          message: 'Không thể xác nhận thanh toán đã bị hủy'
        });
      }

      if (payment.status === VietQRPayment.PAYMENT_STATUS.EXPIRED) {
        return res.status(400).json({
          success: false,
          message: 'Thanh toán đã hết hạn. Vui lòng tạo thanh toán mới.'
        });
      }

      if (payment.status === VietQRPayment.PAYMENT_STATUS.FAILED) {
        return res.status(400).json({
          success: false,
          message: 'Thanh toán đã thất bại trước đó. Vui lòng tạo thanh toán mới.'
        });
      }

      // Update payment status
      payment.markAsCompleted();
      if (notes) {
        payment.notes = notes;
      }
      await payment.save();
      console.log('[Admin Confirm VietQR] Payment marked as completed');

      // Update booking if exists
      let booking = null;
      if (payment.booking) {
        booking = await Booking.findById(payment.booking);
        if (booking) {
          booking.paymentStatus = 'paid';
          booking.status = 'confirmed';
          if (!booking.paymentHistory) booking.paymentHistory = [];
          booking.paymentHistory.push(payment._id);
          await booking.save();
          console.log('[Admin Confirm VietQR] Booking updated:', booking._id);
        }
      }

      // Send Telegram notification (await to ensure it completes)
      try {
        await sendPaymentConfirmationNotification(payment, booking, adminName);
        console.log('[Admin Confirm VietQR] Telegram notification sent');
      } catch (telegramError) {
        console.error('[Admin Confirm VietQR] Telegram notification error:', telegramError);
        // Continue even if Telegram fails - don't fail the whole request
      }

      // Emit SSE event for frontend sync
      emitPaymentUpdate(paymentId, 'confirmed');
      console.log('[Admin Confirm VietQR] SSE event emitted');

      res.json({
        success: true,
        message: 'Xác nhận thanh toán thành công',
        data: {
          payment: {
            id: payment._id,
            amount: payment.amount,
            status: payment.status,
            paidAt: payment.paidAt,
            transferContent: payment.transferContent
          },
          booking: booking ? {
            id: booking._id,
            status: booking.status,
            paymentStatus: booking.paymentStatus
          } : null,
          admin: {
            id: adminId,
            name: adminName
          }
        }
      });
    } catch (error) {
      console.error('[Admin] Confirm payment error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server khi xác nhận thanh toán: ' + error.message
      });
    }
  },

  // ==================== ADMIN VIETQR PAYMENT CANCEL ====================
  async adminCancelPayment(req, res) {
    try {
      const { paymentId } = req.params;
      const { reason } = req.body;
      const adminId = req.user?.id;
      const adminName = req.user?.name || 'Admin';

      console.log('[Admin Cancel VietQR] paymentId:', paymentId, 'reason:', reason, 'adminId:', adminId);

      // Find payment
      const payment = await VietQRPayment.findById(paymentId);
      console.log('[Admin Cancel VietQR] payment found:', !!payment, payment?.status);

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy thanh toán'
        });
      }

      // Check if already cancelled
      if (payment.status === VietQRPayment.PAYMENT_STATUS.CANCELLED) {
        return res.status(400).json({
          success: false,
          message: 'Thanh toán đã bị hủy trước đó'
        });
      }

      // Check if already completed
      if (payment.status === VietQRPayment.PAYMENT_STATUS.COMPLETED) {
        return res.status(400).json({
          success: false,
          message: 'Không thể hủy thanh toán đã hoàn thành. Vui lòng liên hệ hỗ trợ.'
        });
      }

      // Update payment status
      payment.markAsCancelled();
      payment.cancelledAt = new Date();
      payment.cancelledBy = {
        id: adminId,
        name: adminName
      };
      payment.cancellationReason = reason || 'Hủy bởi admin';
      await payment.save();

      // Update booking if exists
      let booking = null;
      if (payment.booking) {
        booking = await Booking.findById(payment.booking);
        if (booking) {
          booking.paymentStatus = 'cancelled';
          if (!booking.paymentHistory) booking.paymentHistory = [];
          booking.paymentHistory.push(payment._id);
          await booking.save();
        }
      }

      // Emit SSE event for frontend sync
      emitPaymentUpdate(paymentId, 'cancelled');

      res.json({
        success: true,
        message: 'Hủy thanh toán thành công',
        data: {
          payment: {
            id: payment._id,
            amount: payment.amount,
            status: payment.status,
            cancelledAt: payment.cancelledAt,
            cancellationReason: payment.cancellationReason,
            transferContent: payment.transferContent
          },
          booking: booking ? {
            id: booking._id,
            paymentStatus: booking.paymentStatus
          } : null,
          admin: {
            id: adminId,
            name: adminName
          }
        }
      });
    } catch (error) {
      console.error('[Admin] Cancel payment error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server khi hủy thanh toán'
      });
    }
  },

  // ==================== PAYMENT EXPIRATION CRON ====================
  async expirePayments(req, res) {
    try {
      const PaymentExpirationService = require('../services/PaymentExpirationService');
      
      // Only allow cron or admin access
      const isCron = req.headers['x-cron-secret'] === process.env.CRON_SECRET;
      const isAdmin = req.user?.role === 'admin';
      
      if (!isCron && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Không có quyền truy cập'
        });
      }

      const result = await PaymentExpirationService.expirePendingPayments();

      res.json({
        success: true,
        message: 'Đã xử lý hết hạn thanh toán',
        data: result
      });
    } catch (error) {
      console.error('[PaymentExpiration] Cron error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi xử lý hết hạn'
      });
    }
  },

  async getExpiringPayments(req, res) {
    try {
      const { minutes = 5 } = req.query;
      const PaymentExpirationService = require('../services/PaymentExpirationService');
      
      const payments = await PaymentExpirationService.getExpiringPayments(parseInt(minutes));

      res.json({
        success: true,
        data: { payments }
      });
    } catch (error) {
      console.error('[PaymentExpiration] Get expiring error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy danh sách'
      });
    }
  }
};

module.exports = paymentController;

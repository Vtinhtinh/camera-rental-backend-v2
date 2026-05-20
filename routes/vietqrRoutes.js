const express = require('express');
const router = express.Router();
const VietQRPayment = require('../models/VietQRPayment');
const VietQRService = require('../services/VietQRService');
const Booking = require('../models/Booking');
const { protect } = require('../middleware/auth');

// POST /api/payments - Create VietQR payment
router.post('/', protect, async (req, res) => {
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
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });

    await payment.save();

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
      message: error.message || 'Lỗi server khi tạo thanh toán'
    });
  }
});

// PUT /confirm/:paymentId - Confirm VietQR payment
router.put('/confirm/:paymentId', protect, async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { notes } = req.body;

    const payment = await VietQRPayment.findById(paymentId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thanh toán'
      });
    }

    if (payment.status === VietQRPayment.PAYMENT_STATUS.COMPLETED) {
      return res.status(400).json({
        success: false,
        message: 'Thanh toán đã được xác nhận trước đó'
      });
    }

    if (payment.status !== VietQRPayment.PAYMENT_STATUS.PENDING) {
      return res.status(400).json({
        success: false,
        message: 'Không thể xác nhận thanh toán ở trạng thái này'
      });
    }

    // Mark as completed
    payment.markAsCompleted();
    if (notes) payment.notes = notes;
    await payment.save();

    // Update booking payment status
    if (payment.booking) {
      await Booking.findByIdAndUpdate(payment.booking, {
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
    console.error('[VietQR] Confirm payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi xác nhận thanh toán'
    });
  }
});

module.exports = router;

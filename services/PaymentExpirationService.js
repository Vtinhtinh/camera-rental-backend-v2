const VietQRPayment = require('../models/VietQRPayment');
const Booking = require('../models/Booking');

class PaymentExpirationService {
  static async expirePendingPayments() {
    try {
      const now = new Date();

      // Find all pending payments that have expired
      const expiredPayments = await VietQRPayment.find({
        status: VietQRPayment.PAYMENT_STATUS.PENDING,
        expiresAt: { $lt: now }
      });

      if (expiredPayments.length === 0) {
        return { expired: 0, processed: 0 };
      }

      // Process each expired payment
      const results = await Promise.allSettled(
        expiredPayments.map(payment => this.processExpiredPayment(payment))
      );

      const processed = results.filter(r => r.status === 'fulfilled' && r.value).length;

      console.log(`[PaymentExpiration] Processed ${processed}/${expiredPayments.length} expired payments`);

      return {
        expired: expiredPayments.length,
        processed,
        failed: results.filter(r => r.status === 'rejected').length
      };
    } catch (error) {
      console.error('[PaymentExpiration] Error expiring payments:', error);
      throw error;
    }
  }

  static async processExpiredPayment(payment) {
    try {
      // Mark payment as expired
      payment.markAsExpired('Tự động hết hạn sau 15 phút');
      await payment.save();

      // Update associated booking if exists
      if (payment.booking) {
        const booking = await Booking.findById(payment.booking);
        if (booking && booking.paymentStatus === 'unpaid') {
          booking.paymentStatus = 'expired';
          booking.notes = booking.notes 
            ? `${booking.notes}\n[System] Thanh toán VietQR đã hết hạn`
            : '[System] Thanh toán VietQR đã hết hạn';
          await booking.save();
        }
      }

      return true;
    } catch (error) {
      console.error(`[PaymentExpiration] Failed to process payment ${payment._id}:`, error);
      return false;
    }
  }

  static async getExpiringPayments(minutesThreshold = 5) {
    try {
      const threshold = new Date(Date.now() + minutesThreshold * 60 * 1000);
      
      const expiringPayments = await VietQRPayment.find({
        status: VietQRPayment.PAYMENT_STATUS.PENDING,
        expiresAt: {
          $gte: new Date(),
          $lte: threshold
        }
      }).populate('booking', 'customerName customerPhone');

      return expiringPayments;
    } catch (error) {
      console.error('[PaymentExpiration] Error getting expiring payments:', error);
      return [];
    }
  }

  static getExpiryTimeRemaining(payment) {
    if (!payment.expiresAt) return null;
    
    const now = Date.now();
    const expiry = new Date(payment.expiresAt).getTime();
    const remaining = expiry - now;

    if (remaining <= 0) return { expired: true, seconds: 0, minutes: 0 };

    return {
      expired: false,
      seconds: Math.floor((remaining % 60000) / 1000),
      minutes: Math.floor(remaining / 60000),
      totalSeconds: Math.floor(remaining / 1000)
    };
  }

  static async cleanupOldExpiredPayments(daysOld = 30) {
    try {
      const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

      const result = await VietQRPayment.deleteMany({
        status: VietQRPayment.PAYMENT_STATUS.EXPIRED,
        createdAt: { $lt: cutoffDate }
      });

      console.log(`[PaymentExpiration] Cleaned up ${result.deletedCount} old expired payments`);
      return result;
    } catch (error) {
      console.error('[PaymentExpiration] Error cleaning up old payments:', error);
      return { deletedCount: 0 };
    }
  }
}

module.exports = PaymentExpirationService;

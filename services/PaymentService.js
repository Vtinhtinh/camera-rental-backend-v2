const axios = require('axios');
const crypto = require('crypto');

const ACB_CONFIG = {
  accountNumber: process.env.ACB_ACCOUNT_NUMBER || '24217937',
  accountName: process.env.ACB_ACCOUNT_NAME || 'VO TINH',
  bankCode: process.env.ACB_BANK_CODE || '9704',
  bankName: process.env.ACB_BANK_NAME || 'ACB'
};

class PaymentService {
  static generateTransactionId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `CR_${timestamp}_${random}`;
  }

  static generateVietQRUrl(amount, addInfo = '', template = 'compact2') {
    const params = new URLSearchParams({
      accountNo: ACB_CONFIG.accountNumber,
      accountName: ACB_CONFIG.accountName,
      amount: amount.toString(),
      addInfo: encodeURIComponent(addInfo),
      template: template
    });

    return `https://api.vietqr.io/v2/generate?${params.toString()}`;
  }

  static async generateACBQRCode(amount, bookingId, description = '') {
    try {
      const transactionId = this.generateTransactionId();
      const addInfo = description || `Thanh toan don hang ${bookingId}`;

      const response = await axios.post('https://api.vietqr.io/v2/generate', {
        accountNo: ACB_CONFIG.accountNumber,
        accountName: ACB_CONFIG.accountName,
        accountType: 'bank_account',
        amount: amount,
        addInfo: addInfo,
        template: 'compact2'
      });

      if (response.data && response.data.data) {
        return {
          success: true,
          qrData: {
            qrImageUrl: response.data.data.qrDataURL,
            qrCode: response.data.data.qrCode,
            accountNumber: ACB_CONFIG.accountNumber,
            accountName: ACB_CONFIG.accountName,
            bankName: ACB_CONFIG.bankName,
            bankCode: ACB_CONFIG.bankCode,
            amount: amount,
            transactionId: transactionId,
            description: addInfo
          }
        };
      }

      return {
        success: false,
        error: response.data?.message || 'Failed to generate QR code'
      };
    } catch (error) {
      console.error('Error generating ACB QR:', error.response?.data || error.message);

      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Lỗi khi tạo mã QR'
      };
    }
  }

  static generateACBTransferInfo(amount, bookingId, description = '') {
    const addInfo = description || `Thanh toan don hang ${bookingId}`;

    return {
      bankName: 'Ngân hàng ACB',
      bankCode: '9704',
      accountNumber: ACB_CONFIG.accountNumber,
      accountName: ACB_CONFIG.accountName,
      amount: amount,
      description: addInfo,
      formattedAmount: this.formatCurrency(amount)
    };
  }

  static formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  }

  static calculateCODFee(amount) {
    return Math.round(amount * 0.02);
  }

  static async processPayment(paymentData) {
    const { method, amount, bookingId, userId, description } = paymentData;

    try {
      switch (method) {
        case 'acb_qr':
          return await this.generateACBQRCode(amount, bookingId, description);

        case 'cod':
          return {
            success: true,
            paymentDetails: {
              method: 'cod',
              amount: amount,
              codFee: this.calculateCODFee(amount),
              totalAmount: amount + this.calculateCODFee(amount),
              description: 'Thanh toán khi nhận hàng (COD)'
            }
          };

        default:
          return {
            success: false,
            error: 'Phương thức thanh toán không hợp lệ'
          };
      }
    } catch (error) {
      console.error('Payment error:', error);
      return {
        success: false,
        error: error.message || 'Lỗi xử lý thanh toán'
      };
    }
  }

  static async checkPaymentStatus(transactionId) {
    return {
      success: true,
      status: 'pending',
      message: 'Vui lòng thanh toán và chờ xác nhận'
    };
  }
}

module.exports = PaymentService;

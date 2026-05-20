const axios = require('axios');

const BANK_CONFIG = {
  accountNumber: process.env.VIETQR_ACCOUNT_NUMBER || '24217937',
  accountName: process.env.VIETQR_ACCOUNT_NAME || 'VO TINH',
  bankCode: process.env.VIETQR_BANK_CODE || '970416',
  bankName: process.env.VIETQR_BANK_NAME || 'ACB',
  clientId: process.env.VIETQR_CLIENT_ID || '',
  apiKey: process.env.VIETQR_API_KEY || ''
};

const API_BASE_URL = 'https://api.vietqr.io/v2/generate';

class VietQRService {
  static getConfig() {
    return { ...BANK_CONFIG };
  }

  static setConfig(config) {
    Object.assign(BANK_CONFIG, config);
  }

  static async generateQRImageUrl(amount, transferContent, template = 'compact2') {
    if (!amount || amount <= 0) {
      throw new Error('Số tiền không hợp lệ');
    }

    if (!transferContent || transferContent.trim() === '') {
      throw new Error('Nội dung chuyển khoản không hợp lệ');
    }

    if (!BANK_CONFIG.clientId || !BANK_CONFIG.apiKey) {
      throw new Error('VietQR credentials not configured. Please set VIETQR_CLIENT_ID and VIETQR_API_KEY');
    }

    try {
      const response = await axios.post(
        API_BASE_URL,
        {
          accountNo: BANK_CONFIG.accountNumber,
          accountName: BANK_CONFIG.accountName,
          acqId: BANK_CONFIG.bankCode,
          amount: Math.floor(amount),
          addInfo: transferContent.trim(),
          template: template
        },
        {
          headers: {
            'x-client-id': BANK_CONFIG.clientId,
            'x-api-key': BANK_CONFIG.apiKey,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      if (response.data?.data?.qrDataURL) {
        return response.data.data.qrDataURL;
      }

      if (response.data?.code === '00') {
        return response.data.data.qrDataURL;
      }

      throw new Error(response.data?.message || response.data?.desc || 'Không thể tạo mã QR');
    } catch (error) {
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      if (error.response?.data?.desc) {
        throw new Error(error.response.data.desc);
      }
      if (error.code === 'ECONNABORTED') {
        throw new Error('Hết thời gian kết nối, vui lòng thử lại');
      }
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        throw new Error('Không thể kết nối đến máy chủ VietQR');
      }
      throw new Error(error.message || 'Lỗi khi tạo mã QR VietQR');
    }
  }

  static formatTransferContent(bookingId, suffix = '') {
    const timestamp = Date.now().toString().slice(-6);
    const bookingPart = bookingId ? bookingId.slice(-6) : timestamp;
    const randomPart = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const content = `CR${bookingPart}${randomPart}${suffix ? `_${suffix}` : ''}`;
    return content.slice(0, 25);
  }

  static getBankInfo() {
    return {
      bankName: BANK_CONFIG.bankName,
      bankCode: BANK_CONFIG.bankCode,
      accountNumber: BANK_CONFIG.accountNumber,
      accountName: BANK_CONFIG.accountName,
      formattedAccount: `${BANK_CONFIG.accountNumber} - ${BANK_CONFIG.accountName}`
    };
  }

  static formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      minimumFractionDigits: 0
    }).format(amount);
  }

  static isConfigured() {
    return !!(BANK_CONFIG.clientId && BANK_CONFIG.apiKey);
  }
}

module.exports = VietQRService;

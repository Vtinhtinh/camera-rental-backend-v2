const crypto = require('crypto');
const qs = require('qs');

/**
 * Normalize IPv4 address from various formats (IPv4-mapped IPv6, etc.)
 */
const normalizeIp = (ip) => {
  if (!ip) return '127.0.0.1';
  
  if (ip.startsWith('::ffff:')) {
    const ipv4 = ip.substring(7);
    const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    if (ipv4Pattern.test(ipv4)) {
      return ipv4;
    }
  }
  
  if (ip.includes(',')) {
    ip = ip.split(',')[0].trim();
  }
  
  const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  if (ipv4Pattern.test(ip)) {
    return ip;
  }
  
  return '127.0.0.1';
};

/**
 * Normalize Vietnamese text - remove diacritics and special chars
 */
const normalizeText = (text) => {
  if (!text) return '';
  
  // Remove Vietnamese diacritics
  let normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd');
  
  // Remove dangerous characters
  normalized = normalized
    .replace(/[<>\"'&%#]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  
  // Keep only safe ASCII
  normalized = normalized.replace(/[^\x00-\x7F-]/g, '');
  
  return normalized.substring(0, 100);
};

/**
 * Sort object keys alphabetically
 */
const sortObject = (obj) => {
  const sorted = {};
  Object.keys(obj).sort().forEach(key => {
    sorted[key] = obj[key];
  });
  return sorted;
};

class VNPayService {
  static getConfig() {
    const isSandbox = (process.env.VNPAY_URL || '').includes('sandbox');
    
    const tmnCode = isSandbox 
      ? (process.env.VNP_SANDBOX_TMN_CODE || process.env.VNPAY_TMN_CODE)
      : process.env.VNPAY_TMN_CODE;
    
    const hashSecret = isSandbox 
      ? (process.env.VNP_SANDBOX_HASH_SECRET || process.env.VNPAY_HASH_SECRET)
      : process.env.VNPAY_HASH_SECRET;
    
    console.log('[VNPay] MODE:', isSandbox ? 'SANDBOX (TEST)' : 'PRODUCTION');
    console.log('[VNPay] TMN Code:', tmnCode ? tmnCode.substring(0, 4) + '****' : 'NOT SET');
    
    return {
      tmnCode,
      hashSecret,
      baseUrl: isSandbox 
        ? 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'
        : process.env.VNPAY_URL,
      returnUrl: process.env.VNPAY_RETURN_URL || 'http://localhost:5000/api/payment/vnpay/return',
      clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
    };
  }

  /**
   * Get client IP address
   */
  static getClientIp(req) {
    const ipSources = [
      req?.headers?.['x-forwarded-for'],
      req?.headers?.['x-real-ip'],
      req?.connection?.remoteAddress,
      req?.socket?.remoteAddress,
      req?.ip,
      '127.0.0.1'
    ];

    for (const source of ipSources) {
      if (source) {
        const ip = Array.isArray(source) ? source[0] : source;
        const normalized = normalizeIp(String(ip));
        const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
        if (ipv4Pattern.test(normalized)) {
          return normalized;
        }
      }
    }
    return '127.0.0.1';
  }

  /**
   * Format date for VNPay (yyyyMMddHHmmss) in Asia/Ho_Chi_Minh timezone
   */
  static formatDate(date) {
    // Get timezone offset for Asia/Ho_Chi_Minh (UTC+7)
    const tzOffset = 7 * 60; // minutes
    
    // Convert to Vietnam time
    const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
    const vietnamTime = new Date(utc + (tzOffset * 60000));
    
    const yyyy = String(vietnamTime.getFullYear());
    const mm = String(vietnamTime.getMonth() + 1).padStart(2, '0');
    const dd = String(vietnamTime.getDate()).padStart(2, '0');
    const hh = String(vietnamTime.getHours()).padStart(2, '0');
    const mi = String(vietnamTime.getMinutes()).padStart(2, '0');
    const ss = String(vietnamTime.getSeconds()).padStart(2, '0');
    
    return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
  }

  /**
   * Create VNPay payment URL
   * Follows official VNPay sample code exactly
   */
  static createPaymentUrl({ amount, orderId, description, req }) {
    const config = this.getConfig();

    // Validate config
    if (!config.tmnCode || !config.hashSecret) {
      throw new Error('VNPay: Missing TMN Code or Hash Secret');
    }

    // Validate amount
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      throw new Error('VNPay: Invalid amount');
    }

    // Get client IP
    const clientIp = req ? this.getClientIp(req) : '127.0.0.1';

    // Format amount (multiply by 100 for VND cents)
    const vnpAmount = parseInt(numericAmount * 100, 10);

    // Generate dates
    const createDate = this.formatDate(new Date());
    const expireDate = this.formatDate(new Date(Date.now() + 15 * 60 * 1000));

    // Normalize description
    const orderInfo = normalizeText(description || `Thanh-toan-${orderId}`);

    // Build params object (ALPHABETICAL ORDER is crucial)
    let vnp_Params = {
      vnp_Amount: vnpAmount,
      vnp_Command: 'pay',
      vnp_CreateDate: createDate,
      vnp_CurrCode: 'VND',
      vnp_ExpireDate: expireDate,
      vnp_IpAddr: clientIp,
      vnp_Locale: 'vn',
      vnp_OrderInfo: orderInfo,
      vnp_OrderType: 'other',
      vnp_ReturnUrl: config.returnUrl,
      vnp_TmnCode: config.tmnCode,
      vnp_TxnRef: orderId,
      vnp_Version: '2.1.0',
    };

    // Sort params alphabetically
    vnp_Params = sortObject(vnp_Params);

    // Build sign data using qs.stringify (no encoding)
    const signData = qs.stringify(vnp_Params, {
      encode: false,
    });

    // Create HMAC SHA512 hash
    const hmac = crypto.createHmac('sha512', config.hashSecret);
    const signed = hmac
      .update(Buffer.from(signData, 'utf-8'))
      .digest('hex');

    // Attach secure hash
    vnp_Params['vnp_SecureHash'] = signed;

    // Debug logging
    console.log('='.repeat(70));
    console.log('[VNPay] CREATE PAYMENT URL');
    console.log('='.repeat(70));
    console.log('TMN Code:', config.tmnCode);
    console.log('Amount:', numericAmount, 'VND');
    console.log('Amount (cents):', vnpAmount);
    console.log('Order ID:', orderId);
    console.log('Client IP:', clientIp);
    console.log('Create Date:', createDate);
    console.log('Expire Date:', expireDate);
    console.log('-'.repeat(70));
    console.log('Sign Data:', signData);
    console.log('Secure Hash:', signed);
    console.log('='.repeat(70));

    // Build final payment URL
    const paymentUrl = config.baseUrl + '?' + qs.stringify(vnp_Params, {
      encode: true,
    });

    return {
      paymentUrl,
      orderId,
      amount: numericAmount,
      vnpAmount,
      expireTime: expireDate,
      clientIp,
    };
  }

  /**
   * Verify VNPay return URL signature
   */
  static verifyReturnUrl(query) {
    const config = this.getConfig();

    // Extract secure hash
    const { vnp_SecureHash, ...params } = query;

    console.log('='.repeat(70));
    console.log('[VNPay] VERIFY RETURN URL');
    console.log('='.repeat(70));
    console.log('Received Hash:', vnp_SecureHash);

    // Sort params alphabetically
    const sortedParams = sortObject(params);

    // Build sign data using qs.stringify (same as create)
    const signData = qs.stringify(sortedParams, {
      encode: false,
    });

    // Create HMAC SHA512 hash
    const hmac = crypto.createHmac('sha512', config.hashSecret);
    const signed = hmac
      .update(Buffer.from(signData, 'utf-8'))
      .digest('hex');

    console.log('-'.repeat(70));
    console.log('Sign Data:', signData);
    console.log('Generated Hash:', signed);
    console.log('Received Hash:', vnp_SecureHash);
    console.log('Match:', signed === vnp_SecureHash ? 'YES ✓' : 'NO ✗');
    console.log('='.repeat(70));

    return signed === vnp_SecureHash;
  }

  /**
   * Verify IPN signature (same as return URL)
   */
  static verifyIpnUrl(query) {
    return this.verifyReturnUrl(query);
  }

  /**
   * VNPay response codes
   */
  static getResponseCodeResult(responseCode) {
    const codeMap = {
      '00': { success: true, message: 'Giao dịch thành công' },
      '07': { success: true, message: 'Trừ tiền thành công. Giao dịch bị nghi ngờ' },
      '09': { success: false, message: 'Thẻ/Tài khoản chưa đăng ký Internet Banking' },
      '10': { success: false, message: 'Sai mật khẩu/xác thực quá số lần' },
      '11': { success: false, message: 'Đã hết hạn chờ thanh toán' },
      '12': { success: false, message: 'Thẻ/Tài khoản bị khóa' },
      '13': { success: false, message: 'Sai OTP xác thực' },
      '24': { success: false, message: 'Khách hàng hủy giao dịch' },
      '51': { success: false, message: 'Tài khoản không đủ số dư' },
      '65': { success: false, message: 'Vượt quá hạn mức giao dịch' },
      '75': { success: false, message: 'Ngân hàng đang bảo trì' },
      '79': { success: false, message: 'Sai mật khẩu thanh toán' },
      '99': { success: false, message: 'Lỗi không xác định' },
    };
    return codeMap[responseCode] || { success: false, message: `Mã lỗi không xác định: ${responseCode}` };
  }
}

module.exports = VNPayService;

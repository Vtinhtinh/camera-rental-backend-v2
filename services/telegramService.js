const axios = require('axios');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const ADMIN_IDS = process.env.TELEGRAM_ADMIN_IDS
  ? process.env.TELEGRAM_ADMIN_IDS.split(',').map(id => id.trim())
  : [];

const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

class TelegramService {
  static isConfigured() {
    return BOT_TOKEN && BOT_TOKEN !== 'your_telegram_bot_token';
  }

  static isChatConfigured() {
    return CHAT_ID && CHAT_ID !== 'your_telegram_chat_id';
  }

  static async sendMessage(text, options = {}) {
    if (!this.isConfigured()) {
      console.log('[Telegram] Bot not configured. Message skipped.');
      return null;
    }

    if (!this.isChatConfigured() && !options.chatId) {
      console.log('[Telegram] Chat ID not configured. Message skipped.');
      return null;
    }

    try {
      const response = await axios.post(`${API_URL}/sendMessage`, {
        chat_id: options.chatId || CHAT_ID,
        text: text,
        parse_mode: options.parseMode || 'Markdown',
        disable_web_page_preview: options.disablePreview || true,
        reply_markup: options.replyMarkup || undefined
      });

      return response.data;
    } catch (error) {
      console.error('[Telegram] Send message error:', error.response?.data || error.message);
      return null;
    }
  }

  static async sendPaymentConfirmation(payment, booking = null, confirmedBy = 'Admin') {
    if (!this.isConfigured() || !this.isChatConfigured()) {
      return null;
    }

    const bookingId = booking ? booking._id.toString().slice(-8).toUpperCase() : 'N/A';
    const paymentId = payment._id.toString().slice(-8).toUpperCase();
    const formattedAmount = payment.amount.toLocaleString('vi-VN');
    const customerName = booking?.customerName || payment.userName || 'Khách hàng';
    const customerPhone = booking?.customerPhone || payment.userPhone || 'N/A';

    const message = `
💰 *XÁC NHẬN THANH TOÁN*
━━━━━━━━━━━━━━━━━━━━━━

✅ *Mã thanh toán:* ${paymentId}
📋 *Mã đơn hàng:* ${bookingId}

👤 *Khách hàng:* ${customerName}
📱 *SĐT:* ${customerPhone}

💵 *Số tiền:* ${formattedAmount}đ
🏦 *Ngân hàng:* ${payment.bankName || 'VietQR'}
📝 *Nội dung CK:* \`${payment.transferContent || 'N/A'}\`

👨‍💼 *Người xác nhận:* ${confirmedBy}
⏰ *Thời gian:* ${new Date().toLocaleString('vi-VN')}
━━━━━━━━━━━━━━━━━━━━━━
`;

    return await this.sendMessage(message);
  }

  static async sendBookingNotification(booking, product = null) {
    if (!this.isConfigured() || !this.isChatConfigured()) {
      return null;
    }

    const bookingId = booking._id.toString().slice(-8).toUpperCase();
    const productName = product?.name || booking.productName || 'N/A';
    const productSku = product?.sku || booking.productSku || 'N/A';

    const message = `
📸 *YÊU CẦU THUÊ MỚI*
━━━━━━━━━━━━━━━━━━━━━━

🆔 *Mã đơn:* ${bookingId}

👤 *Khách hàng:* ${booking.customerName}
📱 *SĐT:* ${booking.customerPhone}
📧 *Email:* ${booking.customerEmail || 'N/A'}

📷 *Máy thuê:* ${productName}
🔢 *Mã SP:* ${productSku}

📅 *Nhận:* ${new Date(booking.startDate).toLocaleDateString('vi-VN')}
📅 *Trả:* ${new Date(booking.endDate).toLocaleDateString('vi-VN')}
⏰ *Số ngày:* ${booking.rentalDays}

💰 *Tổng tiền:* ${booking.totalPrice?.toLocaleString('vi-VN')}đ
💵 *Đặt cọc:* ${booking.deposit?.toLocaleString('vi-VN')}đ

📝 *Ghi chú:* ${booking.notes || 'Không có'}
━━━━━━━━━━━━━━━━━━━━━━
`;

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: '🔄 Xác nhận đơn', callback_data: `confirm_booking_${booking._id}` },
          { text: '❌ Từ chối', callback_data: `reject_booking_${booking._id}` }
        ]
      ]
    };

    return await this.sendMessage(message, { replyMarkup });
  }

  static async sendBookingStatusUpdate(booking, oldStatus, newStatus, product = null) {
    if (!this.isConfigured() || !this.isChatConfigured()) {
      return null;
    }

    const bookingId = booking._id.toString().slice(-8).toUpperCase();
    const productName = product?.name || booking.productName || 'N/A';

    const statusEmoji = {
      'pending': '⏳',
      'processing': '🔄',
      'confirmed': '✅',
      'delivered': '📦',
      'returned': '🔙',
      'cancelled': '❌'
    };

    const statusLabels = {
      'pending': 'Chờ xác nhận',
      'processing': 'Đang xử lý',
      'confirmed': 'Đã xác nhận',
      'delivered': 'Đã giao hàng',
      'returned': 'Đã trả máy',
      'cancelled': 'Đã hủy'
    };

    const message = `
🔔 *CẬP NHẬT TRẠNG THÁI ĐƠN*
━━━━━━━━━━━━━━━━━━━━━━

📋 *Mã đơn:* ${bookingId}
📷 *Máy:* ${productName}

${statusEmoji[oldStatus]} → ${statusEmoji[newStatus]}
*Trạng thái:* ${statusLabels[newStatus]}

👤 *Khách:* ${booking.customerName}
📱 *SĐT:* ${booking.customerPhone}
💰 *Tổng tiền:* ${booking.totalPrice?.toLocaleString('vi-VN')}đ
━━━━━━━━━━━━━━━━━━━━━━
`;

    return await this.sendMessage(message);
  }

  static async sendLowStockAlert(product) {
    if (!this.isConfigured() || !this.isChatConfigured()) {
      return null;
    }

    const stockEmoji = product.stock === 0 ? '🔴' : '🟡';

    const message = `
⚠️ *CẢNH BÁO TỒN KHO*
━━━━━━━━━━━━━━━━━━━━━━

${stockEmoji} *Sản phẩm:* ${product.name}
🏷️ *Hãng:* ${product.brand}
📦 *Còn lại:* ${product.stock} cái

⚡ Vui lòng kiểm tra và nhập thêm hàng!
━━━━━━━━━━━━━━━━━━━━━━
`;

    return await this.sendMessage(message);
  }

  static async sendDailyReport(stats) {
    if (!this.isConfigured() || !this.isChatConfigured()) {
      return null;
    }

    const today = new Date().toLocaleDateString('vi-VN');

    const message = `
📊 *BÁO CÁO HÀNG NGÀY*
━━━━━━━━━━━━━━━━━━━━━━
📅 ${today}

🛒 *Đơn hàng:*
• Tổng: ${stats.totalBookings || 0}
• ⏳ Chờ: ${stats.pendingBookings || 0}
• 🔄 Xử lý: ${stats.processingBookings || 0}
• ✅ Hoàn thành: ${stats.completedBookings || 0}
• ❌ Hủy: ${stats.cancelledBookings || 0}

💰 *Doanh thu:* ${(stats.totalRevenue || 0).toLocaleString('vi-VN')}đ

👥 *Người dùng:* ${stats.totalUsers || 0}
📷 *Sản phẩm:* ${stats.totalProducts || 0}
━━━━━━━━━━━━━━━━━━━━━━
`;

    return await this.sendMessage(message);
  }

  static async sendErrorAlert(error, context = {}) {
    if (!this.isConfigured() || !this.isChatConfigured()) {
      return null;
    }

    const message = `
🚨 *BÁO LỖI HỆ THỐNG*
━━━━━━━━━━━━━━━━━━━━━━

❌ *Lỗi:* ${error.message || 'Unknown error'}

📍 *Context:* ${context.location || 'N/A'}
🔧 *Endpoint:* ${context.endpoint || 'N/A'}
👤 *User ID:* ${context.userId || 'N/A'}

⏰ *Thời gian:* ${new Date().toLocaleString('vi-VN')}
━━━━━━━━━━━━━━━━━━━━━━
`;

    return await this.sendMessage(message);
  }

  static async sendVietQRPaymentAlert(payment, booking = null) {
    if (!this.isConfigured() || !this.isChatConfigured()) {
      return null;
    }

    const paymentId = payment._id.toString();
    const paymentIdShort = paymentId.slice(-8).toUpperCase();
    const formattedAmount = payment.amount.toLocaleString('vi-VN');

    // Build customer info
    let customerInfo = '';
    if (booking) {
      customerInfo = `
👤 *Khách hàng:* ${booking.customerName}
📱 *SĐT:* ${booking.customerPhone}
📧 *Email:* ${booking.customerEmail || 'N/A'}`;
    }

    const message = `
💳 *THANH TOÁN VIETQR MỚI*
━━━━━━━━━━━━━━━━━━━━━━

📋 *Mã thanh toán:* \`${paymentIdShort}\`
💵 *Số tiền:* ${formattedAmount}đ
🏦 *Ngân hàng:* ${payment.bankName}
🔢 *STK:* \`${payment.bankAccount}\`
📝 *NDCK:* \`${payment.transferContent}\`
${customerInfo}
⏰ *Hết hạn:* ${payment.expiresAt ? new Date(payment.expiresAt).toLocaleString('vi-VN') : 'N/A'}
━━━━━━━━━━━━━━━━━━━━━━
`;

    return await this.sendMessage(message);
  }

  static async sendCustomMessage(text, chatId = null) {
    return await this.sendMessage(text, { chatId });
  }
}

module.exports = TelegramService;

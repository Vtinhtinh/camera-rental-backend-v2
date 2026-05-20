require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Booking = require('../models/Booking');
const Product = require('../models/Product');
const User = require('../models/User');
const Feedback = require('../models/Feedback');
const Banner = require('../models/Banner');
const TelegramService = require('../services/telegramService');

let bot = null;
let adminChatIds = [];

// Khởi tạo bot
const initTelegramBot = () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!token || token === 'your_telegram_bot_token') {
    console.log('⚠️ Telegram bot not configured. Skipping...');
    console.log('   Vui lòng thêm TELEGRAM_BOT_TOKEN vào file .env');
    return null;
  }

  try {
    bot = new TelegramBot(token, { polling: true });
    console.log('✅ Telegram bot initialized successfully');
    
    // Load admin chat IDs
    const adminIds = process.env.TELEGRAM_ADMIN_IDS;
    if (adminIds) {
      adminChatIds = adminIds.split(',').map(id => id.trim());
    } else {
      // Nếu không có config, dùng chat id đầu tiên nhận được message
      console.log('   TIP: Thêm TELEGRAM_ADMIN_IDS vào .env để giới hạn quyền truy cập');
    }
    
    // Đăng ký tất cả commands và handlers
    registerCommands();
    registerCallbacks();
    registerListeners();
    
    return bot;
  } catch (error) {
    console.error('❌ Error initializing Telegram bot:', error.message);
    return null;
  }
};

// Kiểm tra admin
const isAdmin = (chatId) => {
  return adminChatIds.length === 0 || adminChatIds.includes(chatId.toString());
};

// ==================== COMMANDS ====================

const registerCommands = () => {
  // /start - Chào mừng
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const welcomeMessage = `
📸 *CHÀO MỪNG ĐẾN CAMERARENT BOT*

Bot quản lý hệ thống thuê máy ảnh

📌 *Commands có sẵn:*
━━━━━━━━━━━━━━━━━━━━━━
🛒 /orders - Xem danh sách đơn hàng
📊 /stats - Thống kê tổng quan
📷 /products - Quản lý sản phẩm
🔔 /pending - Đơn chờ xử lý
📈 /revenue - Doanh thu
🚨 /overdue - Đơn quá hạn
━━━━━━━━━━━━━━━━━━━━━━

📞 Hỗ trợ: @CameraRentVN
    `;

    bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
  });

  // /help - Hướng dẫn
  bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    const helpMessage = `
📖 *HƯỚNG DẪN SỬ DỤNG*

*Quản lý Đơn hàng:*
━━━━━━━━━━━━━━━━━━━━━━
• /orders - Xem tất cả đơn
• /orders pending - Đơn chờ xác nhận
• /orders today - Đơn hôm nay
• /order [id] - Chi tiết đơn
• /overdue - Đơn quá hạn

*Thống kê:*
━━━━━━━━━━━━━━━━━━━━━━
• /stats - Tổng quan hệ thống
• /stats today - Hôm nay
• /revenue - Doanh thu tháng

*Sản phẩm:*
━━━━━━━━━━━━━━━━━━━━━━
• /products - Danh sách sản phẩm
• /stock - Tồn kho thấp
• /products low - Sắp hết hàng

*Tiện ích:*
━━━━━━━━━━━━━━━━━━━━━━
• /help - Hướng dẫn này
• /ping - Kiểm tra bot
    `;

    bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
  });

  // /ping - Kiểm tra bot
  bot.onText(/\/ping/, async (msg) => {
    const chatId = msg.chat.id;
    const startTime = Date.now();
    try {
      await bot.sendMessage(chatId, '🏓 Pong!');
      const pingTime = Date.now() - startTime;
      bot.sendMessage(chatId, `⏱️ Response time: ${pingTime}ms`);
    } catch (error) {
      bot.sendMessage(chatId, '❌ Bot đang gặp sự cố');
    }
  });

  // /stats - Thống kê tổng quan
  bot.onText(/\/stats(?:\s+(.*))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const period = match[1] || 'all';
    
    try {
      let dateFilter = {};
      
      if (period === 'today') {
        dateFilter = { createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } };
      } else if (period === 'week') {
        dateFilter = { createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } };
      } else if (period === 'month') {
        dateFilter = { createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } };
      }

      const [
        totalBookings,
        pendingBookings,
        processingBookings,
        deliveredBookings,
        cancelledBookings,
        totalProducts,
        totalUsers,
        revenueResult
      ] = await Promise.all([
        Booking.countDocuments(dateFilter),
        Booking.countDocuments({ ...dateFilter, status: 'pending' }),
        Booking.countDocuments({ ...dateFilter, status: 'processing' }),
        Booking.countDocuments({ ...dateFilter, status: 'delivered' }),
        Booking.countDocuments({ ...dateFilter, status: 'cancelled' }),
        Product.countDocuments(),
        User.countDocuments(),
        Booking.aggregate([
          { $match: dateFilter },
          { $group: { _id: null, total: { $sum: '$totalPrice' } } }
        ])
      ]);

      const totalRevenue = revenueResult[0]?.total || 0;
      const periodText = period === 'today' ? 'Hôm nay' : period === 'week' ? '7 ngày' : period === 'month' ? '30 ngày' : 'Tổng';

      const statsMessage = `
📊 *THỐNG KÊ HỆ THỐNG*
━━━━━━━━━━━━━━━━━━━━━━
📅 *Thời gian:* ${periodText}

🛒 *Đơn hàng:*
• Tổng: ${totalBookings}
• ⏳ Chờ: ${pendingBookings}
• 🔄 Xử lý: ${processingBookings}
• ✅ Hoàn thành: ${deliveredBookings}
• ❌ Hủy: ${cancelledBookings}

💰 *Doanh thu:* ${totalRevenue.toLocaleString('vi-VN')}đ

👥 *Người dùng:* ${totalUsers}
📷 *Sản phẩm:* ${totalProducts}
      `;

      bot.sendMessage(chatId, statsMessage, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Stats error:', error);
      bot.sendMessage(chatId, '❌ Lỗi khi lấy thống kê');
    }
  });

  // /revenue - Doanh thu
  bot.onText(/\/revenue(?:\s+(.*))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const period = match[1] || 'month';
    
    try {
      let dateFilter = {};
      let periodText = '';
      
      switch (period) {
        case 'today':
          dateFilter = { createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } };
          periodText = 'Hôm nay';
          break;
        case 'week':
          dateFilter = { createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } };
          periodText = '7 ngày qua';
          break;
        case 'month':
          dateFilter = { createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } };
          periodText = '30 ngày qua';
          break;
        default:
          periodText = 'Tất cả';
      }

      const revenueData = await Booking.aggregate([
        { $match: { ...dateFilter, status: { $nin: ['cancelled'] } } },
        {
          $group: {
            _id: null,
            total: { $sum: '$totalPrice' },
            count: { $sum: 1 },
            avgOrderValue: { $avg: '$totalPrice' }
          }
        }
      ]);

      const dailyRevenue = await Booking.aggregate([
        { 
          $match: { 
            ...dateFilter, 
            status: { $nin: ['cancelled'] } 
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            total: { $sum: '$totalPrice' },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: -1 } },
        { $limit: 7 }
      ]);

      const data = revenueData[0] || { total: 0, count: 0, avgOrderValue: 0 };

      let dailyBreakdown = dailyRevenue.map(d => 
        `📅 ${d._id}: ${d.total.toLocaleString('vi-VN')}đ (${d.count} đơn)`
      ).join('\n');

      const revenueMessage = `
💰 *BÁO CÁO DOANH THU*
━━━━━━━━━━━━━━━━━━━━━━
📅 Thời gian: ${periodText}

💵 *Tổng doanh thu:* ${data.total.toLocaleString('vi-VN')}đ
📦 *Số đơn:* ${data.count}
📊 *Giá trị TB:* ${Math.round(data.avgOrderValue).toLocaleString('vi-VN')}đ

📈 *Doanh thu 7 ngày gần nhất:*
${dailyBreakdown || 'Không có dữ liệu'}
      `;

      bot.sendMessage(chatId, revenueMessage, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Revenue error:', error);
      bot.sendMessage(chatId, '❌ Lỗi khi lấy báo cáo doanh thu');
    }
  });

  // /pending - Đơn chờ xử lý
  bot.onText(/\/pending/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const pendingBookings = await Booking.find({ status: 'pending' })
        .populate('productId')
        .populate('userId', 'name phone')
        .sort({ createdAt: -1 })
        .limit(10);

      if (pendingBookings.length === 0) {
        bot.sendMessage(chatId, '✅ Không có đơn nào đang chờ xử lý!');
        return;
      }

      const message = `⏳ *ĐƠN CHỜ XỬ LÝ* (${pendingBookings.length})\n━━━━━━━━━━━━━━━━━━━━━━\n`;

      let response = message;
      for (const booking of pendingBookings) {
        const orderId = booking._id.toString().slice(-8).toUpperCase();
        response += `
🆔 Mã: ${orderId}
👤 ${booking.customerName}
📱 ${booking.customerPhone}
📷 ${booking.productId?.name || 'N/A'}
💰 ${booking.totalPrice.toLocaleString('vi-VN')}đ
📅 ${new Date(booking.startDate).toLocaleDateString('vi-VN')} - ${new Date(booking.endDate).toLocaleDateString('vi-VN')}
━━━━━━━━━━━━━━━━━━━━━━
`;
      }

      const options = {
        reply_markup: {
          inline_keyboard: pendingBookings.slice(0, 5).map(booking => [{
            text: `Xem ${booking._id.toString().slice(-8).toUpperCase()}`,
            callback_data: `order_${booking._id}`
          }])
        }
      };

      bot.sendMessage(chatId, response, { parse_mode: 'Markdown', ...options });
    } catch (error) {
      console.error('Pending error:', error);
      bot.sendMessage(chatId, '❌ Lỗi khi lấy danh sách đơn chờ');
    }
  });

  // /orders - Danh sách đơn hàng
  bot.onText(/\/orders(?:\s+(.*))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const filter = match[1] || 'all';
    
    try {
      let query = {};
      
      if (filter === 'pending') query = { status: 'pending' };
      else if (filter === 'processing') query = { status: 'processing' };
      else if (filter === 'delivered') query = { status: 'delivered' };
      else if (filter === 'cancelled') query = { status: 'cancelled' };
      else if (filter === 'today') {
        query = { createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } };
      }

      const bookings = await Booking.find(query)
        .populate('productId')
        .sort({ createdAt: -1 })
        .limit(10);

      if (bookings.length === 0) {
        bot.sendMessage(chatId, `📭 Không tìm thấy đơn hàng nào!`);
        return;
      }

      const statusEmoji = {
        'pending': '⏳',
        'processing': '🔄',
        'delivered': '📦',
        'returned': '✅',
        'cancelled': '❌'
      };

      let response = `📋 *DANH SÁCH ĐƠN HÀNG*\n━━━━━━━━━━━━━━━━━━━━━━\n`;
      
      for (const booking of bookings) {
        const orderId = booking._id.toString().slice(-8).toUpperCase();
        response += `
${statusEmoji[booking.status]} ${orderId}
👤 ${booking.customerName}
📷 ${booking.productId?.name?.slice(0, 20) || 'N/A'}
💰 ${booking.totalPrice.toLocaleString('vi-VN')}đ
`;
      }

      bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Orders error:', error);
      bot.sendMessage(chatId, '❌ Lỗi khi lấy danh sách đơn hàng');
    }
  });

  // /products - Danh sách sản phẩm
  bot.onText(/\/products(?:\s+(.*))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const filter = match[1] || 'all';
    
    try {
      let query = {};
      
      if (filter === 'low' || filter === 'stock') {
        query = { stock: { $lte: 1 } };
      } else if (filter === 'hot') {
        query = { isHot: true };
      } else if (filter === 'featured') {
        query = { isFeatured: true };
      }

      const products = await Product.find(query)
        .sort({ rentalCount: -1 })
        .limit(10);

      if (products.length === 0) {
        bot.sendMessage(chatId, '📭 Không tìm thấy sản phẩm nào!');
        return;
      }

      let response = `📷 *DANH SÁCH SẢN PHẨM*\n━━━━━━━━━━━━━━━━━━━━━━\n`;
      
      for (const product of products) {
        const stockEmoji = product.stock > 0 ? '✅' : '❌';
        response += `
${stockEmoji} ${product.name}
🏷️ ${product.brand} | 📦 Còn: ${product.stock}
💰 ${product.pricing.price1d.toLocaleString('vi-VN')}đ/ngày
📊 Đã thuê: ${product.rentalCount} lần
`;
      }

      bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Products error:', error);
      bot.sendMessage(chatId, '❌ Lỗi khi lấy danh sách sản phẩm');
    }
  });

  // /stock - Kiểm tra tồn kho
  bot.onText(/\/stock/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const lowStockProducts = await Product.find({ stock: { $lte: 1 } })
        .sort({ stock: 1 })
        .limit(10);

      const outOfStock = await Product.countDocuments({ stock: 0 });
      const lowStock = await Product.countDocuments({ stock: { $gt: 0, $lte: 1 } });
      const available = await Product.countDocuments({ stock: { $gt: 1 } });

      let response = `📦 *BÁO CÁO TỒN KHO*\n━━━━━━━━━━━━━━━━━━━━━━\n`;
      response += `✅ Còn nhiều: ${available}\n`;
      response += `⚠️ Sắp hết: ${lowStock}\n`;
      response += `❌ Hết hàng: ${outOfStock}\n`;
      response += `━━━━━━━━━━━━━━━━━━━━━━\n`;

      if (lowStockProducts.length > 0) {
        response += `\n⚠️ *Sản phẩm cần nhập thêm:*\n`;
        for (const product of lowStockProducts) {
          response += `• ${product.name}: ${product.stock} cái\n`;
        }
      }

      bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Stock error:', error);
      bot.sendMessage(chatId, '❌ Lỗi khi lấy báo cáo tồn kho');
    }
  });

  // /users - Danh sách người dùng
  bot.onText(/\/users/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
      const recentUsers = await User.find()
        .sort({ createdAt: -1 })
        .limit(10);

      const totalUsers = await User.countDocuments();
      const adminCount = await User.countDocuments({ role: 'admin' });

      let response = `👥 *NGƯỜI DÙNG*\n━━━━━━━━━━━━━━━━━━━━━━\n`;
      response += `📊 Tổng: ${totalUsers} | 👨‍💼 Admin: ${adminCount}\n`;
      response += `━━━━━━━━━━━━━━━━━━━━━━\n`;

      for (const user of recentUsers) {
        const roleEmoji = user.role === 'admin' ? '👨‍💼' : '👤';
        response += `${roleEmoji} ${user.name}\n📧 ${user.email}\n📱 ${user.phone || 'N/A'}\n`;
        response += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      }

      bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Users error:', error);
      bot.sendMessage(chatId, '❌ Lỗi khi lấy danh sách người dùng');
    }
  });

  // /overdue - Danh sách đơn quá hạn
  bot.onText(/\/overdue/, async (msg) => {
    const chatId = msg.chat.id;

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const overdueBookings = await Booking.find({
        status: 'delivered',
        endDate: { $lt: today }
      })
        .populate('productId')
        .sort({ endDate: 1 })
        .limit(20);

      if (overdueBookings.length === 0) {
        bot.sendMessage(chatId, '✅ Không có đơn nào quá hạn!');
        return;
      }

      let response = `🚨 *ĐƠN QUÁ HẠN* (${overdueBookings.length})\n━━━━━━━━━━━━━━━━━━━━━━\n`;

      for (const booking of overdueBookings) {
        const endDate = new Date(booking.endDate);
        const daysOverdue = Math.floor((today - endDate) / (1000 * 60 * 60 * 24));
        const bookingId = booking._id.toString().slice(-8).toUpperCase();
        const productName = booking.productId?.name || 'N/A';

        const overdueEmoji = daysOverdue >= 7 ? '🔴' : daysOverdue >= 3 ? '🟡' : '🟠';

        response += `
${overdueEmoji} *${bookingId}* (${daysOverdue} ngày)
👤 ${booking.customerName}
📱 ${booking.customerPhone}
📷 ${productName}
📅 Trả: ${endDate.toLocaleDateString('vi-VN')}
💰 ${booking.totalPrice?.toLocaleString('vi-VN')}đ
━━━━━━━━━━━━━━━━━━━━━━
`;
      }

      bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Overdue error:', error);
      bot.sendMessage(chatId, '❌ Lỗi khi lấy danh sách đơn quá hạn');
    }
  });
};

// ==================== CALLBACK QUERIES ====================

const registerCallbacks = () => {
  // Xử lý callback từ inline buttons
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    try {
      // Callback: order_xxx - Xem chi tiết đơn
      if (data.startsWith('order_')) {
        const orderId = data.replace('order_', '');
        const booking = await Booking.findById(orderId)
          .populate('productId')
          .populate('userId', 'name email phone');

        if (!booking) {
          bot.answerCallbackQuery(query.id, { text: '❌ Đơn không tồn tại!' });
          return;
        }

        const statusEmoji = {
          'pending': '⏳',
          'processing': '🔄',
          'delivered': '📦',
          'returned': '✅',
          'cancelled': '❌'
        };

        const detailMessage = `
📋 *CHI TIẾT ĐƠN HÀNG*
━━━━━━━━━━━━━━━━━━━━━━
🆔 Mã: ${booking._id.toString().slice(-8).toUpperCase()}
${statusEmoji[booking.status]} Trạng thái: ${booking.status}

👤 *Khách hàng:*
• Tên: ${booking.customerName}
• SĐT: ${booking.customerPhone}
• Email: ${booking.customerEmail || 'N/A'}

📷 *Sản phẩm:*
• ${booking.productId?.name || 'N/A'}
• ${booking.productId?.brand || 'N/A'}

📅 *Thời gian:*
• Nhận: ${new Date(booking.startDate).toLocaleDateString('vi-VN')}
• Trả: ${new Date(booking.endDate).toLocaleDateString('vi-VN')}

💰 *Thanh toán:*
• Giá: ${booking.totalPrice.toLocaleString('vi-VN')}đ
• Đặt cọc: ${(booking.deposit || 0).toLocaleString('vi-VN')}đ

📝 Ghi chú: ${booking.notes || 'Không có'}
        `;

        const options = {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🔄 Xử lý', callback_data: `status_processing_${orderId}` },
                { text: '✅ Giao hàng', callback_data: `status_delivered_${orderId}` }
              ],
              [
                { text: '❌ Hủy đơn', callback_data: `status_cancelled_${orderId}` }
              ],
              [
                { text: '↩️ Quay lại', callback_data: 'back_pending' }
              ]
            ]
          }
        };

        bot.editMessageText(detailMessage, {
          chat_id: chatId,
          message_id: query.message.message_id,
          ...options
        });
        bot.answerCallbackQuery(query.id);
      }

      // Callback: status_xxx - Cập nhật trạng thái
      else if (data.startsWith('status_')) {
        const parts = data.split('_');
        const newStatus = parts[1];
        const orderId = parts[2];

        const booking = await Booking.findById(orderId);
        if (!booking) {
          bot.answerCallbackQuery(query.id, { text: '❌ Đơn không tồn tại!' });
          return;
        }

        const oldStatus = booking.status;
        booking.status = newStatus;
        
        if (newStatus === 'delivered') booking.deliveredAt = new Date();
        if (newStatus === 'returned') booking.returnedAt = new Date();
        if (newStatus === 'cancelled') {
          booking.cancelledAt = new Date();
          booking.cancelledReason = 'Hủy qua Telegram Bot';
        }

        await booking.save();

        // Gửi thông báo cho khách hàng
        await sendStatusUpdateNotification(booking, oldStatus, newStatus);

        bot.answerCallbackQuery(query.id, { 
          text: `✅ Đã cập nhật trạng thái thành ${newStatus}!`,
          show_alert: true 
        });

        // Refresh message
        bot.sendMessage(chatId, `✅ Đã cập nhật đơn ${orderId.slice(-8).toUpperCase()} → ${newStatus}`);
      }

      // Callback: back_pending - Quay lại danh sách pending
      else if (data === 'back_pending') {
        bot.onText(/\/pending/, async () => {});
        bot.emit('text', { chat: { id: chatId }, text: '/pending' });
      }

    } catch (error) {
      console.error('Callback error:', error);
      bot.answerCallbackQuery(query.id, { text: '❌ Đã xảy ra lỗi!' });
    }
  });
};

// ==================== LISTENERS ====================

const registerListeners = () => {
  // Lắng nghe tất cả messages (non-command)
  bot.on('message', async (msg) => {
    // Bỏ qua commands
    if (msg.text && msg.text.startsWith('/')) return;
    
    const chatId = msg.chat.id;
    
    // Tự động reply cho các message không phải command
    bot.sendMessage(chatId, 
      `👋 Cảm ơn tin nhắn của bạn!\n\n` +
      `Đây là Bot quản lý CameraRent.\n` +
      `Gõ /help để xem các commands có sẵn.\n\n` +
      `📞 Hỗ trợ: @CameraRentVN`,
      { parse_mode: 'Markdown' }
    );
  });

  // Xử lý errors
  bot.on('polling_error', (error) => {
    console.error('Polling error:', error.message);
  });

  bot.on('error', (error) => {
    console.error('Bot error:', error);
  });
};

// ==================== NOTIFICATION FUNCTIONS ====================

const sendBookingNotification = async (booking) => {
  if (!bot) {
    console.log('Telegram bot not available. Skipping notification.');
    return false;
  }

  const chatId = process.env.TELEGRAM_CHAT_ID;
  
  if (!chatId || chatId === 'your_telegram_chat_id') {
    console.log('Telegram chat ID not configured. Skipping notification.');
    return false;
  }

  const message = `
📸 *YÊU CẦU THUÊ MỚI*

👤 *Khách hàng:* ${booking.customerName}
📱 *SĐT:* ${booking.customerPhone}
📧 *Email:* ${booking.customerEmail}

📷 *Máy thuê:* ${booking.productId?.name || 'N/A'}
🔢 *Mã sản phẩm:* ${booking.productId?.sku || 'N/A'}

📅 *Ngày nhận:* ${new Date(booking.startDate).toLocaleDateString('vi-VN')}
📅 *Ngày trả:* ${new Date(booking.endDate).toLocaleDateString('vi-VN')}
⏰ *Số ngày:* ${booking.rentalDays}

💰 *Tổng tiền:* ${booking.totalPrice?.toLocaleString('vi-VN')} VNĐ

📝 *Ghi chú:* ${booking.notes || 'Không có'}
`;

  try {
    const options = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 Xử lý ngay', callback_data: `status_processing_${booking._id}` },
            { text: '❌ Từ chối', callback_data: `status_cancelled_${booking._id}` }
          ]
        ]
      }
    };
    await bot.sendMessage(chatId, message, options);
    console.log('✅ Telegram notification sent successfully');
    return true;
  } catch (error) {
    console.error('❌ Error sending Telegram notification:', error.message);
    return false;
  }
};

const sendStatusUpdateNotification = async (booking, oldStatus, newStatus) => {
  if (!bot) return false;

  const chatId = process.env.TELEGRAM_CHAT_ID;
  
  if (!chatId || chatId === 'your_telegram_chat_id') return false;

  const statusEmoji = {
    'pending': '⏳',
    'processing': '🔄',
    'delivered': '📦',
    'returned': '✅',
    'cancelled': '❌'
  };

  const statusLabels = {
    'pending': 'Chờ xác nhận',
    'processing': 'Đang xử lý',
    'delivered': 'Đã giao hàng',
    'returned': 'Đã trả máy',
    'cancelled': 'Đã hủy'
  };

  const message = `
🔔 *CẬP NHẬT ĐƠN THUÊ*

📋 *Mã đơn:* ${booking._id.toString().slice(-8).toUpperCase()}

${statusEmoji[oldStatus] || '📍'} *Trạng thái cũ:* ${statusLabels[oldStatus] || oldStatus}
${statusEmoji[newStatus] || '📍'} *Trạng thái mới:* ${statusLabels[newStatus] || newStatus}

👤 *Khách hàng:* ${booking.customerName}
📱 *SĐT:* ${booking.customerPhone}
📷 *Máy thuê:* ${booking.productId?.name || 'N/A'}
💰 *Tổng tiền:* ${booking.totalPrice?.toLocaleString('vi-VN')}đ
  `;

  try {
    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    return true;
  } catch (error) {
    console.error('Error sending status update notification:', error.message);
    return false;
  }
};

const sendLowStockAlert = async (product) => {
  if (!bot) return false;

  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!chatId || chatId === 'your_telegram_chat_id') return false;

  const message = `
⚠️ *CẢNH BÁO TỒN KHO THẤP*

📷 *Sản phẩm:* ${product.name}
🏷️ *Hãng:* ${product.brand}
📦 *Số lượng còn:* ${product.stock}

⚡ Vui lòng kiểm tra và nhập thêm hàng!
  `;

  try {
    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    return true;
  } catch (error) {
    console.error('Error sending low stock alert:', error.message);
    return false;
  }
};

const sendPaymentConfirmationNotification = async (payment, booking = null, adminName = 'Admin') => {
  if (!bot) {
    console.log('Telegram bot not available. Skipping payment notification.');
    return false;
  }

  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!chatId || chatId === 'your_telegram_chat_id') {
    console.log('Telegram chat ID not configured. Skipping payment notification.');
    return false;
  }

  const formattedAmount = payment.amount.toLocaleString('vi-VN');
  const paymentIdShort = payment._id ? payment._id.toString().slice(-8).toUpperCase() : 'N/A';

  // Build booking info if available
  let bookingInfo = '';
  if (booking) {
    const bookingIdShort = booking._id ? booking._id.toString().slice(-8).toUpperCase() : 'N/A';
    bookingInfo = `
━━━━━━━━━━━━━━━━━━━━━━
📋 *THÔNG TIN ĐƠN HÀNG:*
━━━━━━━━━━━━━━━━━━━━━━
🆔 Mã đơn: ${bookingIdShort}
👤 Khách hàng: ${booking.customerName}
📱 SĐT: ${booking.customerPhone}
📷 Sản phẩm: ${booking.productId?.name || booking.product?.name || 'N/A'}
📅 Nhận: ${booking.startDate ? new Date(booking.startDate).toLocaleDateString('vi-VN') : 'N/A'}
📅 Trả: ${booking.endDate ? new Date(booking.endDate).toLocaleDateString('vi-VN') : 'N/A'}
💰 Tổng tiền: ${booking.totalPrice?.toLocaleString('vi-VN')}đ
🔄 Trạng thái: ✅ Đã thanh toán
━━━━━━━━━━━━━━━━━━━━━━`;
  }

  const message = `
💰 *XÁC NHẬN THANH TOÁN THÀNH CÔNG*
━━━━━━━━━━━━━━━━━━━━━━
✅ *Mã thanh toán:* ${paymentIdShort}
💵 *Số tiền:* ${formattedAmount}đ
🏦 *Ngân hàng:* ${payment.bankName}
📝 *Nội dung CK:* ${payment.transferContent}
👤 *Người xác nhận:* ${adminName}
⏰ *Thời gian:* ${new Date().toLocaleString('vi-VN')}
${bookingInfo}
`;

  try {
    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    console.log('✅ Payment confirmation notification sent successfully');
    return true;
  } catch (error) {
    console.error('Error sending payment confirmation notification:', error.message);
    return false;
  }
};

// Notify admin about pending VietQR payment that needs confirmation
const sendPendingPaymentAlert = async (payment, booking = null) => {
  if (!bot) return false;

  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId || chatId === 'your_telegram_chat_id') return false;

  const formattedAmount = payment.amount.toLocaleString('vi-VN');
  const paymentIdShort = payment._id ? payment._id.toString().slice(-8).toUpperCase() : 'N/A';

  let customerInfo = '';
  if (booking) {
    customerInfo = `
👤 *Khách hàng:* ${booking.customerName}
📱 *SĐT:* ${booking.customerPhone}
📧 *Email:* ${booking.customerEmail || 'N/A'}`;
  }

  const message = `
⏰ *THANH TOÁN CHỜ XÁC NHẬN*
━━━━━━━━━━━━━━━━━━━━━━
📋 *Mã thanh toán:* ${paymentIdShort}
💵 *Số tiền:* ${formattedAmount}đ
🏦 *Ngân hàng:* ${payment.bankName}
📝 *Nội dung CK:* \`${payment.transferContent}\`
${customerInfo}
⏰ *Thời gian tạo:* ${new Date().toLocaleString('vi-VN')}
━━━━━━━━━━━━━━━━━━━━━━

⚠️ Vui lòng kiểm tra tài khoản và xác nhận thanh toán!
`;

  try {
    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    return true;
  } catch (error) {
    console.error('Error sending pending payment alert:', error.message);
    return false;
  }
};

const sendDailyReport = async () => {
  if (!bot) return false;

  const chatId = process.env.TELEGRAM_CHAT_ID;
  
  if (!chatId || chatId === 'your_telegram_chat_id') return false;

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      todayBookings,
      todayRevenue,
      pendingBookings,
      stockCount
    ] = await Promise.all([
      Booking.countDocuments({ createdAt: { $gte: today } }),
      Booking.aggregate([
        { $match: { createdAt: { $gte: today }, status: { $nin: ['cancelled'] } } },
        { $group: { _id: null, total: { $sum: '$totalPrice' } } }
      ]),
      Booking.countDocuments({ status: 'pending' }),
      Product.countDocuments({ stock: { $lte: 1 } })
    ]);

    const revenue = todayRevenue[0]?.total || 0;

    const message = `
📊 *BÁO CÁO HÀNG NGÀY*
━━━━━━━━━━━━━━━━━━━━━━
📅 ${today.toLocaleDateString('vi-VN')}

🛒 *Đơn hàng hôm nay:* ${todayBookings}
💰 *Doanh thu:* ${revenue.toLocaleString('vi-VN')}đ
⏳ *Đơn chờ:* ${pendingBookings}
⚠️ *Sản phẩm sắp hết:* ${stockCount}
━━━━━━━━━━━━━━━━━━━━━━
  `;

    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    return true;
  } catch (error) {
    console.error('Error sending daily report:', error.message);
    return false;
  }
};

// ==================== OVERDUE BOOKINGS CHECKER ====================

let overdueCheckInterval = null;

const checkOverdueBookings = async () => {
  if (!bot) return;

  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId || chatId === 'your_telegram_chat_id') return;

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Tìm các đơn đã giao (delivered) nhưng đã quá ngày trả
    const overdueBookings = await Booking.find({
      status: 'delivered',
      endDate: { $lt: today }
    })
      .populate('productId')
      .sort({ endDate: 1 });

    if (overdueBookings.length === 0) return;

    const overdueCount = overdueBookings.length;
    let totalDaysOverdue = 0;

    const bookingList = overdueBookings.map(booking => {
      const endDate = new Date(booking.endDate);
      const daysOverdue = Math.floor((today - endDate) / (1000 * 60 * 60 * 24));
      totalDaysOverdue += daysOverdue;

      const bookingId = booking._id.toString().slice(-8).toUpperCase();
      const productName = booking.productId?.name || 'N/A';
      const overdueEmoji = daysOverdue >= 7 ? '🔴' : daysOverdue >= 3 ? '🟡' : '🟠';

      return `
${overdueEmoji} *${bookingId}*
👤 ${booking.customerName} | 📱 ${booking.customerPhone}
📷 ${productName}
📅 Qua hạn: *${daysOverdue} ngày* (${endDate.toLocaleDateString('vi-VN')})
💰 ${booking.totalPrice?.toLocaleString('vi-VN')}đ`;
    }).join('\n━━━━━━━━━━━━━━━━━━━━━━\n');

    const message = `
🚨 *CẢNH BÁO ĐƠN QUÁ HẠN*
━━━━━━━━━━━━━━━━━━━━━━

⚠️ *Tổng cộng:* ${overdueCount} đơn quá hạn
📅 Tổng số ngày quá hạn: ${totalDaysOverdue} ngày

━━━━━━━━━━━━━━━━━━━━━━
${bookingList}
━━━━━━━━━━━━━━━━━━━━━━

⚡ Vui lòng liên hệ khách hàng để nhận lại thiết bị!
`;

    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    console.log(`[Telegram] Sent overdue bookings alert: ${overdueCount} bookings`);
  } catch (error) {
    console.error('Error checking overdue bookings:', error.message);
  }
};

const startOverdueChecker = (intervalHours = 1) => {
  // Chạy ngay lần đầu sau 30 giây
  setTimeout(() => {
    checkOverdueBookings();
  }, 30000);

  // Sau đó chạy định kỳ theo intervalHours
  overdueCheckInterval = setInterval(() => {
    checkOverdueBookings();
  }, intervalHours * 60 * 60 * 1000);

  console.log(`[Telegram] Overdue checker started - will run every ${intervalHours} hour(s)`);
};

const stopOverdueChecker = () => {
  if (overdueCheckInterval) {
    clearInterval(overdueCheckInterval);
    overdueCheckInterval = null;
    console.log('[Telegram] Overdue checker stopped');
  }
};

module.exports = {
  initTelegramBot,
  sendBookingNotification,
  sendStatusUpdateNotification,
  sendLowStockAlert,
  sendDailyReport,
  sendPaymentConfirmationNotification,
  sendPendingPaymentAlert,
  startOverdueChecker,
  stopOverdueChecker,
  checkOverdueBookings
};

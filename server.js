require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const passport = require('passport');
const connectDB = require('./config/db');
const { initTelegramBot, startOverdueChecker } = require('./config/telegram');
require('./config/passport');

const authRoutes = require('./routes/authRoutes');
const googleAuthRoutes = require('./routes/googleAuthRoutes');
const productRoutes = require('./routes/productRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const bannerRoutes = require('./routes/bannerRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');
const userRoutes = require('./routes/userRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const vietqrRoutes = require('./routes/vietqrRoutes');
const chatRoutes = require('./routes/chatRoutes');

const { errorHandler, notFound } = require('./middleware/errorHandler');

const app = express();

connectDB();

// Khởi tạo Telegram bot
const telegramBot = initTelegramBot();
if (telegramBot) {
  console.log('📱 Telegram bot đang chạy');
  // Bắt đầu kiểm tra đơn quá hạn (mỗi 1 giờ)
  startOverdueChecker(1);
}

// CORS Configuration - Allow Vercel frontend with credentials
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://camera-rental-frontend-v2.vercel.app',
  process.env.CLIENT_URL
].filter(Boolean);

// Remove duplicates
const uniqueOrigins = [...new Set(allowedOrigins)];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    if (uniqueOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['set-cookie']
};

app.use(cors(corsOptions));

// Preflight handler for all routes
app.options('*', cors(corsOptions));

app.use(passport.initialize());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/auth/google', googleAuthRoutes);
app.use('/api/products', productRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/users', userRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/payments', vietqrRoutes);
app.use('/api/chat', chatRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Camera Rental API is running' });
});

// Root route - API info
app.get('/', (req, res) => {
  res.json({
    name: 'Camera Rental API',
    version: '1.0.0',
    status: 'OK',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      products: '/api/products',
      bookings: '/api/bookings',
      banners: '/api/banners',
      feedback: '/api/feedback',
      users: '/api/users'
    }
  });
});

app.use(notFound);
app.use(errorHandler);



const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;

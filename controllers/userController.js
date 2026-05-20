const User = require('../models/User');
const Booking = require('../models/Booking');

const getAllUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, role } = req.query;
    const query = {};

    if (role) {
      query.role = role;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      User.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: Number(page),
          totalPages: Math.ceil(total / Number(limit)),
          totalUsers: total
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'Người dùng không tồn tại' });
    }

    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    next(error);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, phone, role, isActive, address } = req.body;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ message: 'Người dùng không tồn tại' });
    }

    if (name) user.name = name;
    if (phone !== undefined) user.phone = phone;
    if (role !== undefined) user.role = role;
    if (isActive !== undefined) user.isActive = isActive;
    if (address !== undefined) user.address = address;

    await user.save();

    res.json({
      success: true,
      message: 'Cập nhật người dùng thành công',
      data: { user }
    });
  } catch (error) {
    next(error);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (id === req.user._id.toString()) {
      return res.status(400).json({ message: 'Bạn không thể xóa tài khoản của chính mình' });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ message: 'Người dùng không tồn tại' });
    }

    if (user.role === 'admin') {
      return res.status(400).json({ message: 'Không thể xóa tài khoản admin' });
    }

    await User.findByIdAndDelete(id);

    await Booking.updateMany(
      { userId: id },
      { $set: { status: 'cancelled', cancelledReason: 'Tài khoản người dùng đã bị xóa' } }
    );

    res.json({
      success: true,
      message: 'Xóa người dùng thành công'
    });
  } catch (error) {
    next(error);
  }
};

const getUserBookings = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'Người dùng không tồn tại' });
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [bookings, total] = await Promise.all([
      Booking.find({ userId: id })
        .populate('productId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Booking.countDocuments({ userId: id })
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

const getUserStats = async (req, res, next) => {
  try {
    const [total, admins, customers, activeUsers, inactiveUsers] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ role: 'user' }),
      User.countDocuments({ isActive: true }),
      User.countDocuments({ isActive: false })
    ]);

    const newUsersThisMonth = await User.countDocuments({
      createdAt: {
        $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      }
    });

    res.json({
      success: true,
      data: {
        total,
        admins,
        customers,
        activeUsers,
        inactiveUsers,
        newUsersThisMonth
      }
    });
  } catch (error) {
    next(error);
  }
};

// Lấy danh sách sản phẩm yêu thích
const getFavorites = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate('favorites');
    
    res.json({
      success: true,
      data: {
        favorites: user.favorites
      }
    });
  } catch (error) {
    next(error);
  }
};

// Thêm sản phẩm vào yêu thích
const addFavorite = async (req, res, next) => {
  try {
    const { productId } = req.body;
    
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Sản phẩm không tồn tại' });
    }

    const user = await User.findById(req.user._id);
    
    // Kiểm tra đã có trong favorites chưa
    if (user.favorites.includes(productId)) {
      return res.status(400).json({ message: 'Sản phẩm đã có trong danh sách yêu thích' });
    }

    user.favorites.push(productId);
    await user.save();

    res.json({
      success: true,
      message: 'Đã thêm vào danh sách yêu thích',
      data: { favorites: user.favorites }
    });
  } catch (error) {
    next(error);
  }
};

// Xóa sản phẩm khỏi yêu thích
const removeFavorite = async (req, res, next) => {
  try {
    const { productId } = req.params;

    const user = await User.findById(req.user._id);
    
    user.favorites = user.favorites.filter(id => id.toString() !== productId);
    await user.save();

    res.json({
      success: true,
      message: 'Đã xóa khỏi danh sách yêu thích',
      data: { favorites: user.favorites }
    });
  } catch (error) {
    next(error);
  }
};

// Kiểm tra sản phẩm có trong yêu thích không
const checkFavorite = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const user = await User.findById(req.user._id);
    
    const isFavorite = user.favorites.some(id => id.toString() === productId);

    res.json({
      success: true,
      data: { isFavorite }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getUserBookings,
  getUserStats
};

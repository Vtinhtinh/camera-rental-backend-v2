const Feedback = require('../models/Feedback');
const Product = require('../models/Product');
const Booking = require('../models/Booking');

const getFeedbacks = async (req, res, next) => {
  try {
    const { productId, brand, page = 1, limit = 10, sortBy = 'createdAt' } = req.query;
    const query = { isVisible: true };

    if (productId) {
      query.productId = productId;
    }

    if (brand) {
      const products = await Product.find({ brand }).distinct('_id');
      query.productId = { $in: products };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const sortOptions = {};

    if (sortBy === 'rating') {
      sortOptions.rating = -1;
    } else if (sortBy === 'helpful') {
      sortOptions.helpful = -1;
    } else {
      sortOptions[sortBy] = -1;
    }

    const [feedbacks, total] = await Promise.all([
      Feedback.find(query)
        .populate('productId', 'name brand mainImage')
        .populate('userId', 'name avatar')
        .sort(sortOptions)
        .skip(skip)
        .limit(Number(limit)),
      Feedback.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        feedbacks,
        pagination: {
          currentPage: Number(page),
          totalPages: Math.ceil(total / Number(limit)),
          totalFeedbacks: total
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

const getFeedbackByProduct = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [feedbacks, total, stats] = await Promise.all([
      Feedback.find({ productId, isVisible: true })
        .populate('userId', 'name avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Feedback.countDocuments({ productId, isVisible: true }),
      Feedback.getAverageRating(productId)
    ]);

    res.json({
      success: true,
      data: {
        feedbacks,
        stats,
        pagination: {
          currentPage: Number(page),
          totalPages: Math.ceil(total / Number(limit)),
          totalFeedbacks: total
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

const createFeedback = async (req, res, next) => {
  try {
    const { productId, rating, title, content, images, bookingId, deviceUsed } = req.body;

    if (!productId || !rating || !content) {
      return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin bắt buộc' });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Số sao phải từ 1 đến 5' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Sản phẩm không tồn tại' });
    }

    let isVerified = false;
    if (bookingId) {
      const booking = await Booking.findOne({
        _id: bookingId,
        userId: req.user._id,
        status: 'returned'
      });
      if (booking) {
        isVerified = true;
      }
    }

    const feedback = await Feedback.create({
      userId: req.user._id,
      productId,
      bookingId,
      customerName: req.user.name,
      rating,
      title,
      content,
      images: images || [],
      isVerified,
      deviceUsed
    });

    await feedback.populate('productId', 'name brand mainImage');
    await feedback.populate('userId', 'name avatar');

    const ratingStats = await Feedback.getAverageRating(productId);
    await Product.findByIdAndUpdate(productId, {
      averageRating: ratingStats.averageRating,
      reviewCount: ratingStats.totalReviews
    });

    res.status(201).json({
      success: true,
      message: 'Gửi đánh giá thành công',
      data: { feedback }
    });
  } catch (error) {
    next(error);
  }
};

const updateFeedback = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rating, title, content, images } = req.body;

    const feedback = await Feedback.findById(id);

    if (!feedback) {
      return res.status(404).json({ message: 'Feedback không tồn tại' });
    }

    if (feedback.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Bạn không có quyền sửa feedback này' });
    }

    if (rating) feedback.rating = rating;
    if (title !== undefined) feedback.title = title;
    if (content !== undefined) feedback.content = content;
    if (images) feedback.images = images;

    await feedback.save();

    const ratingStats = await Feedback.getAverageRating(feedback.productId);
    await Product.findByIdAndUpdate(feedback.productId, {
      averageRating: ratingStats.averageRating,
      reviewCount: ratingStats.totalReviews
    });

    res.json({
      success: true,
      message: 'Cập nhật đánh giá thành công',
      data: { feedback }
    });
  } catch (error) {
    next(error);
  }
};

const deleteFeedback = async (req, res, next) => {
  try {
    const { id } = req.params;
    const feedback = await Feedback.findById(id);

    if (!feedback) {
      return res.status(404).json({ message: 'Feedback không tồn tại' });
    }

    if (feedback.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Bạn không có quyền xóa feedback này' });
    }

    await Feedback.findByIdAndDelete(id);

    const ratingStats = await Feedback.getAverageRating(feedback.productId);
    await Product.findByIdAndUpdate(feedback.productId, {
      averageRating: ratingStats.averageRating,
      reviewCount: ratingStats.totalReviews
    });

    res.json({
      success: true,
      message: 'Xóa đánh giá thành công'
    });
  } catch (error) {
    next(error);
  }
};

const getFeaturedFeedbacks = async (req, res, next) => {
  try {
    const feedbacks = await Feedback.find({ isVisible: true, isFeatured: true })
      .populate('productId', 'name brand mainImage')
      .populate('userId', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(6);

    res.json({
      success: true,
      data: { feedbacks }
    });
  } catch (error) {
    next(error);
  }
};

const replyFeedback = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ message: 'Nội dung phản hồi là bắt buộc' });
    }

    const feedback = await Feedback.findById(id);

    if (!feedback) {
      return res.status(404).json({ message: 'Feedback không tồn tại' });
    }

    feedback.adminReply = {
      content,
      repliedAt: new Date(),
      repliedBy: req.user._id
    };

    await feedback.save();

    res.json({
      success: true,
      message: 'Phản hồi đánh giá thành công',
      data: { feedback }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getFeedbacks,
  getFeedbackByProduct,
  createFeedback,
  updateFeedback,
  deleteFeedback,
  getFeaturedFeedbacks,
  replyFeedback
};

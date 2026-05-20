const Banner = require('../models/Banner');

const getActiveBanners = async (req, res, next) => {
  try {
    const { position } = req.query;
    const query = { isActive: true };

    const now = new Date();
    query.$or = [
      { startDate: null, endDate: null },
      { startDate: { $lte: now }, endDate: null },
      { startDate: null, endDate: { $gte: now } },
      { startDate: { $lte: now }, endDate: { $gte: now } }
    ];

    if (position) {
      query.position = position;
    }

    const banners = await Banner.find(query).sort({ order: 1, createdAt: -1 });

    res.json({
      success: true,
      data: { banners }
    });
  } catch (error) {
    next(error);
  }
};

const getAllBanners = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [banners, total] = await Promise.all([
      Banner.find()
        .sort({ position: 1, order: 1, createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Banner.countDocuments()
    ]);

    res.json({
      success: true,
      data: {
        banners,
        pagination: {
          currentPage: Number(page),
          totalPages: Math.ceil(total / Number(limit)),
          totalBanners: total
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

const getBannerById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const banner = await Banner.findById(id);

    if (!banner) {
      return res.status(404).json({ message: 'Banner không tồn tại' });
    }

    res.json({
      success: true,
      data: { banner }
    });
  } catch (error) {
    next(error);
  }
};

const createBanner = async (req, res, next) => {
  try {
    const bannerData = req.body;
    const banner = await Banner.create(bannerData);

    res.status(201).json({
      success: true,
      message: 'Tạo banner thành công',
      data: { banner }
    });
  } catch (error) {
    next(error);
  }
};

const updateBanner = async (req, res, next) => {
  try {
    const { id } = req.params;
    const bannerData = req.body;

    const banner = await Banner.findByIdAndUpdate(
      id,
      bannerData,
      { new: true, runValidators: true }
    );

    if (!banner) {
      return res.status(404).json({ message: 'Banner không tồn tại' });
    }

    res.json({
      success: true,
      message: 'Cập nhật banner thành công',
      data: { banner }
    });
  } catch (error) {
    next(error);
  }
};

const deleteBanner = async (req, res, next) => {
  try {
    const { id } = req.params;
    const banner = await Banner.findByIdAndDelete(id);

    if (!banner) {
      return res.status(404).json({ message: 'Banner không tồn tại' });
    }

    res.json({
      success: true,
      message: 'Xóa banner thành công'
    });
  } catch (error) {
    next(error);
  }
};

const reorderBanners = async (req, res, next) => {
  try {
    const { banners } = req.body;

    if (!Array.isArray(banners)) {
      return res.status(400).json({ message: 'Dữ liệu không hợp lệ' });
    }

    const updatePromises = banners.map((item) =>
      Banner.findByIdAndUpdate(item.id, { order: item.order })
    );

    await Promise.all(updatePromises);

    res.json({
      success: true,
      message: 'Cập nhật thứ tự banner thành công'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getActiveBanners,
  getAllBanners,
  getBannerById,
  createBanner,
  updateBanner,
  deleteBanner,
  reorderBanners
};

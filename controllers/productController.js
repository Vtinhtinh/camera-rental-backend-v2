const Product = require('../models/Product');
const Feedback = require('../models/Feedback');

const getProducts = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 12,
      brand,
      category,
      search,
      minPrice,
      maxPrice,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      isFeatured,
      isHot,
      isNew
    } = req.query;

    const query = {};

    if (brand) {
      query.brand = brand;
    }

    if (category) {
      query.category = category;
    }

    if (search) {
      const searchLower = search.toLowerCase();
      query.$or = [
        { name: { $regex: searchLower, $options: 'i' } },
        { brand: { $regex: searchLower, $options: 'i' } },
        { description: { $regex: searchLower, $options: 'i' } }
      ];
    }

    if (isFeatured === 'true') {
      query.isFeatured = true;
    }

    if (isHot === 'true') {
      query.isHot = true;
    }

    if (isNew === 'true') {
      query.isNew = true;
    }

    if (minPrice || maxPrice) {
      query['pricing.price1d'] = {};
      if (minPrice) query['pricing.price1d'].$gte = Number(minPrice);
      if (maxPrice) query['pricing.price1d'].$lte = Number(maxPrice);
    }

    query.isAvailable = true;

    const sortOptions = {};
    if (sortBy === 'price') {
      sortOptions['pricing.price1d'] = sortOrder === 'asc' ? 1 : -1;
    } else {
      sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [products, total] = await Promise.all([
      Product.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(Number(limit)),
      Product.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        products,
        pagination: {
          currentPage: Number(page),
          totalPages: Math.ceil(total / Number(limit)),
          totalProducts: total,
          hasMore: skip + products.length < total
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

const getProductById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({ message: 'Sản phẩm không tồn tại' });
    }

    const relatedProducts = await Product.find({
      _id: { $ne: id },
      $or: [
        { brand: product.brand },
        { category: product.category }
      ],
      isAvailable: true
    }).limit(4);

    res.json({
      success: true,
      data: { product, relatedProducts }
    });
  } catch (error) {
    next(error);
  }
};

const getFeaturedProducts = async (req, res, next) => {
  try {
    const featured = await Product.find({ isFeatured: true, isAvailable: true }).limit(8);
    const hot = await Product.find({ isHot: true, isAvailable: true })
      .sort({ rentalCount: -1 })
      .limit(8);
    const newest = await Product.find({ isNew: true, isAvailable: true })
      .sort({ createdAt: -1 })
      .limit(8);

    res.json({
      success: true,
      data: { featured, hot, newest }
    });
  } catch (error) {
    next(error);
  }
};

const getBrands = async (req, res, next) => {
  try {
    const brands = await Product.distinct('brand', { isAvailable: true });
    res.json({
      success: true,
      data: { brands }
    });
  } catch (error) {
    next(error);
  }
};

const createProduct = async (req, res, next) => {
  try {
    const productData = req.body;

    // Kiểm tra trùng SKU nếu có provided
    if (productData.sku && productData.sku.trim() !== '') {
      const existingSku = await Product.findOne({ sku: productData.sku.trim() });
      if (existingSku) {
        return res.status(400).json({
          success: false,
          message: 'Mã SKU đã tồn tại trong hệ thống. Vui lòng sử dụng mã SKU khác.'
        });
      }
    }

    const product = await Product.create(productData);

    res.status(201).json({
      success: true,
      message: 'Tạo sản phẩm thành công',
      data: { product }
    });
  } catch (error) {
    next(error);
  }
};

const updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const productData = req.body;

    // Kiểm tra trùng SKU nếu có provided và khác với SKU hiện tại
    if (productData.sku && productData.sku.trim() !== '') {
      const existingSku = await Product.findOne({
        sku: productData.sku.trim(),
        _id: { $ne: id }
      });
      if (existingSku) {
        return res.status(400).json({
          success: false,
          message: 'Mã SKU đã tồn tại trong hệ thống. Vui lòng sử dụng mã SKU khác.'
        });
      }
    }

    const product = await Product.findByIdAndUpdate(
      id,
      productData,
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({ message: 'Sản phẩm không tồn tại' });
    }

    res.json({
      success: true,
      message: 'Cập nhật sản phẩm thành công',
      data: { product }
    });
  } catch (error) {
    next(error);
  }
};

const deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = await Product.findByIdAndDelete(id);

    if (!product) {
      return res.status(404).json({ message: 'Sản phẩm không tồn tại' });
    }

    await Feedback.deleteMany({ productId: id });

    res.json({
      success: true,
      message: 'Xóa sản phẩm thành công'
    });
  } catch (error) {
    next(error);
  }
};

const getProductStats = async (req, res, next) => {
  try {
    const [total, available, rented, outOfStock] = await Promise.all([
      Product.countDocuments(),
      Product.countDocuments({ isAvailable: true }),
      Product.countDocuments({ isAvailable: true, stock: 1 }),
      Product.countDocuments({ stock: 0 })
    ]);

    const brands = await Product.aggregate([
      { $group: { _id: '$brand', count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      data: {
        total,
        available,
        rented,
        outOfStock,
        brands
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProducts,
  getProductById,
  getFeaturedProducts,
  getBrands,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductStats
};

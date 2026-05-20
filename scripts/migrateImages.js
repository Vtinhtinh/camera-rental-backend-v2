require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');

async function migrateImages() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/camera-rental');
    console.log('✅ Connected to MongoDB');

    // Tìm tất cả sản phẩm có mainImage nhưng images rỗng
    const products = await Product.find({
      mainImage: { $exists: true, $ne: '' },
      $or: [
        { images: { $exists: false } },
        { images: { $size: 0 } }
      ]
    });

    console.log(`📦 Found ${products.length} products to migrate`);

    for (const product of products) {
      // Chuyển mainImage sang images
      product.images = [product.mainImage];
      await product.save();
      console.log(`✅ Migrated: ${product.name}`);
    }

    console.log('\n🎉 Migration completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrateImages();

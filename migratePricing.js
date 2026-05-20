/**
 * Migration Script: Update pricing fields for products
 * Run: node server/migratePricing.js
 * 
 * This script migrates old pricing fields to new structure:
 * - price1d -> price2d (half of old 2-day price if exists)
 * - price3dPlus -> pricePerDay (old 3d+ price per day)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Product = require('../models/Product');

const migratePricing = async () => {
  try {
    console.log('🔄 Starting pricing migration...\n');

    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all products
    const products = await Product.find({});
    console.log(`📦 Found ${products.length} products\n`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const product of products) {
      const oldPricing = product.pricing || {};
      let needsUpdate = false;
      const updates = {};

      // Skip if already migrated (has new fields with values)
      if (oldPricing.price2d && oldPricing.pricePerDay) {
        skippedCount++;
        continue;
      }

      // Migrate: Use existing price1d as base, or calculate from 2d/3d+
      if (oldPricing.price1d && oldPricing.price1d > 0) {
        // Use old 1-day price as new 2-day price (base price)
        updates['pricing.price2d'] = oldPricing.price1d;
        needsUpdate = true;
      } else if (oldPricing.price2d && oldPricing.price2d > 0) {
        // If only 2d exists, keep it
        updates['pricing.price2d'] = oldPricing.price2d;
        needsUpdate = true;
      }

      // Migrate: Use existing price3dPlus as pricePerDay
      if (oldPricing.price3dPlus && oldPricing.price3dPlus > 0) {
        updates['pricing.pricePerDay'] = oldPricing.price3dPlus;
        needsUpdate = true;
      } else if (oldPricing.price1d && oldPricing.price1d > 0) {
        // If no 3d+ price, set pricePerDay to ~50% of 1-day price
        updates['pricing.pricePerDay'] = Math.round(oldPricing.price1d * 0.5);
        needsUpdate = true;
      }

      // Set default prices if nothing exists
      if (!oldPricing.price6h) updates['pricing.price6h'] = 0;
      if (!oldPricing.price12h) updates['pricing.price12h'] = 0;

      if (needsUpdate) {
        await Product.findByIdAndUpdate(product._id, updates);
        updatedCount++;
        console.log(`  ✅ Updated: ${product.name}`);
        console.log(`     Old: price6h=${oldPricing.price6h}, price12h=${oldPricing.price12h}, price1d=${oldPricing.price1d || '-'}, price2d=${oldPricing.price2d || '-'}, price3d+=${oldPricing.price3dPlus || '-'}`);
        console.log(`     New: price6h=${updates['pricing.price6h'] || oldPricing.price6h}, price12h=${updates['pricing.price12h'] || oldPricing.price12h}, price2d=${updates['pricing.price2d']}, pricePerDay=${updates['pricing.pricePerDay']}`);
        console.log();
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Migration complete!`);
    console.log(`   • Updated: ${updatedCount} products`);
    console.log(`   • Skipped (already migrated): ${skippedCount} products`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Show sample of updated products
    console.log('\n📋 Sample of migrated products:\n');
    const sample = await Product.find({}).limit(3);
    for (const p of sample) {
      console.log(`  ${p.name}:`);
      console.log(`    price6h: ${p.pricing?.price6h}`);
      console.log(`    price12h: ${p.pricing?.price12h}`);
      console.log(`    price2d: ${p.pricing?.price2d}`);
      console.log(`    pricePerDay: ${p.pricing?.pricePerDay}`);
      console.log();
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
};

migratePricing();

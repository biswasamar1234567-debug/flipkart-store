// One-time migration: JSON files -> MongoDB
// Usage: node migrate.js
const fs = require('fs');
const path = require('path');
const db = require('./db');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
  } catch (e) {
    return fallback;
  }
}

(async () => {
  await db.connect();

  // 1. Products
  const data = readJson('data.json', { products: [] });
  const products = data.products || [];
  if (products.length) {
    await db.saveProducts({ products });
    console.log(`✅ products: ${products.length} migrated`);
  } else {
    console.log('ℹ️  products: none to migrate');
  }

  // 2. Admin config
  const cfg = readJson('admin_config.json', null);
  if (cfg) {
    await db.saveConfig(cfg);
    console.log('✅ config: migrated (categories, banners, cloudinary, groq, secrets)');
  }

  // 3. Payment info
  const info = readJson('info.json', null);
  if (info) {
    await db.savePaymentInfo(info, 'owner');
    console.log('✅ payment_info (owner): migrated');
  }

  // Report
  const counts = {};
  for (const name of ['products', 'config', 'payment_info', 'sessions']) {
    counts[name] = await db.db().collection(name).countDocuments();
  }
  console.log('📊 Collection counts:', counts);

  await db.close();
  console.log('🎉 Migration complete.');
})().catch(err => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});

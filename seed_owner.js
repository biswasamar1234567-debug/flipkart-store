// Seed the Owner account (and optionally a super_admin) into MongoDB.
// Usage: node seed_owner.js
const db = require('./db');

(async () => {
  await db.connect();
  await db.ensureUserIndexes();

  const OWNER_EMAIL = 'biswasamar1234567@gmail.com';

  const existing = await db.findUserByEmail(OWNER_EMAIL);
  if (existing) {
    console.log('ℹ️  Owner already exists:', existing.email, '| role:', existing.role, '| id:', existing._id);
  } else {
    const owner = await db.createUser({
      role: 'owner',
      fullName: 'Amar Biswas',
      mobile: '',
      storeName: 'Main Store',
      storeSlug: 'owner',
      email: OWNER_EMAIL,
      password: 'Amarendrab887@'
    });
    console.log('✅ Owner created:', owner.email, '| id:', owner._id);
  }

  // Owner's store record (this is the "main" website)
  await db.createStore({
    slug: 'owner',
    storeName: 'Main Store',
    ownerId: String((await db.findUserByEmail(OWNER_EMAIL))._id),
    ownerEmail: OWNER_EMAIL,
    upiId: 'paytm.s251hc1@pty',
    domain: '',
    active: true
  });
  console.log('✅ Owner store record ready (slug: owner)');

  // Permanent license for the owner store so it never expires
  const ownerLic = (await db.listLicenses('owner')).find(l => l.status === 'active');
  if (!ownerLic) {
    const lic = await db.createLicense({
      storeSlug: 'owner',
      storeName: 'Main Store',
      plan: 'lifetime',
      durationDays: 36500,
      amount: 0,
      status: 'active',
      startsAt: new Date()
    });
    console.log('✅ Owner lifetime license:', lic.key);
  } else {
    console.log('ℹ️  Owner license already active:', ownerLic.key);
  }

  const counts = {};
  for (const c of ['users', 'stores', 'licenses', 'payment_requests', 'products', 'config', 'payment_info', 'sessions']) {
    counts[c] = await db.db().collection(c).countDocuments();
  }
  console.log('📊 Counts:', counts);

  await db.close();
})().catch(e => { console.error('❌', e.message); process.exit(1); });

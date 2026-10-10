// -------------------------------------------------------------
// MongoDB connection + data access layer (replaces JSON file I/O)
// -------------------------------------------------------------
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { MongoClient, ObjectId } = require('mongodb');

// .env loader (works with or without the dotenv package)
(function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  });
})();

const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = process.env.MONGODB_DB || 'flipkart_store';

let _client = null;
let _db = null;
let _connecting = null;

async function connect() {
  if (_db) return _db;
  if (_connecting) return _connecting;
  if (!MONGODB_URI) throw new Error('MONGODB_URI missing from .env');

  _connecting = (async () => {
    _client = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 15000,
      maxPoolSize: 10
    });
    await _client.connect();
    _db = _client.db(DB_NAME);
    console.log(`✅ MongoDB connected -> ${DB_NAME}`);
    return _db;
  })();

  try {
    return await _connecting;
  } finally {
    _connecting = null;
  }
}

function db() {
  if (!_db) throw new Error('MongoDB not connected yet. Call connect() first.');
  return _db;
}

async function close() {
  if (_client) await _client.close();
  _client = null;
  _db = null;
}

// -------------------------------------------------------------
// Password hashing (scrypt)
// -------------------------------------------------------------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hash] = parts;
  const candidate = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(candidate, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// -------------------------------------------------------------
// Products (tenant-scoped: every product belongs to a store)
// -------------------------------------------------------------
function productFilter(storeId) {
  const sid = storeId || OWNER_DEFAULT;
  if (sid === 'owner') {
    // Owner sees everything that has no explicit tenant + their own.
    return { $or: [{ storeId: sid }, { storeId: { $exists: false } }] };
  }
  return { storeId: sid };
}
const OWNER_DEFAULT = 'owner';

async function getProducts(storeId) {
  if (!_db) {
    try {
      const p = path.join(__dirname, 'data.json');
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {}
    return [];
  }
  const col = db().collection('products');
  const sid = storeId || OWNER_DEFAULT;
  const filter = productFilter(sid);
  // sort_order = the explicit position the admin set in "Quick Product Reorder".
  // _id:-1 only breaks ties (and orders products that pre-date sort_order).
  let list = await col.find(filter).sort({ sort_order: 1, _id: -1 }).toArray();

  // If this is a client store and has 0 products, auto-clone the master catalog from owner!
  if (sid !== 'owner' && list.length === 0) {
    const masterProducts = await col.find(productFilter('owner')).sort({ sort_order: 1, _id: -1 }).toArray();
    if (masterProducts.length > 0) {
      const cloned = masterProducts.map((p, i) => {
        const copy = { ...p };
        delete copy._id;
        copy.storeId = sid;
        copy.sort_order = i;
        return copy;
      });
      try {
        await col.insertMany(cloned);
        list = await col.find(filter).sort({ sort_order: 1, _id: -1 }).toArray();
      } catch (e) {
        console.warn('Auto-cloning master products for client store skipped:', e.message);
      }
    }
  }

  // Lazy migration: give every product a real position. Products without one
  // sort first (missing < numbers), which keeps "newest product on top".
  if (list.some(p => p.sort_order == null)) {
    try {
      const ops = list.map((p, i) => ({
        updateOne: { filter: { _id: p._id }, update: { $set: { sort_order: i } } }
      }));
      await col.bulkWrite(ops, { ordered: false });
    } catch (e) {
      // Non-fatal: we can still serve the correct order without persisting it.
      console.warn('sort_order migration skipped:', e.message);
    }
    return { products: list.map((p, i) => ({ ...p, sort_order: i })) };
  }

  return { products: list };
}

async function saveProducts(data, storeId) {
  const products = ((data && data.products) || []).map((p, i) => ({ ...p, sort_order: i }));
  const col = db().collection('products');
  // Replace only this tenant's products; other stores stay untouched.
  await col.deleteMany(productFilter(storeId));
  if (products.length) {
    const sid = storeId || OWNER_DEFAULT;
    await col.insertMany(products.map(p => ({ ...p, storeId: p.storeId || sid })));
  }
  return true;
}

async function findProduct(id) {
  if (!id) return null;
  const strId = String(id).toLowerCase();
  return await db().collection('products').findOne({ id: strId });
}

async function upsertProduct(product) {
  if (!product || !product.id) throw new Error('product.id required');
  await db().collection('products').updateOne(
    { id: String(product.id).toLowerCase() },
    { $set: product },
    { upsert: true }
  );
  return product;
}

async function replaceProduct(id, updates) {
  const result = await db().collection('products').updateOne(
    { id: String(id).toLowerCase() },
    { $set: updates }
  );
  return result;
}

async function deleteProduct(id) {
  return await db().collection('products').deleteOne({ id: String(id).toLowerCase() });
}

// -------------------------------------------------------------
// Admin config (categories, banners, cloudinary, groq, secrets)
// -------------------------------------------------------------
const DEFAULT_CONFIG = {
  adminPassword: 'Sumi@1998',
  jwtSecret: 'flipkart_admin_session_token_2026_xyz',
  groqApiKey: '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',
  groqModel: 'openai/gpt-oss-120b',
  cloudinary: {
    cloudName: 'sricov3c',
    uploadPreset: 'flipon',
    apiKey: '351953765475734',
    apiSecret: 'TqZ3PqbweZPFG1JdVYWgILNW_1g'
  },
  categories: [],
  banners: [],
  siteMode: 'flipkart'
};

async function getConfig() {
  if (_db) {
    try {
      const doc = await db().collection('config').findOne({ _id: 'admin' });
      if (doc) return doc;
      const seeded = { _id: 'admin', ...DEFAULT_CONFIG };
      await db().collection('config').insertOne(seeded);
      return seeded;
    } catch (e) {}
  }
  try {
    const p = path.join(__dirname, 'admin_config.json');
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {}
  return DEFAULT_CONFIG;
}

async function saveConfig(cfg) {
  const toSave = { ...cfg, _id: 'admin' };
  await db().collection('config').replaceOne({ _id: 'admin' }, toSave, { upsert: true });
  return toSave;
}

// -------------------------------------------------------------
// Payment / UPI info (per store)
// -------------------------------------------------------------
const DEFAULT_PAYMENT = { name: 'paytm.s251hc1@pty', email: 'Flipkart Orders' };

async function getPaymentInfo(storeId) {
  const key = storeId || 'owner';
  const doc = await db().collection('payment_info').findOne({ _id: key });
  if (doc) return doc;
  const seeded = {
    _id: key,
    storeId: key,
    name: key === 'owner' ? DEFAULT_PAYMENT.name : '',
    email: DEFAULT_PAYMENT.email
  };
  await db().collection('payment_info').insertOne(seeded);
  return seeded;
}

async function savePaymentInfo(info, storeId) {
  const key = storeId || (info && info.storeId) || 'owner';
  const toSave = { ...info, _id: key, storeId: key };
  await db().collection('payment_info').replaceOne({ _id: key }, toSave, { upsert: true });
  return toSave;
}

// -------------------------------------------------------------
// Site Mode / Domain Cloak (Flipkart vs Safe AI Tech Website)
// -------------------------------------------------------------
async function getSiteMode(storeId) {
  const sid = storeId || 'owner';
  if (sid === 'owner') {
    const cfg = await getConfig();
    return cfg.siteMode === 'ai' ? 'ai' : 'flipkart';
  }
  const store = await getStore(sid);
  return (store && store.siteMode === 'ai') ? 'ai' : 'flipkart';
}

async function setSiteMode(storeId, mode) {
  const targetMode = mode === 'ai' ? 'ai' : 'flipkart';
  const sid = storeId || 'owner';
  if (sid === 'owner') {
    const cfg = await getConfig();
    cfg.siteMode = targetMode;
    await saveConfig(cfg);
    await db().collection('stores').updateOne(
      { slug: 'owner' },
      { $set: { siteMode: targetMode, updatedAt: new Date() } },
      { upsert: true }
    );
    return targetMode;
  }
  await db().collection('stores').updateOne(
    { slug: slugify(sid) },
    { $set: { siteMode: targetMode, updatedAt: new Date() } },
    { upsert: true }
  );
  return targetMode;
}

// -------------------------------------------------------------
// Mobile Only & Anti-DevTools Shield (Block PC & Instant Google Redirect)
// -------------------------------------------------------------
async function getMobileShield(storeId) {
  const sid = storeId || 'owner';
  if (sid === 'owner') {
    const cfg = await getConfig();
    return !!cfg.mobileOnlyMode;
  }
  const store = await getStore(sid);
  return (store && !!store.mobileOnlyMode);
}

async function setMobileShield(storeId, enabled) {
  const isEnabled = Boolean(enabled);
  const sid = storeId || 'owner';
  if (sid === 'owner') {
    const cfg = await getConfig();
    cfg.mobileOnlyMode = isEnabled;
    await saveConfig(cfg);
    await db().collection('stores').updateOne(
      { slug: 'owner' },
      { $set: { mobileOnlyMode: isEnabled, updatedAt: new Date() } },
      { upsert: true }
    );
    return isEnabled;
  }
  await db().collection('stores').updateOne(
    { slug: slugify(sid) },
    { $set: { mobileOnlyMode: isEnabled, updatedAt: new Date() } },
    { upsert: true }
  );
  return isEnabled;
}

// -------------------------------------------------------------
// Store payment settings  (Paytm Merchant  vs  MobiKwik Merchant)
// One document per store so an owner's UPI never leaks to a client.
//
// NOTE: tr / mc / mbkmc / merchantId are NON-EDITABLE system values.
// They live here in the database (not in the admin UI), exactly as
// specified in the Payment Gateways reference guide.
// -------------------------------------------------------------
const PAYMENT_MODES = ['merchant', 'mobikwik_merchant'];

function defaultPaymentSettings() {
  return {
    activeMode: 'merchant',
    merchant: {
      enabled: false,
      upiId: '',
      payeeName: 'Flipkart Store',
      mc: '5411',
      merchantId: '',
      phonepeNative: true,
      paytmCashWallet: true,
      gpayDirect: true
    },
    mobikwik_merchant: {
      enabled: false,
      upiId: '',
      payeeName: 'Flipkart Online Shopping',
      mbkmc: '8715162375',
      tr: '8715162375',
      mc: '7531'
    }
  };
}

async function getPaymentSettings(storeId) {
  const key = storeId || 'owner';
  const doc = await db().collection('store_payment_settings').findOne({ _id: key });
  const def = defaultPaymentSettings();
  if (doc) {
    // Merge so newly added system fields are always present.
    return {
      ...def,
      ...doc,
      _id: key,
      storeId: key,
      merchant: { ...def.merchant, ...(doc.merchant || {}) },
      mobikwik_merchant: { ...def.mobikwik_merchant, ...(doc.mobikwik_merchant || {}) }
    };
  }

  // New store / client: initialize clean, independent payment settings
  // Owner starts with default UPI; Clients start with completely BLANK UPI so no owner leak!
  const seeded = {
    _id: key,
    storeId: key,
    ...def,
    merchant: {
      ...def.merchant,
      upiId: key === 'owner' ? (process.env.DEFAULT_UPI || 'paytm.s251hc1@pty') : ''
    },
    mobikwik_merchant: {
      ...def.mobikwik_merchant,
      upiId: ''
    }
  };
  await db().collection('store_payment_settings').insertOne(seeded);
  return seeded;
}

// Only the fields the admin panel is allowed to change: mode + UPI ids.
async function savePaymentSettings(storeId, patch) {
  const key = storeId || 'owner';
  const current = await getPaymentSettings(key);
  const targetActiveMode = PAYMENT_MODES.includes(patch.activeMode)
    ? patch.activeMode
    : current.activeMode;

  const next = {
    _id: key,
    storeId: key,
    activeMode: targetActiveMode,
    merchant: {
      ...current.merchant,
      enabled: targetActiveMode === 'merchant',
      upiId: patch.merchantUpiId !== undefined
        ? String(patch.merchantUpiId).trim()
        : current.merchant.upiId,
      payeeName: patch.payeeName !== undefined
        ? String(patch.payeeName).trim() || 'Flipkart Store'
        : current.merchant.payeeName,
      // system values never overwritten from the UI
      mc: current.merchant.mc,
      merchantId: current.merchant.merchantId
    },
    mobikwik_merchant: {
      ...current.mobikwik_merchant,
      enabled: targetActiveMode === 'mobikwik_merchant',
      upiId: patch.mobikwikUpiId !== undefined
        ? String(patch.mobikwikUpiId).trim()
        : current.mobikwik_merchant.upiId,
      payeeName: patch.payeeName !== undefined
        ? String(patch.payeeName).trim() || 'Flipkart Store'
        : current.mobikwik_merchant.payeeName,
      // system values never overwritten from the UI
      mbkmc: current.mobikwik_merchant.mbkmc,
      tr: current.mobikwik_merchant.tr,
      mc: current.mobikwik_merchant.mc
    }
  };
  await db().collection('store_payment_settings').replaceOne({ _id: key }, next, { upsert: true });
  return next;
}

// -------------------------------------------------------------
// Sessions (server-side, no localStorage needed)
// -------------------------------------------------------------
async function createSession(token, payload, ttlMs) {
  await db().collection('sessions').insertOne({
    token,
    data: payload || {},
    expiresAt: new Date(Date.now() + (ttlMs || 24 * 60 * 60 * 1000))
  });
  await db().collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}

async function getSession(token) {
  if (!token) return null;
  const doc = await db().collection('sessions').findOne({ token });
  if (!doc) return null;
  if (doc.expiresAt && doc.expiresAt.getTime() < Date.now()) {
    await db().collection('sessions').deleteOne({ token });
    return null;
  }
  return doc;
}

async function deleteSession(token) {
  await db().collection('sessions').deleteOne({ token });
}

// -------------------------------------------------------------
// Client-side state (replaces browser localStorage)
// Stores small JSON blobs (address, selected variant, cart draft)
// keyed by visitor + name, so nothing lives in the browser.
// -------------------------------------------------------------
async function getState(visitorId, name) {
  if (!visitorId || !name) return null;
  const doc = await db().collection('client_state').findOne({ visitorId: String(visitorId), name: String(name) });
  return doc ? doc.value : null;
}

async function setState(visitorId, name, value, ttlMs) {
  if (!visitorId || !name) throw new Error('visitorId and name are required');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (ttlMs || 30 * 24 * 60 * 60 * 1000));
  await db().collection('client_state').updateOne(
    { visitorId: String(visitorId), name: String(name) },
    { $set: { visitorId: String(visitorId), name: String(name), value, updatedAt: now, expiresAt } },
    { upsert: true }
  );
  await db().collection('client_state').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  return true;
}

async function clearState(visitorId, name) {
  if (!visitorId) return false;
  const q = { visitorId: String(visitorId) };
  if (name) q.name = String(name);
  const r = await db().collection('client_state').deleteMany(q);
  return r.deletedCount > 0;
}

// -------------------------------------------------------------
// Users & roles  (owner | super_admin | client)
// -------------------------------------------------------------
const ROLES = ['owner', 'super_admin', 'client'];

async function ensureUserIndexes() {
  await db().collection('users').createIndex({ email: 1 }, { unique: true, sparse: true });
  await db().collection('users').createIndex({ storeSlug: 1 }, { unique: true, sparse: true });
}

async function findUserByEmail(email) {
  if (!email) return null;
  return await db().collection('users').findOne({ email: String(email).trim().toLowerCase() });
}

async function findUserByStore(storeSlug) {
  if (!storeSlug) return null;
  return await db().collection('users').findOne({ storeSlug: String(storeSlug).trim().toLowerCase() });
}

async function findUserByIdentifier(identifier) {
  if (!identifier) return null;
  const idStr = String(identifier).trim().toLowerCase();
  return await db().collection('users').findOne({
    $or: [
      { email: idStr },
      { storeSlug: idStr },
      { mobile: idStr }
    ]
  });
}

async function findUserById(id) {
  if (!id) return null;
  let _id;
  try { _id = new ObjectId(String(id)); } catch (e) { return null; }
  return await db().collection('users').findOne({ _id });
}

async function createUser(user) {
  await ensureUserIndexes();
  const now = new Date();
  const doc = {
    role: ROLES.includes(user.role) ? user.role : 'client',
    fullName: (user.fullName || '').trim(),
    mobile: (user.mobile || '').trim(),
    storeName: (user.storeName || '').trim(),
    storeSlug: slugify(user.storeSlug || user.storeName || user.email || ''),
    email: (user.email || '').trim().toLowerCase(),
    passwordHash: user.passwordHash || hashPassword(user.password || ''),
    status: user.status || 'active',
    createdAt: now,
    updatedAt: now
  };
  if (!doc.email) throw new Error('Email is required');
  if (!doc.storeSlug) doc.storeSlug = slugify(doc.email.split('@')[0]);

  const res = await db().collection('users').insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

async function listUsers(role) {
  const q = role && ROLES.includes(role) ? { role } : {};
  return await db().collection('users').find(q).sort({ createdAt: -1 }).toArray();
}

function slugify(v) {
  return String(v || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

// -------------------------------------------------------------
// Stores (one per client; owner store is 'owner')
// -------------------------------------------------------------
async function ensureStoreIndexes() {
  await db().collection('stores').createIndex({ slug: 1 }, { unique: true, sparse: true });
  await db().collection('stores').createIndex({ ownerId: 1 });
}

async function getStore(slug) {
  if (!slug) return null;
  return await db().collection('stores').findOne({ slug: slug.toLowerCase() });
}

async function getStoreByDomain(domain) {
  if (!domain) return null;
  return await db().collection('stores').findOne({ domain: String(domain).toLowerCase().trim() });
}

async function listStores() {
  return await db().collection('stores').find({}).sort({ createdAt: -1 }).toArray();
}

async function createStore(store) {
  await ensureStoreIndexes();
  const doc = {
    slug: slugify(store.slug || store.storeName),
    storeName: store.storeName || '',
    ownerId: store.ownerId || null,
    ownerEmail: (store.ownerEmail || '').toLowerCase(),
    upiId: store.upiId || '',
    paymentUrl: store.paymentUrl || '',
    domain: store.domain || '',
    siteMode: store.siteMode || 'flipkart',
    active: store.active !== false,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  await db().collection('stores').updateOne(
    { slug: doc.slug },
    { $set: doc },
    { upsert: true }
  );
  return doc;
}

async function updateStore(slug, updates) {
  const s = slugify(slug);
  updates.updatedAt = new Date();
  await db().collection('stores').updateOne({ slug: s }, { $set: updates }, { upsert: true });
  return await getStore(s);
}

// -------------------------------------------------------------
// Licenses (rent keys: 7 days / 1 month / custom)
// -------------------------------------------------------------
async function ensureLicenseIndexes() {
  await db().collection('licenses').createIndex({ key: 1 }, { unique: true, sparse: true });
  await db().collection('licenses').createIndex({ storeSlug: 1 });
}

function generateLicenseKey() {
  const part = () => crypto.randomBytes(4).toString('hex').toUpperCase();
  return `LIC-${part()}-${part()}-${part()}`;
}

async function createLicense(license) {
  await ensureLicenseIndexes();
  const now = new Date();
  const durationDays = Number(license.durationDays) || 7;
  const startsAt = license.startsAt ? new Date(license.startsAt) : now;
  const expiresAt = new Date(startsAt.getTime() + durationDays * 24 * 60 * 60 * 1000);
  const doc = {
    key: license.key || generateLicenseKey(),
    storeSlug: slugify(license.storeSlug),
    storeName: license.storeName || '',
    plan: license.plan || `${durationDays}d`,
    durationDays,
    amount: Number(license.amount) || 0,
    status: license.status || 'active',
    startsAt,
    expiresAt,
    paymentRequestId: license.paymentRequestId || null,
    createdBy: license.createdBy || null,
    createdAt: now,
    updatedAt: now
  };
  const res = await db().collection('licenses').insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

async function listLicenses(storeSlug) {
  const q = storeSlug ? { storeSlug: slugify(storeSlug) } : {};
  return await db().collection('licenses').find(q).sort({ createdAt: -1 }).toArray();
}

async function findLicenseByKey(key) {
  if (!key) return null;
  return await db().collection('licenses').findOne({ key: String(key).trim().toUpperCase() });
}

// Find the currently valid (non-expired, active) license for a store.
async function getActiveLicense(storeSlug) {
  const slug = slugify(storeSlug);
  const now = new Date();
  return await db().collection('licenses')
    .findOne({ storeSlug: slug, status: 'active', expiresAt: { $gt: now } }, { sort: { expiresAt: -1 } });
}

// Mark expired licenses. Called on demand; no cron needed.
async function expireStaleLicenses() {
  const res = await db().collection('licenses').updateMany(
    { status: 'active', expiresAt: { $lte: new Date() } },
    { $set: { status: 'expired', updatedAt: new Date() } }
  );
  return res.modifiedCount;
}

// -------------------------------------------------------------
// Payment / UTR requests (client pays -> super admin reviews)
// -------------------------------------------------------------
async function ensurePayIndexes() {
  await db().collection('payment_requests').createIndex({ utr: 1 });
  await db().collection('payment_requests').createIndex({ storeSlug: 1 });
}

async function createPaymentRequest(reqDoc) {
  await ensurePayIndexes();
  const doc = {
    storeSlug: slugify(reqDoc.storeSlug),
    storeName: reqDoc.storeName || '',
    clientEmail: (reqDoc.clientEmail || '').toLowerCase(),
    plan: reqDoc.plan || '7d',
    durationDays: Number(reqDoc.durationDays) || 7,
    amount: Number(reqDoc.amount) || 0,
    utr: String(reqDoc.utr || '').trim(),
    senderUpi: reqDoc.senderUpi || '',
    note: reqDoc.note || '',
    status: 'pending',
    receiptImage: reqDoc.receiptImage || '',
    createdAt: new Date(),
    reviewedAt: null,
    reviewedBy: null
  };
  if (!doc.utr || doc.utr.length !== 12) {
    throw new Error('UTR must be exactly 12 digits');
  }
  const res = await db().collection('payment_requests').insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

async function listPaymentRequests(status) {
  const q = status ? { status } : {};
  return await db().collection('payment_requests').find(q).sort({ createdAt: -1 }).toArray();
}

async function findPaymentRequest(id) {
  let _id;
  try { _id = new ObjectId(String(id)); } catch (e) { return null; }
  return await db().collection('payment_requests').findOne({ _id });
}

async function setPaymentRequestStatus(id, status, reviewer, licenseKey) {
  let _id;
  try { _id = new ObjectId(String(id)); } catch (e) { return null; }
  const set = { status, reviewedAt: new Date(), reviewedBy: reviewer || null, updatedAt: new Date() };
  if (licenseKey) set.licenseKey = licenseKey;
  const r = await db().collection('payment_requests').updateOne({ _id }, { $set: set });
  return r.modifiedCount === 1;
}

// -------------------------------------------------------------
// Real-Time Visitor & Bot Tracker (Push.House Ad Traffic & Clicks)
// -------------------------------------------------------------
async function ensureVisitorIndexes() {
  try {
    await db().collection('visitor_logs').createIndex({ storeId: 1, createdAt: -1 });
    await db().collection('visitor_logs').createIndex({ storeId: 1, isBot: 1 });
    await db().collection('visitor_logs').createIndex({ ip: 1, createdAt: -1 });
    await db().collection('visitor_logs').createIndex({ click_id: 1 }, { sparse: true });
  } catch(e) {
    console.warn('Visitor index warning:', e.message);
  }
}

async function recordVisitorLog(doc) {
  const item = {
    storeId: doc.storeId || 'owner',
    ip: doc.ip || '127.0.0.1',
    isBot: !!doc.isBot,
    userType: doc.isBot ? 'bot' : 'human',
    detectionReason: doc.detectionReason || (doc.isBot ? 'Bot Detected' : 'Real Human Visitor'),
    botScore: typeof doc.botScore === 'number' ? doc.botScore : (doc.isBot ? 90 : 10),
    url: doc.url || '/',
    path: doc.path || '/',
    device: doc.device || 'Desktop',
    browser: doc.browser || 'Unknown',
    os: doc.os || 'Unknown',
    location: doc.location || 'Unknown',
    country: doc.country || '',
    city: doc.city || '',
    // Push.House Ad Network Macros
    click_id: doc.click_id || '',
    site: doc.site || '',
    camp: doc.camp || '',
    pdpid: doc.pdpid || '',
    price: doc.price || '',
    feed: doc.feed || '',
    format: doc.format || '',
    lang: doc.lang || '',
    traffic_segment: doc.traffic_segment || '',
    subscription_age: doc.subscription_age || '',
    userAgent: doc.userAgent || '',
    referer: doc.referer || '',
    telemetry: doc.telemetry || null,
    createdAt: doc.createdAt || new Date(),
    updatedAt: new Date()
  };

  const res = await db().collection('visitor_logs').insertOne(item);
  return { ...item, _id: res.insertedId };
}

async function updateVisitorTelemetry(logId, telemetryData) {
  if (!logId) return null;
  const isBot = !!telemetryData.isBot;
  const update = {
    $set: {
      telemetry: telemetryData,
      isBot,
      userType: isBot ? 'bot' : 'human',
      detectionReason: telemetryData.detectionReason || (isBot ? 'Bot (Automated WebDriver Detected)' : 'Real Human (Verified DOM Interaction)'),
      botScore: isBot ? 95 : 5,
      updatedAt: new Date()
    }
  };
  try {
    let q = null;
    if (typeof logId === 'string' && ObjectId.isValid(logId)) {
      q = { _id: new ObjectId(logId) };
    } else {
      q = { click_id: logId };
    }
    return await db().collection('visitor_logs').findOneAndUpdate(q, update, { returnDocument: 'after' });
  } catch(e) {
    return null;
  }
}

async function getVisitorLogs(storeId, filter = 'all', limit = 100) {
  const targetStore = storeId || 'owner';
  const query = { storeId: targetStore };
  if (filter === 'real' || filter === 'human') {
    query.isBot = false;
  } else if (filter === 'bot') {
    query.isBot = true;
  }

  return await db().collection('visitor_logs')
    .find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(limit, 300))
    .toArray();
}

async function getVisitorStats(storeId) {
  const targetStore = storeId || 'owner';
  const total = await db().collection('visitor_logs').countDocuments({ storeId: targetStore });
  const realCount = await db().collection('visitor_logs').countDocuments({ storeId: targetStore, isBot: false });
  const botCount = await db().collection('visitor_logs').countDocuments({ storeId: targetStore, isBot: true });
  
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const activeCount = await db().collection('visitor_logs').countDocuments({
    storeId: targetStore,
    createdAt: { $gte: fiveMinAgo }
  });

  return {
    total,
    realCount,
    botCount,
    activeCount: Math.max(activeCount, 0),
    botRatio: total > 0 ? Math.round((botCount / total) * 100) : 0
  };
}

async function clearVisitorLogs(storeId) {
  const targetStore = storeId || 'owner';
  return await db().collection('visitor_logs').deleteMany({ storeId: targetStore });
}

module.exports = {
  connect,
  db,
  close,
  ObjectId,
  ROLES,
  slugify,
  hashPassword,
  verifyPassword,
  getProducts,
  saveProducts,
  findProduct,
  upsertProduct,
  replaceProduct,
  deleteProduct,
  getConfig,
  saveConfig,
  getPaymentInfo,
  savePaymentInfo,
  // payment gateway settings (Paytm / MobiKwik)
  PAYMENT_MODES,
  defaultPaymentSettings,
  getPaymentSettings,
  savePaymentSettings,
  createSession,
  getSession,
  deleteSession,
  // client state (localStorage replacement)
  getState,
  setState,
  clearState,
  // users
  ensureUserIndexes,
  findUserByEmail,
  findUserByStore,
  findUserByIdentifier,
  findUserById,
  createUser,
  listUsers,
  // stores
  ensureStoreIndexes,
  getStore,
  getStoreByDomain,
  listStores,
  createStore,
  updateStore,
  // licenses
  ensureLicenseIndexes,
  generateLicenseKey,
  createLicense,
  listLicenses,
  findLicenseByKey,
  getActiveLicense,
  expireStaleLicenses,
  // payments
  createPaymentRequest,
  listPaymentRequests,
  findPaymentRequest,
  setPaymentRequestStatus,
  // site mode / domain cloaking
  getSiteMode,
  setSiteMode,
  // mobile only & anti-devtools shield
  getMobileShield,
  setMobileShield,
  // real-time visitor & bot tracker
  ensureVisitorIndexes,
  recordVisitorLog,
  updateVisitorTelemetry,
  getVisitorLogs,
  getVisitorStats,
  clearVisitorLogs
};

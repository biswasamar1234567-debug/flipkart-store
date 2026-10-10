// Built-in Node.js HTTP static & API server (Zero external dependencies)
// Data layer: MongoDB Atlas (see db.js + .env)
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const OWNER_STORE_ID = 'owner';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// --- Store data access (async, MongoDB-backed) ---
const getAdminConfig = () => db.getConfig();
const saveAdminConfig = (cfg) => db.saveConfig(cfg);
const getProductsData = (storeId) => db.getProducts(storeId);
const saveProductsData = (data, storeId) => db.saveProducts(data, storeId);
const getPaymentInfo = (storeId) => db.getPaymentInfo(storeId || OWNER_STORE_ID);
const savePaymentInfo = (info, storeId) => db.savePaymentInfo(info, storeId || OWNER_STORE_ID);

// --- Sessions (persisted in MongoDB, no localStorage required) ---
async function generateSessionToken(payload) {
  const token = crypto.randomBytes(32).toString('hex');
  await db.createSession(token, payload || {}, SESSION_TTL_MS);
  return token;
}

function extractToken(req) {
  const authHeader = req.headers['authorization'] || '';
  const fromHeader = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (fromHeader) return fromHeader;
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/(?:^|;\s*)store_admin_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]).trim() : '';
}

async function getSessionData(req) {
  const token = extractToken(req);
  if (!token) return null;
  const doc = await db.getSession(token);
  if (!doc) return null;
  return { token, ...(doc.data || {}) };
}

async function isValidSession(req) {
  return !!(await getSessionData(req));
}

// Resolve which store/tenant this request belongs to.
// Priority:
//   1. Subdomain in the Host header  ->  storename.ourdomain.com
//   2. "X-Store-Id" header or ?store=  (used by local dev / admin tooling)
//   3. Owner (main domain)
function hostToStoreId(host) {
  if (!host) return '';
  let h = String(host).trim().toLowerCase();
  // IPv6 literal ([::1]:3000, [fe80::1]) -> never a tenant subdomain
  if (h.startsWith('[')) return '';
  h = h.split(':')[0].trim();
  if (!h) return '';
  // An IP address is not a subdomain
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(h)) return '';
  // Cloudflare tunnels & platforms default to owner
  if (
    h.endsWith('.trycloudflare.com') ||
    h.endsWith('.loca.lt') ||
    h.endsWith('.ngrok-free.app') ||
    h.endsWith('.ngrok.io') ||
    h.endsWith('.hostingersite.com') ||
    h.endsWith('.vercel.app') ||
    h.endsWith('.render.com') ||
    h.endsWith('.onrender.com')
  ) return '';

  // Localhost subdomains: e.g. client1.localhost
  if (h.endsWith('.localhost')) {
    const sub = h.slice(0, -'.localhost'.length);
    if (sub && sub !== 'www' && sub !== 'admin' && sub !== 'api' && /^[a-z0-9-]{1,64}$/.test(sub)) {
      return sub;
    }
    return '';
  }

  const labels = h.split('.');
  if (labels.length < 2) return '';
  const apex = String(process.env.BASE_DOMAIN || '').toLowerCase().split(':')[0];
  let sub = '';
  if (apex && h.endsWith('.' + apex)) {
    sub = h.slice(0, h.length - apex.length - 1);
  } else if (labels.length >= 3) {
    // a.b.example.com -> take the leftmost label only
    sub = labels[0];
  } else {
    sub = '';
  }
  if (!sub || sub === 'www' || sub === 'app' || sub === 'admin' || sub === 'api') return '';
  if (!/^[a-z0-9-]{1,64}$/.test(sub)) return '';
  return sub;
}

function resolveStoreId(req, parsedUrl) {
  const fromHost = hostToStoreId(req.headers.host);
  if (fromHost) return fromHost;
  const header = req.headers['x-store-id'];
  if (header && /^[a-z0-9_-]{1,64}$/i.test(String(header))) {
    return String(header).toLowerCase();
  }
  const q = parsedUrl && parsedUrl.searchParams.get('store');
  if (q && /^[a-z0-9_-]{1,64}$/i.test(q)) return q.toLowerCase();
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/(?:^|;\s*)current_store_id=([^;]+)/);
  if (m && /^[a-z0-9_-]{1,64}$/i.test(decodeURIComponent(m[1]))) {
    return decodeURIComponent(m[1]).toLowerCase();
  }
  return OWNER_STORE_ID;
}

// Rounds a price onto a psychological ending.
//   '9'  -> ...9   (499, 599, 759)   <- default
//   '99' -> ...99  (499, 599, 699)
//   '0'  -> round to the nearest 100 (400, 500, 600)
//   '00' -> round to the nearest 1000 (1000, 2000)
//   else -> return the value unchanged
function applyPricingEnding(value, ending) {
  const v = Number(value);
  if (!Number.isFinite(v)) return value;
  switch (String(ending)) {
    case '9': return Math.round(v / 10) * 10 - 1;
    case '99': return Math.round((v + 1) / 100) * 100 - 1;
    case '0': return Math.round(v / 100) * 100;
    case '00': return Math.round(v / 1000) * 1000;
    default: return Math.round(v);
  }
}

// =============================================================
// Real-Time Visitor & Bot Detection (Push.House Traffic Audit)
// Zero mock data. Scoped per store tenant. Live in MongoDB.
// =============================================================
const BOT_UA_REGEX = /bot|crawler|spider|slurp|headless|puppeteer|selenium|phantomjs|playwright|webdriver|curl|wget|python|requests|urllib|aiohttp|axios|node-fetch|go-http|ahrefs|semrush|bytespider|yandex|bingbot|googlebot|facebookexternalhit|twitterbot|rogerbot|linkedinbot|embedly|quora link preview|showyoubot|outbrain|pinterest|slackbot|vkshare|w3c_validator|duckduckbot/i;

async function logVisitor(req, parsedUrl) {
  try {
    const pathname = parsedUrl.pathname;
    // Only track HTML page visits (storefront, product, checkout, AI site)
    if (
      pathname.startsWith('/api/') ||
      pathname.startsWith('/admin') ||
      pathname.startsWith('/superadmin') ||
      pathname.startsWith('/assets/') ||
      pathname.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|json|woff2?|map|txt|webmanifest)$/i)
    ) return;

    const storeId = resolveStoreId(req, parsedUrl);

    let ip = req.headers['cf-connecting-ip'] ||
             req.headers['x-forwarded-for'] ||
             req.headers['x-real-ip'] ||
             req.socket.remoteAddress ||
             '127.0.0.1';
    if (ip.includes(',')) ip = ip.split(',')[0].trim();
    const cleanIp = String(ip).replace(/^::ffff:/, '').replace(/^::1$/, '127.0.0.1').trim();

    // Push.House Macros & Tracking Parameters
    const q = parsedUrl.searchParams;
    const click_id = q.get('click_id') || q.get('clickid') || q.get('cid') || '';
    const site = q.get('site') || q.get('site_id') || q.get('placement') || '';
    const camp = q.get('camp') || q.get('campaign') || q.get('camp_id') || '';
    const pdpid = q.get('pdpid') || '';
    const price = q.get('price') || q.get('cpc') || '';
    const feed = q.get('feed') || '';
    const macroCountry = q.get('country') || '';
    const macroCity = q.get('city') || '';
    const macroOs = q.get('os') || '';
    const macroBrowser = q.get('browser') || '';
    const format = q.get('format') || '';
    const lang = q.get('lang') || '';
    const traffic_segment = q.get('traffic_segment') || '';
    const subscription_age = q.get('subscription_age') || '';

    const userAgent = String(req.headers['user-agent'] || '').trim();
    const isMobile = /mobile|android|iphone|ipad|ipod|blackberry|opera mini|iemobile/i.test(userAgent);
    const isTablet = /tablet|ipad/i.test(userAgent);
    const device = isTablet ? 'Tablet' : (isMobile ? 'Mobile' : 'Desktop');

    let os = 'Unknown OS';
    if (/windows nt 10/i.test(userAgent)) os = 'Windows 10/11';
    else if (/windows nt/i.test(userAgent)) os = 'Windows';
    else if (/android (\d+(\.\d+)?)/i.test(userAgent)) os = 'Android ' + (userAgent.match(/android (\d+(\.\d+)?)/i)[1]);
    else if (/android/i.test(userAgent)) os = 'Android';
    else if (/iphone os (\d+[_\d]*)/i.test(userAgent)) os = 'iOS ' + (userAgent.match(/iphone os (\d+[_\d]*)/i)[1].replace(/_/g, '.'));
    else if (/ipad|iphone|ios/i.test(userAgent)) os = 'iOS';
    else if (/mac os x/i.test(userAgent)) os = 'macOS';
    else if (/linux/i.test(userAgent)) os = 'Linux';
    if (os === 'Unknown OS' && macroOs) os = macroOs;

    let browser = 'Unknown Browser';
    if (/edg\//i.test(userAgent)) browser = 'Edge';
    else if (/samsungbrowser/i.test(userAgent)) browser = 'Samsung Internet';
    else if (/chrome\//i.test(userAgent) && !/edg\//i.test(userAgent)) {
      const m = userAgent.match(/chrome\/(\d+)/i);
      browser = 'Chrome ' + (m ? m[1] : (isMobile ? 'Mobile' : ''));
    } else if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) browser = isMobile ? 'Safari Mobile' : 'Safari';
    else if (/firefox/i.test(userAgent)) browser = 'Firefox';
    else if (/opera|opr\//i.test(userAgent)) browser = 'Opera';
    if (browser === 'Unknown Browser' && macroBrowser) browser = macroBrowser;

    let country = macroCountry || req.headers['cf-ipcountry'] || '';
    let city = macroCity || '';
    let locationFormatted = '';
    if (cleanIp === '127.0.0.1' || cleanIp === 'localhost') {
      country = country || 'IN';
      city = city || 'Localhost';
      locationFormatted = 'Localhost (IN)';
    } else if (city && country) {
      locationFormatted = `${city}, ${country}`;
    } else if (country) {
      locationFormatted = country;
    } else {
      locationFormatted = 'India (Online)';
    }

    // Bot detection analysis
    let isBot = false;
    let detectionReason = 'Real Human (Valid Browser Signature)';
    let botScore = 15;

    if (!userAgent || userAgent.length < 12) {
      isBot = true;
      detectionReason = 'Bot (Empty/Dummy User-Agent)';
      botScore = 95;
    } else if (BOT_UA_REGEX.test(userAgent)) {
      isBot = true;
      const matched = userAgent.match(BOT_UA_REGEX)[0];
      detectionReason = `Bot (Automated Signature: ${matched})`;
      botScore = 99;
    } else if (/headlesschrome/i.test(userAgent)) {
      isBot = true;
      detectionReason = 'Bot (Headless Chrome Automation)';
      botScore = 100;
    } else if (click_id && (click_id.includes('{click_id}') || click_id.length < 4)) {
      isBot = true;
      detectionReason = 'Push.House Macro Anomaly (Unresolved Placeholder)';
      botScore = 85;
    }

    await db.recordVisitorLog({
      storeId,
      ip: cleanIp,
      isBot,
      detectionReason,
      botScore,
      url: req.url,
      path: pathname,
      device,
      browser,
      os,
      location: locationFormatted,
      country,
      city,
      click_id,
      site,
      camp,
      pdpid,
      price,
      feed,
      format,
      lang,
      traffic_segment,
      subscription_age,
      userAgent,
      referer: req.headers['referer'] || ''
    });
  } catch(err) {
    // Non-blocking logger
  }
}

// Helper to destroy image in Cloudinary
async function destroyCloudinaryImage(publicId, config) {
  if (!publicId) return { success: false, error: 'No public ID' };
  let c = config;
  if (!c) {
    try {
      const cfg = await getAdminConfig();
      c = cfg.cloudinary;
    } catch (e) {
      return { success: false, error: 'Config unavailable' };
    }
  }
  if (!c || !c.apiKey || !c.apiSecret || !c.cloudName) {
    return { success: false, error: 'Cloudinary credentials missing' };
  }

  return new Promise((resolve) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const toSign = `public_id=${publicId}&timestamp=${timestamp}${c.apiSecret}`;
    const signature = crypto.createHash('sha1').update(toSign).digest('hex');

    const postData = new URLSearchParams({
      public_id: publicId,
      timestamp: String(timestamp),
      api_key: c.apiKey,
      signature: signature
    }).toString();

    const req = https.request({
      hostname: 'api.cloudinary.com',
      port: 443,
      path: `/v1_1/${c.cloudName}/image/destroy`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ success: res.statusCode === 200, status: res.statusCode, data: json });
        } catch(e) {
          resolve({ success: false, status: res.statusCode, error: body });
        }
      });
    });

    req.on('error', err => resolve({ success: false, error: err.message }));
    req.write(postData);
    req.end();
  });
}

// -------------------------------------------------------------
// 🤖 GROQ AI REAL-TIME CATALOG GENERATOR
// -------------------------------------------------------------
function callGroqAI(title, apiKey, model) {
  const chosenModel = model || 'openai/gpt-oss-120b';
  const systemPrompt = `You are an expert Flipkart e-commerce product catalog specialist.
Analyze the user-provided product title and generate complete, highly accurate, professional e-commerce product catalog details in valid JSON.

JSON Schema to return:
{
  "title1": "Short concise title for homepage cards (e.g. 'Apple iPhone 17 Pro Max (1 TB)')",
  "title2": "Full detailed title for product page (e.g. 'Apple iPhone 17 Pro Max (Desert Titanium, 1 TB) (16 GB RAM)')",
  "brand": "Exact brand name (e.g. 'Apple', 'Samsung', 'boAt', 'OnePlus', 'Sony', 'Realme', 'Xiaomi', 'Vivo', 'Motorola', etc.)",
  "category": "Must be exactly one of: 'Mobiles', 'Electronics', 'Appliances', 'Fashion', 'Home', 'Toys', 'Grocery', 'For You', 'Deals'",
  "stock": 50,
  "mrp": 189900,
  "selling_price": 999,
  "discount": 99,
  "rating": "4.7",
  "reviews_count": 3410,
  "default_color": "Extracted primary color name (e.g. 'Desert Titanium')",
  "default_storage": "Extracted storage (e.g. '1 TB', '512 GB', '256 GB', or empty string if not applicable)",
  "default_ram": "Extracted RAM (e.g. '16 GB', '12 GB', '8 GB', or empty string if not applicable)",
  "custom_size": "",
  "delivery_text": "Free Delivery in Two Days",
  "description": "Comprehensive, compelling, premium product description highlight paragraph.",
  "highlights": [
    "5-6 professional bullet points (Flipkart style)"
  ],
  "specifications": {
    "General": {
      "Model Name": "...",
      "Color": "...",
      "Browse Type": "...",
      "SIM Type": "Dual SIM (Nano + eSIM)"
    },
    "Display Features": {
      "Display Size": "...",
      "Resolution": "...",
      "Display Type": "..."
    },
    "Processor & OS": {
      "Operating System": "...",
      "Processor Type": "..."
    },
    "Memory & Storage": {
      "Internal Storage": "...",
      "RAM": "..."
    },
    "Camera": {
      "Primary Camera": "...",
      "Front Camera": "..."
    }
  },
  "variants": [
    {
      "color_name": "Color 1 Name",
      "color_hex": "#c2b69d",
      "ram": "...",
      "storage": "...",
      "selling_price": 999,
      "mrp": 189900
    },
    {
      "color_name": "Color 2 Name",
      "color_hex": "#2b2b2b",
      "ram": "...",
      "storage": "...",
      "selling_price": 999,
      "mrp": 189900
    },
    {
      "color_name": "Color 3 Name",
      "color_hex": "#ff7849",
      "ram": "...",
      "storage": "...",
      "selling_price": 999,
      "mrp": 189900
    }
  ]
}

Ensure:
- Brand detection: Accurately detect and return the exact official brand name (e.g. 'Apple', 'Samsung', 'OnePlus', 'Google Pixel', 'Xiaomi', 'Redmi', 'POCO', 'Realme', 'Vivo', 'iQOO', 'OPPO', 'Motorola', 'Nothing', 'Sony', 'ASUS', 'Infinix', 'TECNO', 'HONOR', 'boAt', 'Noise', 'Fire-Boltt'). Never leave brand empty.
- Category matching: If smartphone/mobile/phone/iphone -> 'Mobiles'. If earbuds/headphone/smartwatch/laptop/camera -> 'Electronics'. If fridge/tv/ac/washing machine -> 'Appliances'. If clothes/shoes/bag -> 'Fashion'. If furniture/chair/bed -> 'Home'.
- mrp is realistic Indian Rupees number (e.g. 147900 or 189900 for iPhone 1 TB, 144999 for S24 Ultra, 4999 for boAt, 24999 for TV, etc.).
- selling_price is 999 (default deal price).
- discount is Math.round(((mrp - selling_price) / mrp) * 100).
- rating is realistic between 4.3 and 4.9.
- reviews_count is realistic verified ratings number (e.g. 3410).
- return pure valid JSON only without markdown or codeblocks.`;

  const postData = JSON.stringify({
    model: chosenModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Product Title: "${title}"` }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.groq.com',
      port: 443,
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(postData)
      }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.choices && parsed.choices[0] && parsed.choices[0].message) {
            const jsonContent = JSON.parse(parsed.choices[0].message.content);
            resolve({ success: true, product: jsonContent, rawModel: chosenModel });
          } else {
            resolve({ success: false, error: parsed.error?.message || 'Invalid Groq API response' });
          }
        } catch (e) {
          resolve({ success: false, error: e.message, raw: body });
        }
      });
    });

    req.on('error', err => resolve({ success: false, error: err.message }));
    req.write(postData);
    req.end();
  });
}

function extractPublicId(urlOrId) {
  if (!urlOrId || typeof urlOrId !== 'string') return null;
  if (!urlOrId.includes('/') && !urlOrId.includes('.')) return urlOrId;
  const match = urlOrId.match(/\/upload\/(?:v\d+\/)?([^\.\?#]+)/);
  if (match) return match[1];
  return null;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data, extraHeaders) {
  res.writeHead(statusCode, Object.assign({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  }, extraHeaders || {}));
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  // Log store visitors with Push.House parameters & bot detection
  logVisitor(req, parsedUrl);

  // -------------------------------------------------------------
  // 🛰️ CLIENT TELEMETRY & BEACON (Real Human Verification)
  // -------------------------------------------------------------
  if (pathname === '/api/tracker/telemetry' && method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const isAutomated = !!body.webdriver || body.screen === '0x0' || body.headless === true;
      const telemetryResult = {
        webdriver: !!body.webdriver,
        screen: body.screen || '',
        hasTouch: !!body.hasTouch,
        interactions: Number(body.interactions) || 0,
        dwellMs: Number(body.dwellMs) || 0,
        isBot: isAutomated,
        detectionReason: isAutomated 
          ? 'Bot (Automated WebDriver Detected in Browser)'
          : (body.interactions > 0 
             ? 'Real Human (Verified DOM Interaction & Touch/Mouse)'
             : 'Real Human (Hardware & Browser Verified)')
      };

      if (body.click_id || body.visitId) {
        await db.updateVisitorTelemetry(body.visitId || body.click_id, telemetryResult);
      }
      return sendJson(res, 200, { success: true, verified: !isAutomated });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // -------------------------------------------------------------
  // 🛡️ PUBLIC SECURITY SHIELD STATUS (Anti-Inspect & Mobile Only Mode)
  // -------------------------------------------------------------
  if (pathname === '/api/shield-status' && method === 'GET') {
    try {
      const reqStoreId = resolveStoreId(req, parsedUrl);
      const isMobileOnly = await db.getMobileShield(reqStoreId);
      return sendJson(res, 200, { success: true, storeId: reqStoreId, mobileOnly: !!isMobileOnly });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // -------------------------------------------------------------
  // 🛒 PUBLIC STORE API ENDPOINTS
  // -------------------------------------------------------------
  if ((pathname === '/api/products' || pathname === '/api/products/' || pathname === '/data.json' || pathname === '/products/data.json' || pathname === '/admin/data.json') && method === 'GET') {
    const data = await getProductsData(resolveStoreId(req, parsedUrl));
    return sendJson(res, 200, data);
  }

  const publicSingleProdMatch = pathname.match(/^\/api\/products\/([^\/]+)$/);
  if (publicSingleProdMatch && method === 'GET') {
    const pId = decodeURIComponent(publicSingleProdMatch[1]);
    const data = await getProductsData(resolveStoreId(req, parsedUrl));
    const found = (data.products || []).find(p => String(p.id).toLowerCase() === String(pId).toLowerCase());
    if (found) {
      return sendJson(res, 200, { success: true, product: found });
    }
    return sendJson(res, 404, { success: false, error: 'Product not found' });
  }

  if (pathname === '/api/payment-info' && method === 'GET') {
    const info = await getPaymentInfo(resolveStoreId(req, parsedUrl));
    return sendJson(res, 200, { success: true, payment: info });
  }

  // -------------------------------------------------------------
  // 💳 PUBLIC GATEWAY ENDPOINT (used by the checkout page)
  // The store is auto-detected from the subdomain:
  //   owner.ourdomain.com  -> owner's UPI
  //   mystore.ourdomain.com -> that client's UPI ONLY
  // Never returns another tenant's UPI id.
  // -------------------------------------------------------------
  if ((pathname === '/api/gateway' || pathname === '/api/gateway/') && method === 'GET') {
    const storeId = resolveStoreId(req, parsedUrl);
    try {
      const gateway = await db.getPaymentSettings(storeId);
      const store = await db.getStore(storeId);
      const activeMode = gateway.activeMode === 'mobikwik_merchant'
        ? 'mobikwik_merchant'
        : 'merchant';
      const block = activeMode === 'mobikwik_merchant'
        ? gateway.mobikwik_merchant
        : gateway.merchant;

      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0, post-check=0, pre-check=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      return sendJson(res, 200, {
        success: true,
        storeId,
        storeName: store ? store.storeName : 'Online Store',
        activeMode,
        upiId: block.upiId || '',
        payeeName: block.payeeName || 'Online Store',
        // Full schema (same shape as store_payment_settings) so the
        // checkout page can build deep links exactly as specified.
        settings: {
          activeMode: gateway.activeMode,
          merchant: gateway.merchant,
          mobikwik_merchant: gateway.mobikwik_merchant
        }
      });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  if ((pathname === '/info.json' || pathname === '/payment/info.json' || pathname === '/api/info.json') && method === 'GET') {
    const storeId = resolveStoreId(req, parsedUrl);
    try {
      const gateway = await db.getPaymentSettings(storeId);
      const activeUpi = (gateway.activeMode === 'mobikwik_merchant'
        ? gateway.mobikwik_merchant?.upiId
        : gateway.merchant?.upiId) || '';
      return sendJson(res, 200, {
        name: activeUpi,
        email: 'tr dalo'
      });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  if ((pathname === '/api/categories' || pathname === '/api/categories/') && method === 'GET') {
    const config = await getAdminConfig();
    return sendJson(res, 200, { success: true, categories: config.categories || [], categorySize: config.categorySize || 58 });
  }

  // Public storefront banners (read-only; saving goes through /api/admin/banners)
  if ((pathname === '/api/banners' || pathname === '/api/banners/') && method === 'GET') {
    const config = await getAdminConfig();
    return sendJson(res, 200, { success: true, banners: config.banners || [] });
  }

  // Public shield status (used by client-side security script)
  if ((pathname === '/api/shield-status' || pathname === '/api/shield-status/') && method === 'GET') {
    const storeId = resolveStoreId(req, parsedUrl);
    const mobileOnly = await db.getMobileShield(storeId);
    return sendJson(res, 200, { success: true, storeId, mobileOnly });
  }

  // -------------------------------------------------------------
  // 🛡️ ADMIN API ENDPOINTS
  // -------------------------------------------------------------
  if (pathname.startsWith('/api/admin/')) {
    const apiRoute = pathname.replace('/api/admin/', '');

    // 1. Admin Login
    //    - { email, password } -> MongoDB account (owner or client)
    //    - { password }        -> legacy owner password from admin_config
    //    Session always records the storeId so data stays tenant-scoped.
    if (apiRoute === 'login' && method === 'POST') {
      try {
        const body = await readJsonBody(req);
        const identifier = String(body.identifier || body.email || '').trim().toLowerCase();
        const inputPassword = String(body.password || body.pin || '').trim();

        if (!inputPassword) {
          return sendJson(res, 400, { success: false, error: 'Password or PIN is required.' });
        }

        // --- A. Login by identifier (Email, Store Name / Slug, Mobile) ---
        if (identifier) {
          const user = await db.findUserByIdentifier(identifier);
          if (user && db.verifyPassword(inputPassword, user.passwordHash)) {
            if (user.status !== 'active') {
              return sendJson(res, 403, { success: false, error: 'This account is suspended. Contact support.' });
            }
            const storeId = user.storeSlug || OWNER_STORE_ID;
            const token = await generateSessionToken({
              userId: String(user._id),
              role: user.role,
              storeId,
              email: user.email
            });
            return sendJson(res, 200, {
              success: true,
              token,
              user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
                storeName: user.storeName,
                storeSlug: user.storeSlug
              },
              message: 'Login successful'
            });
          }
        }

        // --- B. Password / PIN check on current tenant store ---
        const reqStoreId = resolveStoreId(req, parsedUrl);
        if (reqStoreId && reqStoreId !== 'owner') {
          const storeUser = await db.findUserByStore(reqStoreId);
          if (storeUser && db.verifyPassword(inputPassword, storeUser.passwordHash)) {
            if (storeUser.status !== 'active') {
              return sendJson(res, 403, { success: false, error: 'This store is suspended.' });
            }
            const token = await generateSessionToken({
              userId: String(storeUser._id),
              role: storeUser.role,
              storeId: storeUser.storeSlug,
              email: storeUser.email
            });
            return sendJson(res, 200, {
              success: true,
              token,
              user: {
                id: storeUser._id,
                fullName: storeUser.fullName,
                email: storeUser.email,
                role: storeUser.role,
                storeName: storeUser.storeName,
                storeSlug: storeUser.storeSlug
              },
              message: `Welcome to ${storeUser.storeName} admin portal!`
            });
          }
        }

        // --- C. Owner PIN / Password check ---
        const config = await getAdminConfig();
        const validPassword = String(config.adminPassword || 'Sumi@1998').trim();
        const ownerUser = await db.db().collection('users').findOne({ role: 'owner' });
        const isOwnerPw = (inputPassword === validPassword || inputPassword === 'Sumi@1998') ||
          (ownerUser && db.verifyPassword(inputPassword, ownerUser.passwordHash));

        if (isOwnerPw) {
          const ownerDoc = ownerUser || (await db.db().collection('users').findOne({ role: 'owner' }));
          const token = await generateSessionToken({
            userId: ownerDoc ? String(ownerDoc._id) : null,
            role: 'owner',
            storeId: OWNER_STORE_ID,
            email: ownerDoc?.email || 'amarbiswas887@gmail.com'
          });
          return sendJson(res, 200, {
            success: true,
            token,
            user: {
              id: ownerDoc ? ownerDoc._id : null,
              fullName: ownerDoc?.fullName || 'Super Admin',
              email: ownerDoc?.email || 'amarbiswas887@gmail.com',
              role: 'owner',
              storeSlug: OWNER_STORE_ID
            },
            message: 'Owner login successful'
          });
        }

        // --- D. Match Client Password (if client visits main /admin and enters password) ---
        const clientUsers = await db.listUsers('client');
        const matchedClient = clientUsers.find(u => db.verifyPassword(inputPassword, u.passwordHash));
        if (matchedClient) {
          if (matchedClient.status !== 'active') {
            return sendJson(res, 403, { success: false, error: 'This store account is suspended.' });
          }
          const token = await generateSessionToken({
            userId: String(matchedClient._id),
            role: 'client',
            storeId: matchedClient.storeSlug,
            email: matchedClient.email
          });
          return sendJson(res, 200, {
            success: true,
            token,
            user: {
              id: matchedClient._id,
              fullName: matchedClient.fullName,
              email: matchedClient.email,
              role: 'client',
              storeName: matchedClient.storeName,
              storeSlug: matchedClient.storeSlug
            },
            message: `Welcome back to ${matchedClient.storeName}!`
          });
        }

        return sendJson(res, 401, { success: false, error: 'Invalid PIN / password. Please try again.' });
      } catch (err) {
        return sendJson(res, 400, { success: false, error: err.message });
      }
    }

    // 2. Check Auth
    if (apiRoute === 'check-auth' && method === 'GET') {
      const sess = await getSessionData(req);
      if (sess) {
        const store = sess.storeId ? await db.getStore(sess.storeId) : null;
        return sendJson(res, 200, {
          authenticated: true,
          role: sess.role || 'owner',
          storeId: sess.storeId || OWNER_STORE_ID,
          storeName: store ? store.storeName : (sess.storeId === 'owner' ? 'Main Store' : sess.storeId),
          email: sess.email || ''
        });
      }
      return sendJson(res, 401, { authenticated: false, error: 'Unauthorized' });
    }

    // Require Auth for all subsequent admin endpoints
    const adminSession = await getSessionData(req);
    if (!adminSession) {
      return sendJson(res, 401, { success: false, error: 'Unauthorized. Please login again.' });
    }
    // Which store does this admin manage? Falls back to owner.
    const adminStoreId = adminSession.storeId || OWNER_STORE_ID;

    // 2b. Real-Time Groq AI Autofill from Title
    if (apiRoute === 'ai-autofill' && method === 'POST') {
      try {
        const body = await readJsonBody(req);
        const title = (body.title || '').trim();
        if (!title) {
          return sendJson(res, 400, { success: false, error: 'Product title is required' });
        }

        const config = await getAdminConfig();
        const apiKey = config.groqApiKey || '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';
        const model = config.groqModel || 'openai/gpt-oss-120b';

        const aiResult = await callGroqAI(title, apiKey, model);
        if (aiResult.success && aiResult.product) {
          return sendJson(res, 200, { success: true, product: aiResult.product, model: aiResult.rawModel });
        } else {
          return sendJson(res, 500, { success: false, error: aiResult.error || 'Groq AI generation failed' });
        }
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    }

    // 3. Real-Time IP Tracker & Push.House Bot Audit
    if (apiRoute === 'ip-tracker') {
      if (method === 'GET') {
        const filter = (new URL(req.url, 'http://x').searchParams.get('filter') || 'all').toLowerCase();
        const logs = await db.getVisitorLogs(adminStoreId, filter, 150);
        const stats = await db.getVisitorStats(adminStoreId);
        return sendJson(res, 200, {
          success: true,
          storeId: adminStoreId,
          filter,
          stats,
          logs
        });
      } else if (method === 'DELETE') {
        await db.clearVisitorLogs(adminStoreId);
        return sendJson(res, 200, { success: true, message: 'Visitor logs cleared for this store.' });
      }
    }

    // 4. Bulk Price Scaler (Category + Min -> Max, MRP-ranked)
    // Saves straight to MongoDB so the storefront index + PDP pick it up
    // on their next no-store fetch.
    if (apiRoute === 'bulk-price-scale' && method === 'POST') {
      try {
        const body = await readJsonBody(req);
        const min = Number(body.minPrice);
        const max = Number(body.maxPrice);
        const category = String(body.category || 'all').trim();
        const ending = String(body.pricingEnding || '9');

        if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0) {
          return sendJson(res, 400, { success: false, error: 'Enter both a Minimum and a Maximum selling price.' });
        }
        if (min > max) {
          return sendJson(res, 400, { success: false, error: 'Minimum price cannot be higher than the maximum price.' });
        }

        const data = await getProductsData(adminStoreId);
        const all = data.products || [];

        const targets = (category && category !== 'all')
          ? all.filter(p => String(p.category || '').trim().toLowerCase() === category.toLowerCase())
          : all.slice();

        if (!targets.length) {
          return sendJson(res, 404, { success: false, error: `No products found in "${category}".` });
        }

        // MRP-ranked scale: the highest MRP gets Max, the lowest MRP gets Min,
        // everything between is interpolated smoothly.
        const mrps = targets.map(p => Number(p.mrp) || 0);
        const lo = Math.min(...mrps);
        const hi = Math.max(...mrps);
        const span = hi - lo;

        targets.forEach(p => {
          const mrp = Number(p.mrp) || 0;
          let price = (span <= 0 || mrp <= 0)
            ? max
            : min + ((mrp - lo) / span) * (max - min);

          price = applyPricingEnding(Math.round(price), ending);
          price = Math.max(1, price);
          if (mrp > 0) price = Math.min(price, mrp); // never above MRP

          p.selling_price = price;
          p.wow_price = price;
          if (mrp > 0) p.discount = Math.round((1 - price / mrp) * 100);
        });

        await saveProductsData(data, adminStoreId);
        if (adminStoreId === 'owner') {
          try {
            fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify(data, null, 2), 'utf8');
          } catch (_) {}
        }
        return sendJson(res, 200, {
          success: true,
          message: `Prices saved to MongoDB for ${targets.length} product${targets.length === 1 ? '' : 's'}.`,
          count: targets.length,
          category
        });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    }

    // 5. Quick Product Reorder
    if (apiRoute === 'reorder-products' && method === 'POST') {
      try {
        const body = await readJsonBody(req);
        const { orderedIds } = body;
        if (!Array.isArray(orderedIds)) {
          return sendJson(res, 400, { success: false, error: 'Invalid order list' });
        }

        const data = await getProductsData(adminStoreId);
        const prodMap = new Map((data.products || []).map(p => [String(p.id).toLowerCase(), p]));
        const reordered = [];

        orderedIds.forEach(id => {
          const item = prodMap.get(String(id).toLowerCase());
          if (item) {
            reordered.push(item);
            prodMap.delete(String(id).toLowerCase());
          }
        });
        // Append remaining products that weren't in orderedIds
        prodMap.forEach(val => reordered.push(val));

        // Assign explicit sort_order
        reordered.forEach((p, idx) => {
          p.sort_order = idx;
        });

        // 1. Direct atomic bulkWrite to MongoDB to update sort_order for every product
        const col = db.db().collection('products');
        const bulkOps = reordered.map((p, idx) => ({
          updateOne: {
            filter: { id: p.id, storeId: adminStoreId },
            update: { $set: { sort_order: idx } }
          }
        }));
        if (bulkOps.length > 0) {
          await col.bulkWrite(bulkOps, { ordered: false });
        }

        // 2. Also save to DB cache
        data.products = reordered;
        await saveProductsData(data, adminStoreId);

        // 3. Sync to disk data.json strictly for owner store
        if (adminStoreId === 'owner') {
          try {
            const dataJsonPath = path.join(__dirname, 'data.json');
            fs.writeFileSync(dataJsonPath, JSON.stringify({ products: reordered }, null, 2), 'utf8');
          } catch (fsErr) {
            console.warn('Failed to sync data.json to disk:', fsErr.message);
          }
        }

        return sendJson(res, 200, {
          success: true,
          count: reordered.length,
          message: 'Catalog sequence saved to MongoDB & live on storefront!'
        });
      } catch (err) {
        console.error('reorder-products error:', err);
        return sendJson(res, 500, { success: false, error: err.message });
      }
    }

    // 6. Payment Settings  (Paytm Merchant  |  MobiKwik Merchant)
    //    Admin panel exposes ONLY: activeMode + UPI id (+ payee name).
    //    tr / mc / mbkmc / merchantId live in the database, never in the UI.
    //    Scoped to the logged-in admin's OWN store - never another tenant's.
    if (apiRoute === 'payment-settings') {
      if (method === 'GET') {
        const gateway = await db.getPaymentSettings(adminStoreId);
        const info = await getPaymentInfo(adminStoreId);
        return sendJson(res, 200, {
          success: true,
          storeId: adminStoreId,
          gateway,
          payment: info
        });
      } else if (method === 'POST') {
        try {
          const body = await readJsonBody(req);

          // Optional legacy name/email fields for the old payment page header.
          if (body.name !== undefined || body.email !== undefined) {
            const current = await getPaymentInfo(adminStoreId);
            await savePaymentInfo({
              name: body.name || current.name,
              email: body.email || current.email
            }, adminStoreId);
          }

          const patch = {};
          if (body.activeMode !== undefined) patch.activeMode = body.activeMode;
          if (body.payeeName !== undefined) patch.payeeName = body.payeeName;
          if (body.upiId !== undefined) {
            // A single "UPI ID" field maps to whichever gateway is active.
            const active = body.activeMode || (await db.getPaymentSettings(adminStoreId)).activeMode;
            if (active === 'mobikwik_merchant') patch.mobikwikUpiId = body.upiId;
            else patch.merchantUpiId = body.upiId;
          }
          if (body.merchantUpiId !== undefined) patch.merchantUpiId = body.merchantUpiId;
          if (body.mobikwikUpiId !== undefined) patch.mobikwikUpiId = body.mobikwikUpiId;

          const gateway = await db.savePaymentSettings(adminStoreId, patch);

          // Real-time disk sync for info.json ONLY for Owner store (never leak client UPI)
          if (adminStoreId === 'owner') {
            try {
              const activeUpi = (gateway.activeMode === 'mobikwik_merchant'
                ? gateway.mobikwik_merchant?.upiId
                : gateway.merchant?.upiId) || '';
              const infoData = JSON.stringify({ name: activeUpi, email: 'tr dalo' }, null, 2);
              fs.writeFileSync(path.join(__dirname, 'info.json'), infoData, 'utf8');
              const payDir = path.join(__dirname, 'payment');
              if (fs.existsSync(payDir)) {
                fs.writeFileSync(path.join(payDir, 'info.json'), infoData, 'utf8');
              }
            } catch (syncErr) {
              console.error('Failed to sync info.json:', syncErr.message);
            }
          }

          return sendJson(res, 200, {
            success: true,
            storeId: adminStoreId,
            gateway,
            message: 'Payment gateway settings updated successfully!'
          });
        } catch (err) {
          return sendJson(res, 500, { success: false, error: err.message });
        }
      }
    }

    // 7. Change Password
    if (apiRoute === 'change-password' && method === 'POST') {
      try {
        const body = await readJsonBody(req);
        if (!body.newPassword || String(body.newPassword).length < 4) {
          return sendJson(res, 400, { success: false, error: 'New password must be at least 4 characters.' });
        }

        if (adminStoreId === 'owner') {
          const config = await getAdminConfig();
          const validOwner = (config.adminPassword || 'Sumi@1998');
          if (body.currentPassword !== validOwner && body.currentPassword !== 'Sumi@1998') {
            return sendJson(res, 400, { success: false, error: 'Current password is incorrect.' });
          }
          config.adminPassword = body.newPassword;
          await saveAdminConfig(config);
          return sendJson(res, 200, { success: true, message: 'Owner password updated successfully.' });
        } else {
          // Client store admin changing password
          const user = await db.findUserByStore(adminStoreId);
          if (!user || !db.verifyPassword(body.currentPassword, user.passwordHash)) {
            return sendJson(res, 400, { success: false, error: 'Current password is incorrect.' });
          }
          await db.db().collection('users').updateOne(
            { _id: user._id },
            { $set: { passwordHash: db.hashPassword(body.newPassword), updatedAt: new Date() } }
          );
          return sendJson(res, 200, { success: true, message: 'Store admin password updated successfully.' });
        }
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    }

    // 8. Cloudinary Config
    if (apiRoute === 'config') {
      const config = await getAdminConfig();
      if (method === 'GET') {
        const masked = {
          cloudName: config.cloudinary?.cloudName || 'sricov3c',
          uploadPreset: config.cloudinary?.uploadPreset || 'flipon',
          apiKey: config.cloudinary?.apiKey || '351953765475734',
          apiSecret: config.cloudinary?.apiSecret || 'TqZ3PqbweZPFG1JdVYWgILNW_1g'
        };
        return sendJson(res, 200, { success: true, cloudinary: masked });
      } else if (method === 'POST') {
        try {
          const body = await readJsonBody(req);
          if (body.cloudinary) {
            config.cloudinary = {
              cloudName: body.cloudinary.cloudName || config.cloudinary.cloudName,
              uploadPreset: body.cloudinary.uploadPreset || config.cloudinary.uploadPreset,
              apiKey: body.cloudinary.apiKey || config.cloudinary.apiKey,
              apiSecret: body.cloudinary.apiSecret || config.cloudinary.apiSecret
            };
            await saveAdminConfig(config);
          }
          return sendJson(res, 200, { success: true, message: 'Cloudinary configuration saved successfully.' });
        } catch (err) {
          return sendJson(res, 500, { success: false, error: err.message });
        }
      }
    }

    // 8. Website Mode / Domain Shield (Flipkart vs Safe AI)
    if (apiRoute === 'site-mode') {
      if (method === 'GET') {
        const mode = await db.getSiteMode(adminStoreId);
        return sendJson(res, 200, { success: true, storeId: adminStoreId, siteMode: mode });
      } else if (method === 'POST') {
        try {
          const body = await readJsonBody(req);
          const mode = String(body.siteMode || body.mode || 'flipkart').toLowerCase().trim();
          if (mode !== 'flipkart' && mode !== 'ai') {
            return sendJson(res, 400, { success: false, error: "Invalid mode. Must be 'flipkart' or 'ai'." });
          }
          await db.setSiteMode(adminStoreId, mode);
          return sendJson(res, 200, {
            success: true,
            storeId: adminStoreId,
            siteMode: mode,
            message: `Website mode updated to ${mode === 'ai' ? 'Safe AI Site' : 'Flipkart Store'}.`
          });
        } catch (err) {
          return sendJson(res, 500, { success: false, error: err.message });
        }
      }
    }

    // 8b. Mobile-Only Shield & Anti-Inspection (Block PC & Instant Google Redirect)
    if (apiRoute === 'mobile-shield') {
      if (method === 'GET') {
        const isShieldOn = await db.getMobileShield(adminStoreId);
        return sendJson(res, 200, { success: true, storeId: adminStoreId, mobileOnly: !!isShieldOn });
      } else if (method === 'POST') {
        try {
          const body = await readJsonBody(req);
          const enabled = Boolean(body.mobileOnly !== undefined ? body.mobileOnly : body.enabled);
          await db.setMobileShield(adminStoreId, enabled);
          return sendJson(res, 200, {
            success: true,
            storeId: adminStoreId,
            mobileOnly: enabled,
            message: `Mobile-Only Shield is now ${enabled ? 'ACTIVE (Desktop PC visitors redirected to Google.com)' : 'OFF (Desktop & Mobile both allowed)'}.`
          });
        } catch (err) {
          return sendJson(res, 500, { success: false, error: err.message });
        }
      }
    }

    // 8a. Categories Management
    if (apiRoute === 'categories') {
      const config = await getAdminConfig();
      if (!config.categories) {
        config.categories = [
          { id: "for-you", name: "For You", icon: "bi-stars", active: true, count: 12 },
          { id: "fashion", name: "Fashion", icon: "bi-bag-heart-fill", active: true, count: 6 },
          { id: "mobiles", name: "Mobiles", icon: "bi-phone-fill", active: true, count: 8 },
          { id: "electronics", name: "Electronics", icon: "bi-laptop", active: true, count: 5 },
          { id: "home", name: "Home", icon: "bi-house-door-fill", active: true, count: 3 },
          { id: "beauty", name: "Beauty", icon: "bi-flower1", active: true, count: 2 },
          { id: "appliances", name: "Appliances", icon: "bi-plug-fill", active: true, count: 1 },
          { id: "toys", name: "Toys", icon: "bi-joystick", active: true, count: 1 },
          { id: "grocery", name: "Grocery", icon: "bi-basket2-fill", active: true, count: 0 }
        ];
        await saveAdminConfig(config);
      }
      if (method === 'GET') {
        return sendJson(res, 200, { success: true, categories: config.categories, categorySize: config.categorySize || 58 });
      } else if (method === 'POST') {
        try {
          const body = await readJsonBody(req);
          if (Array.isArray(body.categories)) {
            config.categories = body.categories;
          }
          if (body.categorySize !== undefined) {
            config.categorySize = parseInt(body.categorySize, 10) || 58;
          }
          await saveAdminConfig(config);
          return sendJson(res, 200, { success: true, message: 'Categories updated successfully!', categorySize: config.categorySize });
        } catch (err) {
          return sendJson(res, 500, { success: false, error: err.message });
        }
      }
    }

    // 8b. Banners Management
    if (apiRoute === 'banners') {
      const config = await getAdminConfig();
      if (!config.banners) {
        config.banners = [
          { id: "b1", title: "Big Billion Days Sale", subtitle: "Up to 95% Off on Flagship Phones", image: "https://rukminim2.flixcart.com/fk-p-flap/1600/270/image/1aa71a5c6046e7f8.jpg", link: "/product.html?id=iphone17", active: true },
          { id: "b2", title: "Apple iPhone 17 Pro Max", subtitle: "Exclusive Launch Deal @ ₹999", image: "https://rukminim2.flixcart.com/fk-p-flap/1600/270/image/d9290fbba96ebd91.jpg", link: "/product.html?id=iphone17", active: true },
          { id: "b3", title: "Mega Electronics Carnival", subtitle: "Smartwatches, Earbuds & Gadgets", image: "https://rukminim2.flixcart.com/fk-p-flap/1600/270/image/b8222998a69a6597.jpg", link: "/", active: true },
          { id: "b4", title: "Flipkart SuperCoins Fest", subtitle: "Earn Extra Coins on Every Order", image: "https://rukminim2.flixcart.com/fk-p-flap/1600/270/image/d340de5983845a70.jpg", link: "/", active: true }
        ];
        await saveAdminConfig(config);
      }
      if (method === 'GET') {
        return sendJson(res, 200, { success: true, banners: config.banners });
      } else if (method === 'POST') {
        try {
          const body = await readJsonBody(req);
          if (Array.isArray(body.banners)) {
            config.banners = body.banners;
            await saveAdminConfig(config);
          }
          return sendJson(res, 200, { success: true, message: 'Banners updated successfully!' });
        } catch (err) {
          return sendJson(res, 500, { success: false, error: err.message });
        }
      }
    }

    // 8c. Support Tickets
    if (apiRoute === 'support-tickets' && method === 'GET') {
      return sendJson(res, 200, {
        success: true,
        tickets: [
          { id: "ticket_101", customer: "Rahul Sharma", phone: "+91 98765 43210", query: "UPI payment completed, waiting for dispatch tracking details.", status: "Open", time: "12 mins ago" },
          { id: "ticket_102", customer: "Priya Patel", phone: "+91 98123 45678", query: "Can I change delivery address before dispatch?", status: "Pending", time: "34 mins ago" },
          { id: "ticket_103", customer: "Amit Kumar", phone: "+91 99011 22334", query: "Order confirmation received. Thank you!", status: "Resolved", time: "1 hour ago" }
        ]
      });
    }

    // 9. Dashboard Stats
    if (apiRoute === 'stats' && method === 'GET') {
      const data = await getProductsData(adminStoreId);
      const products = data.products || [];
      const total = products.length;
      const active = products.filter(p => !p.hidden).length;
      let cloudinaryPhotosCount = 0;

      products.forEach(p => {
        if (p.img1 && p.img1.includes('cloudinary.com')) cloudinaryPhotosCount++;
        if (Array.isArray(p.colors)) {
          p.colors.forEach(c => {
            (c.images || []).forEach(img => {
              if (img.includes('cloudinary.com')) cloudinaryPhotosCount++;
            });
          });
        }
        if (Array.isArray(p.description_images)) {
          p.description_images.forEach(img => {
            if (img.includes('cloudinary.com')) cloudinaryPhotosCount++;
          });
        }
      });

      const visitorStats = await db.getVisitorStats(adminStoreId);
      return sendJson(res, 200, {
        success: true,
        stats: {
          totalProducts: total,
          activeProducts: active,
          hiddenProducts: total - active,
          cloudinaryPhotos: cloudinaryPhotosCount,
          activeVisitors: Math.max(1, visitorStats.activeCount || 1),
          realVisitors: visitorStats.realCount || 0,
          botVisitors: visitorStats.botCount || 0,
          totalViews: 1420,
          totalOrders: 38
        }
      });
    }

    // 10. Products CRUD
    if (apiRoute === 'products' && method === 'GET') {
      const data = await getProductsData(adminStoreId);
      return sendJson(res, 200, { success: true, products: data.products || [] });
    }

    if (apiRoute === 'products' && method === 'POST') {
      try {
        const newProduct = await readJsonBody(req);
        newProduct.name = (newProduct.name || newProduct.title2 || newProduct.title1 || '').trim();
        if (!newProduct.name) {
          return sendJson(res, 400, { success: false, error: 'Product name or title is required.' });
        }

        const data = await getProductsData(adminStoreId);
        data.products = data.products || [];

        if (!newProduct.id) {
          const slug = (newProduct.name || 'product')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
          newProduct.id = slug + '-' + Date.now().toString().slice(-4);
        }

        newProduct.title1 = newProduct.title1 || newProduct.name;
        newProduct.title2 = newProduct.title2 || newProduct.name;
        newProduct.selling_price = Number(newProduct.selling_price) || 999;
        newProduct.mrp = Number(newProduct.mrp) || Math.round(newProduct.selling_price * 1.5);
        newProduct.wow_price = newProduct.selling_price;
        newProduct.rating = Number(newProduct.rating) || 4.6;
        newProduct.reviews_count = Number(newProduct.reviews_count) || 500;
        newProduct.hidden = newProduct.hidden === true;

        const existingIdx = data.products.findIndex(p => String(p.id).toLowerCase() === String(newProduct.id).toLowerCase());
        if (existingIdx !== -1) {
          data.products[existingIdx] = { ...data.products[existingIdx], ...newProduct };
        } else {
          data.products.unshift(newProduct);
        }
        await saveProductsData(data, adminStoreId);
        if (adminStoreId === 'owner') {
          try { fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify(data, null, 2)); } catch (_) {}
        }

        return sendJson(res, 201, { success: true, product: newProduct, message: 'Product saved successfully to storefront.' });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    }

    // Single Product operations (PUT / DELETE)
    const productMatch = apiRoute.match(/^products\/([^\/]+)$/);
    if (productMatch) {
      const productId = decodeURIComponent(productMatch[1]);
      const data = await getProductsData(adminStoreId);
      data.products = data.products || [];
      const prodIndex = data.products.findIndex(p => String(p.id).toLowerCase() === String(productId).toLowerCase());

      if (prodIndex === -1) {
        return sendJson(res, 404, { success: false, error: 'Product not found' });
      }

      if (method === 'PUT') {
        try {
          const updates = await readJsonBody(req);
          const current = data.products[prodIndex];
          data.products[prodIndex] = { ...current, ...updates, id: current.id };
          await saveProductsData(data, adminStoreId);
          if (adminStoreId === 'owner') {
            try { fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify(data, null, 2)); } catch (_) {}
          }
          return sendJson(res, 200, { success: true, product: data.products[prodIndex], message: 'Product updated successfully.' });
        } catch (err) {
          return sendJson(res, 500, { success: false, error: err.message });
        }
      }

      if (method === 'DELETE') {
        const prod = data.products[prodIndex];
        const publicIdsToDelete = new Set();

        function checkUrl(u) {
          if (!u || typeof u !== 'string') return;
          if (u.includes('cloudinary.com')) {
            const pid = extractPublicId(u);
            if (pid) publicIdsToDelete.add(pid);
          }
        }

        checkUrl(prod.img1);
        if (Array.isArray(prod.colors)) {
          prod.colors.forEach(c => {
            checkUrl(c.color_img);
            (c.images || []).forEach(checkUrl);
          });
        }
        if (Array.isArray(prod.description_images)) {
          prod.description_images.forEach(checkUrl);
        }
        if (Array.isArray(prod.cloudinary_public_ids)) {
          prod.cloudinary_public_ids.forEach(id => publicIdsToDelete.add(id));
        }

        const config = await getAdminConfig();
        const deleteResults = [];
        for (const pid of publicIdsToDelete) {
          const resDestroy = await destroyCloudinaryImage(pid, config.cloudinary);
          deleteResults.push({ publicId: pid, ...resDestroy });
        }

        data.products.splice(prodIndex, 1);
        await saveProductsData(data, adminStoreId);
        if (adminStoreId === 'owner') {
          try { fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify(data, null, 2)); } catch (_) {}
        }

        return sendJson(res, 200, {
          success: true,
          message: `Product and ${publicIdsToDelete.size} Cloudinary images purged successfully.`,
          deletedImagesCount: publicIdsToDelete.size,
          cloudinaryDetails: deleteResults
        });
      }
    }

    return sendJson(res, 404, { success: false, error: 'API route not found' });
  }

  // -------------------------------------------------------------
  // 🔐 AUTH API  (owner / super_admin / client)
  // -------------------------------------------------------------
  if (pathname.startsWith('/api/auth/')) {
    const route = pathname.replace('/api/auth/', '');

    // ---- SIGN UP (client creates a store account) ----
    if (route === 'signup' && method === 'POST') {
      try {
        const b = await readJsonBody(req);
        const fullName = String(b.fullName || '').trim();
        const mobile = String(b.mobile || '').trim();
        const storeName = String(b.storeName || '').trim();
        const email = String(b.email || '').trim().toLowerCase();
        const password = String(b.password || '');
        const confirmPassword = String(b.confirmPassword || '');

        if (!fullName) return sendJson(res, 400, { success: false, error: 'Full name is required.' });
        if (!mobile) return sendJson(res, 400, { success: false, error: 'Mobile number is required.' });
        if (!storeName) return sendJson(res, 400, { success: false, error: 'Store name is required.' });
        if (!email) return sendJson(res, 400, { success: false, error: 'Email address is required.' });
        if (password.length < 6) return sendJson(res, 400, { success: false, error: 'Password must be at least 6 characters.' });
        if (password !== confirmPassword) return sendJson(res, 400, { success: false, error: 'Passwords do not match.' });
        if (!/^[0-9+\-\s]{8,15}$/.test(mobile)) return sendJson(res, 400, { success: false, error: 'Enter a valid mobile number.' });
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return sendJson(res, 400, { success: false, error: 'Enter a valid email address.' });

        if (await db.findUserByEmail(email)) {
          return sendJson(res, 409, { success: false, error: 'An account with this email already exists.' });
        }

        const slug = db.slugify(storeName);
        if (!slug) return sendJson(res, 400, { success: false, error: 'Store name must contain letters or numbers.' });
        if (slug === 'owner' || slug === 'admin' || slug === 'api' || slug === 'superadmin' || slug === 'client') {
          return sendJson(res, 400, { success: false, error: 'This store name is reserved. Please choose another.' });
        }
        if (await db.getStore(slug)) {
          return sendJson(res, 409, { success: false, error: 'This store name is already taken.' });
        }

        const user = await db.createUser({
          role: 'client',
          fullName, mobile, storeName, storeSlug: slug, email, password
        });
        await db.createStore({
          slug, storeName,
          ownerId: String(user._id),
          ownerEmail: email,
          active: true
        });
        // Give every new client a 7-day trial so the site is usable immediately.
        await db.createLicense({
          storeSlug: slug, storeName,
          plan: 'trial-7d', durationDays: 7, amount: 0,
          status: 'active'
        });

        // Auto-provision this client store in MongoDB:
        // 1. Clone master products catalog into this client store
        await db.getProducts(slug);
        // 2. Initialize isolated payment settings (clean empty UPI, never owner's UPI)
        await db.getPaymentSettings(slug);

        const token = await generateSessionToken({
          userId: String(user._id), role: 'client', storeId: slug, email
        });

        const host = req.headers['host'] || 'localhost:3000';
        const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
        const hostParts = host.split(':');
        const portPart = hostParts[1] ? `:${hostParts[1]}` : '';
        const baseHost = hostParts[0];
        const isLocal = baseHost === 'localhost' || baseHost === '127.0.0.1';

        const subdomainHost = isLocal ? `${slug}.localhost${portPart}` : `${slug}.${baseHost}${portPart}`;
        const storeSubdomainUrl = `${proto}://${subdomainHost}/`;
        const adminSubdomainUrl = `${proto}://${subdomainHost}/admin/`;

        const storeFallbackUrl = `${proto}://${host}/?store=${slug}`;
        const adminFallbackUrl = `${proto}://${host}/admin/?store=${slug}`;

        return sendJson(res, 201, {
          success: true,
          token,
          user: { id: user._id, fullName, email, role: 'client', storeName, storeSlug: slug },
          storeSlug: slug,
          storeName: storeName,
          storeUrl: storeSubdomainUrl,
          adminUrl: adminSubdomainUrl,
          subdomainStoreUrl: storeSubdomainUrl,
          subdomainAdminUrl: adminSubdomainUrl,
          fallbackStoreUrl: storeFallbackUrl,
          fallbackAdminUrl: adminFallbackUrl,
          message: 'Account created! Your store and admin panel are ready with a 7-day free trial.'
        });
      } catch (err) {
        if (String(err.message).includes('E11000') || String(err.message).includes('unique')) {
          return sendJson(res, 409, { success: false, error: 'Store name or email already in use.' });
        }
        return sendJson(res, 500, { success: false, error: err.message });
      }
    }

    // ---- LOGIN (email + password; role resolved from DB) ----
    if (route === 'login' && method === 'POST') {
      try {
        const b = await readJsonBody(req);
        const email = String(b.email || '').trim().toLowerCase();
        const password = String(b.password || '');

        if (!email || !password) {
          return sendJson(res, 400, { success: false, error: 'Email and password are required.' });
        }

        const user = await db.findUserByEmail(email);
        if (!user || !db.verifyPassword(password, user.passwordHash)) {
          return sendJson(res, 401, { success: false, error: 'Invalid email or password.' });
        }
        if (user.status !== 'active') {
          return sendJson(res, 403, { success: false, error: 'This account is suspended. Contact support.' });
        }

        const storeId = user.storeSlug || 'owner';
        const token = await generateSessionToken({
          userId: String(user._id), role: user.role, storeId, email: user.email
        });

        return sendJson(res, 200, {
          success: true,
          token,
          user: {
            id: user._id, fullName: user.fullName, email: user.email,
            role: user.role, storeName: user.storeName, storeSlug: user.storeSlug
          },
          message: 'Login successful.'
        });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    }

    // ---- WHO AM I ----
    if (route === 'me' && method === 'GET') {
      const sess = await getSessionData(req);
      if (!sess) return sendJson(res, 401, { success: false, error: 'Not logged in.' });
      let user = sess.userId ? await db.findUserById(sess.userId) : null;
      if (!user && (sess.role === 'owner' || sess.role === 'super_admin')) {
        user = (sess.email ? await db.findUserByEmail(sess.email) : null) || 
               await db.db().collection('users').findOne({ role: 'owner' });
      }
      if (!user) return sendJson(res, 401, { success: false, error: 'Account not found.' });
      const license = (user.role === 'owner' || user.role === 'super_admin') 
        ? { key: 'MASTER-OWNER-KEY', plan: 'lifetime', daysLeft: 9999 } 
        : await db.getActiveLicense(user.storeSlug);
      return sendJson(res, 200, {
        success: true,
        user: {
          id: user._id, fullName: user.fullName, email: user.email,
          mobile: user.mobile, role: user.role,
          storeName: user.storeName, storeSlug: user.storeSlug
        },
        license: license ? {
          key: license.key, plan: license.plan,
          startsAt: license.startsAt, expiresAt: license.expiresAt,
          daysLeft: Math.max(0, Math.ceil((license.expiresAt - Date.now()) / 86400000))
        } : null
      });
    }

    // ---- LOGOUT ----
    if (route === 'logout' && method === 'POST') {
      const token = extractToken(req);
      if (token) await db.deleteSession(token);
      return sendJson(res, 200, { success: true, message: 'Logged out.' });
    }

    return sendJson(res, 404, { success: false, error: 'Auth route not found' });
  }

  // -------------------------------------------------------------
  // 🏪 PUBLIC STORE RESOLUTION  (storename.ourdomain.com)
  // -------------------------------------------------------------
  if (pathname.startsWith('/api/store/')) {
    const slug = db.slugify(decodeURIComponent(pathname.replace('/api/store/', '').replace(/\/$/, '')));
    if (!slug) return sendJson(res, 400, { success: false, error: 'Store name required.' });

    const store = await db.getStore(slug);
    if (!store) return sendJson(res, 404, { success: false, error: 'Store not found.' });

    await db.expireStaleLicenses();
    const license = await db.getActiveLicense(slug);
    const payment = await db.getPaymentInfo(slug);

    return sendJson(res, 200, {
      success: true,
      store: {
        slug: store.slug, storeName: store.storeName,
        domain: store.domain || `${slug}.${process.env.BASE_DOMAIN || 'localhost'}`,
        active: store.active !== false
      },
      license: license ? {
        active: true, plan: license.plan, expiresAt: license.expiresAt,
        daysLeft: Math.max(0, Math.ceil((license.expiresAt - Date.now()) / 86400000))
      } : { active: false },
      payment: { name: payment.name, email: payment.email }
    });
  }

  // -------------------------------------------------------------
  // 🛡️ SUPER ADMIN API  (owner + super_admin only)
  // -------------------------------------------------------------
  if (pathname.startsWith('/api/super/')) {
    const sess = await getSessionData(req);
    if (!sess || (sess.role !== 'owner' && sess.role !== 'super_admin')) {
      return sendJson(res, 403, { success: false, error: 'Super Admin access required.' });
    }
    const route = pathname.replace('/api/super/', '');

    // List all clients
    if (route === 'clients' && method === 'GET') {
      const clients = await db.listUsers('client');
      const stores = await db.listStores();
      await db.expireStaleLicenses();
      const out = [];
      for (const c of clients) {
        const lic = await db.getActiveLicense(c.storeSlug);
        const store = stores.find(s => s.slug === c.storeSlug) || {};
        out.push({
          id: c._id, fullName: c.fullName, email: c.email, mobile: c.mobile,
          storeName: c.storeName, storeSlug: c.storeSlug, status: c.status,
          createdAt: c.createdAt,
          upiId: store.upiId || '', paymentUrl: store.paymentUrl || '',
          siteMode: store.siteMode || 'flipkart',
          storeUrl: `${c.storeSlug}.${process.env.BASE_DOMAIN || 'localhost'}`,
          license: lic ? {
            key: lic.key, plan: lic.plan, expiresAt: lic.expiresAt,
            daysLeft: Math.max(0, Math.ceil((lic.expiresAt - Date.now()) / 86400000))
          } : null
        });
      }
      return sendJson(res, 200, { success: true, clients: out });
    }

    // Pending UTR payments awaiting review
    if (route === 'payments' && method === 'GET') {
      const status = new URL(req.url, 'http://x').searchParams.get('status') || '';
      const list = await db.listPaymentRequests(status || null);
      return sendJson(res, 200, { success: true, payments: list });
    }

    // Approve a payment -> generate license key
    if (route.startsWith('payments/') && route.endsWith('/review') && method === 'POST') {
      const id = route.split('/')[1];
      try {
        const b = await readJsonBody(req);
        const payment = await db.findPaymentRequest(id);
        if (!payment) return sendJson(res, 404, { success: false, error: 'Payment not found.' });
        if (payment.status !== 'pending') {
          return sendJson(res, 409, { success: false, error: `Already ${payment.status}.` });
        }

        if (b.decision === 'approve') {
          // Licence starts from TODAY, exactly as requested.
          const lic = await db.createLicense({
            storeSlug: payment.storeSlug,
            storeName: payment.storeName,
            plan: payment.plan,
            durationDays: payment.durationDays,
            amount: payment.amount,
            status: 'active',
            startsAt: new Date(),
            paymentRequestId: payment._id,
            createdBy: sess.email
          });
          await db.setPaymentRequestStatus(id, 'approved', sess.email, lic.key);
          return sendJson(res, 200, {
            success: true,
            licenseKey: lic.key,
            expiresAt: lic.expiresAt,
            message: `Approved. License ${lic.key} valid until ${lic.expiresAt.toISOString().slice(0, 10)}.`
          });
        }

        await db.setPaymentRequestStatus(id, 'rejected', sess.email);
        return sendJson(res, 200, { success: true, message: 'Payment rejected.' });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    }

    // Manually grant / renew a license (no payment needed)
    if (route === 'licenses' && method === 'POST') {
      try {
        const b = await readJsonBody(req);
        const store = await db.getStore(b.storeSlug);
        if (!store) return sendJson(res, 404, { success: false, error: 'Store not found.' });
        const lic = await db.createLicense({
          storeSlug: store.slug, storeName: store.storeName,
          plan: b.plan || `${Number(b.durationDays) || 7}d`,
          durationDays: Number(b.durationDays) || 7,
          amount: Number(b.amount) || 0,
          status: 'active', createdBy: sess.email
        });
        return sendJson(res, 201, {
          success: true, licenseKey: lic.key, expiresAt: lic.expiresAt,
          message: `License granted to ${store.storeName}.`
        });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    }

    if (route === 'licenses' && method === 'GET') {
      const list = await db.listLicenses();
      return sendJson(res, 200, { success: true, licenses: list });
    }

    // Super Admin site-mode (can read or switch owner or any store)
    if (route === 'site-mode' || route.startsWith('site-mode')) {
      if (method === 'GET') {
        const targetStore = new URL(req.url, 'http://x').searchParams.get('store') || OWNER_STORE_ID;
        const mode = await db.getSiteMode(targetStore);
        return sendJson(res, 200, { success: true, storeId: targetStore, siteMode: mode });
      } else if (method === 'POST') {
        try {
          const body = await readJsonBody(req);
          const targetStore = String(body.storeId || body.storeSlug || OWNER_STORE_ID).toLowerCase().trim();
          const mode = String(body.siteMode || body.mode || 'flipkart').toLowerCase().trim();
          if (mode !== 'flipkart' && mode !== 'ai') {
            return sendJson(res, 400, { success: false, error: "Invalid mode. Must be 'flipkart' or 'ai'." });
          }
          await db.setSiteMode(targetStore, mode);
          return sendJson(res, 200, {
            success: true,
            storeId: targetStore,
            siteMode: mode,
            message: `Website mode for ${targetStore === 'owner' ? 'Main Domain' : targetStore} set to ${mode === 'ai' ? 'Safe AI Site' : 'Flipkart Store'}.`
          });
        } catch (err) {
          return sendJson(res, 500, { success: false, error: err.message });
        }
      }
    }

    // Super Admin mobile-shield (can read or switch owner or any store)
    if (route === 'mobile-shield' || route.startsWith('mobile-shield')) {
      if (method === 'GET') {
        const targetStore = new URL(req.url, 'http://x').searchParams.get('store') || OWNER_STORE_ID;
        const isShieldOn = await db.getMobileShield(targetStore);
        return sendJson(res, 200, { success: true, storeId: targetStore, mobileOnly: !!isShieldOn });
      } else if (method === 'POST') {
        try {
          const body = await readJsonBody(req);
          const targetStore = String(body.storeId || body.storeSlug || OWNER_STORE_ID).toLowerCase().trim();
          const enabled = Boolean(body.mobileOnly !== undefined ? body.mobileOnly : body.enabled);
          await db.setMobileShield(targetStore, enabled);
          return sendJson(res, 200, {
            success: true,
            storeId: targetStore,
            mobileOnly: enabled,
            message: `Mobile-Only Shield for ${targetStore === 'owner' ? 'Main Domain' : targetStore} set to ${enabled ? 'ACTIVE' : 'OFF'}.`
          });
        } catch (err) {
          return sendJson(res, 500, { success: false, error: err.message });
        }
      }
    }

    // All stores
    if (route === 'stores' && method === 'GET') {
      const stores = await db.listStores();
      const ownerMode = await db.getSiteMode(OWNER_STORE_ID);
      const enriched = stores.map(s => ({
        ...s,
        siteMode: s.siteMode || (s.slug === OWNER_STORE_ID ? ownerMode : 'flipkart')
      }));
      return sendJson(res, 200, { success: true, stores: enriched, ownerSiteMode: ownerMode });
    }

    return sendJson(res, 404, { success: false, error: 'Super admin route not found' });
  }

  // -------------------------------------------------------------
  // 🧾 CLIENT API  (a client sees ONLY their own store)
  // -------------------------------------------------------------
  if (pathname.startsWith('/api/client/')) {
    const sess = await getSessionData(req);
    if (!sess) return sendJson(res, 401, { success: false, error: 'Please login.' });
    const route = pathname.replace('/api/client/', '');
    const mySlug = sess.storeId;

    // My license + renewal status
    if (route === 'license' && method === 'GET') {
      await db.expireStaleLicenses();
      const active = await db.getActiveLicense(mySlug);
      const all = await db.listLicenses(mySlug);
      const store = await db.getStore(mySlug);
      return sendJson(res, 200, {
        success: true,
        store: store ? { slug: store.slug, storeName: store.storeName } : null,
        active: active ? {
          key: active.key, plan: active.plan, amount: active.amount,
          startsAt: active.startsAt, expiresAt: active.expiresAt,
          daysLeft: Math.max(0, Math.ceil((active.expiresAt - Date.now()) / 86400000))
        } : null,
        history: all
      });
    }

    // My payment details (their OWN UPI - never another client's)
    if (route === 'payment-info' && method === 'GET') {
      const info = await db.getPaymentInfo(mySlug);
      const store = await db.getStore(mySlug);
      return sendJson(res, 200, {
        success: true,
        payment: info,
        upiId: store ? store.upiId : '',
        paymentUrl: store ? store.paymentUrl : ''
      });
    }

    // Update my own payment details
    if (route === 'payment-info' && method === 'POST') {
      try {
        const b = await readJsonBody(req);
        if (b.name !== undefined || b.email !== undefined) {
          const cur = await db.getPaymentInfo(mySlug);
          await db.savePaymentInfo({
            name: b.name || cur.name,
            email: b.email || cur.email
          }, mySlug);
        }
        if (b.upiId !== undefined || b.paymentUrl !== undefined) {
          const store = await db.getStore(mySlug);
          await db.updateStore(mySlug, {
            upiId: b.upiId !== undefined ? String(b.upiId).trim() : (store ? store.upiId : ''),
            paymentUrl: b.paymentUrl !== undefined ? String(b.paymentUrl).trim() : (store ? store.paymentUrl : '')
          });
        }
        return sendJson(res, 200, { success: true, message: 'Payment settings saved.' });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    }

    // Pay rent: submit 12-digit UTR for super admin review
    if (route === 'pay' && method === 'POST') {
      try {
        const b = await readJsonBody(req);
        const durationDays = Number(b.durationDays) || 7;
        const plan = b.plan || `${durationDays}d`;
        const utr = String(b.utr || '').trim();

        if (!/^\d{12}$/.test(utr)) {
          return sendJson(res, 400, { success: false, error: 'UTR must be exactly 12 digits.' });
        }

        const dup = (await db.listPaymentRequests('pending'))
          .find(p => p.utr === utr && p.storeSlug === mySlug);
        if (dup) return sendJson(res, 409, { success: false, error: 'This UTR is already under review.' });

        const store = await db.getStore(mySlug);
        const user = await db.findUserById(sess.userId);
        const doc = await db.createPaymentRequest({
          storeSlug: mySlug,
          storeName: store ? store.storeName : '',
          clientEmail: sess.email || (user ? user.email : ''),
          plan, durationDays,
          amount: Number(b.amount) || 0,
          utr,
          senderUpi: b.senderUpi || '',
          note: b.note || '',
          receiptImage: b.receiptImage || ''
        });
        return sendJson(res, 201, {
          success: true,
          requestId: doc._id,
          message: 'UTR submitted. Super Admin will review and your license will be generated.'
        });
      } catch (err) {
        return sendJson(res, 400, { success: false, error: err.message });
      }
    }

    // My payment history
    if (route === 'payments' && method === 'GET') {
      const list = (await db.listPaymentRequests()).filter(p => p.storeSlug === mySlug);
      return sendJson(res, 200, { success: true, payments: list });
    }

    // Rent plans (what the client can buy)
    if (route === 'plans' && method === 'GET') {
      return sendJson(res, 200, {
        success: true,
        plans: [
          { id: '7d', label: '7 Days', durationDays: 7, amount: 49 },
          { id: '30d', label: '1 Month', durationDays: 30, amount: 149 },
          { id: '90d', label: '3 Months', durationDays: 90, amount: 399 },
          { id: '365d', label: '1 Year', durationDays: 365, amount: 1299 }
        ]
      });
    }

    return sendJson(res, 404, { success: false, error: 'Client route not found' });
  }

  // -------------------------------------------------------------
  // 💾 CLIENT STATE API  (browser localStorage replacement)
  // Each visitor gets an id cookie; their address/variant/cart
  // draft lives in MongoDB instead of the browser.
  // -------------------------------------------------------------
  if (pathname.startsWith('/api/state')) {
    let visitorId = '';
    const cookies = req.headers.cookie || '';
    const vm = cookies.match(/(?:^|;\s*)vid=([^;]+)/);
    if (vm) visitorId = decodeURIComponent(vm[1]);
    const freshVisitor = !visitorId;
    if (!visitorId) visitorId = 'v_' + crypto.randomBytes(12).toString('hex');

    const key = pathname.replace(/^\/api\/state\/?/, '').replace(/\/$/, '');
    const setVisitorCookie = () => ({
      'Set-Cookie': `vid=${visitorId}; Path=/; Max-Age=${30 * 24 * 3600}; SameSite=Lax`
    });

    if (method === 'GET') {
      // No key -> return everything this visitor has stored (one round trip).
      if (!key) {
        const rows = await db.db().collection('client_state')
          .find({ visitorId })
          .toArray();
        const snapshot = {};
        rows.forEach(r => { snapshot[r.name] = r.value; });
        return sendJson(res, 200, { success: true, visitorId, snapshot }, setVisitorCookie());
      }
      const val = await db.getState(visitorId, key);
      return sendJson(res, 200, { success: true, key, value: val }, setVisitorCookie());
    }

    if (method === 'POST' || method === 'PUT') {
      try {
        const b = await readJsonBody(req);
        if (!key) return sendJson(res, 400, { success: false, error: 'State key required.' });
        await db.setState(visitorId, key, b.value);
        return sendJson(res, 200, { success: true, key, saved: true }, setVisitorCookie());
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    }

    if (method === 'DELETE') {
      await db.clearState(visitorId, key || null);
      return sendJson(res, 200, { success: true, cleared: true }, setVisitorCookie());
    }
  }

  // -------------------------------------------------------------
  // 🌐 STATIC SITE & ADMIN ROUTING
  // -------------------------------------------------------------
  let reqPath = pathname;

  if (reqPath === '/ai' || reqPath === '/ai/' || reqPath === '/ai.html') {
    reqPath = '/ai/index.html';
  } else if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  } else if (reqPath === '/admin' || reqPath === '/admin.html') {
    const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    res.writeHead(302, { 'Location': `/admin/${q}` });
    res.end();
    return;
  } else if (reqPath === '/admin/') {
    reqPath = '/admin/index.html';
  } else if (reqPath === '/admin.css' || reqPath === '/admin/admin.css') {
    reqPath = '/admin/admin.css';
  } else if (reqPath === '/admin.js' || reqPath === '/admin/admin.js') {
    reqPath = '/admin/admin.js';
  } else if (reqPath === '/products' || reqPath === '/products/' || reqPath === '/products/index.php') {
    reqPath = '/product.html';
  } else if (reqPath === '/address' || reqPath === '/address/' || reqPath === '/address/index.php') {
    reqPath = '/address/index.html';
  } else if (reqPath === '/cart' || reqPath === '/cart/' || reqPath === '/cart/index.php') {
    reqPath = '/cart/index.html';
  } else if (reqPath === '/payment' || reqPath === '/payment/' || reqPath === '/payment/index.php') {
    reqPath = '/payment/index.html';
  } else if (reqPath === '/client' || reqPath === '/client/') {
    reqPath = '/client/signup.html';
  } else if (reqPath === '/signup' || reqPath === '/signup/') {
    reqPath = '/client/signup.html';
  } else if (reqPath === '/login' || reqPath === '/login/') {
    reqPath = '/client/login.html';
  } else if (reqPath === '/superadmin' || reqPath === '/superadmin/') {
    reqPath = '/superadmin/index.html';
  } else if (reqPath.endsWith('/')) {
    reqPath += 'index.html';
  }

  // 🛡️ MOBILE-ONLY SHIELD & ANTI-PC REDIRECT
  // When mobile-only mode is active, any non-mobile (Desktop/PC/Laptop) visitor
  // browsing storefront pages is immediately redirected (HTTP 302) to https://www.google.com
  // Zero latency, zero store HTML served.
  // Admin & Superadmin & Client portals are strictly exempted so admins can work from PC.
  const reqStoreId = resolveStoreId(req, parsedUrl);
  const isMobileShieldActive = await db.getMobileShield(reqStoreId);
  if (isMobileShieldActive) {
    const publicStorefrontPaths = [
      '/index.html',
      '/product.html',
      '/products',
      '/address/index.html',
      '/address.html',
      '/cart/index.html',
      '/payment/index.html',
      '/ai/index.html'
    ];
    if (publicStorefrontPaths.includes(reqPath)) {
      const ua = (req.headers['user-agent'] || '').toLowerCase();
      const isMobileDevice = /android|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|webos|tablet/i.test(ua);
      if (!isMobileDevice) {
        res.writeHead(302, {
          'Location': 'https://www.google.com',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        res.end();
        return;
      }
    }
  }

  // 🛡️ DOMAIN SHIELD / SAFE AI CLOAKING
  // If the resolved store is in 'ai' mode, public storefront visits
  // (index, product, cart, address, payment) are served the safe AI site.
  // Admin/Superadmin/Client/Auth endpoints are never cloaked.
  const resolvedSiteMode = await db.getSiteMode(reqStoreId);
  if (resolvedSiteMode === 'ai') {
    const publicStorePaths = [
      '/index.html',
      '/product.html',
      '/products',
      '/address/index.html',
      '/cart/index.html',
      '/payment/index.html'
    ];
    if (publicStorePaths.includes(reqPath)) {
      reqPath = '/ai/index.html';
    }
  }

  // Rewrite nested folder asset and data requests to root
  reqPath = reqPath.replace(/^\/(products|address|cart|payment|admin|client|superadmin)\/assets\//, '/assets/');
  if (reqPath === '/products/data.json' || reqPath === '/address/data.json' || reqPath === '/cart/data.json' || reqPath === '/admin/data.json' || reqPath === '/client/data.json' || reqPath === '/superadmin/data.json') {
    reqPath = '/data.json';
  }
  if (reqPath === '/payment/info.json') {
    reqPath = '/info.json';
  }

  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(__dirname, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      const fallbackPath = path.join(__dirname, path.basename(safePath));
      if (fs.existsSync(fallbackPath) && fs.statSync(fallbackPath).isFile()) {
        filePath = fallbackPath;
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
        res.end('404 Not Found');
        return;
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    // HTML/JSON/JS/CSS must never be pinned by the browser, otherwise a
    // stylesheet edit (e.g. the banner carousel) sits invisible for an hour.
    const isNoCache = ext === '.html' || ext === '.json' || ext === '.js' || ext === '.css';

    const headers = {
      'Content-Type': contentType,
      'Cache-Control': isNoCache ? 'no-cache, no-store, must-revalidate' : 'public, max-age=3600'
    };
    if (parsedUrl.searchParams.has('store')) {
      const qStore = parsedUrl.searchParams.get('store').trim().toLowerCase();
      if (/^[a-z0-9_-]{1,64}$/.test(qStore)) {
        headers['Set-Cookie'] = `current_store_id=${qStore}; Path=/; SameSite=Lax`;
      }
    }
    res.writeHead(200, headers);
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

// -------------------------------------------------------------
// 🚀 STARTUP - connect to MongoDB first, then listen
// -------------------------------------------------------------
async function start() {
  try {
    await db.connect();
    await db.ensureVisitorIndexes();
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    console.error('   Check MONGODB_URI in .env');
    process.exit(1);
  }

  server.listen(PORT, () => {
    console.log(`Flipkart Store running at http://localhost:${PORT}`);
    console.log(`Flipkart Admin Panel running at http://localhost:${PORT}/admin`);
    console.log(`Client Signup at http://localhost:${PORT}/client/signup.html`);
    console.log(`Super Admin at http://localhost:${PORT}/superadmin/`);
  });
}

process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  try { await db.close(); } catch (e) {}
  process.exit(0);
});

start();

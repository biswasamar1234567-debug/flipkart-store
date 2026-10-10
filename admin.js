// ==========================================================================
// STORE ADMIN PORTAL - FULL CONTROLLER
// 100% Professional English, Cloudinary Integration, Matches Screenshots 2 & 3
// ==========================================================================

const API_BASE = '/api/admin';
let currentProducts = [];
let reorderProductsList = [];
let uploadedImages = []; // Array of { url: string, public_id: string }
let editingProductId = null;
let productToDelete = null;
let ipPollingInterval = null;

let cloudinaryConfig = {
  cloudName: 'sricov3c',
  uploadPreset: 'flipon',
  apiKey: '351953765475734',
  apiSecret: 'TqZ3PqbweZPFG1JdVYWgILNW_1g'
};

// --------------------------------------------------------------------------
// 1. Toast Notification Utility
// --------------------------------------------------------------------------
function showToast(message, type = 'success') {
  const toast = document.getElementById('masterToast');
  if (!toast) return;
  toast.innerHTML = `<i class="bi bi-${type === 'success' ? 'check2-circle' : (type === 'error' ? 'exclamation-octagon-fill' : 'info-circle-fill')}"></i> <span>${message}</span>`;
  toast.className = `visible ${type}`;
  setTimeout(() => {
    toast.className = '';
  }, 3500);
}

// Helper: Escape HTML attributes safely
function escAttr(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// --------------------------------------------------------------------------
// 2. Authentication & Isolation (Screenshot 2)
// --------------------------------------------------------------------------
function getToken() {
  const m = document.cookie.match(/(?:^|;\s*)store_admin_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

function setToken(token) {
  document.cookie = 'store_admin_token=' + encodeURIComponent(token) + '; path=/; max-age=86400; SameSite=Lax';
}

function removeToken() {
  document.cookie = 'store_admin_token=; path=/; max-age=0';
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`
  };
}

function showLoginScreen() {
  const loginScreen = document.getElementById('loginScreen');
  const adminApp = document.getElementById('adminApp');
  if (loginScreen) {
    loginScreen.classList.remove('hidden');
    loginScreen.style.display = 'flex';
  }
  if (adminApp) {
    adminApp.classList.remove('authenticated');
    adminApp.style.display = 'none';
  }
  if (ipPollingInterval) {
    clearInterval(ipPollingInterval);
    ipPollingInterval = null;
  }
}

function hideLoginScreen() {
  const loginScreen = document.getElementById('loginScreen');
  const adminApp = document.getElementById('adminApp');
  if (loginScreen) {
    loginScreen.classList.add('hidden');
    loginScreen.style.display = 'none';
  }
  if (adminApp) {
    adminApp.classList.add('authenticated');
    adminApp.style.display = 'block';
  }
}

async function checkAuth() {
  const token = getToken();
  if (!token) {
    showLoginScreen();
    return false;
  }

  try {
    const res = await fetch(`${API_BASE}/check-auth`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      hideLoginScreen();
      initAdminPanel();
      return true;
    } else {
      removeToken();
      showLoginScreen();
      return false;
    }
  } catch (e) {
    showLoginScreen();
    return false;
  }
}

async function handlePortalLogin(e) {
  e.preventDefault();
  const pwdInput = document.getElementById('portalPassword');
  const errorBox = document.getElementById('loginError');
  const btn = document.getElementById('portalLoginBtn');
  const password = (pwdInput.value || '').trim();

  if (!password) {
    errorBox.textContent = 'Please enter your admin password.';
    errorBox.classList.remove('hidden');
    return;
  }

  errorBox.classList.add('hidden');
  btn.disabled = true;
  btn.innerHTML = `<span class="inline-block animate-spin mr-2">⟳</span> Verifying...`;

  try {
    const urlStore = new URLSearchParams(window.location.search).get('store') || '';
    const res = await fetch(`${API_BASE}/login${urlStore ? '?store=' + encodeURIComponent(urlStore) : ''}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(urlStore ? { 'X-Store-Id': urlStore } : {})
      },
      body: JSON.stringify({ password, storeSlug: urlStore })
    });

    const data = await res.json();
    if (res.ok && data.success && data.token) {
      setToken(data.token);
      if (data.user && data.user.storeSlug) {
        document.cookie = 'current_store_id=' + encodeURIComponent(data.user.storeSlug) + '; path=/; max-age=86400; SameSite=Lax';
      }
      hideLoginScreen();
      showToast('Welcome back, Admin! Session authenticated.');
      pwdInput.value = '';
      initAdminPanel();
    } else {
      errorBox.textContent = data.error || 'Invalid admin password. Please try again.';
      errorBox.classList.remove('hidden');
    }
  } catch (err) {
    errorBox.textContent = 'Server connection error. Please ensure backend is running.';
    errorBox.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Login';
  }
}

function handleLogout() {
  removeToken();
  showLoginScreen();
  showToast('You have been logged out securely.', 'info');
}

// --------------------------------------------------------------------------
// 3. Navigation & Tab Switching (Screenshot 3)
// --------------------------------------------------------------------------
const SECTION_TITLES = {
  'dashboard': 'Dashboard',
  'ip-tracker': 'Real-Time IP Tracker',
  'products': 'Products',
  'bulk-price': 'Bulk Price Scaler',
  'quick-reorder': 'Quick Product Reorder',
  'categories': 'Categories',
  'banners': 'Banners',
  'payment-settings': 'Payment Settings',
  'settings': 'Settings & Password',
  'support': 'P2P Help & Support'
};

function switchTab(tabId) {
  // Update sidebar buttons
  document.querySelectorAll('.menu-card-btn[data-tab]').forEach(btn => {
    if (btn.dataset.tab === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update topbar title
  const titleEl = document.getElementById('topbarSectionTitle');
  if (titleEl && SECTION_TITLES[tabId]) {
    titleEl.textContent = SECTION_TITLES[tabId];
  }

  // Update tab panels
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.remove('active');
  });

  const activePanel = document.getElementById(`tab-${tabId}`);
  if (activePanel) {
    activePanel.classList.add('active');
  }

  // Close mobile drawer
  closeMobileDrawer();

  // Load section-specific data
  if (tabId === 'dashboard') {
    fetchStats();
    fetchRecentProducts();
  } else if (tabId === 'ip-tracker') {
    fetchIpTracker();
  } else if (tabId === 'products') {
    fetchProducts();
  } else if (tabId === 'bulk-price') {
    // refresh bulk target view
  } else if (tabId === 'quick-reorder') {
    renderReorderList();
  } else if (tabId === 'categories') {
    fetchCategories();
  } else if (tabId === 'banners') {
    fetchBanners();
  } else if (tabId === 'payment-settings') {
    fetchPaymentSettings();
  } else if (tabId === 'settings') {
    fetchCloudinaryConfig();
    fetchClientSiteMode();
  } else if (tabId === 'support') {
    fetchSupportTickets();
  }
}

function openMobileDrawer() {
  const sidebar = document.getElementById('masterSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (sidebar) sidebar.classList.add('open');
  if (backdrop) backdrop.classList.add('active');
}

function closeMobileDrawer() {
  const sidebar = document.getElementById('masterSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (sidebar) sidebar.classList.remove('open');
  if (backdrop) backdrop.classList.remove('active');
}

// --------------------------------------------------------------------------
// 4. Panel Initialization & Stats
// --------------------------------------------------------------------------
function initAdminPanel() {
  fetchStats();
  fetchProducts();
  fetchIpTracker();
  fetchPaymentSettings();
  fetchCloudinaryConfig();
  fetchClientSiteMode();

  // Start polling IP tracker every 5 seconds
  if (!ipPollingInterval) {
    ipPollingInterval = setInterval(() => {
      const activeTab = document.querySelector('.menu-card-btn.active');
      if (activeTab && activeTab.dataset.tab === 'ip-tracker') {
        fetchIpTracker();
      }
    }, 5000);
  }
}

async function fetchStats() {
  try {
    const res = await fetch(`${API_BASE}/stats`, { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    if (data.success && data.stats) {
      const s = data.stats;
      document.getElementById('dashTotalProducts').textContent = s.totalProducts || 0;
      document.getElementById('dashActiveProducts').textContent = s.activeProducts || 0;
      document.getElementById('dashCloudPhotos').textContent = s.cloudinaryPhotos || 0;
      document.getElementById('dashActiveVisitors').textContent = s.activeVisitors || 1;

      // Badges
      const sidebarBadge = document.getElementById('sidebarProductCount');
      if (sidebarBadge) sidebarBadge.textContent = s.totalProducts || 0;

      const topbarCount = document.getElementById('topbarItemCount');
      if (topbarCount) topbarCount.textContent = `${s.totalProducts || 0} items`;

      const ipBadge = document.getElementById('sidebarLiveIpBadge');
      if (ipBadge) ipBadge.textContent = `LIVE ${s.activeVisitors || 1}`;
    }
  } catch (err) {
    console.error('Failed to fetch stats:', err);
  }
}

// --------------------------------------------------------------------------
// 5. Products Catalog (Screenshot 3 Right Side)
// --------------------------------------------------------------------------
async function fetchProducts() {
  try {
    const res = await fetch(`${API_BASE}/products`, { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    if (data.success) {
      currentProducts = data.products || [];
      reorderProductsList = [...currentProducts];
      renderProductsList(currentProducts);
      renderRecentProducts(currentProducts);
      renderReorderList();

      const countBadge = document.getElementById('sidebarProductCount');
      if (countBadge) countBadge.textContent = currentProducts.length;

      const topbarCount = document.getElementById('topbarItemCount');
      if (topbarCount) topbarCount.textContent = `${currentProducts.length} items`;
    }
  } catch (err) {
    console.error('Failed to fetch products:', err);
  }
}

function renderProductsList(products) {
  const container = document.getElementById('catalogListContainer');
  if (!container) return;

  if (products.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 bg-white rounded-2xl border border-gray-200">
        <i class="bi bi-box-seam text-4xl text-gray-300"></i>
        <p class="text-sm font-bold text-gray-700 mt-2">No products found</p>
        <p class="text-xs text-gray-400 mt-0.5">Try a different search query or add a new product</p>
      </div>
    `;
    return;
  }

  container.innerHTML = products.map((p, index) => {
    const discount = p.mrp > p.selling_price 
      ? Math.round(((p.mrp - p.selling_price) / p.mrp) * 100) 
      : 0;
    const thumb = p.img1 || (p.colors && p.colors[0] && p.colors[0].color_img) || 'https://via.placeholder.com/80';
    const isCloud = thumb.includes('cloudinary.com');

    return `
      <div class="product-row-card">
        <div class="product-row-left">
          <img src="${thumb}" alt="${p.name}" class="product-row-thumb" onerror="this.src='https://via.placeholder.com/80?text=No+Photo'" />
          <div class="product-row-info">
            <h4 class="product-row-title" title="${p.name}">${p.name}</h4>
            <div class="product-row-meta">
              <span class="product-row-price">₹${Number(p.selling_price).toLocaleString('en-IN')}</span>
              <span class="product-row-mrp">₹${Number(p.mrp).toLocaleString('en-IN')}</span>
              ${discount > 0 ? `<span class="product-row-discount">${discount}% off</span>` : ''}
              ${isCloud ? `<span class="text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200 px-1.5 py-0.5 rounded">Cloudinary</span>` : ''}
              ${p.hidden ? `<span class="text-[10px] font-bold bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded">Draft</span>` : ''}
            </div>
          </div>
        </div>

        <div class="product-row-actions">
          <button type="button" class="btn-icon-action" onclick="openProductModal('${p.id}')" title="Edit Product">
            <i class="bi bi-pencil"></i>
          </button>
          <button type="button" class="btn-icon-action delete" onclick="openDeleteModal('${p.id}')" title="Delete Product & Purge Cloud Photos">
            <i class="bi bi-trash3"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  const stats = document.getElementById('productsFilterStats');
  if (stats) stats.textContent = `Showing all ${products.length} products`;
}

function renderRecentProducts(products) {
  const container = document.getElementById('dashRecentProductsList');
  if (!container) return;
  const recent = products.slice(0, 5);

  container.innerHTML = recent.map(p => {
    const thumb = p.img1 || 'https://via.placeholder.com/60';
    return `
      <div class="flex items-center justify-between py-3 border-b border-gray-100 last:border-none">
        <div class="flex items-center gap-3">
          <img src="${thumb}" alt="${p.name}" class="w-11 h-11 object-contain rounded-lg border border-gray-100 p-1 bg-gray-50" />
          <div>
            <h5 class="text-xs font-bold text-gray-900 max-w-sm sm:max-w-md truncate">${p.name}</h5>
            <span class="text-xs font-extrabold text-blue-600">₹${Number(p.selling_price).toLocaleString('en-IN')}</span>
          </div>
        </div>
        <button onclick="openProductModal('${p.id}')" class="text-xs text-gray-500 hover:text-blue-600 font-semibold p-1.5">
          <i class="bi bi-pencil-square text-base"></i>
        </button>
      </div>
    `;
  }).join('');
}

// Filter / Search Catalog
function setupCatalogSearch() {
  const input = document.getElementById('catalogSearchInput');
  const catSelect = document.getElementById('catalogCategorySelect');

  function doFilter() {
    const q = (input ? input.value : '').toLowerCase().trim();
    const cat = catSelect ? catSelect.value : 'all';

    const filtered = currentProducts.filter(p => {
      const matchText = (p.name || '').toLowerCase().includes(q) || (p.id || '').toLowerCase().includes(q);
      const matchCat = cat === 'all' || (p.name || '').toLowerCase().includes(cat);
      return matchText && matchCat;
    });

    renderProductsList(filtered);
  }

  if (input) input.addEventListener('input', doFilter);
  if (catSelect) catSelect.addEventListener('change', doFilter);
}

// --------------------------------------------------------------------------
// 6. Add / Edit Product Modal, Cloudinary Direct Uploaders & AI Autofill
// Matches Screenshots 1, 2, 3, 4, 5
// --------------------------------------------------------------------------
let featureImageUrl = '';
let albumImagesList = [];
let dscImagesList = [];
let productVariantsList = [];
let productSizesList = [];

// Helper to upload a single File to Cloudinary
async function uploadSingleFileToCloudinary(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', cloudinaryConfig.uploadPreset || 'flipon');

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`, {
    method: 'POST',
    body: formData
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error('Cloudinary error: ' + errText);
  }

  const json = await res.json();
  return {
    url: json.secure_url || json.url,
    public_id: json.public_id
  };
}

// --------------------------------------------------------------------------
// AI Autofill from Flipkart Title Parser via Groq AI (Screenshot 1)
// --------------------------------------------------------------------------
async function parseAndAutofillFromFlipkart(title) {
  if (!title || !title.trim()) {
    showToast('Please paste a product title first.', 'error');
    return;
  }

  const raw = title.trim();
  const aiBtn = document.getElementById('aiGenerateBtn');
  const originalHtml = aiBtn ? aiBtn.innerHTML : '<span>✨ Generate</span>';

  if (aiBtn) {
    aiBtn.disabled = true;
    aiBtn.innerHTML = `<span class="inline-block animate-spin mr-1.5">⟳</span> <span>✨ Groq AI Generating...</span>`;
  }

  showToast('Connecting to Groq AI to generate specs, pricing & variants...', 'info');

  try {
    const res = await fetch(`${API_BASE}/ai-autofill`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ title: raw })
    });

    const data = await res.json();
    if (res.ok && data.success && data.product) {
      const p = data.product;

      // 1. Populate Titles & Brand
      if (p.title1) document.getElementById('prodTitle1').value = p.title1;
      if (p.title2) document.getElementById('prodTitle2').value = p.title2;
      if (p.brand) document.getElementById('prodBrand').value = p.brand;

      // 2. Category selection with exact match
      if (p.category) {
        const catSelect = document.getElementById('prodCategory');
        let matched = false;
        for (let i = 0; i < catSelect.options.length; i++) {
          if (catSelect.options[i].value.toLowerCase() === p.category.toLowerCase()) {
            catSelect.selectedIndex = i;
            matched = true;
            break;
          }
        }
        if (!matched) {
          if (/phone|mobile|smartphone/i.test(p.category)) catSelect.value = 'Mobiles';
          else if (/electronic|headphone|earbud|watch|audio/i.test(p.category)) catSelect.value = 'Electronics';
          else if (/appliance|tv|fridge/i.test(p.category)) catSelect.value = 'Appliances';
          else if (/fashion|cloth|shoe/i.test(p.category)) catSelect.value = 'Fashion';
          else if (/home|furniture/i.test(p.category)) catSelect.value = 'Home';
        }
      }

      // 3. Pricing, Stock & Ratings
      if (p.stock !== undefined) document.getElementById('prodStock').value = p.stock;
      if (p.mrp !== undefined) document.getElementById('prodMrp').value = p.mrp;
      if (p.selling_price !== undefined) document.getElementById('prodSellingPrice').value = p.selling_price;
      
      const calcDiscount = (p.mrp && p.selling_price && p.mrp > p.selling_price)
        ? Math.round(((p.mrp - p.selling_price) / p.mrp) * 100)
        : (p.discount || 99);
      document.getElementById('prodDiscount').value = calcDiscount;

      if (p.rating !== undefined) document.getElementById('prodRating').value = p.rating;
      if (p.reviews_count !== undefined) document.getElementById('prodRatingsCount').value = p.reviews_count;

      // 4. Default Variant Selections
      if (p.default_color) document.getElementById('defaultColorInput').value = p.default_color;
      if (p.default_ram) document.getElementById('defaultRamInput').value = p.default_ram;
      if (p.default_storage) document.getElementById('defaultStorageInput').value = p.default_storage;
      if (p.delivery_text) document.getElementById('deliveryTextSelect').value = p.delivery_text;

      // 5. Description
      if (p.description) document.getElementById('prodDescription').value = p.description;

      // 6. About Section (Key Features Bullet Points)
      if (Array.isArray(p.highlights) && p.highlights.length > 0) {
        document.getElementById('prodAboutFeatures').value = p.highlights
          .map(h => (h.trim().startsWith('•') ? h.trim() : `• ${h.trim()}`))
          .join('\n');
      }

      // 7. Specifications JSON
      if (p.specifications) {
        document.getElementById('prodSpecifications').value = typeof p.specifications === 'string'
          ? p.specifications
          : JSON.stringify(p.specifications, null, 2);
      }

      // 8. Variants
      if (Array.isArray(p.variants) && p.variants.length > 0) {
        productVariantsList = p.variants.map((v, i) => ({
          id: 'v_' + (i + 1) + '_' + Date.now(),
          color_name: v.color_name || `Color ${i + 1}`,
          color_hex: v.color_hex || '#ff7849',
          color_img: '',
          images: [],
          ram: v.ram || p.default_ram || '12 GB',
          storage: v.storage || p.default_storage || '256 GB',
          selling_price: v.selling_price || p.selling_price || 999,
          mrp: v.mrp || p.mrp || 189900
        }));
      } else {
        productVariantsList = [
          {
            id: 'v_1',
            color_name: p.default_color || 'Default',
            color_hex: '#ff7849',
            color_img: '',
            images: [],
            ram: p.default_ram || '12 GB',
            storage: p.default_storage || '256 GB',
            selling_price: p.selling_price || 999,
            mrp: p.mrp || 189900
          }
        ];
      }
      renderColorVariantsUI();

      showToast('✨ Groq AI generated all product details, specs, and variants in real time!');
      if (aiBtn) {
        aiBtn.disabled = false;
        aiBtn.innerHTML = originalHtml;
      }
      return;
    } else {
      showToast(data.error || 'Groq AI failed, using local parser...', 'warning');
    }
  } catch (err) {
    console.warn('Groq AI API error, falling back to local catalog parser:', err);
    showToast('Network error, using fallback catalog parser...', 'warning');
  } finally {
    if (aiBtn) {
      aiBtn.disabled = false;
      aiBtn.innerHTML = originalHtml;
    }
  }

  // Fallback offline parser if network or API error occurs
  fallbackLocalParser(raw);
}

function fallbackLocalParser(raw) {
  const lower = raw.toLowerCase();

  // 1. Detect Brand
  let brand = 'Official Store';
  if (/apple|iphone|ipad|macbook|airpod/i.test(raw)) brand = 'Apple';
  else if (/samsung|galaxy/i.test(raw)) brand = 'Samsung';
  else if (/oneplus|nord/i.test(raw)) brand = 'OnePlus';
  else if (/google|pixel/i.test(raw)) brand = 'Google Pixel';
  else if (/poco/i.test(raw)) brand = 'POCO';
  else if (/xiaomi|redmi|mi\b/i.test(raw)) brand = 'Xiaomi';
  else if (/realme|narzo/i.test(raw)) brand = 'realme';
  else if (/iqoo/i.test(raw)) brand = 'iQOO';
  else if (/vivo/i.test(raw)) brand = 'vivo';
  else if (/oppo|reno|find\s*x/i.test(raw)) brand = 'OPPO';
  else if (/motorola|moto\b|razr|edge/i.test(raw)) brand = 'Motorola';
  else if (/nothing|cmf/i.test(raw)) brand = 'Nothing';
  else if (/sony|xperia/i.test(raw)) brand = 'Sony';
  else if (/asus|rog/i.test(raw)) brand = 'ASUS';
  else if (/infinix/i.test(raw)) brand = 'Infinix';
  else if (/tecno/i.test(raw)) brand = 'TECNO';
  else if (/honor/i.test(raw)) brand = 'HONOR';
  else if (/boat|airdopes|rockerz|stone/i.test(raw)) brand = 'boAt';
  else if (/noise|colorfit/i.test(raw)) brand = 'Noise';
  else if (/fire-boltt|fireboltt/i.test(raw)) brand = 'Fire-Boltt';
  else if (/safari/i.test(raw)) brand = 'Safari';

  // 2. Detect Category
  let category = 'Mobiles';
  if (/smartwatch|watch|speaker|headphone|earbud|airpod|neckband|tws|bluetooth/i.test(lower)) {
    category = 'Electronics';
  } else if (/tv|television|refrigerator|fridge|washing machine|ac|air conditioner/i.test(lower)) {
    category = 'Appliances';
  } else if (/shirt|shoes|tshirt|jeans|dress|bag/i.test(lower)) {
    category = 'Fashion';
  } else if (/chair|sofa|bed|table|desk/i.test(lower)) {
    category = 'Home';
  }

  // 3. Detect Storage & RAM
  const storageMatch = raw.match(/(1\s*TB|2\s*TB|512\s*GB|256\s*GB|128\s*GB|64\s*GB)/i);
  const detectedStorage = storageMatch ? storageMatch[1].toUpperCase().replace(/\s+/g, ' ') : (brand === 'Apple' ? '256 GB' : '128 GB');

  const ramMatch = raw.match(/(16\s*GB|12\s*GB|8\s*GB|6\s*GB|4\s*GB)\s*(?:RAM)?/i);
  const detectedRam = ramMatch ? ramMatch[1].toUpperCase().replace(/\s+/g, ' ') : (brand === 'Apple' ? '12 GB' : '8 GB');

  // 4. Detect Color
  const colorMatch = raw.match(/(Cosmic Orange|Desert Titanium|Black Titanium|Natural Titanium|White Titanium|Titanium Gray|Phantom Black|Amber Yellow|Onyx Black|Marble Gray|Silky Black|Emerald Green|Glacier White|Sunset Peach|Ocean Blue|Deep Blue|Obsidian|Porcelain|Bay Blue)/i);
  const detectedColor = colorMatch ? colorMatch[1] : (brand === 'Apple' ? 'Cosmic Orange' : (brand === 'Samsung' ? 'Titanium Gray' : 'Default Black'));

  // 5. Clean Titles
  let shortTitle = raw
    .replace(/\s*\([^)]*(?:RAM|ROM|Color|Black|Titanium|Orange|Gray|Blue)[^)]*\)/gi, '')
    .replace(/\s*-\s*.*$/, '')
    .trim();
  if (detectedStorage && !shortTitle.includes(detectedStorage)) {
    shortTitle += ` (${detectedStorage})`;
  }

  const fullTitle = `${shortTitle} (${detectedColor}, ${detectedStorage}) (${detectedRam} RAM)`;

  let mrp = 189900;
  let sellingPrice = 999;
  if (brand === 'Apple' && /17/i.test(raw)) {
    mrp = detectedStorage.includes('1 TB') ? 189900 : 147900;
    sellingPrice = 999;
  } else if (brand === 'Samsung' && /s24|ultra/i.test(raw)) {
    mrp = 144999;
    sellingPrice = 999;
  } else if (category === 'Electronics') {
    mrp = 4490;
    sellingPrice = 199;
  }

  const discount = Math.round(((mrp - sellingPrice) / mrp) * 100);

  document.getElementById('prodTitle1').value = shortTitle;
  document.getElementById('prodTitle2').value = fullTitle;
  document.getElementById('prodBrand').value = brand;
  document.getElementById('prodCategory').value = category;
  document.getElementById('prodStock').value = 50;
  document.getElementById('prodMrp').value = mrp;
  document.getElementById('prodSellingPrice').value = sellingPrice;
  document.getElementById('prodDiscount').value = discount;
  document.getElementById('prodRating').value = '4.7';
  document.getElementById('prodRatingsCount').value = '3410';
  document.getElementById('deliveryTextSelect').value = 'Free Delivery in Two Days';

  document.getElementById('prodDescription').value = 
    `Experience flagship excellence with ${shortTitle}. Engineered with aerospace-grade materials, groundbreaking multi-core performance, and all-day intelligent battery efficiency. Features an ultra-responsive display with peak HDR brightness, immersive spatial audio, and cinematic camera optics.`;

  if (category === 'Mobiles') {
    document.getElementById('prodAboutFeatures').value = 
      `• 5G Ready Smartphone with Ultra-Fast Processing\n• Advanced 48MP Pro Triple Camera System with 5x Optical Zoom\n• Dynamic 120Hz ProMotion HDR OLED Display\n• All-Day Battery Life with Fast Charge Support\n• Ceramic Shield & Aerospace-Grade Enclosure`;
  } else {
    document.getElementById('prodAboutFeatures').value = 
      `• Signature High-Definition Immersive Sound\n• Ultra Low-Latency Wireless Connectivity\n• IPX4 Water & Sweat Resistant Enclosure\n• Extended Battery Playtime with Rapid Charging`;
  }

  const specsObj = {
    "General": {
      "Model Name": shortTitle.replace(brand, '').trim(),
      "Color": detectedColor,
      "Browse Type": category,
      "SIM Type": "Dual SIM (Nano + eSIM)"
    },
    "Display Features": {
      "Display Size": "17.53 cm (6.9 inch)",
      "Resolution": "2868 x 1320 Pixels",
      "Display Type": "Super Retina XDR OLED 120Hz"
    },
    "Processor & OS": {
      "Operating System": brand === 'Apple' ? 'iOS 19' : 'Android 15',
      "Processor Type": brand === 'Apple' ? 'A19 Pro Bionic Chip' : 'Snapdragon 8 Gen 3'
    },
    "Memory & Storage": {
      "Internal Storage": detectedStorage,
      "RAM": detectedRam
    },
    "Camera": {
      "Primary Camera": "48MP + 48MP + 48MP Triple Lens",
      "Front Camera": "12MP TrueDepth"
    }
  };
  document.getElementById('prodSpecifications').value = JSON.stringify(specsObj, null, 2);

  let variants = [];
  if (brand === 'Apple') {
    variants = [
      { id: 'v_1', color_name: 'Cosmic Orange', color_hex: '#ff7849', color_img: '', images: [], ram: detectedRam, storage: detectedStorage, selling_price: sellingPrice, mrp: mrp },
      { id: 'v_2', color_name: 'Desert Titanium', color_hex: '#c2b69d', color_img: '', images: [], ram: detectedRam, storage: detectedStorage, selling_price: sellingPrice, mrp: mrp },
      { id: 'v_3', color_name: 'Black Titanium', color_hex: '#2b2b2b', color_img: '', images: [], ram: detectedRam, storage: detectedStorage, selling_price: sellingPrice, mrp: mrp }
    ];
  } else if (brand === 'Samsung') {
    variants = [
      { id: 'v_1', color_name: 'Titanium Gray', color_hex: '#707372', color_img: '', images: [], ram: detectedRam, storage: detectedStorage, selling_price: sellingPrice, mrp: mrp },
      { id: 'v_2', color_name: 'Titanium Black', color_hex: '#222222', color_img: '', images: [], ram: detectedRam, storage: detectedStorage, selling_price: sellingPrice, mrp: mrp },
      { id: 'v_3', color_name: 'Titanium Yellow', color_hex: '#ebd79b', color_img: '', images: [], ram: detectedRam, storage: detectedStorage, selling_price: sellingPrice, mrp: mrp }
    ];
  } else {
    variants = [
      { id: 'v_1', color_name: detectedColor, color_hex: '#1e293b', color_img: '', images: [], ram: detectedRam, storage: detectedStorage, selling_price: sellingPrice, mrp: mrp }
    ];
  }

  productVariantsList = variants;
  renderColorVariantsUI();

  document.getElementById('defaultColorInput').value = detectedColor;
  document.getElementById('defaultRamInput').value = detectedRam;
  document.getElementById('defaultStorageInput').value = detectedStorage;

  showToast('✨ AI Autofill successfully generated product details!');
}

// --------------------------------------------------------------------------
// Feature Image, Album Gallery & DSC Banners Renderers
// --------------------------------------------------------------------------
function renderFeatureImagePreview() {
  const box = document.getElementById('featureImagePreviewBox');
  const fileName = document.getElementById('featureImageFileName');
  const urlInput = document.getElementById('featureImageUrl');

  if (featureImageUrl) {
    urlInput.value = featureImageUrl;
    if (fileName) fileName.textContent = featureImageUrl.split('/').pop() || 'image.jpg';
    if (box) {
      box.classList.remove('hidden');
      box.innerHTML = `
        <div class="preview-thumb-box">
          <img src="${featureImageUrl}" alt="Feature Cover" />
          <button type="button" class="preview-remove-btn" onclick="clearFeatureImage()">✕</button>
        </div>
      `;
    }
  } else {
    if (box) {
      box.classList.add('hidden');
      box.innerHTML = '';
    }
    if (fileName) fileName.textContent = 'No file chosen';
  }
}

function clearFeatureImage() {
  featureImageUrl = '';
  document.getElementById('featureImageUrl').value = '';
  renderFeatureImagePreview();
}

function renderAlbumImagesPreview() {
  const box = document.getElementById('albumImagesPreviewBox');
  const fileName = document.getElementById('albumImagesFileName');
  if (!box) return;

  if (fileName) {
    fileName.textContent = albumImagesList.length > 0 ? `${albumImagesList.length} files selected` : 'No file chosen';
  }

  box.innerHTML = albumImagesList.map((url, idx) => `
    <div class="preview-thumb-box">
      <img src="${url}" alt="Album ${idx + 1}" />
      <button type="button" class="preview-remove-btn" onclick="removeAlbumImage(${idx})">✕</button>
    </div>
  `).join('');
}

function removeAlbumImage(idx) {
  albumImagesList.splice(idx, 1);
  renderAlbumImagesPreview();
}

function renderDscImagesPreview() {
  const box = document.getElementById('dscImagesPreviewBox');
  const fileName = document.getElementById('dscImageFileName');
  if (!box) return;

  if (fileName) {
    fileName.textContent = dscImagesList.length > 0 ? `${dscImagesList.length} files selected` : 'No file chosen';
  }

  box.innerHTML = dscImagesList.map((url, idx) => `
    <div class="preview-thumb-box">
      <img src="${url}" alt="DSC Banner ${idx + 1}" />
      <button type="button" class="preview-remove-btn" onclick="removeDscImage(${idx})">✕</button>
    </div>
  `).join('');
}

function removeDscImage(idx) {
  dscImagesList.splice(idx, 1);
  renderDscImagesPreview();
}

// --------------------------------------------------------------------------
// Color-Linked Variants UI (Screenshot 3 & 4)
// --------------------------------------------------------------------------
function renderColorVariantsUI() {
  const container = document.getElementById('colorVariantsList');
  const emptyCard = document.getElementById('variantsEmptyCard');
  const defaultVarSelect = document.getElementById('defaultVariantSelect');
  const defaultColSelect = document.getElementById('defaultColorSelect');

  if (!container) return;

  if (productVariantsList.length === 0) {
    container.innerHTML = `
      <div class="variants-empty-card" id="variantsEmptyCard">
        No color-specific variants added yet. Click "<strong>+ Add Color Variant</strong>" above to link specific photos, RAM, Storage, and Prices to each color!
      </div>
    `;
    if (defaultVarSelect) {
      defaultVarSelect.innerHTML = `<option value="">▼ No color variants added above yet (Add a color variant)</option>`;
    }
    if (defaultColSelect) {
      defaultColSelect.innerHTML = `<option value="">▼ Select Color (Auto-fills RAM & Storage)...</option>`;
    }
    return;
  }

  container.innerHTML = productVariantsList.map((v, i) => `
    <div class="variant-item-card" data-variant-id="${v.id || i}">
      <div class="flex items-center justify-between border-b border-gray-200 pb-2">
        <div class="flex items-center gap-2">
          <input 
            type="color" 
            value="${v.color_hex || '#ff7849'}" 
            class="w-6 h-6 rounded cursor-pointer border border-gray-300"
            onchange="updateVariantField(${i}, 'color_hex', this.value)"
          />
          <input 
            type="text" 
            value="${v.color_name || 'Variant ' + (i + 1)}" 
            placeholder="Color Name" 
            class="text-xs font-bold text-gray-900 border-none bg-transparent outline-none focus:bg-white focus:px-1.5 focus:py-0.5 focus:rounded"
            onchange="updateVariantField(${i}, 'color_name', this.value)"
          />
        </div>
        <button type="button" onclick="removeColorVariant(${i})" class="text-xs text-red-600 hover:text-red-700 font-bold p-1">
          <i class="bi bi-trash3"></i> Remove
        </button>
      </div>

      <div class="grid grid-cols-2 gap-2 text-xs">
        <div>
          <label class="text-[10px] font-bold text-gray-500 block mb-0.5">RAM Options</label>
          <input 
            type="text" 
            value="${v.ram || ''}" 
            placeholder="e.g. 12 GB, 16 GB" 
            class="w-full p-1.5 border border-gray-200 rounded text-xs"
            onchange="updateVariantField(${i}, 'ram', this.value)"
          />
        </div>
        <div>
          <label class="text-[10px] font-bold text-gray-500 block mb-0.5">Storage Options</label>
          <input 
            type="text" 
            value="${v.storage || ''}" 
            placeholder="e.g. 256 GB, 512 GB" 
            class="w-full p-1.5 border border-gray-200 rounded text-xs"
            onchange="updateVariantField(${i}, 'storage', this.value)"
          />
        </div>
      </div>

      <div class="flex items-center gap-2 pt-1">
        <input 
          type="text" 
          value="${v.color_img || ''}" 
          placeholder="Color Feature Photo URL" 
          class="flex-1 p-1.5 border border-gray-200 rounded text-[11px]"
          onchange="updateVariantField(${i}, 'color_img', this.value)"
        />
        <label class="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-[11px] font-bold cursor-pointer">
          Upload
          <input type="file" accept="image/*" class="hidden" onchange="uploadVariantPhoto(${i}, this.files[0])" />
        </label>
      </div>
    </div>
  `).join('');

  // Update Default Selection Dropdowns
  if (defaultVarSelect) {
    defaultVarSelect.innerHTML = productVariantsList.map(v => `
      <option value="${v.color_name}">${v.color_name} (${v.storage || 'Standard'} / ${v.ram || 'Standard'})</option>
    `).join('');
  }

  if (defaultColSelect) {
    defaultColSelect.innerHTML = productVariantsList.map(v => `
      <option value="${v.color_name}">${v.color_name}</option>
    `).join('');
  }
}

function updateVariantField(idx, field, value) {
  if (productVariantsList[idx]) {
    productVariantsList[idx][field] = value;
  }
}

async function uploadVariantPhoto(idx, file) {
  if (!file) return;
  showToast(`Uploading photo for variant ${idx + 1}...`, 'info');
  try {
    const res = await uploadSingleFileToCloudinary(file);
    if (productVariantsList[idx]) {
      productVariantsList[idx].color_img = res.url;
      renderColorVariantsUI();
      showToast('Variant photo uploaded to Cloudinary!');
    }
  } catch (e) {
    showToast('Failed to upload variant photo: ' + e.message, 'error');
  }
}

function removeColorVariant(idx) {
  productVariantsList.splice(idx, 1);
  renderColorVariantsUI();
}

function addNewColorVariant() {
  const newIdx = productVariantsList.length + 1;
  productVariantsList.push({
    id: 'v_' + Date.now(),
    color_name: `Color Variant ${newIdx}`,
    color_hex: '#3b82f6',
    color_img: '',
    images: [],
    ram: document.getElementById('defaultRamInput').value || '12 GB',
    storage: document.getElementById('defaultStorageInput').value || '256 GB',
    selling_price: Number(document.getElementById('prodSellingPrice').value) || 999,
    mrp: Number(document.getElementById('prodMrp').value) || 189900
  });
  renderColorVariantsUI();
  showToast('Color variant added!');
}

// --------------------------------------------------------------------------
// 👟 Multi-Size & Shoe/Clothing Size Management
// --------------------------------------------------------------------------
function syncSizesCheckbox(checked) {
  const chk1 = document.getElementById('enableProductSizes');
  const chk2 = document.getElementById('prodShowSizes');
  if (chk1) chk1.checked = checked;
  if (chk2) chk2.checked = checked;

  if (checked && productSizesList.length === 0) {
    applyShoeSizePreset('uk_shoes_standard');
  }
}

function renderSizesUI() {
  const container = document.getElementById('sizesListContainer');
  const defaultSelect = document.getElementById('defaultSizeSelect');
  const customSizeInput = document.getElementById('customSizeInput');
  const quickInput = document.getElementById('quickSizesCommaInput');
  const baseSp = Number(document.getElementById('prodSellingPrice')?.value) || 999;
  const baseMrp = Number(document.getElementById('prodMrp')?.value) || 189900;

  if (!container) return;

  if (productSizesList.length === 0) {
    container.innerHTML = `
      <div class="text-[11px] text-gray-400 italic p-2 bg-white rounded-lg border border-dashed border-gray-200 text-center" id="sizesEmptyNotice">
        No sizes added yet. Click a preset above or "+ Add Size".
      </div>
    `;
    if (defaultSelect) {
      defaultSelect.innerHTML = `<option value="">(Auto: First Size)</option>`;
    }
    if (customSizeInput) customSizeInput.value = '';
    return;
  }

  container.innerHTML = productSizesList.map((item) => `
    <div class="flex items-center gap-2 p-2 bg-white rounded-lg border border-gray-200 shadow-xs" data-size-id="${item.id}">
      <div class="flex-1">
        <label class="text-[10px] text-gray-500 font-bold block mb-0.5">Size Name</label>
        <input 
          type="text" 
          class="w-full px-2 py-1 border border-gray-300 rounded text-xs font-bold text-gray-900 bg-gray-50 focus:bg-white" 
          value="${item.size || ''}" 
          placeholder="e.g. 7 or UK 7" 
          oninput="updateSizeItem('${item.id}', 'size', this.value)"
        />
      </div>
      <div class="w-24">
        <label class="text-[10px] text-gray-500 font-bold block mb-0.5">Price (₹)</label>
        <input 
          type="number" 
          class="w-full px-2 py-1 border border-blue-200 rounded text-xs font-bold text-blue-700 bg-blue-50/40 focus:bg-white" 
          value="${item.selling_price !== undefined && item.selling_price !== null ? item.selling_price : ''}" 
          placeholder="${baseSp}" 
          oninput="updateSizeItem('${item.id}', 'selling_price', this.value)"
        />
      </div>
      <div class="w-24">
        <label class="text-[10px] text-gray-500 font-bold block mb-0.5">MRP (₹)</label>
        <input 
          type="number" 
          class="w-full px-2 py-1 border border-gray-200 rounded text-xs font-medium text-gray-600 bg-gray-50 focus:bg-white" 
          value="${item.mrp !== undefined && item.mrp !== null ? item.mrp : ''}" 
          placeholder="${baseMrp}" 
          oninput="updateSizeItem('${item.id}', 'mrp', this.value)"
        />
      </div>
      <div class="pt-3.5">
        <button 
          type="button" 
          onclick="removeSizeRow('${item.id}')" 
          class="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition" 
          title="Remove Size"
        >
          <i class="bi bi-trash"></i>
        </button>
      </div>
    </div>
  `).join('');

  if (defaultSelect) {
    const curVal = defaultSelect.value;
    defaultSelect.innerHTML = `<option value="">(Auto: First Size)</option>` + 
      productSizesList
        .filter(s => s.size && s.size.trim())
        .map(s => `<option value="${s.size.trim()}" ${s.size.trim() === curVal ? 'selected' : ''}>${s.size.trim()}</option>`)
        .join('');
  }

  const allSizeNames = productSizesList.map(s => s.size).filter(Boolean);
  if (customSizeInput) customSizeInput.value = allSizeNames.join(', ');
  if (quickInput && !quickInput.matches(':focus')) {
    quickInput.value = allSizeNames.join(', ');
  }
}

function updateSizeItem(id, field, value) {
  const item = productSizesList.find(s => s.id === id);
  if (!item) return;
  if (field === 'selling_price' || field === 'mrp') {
    item[field] = value === '' ? '' : Number(value);
  } else {
    item[field] = value;
  }
  const customSizeInput = document.getElementById('customSizeInput');
  if (customSizeInput) customSizeInput.value = productSizesList.map(s => s.size).filter(Boolean).join(', ');
}

function addNewSizeRow() {
  const baseSp = Number(document.getElementById('prodSellingPrice')?.value) || 999;
  const baseMrp = Number(document.getElementById('prodMrp')?.value) || 189900;
  productSizesList.push({
    id: 'sz_' + Math.random().toString(36).slice(2, 7),
    size: '',
    selling_price: baseSp,
    mrp: baseMrp
  });
  syncSizesCheckbox(true);
  renderSizesUI();
}

function removeSizeRow(id) {
  productSizesList = productSizesList.filter(s => s.id !== id);
  renderSizesUI();
}

function clearAllSizes() {
  productSizesList = [];
  renderSizesUI();
}

function applyShoeSizePreset(type) {
  const baseSp = Number(document.getElementById('prodSellingPrice')?.value) || 999;
  const baseMrp = Number(document.getElementById('prodMrp')?.value) || 189900;
  let presetSizes = [];

  if (type === 'uk_shoes_standard') {
    presetSizes = ['UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10'];
  } else if (type === 'uk_shoes_extended') {
    presetSizes = ['UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11'];
  } else if (type === 'clothing') {
    presetSizes = ['S', 'M', 'L', 'XL', 'XXL'];
  }

  productSizesList = presetSizes.map(sz => ({
    id: 'sz_' + Math.random().toString(36).slice(2, 7),
    size: sz,
    selling_price: baseSp,
    mrp: baseMrp
  }));

  syncSizesCheckbox(true);
  renderSizesUI();
  showToast('👟 Sizes applied: ' + presetSizes.join(', '));
}

function syncCommaSizes() {
  const input = document.getElementById('quickSizesCommaInput');
  if (!input) return;
  const raw = input.value.trim();
  if (!raw) {
    productSizesList = [];
    renderSizesUI();
    return;
  }

  const baseSp = Number(document.getElementById('prodSellingPrice')?.value) || 999;
  const baseMrp = Number(document.getElementById('prodMrp')?.value) || 189900;
  const parts = raw.split(/[,/|]+/).map(s => s.trim()).filter(Boolean);

  const existingMap = new Map();
  productSizesList.forEach(s => {
    if (s.size) existingMap.set(s.size.toLowerCase(), s);
  });

  productSizesList = parts.map(sz => {
    const existing = existingMap.get(sz.toLowerCase());
    return {
      id: existing ? existing.id : ('sz_' + Math.random().toString(36).slice(2, 7)),
      size: sz,
      selling_price: existing && existing.selling_price !== undefined ? existing.selling_price : baseSp,
      mrp: existing && existing.mrp !== undefined ? existing.mrp : baseMrp
    };
  });

  syncSizesCheckbox(true);
  renderSizesUI();
  showToast('Sizes updated!');
}

// --------------------------------------------------------------------------
// Open & Close Product Modal
// --------------------------------------------------------------------------
function openProductModal(productId = null) {
  editingProductId = productId;
  featureImageUrl = '';
  albumImagesList = [];
  dscImagesList = [];
  productVariantsList = [];
  productSizesList = [];

  const modal = document.getElementById('productModal');
  const title = document.getElementById('productModalTitle');
  const form = document.getElementById('productEditForm');

  form.reset();
  document.getElementById('prodHiddenId').value = '';

  if (productId) {
    title.textContent = 'Edit Product Details';
    const prod = currentProducts.find(p => String(p.id).toLowerCase() === String(productId).toLowerCase());
    if (prod) {
      document.getElementById('prodHiddenId').value = prod.id || '';
      document.getElementById('prodTitle1').value = prod.title1 || prod.name || '';
      document.getElementById('prodTitle2').value = prod.title2 || prod.name || '';
      document.getElementById('prodCategory').value = prod.category || 'Mobiles';
      document.getElementById('prodBrand').value = prod.brand || 'Apple';
      document.getElementById('prodStock').value = prod.stock !== undefined ? prod.stock : 50;
      document.getElementById('prodMrp').value = prod.mrp || 189900;
      document.getElementById('prodSellingPrice').value = prod.selling_price || 999;
      document.getElementById('prodDiscount').value = prod.discount !== undefined ? prod.discount : 99;
      document.getElementById('prodRating').value = prod.rating || 4.7;
      document.getElementById('prodRatingsCount').value = prod.reviews_count || 3410;

      // Delivery Text & Descriptions
      if (prod.delivery_text) document.getElementById('deliveryTextSelect').value = prod.delivery_text;
      document.getElementById('prodDescription').value = prod.description || '';

      if (Array.isArray(prod.highlights) && prod.highlights.length > 0) {
        document.getElementById('prodAboutFeatures').value = prod.highlights.map(h => h.startsWith('•') ? h : `• ${h}`).join('\n');
      }

      if (prod.specifications) {
        document.getElementById('prodSpecifications').value = typeof prod.specifications === 'string' ? prod.specifications : JSON.stringify(prod.specifications, null, 2);
      }

      // Checkboxes
      document.getElementById('prodActive').checked = prod.hidden !== true;
      document.getElementById('prodFeatured').checked = Boolean(prod.featured || prod.hot_deal);
      document.getElementById('prodShowVariants').checked = prod.show_variants !== false;

      // Sizes configuration load
      const hasSizes = Boolean(prod.show_sizes || prod.show_custom_size || (Array.isArray(prod.sizes) && prod.sizes.length > 0));
      if (document.getElementById('prodShowSizes')) document.getElementById('prodShowSizes').checked = hasSizes;
      if (document.getElementById('enableProductSizes')) document.getElementById('enableProductSizes').checked = hasSizes;

      productSizesList = [];
      if (Array.isArray(prod.sizes) && prod.sizes.length > 0) {
        productSizesList = prod.sizes.map(s => typeof s === 'object' ? ({
          id: s.id || ('sz_' + Math.random().toString(36).slice(2, 7)),
          size: s.size || s.name || '',
          selling_price: s.selling_price !== undefined ? s.selling_price : (prod.selling_price || 999),
          mrp: s.mrp !== undefined ? s.mrp : (prod.mrp || 189900)
        }) : ({
          id: 'sz_' + Math.random().toString(36).slice(2, 7),
          size: String(s),
          selling_price: prod.selling_price || 999,
          mrp: prod.mrp || 189900
        }));
      } else if (prod.custom_size) {
        const parts = String(prod.custom_size).split(/[,/|]+/).map(x => x.trim()).filter(Boolean);
        productSizesList = parts.map(sz => ({
          id: 'sz_' + Math.random().toString(36).slice(2, 7),
          size: sz,
          selling_price: prod.selling_price || 999,
          mrp: prod.mrp || 189900
        }));
      }
      renderSizesUI();
      if (prod.default_size && document.getElementById('defaultSizeSelect')) {
        document.getElementById('defaultSizeSelect').value = prod.default_size;
      }

      // Feature image
      featureImageUrl = prod.img1 || (prod.colors && prod.colors[0] && prod.colors[0].color_img) || '';
      
      // Album gallery images
      if (prod.colors && prod.colors[0] && Array.isArray(prod.colors[0].images)) {
        albumImagesList = [...prod.colors[0].images];
      } else if (Array.isArray(prod.images)) {
        albumImagesList = [...prod.images];
      }

      // DSC Banner images
      if (Array.isArray(prod.description_images)) {
        dscImagesList = [...prod.description_images];
      }

      // Variants
      if (Array.isArray(prod.colors) && prod.colors.length > 0) {
        productVariantsList = prod.colors.map(c => ({
          id: c.id || ('v_' + Math.random().toString(36).slice(2, 7)),
          color_name: c.color_name || 'Default',
          color_hex: c.color_hex || '#3b82f6',
          color_img: c.color_img || '',
          images: c.images || [],
          ram: c.ram || prod.default_ram || '12 GB',
          storage: c.storage || prod.default_storage || '256 GB',
          selling_price: c.selling_price || prod.selling_price || 999,
          mrp: c.mrp || prod.mrp || 189900
        }));
      }

      // Default Selections
      if (prod.default_color) document.getElementById('defaultColorInput').value = prod.default_color;
      if (prod.default_ram) document.getElementById('defaultRamInput').value = prod.default_ram;
      if (prod.default_storage) document.getElementById('defaultStorageInput').value = prod.default_storage;
      if (prod.custom_size) document.getElementById('customSizeInput').value = prod.custom_size;
      document.getElementById('showCustomSize').checked = Boolean(prod.show_custom_size);
    }
  } else {
    title.textContent = 'Add New Product';
    document.getElementById('prodStock').value = 0;
    document.getElementById('prodMrp').value = 189900;
    document.getElementById('prodSellingPrice').value = 999;
    document.getElementById('prodDiscount').value = 0;
    document.getElementById('prodRating').value = '4.7';
    document.getElementById('prodRatingsCount').value = 3410;
    document.getElementById('prodActive').checked = true;
    document.getElementById('prodShowVariants').checked = true;
    if (document.getElementById('prodShowSizes')) document.getElementById('prodShowSizes').checked = false;
    if (document.getElementById('enableProductSizes')) document.getElementById('enableProductSizes').checked = false;
    productSizesList = [];
    renderSizesUI();
  }

  renderFeatureImagePreview();
  renderAlbumImagesPreview();
  renderDscImagesPreview();
  renderColorVariantsUI();

  modal.classList.add('active');
}

function closeProductModal() {
  const modal = document.getElementById('productModal');
  if (modal) modal.classList.remove('active');
  editingProductId = null;
}

// --------------------------------------------------------------------------
// Save Product (Handle Add & Edit Submission)
// --------------------------------------------------------------------------
async function handleProductFormSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('productFormSubmitBtn');
  btn.disabled = true;
  btn.innerHTML = `<span class="inline-block animate-spin mr-2">⟳</span> Saving to Catalog...`;

  const title1 = document.getElementById('prodTitle1').value.trim();
  const title2 = document.getElementById('prodTitle2').value.trim();
  const brand = document.getElementById('prodBrand').value.trim() || 'Apple';
  const category = document.getElementById('prodCategory').value;
  const stock = Number(document.getElementById('prodStock').value) || 0;
  const mrp = Number(document.getElementById('prodMrp').value) || 189900;
  const selling_price = Number(document.getElementById('prodSellingPrice').value) || 999;
  const discount = Number(document.getElementById('prodDiscount').value) || (mrp > selling_price ? Math.round(((mrp - selling_price) / mrp) * 100) : 0);
  const rating = Number(document.getElementById('prodRating').value) || 4.7;
  const reviews_count = Number(document.getElementById('prodRatingsCount').value) || 3410;

  const defaultColor = document.getElementById('defaultColorInput').value.trim();
  const defaultRam = document.getElementById('defaultRamInput').value.trim();
  const defaultStorage = document.getElementById('defaultStorageInput').value.trim();
  const customSize = document.getElementById('customSizeInput').value.trim();
  const showCustomSize = document.getElementById('showCustomSize').checked;
  const deliveryText = document.getElementById('deliveryTextSelect').value;
  const description = document.getElementById('prodDescription').value.trim();

  // Parse Highlights Bullet Points
  const aboutText = document.getElementById('prodAboutFeatures').value.trim();
  const highlights = aboutText
    ? aboutText.split('\n').map(l => l.trim().replace(/^•\s*/, '')).filter(Boolean)
    : [];

  // Parse Specs JSON
  let specifications = [];
  const specsRaw = document.getElementById('prodSpecifications').value.trim();
  if (specsRaw) {
    try {
      specifications = JSON.parse(specsRaw);
    } catch (err) {
      console.warn('Specs JSON parse error, storing as raw object:', err);
    }
  }

  const isActive = document.getElementById('prodActive').checked;
  const isFeatured = document.getElementById('prodFeatured').checked;
  const showVariants = document.getElementById('prodShowVariants').checked;
  const showSizes = document.getElementById('prodShowSizes') ? document.getElementById('prodShowSizes').checked : false;
  const defaultSizeSelect = document.getElementById('defaultSizeSelect');
  const defaultSize = defaultSizeSelect ? defaultSizeSelect.value.trim() : '';

  const cleanSizes = productSizesList.filter(s => s.size && String(s.size).trim()).map(s => ({
    id: s.id,
    size: String(s.size).trim(),
    selling_price: Number(s.selling_price) || selling_price,
    mrp: Number(s.mrp) || mrp
  }));

  // Determine cover image
  const primaryImg = featureImageUrl || (albumImagesList.length > 0 ? albumImagesList[0] : 'https://via.placeholder.com/800');

  // Format Colors / Variants
  let colors = [];
  if (productVariantsList.length > 0) {
    colors = productVariantsList.map(v => ({
      color_name: v.color_name || 'Default',
      color_hex: v.color_hex || '#3b82f6',
      color_img: v.color_img || primaryImg,
      images: (v.images && v.images.length > 0) ? v.images : (albumImagesList.length > 0 ? albumImagesList : [primaryImg]),
      ram: v.ram || defaultRam,
      storage: v.storage || defaultStorage,
      selling_price: v.selling_price || selling_price,
      mrp: v.mrp || mrp
    }));
  } else {
    colors = [
      {
        color_name: defaultColor || 'Default',
        color_hex: '#3b82f6',
        color_img: primaryImg,
        images: albumImagesList.length > 0 ? albumImagesList : [primaryImg],
        ram: defaultRam,
        storage: defaultStorage,
        selling_price: selling_price,
        mrp: mrp
      }
    ];
  }

  // Generate or preserve ID
  let slug = (document.getElementById('prodHiddenId').value || '').trim();
  if (!slug) {
    slug = (title1 || title2 || 'product')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (slug.length < 3) slug += '-' + Date.now().toString().slice(-4);
  }

  const productPayload = {
    id: slug,
    name: title2 || title1,
    title1: title1 || title2,
    title2: title2 || title1,
    brand,
    category,
    stock,
    mrp,
    selling_price,
    wow_price: selling_price,
    discount,
    rating,
    reviews_count,
    img1: primaryImg,
    images: albumImagesList.length > 0 ? albumImagesList : [primaryImg],
    colors,
    sizes: cleanSizes,
    show_sizes: showSizes,
    default_size: defaultSize || (cleanSizes[0]?.size || ''),
    description_images: dscImagesList.length > 0 ? dscImagesList : albumImagesList,
    default_color: defaultColor,
    default_ram: defaultRam,
    default_storage: defaultStorage,
    custom_size: cleanSizes.map(s => s.size).join(', ') || customSize,
    show_custom_size: showSizes,
    delivery_text: deliveryText,
    description: description || title2,
    highlights,
    specifications,
    hidden: !isActive,
    active: isActive,
    featured: isFeatured,
    hot_deal: isFeatured,
    show_variants: showVariants
  };

  try {
    let url = `${API_BASE}/products`;
    let method = 'POST';

    if (editingProductId) {
      url = `${API_BASE}/products/${encodeURIComponent(editingProductId)}`;
      method = 'PUT';
    }

    const res = await fetch(url, {
      method,
      headers: authHeaders(),
      body: JSON.stringify(productPayload)
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast(editingProductId ? 'Product updated in catalog!' : 'New product published to storefront successfully!');
      closeProductModal();
      fetchProducts();
      fetchStats();
    } else {
      showToast(data.error || 'Failed to save product.', 'error');
    }
  } catch (err) {
    showToast('Network error while saving product: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Create Product';
  }
}

// --------------------------------------------------------------------------
// 7. Delete Product Confirmation & Cloudinary Purge
// --------------------------------------------------------------------------
function openDeleteModal(productId) {
  const prod = currentProducts.find(p => String(p.id).toLowerCase() === String(productId).toLowerCase());
  if (!prod) return;

  productToDelete = prod;
  document.getElementById('deleteProductName').textContent = `"${prod.name}"`;

  // Count photos
  let count = 0;
  if (prod.img1 && prod.img1.includes('cloudinary.com')) count++;
  if (prod.colors) {
    prod.colors.forEach(c => {
      (c.images || []).forEach(img => {
        if (img.includes('cloudinary.com')) count++;
      });
    });
  }
  document.getElementById('deleteProductCloudPhotosCount').textContent = count;

  const modal = document.getElementById('deleteModal');
  if (modal) modal.classList.add('active');
}

function closeDeleteModal() {
  const modal = document.getElementById('deleteModal');
  if (modal) modal.classList.remove('active');
  productToDelete = null;
}

async function handleConfirmDelete() {
  if (!productToDelete) return;
  const btn = document.getElementById('confirmDeleteBtn');
  btn.disabled = true;
  btn.innerHTML = `<span class="inline-block animate-spin mr-1">⟳</span> Purging Cloud Photos...`;

  try {
    const res = await fetch(`${API_BASE}/products/${encodeURIComponent(productToDelete.id)}`, {
      method: 'DELETE',
      headers: authHeaders()
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast(`Product deleted & ${data.deletedImagesCount || 0} Cloudinary photos purged.`);
      closeDeleteModal();
      fetchProducts();
      fetchStats();
    } else {
      showToast(data.error || 'Failed to delete product', 'error');
    }
  } catch (err) {
    showToast('Failed to connect to delete service', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Confirm & Delete';
  }
}

// --------------------------------------------------------------------------
// 8. Bulk Price Scaler
// --------------------------------------------------------------------------
async function handleBulkPriceSubmit(e) {
  e.preventDefault();
  const targetPrice = document.getElementById('bulkTargetPrice').value.trim();
  const discountPercent = document.getElementById('bulkDiscountPercent').value.trim();

  if (!targetPrice && !discountPercent) {
    showToast('Please enter either a Target Price or a Discount Percentage.', 'error');
    return;
  }

  const btn = document.getElementById('applyBulkPriceBtn');
  btn.disabled = true;
  btn.innerHTML = `<span class="inline-block animate-spin mr-2">⟳</span> Updating catalog...`;

  try {
    const res = await fetch(`${API_BASE}/bulk-price-scale`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        targetPrice: targetPrice ? Number(targetPrice) : null,
        discountPercent: discountPercent ? Number(discountPercent) : null
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast(data.message || 'Bulk prices updated successfully!');
      document.getElementById('bulkPriceForm').reset();
      fetchProducts();
    } else {
      showToast(data.error || 'Failed to apply bulk pricing', 'error');
    }
  } catch (err) {
    showToast('Error applying bulk prices', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '⚡ Apply Bulk Price Update to All Products';
  }
}

// --------------------------------------------------------------------------
// 9. Quick Product Reorder (Quick Serial Sorter)
// --------------------------------------------------------------------------
let reorderClickIndex = 0;
let reorderView = 'all';
let reorderCustomRanks = {}; // Maps productId -> customRankNumber

function setReorderView(v) {
  reorderView = v;
  document.querySelectorAll('.reorder-view-tab').forEach(function (b) {
    const on = b.dataset.reorderView === v;
    b.classList.toggle('bg-indigo-600', on);
    b.classList.toggle('text-white', on);
    b.classList.toggle('bg-gray-100', !on);
    b.classList.toggle('text-gray-600', !on);
  });
  renderReorderList();
}

function reorderMarkOriginals() {
  reorderProductsList.forEach(function (p, i) {
    if (p.__orig === undefined || p.__orig === null) p.__orig = i;
  });
}

function reorderVisibleList() {
  const searchEl = document.getElementById('reorderSearch');
  const catEl = document.getElementById('reorderCategory');
  const q = ((searchEl && searchEl.value) || '').trim().toLowerCase();
  const cat = ((catEl && catEl.value) || '').trim().toLowerCase();

  return reorderProductsList.filter(function (p) {
    if (q && String(p.name || '').toLowerCase().indexOf(q) === -1) return false;
    if (cat && String(p.category || '').trim().toLowerCase() !== cat) return false;
    return true;
  });
}

function updateReorderCounters() {
  const total = reorderProductsList.length;
  const countAssigned = Object.keys(reorderCustomRanks).length;
  const setText = function (id, txt) {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  };
  setText('reorderSelectedPill', 'Selected: ' + countAssigned + ' / ' + total);
  setText('reorderNextPill', countAssigned >= total && total > 0 ? 'All ranked ✓' : 'Next Click: #' + (reorderClickIndex + 1));
  setText('reorderAllCount', total);
  setText('reorderSortedCount', countAssigned);
  setText('reorderSaveCount', total);
}

function handleRankInputByIndex(index, val) {
  const p = reorderProductsList[index];
  if (!p) return;
  const num = parseInt(val, 10);
  if (!Number.isNaN(num) && num >= 1) {
    reorderCustomRanks[p.id] = num;
    if (num > reorderClickIndex) reorderClickIndex = num;
  } else {
    delete reorderCustomRanks[p.id];
  }
  updateReorderCounters();
}

function handleRankInput(prodId, val) {
  const num = parseInt(val, 10);
  if (!Number.isNaN(num) && num >= 1) {
    reorderCustomRanks[prodId] = num;
    if (num > reorderClickIndex) reorderClickIndex = num;
  } else {
    delete reorderCustomRanks[prodId];
  }
  updateReorderCounters();
}

function renderReorderList() {
  const container = document.getElementById('reorderListContainer');
  if (!container) return;

  reorderMarkOriginals();
  const total = reorderProductsList.length;

  const catSel = document.getElementById('reorderCategory');
  if (catSel) {
    const names = [];
    reorderProductsList.forEach(function (p) {
      const n = String(p.category || '').trim();
      if (n && names.indexOf(n) === -1) names.push(n);
    });
    const want = [''].concat(names).join('|');
    const have = Array.from(catSel.options).map(function (o) { return o.value; }).join('|');
    if (have !== want) {
      const cur = catSel.value;
      catSel.innerHTML = '<option value="">All Categories</option>' + names.map(function (n) {
        return '<option value="' + escAttr(n) + '">' + escAttr(n) + '</option>';
      }).join('');
      if (names.indexOf(cur) !== -1) catSel.value = cur;
    }
  }

  let visible = reorderVisibleList();
  if (reorderView === 'sorted') {
    visible = visible.filter(function (p) {
      return reorderCustomRanks[p.id] !== undefined;
    });
  }

  updateReorderCounters();

  if (!total) {
    container.innerHTML = '<p class="text-xs text-gray-500 py-6 text-center col-span-full">No products available to reorder.</p>';
    return;
  }

  if (!visible.length) {
    container.innerHTML = '<p class="text-xs text-gray-400 py-6 text-center col-span-full">No products match this filter.</p>';
    return;
  }

  container.innerHTML = visible.map(function (p) {
    const index = reorderProductsList.indexOf(p);
    const thumb = p.img1 || 'https://via.placeholder.com/80';
    const clamp = 'style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:30px"';
    const customRank = reorderCustomRanks[p.id];
    const isSet = customRank !== undefined;
    const cardBorder = isSet ? 'border-indigo-500 bg-indigo-50/20 shadow-sm' : 'border-gray-200 bg-white hover:border-indigo-300 hover:shadow-md';

    return '<div class="p-3 rounded-xl border transition flex flex-col ' + cardBorder + '">' +
      '<div class="flex items-start justify-between gap-1 mb-2">' +
        (isSet
          ? '<span class="px-1.5 py-0.5 rounded-md text-[10px] font-extrabold bg-indigo-600 text-white shadow-xs">Rank: #' + customRank + '</span>'
          : '<span class="px-1.5 py-0.5 rounded-md text-[10px] font-extrabold bg-indigo-50 text-indigo-700">#' + (index + 1) + '</span>'
        ) +
        '<button type="button" onclick="assignNextRank(' + index + ')" title="Assign the next rank to this product"' +
          ' class="w-6 h-6 rounded-full border border-dashed ' + (isSet ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-bold' : 'border-gray-300 text-gray-400 hover:border-indigo-500 hover:text-indigo-600') + ' text-sm leading-none transition">' +
          (isSet ? '✓' : '+') +
        '</button>' +
      '</div>' +
      '<img src="' + escAttr(thumb) + '" alt="" class="w-full h-24 object-contain rounded-lg bg-gray-50 border border-gray-100 p-1 mb-2" />' +
      '<h5 class="text-[11px] font-bold text-gray-900 leading-snug" ' + clamp + ' title="' + escAttr(p.name || '') + '">' + escAttr(p.name || '') + '</h5>' +
      '<div class="flex items-center justify-between mt-1.5 mb-2 gap-1">' +
        '<span class="text-xs font-extrabold text-blue-600">₹' + escAttr(String(p.selling_price)) + '</span>' +
        '<span class="text-[10px] text-gray-400 whitespace-nowrap">Original: #' + ((p.__orig === undefined ? index : p.__orig) + 1) + '</span>' +
      '</div>' +
      '<div class="flex items-center gap-1 mt-auto pt-2 border-t border-gray-100">' +
        '<span class="text-[10px] font-bold text-gray-500 whitespace-nowrap">Rank #:</span>' +
        '<input type="number" min="1" max="' + total + '" id="rank_' + index + '" placeholder="' + (index + 1) + '"' +
          ' value="' + (isSet ? customRank : '') + '"' +
          ' oninput="handleRankInputByIndex(' + index + ', this.value)"' +
          ' onkeydown="if(event.key===\'Enter\'){event.preventDefault();jumpToRank(' + index + ', this.value);}"' +
          ' class="w-12 px-1 py-1 text-[11px] font-bold text-center ' + (isSet ? 'bg-white border-indigo-500 text-indigo-900 ring-1 ring-indigo-400' : 'bg-gray-50 border-gray-200 text-gray-900') + ' border rounded-md outline-none focus:bg-white focus:border-indigo-500 transition" />' +
        '<button type="button" onclick="jumpToRank(' + index + ', document.getElementById(\'rank_' + index + '\').value)"' +
          ' class="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-[10px] font-bold transition">Go</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function jumpToRank(index, pos) {
  const total = reorderProductsList.length;
  if (!total) return;
  const target = parseInt(pos, 10);
  if (Number.isNaN(target) || target < 1) {
    showToast('Enter a position number between 1 and ' + total, 'error');
    return;
  }
  const p = reorderProductsList[index];
  if (p) reorderCustomRanks[p.id] = target;
  moveProductToPosition(index, target);
}

function assignNextRank(index) {
  const total = reorderProductsList.length;
  if (!total) return;
  const p = reorderProductsList[index];
  if (!p) return;

  const target = reorderClickIndex + 1;
  reorderClickIndex = target;
  reorderCustomRanks[p.id] = target;

  renderReorderList();
  showToast('Assigned rank #' + target + ' to "' + String(p.name || '').slice(0, 30) + '"');
}

function autoFillRest() {
  const total = reorderProductsList.length;
  if (!total) return;
  let currentRank = reorderClickIndex || 0;
  reorderProductsList.forEach(function (p) {
    if (!reorderCustomRanks[p.id]) {
      currentRank++;
      reorderCustomRanks[p.id] = currentRank;
    }
  });
  reorderClickIndex = Math.max(reorderClickIndex, currentRank);
  renderReorderList();
  showToast('Remaining positions auto-assigned in current sequence.');
}

function resetReorderAssignments() {
  reorderClickIndex = 0;
  reorderCustomRanks = {};
  renderReorderList();
  showToast('All rank assignments reset.');
}

function loadCurrentOrder() {
  reorderProductsList = [...currentProducts];
  reorderProductsList.forEach(function (p, i) { p.__orig = i; });
  reorderClickIndex = 0;
  reorderCustomRanks = {};
  const s = document.getElementById('reorderSearch');
  if (s) s.value = '';
  const c = document.getElementById('reorderCategory');
  if (c) c.value = '';
  setReorderView('all');
  renderReorderList();
}

function moveProductOrder(index, direction) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= reorderProductsList.length) return;
  const temp = reorderProductsList[index];
  reorderProductsList[index] = reorderProductsList[targetIndex];
  reorderProductsList[targetIndex] = temp;
  renderReorderList();
}

function moveProductToTop(index) {
  if (index <= 0) return;
  const item = reorderProductsList.splice(index, 1)[0];
  reorderProductsList.unshift(item);
  renderReorderList();
}

function moveProductToPosition(index, pos) {
  const total = reorderProductsList.length;
  if (!total) return;

  let target = parseInt(pos, 10);
  if (Number.isNaN(target)) {
    showToast('Enter a position number between 1 and ' + total, 'error');
    return;
  }

  target = Math.min(Math.max(target, 1), total) - 1;
  if (target === index) {
    renderReorderList();
    return;
  }

  const item = reorderProductsList.splice(index, 1)[0];
  reorderProductsList.splice(target, 0, item);

  renderReorderList();
  showToast('Moved "' + String(item.name || '').slice(0, 40) + '" to position #' + (target + 1));
}

function reorderWithCustomRanks(list, ranks) {
  const total = list.length;
  const assigned = [];
  const unassigned = [];

  list.forEach((p, idx) => {
    if (ranks[p.id] !== undefined && !Number.isNaN(ranks[p.id])) {
      assigned.push({ product: p, rank: ranks[p.id], origIdx: idx });
    } else {
      unassigned.push({ product: p, origIdx: idx });
    }
  });

  if (assigned.length === 0) return list;

  assigned.sort((a, b) => a.rank - b.rank || a.origIdx - b.origIdx);

  const slots = new Array(total);
  const overflow = [];

  assigned.forEach(item => {
    let target = item.rank - 1;
    target = Math.max(0, Math.min(target, total - 1));
    if (!slots[target]) {
      slots[target] = item.product;
    } else {
      overflow.push(item.product);
    }
  });

  const remaining = unassigned.map(u => u.product).concat(overflow);
  let remIdx = 0;
  for (let i = 0; i < total; i++) {
    if (!slots[i]) {
      if (remIdx < remaining.length) {
        slots[i] = remaining[remIdx++];
      }
    }
  }
  return slots.filter(Boolean);
}

async function saveProductOrder() {
  const btn = document.getElementById('saveOrderBtn');
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="inline-block animate-spin mr-1">⟳</span> Saving to Database...'; }

  // 1. Gather all values currently typed into rank inputs in the DOM
  reorderProductsList.forEach(function (p, index) {
    const input = document.getElementById('rank_' + index);
    if (input && input.value) {
      const v = parseInt(input.value, 10);
      if (!Number.isNaN(v) && v >= 1) {
        reorderCustomRanks[p.id] = v;
      }
    }
  });

  // 2. Reconstruct sequence with all custom ranks
  if (Object.keys(reorderCustomRanks).length > 0) {
    reorderProductsList = reorderWithCustomRanks(reorderProductsList, reorderCustomRanks);
  }

  const orderedIds = reorderProductsList.map(function (p) { return p.id; });

  try {
    const res = await fetch(`${API_BASE}/reorder-products`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ orderedIds })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast('✓ Catalog sequence saved to MongoDB & live on storefront!');
      reorderCustomRanks = {};
      reorderClickIndex = 0;
      await fetchProducts();
    } else {
      showToast(data.error || 'Failed to save order', 'error');
    }
  } catch (err) {
    showToast('Failed to save order sequence: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
  }
}

// --------------------------------------------------------------------------
// 10. Real-Time IP Tracker & Push.House Bot Audit (Zero Mock Data)
// --------------------------------------------------------------------------
let currentIpFilter = 'all'; // 'all' | 'real' | 'bot'
let currentIpLogs = [];

function setIpFilter(filter) {
  currentIpFilter = filter;
  
  const btnAll = document.getElementById('btnFilterAll');
  const btnReal = document.getElementById('btnFilterReal');
  const btnBot = document.getElementById('btnFilterBot');
  
  if (btnAll) {
    btnAll.className = filter === 'all' 
      ? 'px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 bg-white text-gray-900 shadow-sm'
      : 'px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 text-gray-600 hover:text-gray-900';
  }

  if (btnReal) {
    btnReal.className = filter === 'real'
      ? 'px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 bg-blue-600 text-white shadow-sm'
      : 'px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 text-gray-600 hover:text-blue-600';
  }

  if (btnBot) {
    btnBot.className = filter === 'bot'
      ? 'px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 bg-red-600 text-white shadow-sm'
      : 'px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 text-gray-600 hover:text-red-600';
  }

  fetchIpTracker();
}

function searchIpLogs(query) {
  const q = (query || '').toLowerCase().trim();
  if (!q) {
    renderIpLogs(currentIpLogs);
    return;
  }
  const filtered = currentIpLogs.filter(log => {
    return (
      (log.ip && log.ip.toLowerCase().includes(q)) ||
      (log.click_id && log.click_id.toLowerCase().includes(q)) ||
      (log.camp && log.camp.toLowerCase().includes(q)) ||
      (log.site && log.site.toLowerCase().includes(q)) ||
      (log.location && log.location.toLowerCase().includes(q)) ||
      (log.device && log.device.toLowerCase().includes(q)) ||
      (log.browser && log.browser.toLowerCase().includes(q)) ||
      (log.url && log.url.toLowerCase().includes(q))
    );
  });
  renderIpLogs(filtered);
}

async function fetchIpTracker() {
  try {
    const res = await fetch(`${API_BASE}/ip-tracker?filter=${currentIpFilter}`, { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    if (data.success && Array.isArray(data.logs)) {
      currentIpLogs = data.logs;
      renderIpLogs(data.logs);

      if (data.stats) {
        const s = data.stats;
        const totalEl = document.getElementById('ipStatTotal');
        const realEl = document.getElementById('ipStatReal');
        const botEl = document.getElementById('ipStatBot');
        const botRatioEl = document.getElementById('ipStatBotRatio');
        const activeEl = document.getElementById('ipStatActive');

        if (totalEl) totalEl.textContent = s.total || 0;
        if (realEl) realEl.textContent = s.realCount || 0;
        if (botEl) botEl.textContent = s.botCount || 0;
        if (botRatioEl) botRatioEl.textContent = `${s.botRatio || 0}%`;
        if (activeEl) activeEl.textContent = Math.max(1, s.activeCount || 1);

        const filterAllEl = document.getElementById('filterCountAll');
        const filterRealEl = document.getElementById('filterCountReal');
        const filterBotEl = document.getElementById('filterCountBot');
        if (filterAllEl) filterAllEl.textContent = s.total || 0;
        if (filterRealEl) filterRealEl.textContent = s.realCount || 0;
        if (filterBotEl) filterBotEl.textContent = s.botCount || 0;

        const dashActive = document.getElementById('dashActiveVisitors');
        if (dashActive) dashActive.textContent = Math.max(1, s.activeCount || 1);

        const sidebarBadge = document.getElementById('sidebarLiveIpBadge');
        if (sidebarBadge) sidebarBadge.textContent = `LIVE ${Math.max(1, s.activeCount || 1)}`;
      }
    }
  } catch (err) {
    console.error('Failed to fetch IP logs:', err);
  }
}

function formatLogTime(d) {
  if (!d) return 'Just now';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    return dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  } catch (e) {
    return 'Just now';
  }
}

function renderIpLogs(logs) {
  const tbody = document.getElementById('ipTrackerTableBody');
  if (!tbody) return;

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-10 text-gray-400">
      <i class="bi bi-inbox text-3xl block mb-2 text-gray-300"></i>
      No visitor records found matching this filter.
    </td></tr>`;
    return;
  }

  tbody.innerHTML = logs.map(log => {
    const isBot = !!log.isBot;
    const typeBadge = isBot
      ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
           <span class="w-2 h-2 rounded-full bg-red-500"></span> 🤖 Bot / Fake
         </span>`
      : `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200">
           <span class="w-2 h-2 rounded-full bg-blue-500"></span> 👤 Real Human
         </span>`;

    // Push.House Ad Macros formatting
    const adPills = [];
    if (log.click_id) adPills.push(`<span class="bg-gray-100 text-gray-700 font-mono text-[10px] px-1.5 py-0.5 rounded border border-gray-200" title="Push.House Click ID">CID: ${escAttr(log.click_id)}</span>`);
    if (log.camp) adPills.push(`<span class="bg-purple-50 text-purple-700 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-purple-200">Camp: ${escAttr(log.camp)}</span>`);
    if (log.site) adPills.push(`<span class="bg-indigo-50 text-indigo-700 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-indigo-200">Site: ${escAttr(log.site)}</span>`);
    if (log.price) adPills.push(`<span class="bg-emerald-50 text-emerald-700 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-emerald-200">CPC: $${escAttr(log.price)}</span>`);
    if (log.format) adPills.push(`<span class="bg-amber-50 text-amber-700 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-amber-200">${escAttr(log.format)}</span>`);

    const adHtml = adPills.length > 0
      ? `<div class="flex flex-wrap gap-1 max-w-xs">${adPills.join('')}</div>`
      : `<span class="text-gray-400 italic text-[11px]">Direct / Organic</span>`;

    const statusBadge = isBot
      ? `<div class="text-right">
           <span class="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
             <span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span> Bot Detected
           </span>
           <p class="text-[10px] text-red-500 mt-0.5 max-w-[160px] truncate ml-auto" title="${escAttr(log.detectionReason || 'Automated Signature')}">
             ${escAttr(log.detectionReason || 'Bot Signature')}
           </p>
         </div>`
      : `<div class="text-right">
           <span class="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
             <span class="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span> Verified Real
           </span>
           <p class="text-[10px] text-blue-600 mt-0.5 max-w-[160px] truncate ml-auto" title="${escAttr(log.detectionReason || 'Verified Human Browser')}">
             ${escAttr(log.detectionReason || 'Real Human')}
           </p>
         </div>`;

    const rowBg = isBot ? 'hover:bg-red-50/30' : 'hover:bg-blue-50/30';
    const deviceIcon = (log.device || '').toLowerCase() === 'mobile' 
      ? 'phone' 
      : ((log.device || '').toLowerCase() === 'tablet' ? 'tablet' : 'laptop');

    return `
      <tr class="${rowBg} transition border-b border-gray-100">
        <td class="py-3 px-4">${typeBadge}</td>
        <td class="py-3 px-4 font-mono font-bold text-gray-900">${escAttr(log.ip)}</td>
        <td class="py-3 px-4">${adHtml}</td>
        <td class="py-3 px-4 text-gray-700 font-medium">${escAttr(log.location || 'India (Online)')}</td>
        <td class="py-3 px-4">
          <div class="flex flex-col text-[11px] text-gray-600">
            <span class="flex items-center gap-1 font-semibold text-gray-800">
              <i class="bi bi-${deviceIcon}"></i>
              <span>${escAttr(log.browser || 'Browser')}</span>
            </span>
            <span class="text-gray-400 text-[10px]">${escAttr(log.os || 'OS')}</span>
          </div>
        </td>
        <td class="py-3 px-4 font-mono text-blue-600 truncate max-w-[130px]" title="${escAttr(log.url || '/')}">
          <a href="${escAttr(log.url || '/')}" target="_blank" class="hover:underline">${escAttr(log.path || log.url || '/')}</a>
        </td>
        <td class="py-3 px-4 text-gray-500 whitespace-nowrap">${formatLogTime(log.createdAt || log.time)}</td>
        <td class="py-3 px-4 text-right">${statusBadge}</td>
      </tr>
    `;
  }).join('');
}

async function clearIpLogsConfirm() {
  if (!confirm('Are you sure you want to clear all IP and Bot visitor history for this store? This cannot be undone.')) {
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/ip-tracker`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    const data = await res.json();
    if (data.success) {
      showToast('Visitor history cleared successfully.');
      fetchIpTracker();
    } else {
      showToast(data.error || 'Failed to clear logs', 'error');
    }
  } catch (err) {
    showToast('Network error while clearing logs', 'error');
  }
}

// --------------------------------------------------------------------------
// 11. Categories Management (Custom Photos, Cloudinary & Live Sync)
// --------------------------------------------------------------------------
let currentCategoriesList = [];

const OFFICIAL_FLIPKART_SVGS = {
  mobiles: 'https://static-assets-web.flixcart.com/apex-static/images/svgs/L1Nav/mobiles.svg',
  electronics: 'https://static-assets-web.flixcart.com/apex-static/images/svgs/L1Nav/electronics.svg',
  appliances: 'https://static-assets-web.flixcart.com/apex-static/images/svgs/L1Nav/tv.svg',
  furniture: 'https://static-assets-web.flixcart.com/apex-static/images/svgs/L1Nav/furniture.svg',
  grocery: 'https://static-assets-web.flixcart.com/apex-static/images/svgs/L1Nav/food.svg',
  fashion: 'https://static-assets-web.flixcart.com/apex-static/images/svgs/L1Nav/fashion.svg',
  beauty: 'https://static-assets-web.flixcart.com/apex-static/images/svgs/L1Nav/beauty.svg',
  home: 'https://static-assets-web.flixcart.com/apex-static/images/svgs/L1Nav/home-final.svg',
  'for-you': 'https://static-assets-web.flixcart.com/apex-static/images/svgs/L1Nav/offers.svg'
};

let currentCategorySize = 58;
let _catSizeDebounce = null;

function setCategorySizePreset(size) {
  currentCategorySize = parseInt(size, 10);
  const slider = document.getElementById('catSizeSlider');
  if (slider) slider.value = currentCategorySize;
  const valText = document.getElementById('catSizeVal');
  if (valText) valText.textContent = `${currentCategorySize}px`;

  document.querySelectorAll('#catSizePresets button').forEach(btn => {
    if (parseInt(btn.getAttribute('data-size'), 10) === currentCategorySize) {
      btn.className = 'px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-600 text-white shadow-sm';
    } else {
      btn.className = 'px-3 py-1.5 text-xs font-bold rounded-lg text-gray-600 hover:text-gray-900 transition';
    }
  });

  saveCategoriesToServer(true);
}

function onCategorySizeSlider(val) {
  currentCategorySize = parseInt(val, 10);
  const valText = document.getElementById('catSizeVal');
  if (valText) valText.textContent = `${currentCategorySize}px`;

  document.querySelectorAll('#catSizePresets button').forEach(btn => {
    if (parseInt(btn.getAttribute('data-size'), 10) === currentCategorySize) {
      btn.className = 'px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-600 text-white shadow-sm';
    } else {
      btn.className = 'px-3 py-1.5 text-xs font-bold rounded-lg text-gray-600 hover:text-gray-900 transition';
    }
  });

  clearTimeout(_catSizeDebounce);
  _catSizeDebounce = setTimeout(() => {
    saveCategoriesToServer(true);
  }, 400);
}

async function fetchCategories() {
  try {
    const res = await fetch(`${API_BASE}/categories`, { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    if (data.success && Array.isArray(data.categories)) {
      currentCategoriesList = data.categories;
      if (data.categorySize) {
        currentCategorySize = parseInt(data.categorySize, 10) || 58;
        const slider = document.getElementById('catSizeSlider');
        if (slider) slider.value = currentCategorySize;
        const valText = document.getElementById('catSizeVal');
        if (valText) valText.textContent = `${currentCategorySize}px`;

        document.querySelectorAll('#catSizePresets button').forEach(btn => {
          if (parseInt(btn.getAttribute('data-size'), 10) === currentCategorySize) {
            btn.className = 'px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-600 text-white shadow-sm';
          } else {
            btn.className = 'px-3 py-1.5 text-xs font-bold rounded-lg text-gray-600 hover:text-gray-900 transition';
          }
        });
      }
      renderCategories(currentCategoriesList);
    }
  } catch (err) {
    console.error('Failed to fetch categories:', err);
  }
}

function renderCategories(categories) {
  const grid = document.getElementById('categoriesGrid');
  if (!grid) return;

  if (!categories || categories.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-12 text-center bg-white rounded-2xl border border-gray-200">
        <i class="bi bi-folder-x text-4xl text-gray-300"></i>
        <p class="text-sm font-bold text-gray-700 mt-2">No categories found</p>
        <button onclick="resetToOfficialFlipkartIcons()" class="mt-3 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold">
          Load Default Categories
        </button>
      </div>
    `;
    return;
  }

  grid.innerHTML = categories.map((cat, idx) => {
    const imgUrl = cat.image || (OFFICIAL_FLIPKART_SVGS[(cat.id || '').toLowerCase()] || 'https://static-assets-web.flixcart.com/apex-static/images/svgs/L1Nav/mobiles.svg');

    return `
      <div class="bg-white p-4 sm:p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between gap-3 relative hover:border-blue-400 transition" data-cat-idx="${idx}">
        <div class="flex items-start justify-between gap-3">
          <!-- Thumbnail preview with clean borderless fit -->
          <div class="relative flex-shrink-0 flex items-center justify-center w-16 h-16 bg-gray-50/70 rounded-xl p-1.5 border border-gray-100">
            <img 
              id="cat_preview_${idx}" 
              src="${imgUrl}" 
              alt="${cat.name}" 
              class="w-full h-full object-contain transition-transform hover:scale-110" 
              onerror="this.src='https://static-assets-web.flixcart.com/apex-static/images/svgs/L1Nav/mobiles.svg'" 
            />
            <span class="absolute -top-1.5 -left-1.5 text-[10px] font-extrabold bg-blue-600 text-white w-5 h-5 rounded-full flex items-center justify-center shadow">
              #${idx + 1}
            </span>
          </div>

          <!-- Name & ID Inputs -->
          <div class="flex-1 min-w-0">
            <label class="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider block mb-0.5">Category Name</label>
            <input 
              type="text" 
              id="cat_name_${idx}" 
              value="${cat.name || ''}" 
              class="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-900 focus:bg-white focus:border-blue-500 outline-none" 
              placeholder="e.g. Mobiles" 
              oninput="updateCategoryField(${idx}, 'name', this.value)" 
            />

            <label class="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider block mt-2 mb-0.5">Category Slug / ID</label>
            <input 
              type="text" 
              id="cat_id_${idx}" 
              value="${cat.id || ''}" 
              class="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono text-gray-600 focus:bg-white focus:border-blue-500 outline-none" 
              placeholder="e.g. mobiles" 
              oninput="updateCategoryField(${idx}, 'id', this.value)" 
            />
          </div>
        </div>

        <!-- Photo / SVG Image Upload & URL input -->
        <div class="space-y-1.5 pt-2 border-t border-gray-100">
          <div class="flex items-center justify-between">
            <label class="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Photo / SVG Icon</label>
            <button type="button" onclick="useFlipkartSvgForCat(${idx})" class="text-[10px] font-bold text-blue-600 hover:underline">
              Official Flipkart SVG
            </button>
          </div>
          
          <div class="flex gap-1.5">
            <input 
              type="text" 
              id="cat_image_${idx}" 
              value="${cat.image || ''}" 
              class="flex-1 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[11px] text-gray-700 focus:bg-white focus:border-blue-500 outline-none" 
              placeholder="Paste Image URL or SVG..." 
              oninput="updateCategoryField(${idx}, 'image', this.value)" 
            />
            <button 
              type="button" 
              onclick="uploadCategoryPhoto(${idx})" 
              class="px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-700 rounded-lg text-xs font-bold transition flex items-center gap-1 flex-shrink-0" 
              title="Upload photo directly to Cloudinary"
            >
              <i class="bi bi-cloud-arrow-up"></i> Upload
            </button>
          </div>
        </div>

        <!-- Controls footer (Position controls & Instant Delete) -->
        <div class="flex items-center justify-between pt-2 border-t border-gray-100 text-xs">
          <label class="flex items-center gap-2 cursor-pointer select-none">
            <input 
              type="checkbox" 
              ${cat.active !== false ? 'checked' : ''} 
              onchange="updateCategoryField(${idx}, 'active', this.checked)" 
              class="w-4 h-4 rounded text-blue-600 focus:ring-blue-500" 
            />
            <span class="text-xs font-semibold text-gray-700">Active</span>
          </label>

          <div class="flex items-center gap-1.5">
            <!-- Position reorder buttons -->
            <div class="flex items-center gap-1 bg-gray-50 px-2 py-0.5 rounded-lg border border-gray-200">
              <span class="text-[10px] font-bold text-gray-500 uppercase">Pos:</span>
              <span class="text-xs font-extrabold text-blue-700">#${idx + 1}</span>
              <button type="button" onclick="moveCategoryItem(${idx}, -1)" ${idx === 0 ? 'disabled' : ''} class="p-1 text-gray-600 hover:text-blue-700 disabled:opacity-20 text-xs font-bold transition" title="Move Left / Earlier in list">
                ◀
              </button>
              <button type="button" onclick="moveCategoryItem(${idx}, 1)" ${idx === categories.length - 1 ? 'disabled' : ''} class="p-1 text-gray-600 hover:text-blue-700 disabled:opacity-20 text-xs font-bold transition" title="Move Right / Later in list">
                ▶
              </button>
            </div>

            <!-- Instant delete button -->
            <button type="button" onclick="deleteCategoryItem(${idx})" class="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition" title="Delete category immediately from store">
              <i class="bi bi-trash3 text-sm"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function updateCategoryField(idx, field, val) {
  if (!currentCategoriesList[idx]) return;
  currentCategoriesList[idx][field] = val;
  if (field === 'image') {
    const preview = document.getElementById(`cat_preview_${idx}`);
    if (preview) preview.src = val || 'https://via.placeholder.com/60?text=Icon';
  }
}

function useFlipkartSvgForCat(idx) {
  if (!currentCategoriesList[idx]) return;
  const slug = (currentCategoriesList[idx].id || currentCategoriesList[idx].name || '').toLowerCase();
  let found = OFFICIAL_FLIPKART_SVGS[slug];
  if (!found) {
    if (slug.includes('mob') || slug.includes('phone')) found = OFFICIAL_FLIPKART_SVGS.mobiles;
    else if (slug.includes('elec')) found = OFFICIAL_FLIPKART_SVGS.electronics;
    else if (slug.includes('app') || slug.includes('tv')) found = OFFICIAL_FLIPKART_SVGS.appliances;
    else if (slug.includes('furn') || slug.includes('bed')) found = OFFICIAL_FLIPKART_SVGS.furniture;
    else if (slug.includes('groc') || slug.includes('food')) found = OFFICIAL_FLIPKART_SVGS.grocery;
    else if (slug.includes('fash')) found = OFFICIAL_FLIPKART_SVGS.fashion;
    else if (slug.includes('beau')) found = OFFICIAL_FLIPKART_SVGS.beauty;
    else found = OFFICIAL_FLIPKART_SVGS.home;
  }
  currentCategoriesList[idx].image = found;
  const input = document.getElementById(`cat_image_${idx}`);
  if (input) input.value = found;
  const preview = document.getElementById(`cat_preview_${idx}`);
  if (preview) preview.src = found;
  showToast(`Applied official Flipkart SVG icon to ${currentCategoriesList[idx].name}!`);
  saveCategoriesToServer(true);
}

function uploadCategoryPhoto(idx) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async () => {
    if (input.files && input.files[0]) {
      showToast('Uploading category photo to Cloudinary...', 'info');
      const formData = new FormData();
      formData.append('file', input.files[0]);
      formData.append('upload_preset', cloudinaryConfig.uploadPreset || 'flipon');

      try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`, {
          method: 'POST',
          body: formData
        });
        if (res.ok) {
          const json = await res.json();
          const cloudUrl = json.secure_url || json.url;
          currentCategoriesList[idx].image = cloudUrl;
          
          const preview = document.getElementById(`cat_preview_${idx}`);
          if (preview) preview.src = cloudUrl;
          const imgInput = document.getElementById(`cat_image_${idx}`);
          if (imgInput) imgInput.value = cloudUrl;

          showToast('Category photo uploaded to Cloudinary successfully! Saving...', 'success');
          saveCategoriesToServer(true);
        } else {
          showToast('Failed to upload image to Cloudinary.', 'error');
        }
      } catch (err) {
        showToast('Error uploading image to Cloudinary: ' + err.message, 'error');
      }
    }
  };
  input.click();
}

function addNewCategoryItem() {
  const newCat = {
    id: 'category-' + Date.now().toString().slice(-4),
    name: 'New Category',
    image: 'https://static-assets-web.flixcart.com/apex-static/images/svgs/L1Nav/mobiles.svg',
    icon: 'bi-grid-fill',
    active: true,
    count: 0
  };
  currentCategoriesList.push(newCat);
  renderCategories(currentCategoriesList);
  showToast('New category added! Edit name/image and it will sync to storefront.');
  saveCategoriesToServer(true);
}

async function deleteCategoryItem(idx) {
  if (!currentCategoriesList[idx]) return;
  const name = currentCategoriesList[idx].name;
  if (confirm(`Are you sure you want to delete category "${name}"? It will be removed from both Admin and the Storefront immediately.`)) {
    currentCategoriesList.splice(idx, 1);
    renderCategories(currentCategoriesList);
    await saveCategoriesToServer(true);
    showToast(`🗑️ Category "${name}" deleted and removed from website!`, 'success');
  }
}

async function moveCategoryItem(idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= currentCategoriesList.length) return;
  const item = currentCategoriesList.splice(idx, 1)[0];
  currentCategoriesList.splice(newIdx, 0, item);
  renderCategories(currentCategoriesList);
  await saveCategoriesToServer(true);
  showToast(`Moved "${item.name}" to position #${newIdx + 1}!`);
}

function resetToOfficialFlipkartIcons() {
  currentCategoriesList.forEach(cat => {
    const slug = (cat.id || '').toLowerCase();
    if (OFFICIAL_FLIPKART_SVGS[slug]) {
      cat.image = OFFICIAL_FLIPKART_SVGS[slug];
    } else if (slug.includes('mob') || slug.includes('phone')) {
      cat.image = OFFICIAL_FLIPKART_SVGS.mobiles;
    } else if (slug.includes('elec')) {
      cat.image = OFFICIAL_FLIPKART_SVGS.electronics;
    } else if (slug.includes('app') || slug.includes('tv')) {
      cat.image = OFFICIAL_FLIPKART_SVGS.appliances;
    } else if (slug.includes('furn')) {
      cat.image = OFFICIAL_FLIPKART_SVGS.furniture;
    } else if (slug.includes('groc') || slug.includes('food')) {
      cat.image = OFFICIAL_FLIPKART_SVGS.grocery;
    } else if (slug.includes('fash')) {
      cat.image = OFFICIAL_FLIPKART_SVGS.fashion;
    } else if (slug.includes('beau')) {
      cat.image = OFFICIAL_FLIPKART_SVGS.beauty;
    } else if (slug.includes('home')) {
      cat.image = OFFICIAL_FLIPKART_SVGS.home;
    }
  });
  renderCategories(currentCategoriesList);
  showToast('All category photos reset to authentic Flipkart SVGs! Saving...');
  saveCategoriesToServer(true);
}

async function saveCategoriesToServer(silent = false) {
  const saveBtn = document.getElementById('saveCategoriesBtn');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<span class="inline-block animate-spin mr-1">⟳</span> Saving...`;
  }

  // Read current input values
  currentCategoriesList.forEach((cat, idx) => {
    const nameEl = document.getElementById(`cat_name_${idx}`);
    if (nameEl) cat.name = nameEl.value.trim();
    const idEl = document.getElementById(`cat_id_${idx}`);
    if (idEl) cat.id = idEl.value.trim().toLowerCase();
    const imgEl = document.getElementById(`cat_image_${idx}`);
    if (imgEl) cat.image = imgEl.value.trim();
  });

  try {
    const res = await fetch(`${API_BASE}/categories`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ 
        categories: currentCategoriesList,
        categorySize: currentCategorySize
      })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      if (!silent) showToast('✅ All categories and size saved! Storefront updated live.');
      renderCategories(currentCategoriesList);
    } else {
      showToast(data.error || 'Failed to save categories.', 'error');
    }
  } catch (err) {
    showToast('Network error while saving categories: ' + err.message, 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `<i class="bi bi-check2-circle text-base"></i> Save All Categories`;
    }
  }
}

// --------------------------------------------------------------------------
// 12. Banners Management
// --------------------------------------------------------------------------
async function fetchBanners() {
  try {
    const res = await fetch(`${API_BASE}/banners`, { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    if (data.success && Array.isArray(data.banners)) {
      renderBanners(data.banners);
    }
  } catch (err) {
    console.error('Failed to fetch banners:', err);
  }
}

function renderBanners(banners) {
  const container = document.getElementById('bannersList');
  if (!container) return;

  container.innerHTML = banners.map((b, idx) => `
    <div class="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-center gap-5">
      <img src="${b.image}" alt="${b.title}" class="w-full md:w-56 h-28 object-cover rounded-xl border border-gray-200 flex-shrink-0" onerror="this.src='https://via.placeholder.com/300x120?text=Banner'" />
      <div class="flex-1 w-full">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-bold text-blue-600 uppercase tracking-wider">Banner #${idx + 1}</span>
          <span class="badge-pill-green">Active</span>
        </div>
        <h4 class="font-bold text-gray-900 text-sm">${b.title}</h4>
        <p class="text-xs text-gray-500 mt-0.5">${b.subtitle || ''}</p>
        <span class="text-[11px] font-mono text-gray-400 block mt-1">Target: ${b.link}</span>
      </div>
      <button onclick="changeBannerImage(${idx})" class="w-full md:w-auto px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-bold transition flex-shrink-0">
        <i class="bi bi-cloud-arrow-up mr-1"></i> Replace Photo
      </button>
    </div>
  `).join('');
}

function changeBannerImage(idx) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async () => {
    if (input.files && input.files[0]) {
      showToast('Uploading banner photo to Cloudinary...', 'info');
      const formData = new FormData();
      formData.append('file', input.files[0]);
      formData.append('upload_preset', cloudinaryConfig.uploadPreset || 'flipon');

      try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`, {
          method: 'POST',
          body: formData
        });
        if (res.ok) {
          const json = await res.json();
          showToast('Banner photo replaced successfully!');
          fetchBanners();
        }
      } catch (err) {
        showToast('Error uploading banner to Cloudinary', 'error');
      }
    }
  };
  input.click();
}

// --------------------------------------------------------------------------
// 13. Payment Settings - Paytm Merchant  |  MobiKwik Merchant  (2 toggles)
//     Admin only ever edits: activeMode + UPI ID (+ payee name).
//     TR / MC / MBKMC / merchantId stay in MongoDB, never in this UI.
// --------------------------------------------------------------------------
let GATEWAY_STATE = { activeMode: '', merchant: {}, mobikwik_merchant: {} };

const GATEWAY_LABELS = {
  'merchant': 'Paytm Merchant',
  'mobikwik_merchant': 'MobiKwik Merchant'
};

function renderGatewayToggles() {
  const mode = GATEWAY_STATE.activeMode || '';

  document.querySelectorAll('.gateway-toggle-card').forEach(card => {
    const cardMode = card.dataset.mode;
    const active = mode === cardMode && !!(GATEWAY_STATE[cardMode] || {}).enabled;
    card.classList.toggle('border-blue-500', active);
    card.classList.toggle('bg-blue-50/40', active);
    card.classList.toggle('border-gray-200', !active);

    const sw = card.querySelector('.toggle-switch');
    if (sw) {
      sw.classList.toggle('on', active);
    }

    const upiBox = card.querySelector('.gateway-upi');
    if (upiBox) {
      upiBox.classList.toggle('hidden', !active);
    }
  });

  const banner = document.getElementById('activeGatewayBanner');
  const text = document.getElementById('activeGatewayText');
  if (banner && text) {
    if (mode && (GATEWAY_STATE[mode] || {}).enabled) {
      banner.className = 'mb-4 px-4 py-3 rounded-xl text-xs font-bold text-center border bg-emerald-50 border-emerald-200 text-emerald-700';
      text.textContent = `ACTIVE: ${GATEWAY_LABELS[mode]} — customers will pay to this UPI`;
    } else {
      banner.className = 'mb-4 px-4 py-3 rounded-xl text-xs font-bold text-center border bg-amber-50 border-amber-200 text-amber-700';
      text.textContent = 'No gateway enabled — turn one toggle ON';
    }
  }

  // Reflect state into the radio inputs
  document.querySelectorAll('.gatewayModeRadio').forEach(r => {
    r.checked = r.value === mode;
  });
}

function syncGatewayUpiPreview() {
  const mode = GATEWAY_STATE.activeMode;
  const block = (GATEWAY_STATE[mode] || {});
  const upi = block.upiId || '';
  updateQrPreview(upi, block.payeeName || 'Online Store');
  const hint = document.getElementById('qrPreviewHint');
  if (hint) {
    hint.textContent = upi
      ? `Customers scanning this pay to ${upi}`
      : 'Enable a gateway and enter its UPI ID';
  }
}

async function fetchPaymentSettings() {
  try {
    const res = await fetch(`${API_BASE}/payment-settings`, { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.success || !data.gateway) return;

    GATEWAY_STATE = data.gateway;

    const mUpi = document.getElementById('merchantUpiId');
    const kUpi = document.getElementById('mobikwikUpiId');
    if (mUpi) mUpi.value = (GATEWAY_STATE.merchant && GATEWAY_STATE.merchant.upiId) || '';
    if (kUpi) kUpi.value = (GATEWAY_STATE.mobikwik_merchant && GATEWAY_STATE.mobikwik_merchant.upiId) || '';

    renderGatewayToggles();
    syncGatewayUpiPreview();
  } catch (err) {
    console.error('Failed to fetch payment settings:', err);
  }
}

function updateQrPreview(upi, name) {
  const img = document.getElementById('upiQrPreviewImg');
  if (!img) return;
  if (!upi) {
    img.removeAttribute('src');
    return;
  }
  const cleanUpi = encodeURIComponent(upi);
  const cleanName = encodeURIComponent(name || 'Online Store');
  img.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=upi://pay?pa=${cleanUpi}&pn=${cleanName}&cu=INR`;
}

// Instant automatic sync to database (MongoDB)
let autoSaveGatewayTimer = null;
async function autoSavePaymentSettings(patch, silent = false) {
  try {
    const res = await fetch(`${API_BASE}/payment-settings`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(patch)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      if (data.gateway) {
        GATEWAY_STATE = data.gateway;
      }
      renderGatewayToggles();
      syncGatewayUpiPreview();
      const label = GATEWAY_LABELS[patch.activeMode] || 'Payment settings';
      if (!silent) {
        showToast(`✓ ${label} activated & updated in database in real time!`);
      }
    } else {
      showToast(data.error || 'Failed to update gateway in database', 'error');
    }
  } catch (err) {
    showToast('Failed to sync payment gateway: ' + err.message, 'error');
  }
}

// Turning a toggle ON switches activeMode and IMMEDIATELY updates database in real time
async function selectGatewayMode(mode) {
  GATEWAY_STATE.activeMode = mode;
  if (GATEWAY_STATE.merchant) GATEWAY_STATE.merchant.enabled = (mode === 'merchant');
  if (GATEWAY_STATE.mobikwik_merchant) GATEWAY_STATE.mobikwik_merchant.enabled = (mode === 'mobikwik_merchant');
  renderGatewayToggles();
  syncGatewayUpiPreview();

  // Instant real-time database update!
  const currentUpi = ((GATEWAY_STATE[mode] || {}).upiId || '').trim();
  const inputEl = document.getElementById(mode === 'merchant' ? 'merchantUpiId' : 'mobikwikUpiId');
  const upi = currentUpi || (inputEl ? inputEl.value.trim() : '');

  const payload = { activeMode: mode };
  if (mode === 'merchant') {
    if (upi) payload.merchantUpiId = upi;
  } else {
    if (upi) payload.mobikwikUpiId = upi;
  }

  await autoSavePaymentSettings(payload);
}

function initGatewayToggles() {
  // Clicking anywhere on a card (or its switch) activates that gateway and automatically saves to database.
  document.querySelectorAll('.gateway-toggle-card').forEach(card => {
    const mode = card.dataset.mode;
    card.addEventListener('click', (e) => {
      // Ignore clicks directly inside the UPI text input
      if (e.target.closest('.gatewayUpiInput')) return;
      e.preventDefault();
      selectGatewayMode(mode);
    });
  });

  document.querySelectorAll('.gatewayUpiInput').forEach(inp => {
    inp.addEventListener('input', () => {
      const card = inp.closest('.gateway-toggle-card');
      if (!card) return;
      const mode = card.dataset.mode;
      if (GATEWAY_STATE[mode]) GATEWAY_STATE[mode].upiId = inp.value.trim();
      if (GATEWAY_STATE.activeMode === mode) syncGatewayUpiPreview();

      // Debounced auto-save while typing
      if (autoSaveGatewayTimer) clearTimeout(autoSaveGatewayTimer);
      autoSaveGatewayTimer = setTimeout(() => {
        const val = inp.value.trim();
        if (val) {
          const payload = { activeMode: GATEWAY_STATE.activeMode || mode };
          if (mode === 'merchant') payload.merchantUpiId = val;
          else payload.mobikwikUpiId = val;
          autoSavePaymentSettings(payload, true);
        }
      }, 1200);
    });

    inp.addEventListener('change', () => {
      const card = inp.closest('.gateway-toggle-card');
      if (!card) return;
      const mode = card.dataset.mode;
      const val = inp.value.trim();
      if (!val) return;
      const payload = { activeMode: GATEWAY_STATE.activeMode || mode };
      if (mode === 'merchant') payload.merchantUpiId = val;
      else payload.mobikwikUpiId = val;
      autoSavePaymentSettings(payload);
    });
  });
}

async function handlePaymentSettingsSubmit(e) {
  e.preventDefault();
  const mode = GATEWAY_STATE.activeMode;
  const btn = document.getElementById('savePaymentBtn');

  if (!mode) {
    showToast('Turn ON one gateway toggle first.', 'error');
    return;
  }

  const upi = ((GATEWAY_STATE[mode] || {}).upiId || '').trim();
  if (!upi) {
    showToast(`Enter the ${GATEWAY_LABELS[mode]} UPI ID.`, 'error');
    const inp = document.getElementById(mode === 'merchant' ? 'merchantUpiId' : 'mobikwikUpiId');
    if (inp) inp.focus();
    return;
  }

  const payload = { activeMode: mode };
  if (mode === 'merchant') payload.merchantUpiId = upi;
  else payload.mobikwikUpiId = upi;

  btn.disabled = true;
  btn.innerHTML = `<span class="inline-block animate-spin mr-1">⟳</span> Saving...`;

  try {
    const res = await fetch(`${API_BASE}/payment-settings`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok && data.success) {
      if (data.gateway) GATEWAY_STATE = data.gateway;
      renderGatewayToggles();
      syncGatewayUpiPreview();
      showToast(`${GATEWAY_LABELS[mode]} activated — UPI saved to database in real time!`);
    } else {
      showToast(data.error || 'Failed to update payment settings', 'error');
    }
  } catch (err) {
    showToast('Failed to save payment settings', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Save Payment Settings';
  }
}

// --------------------------------------------------------------------------
// 14. Settings: Password & Cloudinary API
// --------------------------------------------------------------------------
async function handlePasswordChange(e) {
  e.preventDefault();
  const currentPassword = document.getElementById('currentPassword').value.trim();
  const newPassword = document.getElementById('newPassword').value.trim();
  const confirmPassword = document.getElementById('confirmPassword').value.trim();

  if (newPassword !== confirmPassword) {
    showToast('New passwords do not match.', 'error');
    return;
  }

  const btn = document.getElementById('savePasswordBtn');
  btn.disabled = true;
  btn.innerHTML = `<span class="inline-block animate-spin mr-1">⟳</span> Updating...`;

  try {
    const res = await fetch(`${API_BASE}/change-password`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ currentPassword, newPassword })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Master password updated successfully! Please keep it safe.');
      document.getElementById('changePasswordForm').reset();
    } else {
      showToast(data.error || 'Failed to change password.', 'error');
    }
  } catch (err) {
    showToast('Network error while updating password.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Update Password';
  }
}

async function fetchCloudinaryConfig() {
  try {
    const res = await fetch(`${API_BASE}/config`, { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    if (data.success && data.cloudinary) {
      cloudinaryConfig = data.cloudinary;
      const c = data.cloudinary;
      if (document.getElementById('settingCloudName')) document.getElementById('settingCloudName').value = c.cloudName || 'sricov3c';
      if (document.getElementById('settingUploadPreset')) document.getElementById('settingUploadPreset').value = c.uploadPreset || 'flipon';
      if (document.getElementById('settingApiKey')) document.getElementById('settingApiKey').value = c.apiKey || '351953765475734';
      if (document.getElementById('settingApiSecret')) document.getElementById('settingApiSecret').value = c.apiSecret || 'TqZ3PqbweZPFG1JdVYWgILNW_1g';
    }
  } catch (err) {
    console.error('Failed to fetch cloudinary config:', err);
  }
}

async function handleCloudinarySettingsSubmit(e) {
  e.preventDefault();
  const cloudName = document.getElementById('settingCloudName').value.trim();
  const uploadPreset = document.getElementById('settingUploadPreset').value.trim();
  const apiKey = document.getElementById('settingApiKey').value.trim();
  const apiSecret = document.getElementById('settingApiSecret').value.trim();

  const btn = document.getElementById('saveCloudinaryBtn');
  btn.disabled = true;
  btn.innerHTML = `<span class="inline-block animate-spin mr-1">⟳</span> Saving...`;

  try {
    const res = await fetch(`${API_BASE}/config`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        cloudinary: { cloudName, uploadPreset, apiKey, apiSecret }
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      cloudinaryConfig = { cloudName, uploadPreset, apiKey, apiSecret };
      showToast('Cloudinary credentials saved successfully!');
    } else {
      showToast(data.error || 'Failed to save Cloudinary credentials', 'error');
    }
  } catch (err) {
    showToast('Failed to save Cloudinary settings', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Save Credentials';
  }
}

// --------------------------------------------------------------------------
// 15. Support Tickets
// --------------------------------------------------------------------------
async function fetchSupportTickets() {
  try {
    const res = await fetch(`${API_BASE}/support-tickets`, { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    if (data.success && Array.isArray(data.tickets)) {
      renderSupportTickets(data.tickets);
    }
  } catch (err) {
    console.error('Failed to fetch support tickets:', err);
  }
}

function renderSupportTickets(tickets) {
  const container = document.getElementById('supportTicketsList');
  if (!container) return;

  container.innerHTML = tickets.map(t => `
    <div class="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 mb-1">
          <h4 class="font-bold text-gray-900 text-sm">${t.customer}</h4>
          <span class="text-xs text-gray-400 font-mono">${t.phone}</span>
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${t.status === 'Open' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}">${t.status}</span>
        </div>
        <p class="text-xs text-gray-600">${t.query}</p>
        <span class="text-[11px] text-gray-400 mt-1 block">${t.time}</span>
      </div>

      <button onclick="replySupportTicket('${t.id}')" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex-shrink-0">
        Reply via WhatsApp
      </button>
    </div>
  `).join('');
}

function replySupportTicket(id) {
  showToast('Opening support chat reply channel...');
}

// --------------------------------------------------------------------------
// 16. Event Bindings on DOMContentLoaded
// --------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  // Check auth state immediately
  checkAuth();

  // Login form submission
  const portalForm = document.getElementById('portalLoginForm');
  if (portalForm) portalForm.addEventListener('submit', handlePortalLogin);

  // Toggle password eye in portal login
  const toggleVis = document.getElementById('togglePasswordVis');
  if (toggleVis) {
    toggleVis.addEventListener('click', () => {
      const pwd = document.getElementById('portalPassword');
      if (pwd.type === 'password') {
        pwd.type = 'text';
      } else {
        pwd.type = 'password';
      }
    });
  }

  // Logout button
  const logoutBtn = document.getElementById('adminLogoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

  // Sidebar Menu Clicks (Exact 10 options)
  document.querySelectorAll('.menu-card-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });

  // Mobile drawer controls
  const mobileToggle = document.getElementById('mobileToggleBtn');
  if (mobileToggle) mobileToggle.addEventListener('click', openMobileDrawer);

  const sidebarClose = document.getElementById('sidebarCloseBtn');
  if (sidebarClose) sidebarClose.addEventListener('click', closeMobileDrawer);

  const backdrop = document.getElementById('sidebarBackdrop');
  if (backdrop) backdrop.addEventListener('click', closeMobileDrawer);

  // Search in catalog
  setupCatalogSearch();

  // Price input listeners for live discount calculation
  function updateFormDiscount() {
    const sp = Number(document.getElementById('prodSellingPrice')?.value) || 0;
    const mrp = Number(document.getElementById('prodMrp')?.value) || 0;
    const discInput = document.getElementById('prodDiscount');
    if (discInput && mrp > sp && sp > 0) {
      discInput.value = Math.round(((mrp - sp) / mrp) * 100);
    }
  }

  const spInput = document.getElementById('prodSellingPrice');
  const mrpInput = document.getElementById('prodMrp');
  if (spInput) spInput.addEventListener('input', updateFormDiscount);
  if (mrpInput) mrpInput.addEventListener('input', updateFormDiscount);

  // 🤖 1. AI Autofill Generator Button
  const aiBtn = document.getElementById('aiGenerateBtn');
  if (aiBtn) {
    aiBtn.addEventListener('click', () => {
      const val = (document.getElementById('aiProductTitle')?.value || '').trim();
      parseAndAutofillFromFlipkart(val);
    });
  }

  // 🖼️ 2. Feature Image Uploader
  const featureFile = document.getElementById('featureImageFile');
  if (featureFile) {
    featureFile.addEventListener('change', async (e) => {
      if (e.target.files && e.target.files[0]) {
        showToast('Uploading Feature Photo to Cloudinary...', 'info');
        try {
          const res = await uploadSingleFileToCloudinary(e.target.files[0]);
          featureImageUrl = res.url;
          renderFeatureImagePreview();
          showToast('Feature photo stored in Cloudinary!');
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    });
  }

  const featureUrlInput = document.getElementById('featureImageUrl');
  if (featureUrlInput) {
    featureUrlInput.addEventListener('input', () => {
      featureImageUrl = featureUrlInput.value.trim();
      renderFeatureImagePreview();
    });
  }

  // 🖼️ 3. Album Gallery Uploader
  const albumFiles = document.getElementById('albumImagesFiles');
  if (albumFiles) {
    albumFiles.addEventListener('change', async (e) => {
      if (e.target.files && e.target.files.length > 0) {
        showToast(`Uploading ${e.target.files.length} gallery photos to Cloudinary...`, 'info');
        for (let i = 0; i < e.target.files.length; i++) {
          try {
            const res = await uploadSingleFileToCloudinary(e.target.files[i]);
            albumImagesList.push(res.url);
          } catch (err) {
            console.error('Upload err:', err);
          }
        }
        renderAlbumImagesPreview();
        showToast('Gallery photos stored in Cloudinary!');
      }
    });
  }

  const addAlbumBtn = document.getElementById('addAlbumUrlBtn');
  if (addAlbumBtn) {
    addAlbumBtn.addEventListener('click', () => {
      const url = (document.getElementById('albumImageUrlInput')?.value || '').trim();
      if (url) {
        albumImagesList.push(url);
        document.getElementById('albumImageUrlInput').value = '';
        renderAlbumImagesPreview();
        showToast('Photo added to gallery!');
      }
    });
  }

  // 🖼️ 4. DSC Banner Images Uploader
  const dscFiles = document.getElementById('dscImageFiles');
  if (dscFiles) {
    dscFiles.addEventListener('change', async (e) => {
      if (e.target.files && e.target.files.length > 0) {
        showToast(`Uploading ${e.target.files.length} DSC banner photos to Cloudinary...`, 'info');
        for (let i = 0; i < e.target.files.length; i++) {
          try {
            const res = await uploadSingleFileToCloudinary(e.target.files[i]);
            dscImagesList.push(res.url);
          } catch (err) {
            console.error('Upload err:', err);
          }
        }
        renderDscImagesPreview();
        showToast('DSC banner photos stored in Cloudinary!');
      }
    });
  }

  const addDscBtn = document.getElementById('addDscUrlBtn');
  if (addDscBtn) {
    addDscBtn.addEventListener('click', () => {
      const url = (document.getElementById('dscImageUrlInput')?.value || '').trim();
      if (url) {
        dscImagesList.push(url);
        document.getElementById('dscImageUrlInput').value = '';
        renderDscImagesPreview();
        showToast('DSC banner image added!');
      }
    });
  }

  // 🎨 5. Color-Linked Variants Button
  const addVarBtn = document.getElementById('addColorVariantBtn');
  if (addVarBtn) {
    addVarBtn.addEventListener('click', addNewColorVariant);
  }

  // ⚙️ 6. Auto-Sync RAM & Storage on Variant Dropdown Change
  const defaultVarSelect = document.getElementById('defaultVariantSelect');
  if (defaultVarSelect) {
    defaultVarSelect.addEventListener('change', () => {
      const selectedColor = defaultVarSelect.value;
      const variant = productVariantsList.find(v => v.color_name === selectedColor);
      if (variant) {
        if (variant.ram) document.getElementById('defaultRamInput').value = variant.ram;
        if (variant.storage) document.getElementById('defaultStorageInput').value = variant.storage;
        document.getElementById('defaultColorInput').value = variant.color_name;
        showToast(`Auto-synced RAM & Storage for ${variant.color_name}!`);
      }
    });
  }

  const defaultColSelect = document.getElementById('defaultColorSelect');
  if (defaultColSelect) {
    defaultColSelect.addEventListener('change', () => {
      const selectedColor = defaultColSelect.value;
      const variant = productVariantsList.find(v => v.color_name === selectedColor);
      if (variant) {
        if (variant.ram) document.getElementById('defaultRamInput').value = variant.ram;
        if (variant.storage) document.getElementById('defaultStorageInput').value = variant.storage;
        document.getElementById('defaultColorInput').value = variant.color_name;
        showToast(`Auto-synced RAM & Storage for ${variant.color_name}!`);
      }
    });
  }

  // Product Form Submit
  const prodForm = document.getElementById('productEditForm');
  if (prodForm) prodForm.addEventListener('submit', handleProductFormSubmit);

  // Delete Confirm
  const confirmDel = document.getElementById('confirmDeleteBtn');
  if (confirmDel) confirmDel.addEventListener('click', handleConfirmDelete);

  // Bulk Price Form
  const bulkForm = document.getElementById('bulkPriceForm');
  if (bulkForm) bulkForm.addEventListener('submit', handleBulkPriceSubmit);

  // Payment Settings Form & Gateway Toggles
  const payForm = document.getElementById('paymentSettingsForm');
  if (payForm) payForm.addEventListener('submit', handlePaymentSettingsSubmit);
  initGatewayToggles();

  // Password change form
  const pwdForm = document.getElementById('changePasswordForm');
  if (pwdForm) pwdForm.addEventListener('submit', handlePasswordChange);

  // Cloudinary settings form
  const cloudForm = document.getElementById('cloudinarySettingsForm');
  if (cloudForm) cloudForm.addEventListener('submit', handleCloudinarySettingsSubmit);

  // Initialize Site Mode & Mobile-Only Shield
  fetchClientSiteMode();
  fetchMobileShieldStatus();
});

// --------------------------------------------------------------------------
// 12. Website Mode & Domain Shield (GoDaddy Protection)
// --------------------------------------------------------------------------
let currentClientSiteMode = 'flipkart';

async function fetchClientSiteMode() {
  try {
    const res = await fetch(`${API_BASE}/site-mode`, { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    if (data.success && data.siteMode) {
      currentClientSiteMode = data.siteMode;
      renderClientSiteModeUI();
    }
  } catch (err) {
    console.error('Failed to fetch site mode:', err);
  }
}

function selectClientSiteMode(mode) {
  currentClientSiteMode = mode;
  renderClientSiteModeUI();
}

function renderClientSiteModeUI() {
  const isAi = (currentClientSiteMode === 'ai');
  const badge = document.getElementById('clientSiteModeBadge');
  const cardF = document.getElementById('clientCardFlipkart');
  const cardA = document.getElementById('clientCardAi');
  const radF = document.getElementById('clientRadioFlipkart');
  const radA = document.getElementById('clientRadioAi');
  const sideBadge = document.getElementById('sidebarShieldBadge');
  const dashSub = document.getElementById('dashShieldSub');

  if (badge) {
    badge.className = isAi 
      ? 'text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700'
      : 'text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700';
    badge.innerHTML = isAi ? '🛡️ Safe AI Shield Active' : '🟢 Flipkart Live';
  }

  if (sideBadge) {
    sideBadge.textContent = isAi ? 'AI Shield' : 'Flipkart';
    sideBadge.className = isAi ? 'badge-pill-purple' : 'badge-pill-gray';
  }

  if (dashSub) {
    dashSub.textContent = isAi ? '🛡️ Safe AI Active' : '🟢 Flipkart Live';
  }

  if (cardF && cardA) {
    if (isAi) {
      cardF.className = 'p-4 rounded-xl border-2 border-gray-200 bg-white cursor-pointer transition hover:border-blue-300 hover:shadow-sm';
      cardA.className = 'p-4 rounded-xl border-2 border-purple-600 bg-purple-50/50 cursor-pointer transition hover:shadow-sm';
      if (radF) radF.checked = false;
      if (radA) radA.checked = true;
    } else {
      cardF.className = 'p-4 rounded-xl border-2 border-blue-600 bg-blue-50/50 cursor-pointer transition hover:shadow-sm';
      cardA.className = 'p-4 rounded-xl border-2 border-gray-200 bg-white cursor-pointer transition hover:border-purple-300 hover:shadow-sm';
      if (radF) radF.checked = true;
      if (radA) radA.checked = false;
    }
  }
}

async function saveClientSiteMode() {
  const btn = document.getElementById('saveSiteModeBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="inline-block animate-spin mr-1">⟳</span> Saving...`;
  }

  try {
    const res = await fetch(`${API_BASE}/site-mode`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ siteMode: currentClientSiteMode })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast(data.message || `Website mode updated to ${currentClientSiteMode === 'ai' ? 'Safe AI Site' : 'Flipkart Store'}!`);
      renderClientSiteModeUI();
    } else {
      showToast(data.error || 'Failed to update website mode.', 'error');
    }
  } catch (err) {
    showToast('Network error while saving website mode.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Save Website Mode';
    }
  }
}

window.selectClientSiteMode = selectClientSiteMode;
window.saveClientSiteMode = saveClientSiteMode;
window.fetchClientSiteMode = fetchClientSiteMode;

// --------------------------------------------------------------------------
// 13. Mobile-Only Shield & Anti-Inspection (Developer Protection)
// --------------------------------------------------------------------------
let isMobileShieldEnabled = false;

async function fetchMobileShieldStatus() {
  try {
    const res = await fetch(`${API_BASE}/mobile-shield`, { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    if (data.success) {
      isMobileShieldEnabled = !!data.mobileOnly;
      renderMobileShieldUI();
    }
  } catch (err) {
    console.error('Failed to fetch mobile shield status:', err);
  }
}

function renderMobileShieldUI() {
  const toggle = document.getElementById('mobileShieldToggle');
  const badge = document.getElementById('mobileShieldStatusBadge');
  const label = document.getElementById('mobileShieldToggleLabel');
  const sync = document.getElementById('mobileShieldSyncStatus');

  if (toggle) toggle.checked = isMobileShieldEnabled;
  if (label) {
    label.textContent = isMobileShieldEnabled ? 'ON' : 'OFF';
    label.className = isMobileShieldEnabled ? 'text-xs font-extrabold text-red-600 uppercase' : 'text-xs font-extrabold text-gray-500 uppercase';
  }
  if (badge) {
    badge.className = isMobileShieldEnabled
      ? 'text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 animate-pulse'
      : 'text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600';
    badge.innerHTML = isMobileShieldEnabled ? '🛡️ ACTIVE · MOBILE ONLY' : '⚪ OFF';
  }
  if (sync) {
    sync.textContent = isMobileShieldEnabled ? 'Active (PC Redirected to Google)' : 'Inactive (All Devices Allowed)';
    sync.className = isMobileShieldEnabled ? 'text-[11px] text-red-500 font-semibold' : 'text-[11px] text-gray-400 font-medium';
  }
}

async function toggleMobileShieldSwitch(checked) {
  isMobileShieldEnabled = checked;
  renderMobileShieldUI();
  const sync = document.getElementById('mobileShieldSyncStatus');
  if (sync) sync.textContent = 'Saving to MongoDB...';

  try {
    const res = await fetch(`${API_BASE}/mobile-shield`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ mobileOnly: checked })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      isMobileShieldEnabled = !!data.mobileOnly;
      renderMobileShieldUI();
      showToast(checked 
        ? '🛡️ Mobile-Only Shield ACTIVATED! PC users will be instantly redirected to Google.' 
        : '🟢 Mobile-Only Shield turned OFF. PC & Mobile users can now browse normally.'
      );
    } else {
      isMobileShieldEnabled = !checked;
      renderMobileShieldUI();
      showToast(data.error || 'Failed to update shield settings.', 'error');
    }
  } catch (err) {
    isMobileShieldEnabled = !checked;
    renderMobileShieldUI();
    showToast('Network error while saving shield settings.', 'error');
  }
}

window.toggleMobileShieldSwitch = toggleMobileShieldSwitch;
window.fetchMobileShieldStatus = fetchMobileShieldStatus;

// Sync all product variant & color prices to base selling price
async function syncProductPricesAction() {
  if (!confirm('Are you sure you want to synchronize all variant and color prices to each product\'s base selling price?')) return;
  try {
    const res = await fetch(`${API_BASE}/sync-prices`, {
      method: 'POST',
      headers: authHeaders()
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast(data.message || 'Product prices synced successfully!', 'success');
      if (typeof loadCatalog === 'function') loadCatalog();
    } else {
      showToast(data.error || 'Failed to sync prices.', 'error');
    }
  } catch (err) {
    showToast('Network error while syncing prices: ' + err.message, 'error');
  }
}
window.syncProductPricesAction = syncProductPricesAction;



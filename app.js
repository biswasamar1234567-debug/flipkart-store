// ==========================================================================
// FLIPKART MOBILE WEB APPLICATION JAVASCRIPT
// Handles countdown timer, dynamic catalog grid, brand logos & checkout drawer
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {

  // BRAND LOGOS DICTIONARY FOR HOMEPAGE
  const BRAND_LOGOS = {
    apple: { name: 'Apple', svg: `<svg viewBox="0 0 170 170" width="13" height="13" fill="currentColor"><path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.04-7.58-7.74-11.64-14.1-6.19-9.67-11.04-20.73-14.54-33.19-3.51-12.45-5.26-24.16-5.26-35.13 0-14.89 3.86-27.42 11.58-37.58 7.72-10.16 17.51-15.35 29.37-15.57 5.01 0 10.66 1.34 16.96 4.02 6.3 2.68 10.15 4.08 11.54 4.22 2.39-.4 6.74-1.99 13.06-4.78 6.32-2.79 11.83-4.04 16.53-3.76 13.06.75 23.36 5.61 30.91 14.57-11.53 7-17.18 16.71-16.96 29.13.22 10.22 4.13 18.78 11.75 25.68 7.62 6.9 16.53 10.65 26.74 11.25-2.61 8.26-6.15 17.06-10.63 26.4zm-37.16-118.23c0 7.39-2.67 14.37-8.01 20.94-6.42 7.72-14.34 12.39-23.77 14-1.1-6.95.83-14.07 5.79-21.36 4.96-7.29 11.6-11.89 19.92-13.8 3.86-.3 6.07.22 6.07.22z"/></svg>` },
    samsung: { name: 'Samsung', svg: `<svg viewBox="0 0 130 20" width="46" height="11" fill="#1428a0"><path d="M7.4 9.1c-2.4-.6-3.8-1.2-3.8-2.5 0-1.2 1.3-2 3.1-2 1.9 0 3.3.7 4.2 1.8l2-1.9C11.5 3 9.4 2 6.8 2 3.1 2 0.8 4 0.8 7c0 3.1 2.3 4.4 5.3 5.2 2.7.7 4.1 1.4 4.1 2.8 0 1.4-1.4 2.2-3.5 2.2-2.3 0-4-1-5.1-2.4l-2.1 2c1.6 1.9 4 3 7.2 3 4.1 0 6.5-2.2 6.5-5.3 0-3.3-2.6-4.7-5.8-5.4zm16.9-6.8h-3.3L15.3 19h3.1l1.3-3.8h5.9l1.3 3.8h3.2L24.3 2.3zm-3.8 10.3l2.2-6.5 2.2 6.5h-4.4zm14.6-10.3h-3.2V19h2.9l6.5-11.1V19h3.2V2.3h-2.9l-6.5 11.1V2.3zm19.9 6.8c-2.4-.6-3.8-1.2-3.8-2.5 0-1.2 1.3-2 3.1-2 1.9 0 3.3.7 4.2 1.8l2-1.9C57.4 3 55.3 2 52.7 2c-3.7 0-6 2-6 5 0 3.1 2.3 4.4 5.3 5.2 2.7.7 4.1 1.4 4.1 2.8 0 1.4-1.4 2.2-3.5 2.2-2.3 0-4-1-5.1-2.4l-2.1 2c1.6 1.9 4 3 7.2 3 4.1 0 6.5-2.2 6.5-5.3 0-3.3-2.6-4.7-5.8-5.4zm18.3-6.8h-3.2v10.9c0 2.2-1.3 3.4-3.3 3.4s-3.3-1.2-3.3-3.4V2.3h-3.2v11.1c0 3.7 2.6 5.8 6.5 5.8 3.9 0 6.5-2.1 6.5-5.8V2.3zm8.3 0h-3.2v16.7h3.1l5.8-10.1 5.8 10.1h3.1V2.3h-3.2v10.9l-4.7-8.2h-2l-4.7 8.2V2.3zm29.1 8.2h6.2V7.7h-6.2v-2.6h7.6V2.3h-10.8V19h10.8v-2.8h-7.6v-5.7z"/></svg>` },
    oneplus: { name: 'OnePlus', svg: `<svg viewBox="0 0 24 24" width="13" height="13"><rect width="24" height="24" rx="4" fill="#eb0028"/><text x="12" y="17" fill="#ffffff" font-size="14" font-family="sans-serif" font-weight="900" text-anchor="middle">1+</text></svg>` },
    google: { name: 'Google', svg: `<svg viewBox="0 0 24 24" width="13" height="13"><path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.03h3.88c2.27-2.09 3.665-5.17 3.665-9.12z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.03c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.13C3.25 21.37 7.33 24 12 24z"/><path fill="#FBBC05" d="M5.28 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.58H1.26C.46 8.18 0 10.03 0 12s.46 3.82 1.26 5.42l4.02-3.13z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.25 2.63 1.26 6.58l4.02 3.13c.95-2.83 3.6-4.96 6.72-4.96z"/></svg>` },
    xiaomi: { name: 'Xiaomi', svg: `<svg viewBox="0 0 24 24" width="13" height="13"><rect width="24" height="24" rx="6" fill="#ff6900"/><path fill="#ffffff" d="M7 8h2v8H7zm4 0h5a2 2 0 0 1 2 2v6h-2v-6h-3v6h-2z"/></svg>` },
    realme: { name: 'realme', svg: `<svg viewBox="0 0 60 20" width="40" height="13"><rect width="60" height="20" rx="4" fill="#ffc915"/><text x="30" y="14" fill="#000000" font-size="11" font-weight="900" font-family="sans-serif" text-anchor="middle">realme</text></svg>` },
    vivo: { name: 'vivo', svg: `<svg viewBox="0 0 60 20" width="40" height="13"><text x="30" y="15" fill="#415fff" font-size="16" font-style="italic" font-weight="900" font-family="sans-serif" text-anchor="middle">vivo</text></svg>` },
    boat: { name: 'boAt', svg: `<svg viewBox="0 0 50 20" width="38" height="13"><text x="25" y="15" fill="#eb142b" font-size="14" font-weight="900" font-family="sans-serif" text-anchor="middle">bo<tspan fill="#000">A</tspan>t</text></svg>` },
    motorola: { name: 'Motorola', svg: `<svg viewBox="0 0 24 24" width="13" height="13"><circle cx="12" cy="12" r="11" fill="#00142e"/><path fill="#ffffff" d="M12 8.5c-.8 0-1.8 1.4-2.5 3.3-.6-1.9-1.6-3.3-2.4-3.3-1.6 0-2.6 2.7-2.6 6.1 0 1 .2 1.8.4 2.4.6-.2 1.3-.7 1.8-1.5.8-1.3 1.4-3.3 1.9-5.1.7 2 1.5 4 2.2 4.9.4.5.8.7 1.2.7s.8-.2 1.2-.7c.7-.9 1.5-2.9 2.2-4.9.5 1.8 1.1 3.8 1.9 5.1.5.8 1.2 1.3 1.8 1.5.2-.6.4-1.4.4-2.4 0-3.4-1-6.1-2.6-6.1-.8 0-1.8 1.4-2.4 3.3-.8-1.9-1.8-3.3-2.6-3.3z"/></svg>` },
    safari: { name: 'Safari', svg: `<svg viewBox="0 0 24 24" width="13" height="13"><circle cx="12" cy="12" r="10" fill="#0066cc"/><polygon points="12,5 15,12 12,19 9,12" fill="#ff3333"/><polygon points="12,19 9,12 12,5" fill="#ffffff" opacity="0.6"/></svg>` }
  };

  function getCardBrandInfo(brandOrName) {
    const str = String(brandOrName || '').toLowerCase();
    for (const [key, val] of Object.entries(BRAND_LOGOS)) {
      if (str.includes(key)) return val;
    }
    return {
      name: brandOrName || 'Verified',
      svg: `<svg viewBox="0 0 24 24" width="13" height="13" fill="#2563eb"><path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5zm-1 14.5l-4-4 1.41-1.41L11 13.67l6.59-6.59L19 8.5l-8 8z"/></svg>`
    };
  }

  let allStoreProducts = [];
  let currentCategory = 'all';

  function generateStars(rating) {
    let starsHTML = '';
    const r = parseFloat(rating) || 4.5;
    const fullStars = Math.floor(r);
    const halfStar = r % 1 >= 0.5 ? 1 : 0;
    const emptyStars = Math.max(0, 5 - fullStars - halfStar);

    for (let i = 0; i < fullStars; i++)
      starsHTML += '<i class="bi bi-star-fill"></i>';
    if (halfStar) starsHTML += '<i class="bi bi-star-half"></i>';
    for (let i = 0; i < emptyStars; i++)
      starsHTML += '<i class="bi bi-star"></i>';

    return starsHTML;
  }

  function getDeliveryDate(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + (offsetDays || 2));
    const day = d.getDate();

    let suffix = 'th';
    if (day === 1 || day === 21 || day === 31) suffix = 'st';
    else if (day === 2 || day === 22) suffix = 'nd';
    else if (day === 3 || day === 23) suffix = 'rd';

    const month = d.toLocaleString('en-IN', { month: 'short' });
    return `${day}${suffix} ${month}`;
  }

  function getRandomStockTag(p, idx) {
    if (p.stock !== undefined && p.stock <= 5) {
      return { text: `Only ${p.stock} left`, color: '#b90000' };
    }
    if (idx % 2 === 0) {
      return { text: `Only ${Math.min(15, (p.stock || 3))} left`, color: '#b90000' };
    }
    const deals = ['Hot deal', 'Special offer', 'Best deals', 'Trending', 'Super deals'];
    return { text: deals[idx % deals.length], color: '#008c00' };
  }

  // Dynamic Product Grid Loader
  function renderProductsGrid(list) {
    const grid = document.querySelector('.products-grid');
    if (!grid) return;

    const visibleList = (list || []).filter(p => !p.hidden);

    if (visibleList.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 42px 16px; background: #ffffff; border-radius: 16px; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin: 8px;">
          <div style="font-size: 36px; margin-bottom: 8px;">📦</div>
          <div style="font-weight: 700; color: #111827; font-size: 15px;">No products found in this category</div>
          <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">More deals and products are being added soon.</div>
          <button onclick="filterProductsByCategory('all')" style="margin-top: 14px; padding: 8px 20px; background: #2874f0; color: #fff; border: none; border-radius: 8px; font-weight: 700; font-size: 12px; cursor: pointer;">View All Products</button>
        </div>
      `;
      return;
    }

    grid.innerHTML = visibleList.map((p, idx) => {
      const pMrp = Number(p.mrp) || 147900;
      const pPrice = Number(p.selling_price) || 999;
      let pDisc = pMrp > pPrice ? Math.round(((pMrp - pPrice) / pMrp) * 100) : 99;
      if (pDisc === 100) pDisc = 99;
      const pRating = p.rating || 4.5;
      const pReviews = p.reviews_count || 500;
      const stock = getRandomStockTag(p, idx);
      const deliveryText = getDeliveryDate(idx % 2 === 0 ? 2 : 3);
      
      // Image resolution: strictly img1 first
      let img = p.img1;
      if (!img && Array.isArray(p.images) && p.images[0]) {
        img = p.images[0];
      }
      if (!img && p.colors && p.colors[0]) {
        img = p.colors[0].color_img || (p.colors[0].images && p.colors[0].images[0]);
      }
      if (!img && p.id === 'iphone17') img = 'assets/images/iphone_orange.jpg';
      else if (!img && p.id === 'iphone16') img = 'assets/images/iphone_black.jpg';
      if (!img) img = 'assets/images/iphone_orange.jpg';

      const storeParam = new URLSearchParams(window.location.search).get('store');
      const storeSuffix = storeParam ? `&store=${encodeURIComponent(storeParam)}` : '';

      return `
        <a href="product.html?id=${encodeURIComponent(p.id)}${storeSuffix}" class="item fk-product-card" data-product-id="${p.id}">
          <div class="img-wrap card-img-area">
            <img src="${img}" alt="${p.name}" class="card-img" loading="lazy" onerror="this.src='assets/images/iphone_orange.jpg'">
          </div>
          <div class="details card-details-area">
            <div class="title card-title">${p.title1 || p.name}</div>
            
            <div class="rating-row card-rating-row">
              <span class="stars">${generateStars(pRating)}</span>
              <span class="count card-review-count">(${Number(pReviews).toLocaleString('en-IN')})</span>
              <img class="assured fk-assured-img" src="assets/images/fk_assured_promo.png" onerror="this.src='https://rukminim2.flixcart.com/www/120/32/promos/25/06/2024/71af54bd-9160-41ff-81cc-c55e534dedeb.png?q=60'" alt="Assured">
            </div>
            
            <div class="price-row card-pricing-row">
              <span class="disc card-discount"><svg class="disc-arrow" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="2" x2="8" y2="14"></line><polyline points="13 9 8 14 3 9"></polyline></svg>${pDisc}%</span>
              <span class="mrp card-mrp">₹${pMrp.toLocaleString('en-IN')}</span>
              <span class="sell card-selling-price">₹${pPrice.toLocaleString('en-IN')}</span>
            </div>
            
            <div class="wow card-offer-row">
              <img src="assets/images/fk_wow_promo.png" onerror="this.src='https://rukminim2.flixcart.com/www/92/39/promos/30/08/2023/59dc7885-72bf-4135-9099-025f074b0eb1.png?q=90'" alt="WOW">
              <span class="wow-price">₹${pPrice.toLocaleString('en-IN')}</span>
              <span class="wow-text">with offer</span>
            </div>
            
            <div class="stock-text card-deal-status" style="color: ${stock.color};">${stock.text}</div>
            
            <div class="delivery card-delivery-row">Delivery by <b>${deliveryText}</b></div>
          </div>
        </a>
      `;
    }).join('');
  }

  // Real-time Fetch products with no-cache and fallback
  async function loadStoreProducts() {
    try {
      const storeParam = new URLSearchParams(window.location.search).get('store');
      const storeQuery = storeParam ? '&store=' + encodeURIComponent(storeParam) : '';
      const res = await fetch('/api/products?_t=' + Date.now() + storeQuery, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.products) && data.products.length > 0) {
          allStoreProducts = data.products;
          try {
            sessionStorage.setItem('fk_catalog', JSON.stringify(data.products));
            localStorage.setItem('fk_catalog', JSON.stringify(data.products));
          } catch(e) {}
          applyCategoryFilter();
          return;
        }
      }
    } catch (e) {
      console.warn('API /api/products fetch failed, attempting fallback to data.json:', e);
    }

    try {
      const res = await fetch('./data.json?_t=' + Date.now(), { cache: 'no-store' });
      const data = await res.json();
      if (data && Array.isArray(data.products) && data.products.length > 0) {
        allStoreProducts = data.products;
        try {
          sessionStorage.setItem('fk_catalog', JSON.stringify(data.products));
          localStorage.setItem('fk_catalog', JSON.stringify(data.products));
        } catch(e) {}
        applyCategoryFilter();
      }
    } catch (err) {
      console.warn('Could not load data.json on homepage:', err);
    }
  }

  // Real-time Dynamic Category Loader from API
  async function loadStoreCategories() {
    try {
      const res = await fetch('/api/categories?_t=' + Date.now(), { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.categories)) {
          const quickRow = document.getElementById('quickCategoriesRow');
          if (quickRow && data.categorySize) {
            quickRow.style.setProperty('--cat-icon-size', `${data.categorySize}px`);
          }
          renderQuickCategories(data.categories);
        }
      }
    } catch (e) {
      console.warn('Could not load categories dynamically:', e);
    }
  }

  function renderQuickCategories(categories) {
    const quickRow = document.getElementById('quickCategoriesRow');
    if (!quickRow) return;

    // Filter only active categories
    const activeCats = categories.filter(c => c.active !== false);

    quickRow.innerHTML = activeCats.map(cat => {
      const imgTag = cat.image
        ? `<img src="${cat.image}" alt="${cat.name}" class="quick-cat-img" onerror="this.onerror=null; this.src='https://static-assets-web.flixcart.com/apex-static/images/svgs/L1Nav/mobiles.svg'">`
        : `<span class="quick-cat-emoji">📱</span>`;

      const isActive = currentCategory === (cat.id || '').toLowerCase();

      return `
        <div class="quick-cat-item ${isActive ? 'active' : ''}" data-category="${cat.id}" onclick="filterProductsByCategory('${cat.id}')">
          <div class="quick-cat-img-box">
            ${imgTag}
          </div>
          <span class="quick-cat-name">${cat.name}</span>
        </div>
      `;
    }).join('');
  }

  // ---------------------------------------------------------------
  // Promotional banner carousel on the homepage (fetched from Mongo)
  // ---------------------------------------------------------------
  let bannerSlides = [];
  let bannerIdx = 0;
  let bannerTimer = null;
  const BANNER_INTERVAL = 4000;

  async function loadStoreBanners() {
    try {
      const res = await fetch('/api/banners?_t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data && data.banners)
        ? data.banners.filter(b => b && b.active !== false && b.image)
        : [];
      // Nothing configured -> keep the static fallback banner in the HTML
      if (list.length > 0) renderHeroBanners(list);
    } catch (e) {
      console.warn('Could not load banners dynamically:', e);
    }
  }

  function renderHeroBanners(list) {
    const wrap = document.getElementById('heroBannerWrapper');
    if (!wrap) return;

    bannerSlides = list;
    bannerIdx = 0;

    const slides = list.map((b, i) => `
      <div class="bn-slide ${i === 0 ? 'active' : ''}" data-idx="${i}">
        <a href="${b.link || '/'}">
          <img src="${b.image}" alt="${b.title || 'Special Offer'}" class="bbd-banner-img"
               ${i === 0 ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'} />
        </a>
        <div class="banner-glow-overlay"></div>
      </div>
    `).join('');

    const controls = list.length > 1 ? `
      <button type="button" class="bn-arrow prev" aria-label="Previous banner"><i class="bi bi-chevron-left"></i></button>
      <button type="button" class="bn-arrow next" aria-label="Next banner"><i class="bi bi-chevron-right"></i></button>
      <div class="banner-dots">
        ${list.map((_, i) => `<button type="button" class="banner-dot ${i === 0 ? 'active' : ''}" data-idx="${i}" aria-label="Go to banner ${i + 1}"></button>`).join('')}
      </div>` : '';

    wrap.innerHTML = slides + controls;

    if (list.length > 1) {
      wrap.querySelectorAll('.bn-arrow').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          showBanner(btn.classList.contains('next') ? bannerIdx + 1 : bannerIdx - 1);
          restartBannerTimer();
        });
      });
      wrap.querySelectorAll('.banner-dot').forEach(dot => {
        dot.addEventListener('click', (e) => {
          e.preventDefault();
          showBanner(parseInt(dot.dataset.idx, 10));
          restartBannerTimer();
        });
      });
      startBannerTimer();
    }
  }

  function showBanner(i) {
    if (!bannerSlides.length) return;
    bannerIdx = (i + bannerSlides.length) % bannerSlides.length;

    document.querySelectorAll('#heroBannerWrapper .bn-slide').forEach(el => {
      el.classList.toggle('active', Number(el.dataset.idx) === bannerIdx);
    });
    document.querySelectorAll('#heroBannerWrapper .banner-dot').forEach(el => {
      el.classList.toggle('active', Number(el.dataset.idx) === bannerIdx);
    });
  }

  function startBannerTimer() {
    clearInterval(bannerTimer);
    bannerTimer = setInterval(() => showBanner(bannerIdx + 1), BANNER_INTERVAL);
  }

  function restartBannerTimer() { startBannerTimer(); }

  window.filterProductsByCategory = function(categorySlug) {
    currentCategory = (categorySlug || 'all').toLowerCase();
    applyCategoryFilter();
  };

  function applyCategoryFilter() {
    // Update quick-categories active class
    document.querySelectorAll('.quick-cat-item').forEach(el => {
      const cat = (el.dataset.category || '').toLowerCase();
      el.classList.toggle('active', cat === currentCategory);
    });

    // Update top tabs active class
    document.querySelectorAll('.cat-tab').forEach(tab => {
      const tabId = (tab.dataset.tab || '').toLowerCase();
      const isActive = tabId === currentCategory || ((currentCategory === 'all' || currentCategory === 'for-you') && tabId === 'for-you');
      tab.classList.toggle('active', isActive);
    });

    if (currentCategory === 'all' || currentCategory === 'for-you') {
      renderProductsGrid(allStoreProducts);
    } else {
      const filtered = allStoreProducts.filter(p => {
        const pCat = String(p.category || '').toLowerCase();
        const pName = String(p.name || '').toLowerCase();
        const pBrand = String(p.brand || '').toLowerCase();
        return pCat === currentCategory || pCat.includes(currentCategory) || pName.includes(currentCategory) || pBrand.includes(currentCategory);
      });
      renderProductsGrid(filtered);
    }
  }

  // Setup top tab listeners
  document.querySelectorAll('.cat-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = tab.dataset.tab;
      filterProductsByCategory(tabId);
    });
  });

  // Initial load
  loadStoreProducts();
  loadStoreCategories();
  loadStoreBanners();

  // Products Data Fallback for Checkout Drawer
  const products = {
    1: {
      title: 'Apple iPhone 17 Pro Max (Cosmic Orange, 256 GB)',
      price: '₹999',
      mrp: '₹1,47,900',
      discount: '- ₹1,46,901',
      delivery: '13th Oct',
      image: 'assets/images/iphone_orange.jpg'
    },
    2: {
      title: 'Apple iPhone 16 Pro Max (Black Titanium, 256 GB)',
      price: '₹998',
      mrp: '₹1,34,900',
      discount: '- ₹1,33,902',
      delivery: '12th Oct',
      image: 'assets/images/iphone_black.jpg'
    }
  };

  // 1. Live Countdown Timer (Ticks down from 08:15 like latest screenshot)
  const timerElement = document.getElementById('saleCountdown');
  let totalSeconds = 8 * 60 + 15; // 08:15

  function updateTimer() {
    if (totalSeconds <= 0) {
      totalSeconds = 15 * 60; // reset loop for continuous demo
    }
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const formattedMinutes = String(minutes).padStart(2, '0');
    const formattedSeconds = String(seconds).padStart(2, '0');
    
    if (timerElement) {
      timerElement.textContent = `${formattedMinutes}:${formattedSeconds}`;
    }
    totalSeconds--;
  }

  setInterval(updateTimer, 1000);
  updateTimer();

  // 2. Toast Notification Helper
  const toast = document.getElementById('toastNotification');
  const toastMsg = document.getElementById('toastMessage');
  let toastTimer = null;

  function showToast(message) {
    if (!toast || !toastMsg) return;
    toastMsg.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }

  // 3. Category Tabs Switching
  const categoryTabs = document.querySelectorAll('.cat-tab');
  categoryTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      categoryTabs.forEach(t => {
        t.classList.remove('active');
        const indicator = t.querySelector('.tab-indicator');
        if (indicator) indicator.remove();
      });

      tab.classList.add('active');
      const indicator = document.createElement('div');
      indicator.className = 'tab-indicator';
      tab.appendChild(indicator);

      const tabName = tab.querySelector('span')?.textContent || 'Category';
      showToast(`Showing deals for: ${tabName}`);
    });
  });

  // 4. Modal Drawer & Checkout Flow
  const checkoutModal = document.getElementById('checkoutModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const confirmOrderBtn = document.getElementById('confirmOrderBtn');
  const orderSuccessOverlay = document.getElementById('orderSuccessOverlay');
  const successDoneBtn = document.getElementById('successDoneBtn');
  const orderSuccessSub = document.getElementById('orderSuccessSub');

  // Modal elements to populate
  const modalThumb = document.getElementById('modalThumb');
  const modalTitle = document.getElementById('modalTitle');
  const modalPrice = document.getElementById('modalPrice');
  const modalMrp = document.getElementById('modalMrp');
  const modalBreakupMrp = document.getElementById('modalBreakupMrp');
  const modalBreakupDiscount = document.getElementById('modalBreakupDiscount');
  const modalBreakupTotal = document.getElementById('modalBreakupTotal');
  const modalFooterTotal = document.getElementById('modalFooterTotal');

  let activeProduct = products[1];

  function openCheckout(productId) {
    const item = products[productId] || products[1];
    activeProduct = item;

    if (modalThumb) modalThumb.src = item.image;
    if (modalTitle) modalTitle.textContent = item.title;
    if (modalPrice) modalPrice.textContent = item.price;
    if (modalMrp) modalMrp.textContent = item.mrp;
    if (modalBreakupMrp) modalBreakupMrp.textContent = item.mrp;
    if (modalBreakupDiscount) modalBreakupDiscount.textContent = item.discount;
    if (modalBreakupTotal) modalBreakupTotal.textContent = item.price;
    if (modalFooterTotal) modalFooterTotal.textContent = item.price;

    if (checkoutModal) {
      checkoutModal.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeCheckout() {
    if (checkoutModal) {
      checkoutModal.classList.remove('open');
      document.body.style.overflow = '';
    }
  }

  // Bind click on product cards to pre-cache product and navigate to Product Details Page
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.fk-product-card');
    if (!card) return;
    let pid = card.getAttribute('data-product-id') || card.getAttribute('data-product');
    if (!pid) {
      const href = card.getAttribute('href') || '';
      const match = href.match(/[?&]id=([^&#]+)/);
      if (match) pid = decodeURIComponent(match[1]);
    }
    if (pid && Array.isArray(allStoreProducts) && allStoreProducts.length > 0) {
      const target = String(pid).toLowerCase();
      const p = allStoreProducts.find(item => 
        String(item.id || '').toLowerCase() === target ||
        String(item._id || '').toLowerCase() === target ||
        (target === '1' && (item.id === 'apple-iphone-17-pro-max-256-gb' || item.id === 'iphone17')) ||
        (target === '2' && (item.id === 'apple-iphone-16-pro-max-256-gb' || item.id === 'iphone16'))
      );
      if (p) {
        try {
          sessionStorage.setItem('fk_active_product_' + p.id, JSON.stringify(p));
          sessionStorage.setItem('fk_active_product_' + pid, JSON.stringify(p));
          sessionStorage.setItem('fk_last_active_product', JSON.stringify(p));
        } catch(err) {}
      }
    }
  }, true);

  const shopNowBtn = document.getElementById('shopNowBtn');
  if (shopNowBtn) {
    shopNowBtn.addEventListener('click', () => {
      const grid = document.querySelector('.products-grid');
      if (grid) {
        grid.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closeCheckout);
  }

  if (checkoutModal) {
    checkoutModal.addEventListener('click', (e) => {
      if (e.target === checkoutModal) {
        closeCheckout();
      }
    });
  }

  // 5. Order Confirmation Flow
  if (confirmOrderBtn) {
    confirmOrderBtn.addEventListener('click', () => {
      closeCheckout();
      if (orderSuccessSub) {
        orderSuccessSub.innerHTML = `${activeProduct.title} will be delivered by <strong>${activeProduct.delivery}</strong>.`;
      }
      if (orderSuccessOverlay) {
        orderSuccessOverlay.classList.add('show');
      }
    });
  }

  if (successDoneBtn) {
    successDoneBtn.addEventListener('click', () => {
      if (orderSuccessOverlay) {
        orderSuccessOverlay.classList.remove('show');
      }
      showToast('🎉 Thank you for shopping on Flipkart!');
    });
  }

  // 6. Payment Option Selection
  const payOptions = document.querySelectorAll('.pay-option');
  payOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      payOptions.forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
    });
  });

  // 7. Search Bar Interactions
  const searchInput = document.getElementById('searchInput');
  const cameraSearchBtn = document.getElementById('cameraSearchBtn');
  const micSearchBtn = document.getElementById('micSearchBtn');
  const qrBtn = document.getElementById('qrBtn');

  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const query = searchInput.value.trim();
        if (query) {
          showToast(`🔍 Searching for "${query}"...`);
        }
      }
    });
  }

  if (cameraSearchBtn) {
    cameraSearchBtn.addEventListener('click', () => {
      showToast('📷 Visual Search: Point camera at any product');
    });
  }

  if (micSearchBtn) {
    micSearchBtn.addEventListener('click', () => {
      showToast('🎙️ Voice Search listening...');
    });
  }

  if (qrBtn) {
    qrBtn.addEventListener('click', () => {
      showToast('📱 Scanning QR code...');
    });
  }

  // 8. Location & SuperCoin Pills
  const locationBtn = document.getElementById('locationBtn');
  if (locationBtn) {
    locationBtn.addEventListener('click', () => {
      showToast('📍 Select delivery location');
    });
  }

  const supercoinBadge = document.getElementById('supercoinBadge');
  if (supercoinBadge) {
    supercoinBadge.addEventListener('click', () => {
      showToast('⚡ SuperCoins Balance: 0');
    });
  }
});

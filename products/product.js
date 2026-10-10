// ==========================================================================
// FLIPKART PRODUCT DETAILS PAGE (PDP) CONTROLLER
// Handles dynamic product loading, image album slider, countdown timer,
// similar products, reviews lightbox, and Buy Now checkout integration.
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {

  // 1. Get Product ID from URL parameters
  function getQueryParam(param) {
    const params = new URLSearchParams(window.location.search);
    return params.get(param);
  }

  const productId = getQueryParam('id') || 'iphone17';

  // 2. Toast Helper
  const toastEl = document.getElementById('toastMsg');
  let toastTimeout = null;
  function showToast(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toastEl.classList.remove('show');
    }, 2500);
  }

  // 3. Live Countdown Timer (Ticks down from 14m 54s matching Screenshot 1)
  const timerDisplay = document.getElementById('offerTimer');
  let totalSeconds = 14 * 60 + 54; // 14m 54s

  function updateCountdown() {
    if (totalSeconds <= 0) {
      totalSeconds = 15 * 60; // Loop seamlessly
    }
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    if (timerDisplay) {
      timerDisplay.textContent = `${mins}m ${String(secs).padStart(2, '0')}s`;
    }
    totalSeconds--;
  }
  setInterval(updateCountdown, 1000);
  updateCountdown();

  // 4. Dynamic Delivery Date (Today + 2 Days, formatted e.g. "Mon, Oct 12")
  const deliveryDateEl = document.getElementById('deliveryDateText');
  if (deliveryDateEl) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 2);
    const options = { weekday: 'short', month: 'short', day: 'numeric' };
    const dateFormatted = targetDate.toLocaleDateString('en-US', options);
    deliveryDateEl.textContent = dateFormatted;
  }

  // 5. Lightbox Modal for Customer Review Photos
  const lightbox = document.getElementById('lightboxOverlay');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxClose = document.getElementById('lightboxClose');

  function openLightbox(src) {
    if (lightbox && lightboxImg) {
      lightboxImg.src = src;
      lightbox.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  if (lightboxClose) {
    lightboxClose.addEventListener('click', () => {
      lightbox.classList.remove('active');
      document.body.style.overflow = '';
    });
  }

  if (lightbox) {
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) {
        lightbox.classList.remove('active');
        document.body.style.overflow = '';
      }
    });
  }

  // 6. Wishlist (Heart) & Share Buttons
  const heartBtn = document.getElementById('heartBtn');
  if (heartBtn) {
    heartBtn.addEventListener('click', () => {
      heartBtn.classList.toggle('active');
      if (heartBtn.classList.contains('active')) {
        showToast('❤️ Added to Wishlist');
      } else {
        showToast('Removed from Wishlist');
      }
    });
  }

  const shareBtn = document.getElementById('shareBtn');
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      if (navigator.share) {
        navigator.share({
          title: document.title,
          url: window.location.href
        }).catch(() => {});
      } else {
        navigator.clipboard.writeText(window.location.href);
        showToast('🔗 Product link copied to clipboard!');
      }
    });
  }

  // 7. Carousel Implementation with Touch Swipe & Drag
  let currentSlide = 0;
  let totalSlides = 0;
  const track = document.getElementById('carouselTrack');
  const dotsContainer = document.getElementById('carouselDots');

  function updateCarousel(index) {
    if (!track || totalSlides === 0) return;
    currentSlide = Math.max(0, Math.min(index, totalSlides - 1));
    track.style.transform = `translateX(-${currentSlide * 100}%)`;

    if (dotsContainer) {
      const dots = dotsContainer.querySelectorAll('.carousel-dot');
      dots.forEach((d, i) => {
        d.classList.toggle('active', i === currentSlide);
      });
    }
  }

  // Auto-advance the album every 3 seconds; paused while the user is interacting
  // and while the tab is hidden.
  let autoplayTimer = null;
  const AUTOPLAY_INTERVAL = 3000;

  function stopAutoplay() {
    if (autoplayTimer) {
      clearInterval(autoplayTimer);
      autoplayTimer = null;
    }
  }

  function startAutoplay() {
    stopAutoplay();
    if (!track || totalSlides < 2) return;
    autoplayTimer = setInterval(() => {
      updateCarousel(currentSlide + 1 >= totalSlides ? 0 : currentSlide + 1);
    }, AUTOPLAY_INTERVAL);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAutoplay();
    else if (totalSlides > 1) startAutoplay();
  });

  // Touch Swipe & Mouse Drag
  let startX = 0;
  let isDragging = false;
  let currentTranslate = 0;

  if (track) {
    track.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      isDragging = true;
      stopAutoplay();
    }, { passive: true });

    track.addEventListener('touchend', (e) => {
      if (!isDragging) return;
      isDragging = false;
      const endX = e.changedTouches[0].clientX;
      const diff = startX - endX;
      if (Math.abs(diff) > 40) {
        if (diff > 0 && currentSlide < totalSlides - 1) {
          updateCarousel(currentSlide + 1);
        } else if (diff < 0 && currentSlide > 0) {
          updateCarousel(currentSlide - 1);
        }
      }
      startAutoplay();
    });

    track.addEventListener('mousedown', (e) => {
      startX = e.clientX;
      isDragging = true;
      track.style.cursor = 'grabbing';
      stopAutoplay();
    });

    track.addEventListener('mouseup', (e) => {
      if (!isDragging) return;
      isDragging = false;
      track.style.cursor = 'grab';
      const diff = startX - e.clientX;
      if (Math.abs(diff) > 40) {
        if (diff > 0 && currentSlide < totalSlides - 1) {
          updateCarousel(currentSlide + 1);
        } else if (diff < 0 && currentSlide > 0) {
          updateCarousel(currentSlide - 1);
        }
      }
      startAutoplay();
    });

    track.addEventListener('mouseleave', () => {
      if (isDragging) {
        isDragging = false;
        track.style.cursor = 'grab';
        startAutoplay();
      }
    });
  }

  // 8. Fetch Data and Populate Page
  let currentProductData = null;

  async function loadPDPProduct() {
    let products = [];
    try {
      const res = await fetch('/api/products?_t=' + Date.now(), { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.products)) products = data.products;
      }
    } catch (e) {
      console.warn('API /api/products fetch error in product.js:', e);
    }

    if (products.length === 0) {
      try {
        const res = await fetch('./data.json?_t=' + Date.now(), { cache: 'no-store' });
        const data = await res.json();
        if (data && Array.isArray(data.products)) products = data.products;
      } catch (err) {
        console.warn('Fallback data.json fetch error:', err);
      }
    }

    if (products.length > 0) {
      let product = products.find(p => String(p.id).toLowerCase() === String(productId).toLowerCase());
      if (!product) {
        product = products.find(p => p.id === 'iphone17') || products[0];
      }
      currentProductData = product;
      renderProductDetails(product, products);
    } else {
      // Fallback data for iPhone 17 Pro Max
      const fallbackIPhone17 = {
        id: 'iphone17',
        name: 'Apple iPhone 17 Pro Max (Cosmic Orange, 256 GB)',
        mrp: 147900,
        selling_price: 999,
        wow_price: 999,
        rating: 4.6,
        reviews_count: 500,
        img1: 'assets/images/iphone17/hero.jpg',
        colors: [
          {
            color_name: 'Cosmic Orange',
            images: [
              'assets/images/iphone17/hero.jpg',
              'assets/images/iphone17/back.jpg',
              'assets/images/iphone17/camera.jpg',
              'assets/images/iphone17/front.jpg',
              'assets/images/iphone17/side.jpg',
              'assets/images/iphone17/box.jpg'
            ]
          }
        ],
        description_images: [
          'assets/images/iphone17/camera.jpg',
          'assets/images/iphone17/back.jpg',
          'assets/images/iphone17/front.jpg'
        ]
      };
      currentProductData = fallbackIPhone17;
      renderProductDetails(fallbackIPhone17, [fallbackIPhone17]);
    }
  }

  loadPDPProduct();


  // ==========================================================================
  // BRAND LOGOS DICTIONARY (Official High-Resolution Vector SVGs & Warranty)
  // Covers ALL major mobile brands & electronics
  // ==========================================================================
  const BRAND_LOGOS = {
    apple: {
      name: 'Apple',
      aliases: ['apple', 'iphone', 'ipad', 'macbook', 'airpod'],
      color: '#000000',
      badgeBg: '#000000',
      badgeColor: '#ffffff',
      badgeBorder: 'none',
      shadow: '0 3px 8px rgba(0,0,0,0.3)',
      bannerBg: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
      bannerBorder: '#e2e8f0',
      headlineColor: '#0f172a',
      pillSvg: `<svg viewBox="0 0 170 170" width="16" height="16" fill="currentColor"><path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.04-7.58-7.74-11.64-14.1-6.19-9.67-11.04-20.73-14.54-33.19-3.51-12.45-5.26-24.16-5.26-35.13 0-14.89 3.86-27.42 11.58-37.58 7.72-10.16 17.51-15.35 29.37-15.57 5.01 0 10.66 1.34 16.96 4.02 6.3 2.68 10.15 4.08 11.54 4.22 2.39-.4 6.74-1.99 13.06-4.78 6.32-2.79 11.83-4.04 16.53-3.76 13.06.75 23.36 5.61 30.91 14.57-11.53 7-17.18 16.71-16.96 29.13.22 10.22 4.13 18.78 11.75 25.68 7.62 6.9 16.53 10.65 26.74 11.25-2.61 8.26-6.15 17.06-10.63 26.4zm-37.16-118.23c0 7.39-2.67 14.37-8.01 20.94-6.42 7.72-14.34 12.39-23.77 14-1.1-6.95.83-14.07 5.79-21.36 4.96-7.29 11.6-11.89 19.92-13.8 3.86-.3 6.07.22 6.07.22z"/></svg>`,
      warrantySvg: `<svg viewBox="0 0 170 170" width="24" height="24" fill="#ffffff"><path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.04-7.58-7.74-11.64-14.1-6.19-9.67-11.04-20.73-14.54-33.19-3.51-12.45-5.26-24.16-5.26-35.13 0-14.89 3.86-27.42 11.58-37.58 7.72-10.16 17.51-15.35 29.37-15.57 5.01 0 10.66 1.34 16.96 4.02 6.3 2.68 10.15 4.08 11.54 4.22 2.39-.4 6.74-1.99 13.06-4.78 6.32-2.79 11.83-4.04 16.53-3.76 13.06.75 23.36 5.61 30.91 14.57-11.53 7-17.18 16.71-16.96 29.13.22 10.22 4.13 18.78 11.75 25.68 7.62 6.9 16.53 10.65 26.74 11.25-2.61 8.26-6.15 17.06-10.63 26.4zm-37.16-118.23c0 7.39-2.67 14.37-8.01 20.94-6.42 7.72-14.34 12.39-23.77 14-1.1-6.95.83-14.07 5.79-21.36 4.96-7.29 11.6-11.89 19.92-13.8 3.86-.3 6.07.22 6.07.22z"/></svg>`,
      warrantyHeadline: 'Apple Official 1-Year Limited Warranty',
      warrantySub: '100% Genuine Apple product with 7 Days Replacement Guarantee and free doorstep pickup.'
    },
    samsung: {
      name: 'Samsung',
      aliases: ['samsung', 'galaxy'],
      color: '#1428a0',
      badgeBg: '#1428a0',
      badgeColor: '#ffffff',
      badgeBorder: 'none',
      shadow: '0 3px 8px rgba(20,40,160,0.3)',
      bannerBg: 'linear-gradient(135deg, #f0f4ff 0%, #e8eeff 100%)',
      bannerBorder: '#c7d7fe',
      headlineColor: '#1428a0',
      pillSvg: `<svg viewBox="0 0 130 20" width="54" height="13" fill="#1428a0"><path d="M7.4 9.1c-2.4-.6-3.8-1.2-3.8-2.5 0-1.2 1.3-2 3.1-2 1.9 0 3.3.7 4.2 1.8l2-1.9C11.5 3 9.4 2 6.8 2 3.1 2 0.8 4 0.8 7c0 3.1 2.3 4.4 5.3 5.2 2.7.7 4.1 1.4 4.1 2.8 0 1.4-1.4 2.2-3.5 2.2-2.3 0-4-1-5.1-2.4l-2.1 2c1.6 1.9 4 3 7.2 3 4.1 0 6.5-2.2 6.5-5.3 0-3.3-2.6-4.7-5.8-5.4zm16.9-6.8h-3.3L15.3 19h3.1l1.3-3.8h5.9l1.3 3.8h3.2L24.3 2.3zm-3.8 10.3l2.2-6.5 2.2 6.5h-4.4zm14.6-10.3h-3.2V19h2.9l6.5-11.1V19h3.2V2.3h-2.9l-6.5 11.1V2.3zm19.9 6.8c-2.4-.6-3.8-1.2-3.8-2.5 0-1.2 1.3-2 3.1-2 1.9 0 3.3.7 4.2 1.8l2-1.9C57.4 3 55.3 2 52.7 2c-3.7 0-6 2-6 5 0 3.1 2.3 4.4 5.3 5.2 2.7.7 4.1 1.4 4.1 2.8 0 1.4-1.4 2.2-3.5 2.2-2.3 0-4-1-5.1-2.4l-2.1 2c1.6 1.9 4 3 7.2 3 4.1 0 6.5-2.2 6.5-5.3 0-3.3-2.6-4.7-5.8-5.4zm18.3-6.8h-3.2v10.9c0 2.2-1.3 3.4-3.3 3.4s-3.3-1.2-3.3-3.4V2.3h-3.2v11.1c0 3.7 2.6 5.8 6.5 5.8 3.9 0 6.5-2.1 6.5-5.8V2.3zm8.3 0h-3.2v16.7h3.1l5.8-10.1 5.8 10.1h3.1V2.3h-3.2v10.9l-4.7-8.2h-2l-4.7 8.2V2.3zm29.1 8.2h6.2V7.7h-6.2v-2.6h7.6V2.3h-10.8V19h10.8v-2.8h-7.6v-5.7z"/></svg>`,
      warrantySvg: `<svg viewBox="0 0 130 20" width="34" height="11" fill="#ffffff"><path d="M7.4 9.1c-2.4-.6-3.8-1.2-3.8-2.5 0-1.2 1.3-2 3.1-2 1.9 0 3.3.7 4.2 1.8l2-1.9C11.5 3 9.4 2 6.8 2 3.1 2 0.8 4 0.8 7c0 3.1 2.3 4.4 5.3 5.2 2.7.7 4.1 1.4 4.1 2.8 0 1.4-1.4 2.2-3.5 2.2-2.3 0-4-1-5.1-2.4l-2.1 2c1.6 1.9 4 3 7.2 3 4.1 0 6.5-2.2 6.5-5.3 0-3.3-2.6-4.7-5.8-5.4zm16.9-6.8h-3.3L15.3 19h3.1l1.3-3.8h5.9l1.3 3.8h3.2L24.3 2.3zm-3.8 10.3l2.2-6.5 2.2 6.5h-4.4zm14.6-10.3h-3.2V19h2.9l6.5-11.1V19h3.2V2.3h-2.9l-6.5 11.1V2.3zm19.9 6.8c-2.4-.6-3.8-1.2-3.8-2.5 0-1.2 1.3-2 3.1-2 1.9 0 3.3.7 4.2 1.8l2-1.9C57.4 3 55.3 2 52.7 2c-3.7 0-6 2-6 5 0 3.1 2.3 4.4 5.3 5.2 2.7.7 4.1 1.4 4.1 2.8 0 1.4-1.4 2.2-3.5 2.2-2.3 0-4-1-5.1-2.4l-2.1 2c1.6 1.9 4 3 7.2 3 4.1 0 6.5-2.2 6.5-5.3 0-3.3-2.6-4.7-5.8-5.4zm18.3-6.8h-3.2v10.9c0 2.2-1.3 3.4-3.3 3.4s-3.3-1.2-3.3-3.4V2.3h-3.2v11.1c0 3.7 2.6 5.8 6.5 5.8 3.9 0 6.5-2.1 6.5-5.8V2.3zm8.3 0h-3.2v16.7h3.1l5.8-10.1 5.8 10.1h3.1V2.3h-3.2v10.9l-4.7-8.2h-2l-4.7 8.2V2.3zm29.1 8.2h6.2V7.7h-6.2v-2.6h7.6V2.3h-10.8V19h10.8v-2.8h-7.6v-5.7z"/></svg>`,
      warrantyHeadline: 'Samsung Official 1-Year Brand Warranty',
      warrantySub: '100% Genuine Samsung product with authorized service center support & hassle-free replacement.'
    },
    oneplus: {
      name: 'OnePlus',
      aliases: ['oneplus', 'nord'],
      color: '#eb0028',
      badgeBg: '#eb0028',
      badgeColor: '#ffffff',
      badgeBorder: 'none',
      shadow: '0 3px 8px rgba(235,0,40,0.3)',
      bannerBg: 'linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)',
      bannerBorder: '#fecdd3',
      headlineColor: '#b91c1c',
      pillSvg: `<svg viewBox="0 0 24 24" width="18" height="18"><rect width="24" height="24" rx="4" fill="#eb0028"/><text x="12" y="17" fill="#ffffff" font-size="13" font-family="Arial, Helvetica, sans-serif" font-weight="900" text-anchor="middle">1+</text></svg>`,
      warrantySvg: `<svg viewBox="0 0 24 24" width="24" height="24"><rect width="24" height="24" rx="5" fill="#ffffff"/><text x="12" y="17" fill="#eb0028" font-size="13" font-family="Arial, Helvetica, sans-serif" font-weight="900" text-anchor="middle">1+</text></svg>`,
      warrantyHeadline: 'OnePlus Official 1-Year Brand Warranty',
      warrantySub: '100% Authentic OnePlus device with Red Cable Club privilege and free doorstep pickup.'
    },
    google: {
      name: 'Google Pixel',
      aliases: ['google', 'pixel'],
      color: '#4285f4',
      badgeBg: '#ffffff',
      badgeColor: '#4285f4',
      badgeBorder: '1.5px solid #e2e8f0',
      shadow: '0 3px 8px rgba(0,0,0,0.08)',
      bannerBg: 'linear-gradient(135deg, #f0f7ff 0%, #e6f0fa 100%)',
      bannerBorder: '#bfdbfe',
      headlineColor: '#1d4ed8',
      pillSvg: `<svg viewBox="0 0 24 24" width="18" height="18"><path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.03h3.88c2.27-2.09 3.665-5.17 3.665-9.12z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.03c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.13C3.25 21.37 7.33 24 12 24z"/><path fill="#FBBC05" d="M5.28 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.58H1.26C.46 8.18 0 10.03 0 12s.46 3.82 1.26 5.42l4.02-3.13z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.25 2.63 1.26 6.58l4.02 3.13c.95-2.83 3.6-4.96 6.72-4.96z"/></svg>`,
      warrantySvg: `<svg viewBox="0 0 24 24" width="26" height="26"><path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.03h3.88c2.27-2.09 3.665-5.17 3.665-9.12z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.03c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.13C3.25 21.37 7.33 24 12 24z"/><path fill="#FBBC05" d="M5.28 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.58H1.26C.46 8.18 0 10.03 0 12s.46 3.82 1.26 5.42l4.02-3.13z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.25 2.63 1.26 6.58l4.02 3.13c.95-2.83 3.6-4.96 6.72-4.96z"/></svg>`,
      warrantyHeadline: 'Google Official 1-Year Limited Warranty',
      warrantySub: '100% Genuine Google Pixel product backed by Google Care with 7 Days Replacement Guarantee.'
    },
    xiaomi: {
      name: 'Xiaomi',
      aliases: ['xiaomi', 'redmi', 'mi '],
      color: '#ff6900',
      badgeBg: '#ff6900',
      badgeColor: '#ffffff',
      badgeBorder: 'none',
      shadow: '0 3px 8px rgba(255,105,0,0.3)',
      bannerBg: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
      bannerBorder: '#fed7aa',
      headlineColor: '#c2410c',
      pillSvg: `<svg viewBox="0 0 24 24" width="18" height="18"><rect width="24" height="24" rx="6" fill="#ff6900"/><path fill="#ffffff" d="M6 7.5h2.5v9H6zm4 0h5a2.5 2.5 0 0 1 2.5 2.5v6.5h-2.5V10h-2.5v6.5H10z"/></svg>`,
      warrantySvg: `<svg viewBox="0 0 24 24" width="24" height="24"><path fill="#ffffff" d="M6 7.5h2.5v9H6zm4 0h5a2.5 2.5 0 0 1 2.5 2.5v6.5h-2.5V10h-2.5v6.5H10z"/></svg>`,
      warrantyHeadline: 'Xiaomi Official 1-Year Manufacturer Warranty',
      warrantySub: '100% Genuine Xiaomi product covered across all authorized Mi Service Centers in India.'
    },
    poco: {
      name: 'POCO',
      aliases: ['poco'],
      color: '#ffd200',
      badgeBg: '#ffd200',
      badgeColor: '#000000',
      badgeBorder: 'none',
      shadow: '0 3px 8px rgba(255,210,0,0.35)',
      bannerBg: 'linear-gradient(135deg, #fefce8 0%, #fef9c3 100%)',
      bannerBorder: '#fde047',
      headlineColor: '#854d0e',
      pillSvg: `<svg viewBox="0 0 60 20" width="48" height="16"><rect width="60" height="20" rx="3" fill="#ffd200"/><text x="30" y="15" fill="#000000" font-size="13" font-weight="900" font-family="Arial Black, Impact, sans-serif" text-anchor="middle">POCO</text></svg>`,
      warrantySvg: `<svg viewBox="0 0 60 20" width="38" height="14"><text x="30" y="15" fill="#000000" font-size="14" font-weight="900" font-family="Arial Black, Impact, sans-serif" text-anchor="middle">POCO</text></svg>`,
      warrantyHeadline: 'POCO Official 1-Year Limited Warranty',
      warrantySub: '100% Genuine POCO device with doorstep pickup & priority service support.'
    },
    realme: {
      name: 'realme',
      aliases: ['realme', 'narzo'],
      color: '#ffc915',
      badgeBg: '#ffc915',
      badgeColor: '#000000',
      badgeBorder: 'none',
      shadow: '0 3px 8px rgba(255,201,21,0.3)',
      bannerBg: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
      bannerBorder: '#fde68a',
      headlineColor: '#854d0e',
      pillSvg: `<svg viewBox="0 0 60 20" width="48" height="15"><rect width="60" height="20" rx="3" fill="#ffc915"/><text x="30" y="14" fill="#000000" font-size="11" font-weight="900" font-family="sans-serif" text-anchor="middle">realme</text></svg>`,
      warrantySvg: `<svg viewBox="0 0 60 20" width="38" height="13"><text x="30" y="14" fill="#000000" font-size="12" font-weight="900" font-family="sans-serif" text-anchor="middle">realme</text></svg>`,
      warrantyHeadline: 'realme Official 1-Year Brand Warranty',
      warrantySub: '100% Genuine realme device with 7 Days Replacement Guarantee and full brand coverage.'
    },
    vivo: {
      name: 'vivo',
      aliases: ['vivo'],
      color: '#415fff',
      badgeBg: '#415fff',
      badgeColor: '#ffffff',
      badgeBorder: 'none',
      shadow: '0 3px 8px rgba(65,95,255,0.3)',
      bannerBg: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
      bannerBorder: '#bfdbfe',
      headlineColor: '#1e40af',
      pillSvg: `<svg viewBox="0 0 60 20" width="46" height="15"><text x="30" y="15" fill="#415fff" font-size="16" font-style="italic" font-weight="900" font-family="Arial, Helvetica, sans-serif" text-anchor="middle">vivo</text></svg>`,
      warrantySvg: `<svg viewBox="0 0 60 20" width="36" height="13"><text x="30" y="15" fill="#ffffff" font-size="16" font-style="italic" font-weight="900" font-family="Arial, Helvetica, sans-serif" text-anchor="middle">vivo</text></svg>`,
      warrantyHeadline: 'vivo Official 1-Year Brand Warranty',
      warrantySub: '100% Genuine vivo device with 7 Days Replacement & pan-India service support.'
    },
    iqoo: {
      name: 'iQOO',
      aliases: ['iqoo'],
      color: '#ffaa00',
      badgeBg: '#111827',
      badgeColor: '#ffaa00',
      badgeBorder: '1.5px solid #ffaa00',
      shadow: '0 3px 8px rgba(255,170,0,0.25)',
      bannerBg: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
      bannerBorder: '#fde68a',
      headlineColor: '#92400e',
      pillSvg: `<svg viewBox="0 0 60 20" width="46" height="15"><text x="30" y="15" fill="#ffaa00" font-size="15" font-weight="900" font-family="Arial Black, sans-serif" text-anchor="middle">iQOO</text></svg>`,
      warrantySvg: `<svg viewBox="0 0 60 20" width="36" height="13"><text x="30" y="15" fill="#ffaa00" font-size="15" font-weight="900" font-family="Arial Black, sans-serif" text-anchor="middle">iQOO</text></svg>`,
      warrantyHeadline: 'iQOO Official 1-Year Priority Warranty',
      warrantySub: '100% Original iQOO flagship with priority service privilege and free doorstep pickup.'
    },
    oppo: {
      name: 'OPPO',
      aliases: ['oppo', 'reno', 'find x'],
      color: '#008753',
      badgeBg: '#008753',
      badgeColor: '#ffffff',
      badgeBorder: 'none',
      shadow: '0 3px 8px rgba(0,135,83,0.3)',
      bannerBg: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
      bannerBorder: '#bbf7d0',
      headlineColor: '#166534',
      pillSvg: `<svg viewBox="0 0 60 20" width="48" height="15"><text x="30" y="15" fill="#008753" font-size="15" font-weight="900" font-family="Arial, sans-serif" letter-spacing="1" text-anchor="middle">OPPO</text></svg>`,
      warrantySvg: `<svg viewBox="0 0 60 20" width="36" height="13"><text x="30" y="15" fill="#ffffff" font-size="15" font-weight="900" font-family="Arial, sans-serif" letter-spacing="1" text-anchor="middle">OPPO</text></svg>`,
      warrantyHeadline: 'OPPO Official 1-Year Brand Warranty',
      warrantySub: '100% Original OPPO smartphone with OPPO Care replacement and service guarantee.'
    },
    motorola: {
      name: 'Motorola',
      aliases: ['motorola', 'moto', 'razr', 'edge'],
      color: '#00142e',
      badgeBg: '#00142e',
      badgeColor: '#ffffff',
      badgeBorder: 'none',
      shadow: '0 3px 8px rgba(0,20,46,0.3)',
      bannerBg: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
      bannerBorder: '#cbd5e1',
      headlineColor: '#0f172a',
      pillSvg: `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="11" fill="#00142e"/><path fill="#ffffff" d="M12 8.5c-.8 0-1.8 1.4-2.5 3.3-.6-1.9-1.6-3.3-2.4-3.3-1.6 0-2.6 2.7-2.6 6.1 0 1 .2 1.8.4 2.4.6-.2 1.3-.7 1.8-1.5.8-1.3 1.4-3.3 1.9-5.1.7 2 1.5 4 2.2 4.9.4.5.8.7 1.2.7s.8-.2 1.2-.7c.7-.9 1.5-2.9 2.2-4.9.5 1.8 1.1 3.8 1.9 5.1.5.8 1.2 1.3 1.8 1.5.2-.6.4-1.4.4-2.4 0-3.4-1-6.1-2.6-6.1-.8 0-1.8 1.4-2.4 3.3-.8-1.9-1.8-3.3-2.6-3.3z"/></svg>`,
      warrantySvg: `<svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="11" fill="#00142e"/><path fill="#ffffff" d="M12 8.5c-.8 0-1.8 1.4-2.5 3.3-.6-1.9-1.6-3.3-2.4-3.3-1.6 0-2.6 2.7-2.6 6.1 0 1 .2 1.8.4 2.4.6-.2 1.3-.7 1.8-1.5.8-1.3 1.4-3.3 1.9-5.1.7 2 1.5 4 2.2 4.9.4.5.8.7 1.2.7s.8-.2 1.2-.7c.7-.9 1.5-2.9 2.2-4.9.5 1.8 1.1 3.8 1.9 5.1.5.8 1.2 1.3 1.8 1.5.2-.6.4-1.4.4-2.4 0-3.4-1-6.1-2.6-6.1-.8 0-1.8 1.4-2.4 3.3-.8-1.9-1.8-3.3-2.6-3.3z"/></svg>`,
      warrantyHeadline: 'Motorola Official 1-Year Limited Warranty',
      warrantySub: '100% Genuine Moto handset with Moto Care support and hassle-free warranty claim.'
    },
    nothing: {
      name: 'Nothing',
      aliases: ['nothing', 'cmf'],
      color: '#000000',
      badgeBg: '#000000',
      badgeColor: '#ffffff',
      badgeBorder: '1px solid #333',
      shadow: '0 3px 8px rgba(0,0,0,0.3)',
      bannerBg: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
      bannerBorder: '#e2e8f0',
      headlineColor: '#000000',
      pillSvg: `<svg viewBox="0 0 64 20" width="50" height="15"><text x="32" y="15" fill="#000000" font-size="12" font-weight="900" font-family="'Courier New', Courier, monospace" letter-spacing="1.5" text-anchor="middle">NOTHING</text></svg>`,
      warrantySvg: `<svg viewBox="0 0 64 20" width="40" height="13"><text x="32" y="15" fill="#ffffff" font-size="12" font-weight="900" font-family="'Courier New', Courier, monospace" letter-spacing="1.5" text-anchor="middle">NOTHING</text></svg>`,
      warrantyHeadline: 'Nothing Official 1-Year Limited Warranty',
      warrantySub: '100% Genuine Nothing device with premium Nothing Care support and 7 Days Replacement.'
    },
    sony: {
      name: 'Sony',
      aliases: ['sony', 'xperia', 'bravia'],
      color: '#000000',
      badgeBg: '#000000',
      badgeColor: '#ffffff',
      badgeBorder: 'none',
      shadow: '0 3px 8px rgba(0,0,0,0.25)',
      bannerBg: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
      bannerBorder: '#e2e8f0',
      headlineColor: '#0f172a',
      pillSvg: `<svg viewBox="0 0 60 20" width="46" height="15"><text x="30" y="15" fill="#000000" font-size="14" font-weight="900" font-family="'Times New Roman', Times, serif" letter-spacing="2" text-anchor="middle">SONY</text></svg>`,
      warrantySvg: `<svg viewBox="0 0 60 20" width="36" height="13"><text x="30" y="15" fill="#ffffff" font-size="14" font-weight="900" font-family="'Times New Roman', Times, serif" letter-spacing="2" text-anchor="middle">SONY</text></svg>`,
      warrantyHeadline: 'Sony Official 1-Year Brand Warranty',
      warrantySub: '100% Original Sony product with authorized Sony Service Center coverage across India.'
    },
    asus: {
      name: 'ASUS',
      aliases: ['asus', 'rog'],
      color: '#00539b',
      badgeBg: '#00539b',
      badgeColor: '#ffffff',
      badgeBorder: 'none',
      shadow: '0 3px 8px rgba(0,83,155,0.3)',
      bannerBg: 'linear-gradient(135deg, #f0f7ff 0%, #e0f2fe 100%)',
      bannerBorder: '#bae6fd',
      headlineColor: '#0369a1',
      pillSvg: `<svg viewBox="0 0 60 20" width="46" height="15"><text x="30" y="15" fill="#00539b" font-size="14" font-weight="900" font-family="Arial, Helvetica, sans-serif" letter-spacing="1.5" text-anchor="middle">ASUS</text></svg>`,
      warrantySvg: `<svg viewBox="0 0 60 20" width="36" height="13"><text x="30" y="15" fill="#ffffff" font-size="14" font-weight="900" font-family="Arial, Helvetica, sans-serif" letter-spacing="1.5" text-anchor="middle">ASUS</text></svg>`,
      warrantyHeadline: 'ASUS Official 1-Year Manufacturer Warranty',
      warrantySub: '100% Genuine ASUS hardware with international service coverage & doorstep pickup.'
    },
    infinix: {
      name: 'Infinix',
      aliases: ['infinix'],
      color: '#00d084',
      badgeBg: '#0f172a',
      badgeColor: '#00d084',
      badgeBorder: '1.5px solid #00d084',
      shadow: '0 3px 8px rgba(0,208,132,0.25)',
      bannerBg: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
      bannerBorder: '#bbf7d0',
      headlineColor: '#166534',
      pillSvg: `<svg viewBox="0 0 64 20" width="50" height="15"><text x="32" y="15" fill="#00d084" font-size="13" font-weight="900" font-family="sans-serif" text-anchor="middle">Infinix</text></svg>`,
      warrantySvg: `<svg viewBox="0 0 64 20" width="40" height="13"><text x="32" y="15" fill="#00d084" font-size="13" font-weight="900" font-family="sans-serif" text-anchor="middle">Infinix</text></svg>`,
      warrantyHeadline: 'Infinix Official 1-Year Brand Warranty',
      warrantySub: '100% Genuine Infinix device backed by Carlcare service network across India.'
    },
    tecno: {
      name: 'TECNO',
      aliases: ['tecno'],
      color: '#0055ff',
      badgeBg: '#0055ff',
      badgeColor: '#ffffff',
      badgeBorder: 'none',
      shadow: '0 3px 8px rgba(0,85,255,0.3)',
      bannerBg: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
      bannerBorder: '#bfdbfe',
      headlineColor: '#1d4ed8',
      pillSvg: `<svg viewBox="0 0 60 20" width="46" height="15"><text x="30" y="15" fill="#0055ff" font-size="14" font-weight="900" font-family="sans-serif" text-anchor="middle">TECNO</text></svg>`,
      warrantySvg: `<svg viewBox="0 0 60 20" width="36" height="13"><text x="30" y="15" fill="#ffffff" font-size="14" font-weight="900" font-family="sans-serif" text-anchor="middle">TECNO</text></svg>`,
      warrantyHeadline: 'TECNO Official 1-Year Brand Warranty',
      warrantySub: '100% Genuine TECNO smartphone with Carlcare 100-day free screen replacement & warranty.'
    },
    honor: {
      name: 'HONOR',
      aliases: ['honor'],
      color: '#0066cc',
      badgeBg: '#0066cc',
      badgeColor: '#ffffff',
      badgeBorder: 'none',
      shadow: '0 3px 8px rgba(0,102,204,0.3)',
      bannerBg: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
      bannerBorder: '#bfdbfe',
      headlineColor: '#1e40af',
      pillSvg: `<svg viewBox="0 0 60 20" width="46" height="15"><text x="30" y="15" fill="#0066cc" font-size="14" font-weight="900" font-family="sans-serif" letter-spacing="1" text-anchor="middle">HONOR</text></svg>`,
      warrantySvg: `<svg viewBox="0 0 60 20" width="36" height="13"><text x="30" y="15" fill="#ffffff" font-size="14" font-weight="900" font-family="sans-serif" letter-spacing="1" text-anchor="middle">HONOR</text></svg>`,
      warrantyHeadline: 'HONOR Official 1-Year Brand Warranty',
      warrantySub: '100% Genuine HONOR product with authorized service center support & 7 Days Replacement.'
    },
    boat: {
      name: 'boAt',
      aliases: ['boat', 'airdopes', 'rockerz', 'stone'],
      color: '#eb142b',
      badgeBg: '#111827',
      badgeColor: '#ffffff',
      badgeBorder: '1px solid #eb142b',
      shadow: '0 3px 8px rgba(235,20,43,0.25)',
      bannerBg: 'linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)',
      bannerBorder: '#fecdd3',
      headlineColor: '#9f1239',
      pillSvg: `<svg viewBox="0 0 54 20" width="45" height="16"><text x="27" y="15" fill="#eb142b" font-size="15" font-weight="900" font-family="sans-serif" text-anchor="middle">bo<tspan fill="#000000">A</tspan>t</text></svg>`,
      warrantySvg: `<svg viewBox="0 0 54 20" width="36" height="14"><text x="27" y="15" fill="#eb142b" font-size="15" font-weight="900" font-family="sans-serif" text-anchor="middle">bo<tspan fill="#ffffff">A</tspan>t</text></svg>`,
      warrantyHeadline: 'boAt Official 1-Year Brand Warranty',
      warrantySub: '100% Original boAt product with doorstep replacement and official warranty support.'
    },
    noise: {
      name: 'Noise',
      aliases: ['noise', 'colorfit'],
      color: '#111827',
      badgeBg: '#111827',
      badgeColor: '#ffffff',
      badgeBorder: 'none',
      shadow: '0 3px 8px rgba(0,0,0,0.25)',
      bannerBg: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
      bannerBorder: '#e2e8f0',
      headlineColor: '#0f172a',
      pillSvg: `<svg viewBox="0 0 60 20" width="46" height="15"><text x="30" y="15" fill="#111827" font-size="14" font-weight="900" font-family="sans-serif" letter-spacing="1" text-anchor="middle">n<tspan fill="#ef4444">o</tspan>ise</text></svg>`,
      warrantySvg: `<svg viewBox="0 0 60 20" width="36" height="13"><text x="30" y="15" fill="#ffffff" font-size="14" font-weight="900" font-family="sans-serif" letter-spacing="1" text-anchor="middle">n<tspan fill="#ef4444">o</tspan>ise</text></svg>`,
      warrantyHeadline: 'Noise Official 1-Year Brand Warranty',
      warrantySub: '100% Genuine Noise product with doorstep service & 7 Days Replacement Guarantee.'
    },
    fireboltt: {
      name: 'Fire-Boltt',
      aliases: ['fire-boltt', 'fireboltt'],
      color: '#ff2d55',
      badgeBg: '#111827',
      badgeColor: '#ff2d55',
      badgeBorder: '1px solid #ff2d55',
      shadow: '0 3px 8px rgba(255,45,85,0.25)',
      bannerBg: 'linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)',
      bannerBorder: '#fecdd3',
      headlineColor: '#9f1239',
      pillSvg: `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="11" fill="#ff2d55"/><path fill="#ffffff" d="M13 3L6 14h5l-2 7 9-12h-5l2-6z"/></svg>`,
      warrantySvg: `<svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="11" fill="#111827"/><path fill="#ff2d55" d="M13 3L6 14h5l-2 7 9-12h-5l2-6z"/></svg>`,
      warrantyHeadline: 'Fire-Boltt Official 1-Year Limited Warranty',
      warrantySub: '100% Authentic Fire-Boltt product with hassle-free doorstep replacement warranty.'
    },
    safari: {
      name: 'Safari',
      aliases: ['safari'],
      color: '#0066cc',
      badgeBg: '#0066cc',
      badgeColor: '#ffffff',
      badgeBorder: 'none',
      shadow: '0 3px 8px rgba(0,102,204,0.3)',
      bannerBg: 'linear-gradient(135deg, #f0f7ff 0%, #e0f2fe 100%)',
      bannerBorder: '#bae6fd',
      headlineColor: '#0369a1',
      pillSvg: `<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="10" fill="#0066cc"/><polygon points="12,5 15,12 12,19 9,12" fill="#ff3333"/><polygon points="12,19 9,12 12,5" fill="#ffffff" opacity="0.6"/></svg>`,
      warrantySvg: `<svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="10" fill="#ffffff"/><polygon points="12,5 15,12 12,19 9,12" fill="#ff3333"/><polygon points="12,19 9,12 12,5" fill="#0066cc" opacity="0.6"/></svg>`,
      warrantyHeadline: 'Safari Official 1-Year Brand Warranty',
      warrantySub: '100% Genuine Safari product with international warranty and replacement guarantee.'
    }
  };

  function getBrandLogoInfo(brandOrName, productObj = {}) {
    const haystack = [
      brandOrName,
      productObj.brand,
      productObj.name,
      productObj.title1,
      productObj.title2
    ].filter(Boolean).join(' ').toLowerCase();

    for (const [key, val] of Object.entries(BRAND_LOGOS)) {
      if (val.aliases && Array.isArray(val.aliases)) {
        if (val.aliases.some(alias => haystack.includes(alias.toLowerCase()))) {
          return val;
        }
      } else if (haystack.includes(key)) {
        return val;
      }
    }

    const fallbackName = brandOrName || productObj.brand || 'Official Store';
    return {
      name: fallbackName,
      color: '#2874f0',
      badgeBg: '#2874f0',
      badgeColor: '#ffffff',
      badgeBorder: 'none',
      shadow: '0 2px 6px rgba(40, 116, 240, 0.3)',
      bannerBg: 'linear-gradient(135deg, #f5f9ff 0%, #edf3ff 100%)',
      bannerBorder: '#dbeafe',
      headlineColor: '#1e3a8a',
      pillSvg: `<svg viewBox="0 0 24 24" width="16" height="16" fill="#2874f0"><path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5zm-1 14.5l-4-4 1.41-1.41L11 13.67l6.59-6.59L19 8.5l-8 8z"/></svg>`,
      warrantySvg: `<svg viewBox="0 0 24 24" width="24" height="24" fill="#ffffff"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>`,
      warrantyHeadline: `${fallbackName} Official 1-Year Limited Warranty`,
      warrantySub: `100% Genuine ${fallbackName} product with 7 Days Replacement Guarantee and free doorstep pickup.`
    };
  }

  function renderProductDetails(product, allProducts) {
    document.title = `${product.name} - Flipkart`;

    // 1. Official Brand Logo Header & 1-Year Brand Warranty Box
    const brandInfo = getBrandLogoInfo(product.brand, product);
    const brandSvgLogo = document.getElementById('brandSvgLogo');
    const brandTitleName = document.getElementById('brandTitleName');
    if (brandSvgLogo) brandSvgLogo.innerHTML = brandInfo.pillSvg || brandInfo.svg;
    if (brandTitleName) brandTitleName.textContent = brandInfo.name;

    // Dynamic 1-Year Brand Warranty Banner (Matching Brand Identity)
    const warrantyShieldBadge = document.getElementById('warrantyShieldBadge');
    const warrantyBannerHeadline = document.getElementById('warrantyBannerHeadline');
    const warrantyBannerSub = document.getElementById('warrantyBannerSub');
    const warrantyBannerWrap = document.getElementById('warrantyBannerWrap');

    if (warrantyShieldBadge) {
      warrantyShieldBadge.innerHTML = brandInfo.warrantySvg || brandInfo.svg;
      if (brandInfo.badgeBg) warrantyShieldBadge.style.backgroundColor = brandInfo.badgeBg;
      if (brandInfo.badgeColor) warrantyShieldBadge.style.color = brandInfo.badgeColor;
      if (brandInfo.badgeBorder) warrantyShieldBadge.style.border = brandInfo.badgeBorder;
      if (brandInfo.shadow) warrantyShieldBadge.style.boxShadow = brandInfo.shadow;
    }
    if (warrantyBannerHeadline) {
      warrantyBannerHeadline.textContent = brandInfo.warrantyHeadline || `${brandInfo.name} Official 1-Year Limited Warranty`;
      if (brandInfo.headlineColor) warrantyBannerHeadline.style.color = brandInfo.headlineColor;
    }
    if (warrantyBannerSub) {
      warrantyBannerSub.textContent = brandInfo.warrantySub || `100% Genuine ${brandInfo.name} product with 7 Days Replacement Guarantee and free doorstep pickup.`;
    }
    if (warrantyBannerWrap) {
      if (brandInfo.bannerBg) warrantyBannerWrap.style.background = brandInfo.bannerBg;
      if (brandInfo.bannerBorder) warrantyBannerWrap.style.borderColor = brandInfo.bannerBorder;
    }

    // Title
    const titleEl = document.getElementById('productTitle');
    if (titleEl) titleEl.textContent = product.title2 || product.name;

    // Pricing
    const sellingPrice = Number(product.selling_price) || 999;
    const mrp = Number(product.mrp) || 147900;
    const discount = mrp > 0 ? Math.round(((mrp - sellingPrice) / mrp) * 100) : 99;
    const wowPrice = Number(product.wow_price) || sellingPrice;

    const discountEl = document.getElementById('discountVal');
    const mrpEl = document.getElementById('mrpVal');
    const priceEl = document.getElementById('sellingPriceVal');
    const wowPriceEl = document.getElementById('wowPriceVal');

    if (discountEl) discountEl.textContent = `${discount}% off`;
    if (mrpEl) mrpEl.textContent = `₹${mrp.toLocaleString('en-IN')}`;
    if (priceEl) priceEl.textContent = `₹${sellingPrice.toLocaleString('en-IN')}`;
    if (wowPriceEl) wowPriceEl.textContent = `₹${wowPrice.toLocaleString('en-IN')}`;

    // Rating & Reviews
    const ratingEl = document.getElementById('ratingVal');
    const reviewsCountEl = document.getElementById('reviewsCountVal');
    if (ratingEl) ratingEl.textContent = product.rating || '4.6';
    if (reviewsCountEl) {
      const cnt = product.reviews_count || 500;
      reviewsCountEl.textContent = `${cnt.toLocaleString('en-IN')} Ratings & Reviews`;
    }

    // Helper to render carousel slides given an array of URLs
    function loadCarouselPhotos(photoList) {
      if (!track || !photoList || photoList.length === 0) return;
      totalSlides = photoList.length;
      currentSlide = 0;
      track.innerHTML = '';
      photoList.forEach((imgSrc, idx) => {
        const slide = document.createElement('div');
        slide.className = 'carousel-slide';
        const img = document.createElement('img');
        img.src = imgSrc;
        img.alt = `${product.name} view ${idx + 1}`;
        img.loading = idx === 0 ? 'eager' : 'lazy';
        slide.appendChild(img);
        track.appendChild(slide);
      });

      if (dotsContainer) {
        dotsContainer.innerHTML = '';
        photoList.forEach((_, idx) => {
          const dot = document.createElement('div');
          dot.className = `carousel-dot ${idx === 0 ? 'active' : ''}`;
          dot.addEventListener('click', () => {
            updateCarousel(idx);
            startAutoplay(); // restart the 3s timer so it doesn't jump straight away
          });
          dotsContainer.appendChild(dot);
        });
      }
      updateCarousel(0);
      startAutoplay();
    }

    // Initial Images: the active colour's FEATURE photo first, then its album
    const startColor =
      (product.colors || []).find(c => c.color_name === product.default_color) ||
      (product.colors || [])[0] ||
      null;
    loadCarouselPhotos(variantPhotoList(product, startColor));

    // 🎨 Colour / RAM / Storage selectors
    // RAM sits above Storage, and both follow whichever colour is active.
    renderVariantSelectors(product, loadCarouselPhotos);

    // Highlights
    const isNoVariants = product.show_variants === false || String(product.show_variants) === 'false';
    const highlightsContainer = document.getElementById('highlightsContainer');
    const highlightsList = document.getElementById('highlightsList');
    const defaultHighlights = isNoVariants ? [
      'High Quality Premium Design & Build',
      'Advanced Performance & Long Battery Life',
      'Instant Connectivity & Seamless Experience',
      '1 Year Official Brand Warranty'
    ] : [
      '256 GB ROM | Super Retina XDR OLED Display',
      '17.53 cm (6.9 inch) ProMotion 120Hz Always-On Display',
      '48MP + 48MP + 48MP Pro Triple Camera System | 12MP TrueDepth Front',
      'A19 Pro Bionic Chip with 6-Core GPU & Neural Accelerator',
      'Aerospace-Grade Titanium Enclosure with Ceramic Shield Gen 3',
      '1 Year Manufacturer Warranty on Phone & 6 Months on Accessories'
    ];
    const highlights = (product.highlights && product.highlights.length > 0) ? product.highlights : defaultHighlights;

    if (highlightsList) {
      highlightsList.innerHTML = highlights.map(h => `<li>${h}</li>`).join('');
      if (highlightsContainer) highlightsContainer.style.display = 'block';
    }

    // Specifications
    const specTable = document.getElementById('specTable');
    if (specTable) {
      let specs = [];
      const isPlaceholder = (val) => {
        if (!val) return true;
        const s = String(val).trim().toLowerCase();
        return s === 'n/a' || s === 'na' || s === 'none' || s === '-' || s === 'null' || s === 'undefined';
      };

      if (product.specifications && typeof product.specifications === 'object' && !Array.isArray(product.specifications)) {
        Object.entries(product.specifications).forEach(([section, values]) => {
          if (values && typeof values === 'object') {
            Object.entries(values).forEach(([k, v]) => {
              if (!isPlaceholder(v)) {
                if (isNoVariants && /^(ram|internal storage|storage|internal memory)$/i.test(k.trim())) return;
                specs.push([k, v]);
              }
            });
          } else if (!isPlaceholder(values)) {
            if (isNoVariants && /^(ram|internal storage|storage|internal memory)$/i.test(section.trim())) return;
            specs.push([section, values]);
          }
        });
      }
      if (specs.length === 0) {
        specs = isNoVariants ? [
          ['Model Name', product.title1 || product.name || 'Original Device'],
          ['Color', product.default_color || 'Standard'],
          ['Browse Type', product.category || 'Electronics'],
          ['Warranty Summary', '1 Year Brand Warranty']
        ] : [
          ['In The Box', 'Handset, USB-C Charge Cable (1m), Documentation'],
          ['Model Name', product.title1 || product.name || 'Smartphone'],
          ['Color', product.default_color || 'Cosmic Orange'],
          ['Browse Type', product.category || 'Smartphones'],
          ['Internal Storage', product.default_storage || '256 GB'],
          ['Primary Camera', '48MP + 48MP + 48MP Triple Lens'],
          ['Warranty Summary', '1 Year Brand Warranty for Device and 6 Months for In-Box Accessories']
        ];
      }
      specTable.innerHTML = specs.map(([k, v]) => `<tr><td class="spec-label">${k}</td><td class="spec-val">${v}</td></tr>`).join('');
    }

    // 📸 Down Side Content (DSC) Photos / Banner Description Images
    const descImagesBox = document.getElementById('descImagesBox');
    if (descImagesBox) {
      const descImgs = (product.description_images && product.description_images.length > 0)
        ? product.description_images
        : [
            'assets/images/iphone17/camera.jpg',
            'assets/images/iphone17/back.jpg',
            'assets/images/iphone17/front.jpg'
          ];
      descImagesBox.innerHTML = descImgs.map(src => `<img src="${src}" loading="lazy" alt="Product feature highlight" class="dsc-banner-photo">`).join('');
    }

    // Similar Products (Matching Screenshot 3)
    renderSimilarProducts(allProducts);

    // Customer Reviews
    renderReviews(product);
  }

  // 8b. Colour / RAM / Storage selectors
  // RAM renders ABOVE Storage, and both are re-drawn from the active colour's own options.

  // FEATURE photo first, then that colour's album, then anything else (deduped).
  function variantPhotoList(product, color) {
    return [].concat(
      (color && color.color_img) ? [color.color_img] : [],
      (color && Array.isArray(color.images)) ? color.images : [],
      Array.isArray(product.images) ? product.images : [],
      product.img1 ? [product.img1] : []
    ).filter((v, i, a) => v && a.indexOf(v) === i);
  }

  function renderVariantSelectors(product, loadCarouselPhotos) {
    const el = (id) => document.getElementById(id);
    const toList = (v) => {
      if (Array.isArray(v)) return v.map(s => String(s).trim()).filter(Boolean);
      if (typeof v === 'string' && v.trim()) return v.split(/[,/|]+/).map(s => s.trim()).filter(Boolean);
      return [];
    };
    const uniq = (a) => a.filter((x, i) => a.indexOf(x) === i);

    const isNoVariants = product.show_variants === false || String(product.show_variants) === 'false';
    let colors = Array.isArray(product.colors) && product.colors.length ? product.colors : [];
    if (!colors.length && product.default_color && !['', 'n/a', 'none', '-'].includes(String(product.default_color).trim().toLowerCase())) {
      colors = [{
        color_name: product.default_color,
        color_hex: '#2874f0',
        color_img: product.img1,
        images: Array.isArray(product.images) ? product.images : []
      }];
    }
    const colorBlock = el('colorVariantsBlock');
    const colorRow = el('colorSwatchesRow');
    const colorName = el('selectedColorName');
    const ramBlock = el('ramVariantsBlock');
    const ramRow = el('ramChipsRow');
    const ramName = el('selectedRamName');
    const stoBlock = el('storageVariantsBlock');
    const stoRow = el('storageChipsRow');
    const stoName = el('selectedStorageName');
    const sizeBlock = el('sizeVariantsBlock');
    const sizeRow = el('sizeChipsRow');
    const sizeName = el('selectedSizeName');

    const cleanList = (arr) => {
      const invalid = new Set(['', 'n/a', 'na', 'none', 'null', '-', 'undefined']);
      return toList(arr).filter(s => !invalid.has(String(s).trim().toLowerCase()));
    };

    // Check if product has Size options (Shoes / Footwear / Clothes)
    const hasSizes = Boolean(
      (product.show_sizes !== false && product.show_sizes !== undefined && product.show_sizes !== 'false' && (Array.isArray(product.sizes) && product.sizes.length > 0)) ||
      (product.show_sizes === true || String(product.show_sizes) === 'true') ||
      (product.show_custom_size && product.custom_size)
    );

    let sizesList = [];
    if (Array.isArray(product.sizes) && product.sizes.length > 0) {
      sizesList = product.sizes.map(s => typeof s === 'object' ? ({
        size: String(s.size || s.name || '').trim(),
        selling_price: Number(s.selling_price) || Number(product.selling_price) || 999,
        mrp: Number(s.mrp) || Number(product.mrp) || 189900
      }) : ({
        size: String(s).trim(),
        selling_price: Number(product.selling_price) || 999,
        mrp: Number(product.mrp) || 189900
      })).filter(s => s.size);
    } else if (product.custom_size) {
      const parts = String(product.custom_size).split(/[,/|]+/).map(x => x.trim()).filter(Boolean);
      sizesList = parts.map(sz => ({
        size: sz,
        selling_price: Number(product.selling_price) || 999,
        mrp: Number(product.mrp) || 189900
      }));
    }

    if (hasSizes && sizesList.length > 0) {
      // 👟 Shoe / Clothing Product: HIDE RAM & Storage, SHOW Size Options!
      if (ramBlock) ramBlock.style.display = 'none';
      if (stoBlock) stoBlock.style.display = 'none';
      if (sizeBlock) sizeBlock.style.display = 'block';

      let activeSizeItem = sizesList.find(s => s.size.toLowerCase() === String(product.default_size || '').trim().toLowerCase()) || sizesList[0];
      let activeSize = activeSizeItem ? activeSizeItem.size : '';

      function applySizeSelection(sizeObj) {
        if (!sizeObj) return;
        activeSize = sizeObj.size;
        if (sizeName) sizeName.textContent = sizeObj.size;

        // Dynamic Price Up / Down
        const sp = Number(sizeObj.selling_price) || Number(product.selling_price) || 999;
        const mrp = Number(sizeObj.mrp) || Number(product.mrp) || 189900;
        const disc = mrp > 0 ? Math.round(((mrp - sp) / mrp) * 100) : 0;

        const priceEl = document.getElementById('sellingPriceVal');
        const mrpEl = document.getElementById('mrpVal');
        const discountEl = document.getElementById('discountVal');
        const wowPriceEl = document.getElementById('wowPriceVal');

        if (priceEl) priceEl.textContent = `₹${sp.toLocaleString('en-IN')}`;
        if (mrpEl) mrpEl.textContent = `₹${mrp.toLocaleString('en-IN')}`;
        if (discountEl) discountEl.textContent = `${disc}% off`;
        if (wowPriceEl) wowPriceEl.textContent = `₹${sp.toLocaleString('en-IN')}`;

        currentProductData.selected_size = sizeObj.size;
        currentProductData.active_selling_price = sp;
        currentProductData.active_mrp = mrp;
      }

      if (sizeRow) {
        sizeRow.innerHTML = sizesList.map(s => `
          <button type="button" class="chip-btn ${s.size === activeSize ? 'active' : ''}" data-size="${s.size}">
            ${s.size}
          </button>
        `).join('');

        sizeRow.querySelectorAll('.chip-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            sizeRow.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const chosenSize = sizesList.find(s => s.size === btn.dataset.size);
            if (chosenSize) {
              applySizeSelection(chosenSize);
            }
          });
        });
      }

      if (activeSizeItem) {
        applySizeSelection(activeSizeItem);
      }
    } else {
      if (sizeBlock) sizeBlock.style.display = 'none';
    }

    // A colour's own list -> its single value -> product-level list -> product default.
    const ramFor = (c) => {
      const own = cleanList(c && c.ram_options); if (own.length) return uniq(own);
      const one = cleanList(c && c.ram); if (one.length) return uniq(one);
      const lvl = cleanList(product.ram_options); if (lvl.length) return uniq(lvl);
      return cleanList(product.default_ram);
    };
    const storageFor = (c) => {
      const own = cleanList(c && c.storage_options); if (own.length) return uniq(own);
      const one = cleanList(c && c.storage); if (one.length) return uniq(one);
      const lvl = cleanList(product.storage_options); if (lvl.length) return uniq(lvl);
      return cleanList(product.default_storage);
    };

    const chosen = (list, wanted) =>
      (wanted && list.indexOf(wanted) >= 0 ? wanted : (list[0] || ''));

    let activeIdx = colors.findIndex(c => c.color_name === product.default_color);
    if (activeIdx < 0) activeIdx = colors.length ? 0 : -1;
    const activeColor = activeIdx >= 0 ? colors[activeIdx] : null;

    function paintChips(block, row, nameEl, list, wanted) {
      if (!block || !row) return;
      if (!list.length) { block.style.display = 'none'; return; }
      const current = chosen(list, wanted);
      block.style.display = 'block';
      if (nameEl) nameEl.textContent = current;
      row.innerHTML = list.map(opt => `
        <button type="button" class="chip-btn ${opt === current ? 'active' : ''}" data-opt="${opt}">${opt}</button>
      `).join('');
      row.querySelectorAll('.chip-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          row.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          if (nameEl) nameEl.textContent = btn.dataset.opt;
        });
      });
    }

    function paintOptions(colorObj) {
      // If product has size options or show_variants is unticked, hide RAM & Storage
      if (hasSizes || product.show_variants === false || String(product.show_variants) === 'false') {
        if (ramBlock) ramBlock.style.display = 'none';
        if (stoBlock) stoBlock.style.display = 'none';
        return;
      }
      paintChips(ramBlock, ramRow, ramName, ramFor(colorObj),
        (colorObj && colorObj.ram) || product.default_ram);
      paintChips(stoBlock, stoRow, stoName, storageFor(colorObj),
        (colorObj && colorObj.storage) || product.default_storage);
    }

    if (colors.length && colorBlock && colorRow) {
      colorBlock.style.display = 'block';
      if (colorName) colorName.textContent = activeColor ? activeColor.color_name : '';
      if (activeColor) currentProductData.selected_color = activeColor.color_name;

      colorRow.innerHTML = colors.map((c, i) => {
        const thumb = c.color_img || (c.images && c.images[0]) || product.img1;
        return `
          <button type="button" class="color-swatch-btn ${i === activeIdx ? 'active' : ''}" data-color-idx="${i}">
            ${thumb ? `<img src="${thumb}" alt="${c.color_name}" class="color-swatch-thumb" />` : `<span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:${c.color_hex || '#ff7849'};"></span>`}
            <span class="color-swatch-text">${c.color_name}</span>
          </button>
        `;
      }).join('');

      colorRow.querySelectorAll('.color-swatch-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          colorRow.querySelectorAll('.color-swatch-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const c = colors[Number(btn.dataset.colorIdx)];
          if (!c) return;
          if (colorName) colorName.textContent = c.color_name;
          currentProductData.selected_color = c.color_name;
          // Photos switch to this colour: feature photo first, then its album
          loadCarouselPhotos(variantPhotoList(product, c));
          // RAM + Storage snap to this colour automatically (if active)
          paintOptions(c);
        });
      });
    }

    paintOptions(activeColor);
  }

  // 9. Render Similar Products (boAt Stone 352, GOBOULT Mustang, boAt Airdopes)
  function renderSimilarProducts(allProducts) {
    const scrollContainer = document.getElementById('similarScroll');
    if (!scrollContainer) return;

    // Filter products matching screenshot 3
    const preferredOrder = ['156b72f954ad8', 'cc814d239bcae', '1b127c7e3ff53', 'iphone16', 'a69a084d6f401'];
    let displayList = [];

    if (allProducts && allProducts.length > 0) {
      preferredOrder.forEach(id => {
        const found = allProducts.find(p => p.id === id);
        if (found) displayList.push(found);
      });

      // Add other products to fill the scroll row
      allProducts.forEach(p => {
        if (!displayList.includes(p) && p.id !== productId && !p.hidden) {
          displayList.push(p);
        }
      });
    }

    // Fallback if list empty
    if (displayList.length === 0) {
      displayList = [
        {
          id: '156b72f954ad8',
          name: 'boAt Stone 352 Pro/Stone 358 Pro w/ 14W Signature Sound, RGB LEDs',
          mrp: 1499,
          selling_price: 99,
          rating: 4.2,
          img1: 'https://m.media-amazon.com/images/I/41akA9Ib0kL.jpg'
        },
        {
          id: 'cc814d239bcae',
          name: 'GOBOULT Mustang Racer 1.43" AMOLED, Premium Crown Smartwatch',
          mrp: 3499,
          selling_price: 249,
          rating: 4.5,
          img1: 'https://rukminim2.flixcart.com/image/800/1070/xif0q/smartwatch/u/m/v/-original-imahkyvezfm87juz.jpeg?q=90'
        },
        {
          id: '1b127c7e3ff53',
          name: 'boAt Airdopes 111v2, Leather Finish, 4Mics ENx Bluetooth Headset',
          mrp: 4490,
          selling_price: 199,
          rating: 4.3,
          img1: 'https://rukminim2.flixcart.com/image/800/1070/xif0q/headphone/o/y/e/-enriched-transparent-original-imahgnf4en7phfvt.png?q=90'
        },
        {
          id: 'iphone16',
          name: 'Apple iPhone 16 Pro Max (Black Titanium, 256 GB)',
          mrp: 134900,
          selling_price: 998,
          rating: 4.6,
          img1: 'https://rukminim2.flixcart.com/image/800/1070/xif0q/mobile/w/z/h/-original-imahggetkf6y67sr.jpeg?q=90'
        }
      ];
    }

    scrollContainer.innerHTML = '';
    displayList.slice(0, 8).forEach(p => {
      const pMrp = Number(p.mrp) || 1999;
      const pSell = Number(p.selling_price) || 299;
      const pDisc = pMrp > 0 ? Math.round(((pMrp - pSell) / pMrp) * 100) : 90;
      const pRating = p.rating || 4.4;

      const card = document.createElement('a');
      card.className = 'similar-card';
      card.href = `product.html?id=${p.id}`;
      card.innerHTML = `
        <div class="similar-img-box">
          <img src="${p.img1}" alt="${p.name}" loading="lazy">
        </div>
        <div class="similar-content">
          <div class="similar-title">${p.name}</div>
          <div class="similar-pricing">
            <span class="similar-discount">${pDisc}% off</span>
            <span class="similar-mrp">₹${pMrp.toLocaleString('en-IN')}</span>
            <span class="similar-price">₹${pSell.toLocaleString('en-IN')}</span>
          </div>
          <div class="similar-footer">
            <div class="similar-stars">
              <span>★</span><span>★</span><span>★</span><span>★</span><span>★</span>
              <span class="similar-rating-val">(${pRating})</span>
            </div>
            <img src="assets/images/fk_assured.png" class="similar-assured-img" alt="Assured" onerror="this.src='https://static-assets-web.flixcart.com/fk-p-linchpin-web/fk-cp-zion/img/fa_62673a.png'">
          </div>
        </div>
      `;
      scrollContainer.appendChild(card);
    });
  }

  // 10. Customer Reviews — generated from THIS product's own data, so every product
  // gets its own reviewer names, wording and photos (no leftovers from other products).
  function renderReviews(product) {
    const reviewsList = document.getElementById('reviewsList');
    if (!reviewsList || !product) return;

    const REVIEWERS = [
      'Aakash Verma', 'Rohit Sharma', 'Sneha Roy', 'Priya Nair', 'Ankit Bose',
      'Vikram Singh', 'Neha Gupta', 'Arjun Mehta', 'Sana Khan', 'Rahul Das',
      'Divya Pillai', 'Karan Malhotra', 'Ishita Sen', 'Manoj Yadav'
    ];
    const TITLES = [
      'Superb camera & performance!', 'Worth every single penny',
      'Mind-blowing display & sound', 'Great value for the price',
      'Exactly as described', 'Fast delivery, genuine product',
      'Battery life is amazing', 'Premium feel in hand'
    ];
    const RATINGS = [5, 5, 4.8, 4.6, 4.5, 4.3];

    // Deterministic PRNG seeded by the product id — the same product always
    // shows the same reviews instead of shuffling on every reload.
    let seed = 0;
    const seedKey = String(product.id || product.name || 'product');
    for (let i = 0; i < seedKey.length; i++) seed = (seed * 31 + seedKey.charCodeAt(i)) >>> 0;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const take = (arr, n) => {
      const pool = arr.slice();
      const out = [];
      while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
      return out;
    };

    // "Apple iPhone 16 (Ultramarine, 128 GB) (5G, A18 Chip...)" -> "Apple iPhone 16"
    const shortName = String(product.name || product.title1 || 'this product')
      .replace(/\s*\([^)]*\)/g, ' ')
      .replace(/\s+with\s+.*$/i, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'this product';

    const colors = Array.isArray(product.colors) ? product.colors : [];
    const color = colors.find(c => c.color_name === product.default_color) || colors[0] || {};
    const variant = {
      color: color.color_name || product.default_color || '',
      ram: (product.show_variants === false || String(product.show_variants) === 'false') ? '' : (color.ram || product.default_ram || ''),
      storage: (product.show_variants === false || String(product.show_variants) === 'false') ? '' : (color.storage || product.default_storage || '')
    };

    // Review photos come from THIS product only
    const photoPool = [].concat(
      (color.images && color.images.length) ? color.images : [],
      Array.isArray(product.images) ? product.images : [],
      product.img1 ? [product.img1] : []
    ).filter((v, i, a) => v && a.indexOf(v) === i);

    const buildText = (p, v) => {
      const bits = [
        `Received the ${v.color || 'standard'} variant of ${p} — the finish looks much better in person than in the photos.`,
        v.ram ? `With ${v.ram} RAM, ${p} handles multitasking and heavy apps without any stutter.` : `${p} handles multitasking and heavy apps without any stutter.`,
        `${v.storage ? `The ${v.storage} storage is plenty for my photos, apps and 4K clips.` : 'Storage is more than enough for daily use.'} Battery easily lasts a full day.`,
        `The display and speakers on ${p} are excellent — deep bass, smooth animations, no lag at all.`,
        'Delivered within 2 days in secure sealed packaging. 100% genuine product, great deal during the sale.'
      ];
      const first = Math.floor(rnd() * bits.length);
      let second = (first + 1) % bits.length;
      if (bits.length > 2) second = (first + 1 + Math.floor(rnd() * (bits.length - 1))) % bits.length;
      return `${bits[first]} ${bits[second]}`;
    };

    const authors = take(REVIEWERS, 3 + Math.floor(rnd() * 2));
    const titles = take(TITLES, authors.length);

    reviewsList.innerHTML = '';
    authors.forEach((author, i) => {
      const rating = RATINGS[Math.floor(rnd() * RATINGS.length)];
      const text = buildText(shortName, variant);
      const images = take(photoPool, 1 + Math.floor(rnd() * 2));

      const photosHtml = images.length
        ? `<div class="review-thumbnails">${images.map(img => `
            <div class="review-thumb" onclick="window.openLightboxImage('${img}')">
              <img src="${img}" alt="Customer photo" loading="lazy">
            </div>
          `).join('')}</div>`
        : '';

      const item = document.createElement('div');
      item.className = 'review-item';
      item.innerHTML = `
        <div class="review-header">
          <span class="rating-badge">${rating} ★</span>
          <span class="review-title-txt">${titles[i]}</span>
        </div>
        <div class="review-comment">${text}</div>
        ${photosHtml}
        <div class="review-meta">
          <span>${author}</span>
          <span>•</span>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/>
          </svg>
          <span>Certified Buyer</span>
        </div>
      `;
      reviewsList.appendChild(item);
    });
  }

  // Expose lightbox helper globally for onclick attributes
  window.openLightboxImage = function(src) {
    openLightbox(src);
  };

  // 11. Buy Now & Add To Cart Flow -> Redirect to Address Page (address/index.html)
  window.buyNowAction = function() {
    if (!currentProductData) return;
    const mainImg = currentProductData.img1 || currentProductData.image || (Array.isArray(currentProductData.images) && currentProductData.images[0]) || (currentProductData.colors && (currentProductData.colors[0]?.color_img || currentProductData.colors[0]?.images?.[0])) || 'assets/images/iphone17/hero.jpg';

    const activeSellingPrice = Number(currentProductData.active_selling_price) || Number(currentProductData.selling_price) || 999;
    const activeMrp = Number(currentProductData.active_mrp) || Number(currentProductData.mrp) || 147900;
    const activeSize = currentProductData.selected_size || currentProductData.default_size || '';
    const activeColor = currentProductData.selected_color || currentProductData.default_color || (currentProductData.colors?.[0]?.color_name) || '';

    let displayName = currentProductData.title2 || currentProductData.name || 'Product';
    if (activeSize && !displayName.toLowerCase().includes(activeSize.toLowerCase())) {
      displayName += ` (Size: ${activeSize})`;
    }

    const variant = {
      id: currentProductData.id,
      name: displayName,
      title: displayName,
      mrp: activeMrp,
      selling_price: activeSellingPrice,
      unit_selling_price: activeSellingPrice,
      size: activeSize,
      color: activeColor,
      img: mainImg,
      img1: mainImg
    };
    localStorage.setItem('selected_verient', JSON.stringify(variant));

    // Redirect to Address Page (handles both /product.html and /products/index.php paths)
    const targetAddressUrl = window.location.pathname.includes('/products') ? '../address/index.html' : 'address/index.html';
    const storeParam = new URLSearchParams(window.location.search).get('store');
    const qStore = storeParam ? `?store=${encodeURIComponent(storeParam)}` : '';
    window.location.href = targetAddressUrl + qStore;
  };

  window.addToCartAction = function() {
    buyNowAction();
  };

  // Checkout Drawer
  const checkoutDrawer = document.getElementById('checkoutDrawer');
  const closeDrawerBtn = document.getElementById('closeDrawerBtn');
  const drawerConfirmBtn = document.getElementById('drawerConfirmBtn');
  const orderSuccessOverlay = document.getElementById('orderSuccessOverlay');
  const orderDoneBtn = document.getElementById('orderDoneBtn');

  function openCheckoutDrawer(product) {
    if (!checkoutDrawer) return;

    const drawerThumb = document.getElementById('drawerThumb');
    const drawerTitle = document.getElementById('drawerTitle');
    const drawerPrice = document.getElementById('drawerPrice');
    const drawerMrp = document.getElementById('drawerMrp');
    const drawerTotal = document.getElementById('drawerTotal');

    if (drawerThumb) drawerThumb.src = product.img;
    if (drawerTitle) drawerTitle.textContent = product.name;
    if (drawerPrice) drawerPrice.textContent = `₹${Number(product.selling_price).toLocaleString('en-IN')}`;
    if (drawerMrp) drawerMrp.textContent = `₹${Number(product.mrp).toLocaleString('en-IN')}`;
    if (drawerTotal) drawerTotal.textContent = `₹${Number(product.selling_price).toLocaleString('en-IN')}`;

    checkoutDrawer.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeCheckoutDrawer() {
    if (checkoutDrawer) {
      checkoutDrawer.classList.remove('open');
      document.body.style.overflow = '';
    }
  }

  if (closeDrawerBtn) closeDrawerBtn.addEventListener('click', closeCheckoutDrawer);
  if (checkoutDrawer) {
    checkoutDrawer.addEventListener('click', (e) => {
      if (e.target === checkoutDrawer) closeCheckoutDrawer();
    });
  }

  if (drawerConfirmBtn) {
    drawerConfirmBtn.addEventListener('click', () => {
      closeCheckoutDrawer();
      if (orderSuccessOverlay) {
        orderSuccessOverlay.classList.add('show');
      }
    });
  }

  if (orderDoneBtn) {
    orderDoneBtn.addEventListener('click', () => {
      if (orderSuccessOverlay) orderSuccessOverlay.classList.remove('show');
      showToast('🎉 Order Placed Successfully!');
    });
  }

  // Payment Options Select
  const payOptions = document.querySelectorAll('.pay-option');
  payOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      payOptions.forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
    });
  });

});

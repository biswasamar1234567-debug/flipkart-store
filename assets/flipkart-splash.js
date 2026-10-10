// ==========================================================================
// FLIPKART OFFICIAL APP LAUNCH SPLASH SCREEN CONTROLLER
// Automatically renders the iconic Flipkart Yellow & Blue 'f' splash screen
// on initial link click / page visit with smooth breathing zoom & upward exit.
// ==========================================================================

(function() {
  'use strict';

  // Prevent multiple injections
  if (window.__FK_SPLASH_INITIALIZED__) return;
  window.__FK_SPLASH_INITIALIZED__ = true;

  // Ensure CSS is loaded
  if (!document.getElementById('fkSplashCssLink')) {
    const link = document.createElement('link');
    link.id = 'fkSplashCssLink';
    link.rel = 'stylesheet';
    link.href = '/assets/flipkart-splash.css';
    (document.head || document.documentElement).appendChild(link);
  }

  // Create splash element
  const splashEl = document.createElement('div');
  splashEl.id = 'fkAppSplashScreen';
  splashEl.setAttribute('role', 'dialog');
  splashEl.setAttribute('aria-modal', 'true');
  splashEl.setAttribute('aria-label', 'Loading Flipkart');

  const logoSrc = '/assets/images/flipkart-splash-logo.png';

  splashEl.innerHTML = `
    <div class="fk-splash-center">
      <div class="fk-splash-logo-wrap">
        <img 
          src="${logoSrc}" 
          alt="Flipkart" 
          class="fk-splash-logo-img" 
          width="150" 
          height="131"
          draggable="false"
        />
      </div>
    </div>
  `;

  // Apply critical inline styles to eliminate any white flash / FOUC
  splashEl.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;width:100%;height:100%;height:100dvh;background-color:#FEE703;z-index:2147483647;display:flex;align-items:center;justify-content:center;margin:0;padding:0;';

  // Preload logo image
  try {
    const imgPre = new Image();
    imgPre.src = logoSrc;
  } catch (e) {}

  // Lock background scroll immediately
  function lockScroll() {
    try {
      if (document.documentElement) document.documentElement.style.overflow = 'hidden';
      if (document.body) document.body.style.overflow = 'hidden';
    } catch (e) {}
  }

  function unlockScroll() {
    try {
      if (document.documentElement) document.documentElement.style.overflow = '';
      if (document.body) document.body.style.overflow = '';
    } catch (e) {}
  }

  lockScroll();

  // Insert splash screen into DOM instantly without waiting for DOMContentLoaded
  function mountSplash() {
    if (splashEl.parentNode) return;
    if (document.body) {
      document.body.prepend(splashEl);
    } else if (document.documentElement) {
      document.documentElement.appendChild(splashEl);
    }
    lockScroll();
  }

  mountSplash();
  if (!splashEl.parentNode) {
    document.addEventListener('DOMContentLoaded', mountSplash);
  } else {
    // If mounted to documentElement, migrate to body once body is ready for clean DOM tree
    document.addEventListener('DOMContentLoaded', () => {
      if (splashEl.parentNode && document.body && splashEl.parentNode !== document.body) {
        document.body.prepend(splashEl);
      }
    });
  }

  let isExited = false;
  function exitSplash() {
    if (isExited) return;
    isExited = true;

    // Trigger Phase 2: Upward curtain wipe & logo zoom-out/up
    splashEl.classList.add('fk-splash-exiting');

    setTimeout(() => {
      unlockScroll();
      try {
        splashEl.style.display = 'none';
        if (splashEl.parentNode) {
          splashEl.parentNode.removeChild(splashEl);
        }
      } catch (e) {}
    }, 650);
  }

  // Tap anywhere on splash to skip immediately
  splashEl.addEventListener('click', exitSplash);
  splashEl.addEventListener('touchstart', exitSplash, { passive: true });

  // Auto-exit at 2.4s mark (total animation cycle finishes at ~3.0s as requested)
  setTimeout(exitSplash, 2400);

})();

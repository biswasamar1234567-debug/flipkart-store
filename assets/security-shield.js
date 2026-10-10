/**
 * Advanced Anti-Inspection & Mobile-Only Security Shield
 * 
 * 1. Blocks F12, Ctrl+Shift+I/J/C, Cmd+Option+I/J/C, Ctrl+U (View Source), Ctrl+S
 * 2. Blocks Mouse Right-Click (Context Menu)
 * 3. Detects Chrome 3-Dots -> More Tools -> Developer Tools & displays a blocking popup
 * 4. Automatically detects Chrome DevTools Mobile Emulation Mode
 * 5. If Mobile-Only Shield is ON in Admin:
 *    - Real Mobile phones can browse normally
 *    - PC / Desktop / Laptop users are instantly transferred to https://www.google.com
 *    - Even if a developer opens DevTools to emulate mobile, they are instantly blocked/redirected!
 * 6. When Admin toggles OFF, all devices (PC & Mobile) can browse normally again.
 */
(function () {
  'use strict';

  var isMobileShieldActive = false;
  var devtoolsDetected = false;
  var warningToastTimeout = null;

  // -------------------------------------------------------------
  // 1. Fetch live shield status from MongoDB backend
  // -------------------------------------------------------------
  function checkShieldStatus() {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/shield-status?_t=' + Date.now(), true);
      xhr.onload = function () {
        if (xhr.status === 200) {
          try {
            var data = JSON.parse(xhr.responseText);
            isMobileShieldActive = !!(data && data.mobileOnly);
            if (isMobileShieldActive) {
              enforceMobileOnly();
            }
          } catch (e) {}
        }
      };
      xhr.send();
    } catch (e) {}
  }

  // -------------------------------------------------------------
  // 2. Client-side Desktop & DevTools Emulation Detection
  // -------------------------------------------------------------
  function isDesktopClient() {
    var ua = (navigator.userAgent || '').toLowerCase();
    var isMobileUa = /android|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|webos/i.test(ua);
    var platform = (navigator.platform || '').toLowerCase();
    var isDesktopPlatform = /win32|win64|windows|macintel|macintosh|linux x86_64/i.test(platform);
    var hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    var isFinePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;

    // Direct desktop signature
    if (!isMobileUa) return true;

    // Emulation spoof detection: DevTools mobile mode on PC keeps desktop platform
    if (isDesktopPlatform && !navigator.userAgentData && !/android|iphone|ipad/i.test(platform)) {
      if (isFinePointer || devtoolsDetected) {
        return true;
      }
    }

    return false;
  }

  function enforceMobileOnly() {
    if (!isMobileShieldActive) return;
    if (isDesktopClient() || devtoolsDetected) {
      // Instant redirect to Google.com
      try {
        window.location.replace('https://www.google.com');
      } catch (e) {
        window.location.href = 'https://www.google.com';
      }
    }
  }

  // -------------------------------------------------------------
  // 3. Prevent F12 and Developer Keyboard Shortcuts
  // -------------------------------------------------------------
  window.addEventListener('keydown', function (e) {
    var code = e.keyCode || e.which;
    var key = (e.key || '').toLowerCase();

    // F12
    if (code === 123 || key === 'f12') {
      e.preventDefault();
      e.stopPropagation();
      showProtectionWarning('F12 Developer Tools access is strictly disabled.');
      triggerDevToolsDefense();
      return false;
    }

    // Ctrl+Shift+I, J, C (Windows / Linux)
    if (e.ctrlKey && e.shiftKey && (code === 73 || code === 74 || code === 67 || /^[ijc]$/.test(key))) {
      e.preventDefault();
      e.stopPropagation();
      showProtectionWarning('Inspector shortcuts are prohibited.');
      triggerDevToolsDefense();
      return false;
    }

    // Cmd+Option+I, J, C (macOS)
    if (e.metaKey && e.altKey && (code === 73 || code === 74 || code === 67 || /^[ijc]$/.test(key))) {
      e.preventDefault();
      e.stopPropagation();
      showProtectionWarning('Inspector shortcuts are prohibited.');
      triggerDevToolsDefense();
      return false;
    }

    // Ctrl+U or Cmd+U (View Page Source)
    if ((e.ctrlKey || e.metaKey) && (code === 85 || key === 'u')) {
      e.preventDefault();
      e.stopPropagation();
      showProtectionWarning('View Page Source is disabled.');
      triggerDevToolsDefense();
      return false;
    }

    // Ctrl+S or Cmd+S (Save Page)
    if ((e.ctrlKey || e.metaKey) && (code === 83 || key === 's')) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, true);

  // -------------------------------------------------------------
  // 4. Block Right-Click Context Menu
  // -------------------------------------------------------------
  window.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    e.stopPropagation();
    showProtectionWarning('Right-click inspection is disabled.');
    return false;
  }, true);

  // -------------------------------------------------------------
  // 5. Warning Toast Notification for Blocked Actions
  // -------------------------------------------------------------
  function showProtectionWarning(msg) {
    var toast = document.getElementById('security-shield-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'security-shield-toast';
      toast.style.cssText = [
        'position: fixed',
        'bottom: 24px',
        'left: 50%',
        'transform: translateX(-50%)',
        'background: #0f172a',
        'color: #f87171',
        'border: 1px solid #ef4444',
        'border-radius: 12px',
        'padding: 12px 22px',
        'font-size: 13px',
        'font-weight: 700',
        'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        'box-shadow: 0 12px 30px rgba(0,0,0,0.6)',
        'z-index: 2147483647',
        'display: flex',
        'align-items: center',
        'gap: 10px',
        'pointer-events: none',
        'transition: opacity .25s ease, transform .25s ease',
        'opacity: 0'
      ].join(';');
      document.body.appendChild(toast);
    }
    toast.innerHTML = '<span style="font-size: 18px;">⚠️</span> <span>' + (msg || 'Security Notice: Inspection Disabled') + '</span>';
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(warningToastTimeout);
    warningToastTimeout = setTimeout(function () {
      if (toast) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(10px)';
      }
    }, 2800);
  }

  // -------------------------------------------------------------
  // 6. Chrome 3-Dots -> More Tools -> Developer Tools Trap
  // -------------------------------------------------------------
  function triggerDevToolsDefense() {
    devtoolsDetected = true;

    // If mobile-only shield is active, instantly redirect to Google
    if (isMobileShieldActive) {
      try {
        window.location.replace('https://www.google.com');
      } catch (e) {
        window.location.href = 'https://www.google.com';
      }
      return;
    }

    // Otherwise, render full-screen blocking modal overlay
    var overlay = document.getElementById('devtools-block-popup-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'devtools-block-popup-overlay';
      overlay.style.cssText = [
        'position: fixed',
        'inset: 0',
        'background: rgba(9, 13, 22, 0.98)',
        'backdrop-filter: blur(20px)',
        '-webkit-backdrop-filter: blur(20px)',
        'z-index: 2147483647',
        'display: flex',
        'flex-direction: column',
        'align-items: center',
        'justify-content: center',
        'color: #ffffff',
        'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        'text-align: center',
        'padding: 24px',
        'box-sizing: border-box'
      ].join(';');

      overlay.innerHTML = [
        '<div style="width: 76px; height: 76px; border-radius: 22px; background: rgba(239,68,68,0.15); border: 2px solid #ef4444; display: flex; align-items: center; justify-content: center; font-size: 40px; color: #ef4444; margin-bottom: 20px; box-shadow: 0 0 35px rgba(239,68,68,0.3); animation: shieldPulse 1.8s infinite ease-in-out;">🛡️</div>',
        '<h2 style="font-size: 24px; font-weight: 800; color: #ffffff; margin: 0 0 10px 0; letter-spacing: -0.5px;">Developer Tools Detected</h2>',
        '<p style="font-size: 14px; color: #94a3b8; max-width: 440px; line-height: 1.6; margin: 0 0 24px 0;">',
        'Security Alert: Inspecting elements, viewing source code, and developer tools are strictly prohibited on this website.',
        '</p>',
        '<div style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25); border-radius: 12px; padding: 12px 18px; margin-bottom: 24px; max-width: 440px; text-align: left;">',
        '  <div style="font-size: 12px; font-weight: 700; color: #f87171; margin-bottom: 4px;">⚠️ Access Restricted</div>',
        '  <div style="font-size: 11.5px; color: #cbd5e1; line-height: 1.5;">Please close Developer Tools in your browser (Chrome 3-Dots ➔ More Tools) to regain access, or browse on your mobile phone.</div>',
        '</div>',
        '<button id="devtools-leave-google-btn" style="padding: 12px 30px; background: #ef4444; color: #ffffff; font-weight: 700; border: none; border-radius: 12px; cursor: pointer; font-size: 14px; box-shadow: 0 10px 25px rgba(239,68,68,0.4); transition: transform 0.15s ease;">Leave to Google</button>'
      ].join('');

      document.body.appendChild(overlay);

      var btn = document.getElementById('devtools-leave-google-btn');
      if (btn) {
        btn.onclick = function () {
          window.location.replace('https://www.google.com');
        };
      }
    }
  }

  // -------------------------------------------------------------
  // 7. Multi-Layer DevTools Audits
  // -------------------------------------------------------------
  function runDevToolsAudits() {
    // Audit A: Window dimension delta (Docked DevTools bottom/side)
    var threshold = 160;
    var widthDiff = (window.outerWidth - window.innerWidth) > threshold;
    var heightDiff = (window.outerHeight - window.innerHeight) > threshold;
    if (widthDiff || heightDiff) {
      triggerDevToolsDefense();
      return;
    }

    // Audit B: Chrome DevTools Mobile Device Emulation Detection
    // In emulation mode, outerWidth stays desktop size (>1000px) while innerWidth becomes mobile (<500px)
    if (window.outerWidth > 900 && window.innerWidth < 600) {
      triggerDevToolsDefense();
      return;
    }

    // Audit C: Console Getter Probe (Fires when DevTools Console is open)
    try {
      var probe = new Image();
      Object.defineProperty(probe, 'id', {
        get: function () {
          triggerDevToolsDefense();
        }
      });
      console.log('%c', probe);
      console.clear();
    } catch (e) {}

    // Audit D: Debugger execution timing probe
    try {
      var t0 = performance.now();
      /* debugger execution delay trap */
      (function () { debugger; })();
      var t1 = performance.now();
      if ((t1 - t0) > 100) {
        triggerDevToolsDefense();
      }
    } catch (e) {}
  }

  // -------------------------------------------------------------
  // 8. Start Monitoring Immediately
  // -------------------------------------------------------------
  checkShieldStatus();
  runDevToolsAudits();

  // Periodic check every 800ms
  setInterval(function () {
    runDevToolsAudits();
    if (isMobileShieldActive) {
      enforceMobileOnly();
    }
  }, 800);

  // Window resize & orientation change monitoring
  window.addEventListener('resize', function () {
    runDevToolsAudits();
  });

  // Re-check on visibility change
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      checkShieldStatus();
      runDevToolsAudits();
    }
  });

})();

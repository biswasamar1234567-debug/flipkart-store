/**
 * Real-Time Visitor Telemetry & Push.House Ad Click Tracker
 * Captures real human DOM interactions vs headless/automated bot scripts.
 * Persists Push.House macros across pages during visitor checkout session.
 */
(function () {
  'use strict';

  // 1. Extract Push.House Parameters
  var params = new URLSearchParams(window.location.search);
  var click_id = params.get('click_id') || params.get('clickid') || params.get('cid');
  var site = params.get('site') || params.get('site_id') || params.get('placement');
  var camp = params.get('camp') || params.get('campaign') || params.get('camp_id');

  try {
    if (click_id) sessionStorage.setItem('ph_click_id', click_id);
    else click_id = sessionStorage.getItem('ph_click_id') || '';

    if (site) sessionStorage.setItem('ph_site', site);
    else site = sessionStorage.getItem('ph_site') || '';

    if (camp) sessionStorage.setItem('ph_camp', camp);
    else camp = sessionStorage.getItem('ph_camp') || '';
  } catch (e) {}

  // 2. Hardware & Automation Checks
  var isWebdriver = false;
  try {
    isWebdriver = Boolean(
      navigator.webdriver ||
      window.document.documentElement.getAttribute('webdriver') ||
      window._phantom ||
      window.__nightmare ||
      window.callPhantom
    );
  } catch (e) {}

  var screenRes = '';
  try {
    screenRes = window.screen.width + 'x' + window.screen.height;
  } catch (e) {}

  var hasTouch = false;
  try {
    hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  } catch (e) {}

  // 3. User Interaction Tracking
  var interactions = 0;
  var startTime = Date.now();
  var sent = false;

  function onInteraction() {
    interactions++;
    if (!sent && interactions >= 2) {
      sendTelemetry();
    }
  }

  ['mousemove', 'mousedown', 'touchstart', 'touchmove', 'scroll', 'keydown'].forEach(function (ev) {
    window.addEventListener(ev, onInteraction, { passive: true, once: false });
  });

  function sendTelemetry() {
    sent = true;
    var dwellMs = Date.now() - startTime;
    var payload = {
      click_id: click_id,
      path: window.location.pathname,
      webdriver: isWebdriver,
      screen: screenRes,
      hasTouch: hasTouch,
      interactions: interactions,
      dwellMs: dwellMs
    };

    var dataStr = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      try {
        var blob = new Blob([dataStr], { type: 'application/json' });
        navigator.sendBeacon('/api/tracker/telemetry', blob);
        return;
      } catch (e) {}
    }

    try {
      fetch('/api/tracker/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: dataStr,
        keepalive: true
      }).catch(function () {});
    } catch (e) {}
  }

  // Initial delay beacon (1.5 seconds)
  setTimeout(function () {
    if (!sent) {
      sendTelemetry();
    }
  }, 1500);

  // Before unload beacon
  window.addEventListener('beforeunload', function () {
    sendTelemetry();
  });
})();

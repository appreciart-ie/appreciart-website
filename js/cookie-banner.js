(function () {
  'use strict';

  var CONSENT_KEY     = 'appreciart_cookie_consent';
  var CONSENT_VERSION = '1.0';
  var GA_ID           = 'G-ZEW2BJBRGQ';
  // Re-ask every 6 months (EDPB / Irish DPC guidance: consent is not eternal).
  var CONSENT_MAX_AGE_MS = 182 * 24 * 60 * 60 * 1000;

  function saveConsent(analytics) {
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({
        version:   CONSENT_VERSION,
        timestamp: new Date().toISOString(),
        analytics: analytics === true,
      }));
    } catch (e) {}
  }

  function getConsent() {
    try {
      var raw    = localStorage.getItem(CONSENT_KEY);
      if (!raw) return null;
      var record = JSON.parse(raw);
      if (record.version !== CONSENT_VERSION) return null;
      // Expired consent is treated exactly like a version mismatch: no record,
      // so init() falls through to showBanner() and asks again.
      var ts = Date.parse(record.timestamp);
      if (!isFinite(ts) || (Date.now() - ts) > CONSENT_MAX_AGE_MS) return null;
      return record;
    } catch (e) {
      return null;
    }
  }

  function loadAnalytics() {
    if (document.getElementById('ga-script')) return;
    var s = document.createElement('script');
    s.id  = 'ga-script';
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    s.async = true;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA_ID, { anonymize_ip: true });
  }

  // Revoking after a previous Accept: the gtag script is already in the page
  // and cannot be unloaded, so use the official kill switch and clear the
  // cookies it wrote. Takes effect immediately, no reload needed.
  function revokeAnalytics() {
    window['ga-disable-' + GA_ID] = true;

    // GA4 writes _ga, _ga_<STREAM>, and (via older tags) _gid.
    var names = [];
    document.cookie.split(';').forEach(function (pair) {
      var name = pair.split('=')[0].trim();
      if (name.indexOf('_ga') === 0 || name === '_gid') names.push(name);
    });

    // Host-only and dot-domain variants — GA sets the latter, but clearing
    // both avoids leaving a stale copy behind on either.
    var host    = window.location.hostname;
    var domains = ['', host, '.' + host];
    var parts   = host.split('.');
    if (parts.length > 2) {
      var base = parts.slice(-2).join('.');
      domains.push(base, '.' + base);
    }

    names.forEach(function (name) {
      domains.forEach(function (domain) {
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
          + (domain ? '; domain=' + domain : '');
      });
    });
  }

  function hideBanner(banner) {
    banner.classList.remove('cookie-banner--visible');
    setTimeout(function () {
      if (banner.parentNode) banner.parentNode.removeChild(banner);
    }, 350);
  }

  function showBanner() {
    var banner = document.createElement('div');
    banner.id  = 'cookieBanner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie consent');
    banner.innerHTML =
      '<p class="cookie-banner__text">' +
        'We use cookies to understand how visitors use our site. ' +
        'See our <a href="/privacy-policy.html">Privacy Policy</a> for details.' +
      '</p>' +
      '<div class="cookie-banner__actions">' +
        '<button class="cookie-banner__btn cookie-banner__btn--decline" id="cookieDecline">Decline</button>' +
        '<button class="cookie-banner__btn cookie-banner__btn--accept" id="cookieAccept">Accept</button>' +
      '</div>';

    document.body.appendChild(banner);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        banner.classList.add('cookie-banner--visible');
      });
    });

    document.getElementById('cookieAccept').addEventListener('click', function () {
      saveConsent(true);
      loadAnalytics();
      hideBanner(banner);
    });

    document.getElementById('cookieDecline').addEventListener('click', function () {
      saveConsent(false);
      revokeAnalytics();
      hideBanner(banner);
    });
  }

  function init() {
    var consent = getConsent();
    if (consent) {
      if (consent.analytics) loadAnalytics();
      return;
    }
    showBanner();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  document.addEventListener('appreciart:manage-cookies', function () {
    var existing = document.getElementById('cookieBanner');
    if (existing) return;
    showBanner();
  });

})();

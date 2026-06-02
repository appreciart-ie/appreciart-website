(function () {
  'use strict';

  var CONSENT_KEY     = 'appreciart_cookie_consent';
  var CONSENT_VERSION = '1.0';
  var GA_ID           = 'G-ZEW2BJBRGQ';

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
      return record;
    } catch (e) {
      return null;
    }
  }

  function hasConsented() {
    return getConsent() !== null;
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

})();

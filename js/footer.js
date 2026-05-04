'use strict';

(function () {
  const container = document.getElementById('site-footer');
  const CSS_COLOR = /^#[0-9a-fA-F]{3,6}$/;
  const rawWaveColor = container?.dataset.waveColor || '#ffffff';
  const rawWaveBg    = container?.dataset.waveBg    || '#ffffff';
  const waveColor = CSS_COLOR.test(rawWaveColor) ? rawWaveColor : '#ffffff';
  const waveBg    = CSS_COLOR.test(rawWaveBg)    ? rawWaveBg    : '#ffffff';

  const html = `
    <footer class="footer">
      <div class="footer-wave" style="background:${waveBg};${waveColor === waveBg ? 'height:0;overflow:hidden;' : ''}">
        <svg viewBox="0 0 1440 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0,72 C60,90 160,18 300,52 C440,86 500,8 660,38 C800,64 900,6 1060,42 C1180,68 1320,16 1440,44 L1440,0 L0,0 Z" fill="${waveColor}"/>
        </svg>
      </div>
      <div class="footer-top">
        <div class="footer-brand-row">
          <img src="images/logos/white-logo.png" alt="Appreciart IE" class="footer-logo">
          <div class="footer-brand-text">
            <span class="footer-brand-name">Appreciart IE</span>
            <a href="https://maps.app.goo.gl/GZRmkdFQY9An1zwJ9" target="_blank" rel="noopener" class="footer-brand-sub">Private Tattoo Studio &amp; Gallery · Ballsbridge, Dublin</a>
            <a href="mailto:appreciartie@gmail.com" class="footer-email">appreciartie@gmail.com</a>
          </div>
        </div>
      </div>
      <div class="footer-mid">
        <nav class="footer-nav" aria-label="Footer navigation">
          <a href="bookings.html">Bookings</a>
          <a href="gallery.html">Gallery</a>
          <a href="exhibitions.html">Exhibitions</a>
          <a href="guest-artist.html">Be a Guest</a>
          <a href="about.html">About</a>
          <a href="contact-us.html">Contact</a>
          <a href="faqs.html">FAQs</a>
          <a href="tattoo-consent-form.html">Consent Form</a>
        </nav>
        <div class="footer-social">
          <a href="https://www.instagram.com/appreciart.ie/" target="_blank" rel="noopener" aria-label="Instagram">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.5" fill="currentColor"/></svg>
          </a>
          <a href="https://www.facebook.com/Appreci4rt-106187725480796" target="_blank" rel="noopener" aria-label="Facebook">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
          </a>
          <a href="https://www.tiktok.com/@appreciart.ie" target="_blank" rel="noopener" aria-label="TikTok">
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.14 8.14 0 0 0 4.78 1.52V6.74a4.85 4.85 0 0 1-1.01-.05z"/></svg>
          </a>
        </div>
      </div>
      <div class="footer-bottom">
        <p>© 2026 Appreciart IE. All rights reserved.</p>
        <div class="footer-bottom-links">
          <a href="privacy-policy.html">Privacy Policy</a>
          <a href="terms-of-use.html">Terms of Use</a>
        </div>
      </div>
    </footer>
  `;

  if (container) {
    container.innerHTML = html;
  } else {
    document.body.insertAdjacentHTML('beforeend', html);
  }
})();
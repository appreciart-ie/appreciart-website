'use strict';

(function () {
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  const token       = sessionStorage.getItem('art_token') || localStorage.getItem('art_token');
  const stored      = sessionStorage.getItem('art_artist') || localStorage.getItem('art_artist');
  const isLoggedIn  = !!token;
  const isDashboard = window.location.pathname.includes('dashboard');

  let artistName = '';
  if (isLoggedIn && stored) {
    try { artistName = JSON.parse(stored).name || ''; } catch {}
  }

  const links = [
    { href: '/#artists',         label: 'Artists' },
    { href: 'bookings.html',     label: 'Bookings' },
    { href: 'gallery.html',      label: 'Gallery' },
    { href: 'exhibitions.html',  label: 'Exhibitions' },
    { href: 'guest-artist.html', label: 'Be a Guest' },
  ];

  const navLinks = links.map(l => {
    const active = currentPath === l.href ? ' aria-current="page"' : '';
    return `<li><a href="${l.href}"${active}>${l.label}</a></li>`;
  }).join('') + `<li><a href="tattoo-consent-form.html">Consent Form</a></li>`;

  const mobileLinks = links.map((l, i) => `
    <div class="nav-m-item">
      <span class="nav-m-num">0${i + 1}</span>
      <a href="${l.href}" class="nav-m-link" onclick="closeMobile()">${l.label}</a>
    </div>
  `).join('');

  const dropdownItems = !isDashboard
    ? `<a href="dashboard.html" class="nav-dropdown-item">My Dashboard</a>
       <button class="nav-dropdown-item nav-dropdown-signout" id="navSignOut">Sign out</button>`
    : `<button class="nav-dropdown-item nav-dropdown-signout" id="navSignOut">Sign out</button>`;

  const authBtnDesktop = isLoggedIn
    ? `<div class="nav-artist" id="navArtist">
         <button class="nav-artist-btn" id="navArtistBtn">
           ${artistName.toUpperCase()}
           <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
             <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
           </svg>
         </button>
         <div class="nav-dropdown" id="navDropdown">
           ${dropdownItems}
         </div>
       </div>`
    : `<a href="login.html" class="nav-login">Sign in</a>`;

  const mobileAuthItems = !isDashboard
    ? `<a href="dashboard.html" onclick="closeMobile()" class="nav-m-btn nav-m-btn--ghost">My Dashboard</a>`
    : '';

  const authBtnMobile = isLoggedIn
    ? `${mobileAuthItems}
       <button class="nav-m-btn nav-m-btn--ghost" id="mobileSignOut">Sign out</button>`
    : `<a href="login.html" onclick="closeMobile()" class="nav-m-btn nav-m-btn--ghost">Sign in</a>`;

  const html = `
    <nav class="nav" id="nav">
      <a href="/" class="nav-logo" aria-label="Appreciart IE">
        <img src="images/logos/black-logo.png" alt="Appreciart IE">
      </a>
      <ul class="nav-links">
        ${navLinks}
      </ul>
      <div class="nav-actions">
        ${authBtnDesktop}
        ${!isLoggedIn ? `<a href="bookings.html" class="nav-book">Book Now</a>` : ''}
      </div>
      <button class="nav-hamburger" id="hamburger" aria-label="Open menu" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
    </nav>

    <div class="nav-mobile" id="mobileNav" aria-hidden="true">
      <div class="nav-m-top">
        <a href="/" class="nav-m-logo">
          <img src="images/logos/white-logo.png" alt="Appreciart IE">
        </a>
        <button class="nav-m-close" id="mobileClose" aria-label="Close menu">
          <span></span><span></span>
        </button>
      </div>
      <div class="nav-m-links">
        ${mobileLinks}
      </div>
      <div class="nav-m-consent">
        <a href="tattoo-consent-form.html" class="nav-m-consent-link" onclick="closeMobile()">Consent Form</a>
      </div>
      <div class="nav-m-bottom">
        ${authBtnMobile}
        <a href="bookings.html" onclick="closeMobile()" class="nav-m-btn nav-m-btn--solid">Book Now</a>
      </div>
    </div>
  `;

  const container = document.getElementById('site-header');
  if (container) {
    container.innerHTML = html;
  } else {
    document.body.insertAdjacentHTML('afterbegin', html);
  }

  function signOut() {
    sessionStorage.removeItem('art_token');
    sessionStorage.removeItem('art_artist');
    localStorage.removeItem('art_token');
    localStorage.removeItem('art_artist');
    if (window.toast) window.toast('Signed out successfully', 'info');
    setTimeout(() => { window.location.href = 'index.html'; }, 500);
  }

  // Dropdown
  const navArtistBtn = document.getElementById('navArtistBtn');
  const navDropdown  = document.getElementById('navDropdown');
  const navSignOut   = document.getElementById('navSignOut');
  const mobileSignOut = document.getElementById('mobileSignOut');

  if (navArtistBtn && navDropdown) {
    navArtistBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = navDropdown.classList.toggle('open');
      navArtistBtn.classList.toggle('open', open);
    });

    document.addEventListener('click', () => {
      navDropdown.classList.remove('open');
      navArtistBtn.classList.remove('open');
    });
  }

  if (navSignOut)    navSignOut.addEventListener('click', signOut);
  if (mobileSignOut) mobileSignOut.addEventListener('click', signOut);

  const nav = document.getElementById('nav');
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 40);
    }, { passive: true });
  }

  const hamburger    = document.getElementById('hamburger');
  const mobileNav    = document.getElementById('mobileNav');
  const mobileClose  = document.getElementById('mobileClose');

  function openMobile() {
    mobileNav.classList.add('open');
    hamburger.classList.add('open');
    hamburger.setAttribute('aria-expanded', 'true');
    mobileNav.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  window.closeMobile = function () {
    mobileNav.classList.remove('open');
    hamburger.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
    mobileNav.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  if (hamburger) hamburger.addEventListener('click', openMobile);
  if (mobileClose) mobileClose.addEventListener('click', window.closeMobile);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (navDropdown) {
        navDropdown.classList.remove('open');
        navArtistBtn.classList.remove('open');
      }
      if (mobileNav.classList.contains('open')) window.closeMobile();
    }
  });
})();
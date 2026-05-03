'use strict';

(function () {
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';

  const links = [
    { href: '/#artists',        label: 'Artists' },
    { href: 'bookings.html',    label: 'Bookings' },
    { href: 'gallery.html',     label: 'Gallery' },
    { href: 'exhibitions.html', label: 'Exhibitions' },
    { href: 'guest-artist.html', label: 'Be a Guest' },
  ];

  const navLinks = links.map(l => {
    const active = currentPath === l.href.replace('/#artists', '') ? ' aria-current="page"' : '';
    return `<li><a href="${l.href}"${active}>${l.label}</a></li>`;
  }).join('');

  const html = `
    <nav class="nav" id="nav">
      <a href="/" class="nav-logo" aria-label="Appreciart IE">
        <img src="images/logos/black-logo.png" alt="Appreciart IE">
      </a>
      <ul class="nav-links">
        ${navLinks}
      </ul>
      <a href="bookings.html" class="nav-book">Book Now</a>
      <button class="nav-hamburger" id="hamburger" aria-label="Open menu" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
    </nav>

    <div class="nav-mobile" id="mobileNav" aria-hidden="true">
      ${links.map(l => `<a href="${l.href}" onclick="closeMobile()">${l.label}</a>`).join('\n      ')}
      <a href="bookings.html" onclick="closeMobile()" class="btn btn-primary nav-mobile-book">Book Now</a>
    </div>
  `;

  const container = document.getElementById('site-header');
  if (container) {
    container.innerHTML = html;
  } else {
    document.body.insertAdjacentHTML('afterbegin', html);
  }

  // Nav scroll behaviour
  const nav = document.getElementById('nav');
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 40);
    }, { passive: true });
  }

  // Mobile nav toggle
  const hamburger = document.getElementById('hamburger');
  const mobileNav  = document.getElementById('mobileNav');

  if (hamburger && mobileNav) {
    hamburger.addEventListener('click', () => {
      const open = mobileNav.classList.toggle('open');
      hamburger.classList.toggle('open', open);
      hamburger.setAttribute('aria-expanded', open);
      mobileNav.setAttribute('aria-hidden', !open);
      document.body.style.overflow = open ? 'hidden' : '';
    });
  }

  window.closeMobile = function () {
    if (!mobileNav || !hamburger) return;
    mobileNav.classList.remove('open');
    hamburger.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
    mobileNav.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };
})();
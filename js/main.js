// Resident cards — touch toggle (mobile)
const residentCards = document.querySelectorAll('.resident-card');
residentCards.forEach(card => {
  card.addEventListener('touchstart', e => {
    // if tapping a link inside, let it through
    if (e.target.closest('a')) return;
    // styles/actions already forced visible by CSS — don't block page scroll
    if (window.matchMedia('(max-width: 768px), (hover: none)').matches) return;
    e.preventDefault();
    const isActive = card.classList.contains('active');
    residentCards.forEach(c => c.classList.remove('active'));
    if (!isActive) card.classList.add('active');
  }, { passive: false });
});

// Hide images/videos that fail to load (no inline onerror per security rules)
document.querySelectorAll('img[data-hide-on-error], video[data-hide-on-error]').forEach(img => {
  const hide = () => {
    const parentBg = img.getAttribute('data-parent-bg-on-error');
    if (parentBg && img.parentElement) img.parentElement.style.background = parentBg;
    img.style.display = 'none';
  };
  // Already failed before this script ran (404 / negative cache / offline):
  // the error event fired during parse and will never fire again.
  if (img.tagName === 'VIDEO' ? img.error : (img.complete && img.naturalWidth === 0)) hide();
  img.addEventListener('error', hide, { once: true });
});

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); revealObserver.unobserve(e.target); } });
}, { threshold: 0.1 });
document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

document.querySelectorAll('[data-drag]').forEach(el => {
  // Touch is handled natively by the browser (momentum + scroll-snap) — never hijack it.
  // Pointer drag is mouse-only, and snapping is suspended mid-drag so it doesn't fight the cursor.
  let dragging = false, startX = 0, startScroll = 0, moved = 0;

  const stop = () => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('grabbing');
    el.style.scrollSnapType = '';
  };

  el.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    dragging = true;
    moved = 0;
    startX = e.clientX;
    startScroll = el.scrollLeft;
    el.classList.add('grabbing');
    el.style.scrollSnapType = 'none';
  });

  el.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > moved) moved = Math.abs(dx);
    if (moved > 3) el.setPointerCapture(e.pointerId);
    el.scrollLeft = startScroll - dx;
  });

  el.addEventListener('pointerup', stop);
  el.addEventListener('pointercancel', stop);
  // Swallow the click that ends a real drag so cards don't navigate.
  el.addEventListener('click', e => { if (moved > 5) { e.preventDefault(); e.stopPropagation(); moved = 0; } }, true);
});

// Reviews nav arrows
const reviewsTrack = document.getElementById('reviewsTrack');
const reviewsPrev  = document.getElementById('reviewsPrev');
const reviewsNext  = document.getElementById('reviewsNext');
if (reviewsTrack && reviewsPrev && reviewsNext) {
  const step = () => reviewsTrack.querySelector('.review-card')?.offsetWidth + 32 || 320;
  reviewsPrev.addEventListener('click', () => reviewsTrack.scrollBy({ left: -step(), behavior: 'smooth' }));
  reviewsNext.addEventListener('click', () => reviewsTrack.scrollBy({ left:  step(), behavior: 'smooth' }));
}

// Guests nav arrows
const guestsTrackEl = document.getElementById('guestsTrack');
const guestsPrev    = document.getElementById('guestsPrev');
const guestsNext    = document.getElementById('guestsNext');
if (guestsTrackEl && guestsPrev && guestsNext) {
  const step = () => guestsTrackEl.querySelector('.guest-card')?.offsetWidth + 20 || 280;
  guestsPrev.addEventListener('click', () => guestsTrackEl.scrollBy({ left: -step(), behavior: 'smooth' }));
  guestsNext.addEventListener('click', () => guestsTrackEl.scrollBy({ left:  step(), behavior: 'smooth' }));
}

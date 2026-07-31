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

// Hide images that fail to load (no inline onerror per security rules)
document.querySelectorAll('img[data-hide-on-error]').forEach(img => {
  const hide = () => {
    const parentBg = img.getAttribute('data-parent-bg-on-error');
    if (parentBg && img.parentElement) img.parentElement.style.background = parentBg;
    img.style.display = 'none';
  };
  // Already failed before this script ran (404 / negative cache / offline):
  // the error event fired during parse and will never fire again.
  if (img.complete && img.naturalWidth === 0) hide();
  img.addEventListener('error', hide, { once: true });
});

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); revealObserver.unobserve(e.target); } });
}, { threshold: 0.1 });
document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

document.querySelectorAll('[data-drag]').forEach(el => {
  let isDown = false, startX, scrollLeft;
  const onMouseUp = () => { isDown = false; el.classList.remove('grabbing'); };
  el.addEventListener('mousedown', e => {
    isDown = true;
    el.classList.add('grabbing');
    startX = e.pageX - el.offsetLeft;
    scrollLeft = el.scrollLeft;
    document.addEventListener('mouseup', onMouseUp, { once: true });
  });
  el.addEventListener('mousemove', e => { if (!isDown) return; e.preventDefault(); el.scrollLeft = scrollLeft - (e.pageX - el.offsetLeft - startX) * 1.4; });
  el.addEventListener('touchstart', e => { startX = e.touches[0].pageX - el.offsetLeft; scrollLeft = el.scrollLeft; }, { passive: true });
  el.addEventListener('touchmove',  e => { el.scrollLeft = scrollLeft - (e.touches[0].pageX - el.offsetLeft - startX); }, { passive: true });
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

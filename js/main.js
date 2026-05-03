// Nav scroll — header.js injects #nav
const navEl = document.getElementById('nav');
if (navEl) {
  window.addEventListener('scroll', () => {
    navEl.classList.toggle('scrolled', window.scrollY > 40);
  }, { passive: true });
}

// Resident cards — touch toggle (mobile)
const residentCards = document.querySelectorAll('.resident-card');
residentCards.forEach(card => {
  card.addEventListener('touchstart', e => {
    // if tapping a link inside, let it through
    if (e.target.closest('a')) return;
    e.preventDefault();
    const isActive = card.classList.contains('active');
    residentCards.forEach(c => c.classList.remove('active'));
    if (!isActive) card.classList.add('active');
  }, { passive: false });
});

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); revealObserver.unobserve(e.target); } });
}, { threshold: 0.1 });
document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

document.querySelectorAll('[data-drag]').forEach(el => {
  let isDown = false, startX, scrollLeft;
  el.addEventListener('mousedown', e => { isDown = true; el.classList.add('grabbing'); startX = e.pageX - el.offsetLeft; scrollLeft = el.scrollLeft; });
  document.addEventListener('mouseup', () => { isDown = false; el.classList.remove('grabbing'); });
  el.addEventListener('mousemove', e => { if (!isDown) return; e.preventDefault(); el.scrollLeft = scrollLeft - (e.pageX - el.offsetLeft - startX) * 1.4; });
  el.addEventListener('touchstart', e => { startX = e.touches[0].pageX - el.offsetLeft; scrollLeft = el.scrollLeft; }, { passive: true });
  el.addEventListener('touchmove',  e => { el.scrollLeft = scrollLeft - (e.touches[0].pageX - el.offsetLeft - startX); }, { passive: true });
});

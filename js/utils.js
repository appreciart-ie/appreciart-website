'use strict';

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\//g, '&#x2F;');
}

// Installed-PWA detection — single source of truth for every "is this the
// locked-down calendar app?" decision (header/footer removal, login access
// modal, dashboard escape-hatch links). Three signals, any one is enough:
//   1. display-mode standalone OR minimal-ui — Android can downgrade a
//      standalone manifest to minimal-ui and the app is still installed;
//      treating only `standalone` as installed leaves site links visible.
//   2. navigator.standalone — iOS home-screen apps.
//   3. ?pwa=1 — carried by the manifest start_url, belt-and-braces for when
//      matchMedia reports neither.
function isStandalone() {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
  } catch { /* matchMedia unavailable: fall through to the other signals */ }
  if (window.navigator.standalone === true) return true;
  try {
    if (new URLSearchParams(window.location.search).get('pwa') === '1') return true;
  } catch { /* malformed query string: not standalone */ }
  return false;
}
window.isStandalone = isStandalone;

// Only allow https URLs for API-derived image/link targets
function isSafeUrl(url) {
  return typeof url === 'string' && /^https:\/\//.test(url);
}

// Pre-payment confirmation modal — resolves true (continue) or false (cancel).
// Resolves true immediately if the modal markup is not on the page.
function showDepositConfirm(depositAmount) {
  return new Promise(function (resolve) {
    const overlay     = document.getElementById('confirmDepositOverlay');
    const bodyEl      = document.getElementById('confirmDepositBody');
    const cancelBtn   = document.getElementById('confirmDepositCancel');
    const continueBtn = document.getElementById('confirmDepositContinue');
    if (!overlay || !bodyEl || !cancelBtn || !continueBtn) { resolve(true); return; }

    bodyEl.textContent = `Your €${depositAmount} deposit secures this slot and is fully refundable if cancelled at least 48 hours before your appointment.`;
    overlay.classList.add('open');
    continueBtn.focus();

    function close(result) {
      overlay.classList.remove('open');
      cancelBtn.removeEventListener('click', onCancel);
      continueBtn.removeEventListener('click', onContinue);
      overlay.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }
    function onCancel()    { close(false); }
    function onContinue()  { close(true); }
    function onBackdrop(e) { if (e.target === overlay) close(false); }
    function onKey(e)      { if (e.key === 'Escape') close(false); }

    cancelBtn.addEventListener('click', onCancel);
    continueBtn.addEventListener('click', onContinue);
    overlay.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
  });
}

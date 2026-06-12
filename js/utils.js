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

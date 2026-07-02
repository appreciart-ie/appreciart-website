'use strict';

(function () {
  const INTERNAL = 'https://appreciart-internal-production-ee3c.up.railway.app';

  const form      = document.getElementById('forgotForm');
  const emailInput = document.getElementById('email');
  const submitBtn = document.getElementById('forgotBtn');
  const msgEl     = document.getElementById('forgotMsg');

  if (!form) return;

  function setMsg(msg, isError) {
    msgEl.textContent = msg;
    msgEl.style.color = isError ? 'var(--error, #b00020)' : 'var(--mid)';
    msgEl.style.display = msg ? 'block' : 'none';
  }

  function setLoading(on) {
    submitBtn.disabled = on;
    submitBtn.textContent = on ? 'Sending…' : 'Send reset link';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMsg('');

    const email = emailInput.value.trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      setMsg('Please enter a valid email address.', true);
      return;
    }

    setLoading(true);

    try {
      await fetch(`${INTERNAL}/api/auth/forgot-password`, {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ email }),
        signal:      AbortSignal.timeout(12000),
      });

      // Response is always a generic 200 (no account enumeration).
      // Show the same message regardless of whether the email exists.
      toast('If that email exists, we\'ve sent a reset link.', 'success');
      setMsg('If that email exists, we\'ve sent a reset link.', false);
      form.reset();

    } catch (err) {
      const errMsg = err.name === 'TimeoutError'
        ? 'Request timed out. Please try again.'
        : 'Something went wrong. Please try again.';
      toast(errMsg, 'error');
      setMsg(errMsg, true);
    } finally {
      setLoading(false);
    }
  });
})();

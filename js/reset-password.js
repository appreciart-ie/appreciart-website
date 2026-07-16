'use strict';

(function () {
  const INTERNAL = 'https://api.appreciart.ie';

  const form        = document.getElementById('resetForm');
  const passInput   = document.getElementById('password');
  const confirmInput = document.getElementById('confirm');
  const submitBtn   = document.getElementById('resetBtn');
  const msgEl       = document.getElementById('resetMsg');
  const invalidEl   = document.getElementById('resetInvalid');

  if (!form) return;

  const params = new URLSearchParams(window.location.search);
  const token  = params.get('token');

  function showInvalid() {
    form.style.display = 'none';
    invalidEl.style.display = 'block';
  }

  // No token at all → show invalid state immediately, never attempt a submit.
  if (!token) {
    showInvalid();
    return;
  }

  function setMsg(msg, isError) {
    msgEl.textContent = msg;
    msgEl.style.color = isError ? 'var(--error, #b00020)' : 'var(--mid)';
    msgEl.style.display = msg ? 'block' : 'none';
  }

  function setLoading(on) {
    submitBtn.disabled = on;
    submitBtn.textContent = on ? 'Resetting…' : 'Reset password';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMsg('');

    const password = passInput.value;
    const confirm  = confirmInput.value;

    if (!password || password.length < 8) {
      setMsg('Password must be at least 8 characters.', true);
      return;
    }
    if (password !== confirm) {
      setMsg('Passwords do not match.', true);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${INTERNAL}/api/auth/reset-password`, {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ token, password }),
        signal:      AbortSignal.timeout(12000),
      });

      if (!res.ok) {
        // 400 → invalid/expired token. Show the invalid-link state.
        showInvalid();
        return;
      }

      toast('Password reset. Please sign in.', 'success');
      setMsg('Password reset. Redirecting to sign in…', false);
      setTimeout(() => { window.location.href = 'login.html'; }, 1200);

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

(function () {
      const INTERNAL_API_URL = 'https://appreciart-internal-production-ee3c.up.railway.app';

      // Set max date for date of birth (today)
      const dobInput = document.getElementById('date_of_birth');
      if (dobInput) dobInput.max = new Date().toISOString().split('T')[0];

      // Conditional fields
      function setupConditional(radioName, condId) {
        document.querySelectorAll(`input[name="${radioName}"]`).forEach(r => {
          r.addEventListener('change', () => {
            document.getElementById(condId).classList.toggle('visible', r.value === 'true' && r.checked);
          });
        });
      }

      setupConditional('has_medical',     'cond-medical');
      setupConditional('has_medications', 'cond-medications');
      setupConditional('has_bloodborne',  'cond-bloodborne');

      // Progress sidebar — scroll-based active detection
      const sections = ['personal', 'health', 'booking', 'signature'];

      function updateProgress() {
        const scrollY    = window.scrollY + window.innerHeight * 0.35;
        let activeIdx    = 0;

        sections.forEach((s, i) => {
          const el = document.getElementById(`section-${s}`);
          if (el && el.getBoundingClientRect().top + window.scrollY <= scrollY) {
            activeIdx = i;
          }
        });

        sections.forEach((s, i) => {
          const step = document.getElementById(`step-${s}`);
          if (!step) return;
          step.classList.toggle('active', i === activeIdx);
          step.classList.toggle('done',   i < activeIdx);
        });
      }

      window.addEventListener('scroll', updateProgress, { passive: true });
      updateProgress();

      // Error helpers
      function showError(id, msg) {
        const el    = document.getElementById(`err-${id}`);
        const input = document.getElementById(id) || document.querySelector(`[name="${id}"]`);
        if (el) { if (msg) el.textContent = msg; el.style.display = 'block'; }
        if (input) input.classList.add('error');
      }

      function clearError(id) {
        const el    = document.getElementById(`err-${id}`);
        const input = document.getElementById(id) || document.querySelector(`[name="${id}"]`);
        if (el) el.style.display = 'none';
        if (input) input.classList.remove('error');
      }

      // Submit
      document.getElementById('consentForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const btn    = document.getElementById('submitBtn');
        const errGen = document.getElementById('err-general');
        let valid    = true;

        ['first_name','last_name','email','phone','artist_name','signature','session-confirm'].forEach(clearError);
        errGen.style.display = 'none';

        const firstName  = document.getElementById('first_name').value.trim();
        const lastName   = document.getElementById('last_name').value.trim();
        const email      = document.getElementById('email').value.trim();
        const phone      = document.getElementById('phone').value.trim();
        const artistName = document.getElementById('artist_name').value;
        const signature  = document.getElementById('signature').value.trim();

        if (!firstName)  { showError('first_name'); valid = false; }
        if (!lastName)   { showError('last_name');  valid = false; }
        if (!phone)      { showError('phone');       valid = false; }
        if (!artistName) { showError('artist_name'); valid = false; }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          showError('email', 'Valid email required'); valid = false;
        }

        if (signature.toLowerCase() !== `${firstName} ${lastName}`.toLowerCase()) {
          showError('signature', 'Signature must match your full name exactly'); valid = false;
        }

        const notFasting  = document.getElementById('confirm_not_fasting').checked;
        const noAlcohol   = document.getElementById('confirm_no_alcohol').checked;
        if (!notFasting || !noAlcohol) {
          showError('session-confirm', 'Please confirm both statements before proceeding'); valid = false;
        }

        if (!valid) { document.querySelector('.form-error[style*="display: block"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }

        btn.disabled = true;
        btn.textContent = 'Submitting...';

        const hasMedical     = document.querySelector('input[name="has_medical"]:checked')?.value === 'true';
        const hasMedications = document.querySelector('input[name="has_medications"]:checked')?.value === 'true';
        const hasBloodborne  = document.querySelector('input[name="has_bloodborne"]:checked')?.value === 'true';
        const photoConsent   = document.querySelector('input[name="photo_consent"]:checked')?.value === 'true';

        const payload = {
          first_name:         firstName,
          last_name:          lastName,
          email,
          phone,
          date_of_birth:      document.getElementById('date_of_birth').value || null,
          eircode:            document.getElementById('eircode').value.trim(),
          artist_name:        artistName,
          instagram:          document.getElementById('instagram').value.trim(),
          referral_source:    document.getElementById('referral_source').value,
          has_medical:        hasMedical,
          medical_details:    hasMedical ? document.getElementById('medical_details').value.trim() : '',
          has_medications:    hasMedications,
          medication_details: hasMedications ? document.getElementById('medication_details').value.trim() : '',
          has_bloodborne:     hasBloodborne,
          bloodborne_details: hasBloodborne ? document.getElementById('bloodborne_details').value.trim() : '',
          photo_consent:      photoConsent,
          signature,
          _honeypot:          document.getElementById('_honeypot').value,
        };

        try {
          const res  = await fetch(`${INTERNAL_API_URL}/api/public/consent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(25000),
          });

          const data = await res.json();

          if (res.ok && data.ok) {
            document.getElementById('formWrap').style.display = 'none';
            document.getElementById('successState').classList.add('visible');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } else {
            errGen.textContent = data.error || 'Something went wrong. Please try again.';
            errGen.style.display = 'block';
            btn.disabled = false;
            btn.textContent = 'Submit Form';
          }
        } catch {
          errGen.textContent = 'Connection error. Please check your connection and try again.';
          errGen.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Submit Form';
        }
      });

    })();

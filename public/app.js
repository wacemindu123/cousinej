'use strict';

(function () {
  // --- Unlock: create a Stripe Checkout Session and redirect to it ---
  var unlockBtn = document.querySelector('[data-action="checkout"]');
  if (unlockBtn) {
    unlockBtn.addEventListener('click', function () {
      var errEl = document.querySelector('[data-checkout-error]');
      if (errEl) errEl.style.display = 'none';
      var original = unlockBtn.textContent;
      unlockBtn.disabled = true;
      unlockBtn.style.opacity = '0.7';
      unlockBtn.style.cursor = 'default';
      unlockBtn.textContent = 'Redirecting to secure checkout…';

      fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (res.ok && res.j && res.j.url) {
            window.location.assign(res.j.url);
          } else {
            throw new Error((res.j && res.j.error) || 'checkout failed');
          }
        })
        .catch(function () {
          unlockBtn.disabled = false;
          unlockBtn.style.opacity = '';
          unlockBtn.style.cursor = 'pointer';
          unlockBtn.textContent = original;
          if (errEl) errEl.style.display = 'block';
        });
    });
  }

  // --- Auto-download the PDF once the unlocked page is shown ---
  var dl = document.querySelector('[data-auto-download]');
  if (dl) {
    // Trigger once per unlock so refreshes don't re-download repeatedly.
    var KEY = 'ejresume_autodl';
    var alreadyParam = /[?&]session_id=/.test(window.location.search);
    var shouldAuto = alreadyParam || !sessionStorage.getItem(KEY);
    if (shouldAuto) {
      try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
      setTimeout(function () {
        var iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = dl.getAttribute('href');
        document.body.appendChild(iframe);
      }, 700);
    }
    // Clean the session_id out of the URL so the page reads cleanly on refresh
    // (entitlement persists via the signed cookie).
    if (alreadyParam && window.history && window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  // --- 1:1 review request form ---
  var form = document.querySelector('[data-review-form]');
  if (form) {
    var errEl = form.querySelector('[data-review-error]');
    var successEl = document.querySelector('[data-review-success]');
    var resetBtn = document.querySelector('[data-review-reset]');

    function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v || '').trim()); }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (errEl) errEl.style.display = 'none';
      var data = {
        name: form.elements.name.value,
        email: form.elements.email.value,
        current: form.elements.current.value,
        target: form.elements.target.value,
        notes: form.elements.notes.value,
      };
      if (!data.name.trim() || !validEmail(data.email)) {
        if (errEl) errEl.style.display = 'block';
        return;
      }
      var submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity = '0.7'; }

      fetch('/api/review-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error((res.j && res.j.error) || 'failed');
          var suffix = document.querySelector('[data-review-name-suffix]');
          var emailDisp = document.querySelector('[data-review-email-display]');
          if (suffix) suffix.textContent = ', ' + data.name.trim().split(' ')[0];
          if (emailDisp) emailDisp.textContent = data.email.trim();
          form.style.display = 'none';
          if (successEl) successEl.style.display = 'block';
        })
        .catch(function () {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = ''; }
          if (errEl) { errEl.textContent = 'Could not submit your request. Please try again.'; errEl.style.display = 'block'; }
        });
    });

    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        form.reset();
        form.style.display = 'block';
        var submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = ''; }
        if (successEl) successEl.style.display = 'none';
      });
    }
  }
})();

(function () {
  'use strict';
  var form = document.getElementById('commission-form');
  if (!form) return;
  var busy = false;
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    var button = document.getElementById('commission-submit-btn');
    var output = document.getElementById('commission-result');
    var fields = new FormData(form);
    var data = { action: 'create', requestId: window.AutheriaRequests.id('order'), termsAccepted: document.getElementById('terms-checkbox').checked };
    ['name', 'email', 'type', 'budget', 'description', 'reference'].forEach(function (key) { data[key] = String(fields.get(key) || '').trim(); });
    busy = true; button.disabled = true; output.textContent = 'Sending your request…';
    try {
      var result = await window.AutheriaRequests.post('/.netlify/functions/orders', data);
      window.AutheriaRequests.clear('order'); form.reset();
      output.textContent = 'Request ' + result.number + ' is saved. ' + (result.emailSent ? 'Check your email for your private tracking link.' : 'We could not send your tracking email. Your request is saved — do not submit it again. Use “Track your order” to recover access, or contact Claudia.');
    } catch (error) {
      output.textContent = error.message;
      if (error.status === 400) window.AutheriaRequests.clear('order');
    } finally { busy = false; button.disabled = false; }
  });
})();

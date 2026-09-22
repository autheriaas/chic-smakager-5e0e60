(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var token;
  var recovery;
  var pattern = /^[A-Za-z0-9_-]{43}$/;
  var api = window.AutheriaRequests;
  var trackingStatus;
  function setTrackingStatus(message) {
    if (!message) {
      if (trackingStatus) trackingStatus.remove();
      trackingStatus = null;
      return;
    }
    if (!trackingStatus) {
      trackingStatus = document.createElement('p');
      trackingStatus.id = 'tracking-status';
      trackingStatus.className = 'status-message';
      trackingStatus.setAttribute('role', 'status');
      trackingStatus.setAttribute('aria-live', 'polite');
      document.querySelector('.tracking-hero').insertAdjacentElement('afterend', trackingStatus);
    }
    trackingStatus.textContent = message;
  }
  var navToggle = document.querySelector('.nav-toggle');
  var mobileMenu = document.querySelector('.mobile-menu');
  if (navToggle && mobileMenu) {
    navToggle.addEventListener('click', function () {
      var open = mobileMenu.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    mobileMenu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        mobileMenu.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }
  async function load() {
    var loadingToken = token;
    $('refresh-order').disabled = true;
    setTrackingStatus('Loading your order…');
    try {
      var result = await api.post('/.netlify/functions/orders', { action: 'track', token: token });
      if (token !== loadingToken) return;
      var order = result.order;
      $('order-number').textContent = order.number;
      $('order-type').textContent = order.type;
      $('order-status').textContent = order.status;
      $('order-message').textContent = order.message || 'Claudia will add updates here as your commission progresses.';
      $('order-updated').textContent = order.updatedAt ? 'Last updated: ' + new Date(order.updatedAt).toLocaleString() : '';
      var stages = ['Received', 'Contacted', 'In progress', 'Completed'], current = stages.indexOf(order.status);
      document.querySelectorAll('.steps li').forEach(function (li, i) { li.classList.toggle('done', i <= current); if (i === current) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
      $('order-card').hidden = false;
      setTrackingStatus('');
    } catch (error) { if (token === loadingToken) { $('order-card').hidden = true; setTrackingStatus(error.message); } }
    finally { $('refresh-order').disabled = false; }
  }
  $('refresh-order').addEventListener('click', load);
  function readLink() {
    var params = new URLSearchParams(location.hash.slice(1));
    token = params.get('token'); recovery = params.get('recover');
    // Remove credentials from the address bar after reading; never persist them in storage.
    history.replaceState(null, '', location.pathname);
    $('order-card').hidden = true; $('confirm-card').hidden = true; $('save-link').hidden = true;
    setTrackingStatus('');
    if (token && pattern.test(token)) load();
    else if (recovery && pattern.test(recovery)) $('confirm-card').hidden = false;
    else setTrackingStatus(token || recovery ? 'This link is invalid. Request a new recovery email below.' : 'Open the private tracking link in your email, or recover it below.');
  }
  window.addEventListener('hashchange', readLink);
  readLink();
  $('confirm-recovery').addEventListener('click', async function () {
    var button = $('confirm-recovery'); button.disabled = true;
    setTrackingStatus('Recovering access…');
    try {
      var result = await api.post('/.netlify/functions/orders', { action: 'confirm', token: recovery });
      token = result.token; recovery = null;
      $('confirm-card').hidden = true;
      $('new-tracking-link').href = '/track.html#token=' + token;
      $('save-link').hidden = false;
      await load();
    } catch (error) { setTrackingStatus(error.message + ' You can request another recovery email below.'); }
    finally { button.disabled = false; }
  });
  $('recovery-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    var button = event.currentTarget.querySelector('button');
    if (button.disabled) return;
    button.disabled = true; $('recovery-status').textContent = 'Sending request…';
    try {
      var result = await api.post('/.netlify/functions/orders', { action: 'recover', email: $('recovery-email').value.trim(), requestId: api.id('recovery') });
      api.clear('recovery');
      $('recovery-status').textContent = result.message;
    } catch (error) {
      $('recovery-status').textContent = error.message;
      if (error.status === 400 || error.status === 409) api.clear('recovery');
    }
    finally { button.disabled = false; }
  });
})();

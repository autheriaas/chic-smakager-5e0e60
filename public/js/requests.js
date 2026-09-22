(function () {
  'use strict';
  var memory = {};
  window.AutheriaRequests = {
    id: function (kind) {
      var key = 'autheria-request-' + kind;
      if (memory[key]) return memory[key];
      try { memory[key] = sessionStorage.getItem(key); } catch (_) {}
      if (!memory[key]) memory[key] = crypto.randomUUID();
      try { sessionStorage.setItem(key, memory[key]); } catch (_) {}
      return memory[key];
    },
    clear: function (kind) {
      var key = 'autheria-request-' + kind;
      delete memory[key];
      try { sessionStorage.removeItem(key); } catch (_) {}
    },
    post: async function (url, data) {
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, 55000);
      try {
        var res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal });
        var result = await res.json();
        if (!res.ok || result.status !== 'ok') {
          var error = new Error(result.error || 'The server could not confirm this request. Please try again.');
          error.status = res.status; throw error;
        }
        return result;
      } catch (error) {
        if (!error.status) error.message = 'We could not confirm the result. Please retry with the same details, or contact Claudia. If recovering access, request a new recovery email.';
        throw error;
      } finally { clearTimeout(timer); }
    }
  };
})();

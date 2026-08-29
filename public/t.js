(function () {
  'use strict';
  if (window.__ts_initialized) return;
  window.__ts_initialized = true;

  var script = document.currentScript;
  var ENDPOINT = script.src.replace('/t.js', '/api/collect');
  var SITE_ID = script.getAttribute('data-site');
  if (!SITE_ID) return;

  var VID_KEY = '_ts_vid';
  var SID_KEY = '_ts_sid';
  var STS_KEY = '_ts_sts';
  var REF_KEY = '_ts_ref';
  var TIMEOUT = 30 * 60 * 1000;

  // Detect and persist affiliate ref parameter
  var refParam = new URLSearchParams(location.search).get('ref');
  if (refParam) {
    localStorage.setItem(REF_KEY, refParam);
  }

  var vid = localStorage.getItem(VID_KEY);
  if (!vid) {
    vid = uid();
    localStorage.setItem(VID_KEY, vid);
  }
  document.cookie = VID_KEY + '=' + vid + ';path=/;max-age=31536000;SameSite=Lax';

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  function getSession() {
    var stored = sessionStorage.getItem(SID_KEY);
    var ts = parseInt(sessionStorage.getItem(STS_KEY) || '0', 10);
    var sid;
    if (stored && Date.now() - ts < TIMEOUT) {
      sid = stored;
    } else {
      sid = uid();
      sessionStorage.setItem(SID_KEY, sid);
    }
    sessionStorage.setItem(STS_KEY, String(Date.now()));
    document.cookie = SID_KEY + '=' + sid + ';path=/;max-age=1800;SameSite=Lax';
    return sid;
  }

  function getUtm() {
    var p = new URLSearchParams(location.search);
    var u = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(function (k) {
      var v = p.get(k);
      if (v) u[k] = v;
    });
    return u;
  }

  function send(data) {
    data.site_id = SITE_ID;
    data.visitor_id = vid;
    data.session_id = getSession();
    data.url = location.href;
    data.pathname = location.pathname;
    data.hostname = location.hostname;
    data.referrer = document.referrer || '';
    data.screen_width = screen.width;
    data.screen_height = screen.height;
    Object.assign(data, getUtm());

    var ref = localStorage.getItem(REF_KEY);
    if (ref) data.ref = ref;

    var payload = JSON.stringify(data);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, payload);
    } else {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', ENDPOINT, true);
      xhr.setRequestHeader('Content-Type', 'text/plain');
      xhr.send(payload);
    }
  }

  // --- Custom events -------------------------------------------------------
  // window.__ts.track('signup_clicked', { plan: 'pro' })
  // or, with no JS at all:  <button data-ts-event="signup_clicked">
  function track(name, props) {
    if (typeof name !== 'string') return;
    name = name.trim().slice(0, 64);
    if (!name) return;

    var payload = { type: 'event', event_name: name };
    if (props && typeof props === 'object') {
      try {
        var encoded = JSON.stringify(props);
        if (encoded.length <= 1024) payload.event_props = encoded;
      } catch (e) {
        // non-serialisable props are dropped rather than blocking the event
      }
    }
    send(payload);
  }

  // Delegated handler so markup alone is enough to record an event.
  document.addEventListener(
    'click',
    function (e) {
      var el = e.target && e.target.closest && e.target.closest('[data-ts-event]');
      if (el) track(el.getAttribute('data-ts-event'));
    },
    true
  );

  // Track initial page view
  send({ type: 'pageview' });

  // SPA support — only fire when URL actually changes
  var lastUrl = location.href;
  var pushState = history.pushState;
  var replaceState = history.replaceState;
  history.pushState = function () {
    pushState.apply(this, arguments);
    setTimeout(function () {
      if (location.href !== lastUrl) { lastUrl = location.href; send({ type: 'pageview' }); }
    }, 0);
  };
  history.replaceState = function () {
    replaceState.apply(this, arguments);
    setTimeout(function () {
      if (location.href !== lastUrl) { lastUrl = location.href; send({ type: 'pageview' }); }
    }, 0);
  };
  window.addEventListener('popstate', function () {
    if (location.href !== lastUrl) { lastUrl = location.href; send({ type: 'pageview' }); }
  });

  // Expose for Stripe integration and custom event tracking
  window.__ts = { vid: vid, sid: function () { return getSession(); }, track: track };
})();

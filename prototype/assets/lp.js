/* Onyx Media ad landing pages (/lp/*): attribution capture, form validation + Netlify submit,
   Google Ads tag and conversions. Config comes from /lp/ads-config.js (window.ONYX_ADS). */
(function () {
  var ATTR_KEY = "onyx_lp_attr", SUBMIT_KEY = "onyx_lp_submitted", CONV_KEY = "onyx_lp_conv_fired";
  var PARAMS = ["gclid", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
  function sget(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function sset(k, v) { try { sessionStorage.setItem(k, v); return true; } catch (e) { return false; } }

  // ---- Google Ads tag (only when an AW- ID is configured)
  var cfg = window.ONYX_ADS || {};
  var hasTag = /^AW-\d+$/.test(cfg.id || "");
  if (hasTag) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", cfg.id);
    var s = document.createElement("script");
    s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(cfg.id);
    document.head.appendChild(s);
  }
  function conversion(label) {
    if (hasTag && label) window.gtag("event", "conversion", { send_to: cfg.id + "/" + label });
  }

  // ---- Thank-you page: one form conversion per session, only after a real submit
  if (document.body.hasAttribute("data-lp-thanks")) {
    var submitted = sget(SUBMIT_KEY), fired = sget(CONV_KEY);
    if (hasTag && cfg.label && submitted && !fired) { conversion(cfg.label); sset(CONV_KEY, "1"); }
  }

  // ---- Click-to-call conversion
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest('a[href^="tel:"]');
    if (a) conversion(cfg.callLabel);
  });

  // ---- Attribution: read from URL on landing, persist for the session
  var attr = {};
  try { attr = JSON.parse(sget(ATTR_KEY) || "{}") || {}; } catch (e) { attr = {}; }
  var q = new URLSearchParams(location.search), fresh = false;
  PARAMS.forEach(function (k) { var v = q.get(k); if (v) { attr[k] = v.slice(0, 300); fresh = true; } });
  if (fresh || !attr.landing_page) {
    attr.landing_page = location.href.slice(0, 1000);
    attr.referrer = (document.referrer || "").slice(0, 1000);
  }
  sset(ATTR_KEY, JSON.stringify(attr));

  // ---- Forms
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  [].forEach.call(document.querySelectorAll("form.lp-form"), function (form) {
    PARAMS.concat(["landing_page", "referrer"]).forEach(function (k) {
      var el = form.querySelector('input[name="' + k + '"]'); if (el) el.value = attr[k] || "";
    });
    var err = form.querySelector(".err"), btn = form.querySelector("button[type=submit]");
    function field(n) { return form.querySelector('[name="' + n + '"]'); }
    function mark(el, ok) { el.setAttribute("aria-invalid", ok ? "false" : "true"); return ok; }
    function showErr(msg) { err.textContent = msg; err.hidden = !msg; }

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var name = field("name"), biz = field("business_name"), phone = field("phone"), email = field("email"), site = field("website");
      var bad = [];
      if (!mark(name, name.value.trim().length >= 2)) bad.push("your name");
      if (!mark(biz, biz.value.trim().length >= 2)) bad.push("your business name");
      var digits = phone.value.replace(/\D/g, "");
      if (!mark(phone, digits.length === 10 || (digits.length === 11 && digits[0] === "1"))) bad.push("a 10-digit phone number");
      if (!mark(email, EMAIL_RE.test(email.value.trim()))) bad.push("a valid email");
      var sv = site.value.trim();
      if (!mark(site, !sv || (/\./.test(sv) && !/\s/.test(sv)))) bad.push("a valid website or Facebook link (or leave it blank)");
      if (bad.length) {
        showErr("Please add " + bad.join(", ") + ".");
        var first = form.querySelector('[aria-invalid="true"]'); if (first) first.focus();
        return;
      }
      showErr("");
      btn.disabled = true; btn.setAttribute("aria-busy", "true");
      fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
                   body: new URLSearchParams(new FormData(form)).toString() })
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          sset(SUBMIT_KEY, "1");
          location.href = form.getAttribute("data-next");
        })
        .catch(function () {
          btn.disabled = false; btn.removeAttribute("aria-busy");
          showErr("Something went wrong sending the form. Please try again, or call/text 636.385.3995.");
        });
    });
  });
})();

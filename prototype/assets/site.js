(function () {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Mobile menu
  var btn = document.getElementById("menuBtn"), drawer = document.getElementById("drawer");
  if (btn && drawer) btn.addEventListener("click", function () {
    var open = drawer.hidden; drawer.hidden = !open;
    btn.setAttribute("aria-expanded", String(open)); btn.textContent = open ? "CLOSE" : "MENU";
  });
  if (drawer) drawer.addEventListener("click", function (ev) { if (ev.target.closest("a")) { drawer.hidden = true; btn.setAttribute("aria-expanded", "false"); btn.textContent = "MENU"; } });

  // Rotating headline word
  var rot = document.querySelector("#rot .rot-word");
  var words = ["service calls", "full bays", "booked jobs", "install jobs", "repair orders"];
  if (rot && !reduce) {
    var i = 0;
    setInterval(function () {
      if (document.hidden) return;
      rot.classList.add("out");
      setTimeout(function () {
        i = (i + 1) % words.length; rot.textContent = words[i];
        rot.classList.remove("out"); rot.classList.add("in");
        setTimeout(function () { rot.classList.remove("in"); }, 450);
      }, 320);
    }, 2600);
  }

  // Hero slideshow
  var slides = [].slice.call(document.querySelectorAll(".hero-media .slide"));
  var cap = document.getElementById("slideCap");
  if (slides.length > 1 && !reduce) {
    var k = 0;
    setInterval(function () {
      if (document.hidden) return;
      slides[k].classList.remove("on"); k = (k + 1) % slides.length; slides[k].classList.add("on");
      if (cap) cap.textContent = slides[k].getAttribute("data-cap");
    }, 5000);
  }

  // Spotlight across the trade cards
  var trades = [].slice.call(document.querySelectorAll(".trade"));
  if (trades.length && !reduce) {
    var t = 0;
    setInterval(function () {
      if (document.hidden) return;
      trades.forEach(function (el, n) { el.classList.toggle("lit", n === t); });
      t = (t + 1) % trades.length;
    }, 1800);
  }

  // Work filters
  [].forEach.call(document.querySelectorAll(".chip"), function (ch) {
    ch.addEventListener("click", function () {
      [].forEach.call(document.querySelectorAll(".chip"), function (c) { c.setAttribute("aria-pressed", c === ch ? "true" : "false"); });
      var f = ch.getAttribute("data-f");
      [].forEach.call(document.querySelectorAll("#work-cases .case"), function (el) {
        el.hidden = !(f === "all" || el.getAttribute("data-f").split(" ").indexOf(f) > -1);
      });
    });
  });

  // Lead forms: validate, send to Netlify Forms, then go to the thank-you page
  [].forEach.call(document.querySelectorAll("form.js-lead"), function (form) {
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var err = form.querySelector(".err");
      var email = form.querySelector("[name=email]"), phone = form.querySelector("[name=phone]"), name = form.querySelector("[name=name]");
      var okEmail = /\S+@\S+\.\S+/.test(email.value);
      var okPhone = phone.value.replace(/\D/g, "").length >= 10;
      var okName = name.value.trim().length > 0;
      email.setAttribute("aria-invalid", okEmail ? "false" : "true");
      phone.setAttribute("aria-invalid", okPhone ? "false" : "true");
      name.setAttribute("aria-invalid", okName ? "false" : "true");
      if (!(okEmail && okPhone && okName)) { if (err) err.hidden = false; return; }
      if (err) err.hidden = true;
      var body = new URLSearchParams(new FormData(form)).toString();
      var go = function () { window.location.href = "thank-you.html"; };
      try {
        fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body })
          .then(go, go);
      } catch (e) { go(); }
    });
  });
})();

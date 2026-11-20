/* Proposal page: loads the offer for ?t=<token> from /api/offer and handles Accept.
 * Everything shown comes from the server; all text is inserted with textContent. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);
  var token = params.get("t") || "";
  var preview = params.has("preview");

  function money(n) {
    n = Number(n || 0);
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function fail(msg) {
    $("pTitle").textContent = "Proposal not found";
    $("pLead").textContent = "";
    $("pError").hidden = false;
    $("pError").querySelector("p").textContent = msg;
  }
  function niceDate(iso) {
    return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }

  if (!/^[a-f0-9]{64}$/.test(token)) { fail("This proposal link isn't complete. Open it again from your email, or call or text Max at 636.385.3995."); return; }

  fetch("/api/offer?t=" + token + (preview ? "&preview=1" : ""), { headers: { Accept: "application/json" } })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d.ok) { fail(d.error || "This proposal link isn't valid."); return; }
      render(d);
    })
    .catch(function () { fail("Couldn't load your proposal. Check your connection and refresh, or call or text 636.385.3995."); });

  function render(d) {
    $("pTitle").textContent = d.business ? "Your plan for " + d.business + "." : "Your plan, " + d.firstName + ".";
    $("pLead").textContent = "Hi " + d.firstName + ", here's what we put together. Prepared by Max Fisher, Onyx Media.";
    if (preview) $("pLead").textContent += " (Preview: viewing this doesn't notify anyone.)";

    var box = $("pPackages");
    d.packages.forEach(function (p) {
      var card = el("article", "p-pkg"), head = el("div", "p-pkg-head");
      head.appendChild(el("h3", null, p.name));
      head.appendChild(el("span", "p-price", money(p.monthly) + "/mo" + (p.setup ? " + " + money(p.setup) + " setup" : "")));
      card.appendChild(head);
      if (p.deliverables) card.appendChild(el("p", null, p.deliverables));
      box.appendChild(card);
    });
    if (d.packages.some(function (p) { return p.category === "ads"; })) {
      box.appendChild(el("p", "form-note", "Ad spend is paid directly to Meta and Google and isn't included in the prices above."));
    }

    if (d.notes) { $("pNotes").hidden = false; $("pNotesText").textContent = d.notes; }

    var t = d.totals, tot = $("pTotals");
    tot.appendChild(el("span", "eyebrow", "Your investment"));
    var m = el("div", "p-line"); m.appendChild(el("span", null, "Monthly"));
    var mv = el("span", "p-big", money(t.monthly));
    if (t.monthly < t.listMonthly) { var sm = el("s", null, " " + money(t.listMonthly)); mv.appendChild(sm); }
    m.appendChild(mv); tot.appendChild(m);
    if (t.setup > 0 || t.listSetup > 0) {
      var s = el("div", "p-line"); s.appendChild(el("span", null, "One-time setup"));
      s.appendChild(el("strong", null, t.setup > 0 ? money(t.setup) : "Waived")); tot.appendChild(s);
      if (d.waiveSetupWithPrepay) tot.appendChild(el("p", "form-note", "Setup fee waived when you pay your first month upfront."));
    }
    tot.appendChild(el("p", "form-note", "Month to month unless your service agreement says otherwise."));

    $("proposal").hidden = false;
    if (d.accepted) { showAccepted(d.accepted); return; }
    if (!d.sentAt && !preview) { $("acceptForm").hidden = true; return; }

    if (d.waiveSetupWithPrepay) {
      var fs = $("pPrepay"); fs.hidden = false;
      [["yes", "Pay my first month (" + money(t.monthly) + ") upfront and waive the " + money(t.setup) + " setup fee"],
       ["no", "Pay the " + money(t.setup) + " setup fee as normal"]].forEach(function (o) {
        var lab = el("label"), inp = document.createElement("input");
        inp.type = "radio"; inp.name = "prepay"; inp.value = o[0];
        lab.appendChild(inp); lab.appendChild(el("span", null, o[1])); fs.appendChild(lab);
      });
    }
    wireAccept();
  }

  function showAccepted(a) {
    $("acceptForm").hidden = true;
    $("pAccepted").hidden = false;
    $("pAcceptedText").textContent = "Accepted by " + (a.name || "you") + " on " + niceDate(a.at) +
      ". Max will send your invoice and service agreement shortly." +
      (a.prepay === true ? " Your setup fee is waived with your first month paid upfront." : "");
  }

  function wireAccept() {
    var form = $("acceptForm"), err = form.querySelector(".err"), btn = form.querySelector("button[type=submit]");
    form.querySelector("[name=t]").value = String(Date.now());
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (preview) { err.textContent = "This is a preview. The prospect will see this button."; err.hidden = false; return; }
      var name = $("pName");
      if (!name.value.trim()) { name.setAttribute("aria-invalid", "true"); err.textContent = "Type your name to accept."; err.hidden = false; return; }
      name.setAttribute("aria-invalid", "false");
      if (!$("pPrepay").hidden && !form.querySelector("[name=prepay]:checked")) {
        err.textContent = "Choose how you'd like to handle the setup fee."; err.hidden = false; return;
      }
      err.hidden = true; btn.disabled = true;
      var data = { token: token };
      new FormData(form).forEach(function (v, k) { data[k] = v; });
      fetch("/api/offer-accept", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(data) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok && j.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.j.error || "Something went wrong.");
          var pre = form.querySelector("[name=prepay]:checked");
          showAccepted({ name: data.name, at: new Date().toISOString(), prepay: pre ? pre.value === "yes" : null });
          window.scrollTo({ top: $("pAccepted").getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" });
        })
        .catch(function (e) { err.textContent = e.message + " Or call or text 636.385.3995."; err.hidden = false; btn.disabled = false; });
    });
  }
})();

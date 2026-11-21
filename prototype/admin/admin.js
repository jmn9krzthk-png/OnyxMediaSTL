/* Onyx admin: leads, follow-ups, lead detail, audits, proposals and won clients.
 * Runs in the browser with the PUBLISHABLE key only. Every read and write is checked by
 * Supabase row-level security, which only lets profiles with role = 'admin' through.
 * Emails are sent by admin-only Netlify Functions (/api/send-audit, /api/send-offer). */
(function () {
  "use strict";

  var STATUSES = [
    ["new", "New"], ["contacted", "Contacted"], ["audit_sent", "Audit sent"], ["meeting_set", "Meeting set"],
    ["proposal_sent", "Proposal sent"], ["won", "Won"], ["lost", "Lost"]
  ];
  var AUDIT_STATUSES = [["requested", "Requested"], ["in_progress", "In progress"], ["sent", "Sent"]];
  var SOURCES = [["website", "Website"], ["facebook", "Facebook"], ["referral", "Referral"], ["walk_in", "Walk-in"], ["other", "Other"]];
  var CLOSED = ["won", "lost"];
  var LEAD_COLS = "id,name,business,email,phone,industry,source,status,notes,next_follow_up,created_at";
  var OFFER_COLS = "id,package_ids,custom_notes,custom_monthly_price,custom_setup_fee,waive_setup_with_prepay,public_token,sent_at,viewed_at,accepted_at,accepted_name,accepted_prepay,accepted_note,created_at";

  var db = null, leads = [], packages = [], tab = "follow";
  var $ = function (id) { return document.getElementById(id); };

  // ------------------------------------------------------------ helpers
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function safeUrl(u) { return /^https?:\/\//i.test(u || "") ? u : ""; }
  function digits(p) { return String(p || "").replace(/[^\d+]/g, ""); }
  function label(list, v) { for (var i = 0; i < list.length; i++) if (list[i][0] === v) return list[i][1]; return v || ""; }
  function options(list, sel) {
    return list.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === sel ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("");
  }
  function money(n) {
    n = Number(n || 0);
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  }
  function first(name) { return String(name || "").trim().split(/\s+/)[0] || "them"; }
  // Dates are handled as YYYY-MM-DD strings in St. Louis time.
  function today() { return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }); }
  function addDays(n) {
    var d = new Date(today() + "T12:00:00"); d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function niceDate(ymd) {
    if (!ymd) return "";
    if (ymd === today()) return "Today";
    if (ymd === addDays(1)) return "Tomorrow";
    if (ymd === addDays(-1)) return "Yesterday";
    return new Date(ymd + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  function niceStamp(iso) {
    return new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  function noteStamp() {
    return new Date().toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  }
  var toastTimer;
  function toast(msg, bad) {
    var t = $("toast"); t.textContent = msg; t.className = "a-toast" + (bad ? " bad" : ""); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, bad ? 6000 : 2400);
  }
  function show(view, keepScroll) {
    ["v-loading", "v-login", "v-denied", "v-error", "v-list", "v-detail"].forEach(function (id) { $(id).hidden = id !== view; });
    if (!keepScroll) window.scrollTo(0, 0);
  }
  function dueClass(l) {
    if (!l.next_follow_up || CLOSED.indexOf(l.status) > -1) return "";
    var t = today();
    return l.next_follow_up < t ? "overdue" : l.next_follow_up === t ? "due" : "";
  }
  function oneRow(res) {
    if (res.error) throw res.error;
    if (!res.data || (Array.isArray(res.data) && !res.data.length)) throw new Error("Nothing was saved. Refresh and try again.");
    return res.data;
  }
  function errMsg(e) { return e && e.message ? e.message : "Something went wrong. Try again."; }
  // Call an admin-only Netlify Function with the signed-in user's token.
  function api(path, payload) {
    return db.auth.getSession().then(function (s) {
      var tok = s.data && s.data.session && s.data.session.access_token;
      if (!tok) throw new Error("Your session expired. Sign in again.");
      return fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + tok },
        body: JSON.stringify(payload)
      });
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || !j.ok) throw new Error(j.error || "Request failed (" + r.status + ").");
        return j;
      });
    });
  }
  function proposalLink(token, isPreview) { return location.origin + "/proposal.html?t=" + token + (isPreview ? "&preview=1" : ""); }
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { toast("Link copied"); }, function () { window.prompt("Copy this link:", text); });
    } else { window.prompt("Copy this link:", text); }
  }

  // ------------------------------------------------------------ boot
  function boot() {
    fetch("/api/config", { cache: "no-store" })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Config error"); return j; }); })
      .then(function (cfg) {
        db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" }
        });
        var hashErr = new URLSearchParams(location.hash.slice(1)).get("error_description") ||
                      new URLSearchParams(location.search).get("error_description");
        db.auth.onAuthStateChange(function (event) {
          if (event === "SIGNED_OUT") { $("signOut").hidden = true; show("v-login"); }
        });
        return completeLinkSignIn().then(function (linkErr) {
          if (linkErr) hashErr = linkErr;
          return db.auth.getSession();
        }).then(function (res) {
          var session = res.data && res.data.session;
          if (!session) {
            if (location.hash.indexOf("#lead=") === 0) { try { localStorage.setItem("onyxPendingLead", location.hash); } catch (e) {} }
            show("v-login");
            if (hashErr) loginError("That link didn't work (" + hashErr.replace(/\+/g, " ") + "). Request a new link, or use the code from the email.");
            history.replaceState(null, "", location.pathname);
            return;
          }
          if (/access_token|error/.test(location.hash)) history.replaceState(null, "", location.pathname);
          return checkAdmin(session.user);
        });
      })
      .catch(function (e) {
        $("errorMsg").textContent = "The admin can't reach Supabase: " + e.message + " Check the SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY environment variables in Netlify.";
        show("v-error");
      });
  }

  function checkAdmin(user) {
    $("signOut").hidden = false;
    return db.from("profiles").select("role").eq("id", user.id).maybeSingle().then(function (res) {
      if (res.error || !res.data || res.data.role !== "admin") { show("v-denied"); return; }
      initFilters();
      var pending = null;
      try { pending = localStorage.getItem("onyxPendingLead"); localStorage.removeItem("onyxPendingLead"); } catch (e) {}
      if (pending && !location.hash) history.replaceState(null, "", location.pathname + pending);
      return Promise.all([loadLeads(), loadPackages()]).then(route);
    });
  }

  // ------------------------------------------------------------ auth UI
  $("loginForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var email = $("loginEmail").value.trim(), msg = $("loginMsg"), btn = ev.target.querySelector("button");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { msg.textContent = "Enter a full email address."; return; }
    btn.disabled = true; msg.textContent = "Sending…";
    db.auth.signInWithOtp({ email: email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + "/admin/" } })
      .then(function (res) {
        btn.disabled = false;
        if (res.error) { loginError("Couldn't send a link: " + res.error.message); return; }
        msg.className = "form-note";
        msg.textContent = "Check your email. Tap the link, or type the code from the email below.";
        $("codeForm").hidden = false; $("loginCode").focus();
      });
  });
  function loginError(text) { var m = $("loginMsg"); m.className = "err"; m.textContent = text; }

  // Supabase can send sign-in links in three shapes. #access_token=… is handled by supabase-js itself;
  // ?code=… and ?token_hash=… are finished here. Returns an error message, or "" when there was nothing to do.
  function completeLinkSignIn() {
    var q = new URLSearchParams(location.search), done = function (res) {
      history.replaceState(null, "", location.pathname + location.hash);
      return res && res.error ? res.error.message : "";
    };
    if (q.get("code")) return db.auth.exchangeCodeForSession(q.get("code")).then(done, function (e) { done(); return errMsg(e); });
    if (q.get("token_hash")) {
      return db.auth.verifyOtp({ token_hash: q.get("token_hash"), type: q.get("type") || "email" }).then(done, function (e) { done(); return errMsg(e); });
    }
    return Promise.resolve("");
  }

  $("codeForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var email = $("loginEmail").value.trim(), code = $("loginCode").value.replace(/\D/g, ""), msg = $("codeMsg"), btn = ev.target.querySelector("button");
    if (code.length < 6) { msg.className = "err"; msg.textContent = "Enter the code from the email."; return; }
    btn.disabled = true; msg.className = "form-note"; msg.textContent = "Checking…";
    db.auth.verifyOtp({ email: email, token: code, type: "email" }).then(function (res) {
      btn.disabled = false;
      if (res.error || !res.data || !res.data.session) { msg.className = "err"; msg.textContent = "That code didn't work" + (res.error ? " (" + res.error.message + ")" : "") + ". Request a new email and use the newest code."; return; }
      msg.textContent = ""; $("codeForm").hidden = true; $("loginCode").value = "";
      return checkAdmin(res.data.session.user);
    });
  });

  function signOut() { db.auth.signOut().then(function () { location.hash = ""; show("v-login"); }); }
  $("signOut").addEventListener("click", signOut);
  $("deniedSignOut").addEventListener("click", signOut);

  // ------------------------------------------------------------ data
  function loadLeads() {
    return db.from("leads").select(LEAD_COLS).order("created_at", { ascending: false }).limit(1000).then(function (res) {
      if (res.error) { toast("Couldn't load leads: " + res.error.message, true); return; }
      leads = res.data || [];
    });
  }
  function loadPackages() {
    return db.from("packages").select("id,name,category,monthly_price,setup_fee,active").order("category").order("monthly_price").then(function (res) {
      if (res.error) { toast("Couldn't load packages: " + res.error.message, true); return; }
      packages = res.data || [];
    });
  }
  function pkgById(id) { for (var i = 0; i < packages.length; i++) if (packages[i].id === id) return packages[i]; return null; }
  function offerTotals(o) {
    var ps = o.package_ids.map(pkgById).filter(Boolean);
    var lm = ps.reduce(function (s, p) { return s + Number(p.monthly_price); }, 0);
    var ls = ps.reduce(function (s, p) { return s + Number(p.setup_fee); }, 0);
    return { pkgs: ps, monthly: o.custom_monthly_price !== null ? Number(o.custom_monthly_price) : lm,
             setup: o.custom_setup_fee !== null ? Number(o.custom_setup_fee) : ls, listMonthly: lm, listSetup: ls };
  }

  // ------------------------------------------------------------ list
  function initFilters() {
    if ($("fStatus").options.length > 1) return;
    $("fStatus").insertAdjacentHTML("beforeend", options(STATUSES, ""));
    $("fStatus").addEventListener("change", renderList);
    $("fSearch").addEventListener("input", renderList);
    [].forEach.call(document.querySelectorAll(".a-tab"), function (b) {
      b.addEventListener("click", function () { tab = b.getAttribute("data-tab"); location.hash = tab; });
    });
    $("addLead").addEventListener("click", function () { location.hash = "new"; });
  }

  function followUps() {
    var t = today();
    return leads.filter(function (l) { return l.next_follow_up && l.next_follow_up <= t && CLOSED.indexOf(l.status) === -1; })
      .sort(function (a, b) { return a.next_follow_up < b.next_follow_up ? -1 : a.next_follow_up > b.next_follow_up ? 1 : 0; });
  }

  function renderList() {
    var fu = followUps();
    $("followCount").textContent = fu.length; $("allCount").textContent = leads.length;
    [].forEach.call(document.querySelectorAll(".a-tab"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-tab") === tab)); });
    $("filters").hidden = tab !== "all";
    var rows = fu;
    if (tab === "all") {
      var st = $("fStatus").value, q = $("fSearch").value.trim().toLowerCase(), qd = q.replace(/\D/g, "");
      rows = leads.filter(function (l) {
        if (st && l.status !== st) return false;
        if (!q) return true;
        var hay = [l.name, l.business, l.email].join(" ").toLowerCase();
        return hay.indexOf(q) > -1 || (qd.length >= 3 && String(l.phone || "").replace(/\D/g, "").indexOf(qd) > -1);
      });
    }
    $("list").innerHTML = rows.map(function (l) {
      var due = dueClass(l);
      var fuText = l.next_follow_up ? (due === "overdue" ? "Overdue · " : "Follow up ") + niceDate(l.next_follow_up) : "";
      return '<li><button type="button" class="a-card ' + due + '" data-id="' + esc(l.id) + '">' +
        '<span class="a-row"><span class="a-name">' + esc(l.name) + '</span><span class="pill s-' + esc(l.status) + '">' + esc(label(STATUSES, l.status)) + "</span></span>" +
        '<span class="a-row"><span class="a-sub">' + esc(l.business || l.email || "") + '</span><span class="a-meta ' + (due === "overdue" ? "overdue" : "") + '">' + esc(fuText || niceStamp(l.created_at)) + "</span></span>" +
        "</button></li>";
    }).join("");
    var empty = $("listEmpty");
    empty.hidden = rows.length > 0;
    empty.textContent = tab === "follow" ? "Nothing to follow up on today. Nice." : "No leads match.";
  }

  $("list").addEventListener("click", function (ev) {
    var card = ev.target.closest(".a-card");
    if (card) location.hash = "lead=" + card.getAttribute("data-id");
  });

  // ------------------------------------------------------------ add / edit contact
  function contactFields(l) {
    l = l || {};
    return '<div class="field"><label for="cName">Name *</label><input id="cName" value="' + esc(l.name) + '" autocomplete="off" required></div>' +
      '<div class="field"><label for="cBiz">Business</label><input id="cBiz" value="' + esc(l.business) + '" autocomplete="off"></div>' +
      '<div class="field"><label for="cEmail">Email</label><input id="cEmail" type="email" value="' + esc(l.email) + '" autocomplete="off"></div>' +
      '<div class="field"><label for="cPhone">Phone</label><input id="cPhone" type="tel" value="' + esc(l.phone) + '" autocomplete="off"></div>' +
      '<div class="field"><label for="cInd">Industry</label><input id="cInd" value="' + esc(l.industry) + '" autocomplete="off"></div>' +
      '<div class="field"><label for="cSource">Source</label><select id="cSource">' + options(SOURCES, l.source || "referral") + "</select></div>";
  }
  function readContact() {
    var v = function (id) { return $(id).value.trim() || null; };
    var c = { name: v("cName"), business: v("cBiz"), email: v("cEmail"), phone: v("cPhone"), industry: v("cInd"), source: $("cSource").value };
    if (!c.name) throw new Error("Name is required.");
    if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email)) throw new Error("That email doesn't look right.");
    if (c.email) c.email = c.email.toLowerCase();
    return c;
  }

  function renderNewLead() {
    show("v-detail");
    $("detail").innerHTML = '<form class="a-panel" id="newLeadForm"><h1>Add lead</h1>' + contactFields() +
      '<div class="field"><label for="cNote">Note</label><textarea id="cNote" placeholder="Met at the shop, wants reels…"></textarea></div>' +
      '<button class="btn primary" type="submit">Save lead</button></form>';
    $("newLeadForm").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var c;
      try { c = readContact(); } catch (e) { toast(e.message, true); return; }
      var note = $("cNote").value.trim();
      c.status = "new"; c.next_follow_up = today();
      c.notes = "[" + noteStamp() + "] Added by hand" + (note ? "\n" + note : "");
      db.from("leads").insert(c).select("id").then(function (res) {
        var row = oneRow(res)[0];
        toast("Lead added");
        return loadLeads().then(function () { location.hash = "lead=" + row.id; });
      }).catch(function (e) { toast("Couldn't save: " + errMsg(e), true); });
    });
  }

  // ------------------------------------------------------------ detail
  function renderDetail(id, keepY) {
    var keep = typeof keepY === "number";
    show("v-detail", keep);
    if (!keep) $("detail").innerHTML = '<p class="muted">Loading…</p>';
    Promise.all([
      db.from("leads").select(LEAD_COLS).eq("id", id).maybeSingle(),
      db.from("audit_requests").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
      db.from("package_offers").select(OFFER_COLS).eq("lead_id", id).order("created_at", { ascending: false }),
      db.from("clients").select("id,status").eq("lead_id", id).limit(1)
    ]).then(function (r) {
      if (r[0].error || !r[0].data) { $("detail").innerHTML = '<p class="a-empty muted">Lead not found.</p>'; return; }
      var l = r[0].data, audits = r[1].data || [], offers = r[2].data || [], client = (r[3].data || [])[0] || null;
      var tel = digits(l.phone);
      $("detail").innerHTML =
        '<div class="a-panel" id="contactPanel">' +
          '<div class="a-row"><span class="pill s-' + esc(l.status) + '">' + esc(label(STATUSES, l.status)) + '</span><span class="a-meta">Added ' + esc(niceStamp(l.created_at)) + "</span></div>" +
          "<h1>" + esc(l.name) + "</h1>" + (l.business ? '<p class="body-l" style="margin:0;font-size:18px">' + esc(l.business) + "</p>" : "") +
          (client ? '<p class="a-won">Client · ' + esc(client.status) + "</p>" : "") +
          '<div class="a-actions">' +
            (tel ? '<a class="btn primary" href="tel:' + esc(tel) + '">Call</a><a class="btn secondary" href="sms:' + esc(tel) + '">Text</a>' : "") +
            (l.email ? '<a class="btn secondary" href="mailto:' + esc(l.email) + '">Email</a>' : "") +
          "</div>" +
          '<dl class="a-dl">' +
            (l.email ? "<dt>Email</dt><dd>" + esc(l.email) + "</dd>" : "") +
            (l.phone ? "<dt>Phone</dt><dd>" + esc(l.phone) + "</dd>" : "") +
            (l.industry ? "<dt>Industry</dt><dd>" + esc(l.industry) + "</dd>" : "") +
            "<dt>Source</dt><dd>" + esc(label(SOURCES, l.source)) + "</dd>" +
          "</dl>" +
          '<button type="button" class="a-link" id="editContact">Edit contact</button>' +
        "</div>" +

        '<form class="a-panel" id="leadForm">' +
          "<h2>Update</h2>" +
          '<div class="field"><label for="dStatus">Status</label><select id="dStatus">' + options(STATUSES, l.status) + "</select></div>" +
          '<div class="field"><label for="dFollow">Next follow-up</label><input id="dFollow" type="date" value="' + esc(l.next_follow_up || "") + '"></div>' +
          '<div class="a-quick">' +
            '<button type="button" data-days="0">Today</button><button type="button" data-days="1">Tomorrow</button>' +
            '<button type="button" data-days="3">In 3 days</button><button type="button" data-days="7">Next week</button>' +
            '<button type="button" data-days="14">2 weeks</button><button type="button" data-days="">Clear</button>' +
          "</div>" +
          '<div class="field"><label for="dNote">Add a note</label><textarea id="dNote" placeholder="Called, left voicemail…"></textarea></div>' +
          '<button class="btn primary" type="submit">Save</button>' +
        "</form>" +

        offersHtml(l, offers) +
        (audits.length ? '<div class="a-panel"><h2>Audit request' + (audits.length > 1 ? "s" : "") + "</h2>" + audits.map(function (a) { return auditHtml(a, l); }).join("") + "</div>" : "") +
        wonHtml(l, offers, client) +

        '<div class="a-panel"><div class="a-row"><h2>Notes</h2><button type="button" class="a-link" id="editNotes">Edit</button></div>' +
          '<pre class="a-notes" id="notesView">' + esc(l.notes || "No notes yet.") + "</pre>" +
          '<div id="notesEdit" hidden><div class="field"><textarea id="notesText" rows="12"></textarea></div>' +
          '<button type="button" class="btn secondary" id="saveNotes" style="margin-top:8px">Save all notes</button></div>' +
        "</div>";

      wireDetail(l);
      wireAudits(l);
      wireOffers(l, offers);
      wireWon(l, offers, client);
      if (keep) window.scrollTo(0, keepY);
    });
  }

  function reloadDetail(id, msg) {
    if (msg) toast(msg);
    var y = window.scrollY;
    return loadLeads().then(function () { renderDetail(id, y); });
  }

  function wireDetail(l) {
    var form = $("leadForm");
    form.querySelector(".a-quick").addEventListener("click", function (ev) {
      var b = ev.target.closest("button"); if (!b) return;
      var d = b.getAttribute("data-days"); $("dFollow").value = d === "" ? "" : addDays(Number(d));
    });
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var btn = form.querySelector("button[type=submit]"); btn.disabled = true;
      var note = $("dNote").value.trim();
      // Re-read notes right before saving so nothing written meanwhile (e.g. a new form submission) is lost.
      db.from("leads").select("notes").eq("id", l.id).single().then(function (cur) {
        if (cur.error) throw cur.error;
        var patch = { status: $("dStatus").value, next_follow_up: $("dFollow").value || null };
        if (note) patch.notes = "[" + noteStamp() + "] " + note + (cur.data.notes ? "\n\n" + cur.data.notes : "");
        return db.from("leads").update(patch).eq("id", l.id).select("id");
      }).then(function (res) { oneRow(res); return reloadDetail(l.id, "Saved"); })
        .catch(function (e) { btn.disabled = false; toast("Couldn't save: " + errMsg(e), true); });
    });

    $("editContact").addEventListener("click", function () {
      var p = $("contactPanel");
      p.innerHTML = "<h2>Edit contact</h2>" + contactFields(l) +
        '<button type="button" class="btn primary" id="saveContact">Save contact</button><button type="button" class="a-link" id="cancelContact">Cancel</button>';
      $("cancelContact").addEventListener("click", function () { renderDetail(l.id); });
      $("saveContact").addEventListener("click", function () {
        var c;
        try { c = readContact(); } catch (e) { toast(e.message, true); return; }
        db.from("leads").update(c).eq("id", l.id).select("id")
          .then(function (res) { oneRow(res); return reloadDetail(l.id, "Contact saved"); })
          .catch(function (e) { toast("Couldn't save: " + errMsg(e), true); });
      });
    });

    $("editNotes").addEventListener("click", function () {
      $("notesText").value = l.notes || ""; $("notesEdit").hidden = false; $("notesView").hidden = true; $("editNotes").hidden = true;
    });
    $("saveNotes").addEventListener("click", function () {
      db.from("leads").update({ notes: $("notesText").value.trim() || null }).eq("id", l.id).select("id")
        .then(function (res) { oneRow(res); return reloadDetail(l.id, "Notes saved"); })
        .catch(function (e) { toast("Couldn't save notes: " + errMsg(e), true); });
    });
  }

  // ------------------------------------------------------------ audits
  function auditHtml(a, l) {
    var link = function (u, t) { u = safeUrl(u); return u ? "<dt>" + t + '</dt><dd><a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(u.replace(/^https?:\/\/(www\.)?/, "")) + "</a></dd>" : ""; };
    var file = a.audit_pdf_path ? a.audit_pdf_path.split("/").pop().replace(/^\d+-/, "") : "";
    return '<div class="a-audit" data-audit="' + esc(a.id) + '"><span class="a-meta">Requested ' + esc(niceStamp(a.created_at)) + "</span>" +
      '<dl class="a-dl">' + link(a.website, "Website") + link(a.facebook_url, "Facebook") + link(a.instagram_url, "Instagram") + link(a.google_business_url, "Google") +
        "<dt>Runs ads</dt><dd>" + (a.runs_ads === true ? "Yes" : a.runs_ads === false ? "No" : "—") + "</dd>" +
        (a.monthly_ad_spend ? "<dt>Ad spend</dt><dd>" + esc(a.monthly_ad_spend) + "</dd>" : "") +
        (a.biggest_goal ? "<dt>Goal</dt><dd>" + esc(a.biggest_goal) + "</dd>" : "") +
        [["lead_source", "Lead source"], ["service_interest", "Service"], ["gclid", "gclid"], ["utm_source", "UTM source"],
         ["utm_medium", "UTM medium"], ["utm_campaign", "UTM campaign"], ["utm_term", "UTM term"], ["utm_content", "UTM content"],
         ["landing_page", "Landing page"], ["referrer", "Referrer"]].map(function (f) {
          return a[f[0]] ? "<dt>" + f[1] + '</dt><dd style="overflow-wrap:anywhere">' + esc(a[f[0]]) + "</dd>" : "";
        }).join("") +
      "</dl>" +
      '<div class="field"><label>Audit status</label><select class="audit-status">' + options(AUDIT_STATUSES, a.status) + "</select></div>" +
      '<div class="field"><label>Audit PDF</label>' +
        (file ? '<div class="a-file"><span>' + esc(file) + '</span><button type="button" class="a-link audit-view" data-path="' + esc(a.audit_pdf_path) + '">View</button></div>' : "") +
        '<input type="file" accept="application/pdf" class="audit-file"></div>' +
      (file ? '<div class="field"><label>Message (optional)</label><textarea class="audit-msg" rows="3" placeholder="Short personal note to include in the email"></textarea></div>' +
        '<button type="button" class="btn ' + (a.status === "sent" ? "secondary" : "primary") + ' audit-send">' + (a.status === "sent" ? "Email audit again" : "Email audit to " + esc(first(l.name))) + "</button>" : "") +
      "</div>";
  }

  function wireAudits(l) {
    [].forEach.call(document.querySelectorAll("[data-audit]"), function (box) {
      var id = box.getAttribute("data-audit");
      box.querySelector(".audit-status").addEventListener("change", function (ev) {
        db.from("audit_requests").update({ status: ev.target.value }).eq("id", id).select("id")
          .then(function (res) { oneRow(res); toast("Audit status saved"); })
          .catch(function (e) { toast("Couldn't update: " + errMsg(e), true); });
      });
      box.querySelector(".audit-file").addEventListener("change", function (ev) {
        var f = ev.target.files && ev.target.files[0]; if (!f) return;
        if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) { toast("Choose a PDF file.", true); return; }
        if (f.size > 25 * 1024 * 1024) { toast("That PDF is over 25 MB. Export a smaller one.", true); return; }
        var clean = f.name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-80) || "audit.pdf";
        var path = id + "/" + Date.now() + "-" + clean;
        toast("Uploading…");
        db.storage.from("audits").upload(path, f, { contentType: "application/pdf", upsert: false })
          .then(function (res) {
            if (res.error) throw res.error;
            return db.from("audit_requests").update({ audit_pdf_path: path, status: "in_progress" }).eq("id", id).select("id");
          })
          .then(function (res) { oneRow(res); return reloadDetail(l.id, "PDF uploaded"); })
          .catch(function (e) { toast("Upload failed: " + errMsg(e), true); });
      });
      var view = box.querySelector(".audit-view");
      if (view) view.addEventListener("click", function () {
        var w = window.open("", "_blank"); // open now so iOS doesn't block the pop-up
        db.storage.from("audits").createSignedUrl(view.getAttribute("data-path"), 300).then(function (res) {
          if (res.error) { if (w) w.close(); toast("Couldn't open: " + res.error.message, true); return; }
          if (w) w.location = res.data.signedUrl; else location.href = res.data.signedUrl;
        });
      });
      var send = box.querySelector(".audit-send");
      if (send) send.addEventListener("click", function () {
        if (!l.email) { toast("Add an email first (Edit contact).", true); return; }
        if (!window.confirm("Email the audit to " + l.email + "?")) return;
        send.disabled = true;
        api("/api/send-audit", { auditId: id, message: box.querySelector(".audit-msg").value })
          .then(function () { return reloadDetail(l.id, "Audit emailed"); })
          .catch(function (e) { send.disabled = false; toast(errMsg(e), true); });
      });
    });
  }

  // ------------------------------------------------------------ proposals
  function offerState(o) {
    if (o.accepted_at) return ["s-won", "Accepted " + niceStamp(o.accepted_at)];
    if (o.viewed_at) return ["s-new", "Opened " + niceStamp(o.viewed_at)];
    if (o.sent_at) return ["", "Sent " + niceStamp(o.sent_at)];
    return ["s-lost", "Draft"];
  }

  function offersHtml(l, offers) {
    var list = offers.map(function (o) {
      var t = offerTotals(o), st = offerState(o);
      return '<div class="a-offer" data-offer="' + esc(o.id) + '">' +
        '<div class="a-row"><span class="pill ' + st[0] + '">' + esc(st[1]) + '</span><span class="a-meta">Created ' + esc(niceStamp(o.created_at)) + "</span></div>" +
        '<ul class="a-offer-pkgs">' + t.pkgs.map(function (p) { return "<li>" + esc(p.name) + "</li>"; }).join("") + "</ul>" +
        '<p class="a-offer-total"><strong>' + money(t.monthly) + "/mo</strong>" + (t.setup ? " + " + money(t.setup) + " setup" : "") +
          (o.waive_setup_with_prepay && t.setup ? " · setup waived with prepay" : "") + "</p>" +
        (o.custom_notes ? '<p class="a-offer-notes">' + esc(o.custom_notes) + "</p>" : "") +
        (o.accepted_at ? '<p class="a-offer-notes"><strong>Accepted by ' + esc(o.accepted_name) + "</strong>" +
          (o.accepted_prepay === true ? " · paying first month upfront (setup waived)" : o.accepted_prepay === false ? " · paying setup fee" : "") +
          (o.accepted_note ? "<br>“" + esc(o.accepted_note) + "”" : "") + "</p>" : "") +
        (o.accepted_at ? "" : '<div class="field"><label>Personal note in the email (optional)</label><textarea class="offer-msg" rows="2" placeholder="Great talking today…"></textarea></div>') +
        '<div class="a-btnrow">' +
          '<a class="btn secondary" href="' + esc(proposalLink(o.public_token, true)) + '" target="_blank" rel="noopener">Preview</a>' +
          '<button type="button" class="btn secondary offer-copy">Copy link</button>' +
          (o.accepted_at ? "" : '<button type="button" class="btn ' + (o.sent_at ? "secondary" : "primary") + ' offer-send">' + (o.sent_at ? "Resend" : "Send") + "</button>") +
          (o.sent_at ? "" : '<button type="button" class="a-link offer-delete">Delete draft</button>') +
        "</div></div>";
    }).join("");

    var groups = [["content", "Content"], ["ads", "Ads"]].map(function (g) {
      var items = packages.filter(function (p) { return p.active && p.category === g[0]; });
      return '<fieldset class="a-pkgs"><legend>' + g[1] + "</legend>" + items.map(function (p) {
        return '<label><input type="checkbox" value="' + esc(p.id) + '"> <span>' + esc(p.name) + " · " + money(p.monthly_price) + "/mo" +
          (Number(p.setup_fee) ? " + " + money(p.setup_fee) + " setup" : "") + "</span></label>";
      }).join("") + "</fieldset>";
    }).join("");

    return '<div class="a-panel"><h2>Proposals</h2>' + (list || '<p class="muted" style="margin:0">No proposals yet.</p>') +
      '<details class="a-new-offer"' + (offers.length ? "" : " open") + "><summary>New proposal</summary>" +
        '<form id="offerForm" class="a-offer-form">' + groups +
          '<p class="a-offer-total" id="offerList">Tick packages to see the list price.</p>' +
          '<div class="a-two"><div class="field"><label for="oMonthly">Custom monthly price</label><input id="oMonthly" type="number" inputmode="decimal" min="0" step="1" placeholder="List price"></div>' +
          '<div class="field"><label for="oSetup">Custom setup fee</label><input id="oSetup" type="number" inputmode="decimal" min="0" step="1" placeholder="List price"></div></div>' +
          '<label class="a-check"><input type="checkbox" id="oWaive"> <span>Offer: setup fee waived if the first month is paid upfront</span></label>' +
          '<div class="field"><label for="oNotes">Note on the proposal (the prospect sees this)</label><textarea id="oNotes" rows="3" placeholder="Start with 2 shoots in December…"></textarea></div>' +
          '<button class="btn primary" type="submit">Save draft</button>' +
          '<p class="form-note" style="margin:0">Saving doesn\'t send anything. Preview it, then tap Send.</p>' +
        "</form></details></div>";
  }

  function wireOffers(l, offers) {
    var form = $("offerForm");
    function picked() { return [].map.call(form.querySelectorAll(".a-pkgs input:checked"), function (i) { return i.value; }); }
    function updateList() {
      var t = offerTotals({ package_ids: picked(), custom_monthly_price: null, custom_setup_fee: null });
      $("offerList").textContent = t.pkgs.length ? "List price: " + money(t.monthly) + "/mo" + (t.setup ? " + " + money(t.setup) + " setup" : "") : "Tick packages to see the list price.";
      $("oMonthly").placeholder = t.pkgs.length ? String(t.monthly) : "List price";
      $("oSetup").placeholder = t.pkgs.length ? String(t.setup) : "List price";
    }
    form.addEventListener("change", updateList);
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var ids = picked();
      if (!ids.length) { toast("Pick at least one package.", true); return; }
      var num = function (id) { var v = $(id).value.trim(); return v === "" ? null : Math.max(0, Number(v)); };
      var row = { lead_id: l.id, package_ids: ids, custom_monthly_price: num("oMonthly"), custom_setup_fee: num("oSetup"),
                  waive_setup_with_prepay: $("oWaive").checked, custom_notes: $("oNotes").value.trim() || null };
      if ([row.custom_monthly_price, row.custom_setup_fee].some(function (v) { return v !== null && isNaN(v); })) { toast("Prices must be numbers.", true); return; }
      db.from("package_offers").insert(row).select("id")
        .then(function (res) { oneRow(res); return reloadDetail(l.id, "Draft saved. Preview it, then Send."); })
        .catch(function (e) { toast("Couldn't save: " + errMsg(e), true); });
    });

    [].forEach.call(document.querySelectorAll(".a-offer[data-offer]"), function (box) {
      var id = box.getAttribute("data-offer");
      var o = offers.filter(function (x) { return x.id === id; })[0];
      box.querySelector(".offer-copy").addEventListener("click", function () { copy(proposalLink(o.public_token, false)); });
      var send = box.querySelector(".offer-send");
      if (send) send.addEventListener("click", function () {
        if (!l.email) { toast("Add an email first (Edit contact).", true); return; }
        if (!window.confirm("Email this proposal to " + l.email + "?")) return;
        var msg = box.querySelector(".offer-msg").value;
        send.disabled = true;
        api("/api/send-offer", { offerId: id, message: msg })
          .then(function () { return reloadDetail(l.id, "Proposal sent"); })
          .catch(function (e) { send.disabled = false; toast(errMsg(e), true); });
      });
      var del = box.querySelector(".offer-delete");
      if (del) del.addEventListener("click", function () {
        if (!window.confirm("Delete this draft proposal? This can't be undone.")) return;
        db.from("package_offers").delete().eq("id", id).is("sent_at", null).select("id")
          .then(function (res) { oneRow(res); return reloadDetail(l.id, "Draft deleted"); })
          .catch(function (e) { toast("Couldn't delete: " + errMsg(e), true); });
      });
    });
  }

  // ------------------------------------------------------------ mark as won
  function wonHtml(l, offers, client) {
    if (client) return "";
    var accepted = offers.filter(function (o) { return o.accepted_at; })[0];
    return '<div class="a-panel"><h2>Won the deal?</h2>' +
      '<p class="muted" style="margin:0">' + (accepted
        ? "Creates the client from the accepted proposal (" + esc(money(offerTotals(accepted).monthly)) + "/mo) and opens onboarding."
        : "No accepted proposal yet. This creates the client without packages; you can add them later.") + "</p>" +
      '<button type="button" class="btn primary" id="markWon" data-won-offer="' + esc(accepted ? accepted.id : "") + '">Mark as won</button></div>';
  }

  function wireWon(l, offers, client) {
    var b = $("markWon"); if (!b) return;
    b.addEventListener("click", function () {
      if (!window.confirm("Mark " + (l.business || l.name) + " as won and create the client?")) return;
      b.disabled = true;
      var args = { p_lead: l.id };
      if (b.getAttribute("data-won-offer")) args.p_offer = b.getAttribute("data-won-offer");
      db.rpc("convert_lead_to_client", args)
        .then(function (res) { if (res.error) throw res.error; return reloadDetail(l.id, "Client created"); })
        .catch(function (e) { b.disabled = false; toast("Couldn't convert: " + errMsg(e), true); });
    });
  }

  $("back").addEventListener("click", function () { location.hash = tab; });

  // Refresh when you come back to the tab (e.g. after a prospect opens or accepts),
  // unless you're in the middle of typing something on the lead page.
  function hasUnsavedInput() {
    return [].some.call(document.querySelectorAll("#detail input, #detail textarea"), function (f) {
      if (f.type === "file") return !!f.value;
      if (f.type === "checkbox") return f.checked !== f.defaultChecked;
      return f.value !== f.defaultValue;
    });
  }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden || !db) return;
    var h = location.hash.slice(1);
    if (!$("v-detail").hidden && h.indexOf("lead=") === 0 && !hasUnsavedInput()) { reloadDetail(decodeURIComponent(h.slice(5))); }
    else if (!$("v-list").hidden) { loadLeads().then(renderList); }
  });

  // ------------------------------------------------------------ routing (#follow, #all, #new, #lead=<id>)
  function route() {
    var h = location.hash.slice(1);
    if (h.indexOf("lead=") === 0) { renderDetail(decodeURIComponent(h.slice(5))); return; }
    if (h === "new") { renderNewLead(); return; }
    if (h === "all" || h === "follow") tab = h;
    show("v-list"); renderList();
  }
  window.addEventListener("hashchange", function () {
    if (!db || $("v-login").hidden === false || /access_token|error/.test(location.hash)) return;
    if (!$("v-list").hidden || !$("v-detail").hidden) route();
  });

  boot();
})();

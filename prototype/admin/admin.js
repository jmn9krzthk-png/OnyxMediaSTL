/* Onyx admin: leads list, follow-ups and lead detail.
 * Runs in the browser with the PUBLISHABLE key only. Every read and write is checked by
 * Supabase row-level security, which only lets profiles with role = 'admin' through. */
(function () {
  "use strict";

  var STATUSES = [
    ["new", "New"], ["contacted", "Contacted"], ["audit_sent", "Audit sent"], ["meeting_set", "Meeting set"],
    ["proposal_sent", "Proposal sent"], ["won", "Won"], ["lost", "Lost"]
  ];
  var AUDIT_STATUSES = [["requested", "Requested"], ["in_progress", "In progress"], ["sent", "Sent"]];
  var SOURCES = { website: "Website", facebook: "Facebook", referral: "Referral", walk_in: "Walk-in", other: "Other" };
  var CLOSED = ["won", "lost"];
  var LEAD_COLS = "id,name,business,email,phone,industry,source,status,notes,next_follow_up,created_at";

  var db = null, leads = [], tab = "follow";
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
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, bad ? 5000 : 2200);
  }
  function show(view) {
    ["v-loading", "v-login", "v-denied", "v-error", "v-list", "v-detail"].forEach(function (id) { $(id).hidden = id !== view; });
    window.scrollTo(0, 0);
  }
  function dueClass(l) {
    if (!l.next_follow_up || CLOSED.indexOf(l.status) > -1) return "";
    var t = today();
    return l.next_follow_up < t ? "overdue" : l.next_follow_up === t ? "due" : "";
  }

  // ------------------------------------------------------------ boot
  function boot() {
    fetch("/api/config", { cache: "no-store" })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Config error"); return j; }); })
      .then(function (cfg) {
        db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" }
        });
        var hashErr = new URLSearchParams(location.hash.slice(1)).get("error_description");
        db.auth.onAuthStateChange(function (event) {
          if (event === "SIGNED_OUT") { $("signOut").hidden = true; show("v-login"); }
        });
        return db.auth.getSession().then(function (res) {
          var session = res.data && res.data.session;
          if (!session) {
            if (location.hash.indexOf("#lead=") === 0) { try { localStorage.setItem("onyxPendingLead", location.hash); } catch (e) {} }
            show("v-login");
            if (hashErr) $("loginMsg").textContent = "That link didn't work (" + hashErr.replace(/\+/g, " ") + "). Request a new one.";
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
      return loadLeads().then(route);
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
        msg.textContent = res.error
          ? "Couldn't send a link: " + res.error.message
          : "Check your email for a sign-in link. Open it on this device, in this browser.";
      });
  });
  function signOut() { db.auth.signOut().then(function () { location.hash = ""; show("v-login"); }); }
  $("signOut").addEventListener("click", signOut);
  $("deniedSignOut").addEventListener("click", signOut);

  // ------------------------------------------------------------ list
  function initFilters() {
    if ($("fStatus").options.length > 1) return;
    $("fStatus").insertAdjacentHTML("beforeend", options(STATUSES, ""));
    $("fStatus").addEventListener("change", renderList);
    $("fSearch").addEventListener("input", renderList);
    [].forEach.call(document.querySelectorAll(".a-tab"), function (b) {
      b.addEventListener("click", function () { tab = b.getAttribute("data-tab"); location.hash = tab; });
    });
  }

  function loadLeads() {
    return db.from("leads").select(LEAD_COLS).order("created_at", { ascending: false }).limit(1000).then(function (res) {
      if (res.error) { toast("Couldn't load leads: " + res.error.message, true); return; }
      leads = res.data || [];
    });
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

  // ------------------------------------------------------------ detail
  function renderDetail(id) {
    show("v-detail");
    $("detail").innerHTML = '<p class="muted">Loading…</p>';
    Promise.all([
      db.from("leads").select(LEAD_COLS).eq("id", id).maybeSingle(),
      db.from("audit_requests").select("*").eq("lead_id", id).order("created_at", { ascending: false })
    ]).then(function (r) {
      if (r[0].error || !r[0].data) { $("detail").innerHTML = '<p class="a-empty muted">Lead not found.</p>'; return; }
      var l = r[0].data, audits = r[1].data || [];
      var tel = digits(l.phone);
      $("detail").innerHTML =
        '<div class="a-panel">' +
          '<div class="a-row"><span class="pill s-' + esc(l.status) + '">' + esc(label(STATUSES, l.status)) + '</span><span class="a-meta">Added ' + esc(niceStamp(l.created_at)) + "</span></div>" +
          "<h1>" + esc(l.name) + "</h1>" + (l.business ? '<p class="body-l" style="margin:0;font-size:18px">' + esc(l.business) + "</p>" : "") +
          '<div class="a-actions">' +
            (tel ? '<a class="btn primary" href="tel:' + esc(tel) + '">Call</a><a class="btn secondary" href="sms:' + esc(tel) + '">Text</a>' : "") +
            (l.email ? '<a class="btn secondary" href="mailto:' + esc(l.email) + '">Email</a>' : "") +
          "</div>" +
          '<dl class="a-dl">' +
            (l.email ? "<dt>Email</dt><dd>" + esc(l.email) + "</dd>" : "") +
            (l.phone ? "<dt>Phone</dt><dd>" + esc(l.phone) + "</dd>" : "") +
            (l.industry ? "<dt>Industry</dt><dd>" + esc(l.industry) + "</dd>" : "") +
            "<dt>Source</dt><dd>" + esc(SOURCES[l.source] || l.source) + "</dd>" +
          "</dl>" +
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

        '<div class="a-panel"><div class="a-row"><h2>Notes</h2><button type="button" class="a-link" id="editNotes">Edit</button></div>' +
          '<pre class="a-notes" id="notesView">' + esc(l.notes || "No notes yet.") + "</pre>" +
          '<div id="notesEdit" hidden><div class="field"><textarea id="notesText" rows="12"></textarea></div>' +
          '<button type="button" class="btn secondary" id="saveNotes" style="margin-top:8px">Save all notes</button></div>' +
        "</div>" +

        (audits.length ? '<div class="a-panel"><h2>Audit request' + (audits.length > 1 ? "s" : "") + "</h2>" + audits.map(auditHtml).join("") + "</div>" : "");

      wireDetail(l);
    });
  }

  function auditHtml(a) {
    var link = function (u, t) { u = safeUrl(u); return u ? "<dt>" + t + '</dt><dd><a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(u.replace(/^https?:\/\/(www\.)?/, "")) + "</a></dd>" : ""; };
    return '<div class="a-audit"><span class="a-meta">Requested ' + esc(niceStamp(a.created_at)) + "</span>" +
      '<dl class="a-dl">' + link(a.website, "Website") + link(a.facebook_url, "Facebook") + link(a.instagram_url, "Instagram") + link(a.google_business_url, "Google") +
        "<dt>Runs ads</dt><dd>" + (a.runs_ads === true ? "Yes" : a.runs_ads === false ? "No" : "—") + "</dd>" +
        (a.monthly_ad_spend ? "<dt>Ad spend</dt><dd>" + esc(a.monthly_ad_spend) + "</dd>" : "") +
        (a.biggest_goal ? "<dt>Goal</dt><dd>" + esc(a.biggest_goal) + "</dd>" : "") +
      "</dl>" +
      '<div class="field"><label>Audit status</label><select class="audit-status" data-id="' + esc(a.id) + '">' + options(AUDIT_STATUSES, a.status) + "</select></div></div>";
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
      }).then(function (res) {
        if (res.error || !res.data || !res.data.length) throw res.error || new Error("not saved");
        toast("Saved");
        return loadLeads().then(function () { renderDetail(l.id); });
      }).catch(function (e) {
        btn.disabled = false; toast("Couldn't save: " + (e && e.message ? e.message : "try again"), true);
      });
    });

    $("editNotes").addEventListener("click", function () {
      $("notesText").value = l.notes || ""; $("notesEdit").hidden = false; $("notesView").hidden = true; $("editNotes").hidden = true;
    });
    $("saveNotes").addEventListener("click", function () {
      db.from("leads").update({ notes: $("notesText").value.trim() || null }).eq("id", l.id).select("id").then(function (res) {
        if (res.error || !res.data || !res.data.length) { toast("Couldn't save notes", true); return; }
        toast("Notes saved"); loadLeads().then(function () { renderDetail(l.id); });
      });
    });

    [].forEach.call(document.querySelectorAll(".audit-status"), function (sel) {
      sel.addEventListener("change", function () {
        db.from("audit_requests").update({ status: sel.value }).eq("id", sel.getAttribute("data-id")).select("id").then(function (res) {
          toast(res.error || !res.data || !res.data.length ? "Couldn't update audit status" : "Audit status saved", !!res.error);
        });
      });
    });
  }

  $("back").addEventListener("click", function () { location.hash = tab; });

  // ------------------------------------------------------------ routing (#follow, #all, #lead=<id>)
  function route() {
    var h = location.hash.slice(1);
    if (h.indexOf("lead=") === 0) { renderDetail(decodeURIComponent(h.slice(5))); return; }
    if (h === "all" || h === "follow") tab = h;
    show("v-list"); renderList();
  }
  window.addEventListener("hashchange", function () {
    if (!db || $("v-login").hidden === false || /access_token|error/.test(location.hash)) return;
    if (!$("v-list").hidden || !$("v-detail").hidden) route();
  });

  boot();
})();

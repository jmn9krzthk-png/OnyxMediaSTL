# Backend setup (Phase 1): Supabase + Netlify Functions + Resend

What was built:
- **Contact form** → `/api/contact` → saves a lead and emails Max.
- **Free audit page** (`/audit.html`) → `/api/audit` → saves a lead plus an audit request, emails the prospect and Max.
- **Admin** at `/admin/` → magic-link sign-in, follow-up list, all leads, lead detail.

Where the code lives:

| What | Where |
|---|---|
| Database schema, security rules, buckets, prices | `supabase/migrations/` (run in filename order) |
| Server code (the only place the secret key is used) | `netlify/functions/`, `netlify/lib/` |
| Audit page, contact form, footer, hero button | `tools/build_site.py` → run `python3 tools/build_site.py` |
| Form JavaScript | `prototype/assets/site.js` |
| Admin app | `prototype/admin/` |

Do the steps below **in order**. Each one takes a few minutes.

---

## 1. Supabase: create the database

1. Open your project at supabase.com and click **SQL Editor** in the left sidebar.
2. Click **+ New query**.
3. In GitHub, open `supabase/migrations/20261120000001_schema.sql` and click the **Copy raw file** button. Paste it into the SQL Editor and click **Run**. You should see "Success. No rows returned."
4. Repeat with a new query for each of the other files, **in this order**:
   - `20261120000002_rls.sql`
   - `20261120000003_storage.sql`
   - `20261120000004_seed_packages.sql`
5. Check that it worked: **Table Editor** should list 11 tables, and `packages` should have 6 rows. **Storage** should show two private buckets, `brand-assets` and `audits`.

> Files 1–3 are run **once**. If one errors halfway, stop and send me the error rather than re-running it.
> File 4 (prices) is safe to run again any time you change prices in it.

*(Optional, for later: the Supabase CLI can run these for you with `supabase link` then `supabase db push`. Pasting into the SQL Editor is simpler for now.)*

## 2. Supabase: copy your keys

1. Click **Project Settings** (gear icon) → **API Keys**.
2. You need three values. Paste them somewhere temporary, like a note on your own computer, not an email or chat:
   - **Project URL**: shown under Project Settings → **Data API**, or on the project home page. It looks like `https://abcdefgh.supabase.co`.
   - **Publishable key**: starts with `sb_publishable_`.
   - **Secret key**: starts with `sb_secret_`. Click **Reveal** to copy it. **Treat this like a password.** It can read and change everything.

## 3. Supabase: sign-in settings

1. **Authentication** → **URL Configuration**:
   - **Site URL**: `https://onyxmediastl.com`
   - **Redirect URLs**: click **Add URL** and add both of these:
     - `https://onyxmediastl.com/admin/`
     - `https://*--onyxmediastl.netlify.app/**` (lets sign-in work on deploy previews)
   - Click **Save**.
2. **Authentication** → **Users** → **Add user** → **Create new user**.
   - Email: `max@onyxmediastl.com`
   - Password: anything long and random (you won't use it; you sign in by email link).
   - Tick **Auto Confirm User**, then click **Create user**.
3. Make yourself the admin. In **SQL Editor** → **New query**, paste this and click **Run**:

   ```sql
   insert into public.profiles (id, role)
   select id, 'admin' from auth.users where email = 'max@onyxmediastl.com'
   on conflict (id) do update set role = 'admin', client_id = null;
   ```

   You should see "Success. 1 row affected". If it says 0 rows, the email in step 2 doesn't match exactly.
4. Block strangers from creating accounts: **Authentication** → **Sign In / Providers** (may be called **Providers** or **Settings**) → turn **off** "Allow new users to sign up" → **Save**.
   - Your account still works. Future client logins are created by you, from the Users page.

*Optional, recommended:* Supabase's built-in email for sign-in links is slow and limited to a few per hour. Once Resend is set up (step 5), send them through Resend instead. Go to **Authentication** → **Emails** → **SMTP Settings**, turn on **Enable custom SMTP**, and enter:

| Setting | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | your Resend API key |
| Sender email | `hello@onyxmediastl.com` |
| Sender name | `Onyx Media` |

## 4. Netlify: add environment variables

1. app.netlify.com → your site → **Site configuration** → **Environment variables** → **Add a variable** → **Add a single variable**.
2. Add these four, one at a time. For each one, leave **Scopes** on "All scopes" and **Deploy contexts** on "Same value for all deploy contexts" so deploy previews work too.

   | Key | Value | Notes |
   |---|---|---|
   | `SUPABASE_URL` | your Project URL | |
   | `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | |
   | `SUPABASE_SECRET_KEY` | `sb_secret_…` | Tick **Contains secret values** |
   | `RESEND_API_KEY` | `re_…` (from step 5) | Tick **Contains secret values** |

3. Environment variables only take effect on the **next deploy**. After adding them, go to **Deploys** → **Trigger deploy** → **Deploy site** (or push a new commit).

Optional extras (not required): `ALERT_EMAIL_TO` changes who gets lead alerts, and `EMAIL_FROM` changes the sender, e.g. `Onyx Media <hello@onyxmediastl.com>`.

## 5. Resend: send email from onyxmediastl.com

1. Sign up at resend.com with max@onyxmediastl.com.
2. **Domains** → **Add Domain** → enter `onyxmediastl.com`. For region, choose **North Virginia (us-east-1)**. Click **Add**.
3. Resend shows 3–4 DNS records. Add each one where your domain's DNS is managed. Today that's **Wix → Settings → Domains → Manage DNS records**; if you've moved DNS since, use the new provider.
   - **MX** record on host `send`. This is NOT the main `@` MX, so your Google Workspace email is untouched.
   - **TXT** record on host `send` (SPF).
   - **TXT** record on host `resend._domainkey` (DKIM).
   - Optional **TXT** on `_dmarc`. Only add it if you don't already have a `_dmarc` record.
   - Copy the values exactly. Some DNS screens add `.onyxmediastl.com` automatically; if so, enter just `send` and `resend._domainkey` as the host.
4. Back in Resend, click **Verify DNS Records**. It can take from a few minutes to a few hours. Wait until the domain shows **Verified**.
5. **API Keys** → **Create API Key**. Name: `netlify-onyxmediastl`. Permission: **Sending access**. Domain: `onyxmediastl.com`. Copy the key, which starts with `re_`. Resend only shows it once.
6. Paste it into Netlify as `RESEND_API_KEY` (step 4), then redeploy.

Emails come **from** `hello@onyxmediastl.com`. You don't need a real inbox at that address: prospect replies go to max@onyxmediastl.com (reply-to), and lead alerts have the prospect as reply-to, so you can just hit Reply.

## 6. Netlify Forms

The contact form no longer uses Netlify Forms. Old submissions stay in Netlify's **Forms** tab. You can turn off form detection there (**Forms** → **Disable form detection**) so Netlify doesn't keep a stale "contact" form.

---

## Test checklist (do it on the deploy preview first, then on the live site)

Use a personal email (e.g. Gmail) as the "prospect" so you can see both sides.

**Contact form**
- [ ] `/contact.html` → submit with everything blank → red error, nothing sent.
- [ ] Fill in name, email, mobile (plus some optional details) → lands on the thank-you page.
- [ ] Within a minute, max@onyxmediastl.com gets **"New lead: …"** with the details and an **Open in admin** button.
- [ ] Hitting **Reply** on that alert addresses the prospect's email.
- [ ] Supabase → Table Editor → `leads` shows the row with source `website`, status `new`, follow-up = today, and the optional details in notes.
- [ ] Submit again with the same email a few minutes later → no second row; the existing lead gets a new dated note on top.

**Audit page**
- [ ] The homepage hero shows **Get a Free Audit**. The Contact page has a "Get a free content & ads audit" section, and every footer has a "Free content & ads audit" link.
- [ ] `/audit.html` looks right on your iPhone (orange accents, same fonts as the rest of the site).
- [ ] Submit with no links → error asking for at least one link.
- [ ] Submit properly → lands on "Your audit is in the queue".
- [ ] The prospect inbox gets **"We got your audit request – Onyx Media"** (check spam the first time).
- [ ] max@ gets **"Audit request: <business>"**.
- [ ] Supabase: a new `leads` row and an `audit_requests` row linked to it.

**Admin (on your iPhone)**
- [ ] Open `/admin/` → enter max@onyxmediastl.com → "Check your email".
- [ ] Open the link from the email **in Safari on the same phone** → you land in the admin, signed in.
- [ ] **Follow up today** lists the test leads (new leads are due today).
- [ ] **All leads** → the status filter and search both work.
- [ ] Tap a lead → change status, tap **Next week**, add a note → **Save** → "Saved". The lead drops off Follow up today and the note appears with a timestamp.
- [ ] On an audit lead, change **Audit status** to "In progress" → "Audit status saved".
- [ ] Tap **Open in admin** in an alert email → opens that lead (after signing in if needed).
- [ ] Sign out, then try signing in with an email that isn't yours → it should refuse.

**Security spot-checks**
- [ ] In GitHub, search the repo for `sb_secret` and `re_` → no real keys anywhere.
- [ ] Visit `/api/config` → shows only the URL and the **publishable** key (never `sb_secret`).

When everything passes, delete the test leads in Supabase (Table Editor → tick rows → Delete), then merge to main.

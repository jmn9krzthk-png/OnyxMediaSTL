# onyxmediastl.com DNS migration plan

Source: Wix DNS export, 2026-11-19. DNS records are public information.

## Phase 1: point the domain at Netlify (domain stays at Wix)
Change only these in Wix → Settings → Domains → Manage DNS records:

| Action | Type | Host | Value |
|---|---|---|---|
| Delete | A | onyxmediastl.com | 185.230.63.171 |
| Delete | A | onyxmediastl.com | 185.230.63.186 |
| Delete | A | onyxmediastl.com | 185.230.63.107 |
| Add | A | onyxmediastl.com | 75.2.60.5 (confirm the value Netlify shows) |
| Edit | CNAME | www.onyxmediastl.com | onyxmediastl.netlify.app |

Do not touch MX, TXT or nameservers.

## Phase 2: full record set for the new registrar
Recreate every record below before switching nameservers. On Cloudflare, set the A and CNAME records to "DNS only" (grey cloud) so Netlify can issue the HTTPS certificate.

| Type | Host | Value | Priority | Purpose |
|---|---|---|---|---|
| A | @ (onyxmediastl.com) | 75.2.60.5 (confirm in Netlify) | | Website (Netlify) |
| CNAME | www | onyxmediastl.netlify.app | | Website (Netlify) |
| MX | @ | aspmx.l.google.com | 10 | Google Workspace email |
| MX | @ | alt1.aspmx.l.google.com | 20 | Google Workspace email |
| MX | @ | alt2.aspmx.l.google.com | 30 | Google Workspace email |
| MX | @ | alt3.aspmx.l.google.com | 40 | Google Workspace email |
| MX | @ | alt4.aspmx.l.google.com | 50 | Google Workspace email |
| TXT | @ | v=spf1 include:_spf.google.com ~all | | Email sender authorization (Google) |
| TXT | @ | google-site-verification=RooDON37bxeplMNgssdL7konkFSscCrNVy1wu2NHyfY | | Google verification |
| TXT | mail | v=spf1 include:spf.leadconnectorhq.com include:mailgun.org ~all | | Sending subdomain (LeadConnector/Mailgun) |
| TXT | _dmarc.mail | v=DMARC1;p=none; | | Sending subdomain DMARC |
| TXT | pic._domainkey.mail | k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDEHwW5B/i43xJRokGE+CMYH7vVKdkym6xvfqezqGK7EJLJa9TZ7qt1aE4OO6TpEcEAd+lGFmhGzap4poGSHZguO/JflzYjkTOSV3hRYAi0DUjwHt+cI+XCFRVe3qV4fxO1Gh52S9c9W8I3uMBaInlhfroDl9uyDDGoaowcK+1eQwIDAQAB | | Sending subdomain DKIM |

Not copied: NS ns12/ns13.wixdns.net (replaced by the new registrar's nameservers).

## Before transferring away from Wix
- Google Workspace is billed through Wix ("Managed by Wix"). Move the subscription to Google directly first, or confirm with Wix support that it continues after the transfer.
- The `mail.` records belong to LeadConnector (GoHighLevel) sending via Mailgun. Keep them unless you are sure that account is closed.

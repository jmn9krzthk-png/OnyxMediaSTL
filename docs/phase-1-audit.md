# Phase 1: Audit of OnyxMediaStl.com

**Status:** DRAFT. Waiting for approval ⏸
**Date:** 2026-11-04
**Prepared for:** Max Fisher, Onyx Media (ONYX HTZ LLC)

> **Limits of this audit.** The build environment's network policy blocked direct access to `onyxmediastl.com` and to competitor sites. Every finding below comes from what search engines have indexed: page titles, URLs and indexed copy. Each item is marked:
> - ✅ **Confirmed** from indexed data
> - 🔶 **Inferred** from strong signals
> - ⬜ **Not yet verified.** Needs a live crawl or Lighthouse run.
>
> To finish the technical half (Lighthouse, Core Web Vitals, alt text, H1s, broken links, schema), allow `onyxmediastl.com` in the session's network settings, or send screenshots and the page source for each page.

---

## 1. Current sitemap and navigation

| Page | URL | Status |
|---|---|---|
| Home | `/` | ✅ indexed |
| Services | `/services-7` | ✅ indexed |
| Contact | `/contact-7` | ✅ indexed |
| Packages ("See Packages" link on Home) | unknown | 🔶 linked from Home, not indexed |
| About / Work / Portfolio | none found | ⬜ either missing or not indexed |

Search engines show **only 3 indexed pages**. No portfolio, case-study, about or service-detail pages appear in the index.

## 2. Headline, offer and CTA by page (as indexed)

| Page | Title tag | Headline / offer | CTA |
|---|---|---|---|
| Home | **"Onyx htz LLC"** ✅ | "Monthly Media Packages. Consistent photo and video content every month — your business never runs out of fresh posts." Also: "High-quality property media that sells homes faster." Lists Saint Charles and 636.385.3995. | "See Packages" ✅ |
| Services | "Services" ✅ | Photo, video and digital marketing for small businesses. Monthly content plans ("we handle everything from shooting and editing to scheduling and posting"), one-time shoots, real estate photo, cinematic walkthroughs and drone with 24-hour turnaround, Facebook and Google ads, local SEO. | ⬜ |
| Contact | "Contact" ✅ | Contact form: name, email, phone | Submit ✅ |

## 3. Platform

🔶 **Most likely Wix.** The `-7` suffix on `/services-7` and `/contact-7` is the slug Wix gives a page that was duplicated or re-added. Confirm in your account. If it is Wix, it limits speed, schema, redirects and video hosting. This feeds the Phase 5 platform decision.

---

## 4. Prioritized findings

### 🔴 CRITICAL

1. **The homepage title tag is "Onyx htz LLC".** ✅ This is the most important SEO element on the site, and it uses the legal entity name. Nobody searches for that. It contains no "video production", "St. Louis" or "St. Charles". *Fix:* "St. Louis Video Production & Social Content | Onyx Media". Write a unique title for every page.
2. **The site is nearly invisible for its core search terms.** ✅ A search for "Onyx Media St. Louis video production" did not return the site. Results went to Clutch, DesignRush and competitors. Only 3 pages are indexed. There are no service-specific landing pages to rank.
3. **Other businesses use the same brand name.** ✅ Search results mix you up with **onyxmedia.us** ("Performance Marketing Agency"), which competes directly with *Onyx Performance Advertising*. They also show **onyxdm.com** (Onyx Digital Media, which does real estate photo and video) and **Onyx Media & Productions** (Texas weddings). Your brand needs a geographic qualifier ("Onyx Media STL"), consistent NAP, and LocalBusiness schema so Google can tell you apart.
4. **The site's positioning doesn't match the business you described.** ✅ The live site leads with *real estate media* and *monthly photo/video packages*. Your brief puts *brand and commercial video, short-form reels and performance advertising* first. A business owner looking for a video and ads partner lands on a page about selling homes. Real estate needs either its own page or a smaller role.
5. **There is no visible proof.** ✅ No portfolio, case-study, testimonial or client-logo page is indexed. For a video studio, the work *is* the sales pitch. K9 Kamp and any other approved clients should be featured.
6. **The CTA doesn't book a call.** ✅ The main CTA is "See Packages", which means browsing, not booking. The contact form takes only name, email and phone, with no service, budget or timeline. That gives you nothing to qualify leads with. There's no scheduler.

### 🟠 HIGH

7. **The services read as a generic list.** ✅ "Photo, video and digital marketing for small businesses" with seven services equally weighted (content, shoots, real estate, drone, FB ads, Google ads, SEO). That reads as a generalist, not a premium studio. It needs 3–4 lead services, each with its own page.
8. **The copy describes deliverables, not outcomes.** ✅ "Never runs out of fresh posts" and "stay top-of-mind" are about activity. Nothing ties content to leads, bookings or revenue, which you said is your real differentiator.
9. **Duplicate and messy URLs.** ✅ `/services-7` and `/contact-7` look sloppy, and the suffix suggests leftover pages that may also be live. Use clean URLs and 301 redirects.
10. **The brand is inconsistent across channels.** ✅ The site title says "Onyx htz LLC", Facebook is `/Onyxhtz` titled "Onyx Media", and the business is listed as a "Marketing Agency". Pick one public name and use it everywhere.
11. **The Google Business Profile connection is unclear.** ⬜ GBP category, website link, reviews and NAP match all need checking. Reviews are the fastest trust signal you can add.
12. **Location framing.** ✅ The site says "Saint Charles" while the brand says "STL". That's fine, but each page should name the service area (St. Louis metro, St. Charles County, St. Peters, O'Fallon, Chesterfield…).

### 🟡 NICE-TO-HAVE / pending live crawl

13. ⬜ Lighthouse and Core Web Vitals scores (Wix plus video usually give poor mobile LCP).
14. ⬜ Meta descriptions, single H1 per page, alt text, Open Graph images.
15. ⬜ Schema: LocalBusiness, VideoObject, FAQ (probably none).
16. ⬜ Broken links, the "See Packages" target, mobile layout, and video hosting (self-hosted vs. Vimeo/YouTube).
17. ⬜ Analytics: GA4 and Meta Pixel present? Conversion events?

## 5. Worth keeping

- ✅ **The 24-hour real estate turnaround.** It's a specific, credible claim. Use it on the real estate page.
- ✅ **The done-for-you monthly model:** "we handle everything from shooting and editing to scheduling and posting." It's a good retainer promise. Rewrite it around outcomes.
- ✅ **Phone number** 636.385.3995 and email max@onyxmediastl.com. Keep them for NAP consistency.
- ✅ **Breadth of offer** (ads + SEO + production). This is your differentiator once it's framed as "one team: strategy, production, ads" instead of a list.
- ⬜ Any reels, photos, logos and testimonials currently on the site. Send what you have.

---

## 6. Competitor snapshot (St. Louis metro)

From directory listings (Clutch, DesignRush, UpCity). I couldn't open their sites directly.

| Competitor | Positioning | What they do better | Where Onyx can win |
|---|---|---|---|
| **Tree9 Films** | Emmy-winning, commercial and brand films, fundraising video. Listed retainer from about $2K+/mo | Awards, polished storytelling, nonprofit niche | Price point and speed for owner-led small businesses; ads management in-house |
| **StoryTrack** | Award-winning; branded documentaries, corporate, nonprofit | Documentary depth, credibility | Short-form social plus paid distribution, not just the film |
| **Lifetime Media** | Since 2000; video plus social and content marketing for small businesses | Longevity, reviews | Modern short-form-first brand; owner on every shoot |
| **ReelEyez Media** (St. Peters) | Digital ads plus video. Listed from about $500/mo | Same county, low entry price | Premium positioning, case studies tied to leads |
| **Coolfire Studios** | Production plus digital and social engagement | Scale, big-brand clients | Accessibility and speed for $500K–$10M businesses |

**The opening:** Most St. Louis studios sell the *film*. Few sell *content plus the ad spend that makes it produce leads*, priced for owner-led local businesses. That's your lane: **"We make the video and we make it pay."** Onyx Performance Advertising fits it naturally.

---

## 7. What I need from you before Phase 2

1. **Network access:** allow `onyxmediastl.com` (and optionally the competitor domains) so I can run the live crawl and Lighthouse. Or send screenshots and page source.
2. **Platform:** confirm Wix (or whichever builder).
3. **Approve this findings list** or change the priorities.
4. Fill in the brackets from the brief: service ranking, ideal client, pricing approach, approved clients and testimonials (K9 Kamp OK?), regional vs. national.

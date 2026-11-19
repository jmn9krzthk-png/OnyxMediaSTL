#!/usr/bin/env python3
"""Build the Onyx Media static site into prototype/.

Every page is assembled from the shared pieces below (head, header, footer,
forms, cards). To add a city page, a case study or a review, edit the data
lists near the top and run:  python3 tools/build_site.py

The public contact email is read from the ONYX_CONTACT_EMAIL environment
variable so it is not stored in this script:
  ONYX_CONTACT_EMAIL=you@yourdomain.com python3 tools/build_site.py

Outputs:
  prototype/*.html          full pages for Netlify (publish directory: prototype)
  prototype/sitemap.xml, robots.txt
  build/artifact-index.html the home page as a fragment, for the Claude preview link
"""
import html, json, os, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "prototype"
ART = ROOT / "build"

# ---------------------------------------------------------------- settings
SITE_URL = "https://onyxmediastl.netlify.app"   # change to https://onyxmediastl.com at launch
INDEXABLE = False      # keep search engines out until placeholders are replaced
PHONE = "636.385.3995"
PHONE_TEL = "+16363853995"
EMAIL = os.environ.get("ONYX_CONTACT_EMAIL", "").strip()
EMAIL_SHOWN = EMAIL or "[contact email]"
HERO_VIDEO = None      # e.g. "media/hero-loop.mp4" — when set, plays instead of the photo slideshow
PRICE_CONTENT = "$[X]/mo"
PRICE_ADS = "$[X]/mo + ad spend"

# ---------------------------------------------------------------- data
CLIENTS = ["Victory Raceway", "Cool Touch Graphics", "Mountain Top Motor Company", "Mountain Top Service Center",
           "Vitale Law Firm", "Almost Home Kennels", "Gorilla Roofing", "K9 Kamp", "Kimco Concrete",
           "Midnight Motorsports", "Mission's Upholstery", "Timberland Band", "Trailblaze Media", "Wies Offsite",
           "Meyer & Company Real Estate & Auctions", "Detail 360"]

# Real Google reviews only. Paste them exactly as written: (quote, reviewer name, business or trade, stars)
REVIEWS = []

ROTATE = ["service calls", "full bays", "booked jobs", "install jobs", "repair orders"]

SLIDES = [  # (file, alt, caption)  — no client names on photos
    ("max-on-set-wide", "Filming an engine bay on a gimbal", "On set · automotive"),
    ("roof-drone-overhead", "Drone view of a roof replacement in progress", "Roof replacement · drone"),
    ("kennel-play-yard", "Dogs playing in a kennel's play yard", "Kennel · play yard"),
    ("gorilla-crew-on-roof", "Roofing crew working on a steep roof", "Crew on the roof"),
    ("neighborhood-aerial", "Aerial view of a home and neighborhood", "Neighborhood aerial"),
    ("mtsc-service-bays", "Auto shop service bays with vehicles on lifts", "Service bays · automotive"),
]

TRADES = [
    ("HVAC & plumbing", "Fill the schedule before the first cold snap and the first heat wave."),
    ("Roofing & exteriors", "Win storm season with proof on the roof, not just yard signs."),
    ("Remodeling", "Before-and-after video that sells the bigger kitchen, bath or basement."),
    ("Landscaping & outdoor", "Book spring installs in February with the crews homeowners already see."),
    ("Garage doors & pest", "Be the first name a homeowner trusts when something breaks or bites."),
    ("Automotive", "Repair shops, dealers, detailers, tint and wrap, body shops. Fill the bays."),
]

GALLERY = [  # (file, alt, caption, css class)
    ("roof-drone-overhead", "Drone view of a roof replacement in progress", "Roof replacement · drone", "g-wide"),
    ("restoration-scaffolding", "Historic brick building in scaffolding during restoration", "Exterior restoration", "g-tall"),
    ("owners-on-camera", "Two business owners smiling outdoors", "Owners on camera", "g-tall"),
    ("kennel-play-yard", "Dogs playing in a kennel play yard", "Kennel · play yard", ""),
    ("neighborhood-aerial", "Aerial view of a brick home and neighborhood", "Neighborhood aerial", ""),
    ("kimco-site-walk", "Concrete crew walking a job site in safety vests", "Concrete · site walk", ""),
    ("wies-offsite-interior", "Installer on scaffolding inside a building under construction", "Construction · interior", ""),
    ("trailblaze-studio-interview", "Studio interview set with lights and camera", "Studio interview", ""),
    ("gorilla-roof-drone", "Drone view of a roof tear-off", "Roof tear-off · drone", ""),
]

CASES = [  # filters: social, ads
    dict(f=["social"], title="Dog training company", tag="Social content", img="k9kamp-owner",
         alt="Business owner smiling in front of his company van",
         problem="A dog trainer whose results speak for themselves, but whose feed didn't show them.",
         made="Talking-head reels with the owner, filmed during real training sessions with the dogs.",
         result="[RESULT: real numbers only]"),
    dict(f=["social", "ads"], title="Roofing contractor", tag="Roofing · social + ads", img="gorilla-crew-on-roof",
         alt="Roofing crew installing underlayment on a steep roof",
         problem="[The business problem in one sentence]",
         made="[What we shot: crew-on-the-roof reels, drone, Meta ad creatives]", result="[Measured result]"),
    dict(f=["social", "ads"], title="Auto service center", tag="Automotive · social + ads", img="mtsc-service-bays",
         alt="Auto shop with vehicles on lifts in the service bays",
         problem="[e.g. Empty bays midweek, customers choosing the dealer for routine service]",
         made="[e.g. Tech-explains-the-repair reels and a service-special ad from one shoot day]", result="[Measured result]"),
    dict(f=["ads"], title="Chiropractic table upholsterer", tag="Paid ads", img="upholstery-owners",
         alt="Husband-and-wife owners of an upholstery business standing outdoors",
         problem="[e.g. A niche service chiropractors only search for when a table is worn out]",
         made="[e.g. Meta and Google campaigns targeting chiropractic clinics, with before-and-after creatives]",
         result="[Measured result: leads, booked jobs or cost per lead]"),
]

HOME_FAQ = [
    ("How much does it cost?", f"Monthly content plans start at {PRICE_CONTENT}. Paid ad management starts at {PRICE_ADS}. You get a fixed quote after a 15-minute call.", True),
    ("Will filming slow my crew down?", "No. We shoot on real jobs and work around your techs. Most shoot days are a half day, and owner interviews take about 30 minutes.", False),
    ("Do you only work in St. Charles?", "We're based in St. Charles and shoot across St. Charles, Lincoln, Warren and St. Louis counties. See the areas we serve below.", False),
    ("Who owns the footage?", "You own the final edited videos and can use them anywhere. Raw footage policy to be confirmed.", True),
    ("Do I have to sign a long contract?", "Monthly plans run on a [X]-month minimum, then month to month.", True),
]

CITIES = [
    dict(slug="st-charles", name="St. Charles", county="St. Charles County",
         intro="St. Charles is home base. Our studio is here, so shoots in St. Charles are the easiest to schedule, often within the week.",
         local="From the shops near Historic Main Street to the service companies along I-70, St. Charles businesses compete with the whole metro for the same customers. Steady local video is how you stay the name people remember.",
         near=["st-peters", "o-fallon", "chesterfield"]),
    dict(slug="st-peters", name="St. Peters", county="St. Charles County",
         intro="St. Peters sits right next to our St. Charles base along I-70. We film here for trades and auto shops that want to be the first call in their part of the county.",
         local="Homeowners in St. Peters compare a lot of contractors before they pick one. Video of your real crew and real work is what makes the shortlist.",
         near=["st-charles", "o-fallon", "wentzville"]),
    dict(slug="o-fallon", name="O'Fallon", county="St. Charles County",
         intro="O'Fallon sits between I-70 and I-64 in the middle of St. Charles County, a short drive from our studio. We shoot here for home service companies and automotive shops.",
         local="O'Fallon has a lot of newer neighborhoods and a lot of homeowners searching for help. Short-form video and local ads put your trucks in front of them.",
         near=["st-peters", "lake-saint-louis", "wentzville"]),
    dict(slug="wentzville", name="Wentzville", county="St. Charles County",
         intro="Wentzville is where I-70 and I-64 meet, at the western edge of St. Charles County. We film here for trades and auto businesses serving the fast-moving west county market.",
         local="Wentzville businesses often serve customers in three counties. Paid ads let you aim at the ZIP codes you actually want, instead of everyone.",
         near=["lake-saint-louis", "o-fallon", "wright-city"]),
    dict(slug="lake-saint-louis", name="Lake Saint Louis", county="St. Charles County",
         intro="Lake Saint Louis is a lake community off I-64 and I-70 in western St. Charles County. We shoot here for contractors, remodelers and outdoor companies.",
         local="Lake Saint Louis homeowners invest in their homes and yards. Before-and-after video of your work is the content that sells to them.",
         near=["wentzville", "o-fallon", "st-peters"]),
    dict(slug="troy", name="Troy", county="Lincoln County",
         intro="Troy is the seat of Lincoln County, along US-61 north of Wentzville. We travel here for home service companies and auto shops that want to own their local market.",
         local="In a smaller market, the business that shows up consistently online wins the word of mouth too. One shoot day gives you a month of it.",
         near=["wentzville", "wright-city", "warrenton"]),
    dict(slug="wright-city", name="Wright City", county="Warren County",
         intro="Wright City sits on I-70 in Warren County, just west of Wentzville. We film here for trades and automotive businesses on the growing I-70 corridor.",
         local="New homes along the I-70 corridor mean new customers who don't know who to call yet. Local video and ads make sure it's you.",
         near=["warrenton", "wentzville", "troy"]),
    dict(slug="warrenton", name="Warrenton", county="Warren County",
         intro="Warrenton is the Warren County seat on I-70. We travel here for contractors, auto shops and service companies that want steady content without hiring in-house.",
         local="Warrenton customers often drive to St. Charles County for services. Strong local content keeps that business at home with you.",
         near=["wright-city", "troy", "wentzville"]),
    dict(slug="chesterfield", name="Chesterfield", county="St. Louis County",
         intro="Chesterfield is across the Missouri River from St. Charles County on I-64. We film here for home service companies and automotive businesses serving west St. Louis County.",
         local="Chesterfield homeowners expect polished work. Video that looks as professional as your crew is how you earn the higher-ticket jobs.",
         near=["st-charles", "st-louis", "lake-saint-louis"]),
    dict(slug="st-louis", name="St. Louis", county="the St. Louis metro",
         intro="We shoot across the St. Louis metro for home service companies and automotive businesses that want one local team for video and ads.",
         local="The St. Louis market is crowded with contractors and shops. Consistent video and well-aimed ads are how a local business stands out without a national budget.",
         near=["chesterfield", "st-charles", "st-peters"]),
]
CITY_BY_SLUG = {c["slug"]: c for c in CITIES}

def city_file(slug): return f"video-production-{slug}-mo.html"

NAV = [("content-creation.html", "Monthly Content"), ("paid-advertising.html", "Paid Ads"),
       ("work.html", "Work"), ("about.html", "About"), ("./#areas", "Areas")]

# ---------------------------------------------------------------- helpers
e = html.escape
TRI = '<span class="tri"></span>'

def eyebrow(t): return f'<span class="eyebrow">{TRI}{e(t)}</span>'

def ticks(items): return '<ul class="ticks">' + "".join(f"<li>{TRI}{e(i)}</li>" for i in items) + "</ul>"

def ld(obj): return '<script type="application/ld+json">' + json.dumps(obj).replace("</", "<\\/") + "</script>"

BUSINESS = {
    "@context": "https://schema.org", "@type": "LocalBusiness", "name": "Onyx Media",
    "legalName": "ONYX HTZ LLC", "telephone": PHONE_TEL, "url": SITE_URL + "/",
    "address": {"@type": "PostalAddress", "addressLocality": "St. Charles", "addressRegion": "MO", "addressCountry": "US"},
    "areaServed": [f"{c['name']}, MO" for c in CITIES],
    "description": "Video production, monthly social content and paid advertising for home service and automotive businesses.",
}
if EMAIL:
    BUSINESS["email"] = EMAIL

def faq_ld(items): return ld({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
    {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a, _ in items]})

def faq_html(items):
    out = '<div class="faq">'
    for q, a, confirm in items:
        out += f'<details><summary>{e(q)}</summary><div class="ans"><p>{e(a)}</p>' + \
               ('<span><span class="tag">CONFIRM WITH MAX</span></span>' if confirm else "") + "</div></details>"
    return out + "</div>"

def head(title, desc, path, extra=""):
    robots = "index,follow" if INDEXABLE else "noindex,nofollow"
    canon = SITE_URL + "/" + ("" if path == "index.html" else path)
    return f"""<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<meta name="robots" content="{robots}">
<link rel="canonical" href="{canon}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:type" content="website">
<meta property="og:image" content="{SITE_URL}/media/max-on-set-wide.webp">
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=JetBrains+Mono:wght@500&display=swap">
<link rel="stylesheet" href="assets/site.css">
{extra}"""

def header(active):
    links = "".join(f'<a href="{h}"' + (' aria-current="page"' if h == active else "") + f'>{e(t)}</a>' for h, t in NAV)
    drawer = "".join(f'<a href="{h}">{TRI}{e(t)}</a>' for h, t in NAV)
    return f"""<div class="proto caption"><div class="wrap"><span><b>Prototype</b> · Not live on onyxmediastl.com</span><span>[X] and dashed boxes = details still needed</span></div></div>
<header class="site"><div class="wrap bar">
  <a class="logo" href="./" aria-label="Onyx Media home"><img src="media/logo-dark.webp" alt="Onyx Media" width="128" height="53"></a>
  <nav class="main" aria-label="Main">{links}<a class="btn primary" href="contact.html">Get Pricing {TRI}</a></nav>
  <button class="menu-btn" id="menuBtn" aria-expanded="false" aria-controls="drawer">MENU</button>
</div>
<div class="wrap drawer" id="drawer" hidden>{drawer}<a class="btn primary" href="contact.html">Get Pricing {TRI}</a></div>
</header>"""

def footer():
    areas = "".join(f'<li><a href="{city_file(c["slug"])}">{e(c["name"])}</a></li>' for c in CITIES)
    return f"""<div class="callbar" id="callbar"><a class="btn primary" href="contact.html">Get pricing {TRI}</a><span class="callbar-num"><span class="caption">Call / text</span><strong>{PHONE}</strong></span></div>
<footer class="site"><div class="wrap">
  <div class="foot-grid">
    <div class="stack" style="gap:14px"><a class="logo" href="./"><img src="media/logo-light.webp" alt="Onyx Media" width="150" height="62"></a>
      <address class="nap"><span>Onyx Media · St. Charles, MO</span><span>Video, monthly content and paid ads for home service and automotive businesses</span><span>{PHONE} · {e(EMAIL_SHOWN)}</span></address></div>
    <div><h4>Services</h4><ul><li><a href="content-creation.html">Monthly content</a></li><li><a href="paid-advertising.html">Paid advertising</a></li><li><a href="work.html">Work</a></li><li><a href="about.html">About</a></li><li><a href="contact.html">Contact</a></li></ul></div>
    <div><h4>Follow</h4><ul><li><a href="https://www.facebook.com/Onyxhtz/">Facebook</a></li><li><span>Instagram [link]</span></li><li><span>YouTube [link]</span></li><li><span>Google reviews [link]</span></li></ul></div>
    <div><h4>Areas we serve</h4><ul style="grid-template-columns:1fr 1fr;column-gap:16px">{areas}</ul></div>
  </div>
  <div class="legal caption"><span>© 2026 ONYX HTZ LLC</span><span>Privacy Policy · Terms</span></div>
</div></footer>"""

def page(path, title, desc, body, active=None, extra_head="", fragment=False):
    h = head(title, desc, path, extra_head)
    rest = header(active) + "\n<main>\n" + body + "\n</main>\n" + footer() + '\n<script src="assets/site.js"></script>\n'
    if fragment:
        return h + "\n" + rest
    return ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            + h + "\n</head>\n<body>\n" + rest + "</body>\n</html>\n")

# ---------------------------------------------------------------- forms
BIZ_OPTIONS = ["HVAC", "Plumbing", "Electrical", "Roofing & exteriors", "Remodeling", "Landscaping & outdoor",
               "Garage doors", "Pest control", "Auto repair / service", "Dealership", "Detailing, tint & wrap",
               "Body / collision", "Other"]

def quote_card(form_name, heading="Get your pricing", sub=None, preselect="Monthly content"):
    opts = "".join(f"<option>{e(o)}</option>" for o in BIZ_OPTIONS)
    need = "".join(f'<label><input type="radio" name="need" value="{v}"' + (" checked" if v == preselect else "") + f'><span>{v}</span></label>'
                   for v in ["Monthly content", "Paid ads", "Both", "Not sure"])
    sub = sub or "Tell us what you need. Max texts you pricing and a time for a 15-minute call."
    return f"""<form class="quote-card js-lead" name="{form_name}" method="POST" data-netlify="true" netlify-honeypot="bot-field" action="thank-you.html" novalidate>
  <input type="hidden" name="form-name" value="{form_name}">
  <p class="hp"><label>Leave this empty <input name="bot-field" tabindex="-1"></label></p>
  <h2 class="display-m">{e(heading)}</h2>
  <p class="form-note">{e(sub)}</p>
  <div class="price-lines"><div><span>Monthly content</span><strong>from {PRICE_CONTENT}</strong></div><div><span>Paid advertising</span><strong>from {PRICE_ADS}</strong></div></div>
  <fieldset class="choice"><legend>What do you need?</legend>{need}</fieldset>
  <div class="fields two">
    <div class="field full"><label for="{form_name}-biz">Your business</label><select id="{form_name}-biz" name="business_type">{opts}</select></div>
    <div class="field"><label for="{form_name}-name">Name <span class="req">*</span></label><input id="{form_name}-name" name="name" autocomplete="name" required></div>
    <div class="field"><label for="{form_name}-phone">Mobile <span class="req">*</span></label><input id="{form_name}-phone" name="phone" type="tel" autocomplete="tel" required></div>
    <div class="field full"><label for="{form_name}-email">Email <span class="req">*</span></label><input id="{form_name}-email" name="email" type="email" autocomplete="email" required></div>
  </div>
  <p class="err" hidden>Add your name, a 10-digit mobile number and a full email address.</p>
  <button class="btn primary" type="submit">Get my pricing {TRI}</button>
  <p class="form-note">Free 15-minute call. No pitch deck. Or call/text {PHONE}.</p>
</form>"""

def contact_form():
    opts = "".join(f"<option>{e(o)}</option>" for o in BIZ_OPTIONS)
    return f"""<form class="quote-card js-lead" name="contact" method="POST" data-netlify="true" netlify-honeypot="bot-field" action="thank-you.html" novalidate>
  <input type="hidden" name="form-name" value="contact">
  <p class="hp"><label>Leave this empty <input name="bot-field" tabindex="-1"></label></p>
  {eyebrow("Send 5 quick details")}
  <div class="fields two">
    <div class="field"><label for="c-name">Name <span class="req">*</span></label><input id="c-name" name="name" autocomplete="name" required></div>
    <div class="field"><label for="c-email">Email <span class="req">*</span></label><input id="c-email" name="email" type="email" autocomplete="email" required></div>
    <div class="field"><label for="c-phone">Mobile <span class="req">*</span></label><input id="c-phone" name="phone" type="tel" autocomplete="tel" required></div>
    <div class="field"><label for="c-company">Company</label><input id="c-company" name="company" autocomplete="organization"></div>
    <div class="field full"><label for="c-biz">Your business</label><select id="c-biz" name="business_type">{opts}</select></div>
  </div>
  <details class="more"><summary>Add more details (optional)</summary><div class="fields two">
    <div class="field"><label for="c-need">Service</label><select id="c-need" name="need"><option>Monthly content</option><option>Paid ads</option><option>Both</option><option>Brand / commercial video</option><option>Not sure</option></select></div>
    <div class="field"><label for="c-size">Trucks or bays</label><select id="c-size" name="size"><option>1–2</option><option>3–5</option><option>6–15</option><option>16+</option></select></div>
    <div class="field"><label for="c-budget">Monthly budget</label><select id="c-budget" name="budget"><option>Not sure yet</option><option>Under $1,000</option><option>$1,000–$2,500</option><option>$2,500–$5,000</option><option>$5,000+</option></select></div>
    <div class="field"><label for="c-time">Timeline</label><select id="c-time" name="timeline"><option>Within 2 weeks</option><option>This month</option><option>Before busy season</option><option>Just exploring</option></select></div>
    <div class="field full"><label for="c-site">Website</label><input id="c-site" name="website" type="url" placeholder="https://"></div>
    <div class="field full"><label for="c-msg">What do you want more of?</label><textarea id="c-msg" name="message" placeholder="More install jobs, fuller bays, fewer price shoppers…"></textarea></div>
  </div></details>
  <p class="err" hidden>Add your name, a 10-digit mobile number and a full email address.</p>
  <button class="btn primary" type="submit">Book my 15-minute call {TRI}</button>
</form>"""

# ---------------------------------------------------------------- sections
def hero():
    if HERO_VIDEO:
        media = f'<video autoplay muted loop playsinline poster="media/{SLIDES[0][0]}.webp"><source src="{HERO_VIDEO}" type="video/mp4"></video>'
    else:
        media = "".join(f'<img class="slide' + (" on" if i == 0 else "") + f'" src="media/{f}.webp" alt="" data-cap="{e(c)}"' + ("" if i == 0 else ' loading="lazy"') + ">"
                        for i, (f, a, c) in enumerate(SLIDES))
    strip = "".join(f"<li>{e(t)}</li>" for t in ["HVAC", "Plumbing", "Roofing", "Electrical", "Remodeling", "Landscaping", "Garage doors", "Auto repair", "Dealerships", "Detailing", "Body shops"])
    return f"""<section class="hero">
  <div class="hero-media" aria-hidden="true">{media}</div><div class="hero-scrim"></div>
  <div class="wrap hero-grid">
    <div class="stack" style="gap:24px">
      {eyebrow("Home service & automotive video · St. Louis")}
      <h1 class="display-xl">More <span class="rot" id="rot"><span class="rot-word">{ROTATE[0]}</span></span> from the work you already do.</h1>
      <p class="lead">We film your crew on real jobs, turn it into a month of content, and run the ads that make the phone ring. One local team for home service companies and auto shops across St. Louis and St. Charles County.</p>
      <ul class="quick"><li>{TRI}15-minute call</li><li>{TRI}Free, no pitch deck</li><li>{TRI}Leave with 3 video ideas</li></ul>
    </div>
    {quote_card("quick-quote")}
  </div>
  <div class="slide-cap caption" aria-hidden="true">{TRI}<span id="slideCap">{e(SLIDES[0][2])}</span></div>
</section>
<div class="strip" aria-label="Industries we serve"><div class="wrap"><ul>{strip}</ul></div></div>"""

def client_wall(head_text="Businesses we've filmed for"):
    return f"""<section class="band"><div class="wrap">{eyebrow(head_text)}
<ul class="clients">{"".join(f"<li>{e(c)}</li>" for c in CLIENTS)}</ul></div></section>"""

def service_cards():
    return f"""<div class="grid-2">
  <a class="card feature" href="content-creation.html">{eyebrow("Monthly content creation")}
    <h3 class="display-m">Show up every week without lifting a camera.</h3>
    <p>One shoot day a month becomes a month of reels, edited, captioned and posted for you.</p>
    {ticks(["[X] reels per month for Reels, TikTok and Shorts", "Captions, hooks and a posting schedule", "Monthly report on what brought in calls"])}
    <div class="foot"><span class="price">From {PRICE_CONTENT}</span><span>See the plan →</span></div></a>
  <a class="card feature" href="paid-advertising.html">{eyebrow("Paid advertising")}
    <h3 class="display-m">Turn your best video into booked jobs.</h3>
    <p>Meta and Google ads built from the footage we shoot, aimed at the ZIP codes your customers live in.</p>
    {ticks(["Campaign setup, targeting and tracking", "Fresh creative tested every month", "Every lead to your email and a Google Sheet"])}
    <div class="foot"><span class="price">From {PRICE_ADS}</span><span>See how it works →</span></div></a>
</div>
<p class="muted" style="margin-top:20px">Also available: brand and commercial video, recruiting video, and strategy sessions. Ask on your call.</p>"""

def trades():
    return '<div class="trades">' + "".join(f'<div class="trade">{TRI}<h3>{e(t)}</h3><p>{e(d)}</p></div>' for t, d in TRADES) + "</div>"

def gallery():
    return '<div class="gallery">' + "".join(
        f'<figure class="{cls}"><img src="media/{f}.webp" alt="{e(a)}" loading="lazy"><figcaption class="caption">{TRI}{e(c)}</figcaption></figure>'
        for f, a, c, cls in GALLERY) + "</div>"

def case_html(c):
    return f"""<article class="case" data-f="{' '.join(c['f'])}">
  <div class="thumb"><img src="media/{c['img']}.webp" alt="{e(c['alt'])}" loading="lazy">{TRI}</div>
  {eyebrow(c['tag'])}<h3 class="display-m">{e(c['title'])}</h3>
  <dl><div><dt>Problem</dt><dd>{e(c['problem'])}</dd></div><div><dt>What we made</dt><dd>{e(c['made'])}</dd></div><div><dt>Result</dt><dd class="result">{e(c['result'])}</dd></div></dl>
</article>"""

def step_grid(data):
    return '<div class="steps">' + "".join(f'<div class="step"><span class="n">0{i+1}</span><h3>{e(t)}</h3><p>{e(d)}</p></div>' for i, (t, d) in enumerate(data)) + "</div>"

def steps():
    return step_grid([("Call", "A 15-minute call about your business, your area and what's bringing in work now."),
                      ("Plan", "We map 90 days around your season: what to film and where the ads run."),
                      ("Shoot", "A half-day on real jobs or in the shop. Your crew keeps working."),
                      ("Post & optimize", "Reels go out on schedule, ads launch, and every month we keep what brings in calls.")])

def reviews():
    if REVIEWS:
        cards = "".join(f'<figure class="card" style="margin:0"><span class="hl" aria-label="{s} out of 5 stars">{"★" * s}</span><blockquote style="margin:0;font-size:19px;line-height:1.5">“{e(q)}”</blockquote><figcaption class="caption muted">{e(n)} · {e(b)}</figcaption></figure>'
                        for q, n, b, s in REVIEWS[:6])
    else:
        cards = "".join('<div class="slot" style="min-height:180px">Google review · real text, name and stars go here</div>' for _ in range(3))
    return f"""<section class="band bone"><div class="wrap">
  <div class="band-head"><div class="stack">{eyebrow("Google reviews")}<h2 class="display-l">From the owners.</h2></div>
  <p class="body-l">Real reviews from real clients. <span class="tag">Rating: [X.X] ★ from [N] Google reviews</span></p></div>
  <div class="grid-3">{cards}</div>
  <div class="btns" style="margin-top:24px"><a class="btn text" href="#">Read all reviews on Google [link]</a></div>
</div></section>"""

def about_teaser():
    return f"""<section class="band"><div class="wrap about">
  <figure class="max-photo"><img src="media/max-fisher-on-set.webp" alt="Max Fisher filming an engine bay with a gimbal-mounted camera" width="900" height="900" loading="lazy"><figcaption class="caption">{TRI}Max Fisher · Owner, Onyx Media</figcaption></figure>
  <div class="stack" style="gap:22px">{eyebrow("About")}<h2 class="display-l">Owner-run. On every shoot.</h2>
    <p class="body-l">I'm Max Fisher. I started Onyx Media in St. Charles to give home service companies and auto shops the kind of video and ads the big brands get, without the agency layers.</p>
    <div class="facts"><div><strong>St. Charles</strong><span>Based here, shooting across the metro</span></div><div><strong>1 shoot day</strong><span>Covers a month of content</span></div><div><strong>16+</strong><span>Local businesses filmed</span></div></div>
    <div class="btns"><a class="btn text" href="about.html">More about Onyx</a></div></div>
</div></section>"""

def areas_block(exclude=None):
    items = "".join(f'<li><a href="{city_file(c["slug"])}">{TRI}{e(c["name"])}</a></li>' for c in CITIES if c["slug"] != exclude)
    return f"""<section class="band bone" id="areas"><div class="wrap">
  <div class="band-head"><div class="stack">{eyebrow("Areas we serve")}<h2 class="display-l">Local to St. Charles County and beyond.</h2></div>
  <p class="body-l">We drive to you. Shoots happen on your job sites, in your shop or on your lot.</p></div>
  <ul class="areas">{items}</ul></div></section>"""

def cta_band(h="Let's fill your schedule.", p="15 minutes. We'll look at what you're posting now, what the competition in your area is doing, and what we'd film first."):
    return f"""<section class="cta-band"><div class="cta-pattern" aria-hidden="true"></div><div class="wrap">
  {eyebrow("Free 15-minute call")}<h2 class="display-xl">{e(h)}</h2><p>{e(p)}</p>
  <div class="btns"><a class="btn dark" href="contact.html">Get My Pricing {TRI}</a><a class="btn secondary" href="work.html">See Our Work</a></div>
</div></section>"""

def section(title_eyebrow, h2, lead, inner, cls="band"):
    lead_html = f'<p class="body-l">{e(lead)}</p>' if lead else "<span></span>"
    return f"""<section class="{cls}"><div class="wrap">
  <div class="band-head"><div class="stack">{eyebrow(title_eyebrow)}<h2 class="display-l">{e(h2)}</h2></div>{lead_html}</div>
  {inner}</div></section>"""

def page_head(eb, h1, lead, crumbs=None, form=None):
    cr = f'<p class="crumbs"><a href="./">Home</a> / {e(crumbs)}</p>' if crumbs else ""
    left = f'<div class="stack" style="gap:20px">{cr}{eyebrow(eb)}<h1 class="display-l">{e(h1)}</h1><p class="body-l">{e(lead)}</p></div>'
    return f'<section class="page-head' + (" with-form" if form else "") + f'"><div class="wrap">{left}{form or ""}</div></section>'

# ---------------------------------------------------------------- pages
def home(fragment=False):
    body = hero() + client_wall() + \
        section("Services", "Two ways we bring in work.", "Most clients run both: content that builds trust, and ads that put it in front of buyers.", service_cards(), "band bone") + \
        section("Who we work with", "Built for the trades and the shop floor.", "Owner-led home service companies and automotive businesses. We know your busy season and your slow one.", trades()) + \
        section("Recent shoots", "Shot on real jobs.", "On the roof, in the yard, on the lot. We film where the work happens.", gallery(), "band bone") + \
        section("Featured work", "What we made and what it did.", "Every project starts with a business problem.",
                '<div class="cases">' + "".join(case_html(c) for c in CASES[:3]) + '</div><div class="btns" style="margin-top:28px"><a class="btn secondary" href="work.html">See all work</a></div>') + \
        reviews() + \
        section("How it works", "Four steps. No runaround.", "You always know what's next and when it ships.", steps()) + \
        about_teaser() + areas_block() + \
        section("FAQ", "Straight answers.", "If yours isn't here, ask it on the call.", faq_html(HOME_FAQ)) + cta_band()
    return page("index.html", "Onyx Media | Video & Paid Ads for Home Service and Auto Businesses in St. Louis",
                "St. Charles video production, monthly social content and paid ads for home service companies and automotive shops across St. Louis.",
                body, active=None, extra_head=ld(BUSINESS) + faq_ld(HOME_FAQ), fragment=fragment)

CONTENT_FAQ = [
    ("What do I get each month?", "A planned shoot day, [X] edited short-form videos, captions, a posting schedule and a monthly report.", True),
    ("Do you post for us?", "Yes. We schedule and post to Instagram, Facebook, TikTok and YouTube Shorts, or hand files to your team if you prefer.", False),
    ("Who has to be on camera?", "Usually the owner and a tech or two. We coach you through it; most people get comfortable within the first shoot.", False),
    ("How fast is turnaround?", "First edits within [X] business days of the shoot.", True),
]

def content_page():
    pkgs = f"""<div class="pkg">
  <div><span class="eyebrow">Starter</span><p class="display-m">$[X]/mo</p>{ticks(["1 shoot day", "[X] reels", "Captions + posting"])}</div>
  <div class="best"><span class="badge">Most popular</span><span class="eyebrow">Growth</span><p class="display-m">$[X]/mo</p>{ticks(["1 shoot day", "[X] reels + photos", "Posting + monthly report", "Ad-ready cuts"])}</div>
  <div><span class="eyebrow">Full system</span><p class="display-m">$[X]/mo</p>{ticks(["2 shoot days", "[X] reels + photos", "Paid ads managed", "Monthly strategy call"])}</div>
</div>"""
    split = f"""<div class="split"><figure><img src="media/max-on-set-wide.webp" alt="Filming an engine bay on a gimbal" loading="lazy"></figure>
<div class="stack">{eyebrow("A shoot day")}<h2 class="display-l">Half a day. A month of content.</h2>
{ticks(["We send a shot list a week ahead", "We film on real jobs, in the shop or on the lot", "Owner and tech talking-heads in about 30 minutes", "Your crew keeps working the whole time"])}</div></div>"""
    body = page_head("Monthly content creation", "Show up every week without lifting a camera.",
                     "One shoot day a month turns into a month of short-form video for your home service or auto business: planned, filmed, edited, captioned and posted.",
                     "Monthly content", quote_card("content-quote", preselect="Monthly content")) + \
        section("What you get", "Everything, done for you.", "You run the business. We make sure people see it.",
                ticks(["Monthly planning around your season and offers", "One shoot day on your job sites or in your shop", "[X] edited reels for Reels, TikTok and YouTube Shorts",
                       "Captions, hooks and on-screen text", "Scheduling and posting", "A monthly report on views, followers and calls"])) + \
        f'<section class="band bone"><div class="wrap">{split}</div></section>' + \
        section("Plans", "Monthly content plans.", "Final counts and prices to be confirmed.", pkgs) + \
        section("FAQ", "Monthly content questions.", "", faq_html(CONTENT_FAQ), "band bone") + cta_band()
    return page("content-creation.html", "Monthly Social Media Content for Contractors & Auto Shops | Onyx Media St. Louis",
                "Monthly short-form video content for home service and automotive businesses in St. Louis and St. Charles County. One shoot day, a month of reels.",
                body, "content-creation.html", extra_head=faq_ld(CONTENT_FAQ))

ADS_FAQ = [
    ("Which platforms do you run?", "Meta (Facebook and Instagram) and Google. We pick based on how your customers search for you.", False),
    ("How much should I spend on ads?", "It depends on your market and goals. We recommend a starting ad budget on the call; ad spend is paid directly to the platform.", False),
    ("How do I know it's working?", "Every lead goes to your email and a Google Sheet, and we report cost per lead and booked calls monthly.", False),
    ("Do I need to be on a content plan?", "No, but ads perform best with fresh creative. Most clients run both.", False),
]

def ads_page():
    steps_ads = step_grid([("Set up", "Ad accounts, pixel and conversion tracking, done right the first time."),
                           ("Target", "The ZIP codes and customers you actually want, not everyone."),
                           ("Create", "Ads cut from real footage of your crew, shop and finished work."),
                           ("Improve", "Monthly testing: keep what books calls, cut what doesn't.")])
    cases = '<div class="cases two">' + "".join(case_html(c) for c in CASES if "ads" in c["f"]) + "</div>"
    body = page_head("Paid advertising", "Turn your best video into booked jobs.",
                     "Meta and Google ads for home service companies and auto shops, built from footage of your real work and tracked to calls and form fills.",
                     "Paid advertising", quote_card("ads-quote", preselect="Paid ads")) + \
        section("How it works", "Ads that look like your business.", "Generic stock ads get scrolled past. Your own crew doesn't.", steps_ads) + \
        section("What you get", "Clear numbers every month.", f"Management from {PRICE_ADS}.",
                ticks(["Campaign setup and conversion tracking", "Service-area targeting by ZIP code", "New creative from our shoots every month",
                       "Every lead sent to your email and a Google Sheet", "Monthly report: spend, cost per lead, booked calls"]), "band bone") + \
        section("Ad work", "Recent ad clients.", "Results are being added as clients approve them.", cases) + \
        section("FAQ", "Paid ads questions.", "", faq_html(ADS_FAQ), "band bone") + cta_band()
    return page("paid-advertising.html", "Facebook & Google Ads for Contractors & Auto Shops | Onyx Media St. Louis",
                "Paid ad management for home service and automotive businesses in St. Louis and St. Charles County, built from real video of your work.",
                body, "paid-advertising.html", extra_head=faq_ld(ADS_FAQ))

def work_page():
    chips = "".join(f'<button class="chip" aria-pressed="' + ("true" if k == "all" else "false") + f'" data-f="{k}">{t}</button>'
                    for k, t in [("all", "All"), ("social", "Social content"), ("ads", "Paid ads")])
    body = page_head("Work", "Problem. What we made. Result.", "Every case study names the business problem first, because that's how every project starts.", "Work") + \
        f'<section class="band"><div class="wrap"><div class="filters" role="group" aria-label="Filter work">{chips}</div><div class="cases two" id="work-cases">' + \
        "".join(case_html(c) for c in CASES) + "</div></div></section>" + \
        section("Recent shoots", "More from the field.", "Roofs, kennels, job sites, studios and service bays.", gallery(), "band bone") + \
        client_wall() + cta_band()
    return page("work.html", "Our Work | Video & Ads for Local Businesses | Onyx Media St. Louis",
                "Case studies and recent shoots from Onyx Media: social content and paid ads for home service and automotive businesses.", body, "work.html")

def about_page():
    body = page_head("About", "A St. Charles studio for St. Louis trades and shops.", "Onyx Media is Max Fisher's studio. We film, edit and run ads for home service companies and automotive businesses.", "About") + \
        f"""<section class="band"><div class="wrap about">
  <figure class="max-photo"><img src="media/max-fisher-on-set.webp" alt="Max Fisher filming an engine bay with a gimbal-mounted camera" width="900" height="900"><figcaption class="caption">{TRI}Max Fisher · Owner, Onyx Media</figcaption></figure>
  <div class="stack" style="gap:20px"><p class="muted">[PLACEHOLDER: Max's story, 2 short paragraphs.]</p>
    <h2 class="heading">How we work</h2><p class="muted">The person who plans your shoot is the person behind the camera and the person reading your ad numbers. Nothing gets lost between teams, because there's only one.</p>
    <h2 class="heading">Why the trades</h2><p class="muted">We shoot around your schedule, on real jobs, so your crew keeps working while we roll. Homeowners trust what they can see: your trucks, your techs, your finished work.</p>
    <h2 class="heading">Why automotive</h2><p class="muted">We understand how shops and dealers sell: trust in the tech, transparency on the repair, and the car looking its best on camera.</p>
    <p class="form-note">Onyx Media is a brand of ONYX HTZ LLC. Paid advertising is delivered through Onyx Performance Advertising.</p>
    <div class="btns"><a class="btn primary" href="contact.html">Get Pricing {TRI}</a></div></div>
</div></section>""" + client_wall() + cta_band()
    return page("about.html", "About Onyx Media | Max Fisher | St. Charles, MO", "Onyx Media is an owner-run video and paid ads studio in St. Charles, MO, for home service and automotive businesses.", body, "about.html")

def contact_page():
    body = page_head("Contact", "Get pricing and book a 15-minute call.", "Pick a time, or send five quick details and Max will text you pricing within one business day.", "Contact") + \
        f"""<section class="band"><div class="wrap book">
  <div class="stack">{eyebrow("Fastest: pick a time")}<div class="slot">Scheduler embed · 15-minute slots<br>Calendly / Cal.com / Google booking: tool to be confirmed</div>
  <address class="nap muted"><strong style="color:var(--ink)">Onyx Media</strong><span>St. Charles, MO · Serving the St. Louis metro</span><span>Call or text {PHONE}</span><span>{e(EMAIL_SHOWN)}</span></address></div>
  {contact_form()}
</div></section>"""
    return page("contact.html", "Get Pricing | Onyx Media St. Louis", "Get pricing for monthly video content and paid ads, and book a free 15-minute call with Onyx Media.", body, "contact.html")

def thanks_page():
    body = f"""<section class="band"><div class="wrap stack" style="gap:22px">{eyebrow("Received")}<h1 class="display-l">Got it. Here's what happens next.</h1>
<ol class="muted" style="display:grid;gap:10px;padding-left:20px;margin:0"><li>Max reviews your details today and texts you pricing within one business day.</li><li>You'll get a link to book your 15-minute call if you haven't already.</li><li>Before the call we look at your site, your Google profile and your competitors.</li></ol>
<p class="form-note">Conversion events (GA4 + Meta) fire on this page once tracking is installed.</p>
<div class="btns"><a class="btn secondary" href="work.html">See Our Work</a></div></div></section>"""
    return page("thank-you.html", "Thanks | Onyx Media", "Thanks for reaching out to Onyx Media.", body)

def city_page(c):
    n = c["name"]
    faq = [(f"Do you film in {n}?", f"Yes. We shoot on location in {n} and across {c['county']}. Our studio is in St. Charles.", False),
           (f"What kinds of {n} businesses do you work with?", "Home service companies (HVAC, plumbing, roofing, remodeling, landscaping, garage doors, pest control) and automotive businesses (repair shops, dealers, detailers, body shops).", False),
           ("How much does it cost?", f"Monthly content starts at {PRICE_CONTENT}; paid ads management starts at {PRICE_ADS}. You get a fixed quote after a 15-minute call.", True),
           ("How fast can you start?", "Most clients have their first shoot within [X] weeks of the call.", True)]
    near = "".join(f'<li><a href="{city_file(s)}">{TRI}{e(CITY_BY_SLUG[s]["name"])}</a></li>' for s in c["near"])
    schema = {**BUSINESS, "areaServed": {"@type": "City", "name": f"{n}, MO"}}
    body = page_head(f"{n}, MO", f"Video production & social media marketing in {n}, MO.", c["intro"], n,
                     quote_card(f"city-{c['slug']}", heading=f"Pricing for {n} businesses")) + \
        section(f"Why video in {n}", f"Be the {n} company people call first.", c["local"], service_cards()) + \
        section(f"Who we work with in {n}", "Trades, crews and shops.", f"We film {n} businesses on their own job sites, in their shops and on their lots.", trades(), "band bone") + \
        section("Recent shoots", "Shot on real jobs.", "A sample of our work around the area.", gallery()) + \
        section("How it works", "Four steps. No runaround.", "", steps(), "band bone") + \
        f"""<section class="band"><div class="wrap"><div class="band-head"><div class="stack">{eyebrow("Nearby")}<h2 class="display-l">We also serve.</h2></div><p class="body-l">Close to {e(n)} and on our regular routes.</p></div><ul class="areas">{near}<li><a href="./#areas">{TRI}All areas</a></li></ul></div></section>""" + \
        section("FAQ", f"{n} questions.", "", faq_html(faq), "band bone") + cta_band(f"Let's fill your schedule in {n}.")
    return page(city_file(c["slug"]), f"Video Production & Social Media Marketing in {n}, MO | Onyx Media",
                f"Video production, monthly social content and paid ads for home service and automotive businesses in {n}, MO. Local team based in St. Charles.",
                body, None, extra_head=ld(schema) + faq_ld(faq))

# ---------------------------------------------------------------- write
def main():
    OUT.mkdir(exist_ok=True); ART.mkdir(exist_ok=True)
    pages = {"index.html": home(), "content-creation.html": content_page(), "paid-advertising.html": ads_page(),
             "work.html": work_page(), "about.html": about_page(), "contact.html": contact_page(), "thank-you.html": thanks_page()}
    for c in CITIES:
        pages[city_file(c["slug"])] = city_page(c)
    for name, text in pages.items():
        (OUT / name).write_text(text)
    (ART / "artifact-index.html").write_text(home(fragment=True))
    urls = "".join(f"<url><loc>{SITE_URL}/" + ("" if p == "index.html" else p) + "</loc></url>" for p in pages if p != "thank-you.html")
    (OUT / "sitemap.xml").write_text(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>\n')
    (OUT / "robots.txt").write_text(("User-agent: *\nAllow: /\n" if INDEXABLE else "User-agent: *\nDisallow: /\n") + f"Sitemap: {SITE_URL}/sitemap.xml\n")
    print(f"built {len(pages)} pages")

if __name__ == "__main__":
    main()

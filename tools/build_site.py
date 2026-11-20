#!/usr/bin/env python3
"""Build the Onyx Media static site into prototype/.

Every page is assembled from the shared pieces below (head, header, footer,
forms, cards). To add a city page, a case study or a review, edit the data
lists near the top and run:  python3 tools/build_site.py

The public contact email is read from tools/contact-email.txt (one line), or
from the ONYX_CONTACT_EMAIL environment variable, so it is not typed into this script.

Outputs:
  prototype/*.html          full pages for Netlify (publish directory: prototype)
  prototype/sitemap.xml, robots.txt
  build/artifact-index.html the home page as a fragment, for the Claude preview link
"""
import html, json, os, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from industries import INDUSTRIES, GROUPS
from cities import EXTRA_CITIES, CITY_FOCUS, CITY_NOTE

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "prototype"
ART = ROOT / "build"

# ---------------------------------------------------------------- settings
SITE_URL = "https://onyxmediastl.com"
INDEXABLE = True
PHONE = "636.385.3995"
PHONE_TEL = "+16363853995"
_contact_file = pathlib.Path(__file__).resolve().parent / "contact-email.txt"
EMAIL = os.environ.get("ONYX_CONTACT_EMAIL", "").strip() or (_contact_file.read_text().strip() if _contact_file.exists() else "")
EMAIL_SHOWN = EMAIL or "[contact email]"
CALENDLY_URL = "https://calendly.com/max-onyxmediastl/30min"   # e.g. "https://calendly.com/onyxmediastl/15min" — paste Max's 30-minute event link here
HERO_VIDEO = None      # e.g. "media/hero-loop.mp4" — when set, plays instead of the photo slideshow

# ---------------------------------------------------------------- data
CLIENTS = ["Victory Raceway", "Cool Touch Graphics", "Mountain Top Motor Company", "Mountain Top Service Center",
           "Vitale Law Firm", "Almost Home Kennels", "Gorilla Roofing", "K9 Kamp", "Kimco Concrete",
           "Midnight Motorsports", "Mission's Upholstery", "Timberland Band", "Trailblaze Media", "Wies Offsite",
           "Meyer & Company Real Estate & Auctions", "Detail 360", "Hovis Racing", "McKenzie Chiropractic"]

# Real Google reviews only, as the reviewer wrote them: (quote, reviewer name, business, stars or None).
# Square brackets mark an editorial change to the reviewer's words.
REVIEWS = [
    ("Media has always been a big investment for our company and we have worked with several photographers, videographers, and content creators. Max has by far shined above anyone else we've worked with. He is fair, honest, punctual, and easy to work with. We have done years of media with him now and have yet to be disappointed once.\n\nMax has the Detail 360 stamp of approval for sure!!!\n\nOnyx Media absolutely rocks!!!",
     "Brian Sieveking", "Detail 360", 5),
    ("Max and Onyx media has been a pinnacle of our racing team. He is in the process of taking us from a local racing team to a nationally known motorsports team. He is the best in the business.",
     "Ethan Hovis", "Hovis Racing", 5),
    ("I highly recommend [Onyx Media] for all your media needs. The owner, Max, is very professional and helpful. I have used his service twice now, and was blown out of the water each time with how well he conducted business and the quality of his work. Whether it is coming up with ideas for content, or capturing the uniqueness to your story, Max has your best interest at heart. Give [Onyx Media] a call, you won’t be disappointed!",
     "Shawn McKenzie", "McKenzie Chiropractic", 5),
    ("This media production company is top-notch! Max was awesome and such a pleasure to work with! We got some awesome footage and video of some amazing cars, and we couldn't have done this or created some stellar images without him and his media production company! If you're looking to spice up your marketing with NEXT-LEVEL photos and video, then look no further than Onyx Media STL! Great job, and thank you.",
     "Joshua Fletcher", "Trailblaze Productions", 5),
    ("Max is amazing!! Not only is he personable, but he has an eye on how to make your business, vehicle, etc. stand out in a crowd with the photography and videography that he provides!!",
     "Heather Patterson", "Detail 360", 5),
]
INSTAGRAM = "https://www.instagram.com/onyxmediastl/"
GOOGLE_REVIEW = "https://g.page/r/CQYfHVSfUBVMEAE/review"

ROTATE = ["service calls", "full bays", "booked jobs", "install jobs", "repair orders"]

SLIDES = [  # (file, alt, caption)  — no client names on photos
    ("max-on-set-wide", "Filming an engine bay on a gimbal", "On set · automotive"),
    ("roof-drone-overhead", "Drone view of a roof replacement in progress", "Roof replacement · drone"),
    ("kennel-play-yard", "Dogs playing in a kennel's play yard", "Kennel · play yard"),
    ("gorilla-crew-on-roof", "Roofing crew working on a steep roof", "Crew on the roof"),
    ("neighborhood-aerial", "Aerial view of a home and neighborhood", "Neighborhood aerial"),
    ("mtsc-service-bays", "Auto shop service bays with vehicles on lifts", "Service bays · automotive"),
]

TRADES = [  # (title, text, industry slug)
    ("HVAC & plumbing", "Fill the schedule before the first cold snap and the first heat wave.", "hvac"),
    ("Roofing & exteriors", "Win storm season with proof on the roof, not just yard signs.", "roofing"),
    ("Remodeling", "Before-and-after video that sells the bigger kitchen, bath or basement.", "remodeling"),
    ("Landscaping & outdoor", "Book spring installs in February with the crews homeowners already see.", "landscaping"),
    ("Garage doors & pest", "Be the first name a homeowner trusts when something breaks or bites.", "garage-doors"),
    ("Automotive", "Repair shops, dealers, detailers, tint and wrap, body shops. Fill the bays.", "auto-repair"),
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

CASES = [  # filters: social, ads. No client names on photos or titles.
    dict(f=["social"], title="Dog training company", tag="Social content", img="k9kamp-owner",
         alt="Business owner smiling in front of his company van",
         problem="A dog trainer whose results speak for themselves, but whose feed didn't show them.",
         made="Talking-head reels with the owner, filmed during real training sessions with the dogs."),
    dict(f=["social", "ads"], title="Roofing contractor", tag="Roofing · social + ads", img="gorilla-crew-on-roof",
         alt="Roofing crew installing underlayment on a steep roof",
         made="Crew-on-the-roof video, drone footage of tear-offs and finished roofs, and Meta ad creatives built from it."),
    dict(f=["social", "ads"], title="Auto service center", tag="Automotive · social + ads", img="mtsc-service-bays",
         alt="Auto shop with vehicles on lifts in the service bays",
         made="Photo and video in the shop and service bays, used for social content and Meta ads."),
    dict(f=["ads"], title="Chiropractic table upholsterer", tag="Paid ads", img="upholstery-owners",
         alt="Husband-and-wife owners of an upholstery business standing outdoors",
         made="Paid ad campaigns for a specialty service, supported by photo content of the owners and their work."),
]

HOME_FAQ = [
    ("How much does it cost?", "Monthly content plans are $795, $1,495 or $2,195 a month. Paid ad management starts at $1,150 a month plus a one-time setup, and you pay ad spend directly to the platforms. Both service pages have full pricing.", False),
    ("Will filming slow my crew down?", "No. We capture on real jobs and work around your techs.", False),
    ("Do you only work in St. Charles?", "We're based in St. Charles and shoot across St. Charles, Lincoln, Warren and St. Louis counties. See the areas we serve below.", False),
    ("Who owns the content?", "You do. You own all finished content and can use it anywhere.", False),
    ("Do I have to sign a long contract?", "No. Most plans are month to month. A special offer may come with a set term, which we state before you sign. Ask about current specials.", False),
    ("How fast can we start?", "First posts can go live as soon as the next week.", False),
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
    dict(slug="cottleville", name="Cottleville", county="St. Charles County",
         intro="Cottleville sits between St. Peters and O'Fallon in St. Charles County, a short drive from our studio. We film here for home service companies and auto shops.",
         local="Cottleville is a close-knit community where reputation travels fast. Video of your real crew doing careful work gives neighbors something to share.",
         near=["st-peters", "o-fallon", "weldon-spring"]),
    dict(slug="dardenne-prairie", name="Dardenne Prairie", county="St. Charles County",
         intro="Dardenne Prairie sits between O'Fallon and Lake Saint Louis in western St. Charles County. We shoot here for contractors, outdoor companies and auto businesses.",
         local="Newer homes and growing families mean a steady stream of homeowners looking for someone they can trust. Consistent local content makes that someone you.",
         near=["o-fallon", "lake-saint-louis", "wentzville"]),
    dict(slug="weldon-spring", name="Weldon Spring", county="St. Charles County",
         intro="Weldon Spring sits along I-64 near the Missouri River in southern St. Charles County. We film here for home service and automotive businesses.",
         local="Weldon Spring homeowners care about their properties and expect quality. Before-and-after video shows them yours.",
         near=["cottleville", "chesterfield", "st-charles"]),
    dict(slug="ballwin", name="Ballwin", county="St. Louis County",
         intro="Ballwin is in west St. Louis County along Manchester Road. We travel here for contractors, service companies and auto shops.",
         local="West county homeowners compare plenty of options before they call. Real video of your work is what puts you on the short list.",
         near=["chesterfield", "kirkwood", "maryland-heights"]),
    dict(slug="kirkwood", name="Kirkwood", county="St. Louis County",
         intro="Kirkwood is a historic suburb in St. Louis County with a busy downtown. We film here for home service companies, remodelers and auto businesses.",
         local="Kirkwood's older homes keep contractors busy with repairs, updates and remodels. Show the craftsmanship and you'll earn the bigger jobs.",
         near=["ballwin", "st-louis", "chesterfield"]),
    dict(slug="florissant", name="Florissant", county="St. Louis County",
         intro="Florissant is in north St. Louis County near I-270. We travel here for trades and automotive businesses that want steady content and ads.",
         local="Florissant has a lot of established neighborhoods and loyal customers. Showing up online every week keeps your business the one they call.",
         near=["st-louis", "maryland-heights", "st-charles"]),
    dict(slug="maryland-heights", name="Maryland Heights", county="St. Louis County",
         intro="Maryland Heights sits along I-270 in west St. Louis County, just across the river from St. Charles. We film here for service companies and auto businesses.",
         local="With homes and businesses side by side, Maryland Heights companies can reach both. Targeted ads put you in front of the right ones.",
         near=["st-charles", "chesterfield", "florissant"]),
]
CITIES += EXTRA_CITIES
CITY_BY_SLUG = {c["slug"]: c for c in CITIES}

def city_file(slug): return f"video-production-{slug}-mo.html"

def industry_file(slug): return f"{slug}-marketing-st-louis.html"
IND_BY_SLUG = {i["slug"]: i for i in INDUSTRIES}

NAV = [("content-creation.html", "Monthly Content"), ("paid-advertising.html", "Paid Advertising"),
       ("work.html", "Work"), ("about.html", "About")]

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
<link rel="icon" type="image/png" href="media/favicon.png">
<link rel="apple-touch-icon" href="media/apple-touch-icon.png">
{extra}"""

def header(active):
    links = "".join(f'<a href="{h}"' + (' aria-current="page"' if h == active else "") + f'>{e(t)}</a>' for h, t in NAV)
    drawer = "".join(f'<a href="{h}">{TRI}{e(t)}</a>' for h, t in NAV)
    return f"""<header class="site"><div class="wrap bar">
  <a class="logo" href="./" aria-label="Onyx Media home"><img src="media/logo-light.webp" alt="Onyx Media" width="128" height="53"></a>
  <nav class="main" aria-label="Main">{links}<a class="btn primary nav-cta" href="contact.html"><span class="nav-cta-dot" aria-hidden="true"></span>Contact Us {TRI}</a></nav>
  <button class="menu-btn" id="menuBtn" aria-expanded="false" aria-controls="drawer">MENU</button>
</div>
<div class="wrap drawer" id="drawer" hidden>{drawer}<a class="btn primary" href="contact.html">Contact Us {TRI}</a></div>
</header>"""

def footer():
    areas = "".join(f'<li><a href="{city_file(c["slug"])}">{e(c["name"])}</a></li>' for c in CITIES)
    return f"""<div class="callbar" id="callbar"><a class="btn primary" href="contact.html">Contact Us {TRI}</a><span class="callbar-num"><span class="caption">Call / text</span><strong>{PHONE}</strong></span></div>
<footer class="site"><div class="wrap">
  <div class="foot-grid">
    <div class="stack" style="gap:14px"><a class="logo" href="./"><img src="media/logo-light.webp" alt="Onyx Media" width="150" height="62"></a>
      <address class="nap"><span>Onyx Media · St. Charles, MO</span><span>Video, monthly content and paid ads for home service and automotive businesses</span><span>{PHONE} · {(f'<a href="mailto:{e(EMAIL)}">{e(EMAIL)}</a>' if EMAIL else e(EMAIL_SHOWN))}</span></address>
      <p class="faith-line">{TRI}Built on faith, honest work and doing right by people.</p></div>
    <div><h4>Services</h4><ul><li><a href="content-creation.html">Monthly content</a></li><li><a href="paid-advertising.html">Paid advertising</a></li><li><a href="industries.html">Industries</a></li><li><a href="areas.html">Areas</a></li><li><a href="work.html">Work</a></li><li><a href="about.html">About</a></li><li><a href="contact.html">Contact</a></li><li><a href="audit.html">Free content &amp; ads audit</a></li></ul></div>
    <div><h4>Follow</h4><ul><li><a href="https://www.facebook.com/OnyxMediastl">Facebook</a></li><li><a href="{INSTAGRAM}">Instagram</a></li><li><a href="{GOOGLE_REVIEW}">Leave us a Google review</a></li></ul></div>
    <div><h4>Where we work</h4><ul><li><a href="areas.html">Areas we serve →</a></li><li><a href="industries.html">Industries we serve →</a></li></ul></div>
  </div>
  <div class="foot-review"><span>Worked with us?</span><a class="btn primary" href="{GOOGLE_REVIEW}">Leave a Google review {TRI}</a></div>
  <div class="legal caption"><span>© 2026 ONYX HTZ LLC</span><span><a href="privacy.html">Privacy Policy</a> · <a href="terms.html">Terms</a></span></div>
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

def contact_form():
    opts = "".join(f"<option>{e(o)}</option>" for o in BIZ_OPTIONS)
    return f"""<form class="quote-card js-lead" name="contact" method="POST" action="/api/contact" data-success="thank-you.html" novalidate>
  <input type="hidden" name="t" value="">
  <p class="hp" aria-hidden="true"><label>Leave this empty <input name="bot-field" tabindex="-1" autocomplete="off"></label></p>
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
  <p class="err" role="alert" hidden>Add your name, a 10-digit mobile number and a full email address.</p>
  <button class="btn primary" type="submit">Book my 30-minute call {TRI}</button>
</form>"""

# ---------------------------------------------------------------- pricing data (from Max, Nov 2026)
CONTENT_PLANS = [
    dict(key="essential", name="Essential", price=795, pace="2 per week", posts="about 9", reels=3, photos=6,
         days="Tue, Thu", cal={"Tue": 1, "Thu": 1}),
    dict(key="growth", name="Growth", price=1495, popular=True, pace="3–4 per week (averages 3.5)", posts="about 15", reels=6, photos=9,
         days="Mon, Wed, Fri, plus Saturday every other week", cal={"Mon": 1, "Wed": 1, "Fri": 1, "Sat": 0.5}),
    dict(key="domination", name="Domination", price=2195, pace="5 per week", posts="about 22", reels=10, photos=12,
         days="Mon–Fri", cal={"Mon": 1, "Tue": 1, "Wed": 1, "Thu": 1, "Fri": 1}),
]
CONTENT_INCLUDES = ["Monthly strategy and content calendar", "Professional photo and video capture", "Editing",
                    "Captions", "Facebook + Instagram scheduling and publishing", "Monthly performance summary"]
CONTENT_TERMS = ["Most plans are month to month. A special offer may come with a set term, stated before signing.",
                 "You own all finished content.", "First posts can go live as soon as the next week.",
                 "Quoted separately: additional platforms, event coverage, long-form video, paid ads, community management, and travel outside the service area."]
AD_PLANS = [
    dict(key="meta", name="Meta ads", platforms="Facebook + Instagram", fee=1150, setup=625),
    dict(key="google", name="Google ads", platforms="Google + Bing search", fee=1150, setup=625),
    dict(key="full", name="Meta + Google", platforms="Both, combined", fee=1950, setup=1025),
]
AD_RULES = dict(threshold=7000, pct=0.20, min=500, max=15000, step=100, default=2500)
AD_TERMS = [  # kept for the service agreement / terms page; not shown on pricing sections"Ad spend is separate. You pay it directly to Meta, Google or Bing.",
            "At $7,000 or more in monthly ad spend, the management fee becomes 20% of ad spend for every package.",
            "Full Accelerator costs $350/mo less than buying Meta and Google separately ($2,300), and $225 less to set up ($1,250).",
            "No guarantees: results, leads and sales aren't guaranteed. Final scope is set in the service agreement."]

def money(n): return "${:,.0f}".format(n)

def content_planner():
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    default = "growth"
    tabs = "".join(f'<button type="button" class="plan-tab" role="tab" data-plan="{p["key"]}" aria-selected="{"true" if p["key"] == default else "false"}">'
                   + (f'<span class="badge">Most popular</span>' if p.get("popular") else "")
                   + f'<span class="pt-name">{p["name"]}</span><span class="pt-price">{money(p["price"])}<small>/mo</small></span><span class="pt-pace">{e(p["pace"].split(" (")[0])}</span></button>'
                   for p in CONTENT_PLANS)
    panels = ""
    for p in CONTENT_PLANS:
        cal = "".join(f'<li class="{"on" if p["cal"].get(d) == 1 else "half" if p["cal"].get(d) else ""}"><span>{d}</span></li>' for d in days)
        panels += f"""<div class="plan-panel" role="tabpanel" data-panel="{p["key"]}"{"" if p["key"] == default else " hidden"}>
  <div class="pp-top"><div><span class="eyebrow">{p["name"]}</span><p class="pp-price">{money(p["price"])}<small>/mo</small></p></div>
  <a class="btn primary" href="contact.html">Start with {p["name"]} {TRI}</a></div>
  <dl class="stats"><div><dt>Posts per month</dt><dd>{e(p["posts"])}</dd></div><div><dt>Short-form reels</dt><dd>{p["reels"]}</dd></div><div><dt>Photo or graphic posts</dt><dd>{p["photos"]}</dd></div><div><dt>Posting pace</dt><dd>{e(p["pace"])}</dd></div></dl>
  <div class="week"><p class="caption">Posting days · {e(p["days"])}</p><ul aria-hidden="true">{cal}</ul>
  {'<p class="form-note"><span class="dot half"></span> Every other week</p>' if any(v == 0.5 for v in p["cal"].values()) else ""}</div>
</div>"""
    side = f"""<aside class="plan-side"><h3 class="heading">Every plan includes</h3>{ticks(CONTENT_INCLUDES)}
<p class="form-note">Month to month. <strong>Ask about current specials.</strong></p></aside>"""
    return f"""<div class="planner" data-planner><div class="plan-main"><div class="plan-tabs" role="tablist" aria-label="Content plans">{tabs}</div>{panels}</div>{side}</div>"""

def ad_calculator():
    r = AD_RULES
    d = AD_PLANS[0]
    plans = "".join(f'<label class="ad-plan"><input type="radio" name="adplan" value="{p["key"]}" data-fee="{p["fee"]}" data-setup="{p["setup"]}"' + (" checked" if i == 0 else "")
                    + f'><span><strong>{p["name"]}</strong><em>{p["platforms"]}</em></span></label>'
                    for i, p in enumerate(AD_PLANS))
    fee = d["fee"]; spend = r["default"]
    return f"""<div class="calc" data-calc data-threshold="{r["threshold"]}" data-pct="{r["pct"]}">
  <div class="calc-in">
    <fieldset class="ad-plans three"><legend class="caption">Where do you want to advertise?</legend>{plans}</fieldset>
    <div class="spend"><label class="caption" for="adSpend">Your monthly ad budget</label>
      <output class="spend-out" for="adSpend" data-out="spend">{money(spend)}</output>
      <input id="adSpend" type="range" min="{r["min"]}" max="{r["max"]}" step="{r["step"]}" value="{spend}">
      <div class="range-ends caption"><span>{money(r["min"])}</span><span>{money(r["max"])}</span></div></div>
  </div>
  <div class="calc-out" aria-live="polite">
    <p class="caption">Your monthly investment</p>
    <p class="big-total" data-out="monthly">{money(fee + spend)}</p>
    <p class="split-line">Our management <strong data-out="fee">{money(fee)}</strong> + your ad budget <strong data-out="spend2">{money(spend)}</strong>, paid directly to the platforms.</p>
    <p class="split-line">First month <strong data-out="first">{money(fee + spend + d["setup"])}</strong>, including one-time setup.</p>
    <a class="btn primary" href="contact.html">Talk through your numbers {TRI}</a>
  </div>
</div>"""

def pricing_section(which, cls="band", anchor=True):
    if which == "content":
        return f"""<section class="{cls}" id="{"pricing" if anchor else "content-pricing"}"><div class="wrap">
  <div class="band-head"><div class="stack">{eyebrow("Content pricing")}<h2 class="display-l">Pick your posting pace.</h2></div>
  <p class="body-l">Three monthly plans. Tap a plan to see exactly what you get and which days you post.</p></div>
  {content_planner()}</div></section>"""
    return f"""<section class="{cls}" id="{"pricing" if anchor else "ads-pricing"}"><div class="wrap">
  <div class="band-head"><div class="stack">{eyebrow("Ad pricing")}<h2 class="display-l">See your monthly cost.</h2></div>
  <p class="body-l">Pick where you want to advertise and slide to your budget.</p></div>
  {ad_calculator()}</div></section>"""

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
    <div class="stack hero-copy" style="gap:26px">
      {eyebrow("Video · Social media · Paid ads · St. Louis")}
      <h1 class="display-xl">More <span class="rot" id="rot"><span class="rot-word">{ROTATE[0]}</span></span> from the work you already do.</h1>
      <p class="lead"><strong>Onyx Media films your business, posts it every week, and runs the ads that make your phone ring.</strong> One local team for service businesses across St. Louis and St. Charles County.</p>
      <div class="hero-ctas">
        <a class="btn primary big" href="contact.html">Contact Us {TRI}</a>
        <a class="btn ghost-light big" href="audit.html">Get a Free Audit</a>
      </div>
          </div>
  </div>
  <div class="slide-cap caption" aria-hidden="true">{TRI}<span id="slideCap">{e(SLIDES[0][2])}</span></div>
  <a class="scroll-cue" href="#what-we-do" aria-label="See what we do"><span></span></a>
</section>"""

def what_we_do():
    cols = [("Film", "We capture photo and video on your job sites, in your shop or on your lot. Real crews, real work.", "Included in every plan", "content-creation.html", "See content plans"),
            ("Post", "We edit, caption and post to Facebook and Instagram 2 to 5 times a week, so you show up every week.", f"From {money(CONTENT_PLANS[0]['price'])}/mo", "content-creation.html", "See content plans"),
            ("Advertise", "We run Meta and Google ads that put your best work in front of the people ready to call.", f"From {money(AD_PLANS[0]['fee'])}/mo", "paid-advertising.html", "See ad pricing")]
    items = "".join(f'<a class="wwd-item" href="{h}"><span class="wwd-n">0{k+1}</span><h3>{t}</h3><p>{e(d)}</p><span class="wwd-price">{e(pr)}</span><span class="btn text">{lk}</span></a>' for k, (t, d, pr, h, lk) in enumerate(cols))
    return f"""<section class="band dark wwd" id="what-we-do"><div class="wrap">
  <div class="wwd-head">{eyebrow("What Onyx Media does")}<h2 class="display-l">We film it. We post it. We make the phone ring.</h2></div>
  <div class="wwd-grid">{items}</div>
</div></section>"""

def client_wall(head_text="Businesses we've filmed for"):
    return f"""<section class="band dark"><div class="wrap">{eyebrow(head_text)}
<ul class="clients">{"".join(f"<li>{e(c)}</li>" for c in CLIENTS)}</ul></div></section>"""

def service_cards():
    return f"""<div class="grid-2">
  <a class="card feature" href="content-creation.html">{eyebrow("Monthly content creation")}
    <h3 class="display-m">Show up every week without lifting a camera.</h3>
    <p>We plan, capture, edit, caption and post to Facebook and Instagram, 2 to 5 times a week.</p>
    {ticks(["3 to 10 short-form reels a month", "6 to 12 photo or graphic posts a month", "Monthly strategy, calendar and performance summary"])}
    <div class="foot"><span class="price">From {money(CONTENT_PLANS[0]["price"])}/mo</span><span>See plans →</span></div></a>
  <a class="card feature" href="paid-advertising.html">{eyebrow("Paid advertising")}
    <h3 class="display-m">Turn your best video into booked jobs.</h3>
    <p>Monthly ad management on Facebook, Instagram, Google and Bing, paired with the content we create.</p>
    {ticks(["Meta ads, Google ads, or both", "Your ad budget goes straight to the platforms", "See your monthly cost instantly"])}
    <div class="foot"><span class="price">From {money(AD_PLANS[0]["fee"])}/mo</span><span>Calculate your cost →</span></div></a>
</div>
<p class="muted" style="margin-top:20px">Also available, quoted separately: event coverage, long-form video and brand films. Ask on your call.</p>"""

def trades():
    return '<div class="trades">' + "".join(f'<a class="trade" href="{industry_file(sl)}">{TRI}<h3>{e(t)}</h3><p>{e(d)}</p></a>' for t, d, sl in TRADES) + "</div>" + \
        f'<div class="btns" style="margin-top:24px"><a class="btn secondary" href="industries.html">See all {len(INDUSTRIES)} industries we serve</a></div>'

def industry_links(exclude=None, limit=None):
    items = [i for i in INDUSTRIES if i["slug"] != exclude][:limit]
    return '<ul class="areas">' + "".join(f'<li><a href="{industry_file(i["slug"])}">{TRI}{e(i["name"])}</a></li>' for i in items) + "</ul>"

def areas_hub():
    counties = {}
    for c in CITIES:
        counties.setdefault(c["county"], []).append(c)
    blocks = ""
    for k, (county, cs) in enumerate(counties.items()):
        blocks += f'<section class="band{" bone" if k % 2 else ""}"><div class="wrap"><div class="band-head"><div class="stack">{eyebrow(county)}<h2 class="display-l">{e(county.replace("the ", "").title() if county.startswith("the ") else county)}.</h2></div><span></span></div>' + \
            '<div class="ind-grid">' + "".join(f'<a class="card" href="{city_file(c["slug"])}"><h3 class="display-m" style="font-size:24px">{e(c["name"])}, MO</h3><p>{e(c["intro"].split(". ")[0])}.</p><span class="btn text">Video & ads in {e(c["name"])}</span></a>' for c in cs) + "</div></div></section>"
    body = page_head("Areas we serve", "Video and ads across the St. Louis metro.", "We're based in St. Charles and come to you: your job sites, your shop, your lot. Pick your city to see what we do there.", "Areas") + blocks + cta_band()
    return page("areas.html", "Areas We Serve | Video Production & Social Media Marketing Around St. Louis | Onyx Media",
                "Onyx Media serves St. Charles, St. Louis, Lincoln and Warren counties with video production, monthly social content and paid ads for service businesses.", body, "areas.html")

def industries_hub():
    groups = ""
    for key, label in GROUPS:
        items = [i for i in INDUSTRIES if i["group"] == key]
        groups += f'<section class="band{" bone" if key in ("auto", "pro") else ""}"><div class="wrap"><div class="band-head"><div class="stack">{eyebrow(label)}<h2 class="display-l">{e(label)}.</h2></div><span></span></div>' + \
            '<div class="ind-grid">' + "".join(f'<a class="card" href="{industry_file(i["slug"])}"><h3 class="display-m" style="font-size:22px">{e(i["name"])}</h3><p>{e(i["intro"].split(". ")[0])}.</p><span class="btn text">See {e(i["name"].lower())} marketing</span></a>' for i in items) + "</div></div></section>"
    body = page_head("Industries", "Video and ads for service businesses.", "Home services, automotive, pets and local professional services across St. Louis and St. Charles County. Pick your industry to see what we film and what it costs.", "Industries") + groups + cta_band()
    return page("industries.html", "Industries We Serve | Video & Social Media Marketing for Service Businesses | Onyx Media St. Louis",
                "Video production, monthly social content and paid ads for home service, automotive, pet and local service businesses in St. Louis and St. Charles County.", body, "industries.html")

def industry_page(i):
    n = i["name"]; noun = i["noun"]
    shots = ticks(i["shots"])
    ideas = '<div class="grid-3">' + "".join(f'<div class="card"><span class="eyebrow">Idea {k+1}</span><h3 class="display-m" style="font-size:24px">{e(t)}</h3><p>{e(d)}</p></div>' for k, (t, d) in enumerate(i["ideas"])) + "</div>"
    case = ""
    if i.get("case") is not None:
        case = section("Recent work", f"Work for {noun}.", "", '<div class="cases two" style="max-width:640px">' + case_html(CASES[i["case"]]) + "</div>")
    faq = [(f"Do you work with {noun} in St. Louis?", f"Yes. We create content and run ads for {noun} across St. Louis, St. Charles County and nearby areas. Our studio is in St. Charles.", False),
           (f"What content works best for {noun}?", " ".join(f"{t}: {d}" for t, d in i["ideas"]), False),
           ("How much does it cost?", "Monthly content plans are $795, $1,495 or $2,195 a month. Ad management is $1,150 or $1,950 a month plus a one-time setup, and you pay ad spend directly to the platforms.", False),
           ("Is there a contract?", "Most plans are month to month. A special offer may come with a set term, stated before signing. Ask about current specials.", False),
           ("How fast can we start?", "First posts can go live as soon as the next week.", False)]
    city_list = '<ul class="areas">' + "".join(f'<li><a href="{city_file(c["slug"])}">{TRI}{e(c["name"])}</a></li>' for c in CITIES[:9]) + f'<li><a href="areas.html">{TRI}All {len(CITIES)} areas</a></li></ul>'
    body = page_head(f"Marketing for {n.lower()}", f"Video & social media marketing for {noun} in St. Louis.", i["intro"], f"Industries / {n}", "See pricing") + \
        section("What we film", f"Content built for {noun}.", i["season"], shots) + \
        section("Content ideas", f"Videos that bring in more {i['jobs']}.", "A few of the formats we plan into your monthly calendar.", ideas, "band bone") + \
        case + pricing_section("content") + pricing_section("ads", "band bone", anchor=False) + \
        section("Recent shoots", "Shot on real jobs.", f"The kind of footage we capture for {noun}.", gallery(INDUSTRIES.index(i), 5), "band dark") + reviews(2, INDUSTRIES.index(i) + 2) + \
        section("Where we work", f"Serving {noun} across the metro.", "We come to your job sites, shop or office.", city_list) + \
        section("FAQ", f"Questions from {noun}.", "", faq_html(faq), "band bone") + \
        section("Other industries", "We also work with.", "", industry_links(i["slug"], 10) + '<div class="btns" style="margin-top:20px"><a class="btn text" href="industries.html">All industries</a></div>') + \
        cta_band(f"Let's bring in more {i['jobs']}.")
    schema = {"@context": "https://schema.org", "@type": "Service", "serviceType": f"Video production and social media marketing for {noun}",
              "provider": {k: v for k, v in BUSINESS.items() if k != "@context"}, "areaServed": "St. Louis, MO"}
    return page(industry_file(i["slug"]), f"Video & Social Media Marketing for {n} in St. Louis | Onyx Media",
                f"Video production, monthly social content and paid ads for {noun} in St. Louis and St. Charles County. Content from $795/mo, ads from $1,150/mo.",
                body, None, extra_head=ld(schema) + faq_ld(faq))

def gallery(offset=0, count=None):
    items = GALLERY[offset % len(GALLERY):] + GALLERY[:offset % len(GALLERY)]
    if count:
        items = [(f, a, c, "g-wide" if k == 0 else "") for k, (f, a, c, _) in enumerate(items[:count])]
    return '<div class="gallery">' + "".join(
        f'<figure class="{cls}"><img src="media/{f}.webp" alt="{e(a)}" loading="lazy"><figcaption class="caption">{TRI}{e(c)}</figcaption></figure>'
        for f, a, c, cls in items) + "</div>"

def case_html(c):
    return f"""<article class="case" data-f="{' '.join(c['f'])}">
  <div class="thumb"><img src="media/{c['img']}.webp" alt="{e(c['alt'])}" loading="lazy">{TRI}</div>
  {eyebrow(c['tag'])}<h3 class="display-m">{e(c['title'])}</h3>
  <dl>{f"<div><dt>The challenge</dt><dd>{e(c['problem'])}</dd></div>" if c.get('problem') else ""}<div><dt>What we made</dt><dd>{e(c['made'])}</dd></div></dl>
</article>"""

def step_grid(data):
    return '<div class="steps">' + "".join(f'<div class="step"><span class="n">0{i+1}</span><h3>{e(t)}</h3><p>{e(d)}</p></div>' for i, (t, d) in enumerate(data)) + "</div>"

def steps():
    return step_grid([("Call", "A 30-minute call about your business, your area and what's bringing in work now."),
                      ("Plan", "We build your monthly strategy and content calendar."),
                      ("Capture", "Photo and video on your job sites, in your shop or on your lot."),
                      ("Post & report", "Posts go live on schedule, often starting the next week. Every month you get a performance summary.")])

def review_card(q, n, b, stars):
    paras = "".join(f"<p>{e(x)}</p>" for x in q.split("\n\n"))
    star = f'<span class="stars" aria-label="{stars} out of 5 stars">{"★" * stars}</span>' if stars else '<span class="g-badge caption">Google review</span>'
    return f'<figure class="review">{star}<blockquote>{paras}</blockquote><figcaption><strong>{e(n)}</strong><span>{e(b)}</span></figcaption></figure>'

def reviews(limit=None, offset=0):
    rot = REVIEWS[offset % len(REVIEWS):] + REVIEWS[:offset % len(REVIEWS)]
    items = rot[:limit] if limit else REVIEWS
    cards = '<div class="reviews">' + "".join(review_card(*r) for r in items) + "</div>"
    return f"""<section class="band dark"><div class="wrap">
  <div class="band-head"><div class="stack">{eyebrow("Google reviews")}<h2 class="display-l">From the owners.</h2></div>
  <p class="body-l">What local business owners say after working with us.</p></div>
  {cards}
  <div class="btns" style="margin-top:28px"><a class="btn primary" href="{GOOGLE_REVIEW}">Leave us a Google review {TRI}</a></div>
</div></section>"""

def about_teaser():
    return f"""<section class="band"><div class="wrap about">
  <figure class="max-photo"><img src="media/max-fisher-on-set.webp" alt="Max Fisher filming an engine bay with a gimbal-mounted camera" width="900" height="900" loading="lazy"><figcaption class="caption">{TRI}Max Fisher · Owner, Onyx Media</figcaption></figure>
  <div class="stack" style="gap:22px">{eyebrow("About")}<h2 class="display-l">Owner-run. Faith-led. On every shoot.</h2>
    <p class="body-l">I'm Max Fisher. I've been an entrepreneur since I was 12, and I got into media filming my own vehicle. I started Onyx Media to give local service businesses the kind of video and ads the big brands get. I believe God gave me this opportunity, and I run it to steward it well: honest pricing, showing up, and treating your business like my own.</p>
    <div class="facts"><div><strong>St. Charles</strong><span>Based here, shooting across the metro</span></div><div><strong>Next week</strong><span>First posts can go live</span></div><div><strong>18</strong><span>Local businesses filmed</span></div></div>
    <div class="btns"><a class="btn text" href="about.html">More about Onyx</a></div></div>
</div></section>"""

def areas_block(exclude=None):
    items = "".join(f'<li><a href="{city_file(c["slug"])}">{TRI}{e(c["name"])}</a></li>' for c in CITIES if c["slug"] != exclude)
    return f"""<section class="band bone" id="areas"><div class="wrap">
  <div class="band-head"><div class="stack">{eyebrow("Areas we serve")}<h2 class="display-l">Local to St. Charles County and beyond.</h2></div>
  <p class="body-l">We drive to you. Shoots happen on your job sites, in your shop or on your lot.</p></div>
  <ul class="areas">{items}</ul>
  <div class="btns" style="margin-top:20px"><a class="btn text" href="areas.html">All areas we serve</a></div></div></section>"""

def cta_band(h="Let's fill your schedule.", p="30 minutes. We'll look at what you're posting now, what the competition in your area is doing, and what we'd film first."):
    return f"""<section class="cta-band"><div class="cta-pattern" aria-hidden="true"></div><div class="wrap">
  {eyebrow("Free 30-minute call")}<h2 class="display-xl">{e(h)}</h2><p>{e(p)}</p>
  <div class="btns"><a class="btn dark" href="contact.html">Contact Us {TRI}</a><a class="btn secondary" href="paid-advertising.html">Paid Advertising</a></div>
</div></section>"""

def section(title_eyebrow, h2, lead, inner, cls="band"):
    lead_html = f'<p class="body-l">{e(lead)}</p>' if lead else "<span></span>"
    return f"""<section class="{cls}"><div class="wrap">
  <div class="band-head"><div class="stack">{eyebrow(title_eyebrow)}<h2 class="display-l">{e(h2)}</h2></div>{lead_html}</div>
  {inner}</div></section>"""

def page_head(eb, h1, lead, crumbs=None, pricing_label=None):
    cr = f'<p class="crumbs"><a href="./">Home</a> / {e(crumbs)}</p>' if crumbs else ""
    acts = f'<div class="btns"><a class="btn primary" href="contact.html">Contact Us {TRI}</a>' + \
           (f'<a class="btn secondary" href="#pricing">{e(pricing_label)}</a>' if pricing_label else "") + "</div>"
    return f'<section class="page-head"><div class="wrap"><div class="stack" style="gap:20px;max-width:900px">{cr}{eyebrow(eb)}<h1 class="display-l">{e(h1)}</h1><p class="body-l">{e(lead)}</p>{acts}</div></div></section>'

# ---------------------------------------------------------------- pages
def home(fragment=False):
    body = hero() + what_we_do() + \
        section("Recent shoots", "Shot on real jobs.", "On the roof, in the yard, on the lot. This is the kind of content we make for you every month.", gallery()) + \
        reviews() + \
        section("Featured work", "What we made and what it did.", "A few of the local businesses we create for.",
                '<div class="cases">' + "".join(case_html(c) for c in CASES[:3]) + '</div><div class="btns" style="margin-top:28px"><a class="btn secondary" href="work.html">See all work</a></div>', "band bone") + \
        section("Who we work with", "Built for service businesses.", "Home services, automotive, pets and local service companies.", trades()) + \
        about_teaser() + areas_block() + \
        section("FAQ", "Straight answers.", "If yours isn't here, ask it on the call.", faq_html(HOME_FAQ)) + cta_band()
    return page("index.html", "Onyx Media | Video & Paid Ads for Home Service and Auto Businesses in St. Louis",
                "St. Charles video production, monthly social content from $795/mo and paid ads from $1,150/mo for home service companies and automotive shops across St. Louis.",
                body, active=None, extra_head=ld(BUSINESS) + faq_ld(HOME_FAQ), fragment=fragment)

CONTENT_FAQ = [
    ("What does every plan include?", "A monthly strategy and content calendar, professional photo and video capture, editing, captions, Facebook + Instagram scheduling and publishing, and a monthly performance summary.", False),
    ("Which platforms do you post to?", "Facebook and Instagram are included. Additional platforms are quoted separately.", False),
    ("How fast can we start?", "First posts can go live as soon as the next week.", False),
    ("Is there a contract?", "Most plans are month to month. A special offer may come with a set term, which we state before you sign. Ask about current specials.", False),
    ("Who owns the content?", "You own all finished content.", False),
]

def content_page():
    split = f"""<div class="split"><figure><img src="media/max-on-set-wide.webp" alt="Filming an engine bay on a gimbal" loading="lazy"></figure>
<div class="stack">{eyebrow("How a month works")}<h2 class="display-l">Planned, captured, posted.</h2>
{ticks(["We build your monthly strategy and content calendar", "We capture photo and video on your job sites, in your shop or on your lot", "We edit, write captions, and schedule to Facebook and Instagram", "You get a performance summary every month"])}</div></div>"""
    body = page_head("Monthly content creation", "Show up every week without lifting a camera.",
                     "Monthly photo and video content for home service and automotive businesses: planned, captured, edited, captioned and posted to Facebook and Instagram. Plans from $795/mo.",
                     "Monthly content", "See content pricing") + \
        pricing_section("content") + \
        f'<section class="band bone"><div class="wrap">{split}</div></section>' + \
        section("FAQ", "Monthly content questions.", "", faq_html(CONTENT_FAQ)) + cta_band()
    return page("content-creation.html", "Monthly Social Media Content for Contractors & Auto Shops | From $795/mo | Onyx Media",
                "Monthly photo and video content for home service and automotive businesses in St. Louis and St. Charles County. Three plans from $795/mo, month to month.",
                body, "content-creation.html", extra_head=faq_ld(CONTENT_FAQ))

ADS_FAQ = [
    ("Where can you run my ads?", "Facebook and Instagram, Google and Bing search, or all of them combined.", False),
    ("Is my ad budget included?", "No. Your ad budget is paid directly to the platforms, so every dollar goes to your ads.", False),
    ("Is there a setup fee?", "Yes, a one-time setup when we start. The calculator includes it in your first month.", False),
    ("Do I need a content plan too?", "No, but ads perform best with fresh creative, so most clients run both.", False),
    ("Is there a long-term contract?", "Most plans are month to month. Ask about current specials.", False),
]

def ads_page():
    steps_ads = step_grid([("Set up", "Ad accounts and tracking set up right, once."),
                           ("Target", "The areas and customers you actually want, not everyone."),
                           ("Create", "Ads built around real footage of your crew, shop and finished work."),
                           ("Manage", "Monthly management and adjustments based on what's working.")])
    cases = '<div class="cases two">' + "".join(case_html(c) for c in CASES if "ads" in c["f"]) + "</div>"
    body = page_head("Paid advertising", "Turn your best video into booked jobs.",
                     "Facebook, Instagram and Google ads for home service companies and auto shops, built around real footage of your work. Management from $1,150/mo.",
                     "Paid advertising", "Calculate your cost") + \
        pricing_section("ads") + \
        section("How it works", "Ads that look like your business.", "Generic stock ads get scrolled past. Your own crew doesn't.", steps_ads, "band bone") + \
        section("Ad work", "Recent ad clients.", "", cases) + \
        section("FAQ", "Paid ads questions.", "", faq_html(ADS_FAQ), "band bone") + cta_band()
    return page("paid-advertising.html", "Facebook, Google & Bing Ads for Contractors & Auto Shops | From $1,150/mo | Onyx Media",
                "Paid ad management for home service and automotive businesses in St. Louis and St. Charles County. Three packages from $1,150/mo with a live cost calculator.",
                body, "paid-advertising.html", extra_head=faq_ld(ADS_FAQ))

def work_page():
    chips = "".join(f'<button class="chip" aria-pressed="' + ("true" if k == "all" else "false") + f'" data-f="{k}">{t}</button>'
                    for k, t in [("all", "All"), ("social", "Social content"), ("ads", "Paid ads")])
    body = page_head("Work", "Real businesses. Real footage.", "A look at what we've made for local service businesses.", "Work") + \
        f'<section class="band"><div class="wrap"><div class="filters" role="group" aria-label="Filter work">{chips}</div><div class="cases two" id="work-cases">' + \
        "".join(case_html(c) for c in CASES) + "</div></div></section>" + \
        section("Recent shoots", "More from the field.", "Roofs, kennels, job sites, studios and service bays.", gallery(), "band dark") + \
        cta_band()
    return page("work.html", "Our Work | Video & Ads for Local Businesses | Onyx Media St. Louis",
                "Case studies and recent shoots from Onyx Media: social content and paid ads for home service and automotive businesses.", body, "work.html")

def about_page():
    values = [("Faith first", "Everything we do starts there. It's why we keep our word, price honestly and treat people right."),
              ("Work with all our heart", "Every shoot gets our best, whether it's a big brand film or a single reel."),
              ("Honest and fair", "Clear pricing, no surprises, and straight answers about what will and won't work."),
              ("Show up", "On time, prepared, and respectful of your crew, your customers and your job site.")]
    vgrid = '<div class="values">' + "".join(f'<div class="value"><span class="n">0{k+1}</span><h3>{e(t)}</h3><p>{e(d)}</p></div>' for k, (t, d) in enumerate(values)) + "</div>"
    body = page_head("About", "A St. Charles studio built on faith and hard work.", "Onyx Media is Max Fisher's studio. We film, edit and run ads for home service companies and automotive businesses, and we run it on faith.", "About") + \
        f"""<section class="band"><div class="wrap about">
  <figure class="max-photo"><img src="media/max-fisher-on-set.webp" alt="Max Fisher filming an engine bay with a gimbal-mounted camera" width="900" height="900"><figcaption class="caption">{TRI}Max Fisher · Owner, Onyx Media</figcaption></figure>
  <div class="stack" style="gap:20px"><h2 class="heading">My story</h2>
    <p class="muted">I'm Max Fisher. I've been entrepreneurial since I was 12, flipping speakers on Marketplace. I got into media because I wanted to shoot my own vehicle, and I never stopped.</p>
    <p class="muted">I spent half a year working under another local media company, and I saw a big opportunity: local service businesses doing great work that nobody ever got to see. Onyx Media exists to change that.</p>
    <p class="muted">Faith is a big reason I do this. I know God gave me this opportunity, and I want to steward it well, for my family, my clients and the people who trust us with their business.</p>
    <h2 class="heading">How we work</h2><p class="muted">The person who plans your shoot is the person behind the camera and the person reading your ad numbers. Nothing gets lost between teams, because there's only one.</p>
    <h2 class="heading">Why the trades</h2><p class="muted">We shoot around your schedule, on real jobs, so your crew keeps working while we roll. Homeowners trust what they can see: your trucks, your techs, your finished work.</p>
    <p class="form-note">Onyx Media is a brand of ONYX HTZ LLC. Paid advertising is delivered through Onyx Performance Advertising.</p>
    <div class="btns"><a class="btn primary" href="contact.html">Contact Us {TRI}</a></div></div>
</div></section>
<section class="band dark faith"><div class="wrap">
  <div class="faith-grid">
    <div class="stack" style="gap:22px">{eyebrow("What we stand on")}<h2 class="display-l">Faith first. Then the work.</h2>
      <p class="body-l">Onyx Media is a faith-driven business. Our faith shapes how we treat clients, how we price, and the standard we hold every project to. We don't see it as separate from the work; it's the reason we work the way we do.</p>
      <blockquote class="verse"><p>“Whatever you do, work at it with all your heart, as working for the Lord, not for human masters.”</p><cite>Colossians 3:23</cite></blockquote>
    </div>
    {vgrid}
  </div>
</div></section>""" + reviews() + cta_band()
    return page("about.html", "About Onyx Media | Max Fisher | Faith-Driven Video & Ads Studio | St. Charles, MO", "Onyx Media is an owner-run, faith-driven video and paid ads studio in St. Charles, MO, for home service and automotive businesses.", body, "about.html")

def contact_page():
    body = f"""<section class="page-head"><div class="wrap"><div class="stack" style="gap:20px;max-width:900px"><p class="crumbs"><a href="./">Home</a> / Contact</p>{eyebrow("Contact")}<h1 class="display-l">Book a free 30-minute call.</h1><p class="body-l">Pick a time, or send five quick details and Max will get back to you within one business day. Ask about current specials.</p></div></div></section>
<section class="band"><div class="wrap book">
  <div class="stack">{eyebrow("Fastest: pick a time")}{(f'<div class="calendly-inline-widget" data-url="{e(CALENDLY_URL)}?hide_gdpr_banner=1" style="min-width:300px;height:680px"></div><script src="https://assets.calendly.com/assets/external/widget.js" async></script><p class="form-note">Calendar not loading? <a href="{e(CALENDLY_URL)}">Book on Calendly</a></p>') if CALENDLY_URL else '<div class="slot">Calendly booking calendar · 30-minute calls<br>Add the Calendly link in tools/build_site.py</div>'}
  <address class="nap muted"><strong style="color:var(--ink)">Onyx Media</strong><span>St. Charles, MO · Serving the St. Louis metro</span><span>Call or text {PHONE}</span><span>{(f'<a href="mailto:{e(EMAIL)}">{e(EMAIL)}</a>' if EMAIL else e(EMAIL_SHOWN))}</span></address></div>
  {contact_form()}
</div></section>
<section class="band bone"><div class="wrap audit-teaser">
  <div class="stack" style="gap:12px">{eyebrow("Not ready for a call?")}<h2 class="display-m">Get a free content &amp; ads audit.</h2><p class="body-l">Send us your links. We'll review your website, social pages, Google profile and ads, and send back the top things we'd fix or film first.</p></div>
  <div class="btns"><a class="btn primary" href="audit.html">Request my free audit {TRI}</a></div>
</div></section>"""
    return page("contact.html", "Contact | Onyx Media St. Louis", "Contact Onyx Media for monthly video content and paid ads, and book a free 30-minute call.", body, "contact.html")

def legal_page(path, title, h1, updated, sections):
    body = f"""<section class="page-head"><div class="wrap"><div class="stack" style="gap:16px;max-width:900px"><p class="crumbs"><a href="./">Home</a> / {e(h1)}</p><h1 class="display-l">{e(h1)}</h1><p class="form-note">Last updated {e(updated)}</p></div></div></section>
<section class="band"><div class="wrap legal-copy">""" + "".join(f"<h2 class=\"heading\">{e(h)}</h2>" + "".join(f"<p>{x}</p>" for x in ps) for h, ps in sections) + "</div></section>"
    return page(path, f"{title} | Onyx Media", f"{title} for onyxmediastl.com, operated by ONYX HTZ LLC (Onyx Media).", body)

def privacy_page():
    contact = f"{e(EMAIL_SHOWN)} or {PHONE}"
    S = [
        ("Who we are", ["Onyx Media is a brand of ONYX HTZ LLC, based in St. Charles, Missouri (\"Onyx Media,\" \"we,\" \"us\"). This policy explains what information we collect through onyxmediastl.com and how we use it."]),
        ("Information you give us", ["When you fill out a form or book a call, we collect what you enter, such as your name, email, phone number, company, business type, budget, timeline and message. When you book through Calendly, Calendly collects your booking details under its own privacy policy."]),
        ("Information collected automatically", ["Like most websites, our hosting provider and any analytics or advertising tools we use (such as Google Analytics or the Meta Pixel) may collect technical information such as your IP address, browser, device, pages visited and how you arrived at our site. These tools may use cookies or similar technologies."]),
        ("How we use information", ["To respond to your inquiry, schedule calls, provide quotes and deliver our services.", "To understand how our website is used and to improve it.", "To measure and improve our advertising, including showing ads to people who have visited our site."]),
        ("How we share information", ["We do not sell your personal information. We share it only with service providers that help us run our business (for example website hosting, form handling, scheduling, email, analytics and advertising platforms), or when required by law."]),
        ("Your choices", ["You can ask us to access, correct or delete the personal information you've given us by contacting us. You can block or delete cookies in your browser settings, and you can opt out of interest-based ads through your Google and Meta ad settings."]),
        ("Data retention and security", ["We keep inquiry information as long as needed to respond to you and run our business, and we use reasonable measures to protect it. No method of transmission over the internet is completely secure."]),
        ("Children", ["Our website is not directed to children under 13, and we do not knowingly collect their personal information."]),
        ("Changes", ["We may update this policy from time to time. The date at the top shows when it was last changed."]),
        ("Contact", [f"Questions about this policy: {contact}. ONYX HTZ LLC, St. Charles, MO."]),
    ]
    return legal_page("privacy.html", "Privacy Policy", "Privacy Policy", "November 2026", S)

def terms_page():
    contact = f"{e(EMAIL_SHOWN)} or {PHONE}"
    S = [
        ("Agreement", ["These terms apply to your use of onyxmediastl.com, operated by ONYX HTZ LLC, doing business as Onyx Media. By using the site you agree to them. Services we provide to clients are governed by a separate written service agreement, which controls if it conflicts with these terms."]),
        ("Pricing and estimates", ["Prices and calculator results on this site are estimates for general information and may change. Final pricing and scope are set in your service agreement.",
                                   "Paid advertising: ad spend is separate from our management fee and is paid directly by the client to the ad platforms (such as Meta, Google and Bing). Packages include a one-time setup fee. At $7,000 or more in monthly ad spend, the management fee becomes 20% of ad spend for every package.",
                                   "Content plans: most plans are month to month. A special offer may come with a set term, which is stated before signing. Additional platforms, event coverage, long-form video, paid ads, community management and travel outside our service area are quoted separately."]),
        ("No guarantees", ["Marketing results depend on many factors outside our control. We do not guarantee specific results, leads, rankings or sales."]),
        ("Ownership", ["Clients own the finished content we deliver under their service agreement. Everything else on this website, including text, photos, video and design, belongs to Onyx Media or its clients and may not be copied without permission."]),
        ("Reviews and examples", ["Reviews on this site are from real clients. Photos and examples show work we created; captions describe the type of work and may not name the client."]),
        ("Third-party links and tools", ["Our site links to and uses third-party services such as Calendly, Google and Meta. We are not responsible for their content or policies."]),
        ("Limitation of liability", ["The site is provided \"as is.\" To the extent allowed by law, Onyx Media is not liable for indirect or consequential damages arising from use of this website."]),
        ("Governing law", ["These terms are governed by the laws of the State of Missouri."]),
        ("Contact", [f"Questions about these terms: {contact}."]),
    ]
    return legal_page("terms.html", "Terms of Use", "Terms of Use", "November 2026", S)

def thanks_page():
    body = f"""<section class="band"><div class="wrap stack" style="gap:22px">{eyebrow("Received")}<h1 class="display-l">Got it. Here's what happens next.</h1>
<ol class="muted" style="display:grid;gap:10px;padding-left:20px;margin:0"><li>Max reviews your details and gets back to you within one business day.</li><li>You'll get a link to book your 30-minute call if you haven't already.</li><li>Before the call we look at your site, your Google profile and your competitors.</li></ol>
<p class="form-note">Conversion events (GA4 + Meta) fire on this page once tracking is installed.</p>
<div class="btns"><a class="btn secondary" href="work.html">See Our Work</a></div></div></section>"""
    return page("thank-you.html", "Thanks | Onyx Media", "Thanks for reaching out to Onyx Media.", body)

# ---------------------------------------------------------------- audit request (free content & ads audit)
NO_SITEMAP = {"thank-you.html", "audit-thank-you.html"}
# Keep in sync with AD_SPEND in netlify/functions/audit.js
AD_SPEND_OPTIONS = ["Not running ads", "Under $500", "$500–$1,500", "$1,500–$3,000", "$3,000–$7,000", "$7,000+"]

def audit_form():
    biz = "".join(f"<option>{e(o)}</option>" for o in BIZ_OPTIONS)
    spend = "".join(f"<option>{e(o)}</option>" for o in AD_SPEND_OPTIONS)
    return f"""<form class="quote-card js-lead" name="audit" method="POST" action="/api/audit" data-success="audit-thank-you.html" data-need-link="true" novalidate>
  <input type="hidden" name="t" value="">
  <p class="hp" aria-hidden="true"><label>Leave this empty <input name="bot-field" tabindex="-1" autocomplete="off"></label></p>
  {eyebrow("Request your free audit")}
  <div class="fields two">
    <div class="field"><label for="a-name">Your name <span class="req">*</span></label><input id="a-name" name="name" autocomplete="name" required></div>
    <div class="field"><label for="a-biz">Business name <span class="req">*</span></label><input id="a-biz" name="business" autocomplete="organization" required></div>
    <div class="field"><label for="a-email">Email <span class="req">*</span></label><input id="a-email" name="email" type="email" autocomplete="email" required></div>
    <div class="field"><label for="a-phone">Mobile <span class="req">*</span></label><input id="a-phone" name="phone" type="tel" autocomplete="tel" required></div>
    <div class="field full"><label for="a-ind">Industry</label><select id="a-ind" name="industry">{biz}</select></div>
  </div>
  <p class="form-note" style="margin:6px 0 0">Your links (add at least one)</p>
  <div class="fields two">
    <div class="field full"><label for="a-site">Website</label><input id="a-site" name="website" type="url" inputmode="url" placeholder="yourbusiness.com" autocomplete="url"></div>
    <div class="field"><label for="a-fb">Facebook page</label><input id="a-fb" name="facebook_url" type="url" inputmode="url" placeholder="facebook.com/…"></div>
    <div class="field"><label for="a-ig">Instagram</label><input id="a-ig" name="instagram_url" type="url" inputmode="url" placeholder="instagram.com/…"></div>
    <div class="field full"><label for="a-gbp">Google Business Profile link</label><input id="a-gbp" name="google_business_url" type="url" inputmode="url" placeholder="Paste your Google Maps / g.page link"></div>
  </div>
  <div class="fields two">
    <fieldset class="choice"><legend>Running ads now?</legend><label><input type="radio" name="runs_ads" value="yes"><span>Yes</span></label><label><input type="radio" name="runs_ads" value="no"><span>No</span></label></fieldset>
    <div class="field"><label for="a-spend">Monthly ad spend</label><select id="a-spend" name="monthly_ad_spend">{spend}</select></div>
    <div class="field full"><label for="a-goal">Biggest goal for the next 6 months</label><textarea id="a-goal" name="biggest_goal" placeholder="More booked jobs, fill the slow season, hire techs, launch a new service…"></textarea></div>
  </div>
  <p class="err" role="alert" hidden>Add your name, business name, a 10-digit mobile number, a full email address and at least one link.</p>
  <button class="btn primary" type="submit">Request my free audit {TRI}</button>
  <p class="form-note">Free, no obligation. We'll email it to you within 3 business days.</p>
</form>"""

def audit_page():
    gets = ["Website check: speed on a phone, clear calls to action, how easy it is to call or book",
            "Facebook and Instagram review: how often you post, what's working, what's missing",
            "Google Business Profile: photos, reviews, categories and posts",
            "Ads check (if you run them): targeting, creative and wasted spend",
            "How you stack up against 2–3 local competitors",
            "The top 3 things we'd fix or film first"]
    body = f"""<section class="page-head with-form"><div class="wrap">
  <div class="stack" style="gap:20px"><p class="crumbs"><a href="./">Home</a> / Free audit</p>{eyebrow("Free · No obligation")}
    <h1 class="display-l">Get a free content &amp; ads audit.</h1>
    <p class="body-l">Send us your links. We'll look at your website, social pages, Google profile and ads the way your customers see them, and send back a short, plain-English audit.</p>
    <div class="stack" style="gap:12px"><span class="eyebrow">{TRI}What you get</span>{ticks(gets)}</div>
    <p class="form-note">Prefer to talk? Call or text {PHONE}, or <a href="contact.html">book a 30-minute call</a>.</p>
  </div>
  {audit_form()}
</div></section>
""" + section("How it works", "Three steps. No pitch deck.", "", '<ol class="steps three">' + "".join(
        f'<li class="step"><span class="n">0{i+1}</span><h3>{e(t)}</h3><p>{e(d)}</p></li>' for i, (t, d) in enumerate([
            ("Send your links", "Two minutes. Your website, Facebook, Instagram and Google profile, whichever you have."),
            ("We dig in", "We review everything and compare you with a few competitors near you."),
            ("You get the audit", "A short write-up by email with what to fix first. Use it with us or on your own.")])) + "</ol>", "band") + \
        cta_band("Rather just talk it through?", "30 minutes. We'll look at what you're posting now and what we'd film first.")
    return page("audit.html", "Free Content & Ads Audit | Onyx Media St. Louis",
                "Get a free audit of your website, Facebook, Instagram, Google Business Profile and ads from Onyx Media in St. Louis.",
                body, "audit.html")

def audit_thanks_page():
    body = f"""<section class="band"><div class="wrap stack" style="gap:22px">{eyebrow("Audit requested")}<h1 class="display-l">Got it. Your audit is in the queue.</h1>
<ol class="muted" style="display:grid;gap:10px;padding-left:20px;margin:0"><li>Check your inbox for a confirmation email (look in spam if you don't see it).</li><li>We review your website, social pages, Google profile and ads.</li><li>Within 3 business days, you'll get your audit by email.</li></ol>
<div class="btns"><a class="btn primary" href="contact.html">Book a 30-minute call {TRI}</a><a class="btn secondary" href="work.html">See Our Work</a></div></div></section>"""
    return page("audit-thank-you.html", "Audit Requested | Onyx Media", "Thanks for requesting a free audit from Onyx Media.", body)

H1_VARIANTS = ["Video production & social media marketing in {n}, MO.", "{n}, MO video production and social media marketing.",
               "Social media video and ads for {n}, MO businesses."]
WHY_VARIANTS = [("Why video in {n}", "Be the {n} company people call first."), ("Local to {n}", "Show {n} the work behind your name."),
                ("Standing out in {n}", "Make {n} customers choose you.")]

def city_page(c):
    n = c["name"]; idx = CITIES.index(c)
    focus = [IND_BY_SLUG[s] for s in CITY_FOCUS.get(c["slug"], []) if s in IND_BY_SLUG]
    faq = [(f"Do you film in {n}?", f"Yes. We shoot on location in {n} and across {c['county']}. Our studio is in St. Charles.", False)]
    if c["slug"] in CITY_NOTE:
        q, a = CITY_NOTE[c["slug"]]; faq.append((q, a, False))
    if focus:
        faq.append((f"Which {n} businesses do you work with most?", f"Across {n} we often work with " + ", ".join(i["noun"] for i in focus[:-1]) + f" and {focus[-1]['noun']}, plus other home service, automotive and local service businesses.", False))
    faq += [("How much does it cost?", "Monthly content plans are $795, $1,495 or $2,195 a month. Ad management is $1,150 or $1,950 a month plus a one-time setup, and you pay ad spend directly to the platforms.", False),
            ("How fast can you start?", "First posts can go live as soon as the next week.", False),
            ("Is there a contract?", "Most plans are month to month. A special offer may come with a set term, stated before signing. Ask about current specials.", False)]
    near = "".join(f'<li><a href="{city_file(s)}">{TRI}{e(CITY_BY_SLUG[s]["name"])}</a></li>' for s in c["near"] if s in CITY_BY_SLUG)
    focus_html = ""
    if focus:
        focus_html = section(f"Popular in {n}", f"Who we film most in {n}.", f"Three of the industries we work with most around {n}.",
            '<div class="grid-3">' + "".join(f'<a class="card" href="{industry_file(i["slug"])}"><span class="eyebrow">{e(i["name"])}</span><p>{e(i["intro"].split(". ")[0])}.</p><span class="btn text">{e(i["name"])} in {e(n)}</span></a>' for i in focus) + "</div>", "band bone")
    eb, h2 = WHY_VARIANTS[idx % 3]
    schema = {**BUSINESS, "areaServed": {"@type": "City", "name": f"{n}, MO"}}
    gal = section("Recent shoots", "Shot on real jobs.", f"A sample of the work we make for businesses around {n}.", gallery(idx, 5), "band dark")
    blocks = [section(eb.format(n=n), h2.format(n=n), c["local"], f'<p class="muted" style="max-width:70ch">We plan, film, edit and post content for {e(n)} businesses, and run Meta and Google ads aimed at {e(n)} and the surrounding area. <a href="content-creation.html">Monthly content</a> starts at $795/mo and <a href="paid-advertising.html">paid ads</a> at $1,150/mo.</p>'), focus_html,
              pricing_section("content", "band bone" if not focus_html else "band") + pricing_section("ads", "band bone" if focus_html else "band", anchor=False)]
    if idx % 2:
        blocks = [blocks[0], blocks[2], blocks[1]]
    body = page_head(f"{n}, MO", H1_VARIANTS[idx % 3].format(n=n), c["intro"], n, "See pricing") + "".join(blocks) + gal + reviews(2, idx) + \
        f"""<section class="band"><div class="wrap"><div class="band-head"><div class="stack">{eyebrow("Nearby")}<h2 class="display-l">We also serve.</h2></div><p class="body-l">Close to {e(n)} and on our regular routes.</p></div><ul class="areas">{near}<li><a href="areas.html">{TRI}All areas</a></li></ul></div></section>""" + \
        section("FAQ", f"{n} questions.", "", faq_html(faq), "band bone") + cta_band(f"Let's fill your schedule in {n}.")
    return page(city_file(c["slug"]), f"Video Production & Social Media Marketing in {n}, MO | Onyx Media",
                f"Video production, monthly social content and paid ads for local businesses in {n}, MO ({c['county']}). Content from $795/mo, ads from $1,150/mo.",
                body, None, extra_head=ld(schema) + faq_ld(faq))

# ---------------------------------------------------------------- write
def main():
    OUT.mkdir(exist_ok=True); ART.mkdir(exist_ok=True)
    pages = {"index.html": home(), "content-creation.html": content_page(), "paid-advertising.html": ads_page(),
             "work.html": work_page(), "about.html": about_page(), "contact.html": contact_page(), "thank-you.html": thanks_page(),
             "audit.html": audit_page(), "audit-thank-you.html": audit_thanks_page()}
    for c in CITIES:
        pages[city_file(c["slug"])] = city_page(c)
    pages["industries.html"] = industries_hub()
    pages["areas.html"] = areas_hub()
    pages["privacy.html"] = privacy_page()
    pages["terms.html"] = terms_page()
    for i in INDUSTRIES:
        pages[industry_file(i["slug"])] = industry_page(i)
    for name, text in pages.items():
        (OUT / name).write_text(text)
    (ART / "artifact-index.html").write_text(home(fragment=True))
    urls = "".join(f"<url><loc>{SITE_URL}/" + ("" if p == "index.html" else p) + "</loc></url>" for p in pages if p not in NO_SITEMAP)
    (OUT / "sitemap.xml").write_text(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>\n')
    (OUT / "robots.txt").write_text(("User-agent: *\nAllow: /\nDisallow: /admin/\n" if INDEXABLE else "User-agent: *\nDisallow: /\n") + f"Sitemap: {SITE_URL}/sitemap.xml\n")
    print(f"built {len(pages)} pages")

if __name__ == "__main__":
    main()

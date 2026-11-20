-- Onyx Media: package price list. Re-running updates prices/deliverables in place (no deletes).

insert into public.packages (name, category, monthly_price, setup_fee, deliverables, active) values
  ('Essential Content', 'content', 795.00, 0,
   'About 9 posts per month: 3 reels and 6 photo/graphic posts. Includes strategy, content calendar, photo/video capture, editing, captions, Facebook + Instagram publishing and monthly reporting.',
   true),
  ('Growth Content', 'content', 1495.00, 0,
   'About 15 posts per month: 6 reels and 9 photo/graphic posts. Includes strategy, content calendar, photo/video capture, editing, captions, Facebook + Instagram publishing and monthly reporting.',
   true),
  ('Domination Content', 'content', 2195.00, 0,
   'About 22 posts per month: 10 reels and 12 photo/graphic posts. Includes strategy, content calendar, photo/video capture, editing, captions, Facebook + Instagram publishing and monthly reporting.',
   true),
  ('Meta Ads (FB + IG)', 'ads', 1150.00, 625.00,
   'Facebook and Instagram ad management. Ad spend is paid directly to Meta.',
   true),
  ('Google Ads (Google + Bing)', 'ads', 1150.00, 625.00,
   'Google and Bing search ad management. Ad spend is paid directly to the platforms.',
   true),
  ('Meta + Google Ads', 'ads', 1950.00, 1025.00,
   'Meta (Facebook + Instagram) and Google + Bing ad management. Ad spend is paid directly to the platforms.',
   true)
on conflict (name) do update
  set category      = excluded.category,
      monthly_price = excluded.monthly_price,
      setup_fee     = excluded.setup_fee,
      deliverables  = excluded.deliverables,
      active        = excluded.active;

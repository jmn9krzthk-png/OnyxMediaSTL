# Deploying: Vercel + Convex

The site is the static page in `prototype/`. Vercel hosts it. Convex stores lead-form submissions in a `leads` table.

## How the build works

`vercel.json` runs `npm run build:vercel` (`scripts/vercel-build.mjs`):

1. If `CONVEX_DEPLOY_KEY` is set, it runs `npx convex deploy`. That pushes `convex/` (schema + functions) and then runs `scripts/build.mjs` with `CONVEX_URL` set to the deployment.
2. `scripts/build.mjs` copies `prototype/` into `dist/`. It adds the doctype, charset and viewport tags, and writes `dist/config.js` with the Convex URL.
3. Vercel serves `dist/`.

If `CONVEX_DEPLOY_KEY` is not set, the build still works. The form stays in prototype mode: it validates and shows the thank-you page but sends nothing.

## One-time setup

1. **Convex project.** Locally run `npm install`, then `npx convex dev`. Log in and create a project named `onyxmediastl`. This writes `.env.local` (git-ignored) and generates `convex/_generated/`.
2. **Deploy key.** In the Convex dashboard, open the project, then Settings → Deploy keys. Generate a **Production** deploy key.
3. **Vercel env var.** In the Vercel project, open Settings → Environment Variables. Add `CONVEX_DEPLOY_KEY` for **Production**. For preview deploys, add a **Preview** deploy key from Convex scoped to Preview.
4. Redeploy on Vercel.

## Reading leads

- Convex dashboard → Data → `leads`
- or `npx convex run leads:listRecent '{"limit": 20}'`

`leads:submit` is the only public function. `listRecent` is internal, so browsers can't read leads.

## Local preview

```
CONVEX_URL=https://<your-dev-deployment>.convex.cloud npm run build
npx serve dist
```

## Not wired yet

- Email to Max on new leads. Next step: a Convex action using Resend, scheduled from `leads:submit`.
- Lead tracker sheet sync
- GA4 / Meta conversion events on the thank-you view

// Vercel build entry. Deploys Convex functions first when a deploy key is set,
// then builds the site with that deployment's URL. Without a key it builds the static site only.
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });

if (process.env.CONVEX_DEPLOY_KEY) {
  run('npx convex deploy --cmd "node scripts/build.mjs" --cmd-url-env-var-name CONVEX_URL');
} else {
  console.warn("CONVEX_DEPLOY_KEY is not set: skipping Convex deploy.");
  run("node scripts/build.mjs");
}

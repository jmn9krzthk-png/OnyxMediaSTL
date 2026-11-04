import { internalQuery, mutation } from "./_generated/server";
import { v } from "convex/values";

const MAX = 2000;

function clean(value: string | undefined, field: string): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length > MAX) throw new Error(`${field} is too long`);
  return trimmed === "" ? undefined : trimmed;
}

function required(value: string, field: string): string {
  const trimmed = clean(value, field);
  if (!trimmed) throw new Error(`${field} is required`);
  return trimmed;
}

// Called from the public site (no auth). Validates on the server as well as in the browser.
export const submit = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    phone: v.string(),
    company: v.string(),
    trade: v.optional(v.string()),
    trucks: v.optional(v.string()),
    website: v.optional(v.string()),
    service: v.optional(v.string()),
    budget: v.optional(v.string()),
    timeline: v.optional(v.string()),
    message: v.optional(v.string()),
    page: v.optional(v.string()),
    // Honeypot: real visitors never see or fill this field.
    fax: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.fax) return null; // silently drop bots

    const email = required(args.email, "Email").toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Email is invalid");
    const phone = required(args.phone, "Mobile");
    if (phone.replace(/\D/g, "").length < 10) throw new Error("Mobile number is invalid");

    return await ctx.db.insert("leads", {
      name: required(args.name, "Name"),
      email,
      phone,
      company: required(args.company, "Company"),
      trade: clean(args.trade, "Business"),
      trucks: clean(args.trucks, "Trucks or bays"),
      website: clean(args.website, "Website"),
      service: clean(args.service, "Service interest"),
      budget: clean(args.budget, "Monthly budget"),
      timeline: clean(args.timeline, "Timeline"),
      message: clean(args.message, "Message"),
      page: clean(args.page, "Page"),
      status: "new",
    });
  },
});

// Not callable from the browser. Run from the Convex dashboard or `npx convex run leads:listRecent`.
export const listRecent = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    return await ctx.db.query("leads").order("desc").take(Math.min(limit ?? 50, 200));
  },
});

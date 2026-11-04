import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Strategy-call requests from the site's lead form.
  leads: defineTable({
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
    status: v.union(v.literal("new"), v.literal("contacted"), v.literal("closed")),
  })
    .index("by_status", ["status"])
    .index("by_email", ["email"]),
});

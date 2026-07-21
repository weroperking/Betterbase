/**
 * BetterBase Configuration File - Blog Template
 *
 * Content/blog starter. Uses the IaC-first structure with posts, tags,
 * and comments. No UI — pair with the client of your choice.
 *
 * Environment variables:
 * - DATABASE_URL: Connection string for your database provider
 */

import { defineConfig } from "@betterbase/core";
import type { BetterBaseConfig } from "@betterbase/core";

type ProviderType = "postgres" | "neon" | "supabase" | "planetscale" | "turso" | "managed";

export default defineConfig({
  project: {
    name: "my-betterbase-blog",
  },

  provider: {
    type: "postgres" as ProviderType,
    connectionString: process.env.DATABASE_URL,
  },

  graphql: {
    enabled: true,
  },

  autoRest: {
    enabled: true,
  },
}) satisfies BetterBaseConfig;

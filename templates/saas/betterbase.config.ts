/**
 * BetterBase Configuration File - SaaS Template
 *
 * SaaS boilerplate with auth, payments, and multi-tenancy.
 * Uses the IaC-first structure: betterbase/ functions + auto-migration.
 *
 * Environment variables:
 * - DATABASE_URL: Connection string for postgres, neon, supabase, planetscale
 * - BETTERBASE_AUTH_SECRET: Secret used to sign session tokens
 * - STRIPE_SECRET_KEY: Stripe secret key (no fake keys — supply via env)
 */

import { defineConfig } from "@betterbase/core";
import type { BetterBaseConfig } from "@betterbase/core";

type ProviderType = "postgres" | "neon" | "supabase" | "planetscale" | "turso" | "managed";

export default defineConfig({
  project: {
    name: "my-saas-app",
  },

  provider: {
    type: "postgres" as ProviderType,
    connectionString: process.env.DATABASE_URL,
  },

  auth: {
    enabled: true,
    // Secret used to sign/verify session tokens. Never hardcode — use env.
    secret: process.env.BETTERBASE_AUTH_SECRET,
  },

  graphql: {
    enabled: true,
  },

  autoRest: {
    enabled: true,
  },
}) satisfies BetterBaseConfig;

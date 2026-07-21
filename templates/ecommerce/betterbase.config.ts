/**
 * BetterBase Configuration File - E-commerce Template
 *
 * E-commerce starter. Uses the IaC-first structure with products, carts,
 * orders, and order items. Payment secrets are env-only (never stored).
 *
 * Environment variables:
 * - DATABASE_URL: Connection string for your database provider
 * - STRIPE_SECRET_KEY: Stripe secret key (no fake keys — supply via env)
 */

import { defineConfig } from "@betterbase/core";
import type { BetterBaseConfig } from "@betterbase/core";

type ProviderType = "postgres" | "neon" | "supabase" | "planetscale" | "turso" | "managed";

export default defineConfig({
  project: {
    name: "my-betterbase-ecommerce",
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

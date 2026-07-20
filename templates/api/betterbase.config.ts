/**
 * BetterBase Configuration File - API Template
 *
 * REST API focused project. No UI — just typed queries/mutations that
 * auto-expose CRUD-style HTTP endpoints. Uses the IaC-first structure.
 *
 * Environment variables:
 * - DATABASE_URL: Connection string for your database provider
 */

import { defineConfig } from "@betterbase/core";
import type { BetterBaseConfig } from "@betterbase/core";

type ProviderType = "postgres" | "neon" | "supabase" | "planetscale" | "turso" | "managed";

export default defineConfig({
  project: {
    name: "my-betterbase-api",
  },

  provider: {
    type: "postgres" as ProviderType,
    connectionString: process.env.DATABASE_URL,
  },

  graphql: {
    enabled: false,
  },

  autoRest: {
    enabled: true,
  },
}) satisfies BetterBaseConfig;

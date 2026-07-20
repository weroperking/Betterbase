/**
 * BetterBase Configuration File - Realtime Template
 *
 * WebSocket/realtime focused project. Uses the IaC-first structure with
 * realtime-friendly schema (rooms, messages, presence). Realtime
 * invalidations are emitted automatically by ctx.db writes.
 *
 * Environment variables:
 * - DATABASE_URL: Connection string for your database provider
 */

import { defineConfig } from "@betterbase/core";
import type { BetterBaseConfig } from "@betterbase/core";

type ProviderType = "postgres" | "neon" | "supabase" | "planetscale" | "turso" | "managed";

export default defineConfig({
  project: {
    name: "my-betterbase-realtime",
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

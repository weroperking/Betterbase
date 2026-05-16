import { createTestProject } from "./fixtures";

export const VALID_CONFIG_TS = `
import { defineConfig } from "@betterbase/core";

export default defineConfig({
  project: { name: "test-project" },
  provider: {
    type: "sqlite" as const,
    connectionString: "local.db",
  },
  storage: {
    provider: "s3" as const,
    bucket: "test-bucket",
    region: "us-east-1",
  },
  webhooks: [],
});
`;

export const CONFIG_WITH_WEBHOOKS = `
import { defineConfig } from "@betterbase/core";

export default defineConfig({
  project: { name: "test-project" },
  webhooks: [
    {
      id: "webhook-abc123",
      table: "users",
      events: ["INSERT", "UPDATE"],
      url: "process.env.WEBHOOK_USERS_URL",
      secret: "process.env.WEBHOOK_SECRET",
      enabled: true,
    },
  ],
});
`;

export const INVALID_CONFIG_TS = `
export default {
  project: { name: "test-project" },
  provider: {
    type: "invalid-provider",
  },
};
`;

export function createConfigProject(
  configContent: string = VALID_CONFIG_TS,
) {
  return createTestProject({
    "betterbase.config.ts": configContent,
    "package.json": JSON.stringify({ name: "test-project" }),
  });
}

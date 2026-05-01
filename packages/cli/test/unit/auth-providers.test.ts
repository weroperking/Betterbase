import { describe, expect, it } from "bun:test";
import {
  PROVIDER_TEMPLATES,
  getAvailableProviders,
  getProviderTemplate,
} from "../../src/commands/auth-providers";

describe("auth-providers", () => {
  describe("PROVIDER_TEMPLATES", () => {
    it("has entries for all 7 providers", () => {
      const providers = Object.keys(PROVIDER_TEMPLATES);
      expect(providers).toContain("google");
      expect(providers).toContain("github");
      expect(providers).toContain("discord");
      expect(providers).toContain("apple");
      expect(providers).toContain("microsoft");
      expect(providers).toContain("twitter");
      expect(providers).toContain("facebook");
      expect(providers.length).toBe(7);
    });

    it("each provider has required fields", () => {
      for (const [key, template] of Object.entries(PROVIDER_TEMPLATES)) {
        expect(template.name).toBeString();
        expect(template.displayName).toBeString();
        expect(Array.isArray(template.envVars)).toBe(true);
        expect(template.envVars.length).toBeGreaterThan(0);
        expect(template.configCode).toBeString();
        expect(template.configCode.length).toBeGreaterThan(0);
        expect(template.setupInstructions).toBeString();
        expect(template.docsUrl).toBeString();
        expect(template.docsUrl).toStartWith("https://");
      }
    });

    it("each provider config references correct env vars", () => {
      for (const [key, template] of Object.entries(PROVIDER_TEMPLATES)) {
        for (const envVar of template.envVars) {
          expect(template.configCode).toContain(envVar.key);
        }
      }
    });

    it("each template has correct callback URL pattern", () => {
      for (const [key, template] of Object.entries(PROVIDER_TEMPLATES)) {
        expect(template.configCode).toContain("/api/auth/callback/");
      }
    });
  });

  describe("getProviderTemplate", () => {
    it("returns template for valid provider name", () => {
      const template = getProviderTemplate("google");
      expect(template).not.toBeNull();
      expect(template!.name).toBe("google");
    });

    it("is case-insensitive", () => {
      const template = getProviderTemplate("GITHUB");
      expect(template).not.toBeNull();
      expect(template!.name).toBe("github");
    });

    it("returns null for unknown provider", () => {
      const template = getProviderTemplate("nonexistent");
      expect(template).toBeNull();
    });
  });

  describe("getAvailableProviders", () => {
    it("returns 7 provider names", () => {
      const providers = getAvailableProviders();
      expect(providers.length).toBe(7);
    });

    it("includes all expected providers", () => {
      const providers = getAvailableProviders();
      expect(providers).toContain("google");
      expect(providers).toContain("github");
      expect(providers).toContain("discord");
      expect(providers).toContain("apple");
      expect(providers).toContain("microsoft");
      expect(providers).toContain("twitter");
      expect(providers).toContain("facebook");
    });
  });
});

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import * as logger from "../utils/logger";
import { z } from "zod";

interface ValidationResult {
  valid: boolean;
  violations: string[];
}

const forbiddenPatterns = [
  { pattern: /src\/routes\//, message: "Hono routes in src/routes/ not allowed - use betterbase/queries or betterbase/mutations" },
  { pattern: /from ['"].*db['"]/, message: "Direct database imports not allowed - use ctx.db from IaC context" },
  { pattern: /import.*{.*Hono.*}/, message: "Hono imports not allowed in IaC projects" },
];

export async function runValidateProject(projectRoot: string): Promise<ValidationResult> {
  const result: ValidationResult = { valid: true, violations: [] };

  // Check for src/routes directory
  const routesDir = path.join(projectRoot, "src/routes");
  if (existsSync(routesDir)) {
    try {
      const files = await readdir(routesDir, { recursive: true });
      if (files.length > 0) {
        result.violations.push("Custom Hono routes detected in src/routes/ - use betterbase/mutations or betterbase/queries");
        result.valid = false;
      }
    } catch (err) {
      logger.error(`Failed to read routes directory: ${err}`);
      throw err;
    }
  }
  
  // Check for AGENTS.md
  const agentsPath = path.join(projectRoot, "AGENTS.md");
  if (!existsSync(agentsPath)) {
    result.violations.push("AGENTS.md not found - IaC constraints may not be enforced");
    result.valid = false;
  }
  
  if (result.valid) {
    logger.success("Project is IaC-compliant");
  } else {
    logger.error("IaC violations detected:");
    result.violations.forEach(v => logger.error(`  - ${v}`));
  }
  
  return result;
}
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export interface ProjectEnvironment {
  database: {
    provider: 'postgresql' | 'turso' | 'planetscale' | 'supabase' | 'neon';
    connectionString?: string;
    url?: string;
    authToken?: string;
  };
  auth: {
    secret?: string;
    url?: string;
  };
  storage: {
    provider?: string;
    bucket?: string;
    accessKey?: string;
    secretKey?: string;
    endpoint?: string;
  };
  ai: {
    openaiKey?: string;
    embeddingProvider?: string;
  };
  monitoring: {
    sentryDsn?: string;
    logLevel?: string;
  };
  custom: Record<string, string>;
}

export async function detectEnvironmentConfig(projectRoot: string): Promise<ProjectEnvironment> {
  const envConfig: ProjectEnvironment = {
    database: { provider: 'postgresql' },
    auth: {},
    storage: {},
    ai: {},
    monitoring: {},
    custom: {},
  };

  const envFiles = ['.env', '.env.local', '.env.development', '.env.staging', '.env.production'];
  
  for (const envFile of envFiles) {
    const filePath = path.join(projectRoot, envFile);
    if (!existsSync(filePath)) continue;
    
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=').trim();
      
      // Database detection
      if (key === 'DATABASE_URL') envConfig.database.connectionString = value;
      if (key === 'TURSO_URL') {
        envConfig.database.provider = 'turso';
        envConfig.database.url = value;
      }
      if (key === 'TURSO_AUTH_TOKEN') envConfig.database.authToken = value;
      if (key === 'DATABASE_URL' && value.includes('neon')) envConfig.database.provider = 'neon';
      if (key === 'DATABASE_URL' && value.includes('planetscale')) envConfig.database.provider = 'planetscale';
      
      // Auth
      if (key === 'AUTH_SECRET') envConfig.auth.secret = value;
      if (key === 'AUTH_URL') envConfig.auth.url = value;
      
      // Storage
      if (key === 'STORAGE_PROVIDER') envConfig.storage.provider = value;
      if (key === 'STORAGE_BUCKET') envConfig.storage.bucket = value;
      if (key === 'STORAGE_ACCESS_KEY') envConfig.storage.accessKey = value;
      if (key === 'STORAGE_SECRET_KEY') envConfig.storage.secretKey = value;
      if (key === 'STORAGE_ENDPOINT') envConfig.storage.endpoint = value;
      
      // AI
      if (key === 'OPENAI_API_KEY') envConfig.ai.openaiKey = value;
      
      // Monitoring
      if (key === 'SENTRY_DSN') envConfig.monitoring.sentryDsn = value;
      if (key === 'LOG_LEVEL') envConfig.monitoring.logLevel = value;
    }
  }
  
  // Read betterbase.config.ts
  const configPath = path.join(projectRoot, 'betterbase.config.ts');
  if (existsSync(configPath)) {
    const configContent = await readFile(configPath, 'utf-8');
    // Parse provider type from config
    const providerMatch = configContent.match(/type:\s*["']([^"']+)["']/);
    if (providerMatch) {
      const provider = providerMatch[1] as 'postgresql' | 'turso' | 'planetscale' | 'supabase' | 'neon';
      if (provider) envConfig.database.provider = provider;
    }
  }
  
  return envConfig;
}
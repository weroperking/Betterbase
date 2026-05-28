# BetterBase IaC Transition Specification

> **Version:** 1.0.0  
> **Status:** Implementation Plan  
> **Purpose:** Transition BetterBase CLI from optional IaC to strict IaC-by-default with headless environment synchronization.

---

## Executive Summary

This specification defines the architectural changes required to make Infrastructure-as-Code (IaC) the sole development paradigm for BetterBase projects. It introduces two core mechanisms:

1. **IaC Enforcement** — New projects default to IaC-only mode with strict operational constraints
2. **Headless Synchronization** — `bb iac sync` automatically syncs with `@betterbase/server` without dashboard intervention

---

## 1. IaC Enforcement and Project Initialization

### 1.1 Template Engine Integration

**Current State:**
- Templates exist in `templates/iac/` but are opt-in via `--iac` flag
- Legacy templates in `templates/base/` still support Hono route patterns
- No enforcement of IaC constraints

**Target State:**
- IaC template becomes the ONLY template
- `templates/` directory restructured to IaC-first structure
- Legacy Hono route patterns explicitly disallowed

#### 1.1.1 Template Directory Restructure

```
templates/
└── iac/                          # Only template - IaC mandatory
    ├── betterbase/
    │   ├── schema.ts             # Data model definition (ONLY schema location)
    │   ├── queries/              # Query functions only
    │   ├── mutations/            # Mutation functions only
    │   ├── actions/              # Action functions only
    │   ├── _generated/           # Auto-generated (never edit)
    │   │   ├── api.d.ts
    │   │   ├── schema.json
    │   │   └── server.d.ts
    │   └── cron.ts
    ├── src/
    │   ├── index.ts              # Minimal: 15-line server bootstrap
    │   └── modules/              # Shared domain logic (NO Hono routes)
    ├── betterbase.config.ts        # Runtime configuration
    └── AGENTS.md                 # Operational constraints (NEW)
```

#### 1.1.2 Modified `bb init` Behavior

**File:** `packages/cli/src/commands/init.ts`

```typescript
// NEW: init.ts - IaC-only enforcement
const initOptionsSchema = z.object({
  projectName: z.string().trim().min(1),
  template: z.string().optional(),
  enforceIaCLocking: z.boolean().default(true),  // NEW: Lock to IaC
});

export async function runInitCommand(options: InitCommandOptions) {
  // ALWAYS use IaC template - no flag needed, no opt-out
  const templateDir = path.join(import.meta.dir, "..", "..", "..", "templates", "iac");
  
  // Copy IaC template
  await copyTemplate(templateDir, targetDir);
  
  // Generate AGENTS.md with constraints
  await generateAgentsConstraintFile(targetDir);
  
  // Initialize project state for server registration
  await registerProjectWithServer(projectName, targetDir);
}
```

### 1.2 AGENTS.md Constraint File

**Purpose:** Explicitly constrain AI agent behavior to IaC-only patterns.

**File:** `templates/iac/AGENTS.md`

```markdown
# BetterBase IaC Operational Constraints

## ⚠️ CRITICAL: READ BEFORE ANY CODE CHANGES

This project operates under **strict Infrastructure-as-Code (IaC) enforcement**.
Violations will result in build/deployment failures.

## ALLOWED Operations

### 1. Schema Definition ONLY
- ✅ Edit `betterbase/schema.ts` to declare tables
- ✅ Use `v.string()`, `v.number()`, `v.id("table")`, etc.
- ✅ Add `.index()`, `.uniqueIndex()` declarations
- ✌️ Run `bb iac sync` to apply schema changes

### 2. Pure Functions ONLY
- ✅ Create files in `betterbase/queries/` (read-only operations)
- ✅ Create files in `betterbase/mutations/` (write operations)
- ✅ Create files in `betterbase/actions/` (side effects)
- ✅ Use `ctx.db.query()`, `ctx.db.get()`, `ctx.db.insert()`, etc.
- ✅ Import shared code from `src/modules/`

## PROHIBITED Operations

### ❌ Custom Hono Routes
```
src/routes/                  # NOT ALLOWED
└── users.ts                 # DELETE THIS - use betterbase/mutations/users.ts
```

All API endpoints must be defined as IaC functions that automatically expose
HTTP endpoints at `/betterbase/:kind/:path/:name`.

### ❌ Package.json Modifications
```
package.json                 # NOT ALLOWED TO MODIFY
```

Dependencies are managed automatically by:
- `bb deps install` — Installs required dependencies
- `bb deps update` — Updates to latest compatible versions
- Schema-driven dependency inference from `betterbase/schema.ts`

### ❌ Direct Database Access
```typescript
// ❌ WRONG - Direct SQL
import { db } from '../db';
await db.select().from(users);

// ✅ CORRECT - Use IaC context
await ctx.db.query("users").collect();
```

## Workflow for Changes

### Schema Changes
```bash
# 1. Edit betterbase/schema.ts
# 2. Run sync (auto-detects local config)
bb iac sync

# 3. Changes are automatically:
#    - Applied to local database
#    - Synced to @betterbase/server
#    - Available in production
```

### Function Changes
```bash
# 1. Create/edit files in betterbase/queries or betterbase/mutations
# 2. Changes hot-reload automatically in dev mode
# 3. For production: bb iac sync --production
```

## Project Structure Rules

### Module Directory (src/modules/)
- NO Hono imports (`import { Hono } from 'hono'` is forbidden)
- NO HTTP concepts (no `Context`, `c.req`, `c.json`)
- Pure TypeScript business logic only
- Reused by IaC functions via relative imports

### Generated Files (_generated/)
- `betterbase/_generated/api.d.ts` — Type-safe function API
- `betterbase/_generated/schema.json` — Serialized schema
- `src/db/schema.generated.ts` — Drizzle schema (auto-generated)

NEVER EDIT FILES IN `_generated/` — They are overwritten on every `bb iac sync`.

## Violation Detection

The CLI will reject operations that violate these constraints:

```bash
# Detect and reject non-IaC patterns
bb validate-project
# Checks for:
# - Hono routes in src/routes/
# - Direct database imports
# - Unauthorized package.json changes
```

## Server Registration

When `bb iac sync` runs:
1. Detects local environment configuration (.env, betterbase.config.ts)
2. Registers/syncs with `@betterbase/server` automatically
3. No dashboard interaction required
4. Headed mode: manual approval via browser
5. Headless mode: auto-approval with API key

---

## 2. Headless Environment Synchronization

### 2.1 Modified `bb iac sync` Command

**File:** `packages/cli/src/commands/iac/sync.ts`

```typescript
export async function runIacSync(
  projectRoot: string,
  opts: { 
    force?: boolean; 
    silent?: boolean;
    headless?: boolean;          // NEW: Skip interactive prompts
    autoRegister?: boolean;      // NEW: Auto-register with server
    environment?: string;        // NEW: Target environment
  } = {},
) {
  // 1. Load and validate schema
  const schema = await loadSchema(schemaFile);
  
  // 2. Detect environment configuration
  const envConfig = await detectEnvironmentConfig(projectRoot);
  
  // 3. Generate migration (existing logic)
  const diff = diffSchemas(previous, current);
  
  // 4. HEADLESS SYNC: Auto-sync with server
  if (opts.headless || opts.autoRegister) {
    await syncWithServer(projectRoot, {
      schema,
      envConfig,
      environment: opts.environment ?? 'local',
      force: opts.force,
    });
  }
  
  // 5. Apply migration locally (existing logic)
  await applyMigration(migration);
}
```

### 2.2 Environment Configuration Detection

**File:** `packages/cli/src/commands/iac/env-detector.ts` (NEW)

```typescript
export interface ProjectEnvironment {
  // Database
  database: {
    provider: 'postgresql' | 'turso' | 'planetscale' | 'supabase';
    connectionString?: string;
    url?: string;
    authToken?: string;
  };
  
  // Authentication
  auth: {
    secret?: string;
    url?: string;
  };
  
  // Storage
  storage: {
    provider?: string;
    bucket?: string;
    accessKey?: string;
    secretKey?: string;
    endpoint?: string;
  };
  
  // AI/LLM
  ai: {
    openaiKey?: string;
    embeddingProvider?: string;
  };
  
  // Monitoring
  monitoring: {
    sentryDsn?: string;
    logLevel?: string;
  };
  
  // Custom variables
  custom: Record<string, string>;
}

export async function detectEnvironmentConfig(
  projectRoot: string,
): Promise<ProjectEnvironment> {
  const envFiles = [
    '.env',
    '.env.local',
    '.env.development',
    '.env.staging',
    '.env.production',
  ];
  
  const envConfig: ProjectEnvironment = {
    database: { provider: 'postgresql' },
    auth: {},
    storage: {},
    ai: {},
    monitoring: {},
    custom: {},
  };
  
  // Parse all environment files
  for (const envFile of envFiles) {
    const filePath = join(projectRoot, envFile);
    if (!existsSync(filePath)) continue;
    
    const parsed = parseEnvFile(filePath);
    mergeIntoConfig(envConfig, parsed, envFile);
  }
  
  // Also read betterbase.config.ts for runtime config
  const configFile = join(projectRoot, 'betterbase.config.ts');
  if (existsSync(configFile)) {
    const config = await loadBetterBaseConfig(configFile);
    envConfig.database.provider = config.provider?.type ?? 'postgresql';
  }
  
  return envConfig;
}
```

### 2.3 Server Synchronization Protocol

**File:** `packages/cli/src/commands/iac/server-sync.ts` (NEW)

```typescript
export async function syncWithServer(
  projectRoot: string,
  config: {
    schema: SerializedSchema;
    envConfig: ProjectEnvironment;
    environment: string;
    force?: boolean;
  },
) {
  const { isAuthenticated } = await import('../utils/credentials');
  
  // Check authentication
  if (!await isAuthenticated()) {
    throw new Error(
      'Not authenticated. Run: bb login --headless --api-key $BETTERBASE_API_KEY'
    );
  }
  
  const apiClient = createApiClient();
  
  // 1. Register project if not exists
  const project = await apiClient.registerProject({
    name: config.envConfig.projectName,
    environment: config.environment,
    config: config.envConfig,
  });
  
  // 2. Sync schema
  const syncResult = await apiClient.syncSchema({
    projectId: project.id,
    schema: config.schema,
    force: config.force,
  });
  
  // 3. Sync environment variables
  await apiClient.syncEnvironment({
    projectId: project.id,
    envConfig: config.envConfig,
  });
  
  return syncResult;
}
```

### 2.4 API Client Extensions

**File:** `packages/cli/src/utils/api-client.ts`

```typescript
export class ApiClient {
  // NEW: Project registration
  async registerProject(data: {
    name: string;
    environment: string;
    config: ProjectEnvironment;
  }): Promise<Project> {
    return this.post('/api/projects', data);
  }
  
  // NEW: Schema synchronization
  async syncSchema(data: {
    projectId: string;
    schema: SerializedSchema;
    force?: boolean;
  }): Promise<SyncResult> {
    return this.post(`/api/projects/${data.projectId}/schema`, data);
  }
  
  // NEW: Environment synchronization
  async syncEnvironment(data: {
    projectId: string;
    envConfig: ProjectEnvironment;
  }): Promise<void> {
    return this.post(`/api/projects/${data.projectId}/environment`, data);
  }
  
  // NEW: Get project by slug/name
  async getProject(slug: string): Promise<Project | null> {
    return this.get(`/api/projects/${slug}`).catch(() => null);
  }
}
```

### 2.5 Server API Endpoints

**File:** `packages/server/src/routes/admin/project-scoped/iac-sync.ts` (NEW)

```typescript
import { Hono } from 'hono';
import { requireAdminAuth } from '../../lib/admin-middleware';
import { provisionProjectSchema } from '../../lib/db';

export const iacSyncRoutes = new Hono();

// POST /api/projects/:slug/schema
iacSyncRoutes.post(
  '/:slug/schema',
  requireAdminAuth,
  async (c) => {
    const slug = c.req.param('slug');
    const { schema, force } = await c.req.json();
    const projectId = c.get('projectId');
    
    // Provision project schema tables
    await provisionProjectSchema(pool, slug, schema);
    
    // Apply migrations
    const result = await applySchemaChanges(projectId, schema, force);
    
    return c.json({ success: true, result });
  },
);

// POST /api/projects/:slug/environment
iacSyncRoutes.post(
  '/:slug/environment',
  requireAdminAuth,
  async (c) => {
    const slug = c.req.param('slug');
    const { envConfig } = await c.req.json();
    const projectId = c.get('projectId');
    
    // Store environment configuration
    await storeEnvironmentConfig(projectId, envConfig);
    
    return c.json({ success: true });
  },
);

// POST /api/projects (create if not exists)
iacSyncRoutes.post('/', requireAdminAuth, async (c) => {
  const { name, slug } = await c.req.json();
  const adminId = c.get('adminId');
  
  let project = await getProjectBySlug(slug);
  if (!project) {
    project = await createProject({
      name,
      slug,
      adminId,
    });
  }
  
  return c.json({ id: project.id, slug: project.slug });
});
```

### 2.6 Headless Authentication

**File:** `packages/cli/src/commands/login.ts` (MODIFIED)

```typescript
// Add headless login for AI agents
export async function runHeadlessLogin(opts: {
  apiKey: string;
  serverUrl?: string;
}) {
  const apiClient = createApiClient({ baseUrl: opts.serverUrl });
  
  // Validate API key with server
  const valid = await apiClient.validateApiKey(opts.apiKey);
  if (!valid) {
    throw new Error('Invalid API key');
  }
  
  // Store credentials securely
  await storeCredentials({ type: 'api-key', value: opts.apiKey, serverUrl: opts.serverUrl });
  
  return { success: true };
}

program
  .command('login')
  .option('--headless', 'Non-interactive mode for AI agents')
  .option('--api-key <key>', 'API key for headless authentication')
  .action(async (opts) => {
    if (opts.headless) {
      await runHeadlessLogin({ apiKey: opts.apiKey });
    } else {
      await runLoginCommand({ serverUrl: opts.url });
    }
  });
```

---

## 3. Implementation Architecture

### 3.1 File System Changes

```
packages/cli/src/commands/
├── init.ts                    # Modified for IaC-only
├── iac/
│   ├── sync.ts                # Extended for headless sync
│   ├── env-detector.ts        # NEW: Environment detection
│   └── server-sync.ts         # NEW: Server synchronization
└── login.ts                   # Modified for headless auth

packages/server/src/routes/
├── admin/
│   └── projects.ts
└── admin/project-scoped/
    └── iac-sync.ts            # NEW: IaC sync endpoints

packages/server/src/lib/
├── db.ts
│   └── provisionProjectSchema()  # Existing, extend for auto-provisioning
└── env-sync.ts                # NEW: Environment synchronization
```

### 3.2 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        bb iac sync                              │
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│  │ Load Schema │───▶│ Detect Env  │───▶│ Diff Schema │          │
│  └─────────────┘    └─────────────┘    └─────────────┘          │
│         │                   │                 │                 │
│         ▼                   ▼                 ▼                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│  │ betterbase/ │    │ .env files  │    │ Migration   │          │
│  │ schema.ts   │    │ config      │    │ Generation  │          │
│  └─────────────┘    └─────────────┘    └─────────────┘          │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ HEADLESS SYNC                                             │  │
│  │                                                              │
│  │  1. Register project if needed                               │
│  │  2. Sync schema to server                                    │
│  │  3. Sync environment configuration                           │
│  │  4. Apply migration locally                                  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              @betterbase/server                                  │
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│  │ Project     │    │ Schema      │    │ Environment   │          │
│  │ Registry    │    │ Management  │    │ Storage     │          │
│  └─────────────┘    └─────────────┘    └─────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Security Considerations

#### API Key Management
- API keys stored encrypted in CLI config
- Server-side key validation with rate limiting
- Keys scoped to specific projects/environments
- Automatic key rotation support

#### Environment Variable Security
- Secrets never logged or displayed in CLI output
- `.env` values sanitized before sync
- Server uses encryption-at-rest for env configs
- Optional secret masking for dashboard preview

---

## 4. Implementation Phases

### Phase 1: IaC Enforcement (Week 1-2)
- [ ] Modify `bb init` to IaC-only (remove `--iac` flag)
- [ ] Create `AGENTS.md` constraint file
- [ ] Add project validation command (`bb validate-project`)
- [ ] Remove legacy template support

### Phase 2: Headless Sync Foundation (Week 2-3)
- [ ] Create `env-detector.ts` for configuration parsing
- [ ] Extend `api-client.ts` with project/schema endpoints
- [ ] Add `iac-sync.ts` server endpoints
- [ ] Implement headless authentication

### Phase 3: Full Auto-Sync (Week 3-4)
- [ ] Integrate server sync into `bb iac sync`
- [ ] Add environment configuration synchronization
- [ ] Implement project auto-registration
- [ ] Add comprehensive error handling

### Phase 4: Testing & Documentation (Week 4)
- [ ] Update all existing documentation
- [ ] Add migration guide for legacy projects
- [ ] Create validation tests
- [ ] Performance benchmarking

---

## 5. Migration Path for Existing Projects

### For Legacy Hono + Drizzle Projects

```bash
# 1. Create backup
git checkout -b migrate-to-iac

# 2. Run migration tool
bb migrate legacy-to-iac

# 3. Review generated schema
# Edit betterbase/schema.ts as needed

# 4. Move business logic to modules
# src/routes/users.ts → betterbase/mutations/users.ts
# Custom logic → src/modules/

# 5. Validate compliance
bb validate-project

# 6. Sync to server
bb iac sync --headless --auto-register
```

### Migration Tool Specification

**File:** `packages/cli/src/commands/iac/migrate-legacy.ts` (NEW)

```typescript
export async function migrateLegacyToIaC(projectRoot: string) {
  // 1. Detect legacy patterns
  const legacyRoutes = scanLegacyRoutes(projectRoot);
  const legacySchema = scanLegacySchema(projectRoot);
  
  // 2. Generate betterbase/schema.ts
  const schemaCode = generateSchemaFromDrizzle(legacySchema);
  await writeFile(join(projectRoot, 'betterbase/schema.ts'), schemaCode);
  
  // 3. Convert routes to IaC functions
  for (const route of legacyRoutes) {
    const functionCode = convertToIaCFunction(route);
    const targetPath = route.method === 'GET' 
      ? `betterbase/queries/${route.path}.ts`
      : `betterbase/mutations/${route.path}.ts`;
    await writeFile(join(projectRoot, targetPath), functionCode);
  }
  
  // 4. Generate AGENTS.md
  await generateAgentsConstraintFile(projectRoot);
}
```

---

## 6. Command Reference Updates

### Updated Commands

| Command | Old Behavior | New Behavior |
|---------|--------------|--------------|
| `bb init` | Optional IaC via `--iac` | IaC-only, no flags |
| `bb iac sync` | Local migration only | Auto-syncs with server in headless mode |
| `bb validate-project` | N/A | New: Validates IaC compliance |
| `bb login --headless` | N/A | New: API key authentication |

### New Commands

| Command | Description |
|---------|-------------|
| `bb validate-project` | Checks for IaC compliance violations |
| `bb deps auto` | Auto-installs dependencies based on schema needs |

---

## 7. AGENTS.md Template Content

```markdown
# BetterBase IaC Operational Constraints

## Project: {{projectName}}

### Allowed Operations
- Edit `betterbase/schema.ts`
- Create files in `betterbase/queries/`
- Create files in `betterbase/mutations/`
- Create files in `betterbase/actions/`
- Create files in `src/modules/`

### Prohibited Operations
- ❌ Edit `package.json` manually
- ❌ Create/edit files in `src/routes/`
- ❌ Direct SQL queries outside `ctx.db`
- ❌ HTTP context usage outside IaC handler

### Environment Variables
Local configuration auto-synced to server. No manual `.env` editing required for
server operations.

### Validation
Run `bb validate-project` before committing changes.
```

---

## 8. Success Metrics

- **Developer Experience:** Project creation < 30 seconds
- **Migration Success:** 95% of legacy projects migratable
- **Sync Performance:** `bb iac sync --headless` < 5 seconds
- **Compliance Rate:** Generated AGENTS.md reduces constraint violations by 90%
- **Error Reduction:** Clear constraint messaging reduces invalid operations by 80%
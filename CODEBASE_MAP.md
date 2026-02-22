# BetterBase — Complete Codebase Map

> Auto-generated. Regenerate with: [paste this prompt into Cursor]
> Last updated: 2026-02-22

## Project Identity

**BetterBase** is an AI-native Backend-as-a-Service (BaaS) platform inspired by Supabase. It provides a TypeScript-first developer experience with a focus on AI context generation, Docker-less local development, and zero lock-in. The stack is built on **Bun** (runtime), **Turborepo** (monorepo), **Hono** (API framework), **Drizzle ORM** (database), and **BetterAuth** (authentication: AI-first context). The philosophy emphasizes generation via `.betterbase-context.json`, sub-100ms startup with `bun:sqlite`, user-owned schemas, and strict TypeScript with Zod validation everywhere.

## Monorepo Structure Overview

```
betterbase/
├── apps/
│   └── dashboard/              # Next.js dashboard/studio app
├── packages/
│   ├── cli/                    # Canonical @betterbase/cli implementation
│   ├── core/                   # Core backend engine (fully implemented)
│   ├── client/                 # @betterbase/client SDK
│   └── shared/                 # Shared utilities/types
├── templates/
│   ├── base/                   # Bun + Hono + Drizzle starter template
│   └── auth/                   # Auth template with BetterAuth
├── turbo.json                  # Turborepo task configuration
├── tsconfig.base.json          # Shared TypeScript config
└── package.json                # Root workspace config
```

---

## apps/dashboard

Next.js 15 dashboard application for managing BetterBase backends (like Supabase Studio).

### Configuration Files

### [`apps/dashboard/package.json`](apps/dashboard/package.json)
**Purpose:** Package manifest for dashboard app.
- **Name:** `@betterbase/dashboard`
- **Key Dependencies:** `next@^15.2.0`, `react@^19.0.0`, `@tanstack/react-query@^5.67.0`, `recharts@^2.15.0`, `@betterbase/client` (workspace), `lucide-react`, Radix UI components, `tailwind-merge`, `zod`
- **External Deps:** `next`, `react`, `@tanstack/react-query`, `recharts`, `@betterbase/client`, `lucide-react`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-slot`, `@radix-ui/react-tabs`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tailwindcss-animate`, `zod`

### [`apps/dashboard/README.md`](apps/dashboard/README.md)
**Purpose:** Dashboard application documentation.

### [`apps/dashboard/tsconfig.json`](apps/dashboard/tsconfig.json)
**Purpose:** TypeScript config for Next.js with path alias `@/*` → `./src/*`.

### [`apps/dashboard/next.config.ts`](apps/dashboard/next.config.ts)
**Purpose:** Next.js configuration with React strict mode enabled.
- **Exports:** `nextConfig` - NextConfig object
- **Usage Patterns:** Loaded by Next.js build system to configure the application.
- **Implementation Details:** Minimal config with React strict mode for development warnings.
- **External Deps:** `next`

### [`apps/dashboard/tailwind.config.ts`](apps/dashboard/tailwind.config.ts)
**Purpose:** Tailwind CSS configuration with shadcn/ui-style CSS variables for theming.
- **Exports:** `config` - Tailwind Config with dark mode, custom colors, border radius variables
- **Usage Patterns:** Used by Tailwind build process to generate CSS classes.
- **Implementation Details:** Defines CSS variables for colors, spacing, border radius supporting light/dark themes.
- **External Deps:** `tailwindcss`, `tailwindcss-animate`

### [`apps/dashboard/postcss.config.mjs`](apps/dashboard/postcss.config.mjs)
**Purpose:** PostCSS configuration using `@tailwindcss/postcss`.
- **External Deps:** `@tailwindcss/postcss`, `tailwindcss`, `postcss`, `autoprefixer`

### [`apps/dashboard/next-env.d.ts`](apps/dashboard/next-env.d.ts)
**Purpose:** Next.js TypeScript reference for type checking.

### App Pages

### [`apps/dashboard/src/app/layout.tsx`](apps/dashboard/src/app/layout.tsx)
**Purpose:** Root layout component with Inter font and providers.
- **Exports:** `RootLayout` - default export, `metadata` - page metadata
- **Internal Deps:** `@/components/providers`, `@/app/globals.css`
- **Usage Patterns:** Wraps all pages with providers and applies global styles.
- **Implementation Details:** Uses Inter font from next/font/google, sets up React Query provider.
- **External Deps:** `next/font`, `react`, `@tanstack/react-query`

### [`apps/dashboard/src/app/globals.css`](apps/dashboard/src/app/globals.css)
**Purpose:** Global CSS with Tailwind import and CSS custom properties for light/dark themes.

### Auth Pages

### [`apps/dashboard/src/app/(auth)/login/page.tsx`](apps/dashboard/src/app/(auth)/login/page.tsx)
**Purpose:** Login page component with card UI.
- **Exports:** `LoginPage` - default export
- **Internal Deps:** `@/components/ui/card`
- **Usage Patterns:** Rendered when users navigate to `/login`. Uses shadcn/ui card component.
- **External Deps:** `react`, `lucide-react`

### [`apps/dashboard/src/app/(auth)/signup/page.tsx`](apps/dashboard/src/app/(auth)/signup/page.tsx)
**Purpose:** Signup page component with card UI.
- **Exports:** `SignupPage` - default export
- **Internal Deps:** `@/components/ui/card`
- **Usage Patterns:** Rendered when users navigate to `/signup`. Uses shadcn/ui card component.
- **External Deps:** `react`, `lucide-react`

### Dashboard Pages

### [`apps/dashboard/src/app/(dashboard)/layout.tsx`](apps/dashboard/src/app/(dashboard)/layout.tsx)
**Purpose:** Dashboard layout with sidebar and header.
- **Exports:** `DashboardLayout` - default export
- **Internal Deps:** `@/components/layout/header`, `@/components/layout/sidebar`
- **Usage Patterns:** Wraps all dashboard pages with consistent layout structure.
- **External Deps:** `react`

### [`apps/dashboard/src/app/(dashboard)/page.tsx`](apps/dashboard/src/app/(dashboard)/page.tsx)
**Purpose:** Main dashboard page with stats cards and API usage chart.
- **Exports:** `DashboardPage` - default export
- **Internal Deps:** `@/components/charts/api-usage-chart`, `@/components/ui/card`, `lucide-react`
- **Usage Patterns:** Landing page for dashboard, shows overview metrics.
- **Implementation Details:** Displays API usage chart with Recharts, stat cards with icons.
- **External Deps:** `react`, `recharts`, `lucide-react`

### [`apps/dashboard/src/app/(dashboard)/api-explorer/page.tsx`](apps/dashboard/src/app/(dashboard)/api-explorer/page.tsx)
**Purpose:** API explorer page - interactive REST API testing interface.
- **Exports:** `ApiPage` - default export
- **Features:** Endpoint listing, request builder, response viewer, headers configuration
- **Usage Patterns:** Developers use to test API endpoints directly from the dashboard.
- **Implementation Details:** Lists all available endpoints, provides request builder UI, shows formatted JSON responses. Supports GET, POST, PUT, DELETE methods.
- **External Deps:** `react`, `lucide-react`

### [`apps/dashboard/src/app/(dashboard)/auth/page.tsx`](apps/dashboard/src/app/(dashboard)/auth/page.tsx)
**Purpose:** Authentication manager page - manage users, sessions, and providers.
- **Exports:** `AuthManagerPage` - default export
- **Features:** User list, session management, provider configuration, user creation
- **Usage Patterns:** Admins manage authentication settings and view user sessions.
- **Implementation Details:** Lists users from the auth system, shows active sessions, configures auth providers. Supports email/password and OAuth providers.
- **External Deps:** `react`, `lucide-react`

### [`apps/dashboard/src/app/(dashboard)/logs/page.tsx`](apps/dashboard/src/app/(dashboard)/logs/page.tsx)
**Purpose:** Logs viewer page - view application and API request logs.
- **Exports:** `LogsPage` - default export
- **Features:** Log filtering by level, search, timestamp filtering, export functionality
- **Usage Patterns:** Developers debug issues by viewing application logs.
- **Implementation Details:** Provides filtering by log level (info, warn, error), search by message content, export to file. Displays timestamp, level, message, and metadata.
- **External Deps:** `react`, `lucide-react`

### [`apps/dashboard/src/app/(dashboard)/settings/page.tsx`](apps/dashboard/src/app/(dashboard)/settings/page.tsx)
**Purpose:** Project settings page.
- **Exports:** `SettingsPage` - default export
- **Usage Patterns:** Configure project-level settings.

### [`apps/dashboard/src/app/(dashboard)/tables/page.tsx`](apps/dashboard/src/app/(dashboard)/tables/page.tsx)
**Purpose:** Tables browser page.
- **Exports:** `TablesPage` - default export
- **Internal Deps:** `@/components/tables/table-browser`
- **Usage Patterns:** Browse all database tables in the project.
- **External Deps:** `react`

### [`apps/dashboard/src/app/(dashboard)/tables/[table]/page.tsx`](apps/dashboard/src/app/(dashboard)/tables/[table]/page.tsx)
**Purpose:** Dynamic table editor page.
- **Exports:** `TableDetailPage` - default export (async)
- **Internal Deps:** `@/components/tables/table-editor`
- **Usage Patterns:** View and edit table data for a specific table.
- **External Deps:** `react`

### Components

### [`apps/dashboard/src/components/providers.tsx`](apps/dashboard/src/components/providers.tsx)
**Purpose:** React Query provider component.
- **Exports:** `Providers` - client component with QueryClientProvider
- **Internal Deps:** `@tanstack/react-query`
- **Usage Patterns:** Wraps application with React Query context for data fetching.
- **Implementation Details:** Creates QueryClient with default options, provides to entire app tree.
- **External Deps:** `@tanstack/react-query`, `react`

### Charts Components

### [`apps/dashboard/src/components/charts/api-usage-chart.tsx`](apps/dashboard/src/components/charts/api-usage-chart.tsx)
**Purpose:** API usage area chart component using Recharts.
- **Exports:** `ApiUsageChart` - client component
- **Usage Patterns:** Displays API usage over time as an area chart.
- **Implementation Details:** Uses Recharts AreaChart with gradient fill, responsive container.
- **External Deps:** `recharts`, `react`

### Layout Components

### [`apps/dashboard/src/components/layout/header.tsx`](apps/dashboard/src/components/layout/header.tsx)
**Purpose:** Dashboard header with theme toggle, mobile menu, and user dropdown.
- **Exports:** `Header` - client component
- **Internal Deps:** `@/components/layout/sidebar`, `@/components/ui/button`, `@/components/ui/dropdown-menu`, Radix Dialog
- **Usage Patterns:** Persistent header across all dashboard pages.
- **Implementation Details:** Uses Radix UI Dialog for mobile menu, DropdownMenu for user actions.
- **External Deps:** `react`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `lucide-react`

### [`apps/dashboard/src/components/layout/sidebar.tsx`](apps/dashboard/src/components/layout/sidebar.tsx)
**Purpose:** Dashboard sidebar navigation.
- **Exports:** `Sidebar` - client component, `navigation` - array of nav items
- **Internal Deps:** `@/lib/utils`
- **Usage Patterns:** Primary navigation for dashboard sections.
- **Implementation Details:** Collapsible sidebar with icons, active state highlighting.
- **External Deps:** `react`, `lucide-react`, `clsx`, `tailwind-merge`

### Tables Components

### [`apps/dashboard/src/components/tables/table-browser.tsx`](apps/dashboard/src/components/tables/table-browser.tsx)
**Purpose:** Table browser component showing list of tables.
- **Exports:** `TableBrowser` - component
- **Usage Patterns:** Displays list of database tables user can select from.
- **External Deps:** `react`, `lucide-react`

### [`apps/dashboard/src/components/tables/table-editor.tsx`](apps/dashboard/src/components/tables/table-editor.tsx)
**Purpose:** Table editor component for viewing and editing table data.
- **Exports:** `TableEditor` - component
- **Usage Patterns:** Edit individual rows within a table.
- **Implementation Details:** Provides data grid view with inline editing capabilities.
- **External Deps:** `react`, `lucide-react`

### UI Components

### [`apps/dashboard/src/components/ui/button.tsx`](apps/dashboard/src/components/ui/button.tsx)
**Purpose:** Button component with variants using class-variance-authority.
- **Exports:** `Button` - forwardRef component, `ButtonProps` - interface, `buttonVariants` - variant function
- **Internal Deps:** `@/lib/utils`, `@radix-ui/react-slot`, `class-variance-authority`
- **Usage Patterns:** Reusable button across all dashboard components with variant support.
- **Implementation Details:** Uses cva for variant definitions, supports default, destructive, outline, secondary, ghost, link variants.
- **External Deps:** `react`, `class-variance-authority`, `@radix-ui/react-slot`

### [`apps/dashboard/src/components/ui/card.tsx`](apps/dashboard/src/components/ui/card.tsx)
**Purpose:** Card component with header, content, footer, description subcomponents.
- **Exports:** `Card`, `CardHeader`, `CardFooter`, `CardTitle`, `CardDescription`, `CardContent` - forwardRef components
- **Internal Deps:** `@/lib/utils`
- **Usage Patterns:** Container for grouped content with consistent styling.
- **External Deps:** `react`, `clsx`, `tailwind-merge`

### [`apps/dashboard/src/components/ui/dropdown-menu.tsx`](apps/dashboard/src/components/ui/dropdown-menu.tsx)
**Purpose:** Dropdown menu component wrapping Radix UI primitives.
- **Exports:** `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuLabel`, `DropdownMenuSeparator`, `DropdownMenuGroup`, `DropdownMenuPortal`, `DropdownMenuSub`, `DropdownMenuSubContent`, `DropdownMenuSubTrigger`, `DropdownMenuRadioGroup`
- **Internal Deps:** `@/lib/utils`, `@radix-ui/react-dropdown-menu`
- **Usage Patterns:** Accessible dropdown menus for actions, selections.
- **Implementation Details:** Thin wrapper around Radix UI DropdownMenu with Tailwind styling.
- **External Deps:** `react`, `@radix-ui/react-dropdown-menu`, `clsx`, `tailwind-merge`

### Hooks

### [`apps/dashboard/src/hooks/use-betterbase.ts`](apps/dashboard/src/hooks/use-betterbase.ts)
**Purpose:** React Query hook for fetching current user.
- **Exports:** `useCurrentUser` - hook returning UseQueryResult
- **Internal Deps:** `@/lib/betterbase`, `@tanstack/react-query`
- **Usage Patterns:** Used by components that need authenticated user data.
- **Implementation Details:** Wraps client.auth.getUser() in useQuery for caching and refetching.
- **External Deps:** `@tanstack/react-query`, `@betterbase/client`

### Lib Utilities

### [`apps/dashboard/src/lib/betterbase.ts`](apps/dashboard/src/lib/betterbase.ts)
**Purpose:** BetterBase client singleton instance.
- **Exports:** `betterbase` - BetterBaseClient instance
- **Internal Deps:** `@betterbase/client`
- **Env:** `NEXT_PUBLIC_BETTERBASE_URL`
- **Usage Patterns:** Imported throughout dashboard to interact with BetterBase backend.
- **Implementation Details:** Creates client with environment variable for backend URL.
- **External Deps:** `@betterbase/client`

### [`apps/dashboard/src/lib/utils.ts`](apps/dashboard/src/lib/utils.ts)
**Purpose:** Utility function for merging Tailwind classes.
- **Exports:** `cn` - class merging function
- **Internal Deps:** `clsx`, `tailwind-merge`
- **Usage Patterns:** Used by all UI components to merge Tailwind classes conditionally.
- **Implementation Details:** Combines clsx and tailwind-merge for robust class string merging.
- **External Deps:** `clsx`, `tailwind-merge`

### Types

### [`apps/dashboard/src/types/betterbase-client.d.ts`](apps/dashboard/src/types/betterbase-client.d.ts)
**Purpose:** TypeScript module declaration for `@betterbase/client`.
- **Exports:** Type declaration for `createClient` function
- **Usage Patterns:** Provides type checking for the BetterBase client library.
- **Implementation Details:** Module augmentation for the client package types.

---

## packages/cli

Canonical `@betterbase/cli` implementation - the `bb` command-line tool.

### Configuration Files

### [`packages/cli/package.json`](packages/cli/package.json)
**Purpose:** Package manifest for CLI.
- **Name:** `@betterbase/cli`
- **Version:** `0.1.0`
- **Bin:** `bb` → `./dist/index.js`
- **Exports:** `.` → `./src/index.ts`
- **Dependencies:** `chalk@^5.3.0`, `commander@^12.1.0`, `inquirer@^10.2.2`, `zod@^3.23.8`
- **External Deps:** `chalk`, `commander`, `inquirer`, `zod`

### [`packages/cli/tsconfig.json`](packages/cli/tsconfig.json)
**Purpose:** TypeScript config extending base with Bun types.

### Main Entry Points

### [`packages/cli/src/index.ts`](packages/cli/src/index.ts)
**Purpose:** Main CLI entry point with Commander.js program setup.
- **Exports:** `createProgram()` - returns configured Commander program, `runCli(argv)` - executes CLI
- **Internal Deps:** `./commands/init`, `./commands/dev`, `./commands/migrate`, `./commands/auth`, `./commands/generate`, `./commands/function`, `./commands/graphql`, `./commands/rls`, `./commands/storage`, `./commands/webhook`, `./utils/logger`
- **Usage Patterns:** Entry point executed when `bb` command is run. Sets up all subcommands.
- **Implementation Details:** Uses Commander.js for CLI structure, defines global options, registers all commands.
- **External Deps:** `commander`, `chalk`

### [`packages/cli/src/build.ts`](packages/cli/src/build.ts)
**Purpose:** Build script for bundling CLI as standalone executable.
- **Exports:** `buildStandaloneCli()` - builds with Bun.build
- **Usage Patterns:** Called during package build to create distributable CLI.
- **Implementation Details:** Uses Bun.build to bundle CLI into single executable.
- **External Deps:** `bun`

### [`packages/cli/src/constants.ts`](packages/cli/src/constants.ts)
**Purpose:** Shared constants.
- **Exports:** `DEFAULT_DB_PATH` - `'local.db'`
- **Usage Patterns:** Referenced by CLI commands for default values.
- **External Deps:** None (constants only)

### CLI Commands

### [`packages/cli/src/commands/init.ts`](packages/cli/src/commands/init.ts)
**Purpose:** `bb init` command - scaffolds new BetterBase projects.
- **Exports:** `runInitCommand(options)` - main command function, `InitCommandOptions` - type
- **Key Functions:** `installDependencies()`, `initializeGitRepository()`, `buildPackageJson()`, `buildDrizzleConfig()`, `buildSchema()`, `buildMigrateScript()`, `buildDbIndex()`, `buildAuthMiddleware()`, `buildReadme()`, `buildRoutesIndex()`, `writeProjectFiles()`
- **Internal Deps:** `../utils/logger`, `../utils/prompts`, `../utils/provider-prompts`
- **Usage Patterns:** Typically called by developers starting a new project. Uses interactive prompts to gather project name, database mode, and options. Creates a complete project structure with sensible defaults.
- **Implementation Details:** Uses Inquirer for interactive prompts, writes files synchronously using fs module. Supports three database modes: local (SQLite), neon (PostgreSQL), turso (LibSQL), postgres, planetscale, supabase. Generates Zod-validated config. Implements file templating with template literals for code generation.
- **External Deps:** `inquirer`, `zod`, `chalk`
- **Cross-Ref:** [`packages/cli/src/utils/prompts.ts`](packages/cli/src/utils/prompts.ts), [`templates/base/`](templates/base/)

### [`packages/cli/src/commands/dev.ts`](packages/cli/src/commands/dev.ts)
**Purpose:** `bb dev` command - watches schema/routes and regenerates context.
- **Exports:** `runDevCommand(projectRoot)` - returns cleanup function
- **Internal Deps:** `../utils/context-generator`, `../utils/logger`
- **Usage Patterns:** Runs during development to continuously regenerate `.betterbase-context.json` as files change.
- **Implementation Details:** Sets up file watchers on schema and routes directories, triggers context regeneration on changes. Returns cleanup function to stop watchers.
- **External Deps:** `bun`, `chalk`
- **Cross-Ref:** [`packages/cli/src/utils/context-generator.ts`](packages/cli/src/utils/context-generator.ts)

### [`packages/cli/src/commands/migrate.ts`](packages/cli/src/commands/migrate.ts)
**Purpose:** `bb migrate` commands - generates and applies migrations with safety checks.
- **Exports:** `runMigrateCommand(options)` - main function, `MigrateCommandOptions` - type, `MigrationChange` - interface, `MigrationChangeType` - type
- **Key Functions:** `runDrizzleKit()`, `listSqlFiles()`, `analyzeMigration()`, `displayDiff()`, `confirmDestructive()`, `backupDatabase()`, `restoreBackup()`, `splitStatements()`, `collectChangesFromGenerate()`
- **Internal Deps:** `../constants`, `../utils/logger`, `../utils/prompts`
- **Usage Patterns:** Called during database schema changes. Generates migration files, optionally previews changes, applies with safety checks.
- **Implementation Details:** Wraps DrizzleKit for migration generation. Implements visual diff display with color-coded changes. Prompts for confirmation on destructive operations. Creates automatic backups before dangerous migrations. Parses SQL files to extract migration metadata.
- **External Deps:** `drizzle-orm`, `drizzle-kit`, `inquirer`, `chalk`, `zod`

### [`packages/cli/src/commands/auth.ts`](packages/cli/src/commands/auth.ts)
**Purpose:** `bb auth setup` command - scaffolds BetterAuth integration.
- **Exports:** `runAuthSetupCommand(projectRoot)` - main function
- **Key Constants:** `AUTH_SCHEMA_BLOCK` - sessions/accounts tables SQL, `AUTH_ROUTE_FILE` - auth routes template, `AUTH_MIDDLEWARE_FILE` - requireAuth/optionalAuth middleware
- **Key Functions:** `appendIfMissing()`, `ensurePasswordHashColumn()`, `ensureAuthInConfig()`, `ensureEnvVar()`, `ensureRoutesIndexHook()`
- **Internal Deps:** `../utils/logger`
- **Usage Patterns:** Run after project initialization to add authentication. Modifies existing files to integrate BetterAuth.
- **Implementation Details:** Injects SQL schema blocks into existing schema file, adds auth routes to routes index, creates auth middleware. Uses file patching rather than full file generation for integration.
- **External Deps:** `better-auth`, `chalk`
- **Cross-Ref:** [`templates/auth/`](templates/auth/)

### [`packages/cli/src/commands/generate.ts`](packages/cli/src/commands/generate.ts)
**Purpose:** `bb generate crud` command - generates CRUD routes for a table.
- **Exports:** `runGenerateCrudCommand(projectRoot, tableName)` - main function
- **Key Functions:** `toSingular()`, `schemaTypeToZod()`, `buildSchemaShape()`, `buildFilterableColumns()`, `buildFilterCoercers()`, `generateRouteFile()`, `updateMainRouter()`, `ensureRealtimeUtility()`, `ensureZodValidatorInstalled()`
- **Internal Deps:** `../utils/schema-scanner`, `../utils/logger`
- **Usage Patterns:** Called after creating a database table to auto-generate REST API routes. Saves developers from writing boilerplate CRUD code.
- **Implementation Details:** Scans Drizzle schema to understand table structure. Maps Drizzle column types to Zod schemas. Generates Hono routes with type-safe handlers. Updates route index to register new endpoints.
- **External Deps:** `zod`, `hono`, `drizzle-orm`, `chalk`
- **Cross-Ref:** [`packages/cli/src/utils/scanner.ts`](packages/cli/src/utils/scanner.ts)

### [`packages/cli/src/commands/function.ts`](packages/cli/src/commands/function.ts)
**Purpose:** `bb function` commands - manage serverless edge functions.
- **Exports:** `runFunctionCommand(program)` - main function
- **Key Functions:** `deployFunction()`, `listFunctions()`, `deleteFunction()`, `invokeFunction()`
- **Subcommands:** `deploy`, `list`, `delete`, `invoke`
- **Internal Deps:** `../utils/logger`, `../../core/src/functions/deployer`
- **Usage Patterns:** Deploy and manage serverless edge functions.
- **Implementation Details:** Handles function bundling, deployment to edge runtime, invocation for testing.
- **External Deps:** `chalk`, `commander`

### [`packages/cli/src/commands/graphql.ts`](packages/cli/src/commands/graphql.ts)
**Purpose:** `bb graphql` commands - manage GraphQL API.
- **Exports:** `runGraphqlCommand(program)` - main function
- **Key Functions:** `generateSchema()`, `exportSDL()`, `startServer()`, `validateSchema()`
- **Subcommands:** `generate`, `sdl`, `serve`, `validate`
- **Internal Deps:** `../utils/logger`, `../../core/src/graphql/schema-generator`, `../../core/src/graphql/sdl-exporter`, `../../core/src/graphql/server`
- **Usage Patterns:** Generate GraphQL schema from database, export SDL, start GraphQL server, validate schema.
- **Implementation Details:** Integrates with core GraphQL modules for schema generation and serving.
- **External Deps:** `chalk`, `commander`

### [`packages/cli/src/commands/rls.ts`](packages/cli/src/commands/rls.ts)
**Purpose:** `bb rls` commands - manage Row-Level Security policies.
- **Exports:** `runRlsCommand(program)` - main function
- **Key Functions:** `scanPolicies()`, `generatePolicy()`, `applyPolicies()`, `verifyPolicies()`
- **Subcommands:** `scan`, `generate`, `apply`, `verify`
- **Internal Deps:** `../utils/logger`, `../../core/src/rls/scanner`, `../../core/src/rls/generator`
- **Usage Patterns:** Scan existing RLS policies, generate new policies, apply to database, verify policy effectiveness.
- **Implementation Details:** Integrates with core RLS modules for policy management.
- **External Deps:** `chalk`, `commander`

### [`packages/cli/src/commands/storage.ts`](packages/cli/src/commands/storage.ts)
**Purpose:** `bb storage` commands - manage file storage.
- **Exports:** `runStorageCommand(program)` - main function
- **Key Functions:** `uploadFile()`, `downloadFile()`, `listBuckets()`, `createBucket()`, `deleteBucket()`, `generateSignedUrl()`
- **Subcommands:** `upload`, `download`, `ls`, `mb`, `rm`, `sign`
- **Internal Deps:** `../utils/logger`, `../../core/src/storage`
- **Usage Patterns:** Manage object storage buckets and files.
- **Implementation Details:** Interfaces with storage module for S3-compatible operations.
- **External Deps:** `chalk`, `commander`

### [`packages/cli/src/commands/webhook.ts`](packages/cli/src/commands/webhook.ts)
**Purpose:** `bb webhook` commands - manage webhooks.
- **Exports:** `runWebhookCommand(program)` - main function
- **Key Functions:** `registerWebhook()`, `listWebhooks()`, `deleteWebhook()`, `testWebhook()`, `retryWebhook()`
- **Subcommands:** `create`, `ls`, `rm`, `test`, `retry`
- **Internal Deps:** `../utils/logger`, `../../core/src/webhooks`
- **Usage Patterns:** Register, list, delete, test, and retry webhooks.
- **Implementation Details:** Integrates with webhook dispatcher and startup modules.
- **External Deps:** `chalk`, `commander`

### CLI Utilities

### [`packages/cli/src/utils/logger.ts`](packages/cli/src/utils/logger.ts)
**Purpose:** Colored console logging utilities.
- **Exports:** `info(message)`, `warn(message)`, `error(message)`, `success(message)`
- **Internal Deps:** `chalk`
- **Usage Patterns:** Used throughout CLI commands for consistent, colored output.
- **Implementation Details:** Thin wrapper around Chalk with pre-configured color schemes. Info = cyan, Warn = yellow, Error = red, Success = green.
- **External Deps:** `chalk`

### [`packages/cli/src/utils/prompts.ts`](packages/cli/src/utils/prompts.ts)
**Purpose:** Interactive prompt utilities wrapping Inquirer.
- **Exports:** `text(options)`, `confirm(options)`, `select(options)`
- **Internal Deps:** `inquirer`, `zod`
- **Usage Patterns:** Used by CLI commands that need user input during execution.
- **Implementation Details:** Wraps Inquirer with Zod validation on input. Provides typed promise-based API.
- **External Deps:** `inquirer`, `zod`

### [`packages/cli/src/utils/provider-prompts.ts`](packages/cli/src/utils/provider-prompts.ts)
**Purpose:** Database provider selection prompts.
- **Exports:** `promptDatabaseProvider()`, `promptProviderCredentials()`, `validateProviderConfig()`
- **Internal Deps:** `inquirer`, `zod`, `chalk`
- **Usage Patterns:** Used by init command to select and configure database provider.
- **Implementation Details:** Supports Neon, PlanetScale, PostgreSQL, Supabase, Turso. Prompts for provider-specific credentials.
- **External Deps:** `inquirer`, `zod`, `chalk`

### [`packages/cli/src/utils/context-generator.ts`](packages/cli/src/utils/context-generator.ts)
**Purpose:** Generates `.betterbase-context.json` for AI agents.
- **Exports:** `ContextGenerator` - class, `BetterBaseContext` - interface
- **Class Methods:** `generate(projectRoot)` - main method, `generateAIPrompt()` - creates AI-readable prompt
- **Internal Deps:** `./route-scanner`, `./schema-scanner`, `./logger`
- **Usage Patterns:** Called during `bb dev` or `bb generate` to create context file. Used by AI assistants to understand the project structure.
- **Implementation Details:** Scans schema and routes, aggregates metadata, outputs JSON file with tables, routes, and AI-readable prompt. The AI prompt helps contextualize the project for LLM-based development assistance.
- **External Deps:** `typescript`, `zod`, `chalk`
- **Cross-Ref:** [`packages/cli/src/utils/route-scanner.ts`](packages/cli/src/utils/route-scanner.ts), [`packages/cli/src/utils/scanner.ts`](packages/cli/src/utils/scanner.ts)

### [`packages/cli/src/utils/route-scanner.ts`](packages/cli/src/utils/route-scanner.ts)
**Purpose:** Scans Hono routes directory and extracts endpoint metadata.
- **Exports:** `RouteScanner` - class, `RouteInfo` - interface
- **Class Methods:** `scan(routesDir)` - main method, `scanFile()` - parses single file, `findSchemaUsage()` - detects Zod schemas
- **Internal Deps:** `typescript` (TS AST parser)
- **Usage Patterns:** Used by context generator to discover all API endpoints in the project.
- **Implementation Details:** Uses TypeScript compiler API to parse route files. Extracts HTTP method, path, auth requirements, and Zod schemas. Handles Hono's chainable API pattern detection.
- **External Deps:** `typescript`

### [`packages/cli/src/utils/scanner.ts`](packages/cli/src/utils/scanner.ts)
**Purpose:** Scans Drizzle schema files and extracts table metadata.
- **Exports:** `SchemaScanner` - class, `ColumnInfo` - type, `TableInfo` - type, `ColumnInfoSchema`, `TableInfoSchema`, `TablesRecordSchema` - Zod schemas
- **Class Methods:** `scan()` - main method, `parseTable()`, `parseColumn()`, `parseIndexes()`
- **Internal Deps:** `typescript`, `zod`, `./logger`
- **Usage Patterns:** Used by generate command and context generator to understand database schema.
- **Implementation Details:** Parses TypeScript schema files using TypeScript compiler API. Extracts table names, column definitions, relations, indexes. Returns typed metadata for code generation.
- **External Deps:** `typescript`, `zod`

### [`packages/cli/src/utils/schema-scanner.ts`](packages/cli/src/utils/schema-scanner.ts)
**Purpose:** Re-exports from scanner.ts for cleaner imports.
- **Exports:** `SchemaScanner` - class (re-export), `ColumnInfo` - type (re-export), `TableInfo` - type (re-export)
- **Usage Patterns:** Import point for schema scanning functionality.
- **External Deps:** None (re-exports)

### CLI Tests

### [`packages/cli/test/smoke.test.ts`](packages/cli/test/smoke.test.ts)
**Purpose:** Basic CLI tests verifying command registration.
- **Tests:** Program name, init argument, generate crud, auth setup, dev, migrate commands
- **Usage Patterns:** Smoke tests run in CI to verify CLI is functional after changes.

### [`packages/cli/test/scanner.test.ts`](packages/cli/test/scanner.test.ts)
**Purpose:** Tests for SchemaScanner.
- **Tests:** Extracts tables, columns, relations, indexes from Drizzle schema
- **Usage Patterns:** Unit tests for scanner module.

### [`packages/cli/test/context-generator.test.ts`](packages/cli/test/context-generator.test.ts)
**Purpose:** Tests for ContextGenerator.
- **Tests:** Creates context from schema/routes, handles missing routes, empty schema, missing schema
- **Usage Patterns:** Unit tests for context generation.

### [`packages/cli/test/route-scanner.test.ts`](packages/cli/test/route-scanner.test.ts)
**Purpose:** Tests for RouteScanner.
- **Tests:** Extracts Hono routes with auth detection and schema usage
- **Usage Patterns:** Unit tests for route scanning.

---

## packages/client

`@betterbase/client` - TypeScript SDK for BetterBase backends (like `@supabase/supabase-js`).

### Configuration Files

### [`packages/client/package.json`](packages/client/package.json)
**Purpose:** Package manifest for client SDK.
- **Name:** `@betterbase/client`
- **Version:** `0.1.0`
- **Exports:** ESM and CJS with types
- **Keywords:** betterbase, baas, backend, database, realtime
- **Dependencies:** `better-auth@^1.0.0`
- **External Deps:** `better-auth`

### [`packages/client/tsconfig.json`](packages/client/tsconfig.json)
**Purpose:** TypeScript config with DOM lib for browser compatibility.

### [`packages/client/tsconfig.test.json`](packages/client/tsconfig.test.json)
**Purpose:** TypeScript config for test files.

### [`packages/client/README.md`](packages/client/README.md)
**Purpose:** Documentation with installation and usage examples.

### Source Files

### [`packages/client/src/index.ts`](packages/client/src/index.ts)
**Purpose:** Main entry point - exports all public APIs.
- **Exports:** `createClient`, `BetterBaseClient`, `QueryBuilder`, `AuthClient`, `RealtimeClient`, `BetterBaseError`, `NetworkError`, `AuthError`, `ValidationError`, types
- **Usage Patterns:** Primary import point for the SDK.
- **Implementation Details:** Barrel file re-exporting all public types and classes.

### [`packages/client/src/client.ts`](packages/client/src/client.ts)
**Purpose:** Main client class.
- **Exports:** `BetterBaseClient` - class, `createClient(config)` - factory function
- **Class Properties:** `auth` - AuthClient, `realtime` - RealtimeClient, `storage` - StorageClient
- **Class Methods:** `from(table, options)` - creates QueryBuilder
- **Internal Deps:** `./types`, `./query-builder`, `./auth`, `./realtime`, `./storage`, `zod`
- **Usage Patterns:** Created once per application, provides access to auth, database, storage, and realtime features.
- **Implementation Details:** Singleton pattern. Provides `from()` method for query building. Manages auth state, storage operations, and realtime subscriptions.
- **External Deps:** `zod`, `better-auth`

```typescript
// Usage Example:
import { createClient } from "@betterbase/client"

const client = createClient({
  url: "http://localhost:3000",
  key: "public-anon-key",
})

// Query data
const { data } = await client.from("users").select("*").execute()

// Authenticate
await client.auth.signIn.email("user@example.com", "password")

// Upload file
await client.storage.upload("avatars", file, "user-avatar.jpg")
```

### [`packages/client/src/types.ts`](packages/client/src/types.ts)
**Purpose:** Type definitions for client.
- **Exports:** `BetterBaseConfig`, `QueryOptions`, `BetterBaseResponse<T>`, `RealtimeSubscription`, `RealtimeCallback<T>`
- **Internal Deps:** `./errors`
- **Usage Patterns:** Imported for type annotations in user code.
- **External Deps:** None (types only)

### [`packages/client/src/errors.ts`](packages/client/src/errors.ts)
**Purpose:** Error classes for client.
- **Exports:** `BetterBaseError`, `NetworkError`, `AuthError`, `ValidationError` - classes
- **Usage Patterns:** Caught by applications for error handling.
- **Implementation Details:** Custom error classes with cause chain support. AuthError for auth failures, NetworkError for connection issues, ValidationError for input validation errors.

### [`packages/client/src/query-builder.ts`](packages/client/src/query-builder.ts)
**Purpose:** Query builder for type-safe database operations.
- **Exports:** `QueryBuilder<T>` - class, `QueryBuilderOptions` - interface
- **Class Methods:** `select(fields)`, `eq(column, value)`, `in(column, values)`, `limit(count)`, `offset(count)`, `order(column, direction)`, `execute()`, `single(id)`, `insert(data)`, `update(id, data)`, `delete(id)`
- **Internal Deps:** `./types`, `./errors`, `zod`
- **Usage Patterns:** Chain method calls to build queries, call execute() to send request.
- **Implementation Details:** Fluent builder pattern. Generates REST API calls to the backend. Uses Zod for response validation.
- **External Deps:** `zod`

```typescript
// Usage Example:
const { data, error } = await client
  .from("users")
  .select("id", "email", "name")
  .eq("status", "active")
  .order("createdAt", "desc")
  .limit(10)
  .execute()
```

### [`packages/client/src/auth.ts`](packages/client/src/auth.ts)
**Purpose:** Authentication client.
- **Exports:** `AuthClient` - class, `User` - interface, `Session` - interface, `AuthCredentials` - interface
- **Class Methods:** `signUp(credentials)`, `signIn(credentials)`, `signOut()`, `getUser()`, `getToken()`, `setToken(token)`, `signIn.email()`, `signIn.oauth()`
- **Internal Deps:** `./types`, `./errors`, `zod`
- **Usage Patterns:** Handle user authentication flows - signup, signin, signout, session management.
- **Implementation Details:** Delegates to BetterAuth. Manages session cookies/tokens. Provides typed methods for auth operations.
- **External Deps:** `better-auth`, `zod`

### [`packages/client/src/realtime.ts`](packages/client/src/realtime.ts)
**Purpose:** WebSocket realtime client for subscriptions.
- **Exports:** `RealtimeClient` - class
- **Class Methods:** `from(table)` - returns subscription builder, `setToken(token)`, `disconnect()`
- **Internal Deps:** `./types`
- **Usage Patterns:** Subscribe to database changes for real-time updates.
- **Implementation Details:** Manages WebSocket connection to `/ws` endpoint. Supports filtering by table and column values.
- **External Deps:** None (WebSocket native)

### [`packages/client/src/storage.ts`](packages/client/src/storage.ts)
**Purpose:** Storage client for file operations.
- **Exports:** `StorageClient` - class
- **Class Methods:** `upload(bucket, file, name)`, `download(bucket, path)`, `delete(bucket, path)`, `list(bucket, options)`, `getSignedUrl(bucket, path, expires)`
- **Internal Deps:** `./types`, `./errors`
- **Usage Patterns:** Upload, download, delete, and list files in storage buckets.
- **Implementation Details:** Interfaces with storage API for S3-compatible operations.
- **External Deps:** None

### [`packages/client/src/build.ts`](packages/client/src/build.ts)
**Purpose:** Build script for ESM, CJS, and type declarations.
- **Builds:** ESM (browser), CJS (node), `.d.ts` via tsc
- **Usage Patterns:** Called during package build process.
- **Implementation Details:** Uses tsc for type generation, outputs both ESM and CJS formats.

### Client Tests

### [`packages/client/test/client.test.ts`](packages/client/test/client.test.ts)
**Purpose:** Tests for client SDK.
- **Tests:** Creates client, from() creates query builder, execute sends requests with headers

---

## packages/core

Core backend engine package - framework for building BetterBase-compatible backends.

### Configuration Files

### [`packages/core/package.json`](packages/core/package.json)
**Purpose:** Package manifest for core engine.
- **Name:** `@betterbase/core`
- **Version:** `0.1.0`
- **Dependencies:** `hono`, `drizzle-orm`, `zod`
- **External Deps:** `hono`, `drizzle-orm`, `zod`, `@betterbase/shared`

### [`packages/core/README.md`](packages/core/README.md)
**Purpose:** Core engine package documentation.

### [`packages/core/tsconfig.json`](packages/core/tsconfig.json)
**Purpose:** TypeScript config extending base with Bun types.

### Main Entry

### [`packages/core/src/index.ts`](packages/core/src/index.ts)
**Purpose:** Main entry point for core package.
- **Exports:** Re-exports from submodules
- **Usage Patterns:** Main import point for core functionality.
- **Implementation Details:** Barrel file with re-exports from all submodules.

### Config Module

### [`packages/core/src/config/index.ts`](packages/core/src/config/index.ts)
**Purpose:** Configuration module entry point.
- **Exports:** Config loaders and validators
- **Usage Patterns:** Import config schemas and loaders.

### [`packages/core/src/config/schema.ts`](packages/core/src/config/schema.ts)
**Purpose:** Configuration schema validation.
- **Exports:** Configuration types and Zod schemas
- **Usage Patterns:** Validate project configuration files.
- **Implementation Details:** Zod schemas for validating betterbase.config.ts files.

### [`packages/core/src/config/drizzle-generator.ts`](packages/core/src/config/drizzle-generator.ts)
**Purpose:** Drizzle configuration generator.
- **Exports:** `generateDrizzleConfig()`, `DrizzleConfigOptions` - interface
- **Usage Patterns:** Generate Drizzle Kit configuration for different database providers.
- **Implementation Details:** Creates properly configured Drizzle config for SQLite, PostgreSQL, or LibSQL.

### Functions Module

### [`packages/core/src/functions/index.ts`](packages/core/src/functions/index.ts)
**Purpose:** Edge functions module entry point.
- **Exports:** Function deployment utilities
- **Usage Patterns:** Define and deploy edge functions.

### [`packages/core/src/functions/bundler.ts`](packages/core/src/functions/bundler.ts)
**Purpose:** Edge function bundler.
- **Exports:** `BundleFunctionOptions` - interface, `bundleFunction()` - function
- **Key Functions:** `bundle()`, `optimize()`, `treeShake()`
- **Usage Patterns:** Bundle edge functions for deployment.
- **Implementation Details:** Uses esbuild for fast bundling, handles dependencies, optimizes for edge runtime.

### [`packages/core/src/functions/deployer.ts`](packages/core/src/functions/deployer.ts)
**Purpose:** Edge function deployer.
- **Exports:** `DeployFunctionOptions` - interface, `deployFunction()` - function
- **Key Functions:** `deploy()`, `list()`, `delete()`, `getStatus()`
- **Usage Patterns:** Deploy edge functions to the platform.
- **Implementation Details:** Handles function versioning, rolling updates, and rollback capabilities.

### GraphQL Module

### [`packages/core/src/graphql/index.ts`](packages/core/src/graphql/index.ts)
**Purpose:** GraphQL API module entry point.
- **Exports:** GraphQL server and generator utilities
- **Usage Patterns:** Set up GraphQL API endpoint.

### [`packages/core/src/graphql/resolvers.ts`](packages/core/src/graphql/resolvers.ts)
**Purpose:** GraphQL resolver implementations.
- **Exports:** `Resolvers` - resolver map, `QueryResolvers`, `MutationResolvers`
- **Key Functions:** `createQueryResolver()`, `createMutationResolver()`
- **Usage Patterns:** Define GraphQL resolvers for queries and mutations.
- **Implementation Details:** Generates type-safe resolvers from Drizzle schema.

### [`packages/core/src/graphql/schema-generator.ts`](packages/core/src/graphql/schema-generator.ts)
**Purpose:** GraphQL schema generator from database.
- **Exports:** `generateGraphQLSchema()`, `SchemaGeneratorOptions` - interface
- **Key Functions:** `generate()`, `addTypes()`, `addQueries()`, `addMutations()`
- **Usage Patterns:** Generate GraphQL schema from Drizzle ORM schema.
- **Implementation Details:** Introspects Drizzle schema and generates corresponding GraphQL types, queries, and mutations.

### [`packages/core/src/graphql/sdl-exporter.ts`](packages/core/src/graphql/sdl-exporter.ts)
**Purpose:** GraphQL SDL exporter.
- **Exports:** `exportSDL()`, `SdlExporterOptions` - interface
- **Key Functions:** `toSDL()`, `formatSDL()`
- **Usage Patterns:** Export GraphQL schema as SDL (Schema Definition Language).
- **Implementation Details:** Converts GraphQL schema to SDL format for sharing or introspection.

### [`packages/core/src/graphql/server.ts`](packages/core/src/graphql/server.ts)
**Purpose:** GraphQL server implementation.
- **Exports:** `GraphQLServer` - class, `createGraphQLServer()` - factory
- **Key Functions:** `start()`, `stop()`, `execute()`
- **Usage Patterns:** Run GraphQL server as part of the application.
- **Implementation Details:** Integrates with Hono for HTTP handling, supports query caching.

### Middleware Module

### [`packages/core/src/middleware/index.ts`](packages/core/src/middleware/index.ts)
**Purpose:** Middleware module entry point.
- **Usage Patterns:** Register application middleware.

### [`packages/core/src/middleware/rls-session.ts`](packages/core/src/middleware/rls-session.ts)
**Purpose:** RLS session middleware.
- **Exports:** `rlsSessionMiddleware()` - Hono middleware
- **Key Functions:** `attachSession()`, `extractUser()`, `validateSession()`
- **Usage Patterns:** Attach user session context to requests for RLS policy evaluation.
- **Implementation Details:** Parses session from cookies or Authorization header, makes user available in request context.

### Migration Module

### [`packages/core/src/migration/index.ts`](packages/core/src/migration/index.ts)
**Purpose:** Database migration module entry point.
- **Exports:** Migration runner utilities
- **Usage Patterns:** Run database migrations.

### [`packages/core/src/migration/rls-migrator.ts`](packages/core/src/migration/rls-migrator.ts)
**Purpose:** RLS policy migrator.
- **Exports:** `RLSMigrator` - class, `MigrateRLSOptions` - interface
- **Key Functions:** `migrate()`, `plan()`, `apply()`, `rollback()`
- **Usage Patterns:** Migrate RLS policies between schema versions.
- **Implementation Details:** Analyzes policy changes, generates migration SQL, handles rollbacks.

### Providers Module

### [`packages/core/src/providers/index.ts`](packages/core/src/providers/index.ts)
**Purpose:** External providers module entry point.
- **Exports:** Provider factory functions
- **Usage Patterns:** Configure external services (database, email, storage, etc.).

### [`packages/core/src/providers/types.ts`](packages/core/src/providers/types.ts)
**Purpose:** Provider type definitions.
- **Exports:** Provider interfaces and types - `DatabaseProvider`, `ProviderConfig`, `ProviderCredentials`
- **Usage Patterns:** Implement custom providers.
- **External Deps:** `zod`

### [`packages/core/src/providers/neon.ts`](packages/core/src/providers/neon.ts)
**Purpose:** Neon database provider implementation.
- **Exports:** `NeonProvider` - class, `createNeonProvider()` - factory
- **Key Functions:** `connect()`, `disconnect()`, `query()`, `execute()`
- **Usage Patterns:** Connect to Neon serverless PostgreSQL.
- **Implementation Details:** Uses `@neondatabase/serverless` for connection pooling, supports prepared statements.

### [`packages/core/src/providers/planetscale.ts`](packages/core/src/providers/planetscale.ts)
**Purpose:** PlanetScale database provider implementation.
- **Exports:** `PlanetScaleProvider` - class, `createPlanetScaleProvider()` - factory
- **Key Functions:** `connect()`, `disconnect()`, `query()`, `execute()`
- **Usage Patterns:** Connect to PlanetScale serverless MySQL.
- **Implementation Details:** Uses `@planetscale/database` driver, handles branch switching.

### [`packages/core/src/providers/postgres.ts`](packages/core/src/providers/postgres.ts)
**Purpose:** PostgreSQL database provider implementation.
- **Exports:** `PostgresProvider` - class, `createPostgresProvider()` - factory
- **Key Functions:** `connect()`, `disconnect()`, `query()`, `execute()`, `getPool()`
- **Usage Patterns:** Connect to standard PostgreSQL databases.
- **Implementation Details:** Uses `pg` driver with connection pooling, supports SSL.

### [`packages/core/src/providers/supabase.ts`](packages/core/src/providers/supabase.ts)
**Purpose:** Supabase database provider implementation.
- **Exports:** `SupabaseProvider` - class, `createSupabaseProvider()` - factory
- **Key Functions:** `connect()`, `disconnect()`, `query()`, `execute()`, `getPostgres()`
- **Usage Patterns:** Connect to Supabase PostgreSQL.
- **Implementation Details:** Uses Supabase connection pooler, integrates with Supabase auth.

### [`packages/core/src/providers/turso.ts`](packages/core/src/providers/turso.ts)
**Purpose:** Turso database provider implementation.
- **Exports:** `TursoProvider` - class, `createTursoProvider()` - factory
- **Key Functions:** `connect()`, `disconnect()`, `query()`, `execute()`, `getClient()`
- **Usage Patterns:** Connect to Turso LibSQL (local or remote).
- **Implementation Details:** Uses `@libsql/client` for LibSQL support, supports embedded replica.

### RLS Module

### [`packages/core/src/rls/index.ts`](packages/core/src/rls/index.ts)
**Purpose:** Row-Level Security module entry point.
- **Exports:** RLS utilities and classes
- **Usage Patterns:** Define RLS policies.

### [`packages/core/src/rls/types.ts`](packages/core/src/rls/types.ts)
**Purpose:** RLS type definitions.
- **Exports:** `RLSPolicy`, `RLSExpression`, `RLSContext`, `PolicyCondition`
- **Usage Patterns:** Define RLS policy types.

### [`packages/core/src/rls/auth-bridge.ts`](packages/core/src/rls/auth-bridge.ts)
**Purpose:** RLS authentication bridge.
- **Exports:** `AuthBridge` - class
- **Key Functions:** `getCurrentUserId()`, `getUserRoles()`, `getSessionContext()`
- **Usage Patterns:** Bridge authentication context to RLS policy evaluation.
- **Implementation Details:** Extracts user information from session, makes it available for RLS policies.

### [`packages/core/src/rls/generator.ts`](packages/core/src/rls/generator.ts)
**Purpose:** RLS policy generator.
- **Exports:** `RLSGenerator` - class, `generatePolicy()` - function
- **Key Functions:** `generate()`, `toSQL()`, `validate()`
- **Usage Patterns:** Generate RLS policies from high-level definitions.
- **Implementation Details:** Converts policy definitions to PostgreSQL RLS policy statements.

### [`packages/core/src/rls/scanner.ts`](packages/core/src/rls/scanner.ts)
**Purpose:** RLS policy scanner.
- **Exports:** `RLSScanner` - class, `scanPolicies()` - function
- **Key Functions:** `scan()`, `analyze()`, `getPolicyInfo()`
- **Usage Patterns:** Scan existing RLS policies in database.
- **Implementation Details:** Queries PostgreSQL system catalogs to discover existing RLS policies.

### Storage Module

### [`packages/core/src/storage/index.ts`](packages/core/src/storage/index.ts)
**Purpose:** Storage module entry point.
- **Exports:** `StorageManager` - class, `createStorage()` - factory
- **Key Functions:** `upload()`, `download()`, `delete()`, `list()`, `getSignedUrl()`
- **Usage Patterns:** Manage file storage.

### [`packages/core/src/storage/types.ts`](packages/core/src/storage/types.ts)
**Purpose:** Storage type definitions.
- **Exports:** `StorageBucket`, `StorageFile`, `StorageOptions`, `SignedUrlOptions`
- **Usage Patterns:** Define storage types.

### [`packages/core/src/storage/s3-adapter.ts`](packages/core/src/storage/s3-adapter.ts)
**Purpose:** S3-compatible storage adapter.
- **Exports:** `S3StorageAdapter` - class
- **Key Functions:** `put()`, `get()`, `delete()`, `listObjects()`, `getSignedUrl()`, `copyObject()`
- **Usage Patterns:** Use S3-compatible storage (AWS S3, MinIO, DigitalOcean Spaces).
- **Implementation Details:** Implements S3 API for object operations, supports presigned URLs.

### Webhooks Module

### [`packages/core/src/webhooks/index.ts`](packages/core/src/webhooks/index.ts)
**Purpose:** Webhooks module entry point.
- **Exports:** Webhook utilities
- **Usage Patterns:** Define and handle webhooks.

### [`packages/core/src/webhooks/types.ts`](packages/core/src/webhooks/types.ts)
**Purpose:** Webhook type definitions.
- **Exports:** `Webhook`, `WebhookEvent`, `WebhookPayload`, `WebhookConfig`
- **Usage Patterns:** Define webhook types.

### [`packages/core/src/webhooks/dispatcher.ts`](packages/core/src/webhooks/dispatcher.ts)
**Purpose:** Webhook dispatcher.
- **Exports:** `WebhookDispatcher` - class
- **Key Functions:** `dispatch()`, `dispatchAsync()`, `retry()`, `cancel()`
- **Usage Patterns:** Dispatch webhook events to registered endpoints.
- **Implementation Details:** Handles sync/async dispatch, retry logic with exponential backoff.

### [`packages/core/src/webhooks/integrator.ts`](packages/core/src/webhooks/integrator.ts)
**Purpose:** Webhook integrator for third-party services.
- **Exports:** `WebhookIntegrator` - class
- **Key Functions:** `integrate()`, `register()`, `unregister()`
- **Usage Patterns:** Integrate with third-party webhook services.
- **Implementation Details:** Handles service-specific integration patterns.

### [`packages/core/src/webhooks/signer.ts`](packages/core/src/webhooks/signer.ts)
**Purpose:** Webhook request signer.
- **Exports:** `signWebhook()`, `verifyWebhook()`, `WebhookSigner` - class
- **Key Functions:** `sign()`, `verify()`, `getSignature()`
- **Usage Patterns:** Sign webhook requests for security.
- **Implementation Details:** Generates HMAC signatures, supports multiple algorithms.

### [`packages/core/src/webhooks/startup.ts`](packages/core/src/webhooks/startup.ts)
**Purpose:** Webhook startup handler.
- **Exports:** `registerWebhooks()` - function
- **Key Functions:** `initialize()`, `loadWebhooks()`, `validateEndpoints()`
- **Usage Patterns:** Register webhooks at application startup.
- **Implementation Details:** Loads webhook configurations, validates endpoints, sets up event listeners.

---

## packages/shared

Shared utilities and types used across BetterBase packages.

### Configuration Files

### [`packages/shared/package.json`](packages/shared/package.json)
**Purpose:** Package manifest for shared utilities.
- **Name:** `@betterbase/shared`
- **Version:** `0.1.0`
- **Dependencies:** `zod`
- **External Deps:** `zod`

### [`packages/shared/README.md`](packages/shared/README.md)
**Purpose:** Shared utilities package documentation.

### [`packages/shared/tsconfig.json`](packages/shared/tsconfig.json)
**Purpose:** TypeScript config extending base.

### Source Files

### [`packages/shared/src/index.ts`](packages/shared/src/index.ts)
**Purpose:** Main entry point - exports all public APIs.
- **Exports:** Re-exports from submodules
- **Usage Patterns:** Central import for shared types and utilities.

### [`packages/shared/src/constants.ts`](packages/shared/src/constants.ts)
**Purpose:** Shared constants across packages.
- **Exports:** Common constants - `DEFAULT_PORT`, `DEFAULT_DB_PATH`, `API_VERSION`, etc.
- **Usage Patterns:** Reference shared constant values.

### [`packages/shared/src/errors.ts`](packages/shared/src/errors.ts)
**Purpose:** Shared error classes.
- **Exports:** `BetterBaseError`, `ConfigurationError`, `ProviderError` - classes
- **Usage Patterns:** Use consistent error types across packages.

### [`packages/shared/src/types.ts`](packages/shared/src/types.ts)
**Purpose:** Shared type definitions.
- **Exports:** Common TypeScript interfaces and types - `JSONValue`, `Result<T>`, `Nullable<T>`
- **Usage Patterns:** Import shared types for consistency.

### [`packages/shared/src/utils.ts`](packages/shared/src/utils.ts)
**Purpose:** Shared utility functions.
- **Exports:** Common utility functions - `isEmpty()`, `deepClone()`, `sleep()`, `randomId()`
- **Usage Patterns:** Use shared utility functions to avoid duplication.

---

## templates/base

Base starter template for BetterBase projects - Bun + Hono + Drizzle + SQLite.

### Template Files

### [`templates/base/.gitignore`](templates/base/.gitignore)
**Purpose:** Git ignore patterns for template projects.

### [`templates/base/betterbase.config.ts`](templates/base/betterbase.config.ts)
**Purpose:** BetterBase configuration with Zod validation.
- **Exports:** `BetterBaseConfigSchema` - Zod schema, `BetterBaseConfig` - type, `betterbaseConfig` - parsed config
- **Usage Patterns:** Loaded at runtime to configure the application behavior.
- **Implementation Details:** Zod schema validates configuration at startup. Supports database mode, auth settings.
- **External Deps:** `zod`

---

## templates/auth

Auth template with BetterAuth integration - Bun + Hono + BetterAuth.

### Template Files

### [`templates/auth/README.md`](templates/auth/README.md)
**Purpose:** Auth template documentation.

### [`templates/auth/src/auth/index.ts`](templates/auth/src/auth/index.ts)
**Purpose:** Auth module entry point.
- **Exports:** BetterAuth instance
- **Usage Patterns:** Imported by routes and middleware to access BetterAuth instance.
- **Implementation Details:** Creates and exports a singleton BetterAuth client instance.

### [`templates/auth/src/auth/types.ts`](templates/auth/src/auth/types.ts)
**Purpose:** Auth type definitions.
- **Exports:** Auth-related types
- **Usage Patterns:** Import for auth type safety.

### [`templates/auth/src/db/auth-schema.ts`](templates/auth/src/db/auth-schema.ts)
**Purpose:** BetterAuth database schema for SQLite.
- **Exports:** Auth-related table definitions
- **Usage Patterns:** Used when initializing the database with Drizzle ORM to create auth tables.

### [`templates/auth/src/db/index.ts`](templates/auth/src/db/index.ts)
**Purpose:** Database connection with auth schema.
- **Usage Patterns:** Imported by the main entry point to establish database connection.

### [`templates/auth/src/db/schema.ts`](templates/auth/src/db/schema.ts)
**Purpose:** Database schema with user table.
- **Usage Patterns:** Defines custom application tables alongside auth schema.

### [`templates/auth/src/middleware/auth.ts`](templates/auth/src/middleware/auth.ts)
**Purpose:** Authentication middleware for Hono routes.
- **Exports:** `requireAuth`, `optionalAuth` middleware functions
- **Usage Patterns:** Protect routes that require authentication.
- **Implementation Details:** Extracts session from request, validates with BetterAuth, attaches user to context.
- **External Deps:** `better-auth`, `hono`
- **Cross-Ref:** [`packages/cli/src/commands/auth.ts`](packages/cli/src/commands/auth.ts)

### [`templates/auth/src/routes/auth.ts`](templates/auth/src/routes/auth.ts)
**Purpose:** Authentication API routes.
- **Endpoints:** Sign up, sign in, sign out, session management
- **Usage Patterns:** Handles all auth-related HTTP requests.
- **External Deps:** `better-auth`, `hono`

### [`templates/auth/src/routes/auth-example.ts`](templates/auth/src/routes/auth-example.ts)
**Purpose:** Example authenticated route.
- **Usage Patterns:** Demonstrates protected route usage.

---

## Root Config Files

### [`package.json`](package.json)
**Purpose:** Root monorepo package manifest.
- **Name:** `betterbase`
- **Package Manager:** `bun@1.3.9`
- **Workspaces:** `apps/*`, `packages/*`
- **Scripts:** `build`, `dev`, `lint`, `typecheck` (via Turbo)
- **Dev Dependencies:** `turbo@^2.0.0`, `typescript@^5.6.0`
- **External Deps:** `turbo`, `typescript`, `@libsql/client`

### [`turbo.json`](turbo.json)
**Purpose:** Turborepo task configuration.
- **Tasks:** `build` (with deps), `dev` (persistent, no cache), `lint`, `typecheck` (with deps)

### [`tsconfig.base.json`](tsconfig.base.json)
**Purpose:** Shared TypeScript configuration for all packages.
- **Settings:** ES2022 target, ESNext module, Bundler resolution, strict mode, declaration enabled

### [`README.md`](README.md)
**Purpose:** Monorepo documentation with structure, commands, and CLI highlights.

### [`.gitignore`](.gitignore)
**Purpose:** Root git ignore patterns including node_modules, dist, .env, *.sqlite, .betterbase-context.json.

---

## Key Interfaces & Types Index

### Client Types (`packages/client/src/types.ts`)
- `BetterBaseConfig` - Client configuration (url, key, schema, fetch, storage)
- `QueryOptions` - Query options (limit, offset, orderBy)
- `BetterBaseResponse<T>` - API response wrapper (data, error, count, pagination)
- `RealtimeSubscription` - Subscription handle with unsubscribe method
- `RealtimeCallback<T>` - Callback type for realtime events

### Auth Types (`packages/client/src/auth.ts`)
- `User` - User object (id, email, name)
- `Session` - Session object (token, user)
- `AuthCredentials` - Credentials for signup/signin (email, password, name?)

### Storage Types (`packages/client/src/storage.ts`)
- `StorageClient` - File operations client
- `UploadOptions` - File upload configuration

### Provider Types (`packages/core/src/providers/types.ts`)
- `DatabaseProvider` - Base provider interface
- `ProviderConfig` - Configuration for providers
- `ProviderCredentials` - Credentials interface

### RLS Types (`packages/core/src/rls/types.ts`)
- `RLSPolicy` - Row-Level Security policy
- `RLSExpression` - Policy expression
- `RLSContext` - Execution context

### Storage Types (`packages/core/src/storage/types.ts`)
- `StorageBucket` - Bucket definition
- `StorageFile` - File metadata
- `SignedUrlOptions` - URL signing options

### Webhook Types (`packages/core/src/webhooks/types.ts`)
- `Webhook` - Webhook configuration
- `WebhookEvent` - Event data
- `WebhookPayload` - Payload structure

### CLI Types (`packages/cli/src/commands/init.ts`)
- `InitCommandOptions` - Options for init command
- `DatabaseMode` - 'local' | 'neon' | 'turso' | 'postgres' | 'planetscale' | 'supabase'

### Migration Types (`packages/cli/src/commands/migrate.ts`)
- `MigrateCommandOptions` - Options for migrate command
- `MigrationChangeType` - 'create_table' | 'add_column' | 'modify_column' | 'drop_column' | 'drop_table'
- `MigrationChange` - Migration change object

### Scanner Types (`packages/cli/src/utils/scanner.ts`)
- `ColumnInfo` - Column metadata (name, type, nullable, unique, primaryKey, defaultValue, references)
- `TableInfo` - Table metadata (name, columns, relations, indexes)

### Route Scanner Types (`packages/cli/src/utils/route-scanner.ts`)
- `RouteInfo` - Route metadata (method, path, requiresAuth, inputSchema, outputSchema)

### Context Generator Types (`packages/cli/src/utils/context-generator.ts`)
- `BetterBaseContext` - Context file structure (version, generated_at, tables, routes, ai_prompt)

### Shared Types (`packages/shared/src/types.ts`)
- `JSONValue` - JSON serializable type
- `Result<T>` - Result type for error handling
- `Nullable<T>` - Nullable wrapper type

---

## Environment Variables Reference

| Variable | Used In | Description |
|----------|---------|-------------|
| `NODE_ENV` | `templates/base/src/lib/env.ts`, `apps/dashboard/src/lib/betterbase.ts` | Environment mode: 'development', 'test', 'production' |
| `PORT` | `templates/base/src/lib/env.ts` | Server port (default: 3000) |
| `DB_PATH` | `templates/base/src/lib/env.ts`, `packages/cli/src/commands/migrate.ts` | SQLite database file path (default: 'local.db') |
| `DATABASE_URL` | Generated by `bb init` for Neon/Turso/PostgreSQL/PlanetScale/Supabase | Database connection URL for production |
| `TURSO_AUTH_TOKEN` | Generated by `bb init` for Turso | Auth token for Turso database |
| `AUTH_SECRET` | Generated by `bb auth setup` | Secret key for auth sessions |
| `ENABLE_DEV_AUTH` | `templates/base/src/lib/realtime.ts` | Enable dev auth token parser (default: false in production) |
| `NEXT_PUBLIC_BETTERBASE_URL` | `apps/dashboard/src/lib/betterbase.ts` | BetterBase backend URL for dashboard |
| `AWS_ACCESS_KEY_ID` | `packages/core/src/storage/s3-adapter.ts` | S3 storage access key |
| `AWS_SECRET_ACCESS_KEY` | `packages/core/src/storage/s3-adapter.ts` | S3 storage secret key |
| `AWS_REGION` | `packages/core/src/storage/s3-adapter.ts` | S3 storage region |
| `AWS_BUCKET` | `packages/core/src/storage/s3-adapter.ts` | Default S3 bucket name |

---

## CLI Commands Reference

| Command | Description | Handler File |
|---------|-------------|--------------|
| `bb init [project-name]` | Initialize a new BetterBase project | [`packages/cli/src/commands/init.ts`](packages/cli/src/commands/init.ts) |
| `bb dev [project-root]` | Watch schema/routes and regenerate context | [`packages/cli/src/commands/dev.ts`](packages/cli/src/commands/dev.ts) |
| `bb migrate` | Generate and apply migrations | [`packages/cli/src/commands/migrate.ts`](packages/cli/src/commands/migrate.ts) |
| `bb migrate preview` | Preview migration diff without applying | [`packages/cli/src/commands/migrate.ts`](packages/cli/src/commands/migrate.ts) |
| `bb migrate production` | Apply migrations to production | [`packages/cli/src/commands/migrate.ts`](packages/cli/src/commands/migrate.ts) |
| `bb auth setup [project-root]` | Scaffold BetterAuth integration | [`packages/cli/src/commands/auth.ts`](packages/cli/src/commands/auth.ts) |
| `bb generate crud <table-name> [project-root]` | Generate CRUD routes for a table | [`packages/cli/src/commands/generate.ts`](packages/cli/src/commands/generate.ts) |
| `bb function deploy <path>` | Deploy edge function | [`packages/cli/src/commands/function.ts`](packages/cli/src/commands/function.ts) |
| `bb function list` | List deployed functions | [`packages/cli/src/commands/function.ts`](packages/cli/src/commands/function.ts) |
| `bb function delete <name>` | Delete edge function | [`packages/cli/src/commands/function.ts`](packages/cli/src/commands/function.ts) |
| `bb function invoke <name>` | Invoke function for testing | [`packages/cli/src/commands/function.ts`](packages/cli/src/commands/function.ts) |
| `bb graphql generate` | Generate GraphQL schema | [`packages/cli/src/commands/graphql.ts`](packages/cli/src/commands/graphql.ts) |
| `bb graphql sdl` | Export GraphQL SDL | [`packages/cli/src/commands/graphql.ts`](packages/cli/src/commands/graphql.ts) |
| `bb graphql serve` | Start GraphQL server | [`packages/cli/src/commands/graphql.ts`](packages/cli/src/commands/graphql.ts) |
| `bb rls scan` | Scan RLS policies | [`packages/cli/src/commands/rls.ts`](packages/cli/src/commands/rls.ts) |
| `bb rls generate` | Generate RLS policies | [`packages/cli/src/commands/rls.ts`](packages/cli/src/commands/rls.ts) |
| `bb rls apply` | Apply RLS policies | [`packages/cli/src/commands/rls.ts`](packages/cli/src/commands/rls.ts) |
| `bb rls verify` | Verify RLS policies | [`packages/cli/src/commands/rls.ts`](packages/cli/src/commands/rls.ts) |
| `bb storage upload <file> <bucket>` | Upload file to storage | [`packages/cli/src/commands/storage.ts`](packages/cli/src/commands/storage.ts) |
| `bb storage download <path> <bucket>` | Download file from storage | [`packages/cli/src/commands/storage.ts`](packages/cli/src/commands/storage.ts) |
| `bb storage ls [bucket]` | List storage buckets/files | [`packages/cli/src/commands/storage.ts`](packages/cli/src/commands/storage.ts) |
| `bb storage mb <bucket>` | Create storage bucket | [`packages/cli/src/commands/storage.ts`](packages/cli/src/commands/storage.ts) |
| `bb storage rm <path>` | Delete storage file | [`packages/cli/src/commands/storage.ts`](packages/cli/src/commands/storage.ts) |
| `bb webhook create <url>` | Register webhook | [`packages/cli/src/commands/webhook.ts`](packages/cli/src/commands/webhook.ts) |
| `bb webhook ls` | List webhooks | [`packages/cli/src/commands/webhook.ts`](packages/cli/src/commands/webhook.ts) |
| `bb webhook rm <id>` | Delete webhook | [`packages/cli/src/commands/webhook.ts`](packages/cli/src/commands/webhook.ts) |
| `bb webhook test <id>` | Test webhook | [`packages/cli/src/commands/webhook.ts`](packages/cli/src/commands/webhook.ts) |
| `bb webhook retry <id>` | Retry failed webhook | [`packages/cli/src/commands/webhook.ts`](packages/cli/src/commands/webhook.ts) |

---

## Database Providers

BetterBase supports multiple database providers:

| Provider | CLI Option | Package | Use Case |
|----------|------------|---------|----------|
| SQLite (local) | `local` | `bun:sqlite` | Development, small projects |
| Turso | `turso` | `@libsql/client` | Serverless LibSQL |
| Neon | `neon` | `@neondatabase/serverless` | Serverless PostgreSQL |
| PostgreSQL | `postgres` | `pg` | Standard PostgreSQL |
| PlanetScale | `planetscale` | `@planetscale/database` | Serverless MySQL |
| Supabase | `supabase` | `@supabase/postgres-meta` | Supabase managed PostgreSQL |

---

## Key Architectural Decisions

1. **Monorepo Structure:** Turborepo monorepo with clear separation between CLI, client, core, and shared packages
2. **AI Context Generation:** Unique BetterBase feature - `.betterbase-context.json` generated from schema/routes
3. **Realtime:** Built into base template via WebSocket at `/ws` with subscription filtering
4. **Migration Safety:** Visual diffs, destructive change warnings, auto-backup before dangerous operations
5. **Auth:** BetterAuth integration scaffolded via CLI, not built into core
6. **Multi-Provider Support:** Abstraction layer for different database providers (Neon, PlanetScale, PostgreSQL, Supabase, Turso)
7. **Edge Functions:** Support for deploying and managing serverless edge functions
8. **GraphQL:** Built-in GraphQL API generation from database schema
9. **RLS First:** Row-Level Security as a first-class concept with dedicated CLI commands
10. **Storage:** S3-compatible storage abstraction for file management
11. **Webhooks:** Comprehensive webhook system with signing, retry logic, and testing

---

## Test Coverage

- **CLI:** 4 test files covering smoke tests, scanner, context generator, route scanner
- **Client:** 1 test file covering client creation and query execution

---

## Data Flow Diagrams

### CLI Project Initialization Flow
```
User runs: bb init
         │
         ▼
┌─────────────────────────┐
│ packages/cli/src/       │
│ commands/init.ts       │
│ - Prompts for project   │
│   name, database mode   │
│ - Selects provider      │
└─────────┬───────────────┘
          │
          ▼
┌─────────────────────────┐
│ writeProjectFiles()     │
│ - Creates directory    │
│ - Writes package.json   │
│ - Writes config files   │
│ - Writes schema template│
└─────────┬───────────────┘
          │
          ▼
┌─────────────────────────┐
│ installDependencies()   │
│ - Runs bun install     │
│ - Installs hono, drizzle│
│   zod, better-auth     │
└─────────────────────────┘
```

### Client SDK Request Flow
```
User Code
    │
    ▼
createClient(config)
    │
    ▼
BetterBaseClient.from(table)
    │
    ▼
QueryBuilder.select().eq().execute()
    │
    ├──► HTTP Request to backend
    │       │
    │       ▼
    │   Hono Route Handler
    │       │
    │       ▼
    │   Drizzle Query
    │       │
    │       ▼
    │   Database Response
    │
    ▼
Zod Validation
    │
    ▼
Return typed data
```

### Database Provider Flow
```
User selects provider in bb init
    │
    ▼
Provider prompt collects credentials
    │
    ▼
Create provider-specific connection
    │
    ├──► Neon: @neondatabase/serverless
    ├──► Turso: @libsql/client
    ├──► PostgreSQL: pg pool
    ├──► PlanetScale: @planetscale/database
    └──► Supabase: @supabase/postgres-meta
    │
    ▼
Drizzle ORM uses provider
    │
    ▼
Database operations work uniformly
```

---

## Error Handling Patterns

### Client SDK Error Handling
The client SDK uses a hierarchical error system with specific error types:

```typescript
// Network errors - connection issues
throw new NetworkError("Failed to connect", { status: 0 })

// Auth errors - authentication failures
throw new AuthError("Invalid credentials", { status: 401 })

// Validation errors - input validation failures
throw new ValidationError("Invalid email format", { field: "email" })

// Generic errors - other failures
throw new BetterBaseError("Unknown error", { cause })
```

**Pattern:** All errors extend `BetterBaseError` with cause chain support for debugging.

### CLI Error Handling
CLI commands use try-catch with logger for user-friendly error display:

```typescript
try {
  await runInitCommand(options)
} catch (error) {
  logger.error(`Failed to initialize: ${error.message}`)
  process.exit(1)
}
```

### API Error Handling (Hono)
Routes use HTTPException for error propagation:

```typescript
app.post("/users", async (c) => {
  const body = await c.req.json()
  const result = createUserSchema.safeParse(body)
  
  if (!result.success) {
    throw new HTTPException(400, {
      message: result.error.message,
    })
  }
  // ... handle valid request
})
```

---

## Security Considerations

### Authentication
- **Session Management:** BetterAuth handles sessions with secure, httpOnly cookies
- **Token Validation:** Bearer token validation on protected routes
- **Dev Mode:** `ENABLE_DEV_AUTH` allows simplified auth for development

### Row-Level Security (RLS)
- **RLS First:** RLS is a first-class concept with dedicated CLI commands
- **Policy Generation:** Core module generates RLS policies from definitions
- **Policy Scanning:** Can scan and analyze existing policies
- **Pattern:** Every table query should check user permissions

### Input Validation
- **Zod Everywhere:** All inputs validated with Zod schemas
- **Validation Middleware:** `templates/base/src/middleware/validation.ts` provides reusable validation
- **Database:** Parameterized queries via Drizzle ORM prevent SQL injection

### API Security
- **CORS:** Configured in route registration
- **Rate Limiting:** Stub implementation ready for production
- **Type Safety:** TypeScript provides compile-time safety

### Webhook Security
- **Request Signing:** HMAC signatures for webhook payloads
- **Verification:** Built-in signature verification

### Secrets Management
- **Environment Variables:** Secrets loaded via `lib/env.ts`
- **Validation:** Required env vars validated at startup
- **Defaults:** Safe defaults for development, explicit config for production

---

## Performance Notes

### Startup Performance
- **Target:** Sub-100ms startup with `bun:sqlite`
- **Why Bun:** Native performance, no JVM overhead
- **Optimization:** Lazy route loading in development

### Database Performance
- **ORM:** Drizzle generates optimized SQL
- **Connections:** SQLite file-based (local) or connection pooling (PostgreSQL)
- **Providers:** Each provider uses native driver for best performance

### Realtime Performance
- **WebSocket:** Native Bun WebSocket support
- **Filtering:** Client-side filtering with `fast-deep-equal`
- **Subscription Limits:** Configurable max subscriptions per client

### Edge Functions
- **Bundling:** esbuild for fast bundling
- **Optimization:** Tree-shaking and edge runtime optimization

### Build Performance
- **Turborepo:** Caches build artifacts across packages
- **Parallel Execution:** Independent packages build in parallel
- **TypeScript:** Incremental compilation enabled

### Bundle Size
- **CLI:** Bundled as single executable with Bun
- **Client SDK:** ESM + CJS outputs for compatibility
- **Dashboard:** Next.js code splitting automatic

---

*This enhanced CODEBASE_MAP.md includes usage patterns, implementation details, external dependencies, cross-references, and new sections on data flow, error handling, security, and performance.*

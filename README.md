# BetterBase Documentation

> An AI-native Backend-as-a-Service platform built for the modern web. Inspired by Supabase, powered by Bun.

---

## Table of Contents

1. [Introduction](#introduction)
2. [Architecture Overview](#architecture-overview)
3. [Getting Started](#getting-started)
4. [Database Providers](#database-providers)
5. [Core Concepts](#core-concepts)
6. [CLI Reference](#cli-reference)
7. [Client SDK](#client-sdk)
8. [Dashboard](#dashboard)
9. [GraphQL Support](#graphql-support)
10. [Row-Level Security (RLS)](#row-level-security-rls)
11. [Storage](#storage)
12. [Webhooks](#webhooks)
13. [Serverless Functions](#serverless-functions)
14. [Templates](#templates)
15. [API Reference](#api-reference)
16. [Best Practices](#best-practices)
17. [Maintenance \& Troubleshooting](#maintenance--troubleshooting)

---

## Introduction

BetterBase is an AI-native Backend-as-a-Service (BaaS) platform that provides developers with a complete backend solution featuring database management, authentication, realtime subscriptions, serverless API endpoints, GraphQL support, and Row-Level Security—all with sub-100ms startup times using Bun's native drivers.

### Key Features

| Feature | Description |
|---------|-------------|
| **Multi-Provider Database** | Support for Neon, PlanetScale, Postgres, Supabase, and Turso |
| **GraphQL API** | Auto-generated GraphQL schema and resolvers from your database schema |
| **Row-Level Security** | PostgreSQL RLS policies with auth-bridge, generator, and scanner |
| **Storage/S3** | S3-compatible storage with R2, Backblaze B2, and MinIO support |
| **Webhooks** | Event-driven webhooks with dispatcher and integrator |
| **Serverless Functions** | Deploy functions to Cloudflare Workers or Vercel |
| **AI Context Generation** | Automatic `.betterbase-context.json` generation for AI-assisted development |
| **Sub-100ms Startup** | Lightning-fast local development with `bun:sqlite` |
| **Docker-less Dev** | Run everything locally without containerization overhead |
| **TypeScript First** | Full type inference and strict mode throughout |
| **BetterAuth Integration** | Production-ready authentication out of the box |
| **Realtime Subscriptions** | WebSocket-based live data updates |
| **Dashboard** | Built-in admin studio with API Explorer, Auth Manager, Logs Viewer, and Table Editor |

### Tech Stack

- **Runtime**: [Bun](https://bun.sh) — All-in-one JavaScript runtime
- **Framework**: [Hono](https://hono.dev) — Ultrafast web framework
- **ORM**: [Drizzle ORM](https://orm.drizzle.team) — TypeScript-native database toolkit
- **Auth**: [BetterAuth](https://www.better-auth.com/) — Authentication framework
- **Monorepo**: [Turborepo](https://turbo.build/) — Build system for JavaScript/TypeScript
- **Dashboard**: [Next.js 15](https://nextjs.org/) — React framework with App Router

---

## Architecture Overview

BetterBase follows a modular monorepo architecture that separates concerns across specialized packages.

### System Design

```
┌─────────────────────────────────────────────────────────────────────┐
│                          BetterBase Platform                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │   Dashboard  │    │     CLI      │    │    Client SDK        │  │
│  │  (Next.js 15) │    │  (@bb/cli)   │    │  (@betterbase/client)│  │
│  └──────┬───────┘    └──────┬───────┘    └──────────┬───────────┘  │
│         │                   │                       │               │
│         └───────────────────┼───────────────────────┘               │
│                             │                                        │
│                      ┌──────▼───────┐                                │
│                      │   Templates  │                                │
│                      │  (base/auth) │                                │
│                      └──────┬───────┘                                │
│                             │                                        │
│         ┌───────────────────┼───────────────────┐                   │
│         │                   │                   │                    │
│  ┌──────▼───────┐    ┌──────▼───────┐    ┌──────▼───────┐         │
│  │     Core     │    │    Shared    │    │    Client    │         │
│  │   (full)     │    │  (utilities) │    │   (SDK)      │         │
│  └─────────────┘    └──────────────┘    └──────────────┘         │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Hono API Server                          │    │
│  │  ┌─────────┐  ┌─────────┐  ┌──────────┐  ┌─────────────┐   │    │
│  │  │ Routes  │  │ Auth    │  │ Database │  │  Realtime   │   │    │
│  │  │         │  │         │  │  (Multi  │  │  WebSocket  │   │    │
│  │  │ GraphQL │  │ RLS     │  │ Provider)│  │             │   │    │
│  │  └─────────┘  └─────────┘  └──────────┘  └─────────────┘   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                             │                                        │
│         ┌───────────────────┼───────────────────┐                   │
│         │                   │                   │                   │
│  ┌──────▼───────┐    ┌──────▼───────┐    ┌──────▼───────┐          │
│  │    SQLite    │    │  PostgreSQL  │    │   External   │          │
│  │ (bun:sqlite) │    │   (Neon,     │    │   Providers  │          │
│  │              │    │  Supabase,   │    │  (Turso,     │          │
│  │              │    │  Postgres)   │    │   PlanetScale│          │
│  └──────────────┘    └──────────────┘    └──────────────┘          │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   Storage Layer (S3-compatible)              │    │
│  │       ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │    │
│  │       │   S3    │  │   R2    │  │Backblaze│  │  MinIO  │    │    │
│  │       └─────────┘  └─────────┘  └─────────┘  └─────────┘    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   Serverless Functions                        │    │
│  │       ┌─────────────┐           ┌─────────────┐              │    │
│  │       │ Cloudflare  │           │   Vercel    │              │    │
│  │       │  Workers    │           │             │              │    │
│  │       └─────────────┘           └─────────────┘              │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### Package Overview

| Package | Location | Purpose |
|---------|----------|---------|
| `@betterbase/cli` | [`packages/cli`](packages/cli) | Command-line tool for project management |
| `@betterbase/client` | [`packages/client`](packages/client) | TypeScript SDK for frontend integration |
| `@betterbase/core` | [`packages/core`](packages/core) | Core backend engine with GraphQL, RLS, Storage, Webhooks |
| `@betterbase/shared` | [`packages/shared`](packages/shared) | Shared utilities and types |
| Dashboard | [`apps/dashboard`](apps/dashboard) | Next.js 15 admin studio |
| Base Template | [`templates/base`](templates/base) | Bun + Hono + Drizzle starter |
| Auth Template | [`templates/auth`](templates/auth) | Template with BetterAuth |

---

## Getting Started

### Prerequisites

Before using BetterBase, ensure you have the following installed:

- **Bun** ≥ 1.0.0 — [Installation Guide](https://bun.sh/docs/installation)
- **Node.js** ≥ 18.0.0 (for some packages)
- **Git** — Version control

```bash
# Verify Bun installation
bun --version

# Verify Node.js (if needed)
node --version
```

### Quick Start

#### 1. Initialize a New Project

```bash
# Create a new BetterBase project
bunx @betterbase/cli init my-project

# Or use the base template directly
bun create betterbase my-project
```

#### 2. Navigate to Project Directory

```bash
cd my-project
```

#### 3. Install Dependencies

```bash
bun install
```

#### 4. Configure Environment

Create a `.env` file in your project root:

```bash
# Server Configuration
PORT=3000
NODE_ENV=development

# Database (SQLite by default for local dev)
DB_PATH=local.db

# Or use a provider (see Database Providers section)
# DATABASE_URL=postgresql://user:pass@host/db
```

#### 5. Run Development Server

```bash
bun run dev
```

Your server is now running at `http://localhost:3000`.

---

## Database Providers

BetterBase supports multiple database providers, giving you the flexibility to choose the best option for your project. While SQLite (via `bun:sqlite`) is the default for local development, you can connect to managed PostgreSQL services for production.

### Supported Providers

| Provider | Type | RLS Support | Best For |
|----------|------|--------------|----------|
| **SQLite** (default) | Local | ❌ | Local development, prototyping |
| **Neon** | Cloud PostgreSQL | ✅ | Serverless, scale-to-zero |
| **PlanetScale** | MySQL-compatible | ✅ (via proxy) | Serverless MySQL |
| **Postgres** | Standard PostgreSQL | ✅ | Traditional deployments |
| **Supabase** | Cloud PostgreSQL | ✅ | Full BaaS with auth |
| **Turso** | LibSQL (SQLite) | ❌ | Edge deployments |

### Configuration

Configure your database provider in `betterbase.config.ts`:

```typescript
import { defineConfig } from '@betterbase/core';

export default defineConfig({
  database: {
    // SQLite (default)
    type: 'sqlite',
    path: './local.db',
    
    // Or use a provider:
    // type: 'neon',
    // connectionString: process.env.DATABASE_URL,
    //
    // type: 'postgres',
    // connectionString: process.env.DATABASE_URL,
    //
    // type: 'supabase',
    // connectionString: process.env.DATABASE_URL,
    //
    // type: 'turso',
    // url: process.env.TURSO_DATABASE_URL,
    //
    // type: 'planetscale',
    // connectionString: process.env.PLANETSCALE_DATABASE_URL,
  },
});
```

### Using Providers

#### Neon

```bash
# Install Neon driver
bun add @neondatabase/serverless
```

```typescript
import { createNeonProvider } from '@betterbase/core/providers';

const provider = createNeonProvider({
  connectionString: process.env.DATABASE_URL,
});

const db = await provider.connect(config);
```

#### Supabase

```bash
# Install Supabase driver
bun add @supabase/postgrest-js
```

```typescript
import { createSupabaseProvider } from '@betterbase/core/providers';

const provider = createSupabaseProvider({
  connectionString: process.env.DATABASE_URL,
});

// Supports RLS via Supabase's built-in security
const db = await provider.connect(config);
```

#### Turso

```bash
# Install LibSQL driver
bun add @libsql/client
```

```typescript
import { createTursoProvider } from '@betterbase/core/providers';

const provider = createTursoProvider({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const db = await provider.connect(config);
```

### Provider Capabilities

| Feature | SQLite | Neon | Postgres | Supabase | Turso | PlanetScale |
|---------|--------|------|----------|----------|-------|-------------|
| Local Development | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Managed/Cloud | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Row-Level Security | ❌ | ✅ | ✅ | ✅ | ❌ | ✅* |
| Realtime | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Point-in-time Recovery | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |

*PlanetScale supports RLS via their proxy service.

---

## Core Concepts

### Database

BetterBase uses **Drizzle ORM** with support for SQLite (local) and multiple PostgreSQL providers. The schema is defined in [`src/db/schema.ts`](templates/base/src/db/schema.ts).

#### Schema Helpers

The base template provides utility helpers for common patterns:

```typescript
import { timestamps, uuid, softDelete, statusEnum, jsonColumn } from './db/schema';

// Timestamps (created_at, updated_at)
export const posts = sqliteTable('posts', {
  id: uuid(),           // UUID primary key
  title: text('title').notNull(),
  status: statusEnum(), // 'active' | 'inactive' | 'pending'
  metadata: jsonColumn<{ key: string }>('metadata'),
  ...timestamps,        // Auto-managed timestamps
  ...softDelete,        // Soft delete (deleted_at)
});
```

#### Database Operations

```typescript
import { db } from './db';
import { users } from './db/schema';

// Query with Drizzle
const allUsers = await db.select().from(users).where(eq(users.status, 'active'));

// Insert
const [newUser] = await db.insert(users).values({
  id: crypto.randomUUID(),
  email: 'user@example.com',
  name: 'John Doe',
}).returning();

// Update
const [updated] = await db.update(users)
  .set({ name: 'Jane Doe' })
  .where(eq(users.id, userId))
  .returning();
```

### Authentication

BetterBase integrates **BetterAuth** for complete authentication functionality:

- Email/password authentication
- Session management with cookies
- OAuth providers (optional)
- Protected routes middleware

#### Auth Middleware

```typescript
import { requireAuth } from './middleware/auth';

app.get('/protected', requireAuth, async (c) => {
  const user = c.get('user');
  return c.json({ message: `Hello, ${user.name}!` });
});
```

### Realtime

WebSocket-based realtime subscriptions for live data updates:

```typescript
// Subscribe to table changes
const subscription = client.realtime
  .from('posts')
  .on('INSERT', (payload) => {
    console.log('New post:', payload.data);
  })
  .subscribe();
```

### AI Context (`.betterbase-context.json`)

The CLI automatically generates an AI context file that helps AI assistants understand your schema and API routes:

```json
{
  "version": 1,
  "tables": {
    "users": {
      "columns": {
        "id": "text (uuid)",
        "email": "text (unique)",
        "name": "text",
        "status": "text (enum: active, inactive, pending)"
      }
    }
  },
  "routes": {
    "GET /api/users": "List all users",
    "POST /api/users": "Create user"
  }
}
```

---

## CLI Reference

The BetterBase CLI (`bb`) provides comprehensive commands for project management, including database operations, authentication, storage, webhooks, GraphQL, RLS, and serverless functions.

### Global Options

| Option | Description |
|--------|-------------|
| `-v, --version` | Display CLI version |
| `--help` | Show help information |

### Commands

#### `bb init [project-name]`

Initialize a new BetterBase project.

```bash
# Create project in current directory
bb init

# Create project in specified directory
bb init my-project
```

#### `bb dev [project-root]`

Watch schema and route files, regenerating `.betterbase-context.json` on changes.

```bash
# Watch current directory
bb dev

# Watch specific project
bb dev ./my-project
```

**Features:**
- Watches `src/db/schema.ts` for database changes
- Watches `src/routes` for API route changes
- Debounces regeneration (250ms)
- Automatic cleanup on exit

#### `bb migrate`

Generate and apply database migrations.

```bash
# Generate and apply migrations locally
bb migrate

# Preview migration diff without applying
bb migrate preview

# Apply migrations to production
bb migrate production
```

**Migration Features:**
- Automatic backup before destructive changes
- Destructive change detection
- SQL statement parsing
- Rollback on failure

#### `bb auth setup [project-root]`

Install and scaffold BetterAuth integration.

```bash
# Set up auth in current project
bb auth setup

# Set up auth in specific project
bb auth setup ./my-project
```

#### `bb generate crud <table-name> [project-root]`

Generate full CRUD routes for a table.

```bash
# Generate CRUD for 'posts' table
bb generate crud posts

# Generate CRUD in specific project
bb generate crud posts ./my-project
```

**Generated Endpoints:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/{table}` | List all records (paginated) |
| `GET` | `/api/{table}/:id` | Get single record |
| `POST` | `/api/{table}` | Create new record |
| `PATCH` | `/api/{table}/:id` | Update record |
| `DELETE` | `/api/{table}/:id` | Delete record |

---

### `bb function`

Serverless functions management - create, develop, build, list, deploy, and view logs.

```bash
# Create a new function
bb function create my-function

# Run function in development mode
bb function dev my-function

# Build function for deployment
bb function build my-function

# List all functions
bb function list

# Deploy function
bb function deploy my-function --provider cloudflare

# View function logs
bb function logs my-function
```

**Function Features:**
- Bundler for preparing functions for deployment
- Deployer supporting Cloudflare Workers and Vercel
- Local development with hot reload
- Log streaming from deployed functions

---

### `bb graphql`

GraphQL API management - generate schema and access playground.

```bash
# Generate GraphQL schema from database schema
bb graphql generate

# Open GraphQL Playground in browser
bb graphql playground
```

**GraphQL Features:**
- Auto-generates GraphQL schema from Drizzle ORM schema
- Generates resolvers for CRUD operations
- Built-in GraphQL Playground for testing

---

### `bb rls`

Row-Level Security (RLS) management for PostgreSQL databases.

```bash
# Create a new RLS policy for a table
bb rls create users

# List all RLS policy files
bb rls list

# Disable RLS on a table
bb rls disable users

# Scan project for RLS policies
bb rls scan
```

**RLS Features:**
- Policy definition helpers
- SQL generation for policies
- Policy scanner for existing policies
- Auth-bridge for integrating with authentication

---

### `bb storage`

Storage management - initialize storage, list objects, and upload files.

```bash
# Initialize storage with a provider
bb storage init

# List objects in a bucket
bb storage list my-bucket

# Upload a file
bb storage upload my-bucket path/to/file.jpg
```

**Storage Features:**
- S3-compatible storage (S3, R2, Backblaze B2, MinIO)
- Fluent builder API
- Presigned URLs for secure uploads/downloads

---

### `bb webhook`

Webhooks management - create, list, test, and view webhook logs.

```bash
# Create a new webhook
bb webhook create

# List all webhooks
bb webhook list

# Test a webhook
bb webhook test webhook-id

# View webhook delivery logs
bb webhook logs webhook-id

# Enable/disable a webhook
bb webhook toggle webhook-id
```

**Webhook Features:**
- Event-driven webhook dispatcher
- HMAC signature verification
- Retry logic with exponential backoff
- Integration with realtime layer

---

## Client SDK

The `@betterbase/client` package provides a TypeScript SDK for frontend integration.

### Installation

```bash
bun add @betterbase/client
# or
npm install @betterbase/client
```

### Creating a Client

```typescript
import { createClient } from '@betterbase/client';

const client = createClient({
  url: 'http://localhost:3000',
  key: 'your-anon-key', // Optional: for service-level access
});
```

### Configuration Options

```typescript
interface BetterBaseConfig {
  url: string;                    // Your backend URL
  key?: string;                  // Anonymous key for auth
  schema?: string;               // Database schema (optional)
  fetch?: typeof fetch;          // Custom fetch implementation
  storage?: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
  };
}
```

### Query Builder

The query builder provides a chainable API for database operations:

```typescript
// Select with filters
const { data, error } = await client
  .from('users')
  .select('id, name, email')
  .eq('status', 'active')
  .order('createdAt', 'desc')
  .limit(10)
  .execute();

// Get single record
const { data, error } = await client
  .from('users')
  .single(userId);

// Insert record
const { data, error } = await client
  .from('users')
  .insert({
    email: 'new@example.com',
    name: 'New User',
  });

// Update record
const { data, error } = await client
  .from('users')
  .update(userId, { name: 'Updated Name' });

// Delete record
const { data, error } = await client
  .from('users')
  .delete(userId);
```

### Query Builder Methods

| Method | Description |
|--------|-------------|
| `.select(fields)` | Select specific fields (default: `*`) |
| `.eq(column, value)` | Filter by equality |
| `.in(column, values)` | Filter by values in array |
| `.order(column, direction)` | Sort results (`asc` or `desc`) |
| `.limit(count)` | Limit results count |
| `.offset(count)` | Offset results for pagination |
| `.single(id)` | Get single record by ID |
| `.insert(data)` | Insert new record |
| `.update(id, data)` | Update existing record |
| `.delete(id)` | Delete record |

### Authentication

```typescript
// Sign up
const { data, error } = await client.auth.signUp(
  'user@example.com',
  'password123',
  'John Doe'
);

// Sign in
const { data, error } = await client.auth.signIn(
  'user@example.com',
  'password123'
);

// Get current session
const { data, error } = await client.auth.getSession();

// Sign out
const { error } = await client.auth.signOut();
```

### Authentication Methods

| Method | Parameters | Description |
|--------|------------|-------------|
| `.signUp(email, password, name)` | `string, string, string` | Create new account |
| `.signIn(email, password)` | `string, string` | Sign in with credentials |
| `.signOut()` | — | End current session |
| `.getSession()` | — | Get current session |

### Storage

The client also provides a Storage API for file operations:

```typescript
// Upload a file
const { data, error } = await client.storage
  .from('avatars')
  .upload('user123/profile.jpg', fileBuffer, {
    contentType: 'image/jpeg',
  });

// Get public URL
const { data: url } = client.storage
  .from('avatars')
  .getPublicUrl('user123/profile.jpg');

// Download file
const { data, error } = await client.storage
  .from('avatars')
  .download('user123/profile.jpg');
```

---

## Dashboard

BetterBase includes a built-in admin dashboard (Next.js 15) located in [`apps/dashboard`](apps/dashboard). This dashboard provides a web interface for managing your backend.

### Features

The dashboard includes the following modules:

#### API Explorer

Test and explore your API endpoints directly from the browser.

- View all available routes
- Make test requests with custom payloads
- View response data and status codes
- Authentication integration for testing protected routes

#### Auth Manager

Manage users and authentication settings.

- View all registered users
- Manage user sessions
- Configure authentication providers
- View login history and activity

#### Logs Viewer

Monitor application logs in real-time.

- View server logs
- Filter by log level (info, warn, error)
- Search logs by keyword
- Export logs for analysis

#### Table Browser and Editor

Browse and edit your database tables.

- View all tables and their schemas
- Browse table data with pagination
- Add, edit, and delete records
- Filter and search data

### Running the Dashboard

```bash
# From the BetterBase monorepo
cd apps/dashboard
bun run dev
```

The dashboard will be available at `http://localhost:3001`.

---

## GraphQL Support

BetterBase provides comprehensive GraphQL support through the `@betterbase/core/graphql` module. Automatically generate GraphQL schema, resolvers, and a fully functional GraphQL server from your Drizzle ORM schema.

### Installation

The GraphQL module is included in `@betterbase/core`:

```bash
bun add @betterbase/core
```

### Quick Start

```typescript
import { 
  generateGraphQLSchema, 
  generateResolvers,
  createGraphQLServer,
} from '@betterbase/core/graphql';
import { db } from './db';
import { users, posts } from './db/schema';

// Generate GraphQL schema from Drizzle schema
const schema = generateGraphQLSchema({
  tables: [users, posts],
  scalars: {
    DateTime: 'String',
    JSON: 'String',
  },
});

// Generate resolvers
const resolvers = generateResolvers({
  db,
  tables: [users, posts],
});

// Create and start GraphQL server
const server = await createGraphQLServer({
  schema,
  resolvers,
  context: createGraphQLContext,
});

await startGraphQLServer(server, { port: 4000 });
```

### GraphQL API

The GraphQL module exports:

```typescript
// Schema generation
export { 
  generateGraphQLSchema, 
  GraphQLJSON, 
  GraphQLDateTime,
  type GraphQLGenerationConfig 
} from './schema-generator';

// Resolvers
export { 
  generateResolvers, 
  createGraphQLContext, 
  requireAuth,
  type DatabaseConnection, 
  type GraphQLContext, 
  type GraphQLResolver, 
  type Resolvers,
  type ResolverGenerationConfig
} from './resolvers';

// Server
export { 
  createGraphQLServer, 
  startGraphQLServer,
  type GraphQLConfig 
} from './server';

// SDL Exporter
export { 
  exportSDL, 
  exportTypeSDL, 
  saveSDL 
} from './sdl-exporter';
```

### Generated Schema

Given a Drizzle schema like:

```typescript
export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const posts = pgTable('posts', {
  id: uuid('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content'),
  authorId: uuid('author_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
});
```

BetterBase generates:

```graphql
type Query {
  users(limit: Int, offset: Int, orderBy: [UserOrderBy!]): [User!]!
  user(id: ID!): User
  posts(limit: Int, offset: Int, orderBy: [PostOrderBy!]): [Post!]!
  post(id: ID!): Post
}

type Mutation {
  createUser(input: CreateUserInput!): User!
  updateUser(id: ID!, input: UpdateUserInput!): User!
  deleteUser(id: ID!): Boolean!
  createPost(input: CreatePostInput!): Post!
  updatePost(id: ID!, input: UpdatePostInput!): Post!
  deletePost(id: ID!): Boolean!
}

type User {
  id: ID!
  email: String!
  name: String
  createdAt: DateTime!
  posts: [Post!]
}

type Post {
  id: ID!
  title: String!
  content: String
  author: User
  createdAt: DateTime!
}
```

### Using the GraphQL Playground

```bash
# Generate GraphQL schema
bb graphql generate

# Open GraphQL Playground
bb graphql playground
```

---

## Row-Level Security (RLS)

BetterBase provides comprehensive Row-Level Security (RLS) support for PostgreSQL databases through the `@betterbase/core/rls` module. RLS allows you to restrict access to rows based on user authentication.

### Installation

RLS is included in `@betterbase/core`:

```bash
bun add @betterbase/core
```

### Quick Start

```typescript
import { 
  definePolicy, 
  policyToSQL,
  scanPolicies 
} from '@betterbase/core/rls';

// Define a policy
const policy = definePolicy('users', {
  select: "auth.uid() = id",
  update: "auth.uid() = id",
  delete: "auth.uid() = id",
  insert: "auth.uid() = id",
});

// Generate SQL
const sql = policyToSQL(policy);

// Scan project for policies
const { policies, errors } = await scanPolicies('/path/to/project');
```

### RLS Module API

```typescript
// Types
export type {
  PolicyDefinition,
  PolicyConfig,
} from './types'

// Policy helpers
export {
  definePolicy,
  isPolicyDefinition,
  mergePolicies,
} from './types'

// SQL Generation
export {
  policyToSQL,
  dropPolicySQL,
  dropPolicyByName,
  disableRLS,
  hasPolicyConditions,
  policiesToSQL,
  dropPoliciesSQL,
} from './generator'

// Policy Scanner
export {
  scanPolicies,
  parsePolicyFile,
  findPolicyFiles,
} from './scanner'

// Auth Bridge
export {
  createAuthBridge,
  authBridgeMiddleware,
} from './auth-bridge'
```

### Auth Bridge

The auth-bridge integrates RLS with BetterAuth:

```typescript
import { authBridgeMiddleware } from '@betterbase/core/rls/auth-bridge';

app.use('/api/*', authBridgeMiddleware);
```

### Using the CLI

```bash
# Create a new RLS policy for a table
bb rls create users

# List all RLS policies
bb rls list

# Disable RLS on a table
bb rls disable users

# Scan for RLS policies
bb rls scan
```

### Example Policy

```typescript
// src/db/policies/users.policy.ts
import { definePolicy } from '@betterbase/core/rls';

export const usersPolicy = definePolicy('users', {
  // Users can only see their own profile
  select: 'auth.uid() = id',
  
  // Users can only update their own profile
  update: 'auth.uid() = id',
  
  // Users can only delete their own account
  delete: 'auth.uid() = id',
  
  // Anyone can create a new user (registration)
  insert: 'true',
});
```

---

## Storage

BetterBase provides S3-compatible storage through the `@betterbase/core/storage` module. Upload, download, and manage files with a Supabase-compatible API.

### Installation

Storage is included in `@betterbase/core`:

```bash
bun add @betterbase/core
```

### Supported Providers

| Provider | Description |
|----------|-------------|
| **S3** | Amazon S3 |
| **R2** | Cloudflare R2 |
| **Backblaze B2** | Backblaze B2 |
| **MinIO** | Self-hosted MinIO |

### Quick Start

```typescript
import { createStorage, createS3Adapter } from '@betterbase/core/storage';

// Configure storage
const config = {
  provider: 'r2',
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  bucket: 'my-bucket',
  endpoint: process.env.R2_ENDPOINT,
};

// Create storage instance
const storage = createStorage(config);

// Get a bucket client
const avatars = storage.from('avatars');

// Upload a file
const { data, error } = await avatars.upload('user123/profile.jpg', fileBuffer, {
  contentType: 'image/jpeg',
});

// Get public URL
const { data: url } = avatars.getPublicUrl('user123/profile.jpg');

// Download a file
const { data: file, error } = await avatars.download('user123/profile.jpg');

// Delete a file
const { error } = await avatars.delete('user123/profile.jpg');
```

### Storage API

```typescript
// Configuration
export type {
  StorageAdapter,
  StorageConfig,
  StorageProvider,
  UploadOptions,
  SignedUrlOptions,
  UploadResult,
  StorageObject,
} from './types';

// S3 Adapter
export { createS3Adapter } from './s3-adapter';

// Bucket client interface
export interface BucketClient {
  upload(
    path: string,
    body: Buffer | ReadableStream,
    options?: UploadOptions
  ): Promise<{ data: UploadResult | null; error: Error | null }>;
  
  download(path: string): Promise<{ data: Buffer | null; error: Error | null }>;
  
  delete(path: string): Promise<{ data: boolean | null; error: Error | null }>;
  
  list(prefix?: string): Promise<{ data: StorageObject[] | null; error: Error | null }>;
  
  getPublicUrl(path: string): { data: string | null; error: null };
  
  createSignedUrl(path: string, expiresIn: number): Promise<{ data: string | null; error: Error | null }>;
}
```

### Using the CLI

```bash
# Initialize storage
bb storage init

# List objects in a bucket
bb storage list my-bucket

# Upload a file
bb storage upload my-bucket path/to/file.jpg
```

### Signed URLs

Generate temporary signed URLs for secure file access:

```typescript
const { data: signedUrl } = await avatars.createSignedUrl(
  'private/document.pdf',
  3600 // expires in 1 hour
);
```

---

## Webhooks

BetterBase provides webhook functionality through the `@betterbase/core/webhooks` module. Send HTTP POST requests when database events occur.

### Installation

Webhooks are included in `@betterbase/core`:

```bash
bun add @betterbase/core
```

### Quick Start

```typescript
import { WebhookDispatcher, signPayload, initializeWebhooks } from '@betterbase/core/webhooks';

// Create webhook dispatcher
const dispatcher = new WebhookDispatcher({
  secret: process.env.WEBHOOK_SECRET,
  retryConfig: {
    retries: 3,
    retryDelay: 1000,
  },
});

// Initialize webhooks from config
await initializeWebhooks(app, config);

// Manually trigger a webhook
await dispatcher.dispatch({
  event: 'INSERT',
  table: 'users',
  record: { id: '123', email: 'user@example.com' },
  timestamp: new Date().toISOString(),
});
```

### Webhook API

```typescript
// Types
export type { WebhookConfig, WebhookPayload } from './types'
export type { WebhookDeliveryLog } from './dispatcher'

// HMAC signing utilities
export { signPayload, verifySignature } from './signer'

// Webhook dispatcher
export { WebhookDispatcher } from './dispatcher'

// Integration with realtime layer
export { connectToRealtime } from './integrator'

// Startup initialization
export { initializeWebhooks } from './startup'
```

### Configuration

Define webhooks in your `betterbase.config.ts`:

```typescript
export default defineConfig({
  webhooks: [
    {
      id: 'user-created',
      table: 'users',
      events: ['INSERT'],
      url: 'https://example.com/webhooks/user-created',
      secret: process.env.WEBHOOK_SECRET,
      enabled: true,
    },
    {
      id: 'order-updated',
      table: 'orders',
      events: ['UPDATE', 'DELETE'],
      url: 'https://example.com/webhooks/order-updated',
      secret: process.env.WEBHOOK_SECRET,
      enabled: true,
    },
  ],
});
```

### Webhook Payload

```json
{
  "event": "INSERT",
  "table": "users",
  "record": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "name": "John Doe",
    "created_at": "2024-01-15T10:30:00Z"
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "transactionId": "tx-123456"
}
```

### Verifying Signatures

```typescript
import { verifySignature } from '@betterbase/core/webhooks';

// In your webhook endpoint
app.post('/webhooks/user-created', async (c) => {
  const signature = c.req.header('x-betterbase-signature');
  const payload = await c.req.text();
  
  const isValid = verifySignature(payload, signature, process.env.WEBHOOK_SECRET);
  
  if (!isValid) {
    return c.json({ error: 'Invalid signature' }, 401);
  }
  
  const data = JSON.parse(payload);
  // Process webhook...
});
```

### Using the CLI

```bash
# Create a new webhook
bb webhook create

# List all webhooks
bb webhook list

# Test a webhook
bb webhook test webhook-id

# View webhook logs
bb webhook logs webhook-id

# Toggle webhook
bb webhook toggle webhook-id
```

---

## Serverless Functions

BetterBase supports serverless functions that can be deployed to Cloudflare Workers or Vercel. The function module is in `@betterbase/core/functions`.

### Installation

Functions are included in `@betterbase/core`:

```bash
bun add @betterbase/core
```

### Quick Start

```typescript
import { 
  bundleFunction, 
  deployToCloudflare, 
  deployToVercel,
  readFunctionConfig 
} from '@betterbase/core/functions';

// Function configuration
const config: FunctionConfig = {
  name: 'my-function',
  entry: './src/functions/my-function.ts',
  output: './dist/functions/my-function',
  handler: 'index.handler',
  runtime: 'bun',
};
```

### Function API

```typescript
// Bundler
export {
  bundleFunction,
  readFunctionConfig,
  listFunctions,
  isFunctionBuilt,
  type FunctionConfig,
  type FunctionInfo,
} from './bundler';

// Deployer
export {
  deployToCloudflare,
  deployToVercel,
  syncEnvToCloudflare,
  getCloudflareLogs,
  getVercelLogs,
} from './deployer';
```

### Using the CLI

```bash
# Create a new function
bb function create my-function

# Run function in development mode
bb function dev my-function

# Build function
bb function build my-function

# List all functions
bb function list

# Deploy to Cloudflare Workers
bb function deploy my-function --provider cloudflare

# Deploy to Vercel
bb function deploy my-function --provider vercel

# View function logs
bb function logs my-function
```

### Function Structure

```typescript
// src/functions/hello.ts
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    return new Response(JSON.stringify({
      message: 'Hello from BetterBase!',
      path: url.pathname,
      method: request.method,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
```

---

## Templates

BetterBase provides project templates to help you get started quickly.

### Base Template

The base template includes:

- Bun + Hono + Drizzle setup
- Basic database schema
- Environment configuration
- TypeScript configuration

```bash
bun create betterbase my-project
```

### Auth Template

The auth template includes everything in the base template plus:

- BetterAuth integration
- Authentication routes
- Protected middleware
- User schema

```bash
# After creating a base project
cd my-project
bb auth setup
```

---

## API Reference

### Core Configuration

```typescript
import { defineConfig } from '@betterbase/core';

export default defineConfig({
  // Database configuration
  database: {
    type: 'sqlite',
    path: './local.db',
  },
  
  // Auth configuration
  auth: {
    providers: ['email'],
    sessionExpiry: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
  
  // Storage configuration
  storage: {
    provider: 'r2',
    bucket: 'my-bucket',
  },
  
  // Webhooks
  webhooks: [
    {
      id: 'user-created',
      table: 'users',
      events: ['INSERT'],
      url: 'https://example.com/webhook',
      secret: process.env.WEBHOOK_SECRET,
    },
  ],
  
  // Serverless functions
  functions: {
    output: './dist/functions',
  },
});
```

### Client SDK

See [Client SDK](#client-sdk) section for the full API reference.

### GraphQL

See [GraphQL Support](#graphql-support) section for the full API reference.

### RLS

See [Row-Level Security (RLS)](#row-level-security-rls) section for the full API reference.

### Storage

See [Storage](#storage) section for the full API reference.

### Webhooks

See [Webhooks](#webhooks) section for the full API reference.

---

## Best Practices

### Database

- Use UUIDs for primary keys in production
- Add indexes on frequently queried columns
- Use soft deletes for critical data
- Configure RLS policies for all tables in production

### Authentication

- Use strong session secrets
- Implement rate limiting on auth endpoints
- Enable OAuth providers for better security
- Store tokens securely (httpOnly cookies)

### API Design

- Use consistent naming conventions
- Implement proper error handling
- Add rate limiting to public endpoints
- Document your API with OpenAPI or GraphQL

### Security

- Never commit secrets to version control
- Use environment variables for configuration
- Enable RLS in production
- Validate all user input
- Use HTTPS in production

### Performance

- Use pagination for large datasets
- Implement caching where appropriate
- Use connection pooling for databases
- Optimize database queries with proper indexes

---

## Maintenance & Troubleshooting

### Common Issues

#### Database Connection Issues

```bash
# Verify database URL is set correctly
echo $DATABASE_URL

# Test database connection
bb migrate preview
```

#### Authentication Issues

```bash
# Regenerate auth secret
openssl rand -base64 32

# Update .env file
AUTH_SECRET=your-new-secret
```

#### Build Issues

```bash
# Clean and rebuild
bun run clean
bun run build
```

### Debugging

Enable debug mode:

```bash
DEBUG=* bun run dev
```

### Getting Help

- GitHub Issues: https://github.com/betterbase/betterbase/issues
- Documentation: https://betterbase.dev/docs
- Discord: https://discord.gg/betterbase

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

Built with ❤️ by the BetterBase Team
